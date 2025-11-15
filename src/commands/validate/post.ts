import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { SSMConfigLoader, ContainerConfigLoader } from '../../loaders/config-loader.js';
import { userAuthSchema, userAuthMetadata } from '../../schemas/service-schemas/user-auth.schema.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { handleError } from '../../utils/error.js';
import { CommandTimer, isTimingEnabled } from '../../utils/timer.js';
import { maskSensitive } from '../../utils/output.js';

export const postCommand = new Command('post')
  .description('部署后验证容器实际环境变量')
  .argument('<service>', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--show-values', '显示参数值（默认脱敏）')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const timer = new CommandTimer();
      const env: Environment = options.env || getCurrentEnvironment();

      if (!isJsonOutput()) {
        printTitle(`✓ 部署后验证 - ${service} (${env})`);
      }

      // 目前只支持 user-auth
      if (service !== 'user-auth') {
        throw new Error(`服务 ${service} 的 schema 暂未实现。当前仅支持: user-auth`);
      }

      // 建立 SSH 连接
      const ssh = new SSHClient(env);
      await ssh.connect();
      timer.step('SSH 连接');

      try {
        // 1. 加载期望配置（从 SSM）
        if (!isJsonOutput()) {
          console.log(chalk.white('正在加载期望配置（SSM）...'));
        }

        const ssmLoader = new SSMConfigLoader(service, env);
        const expectedConfig = await ssmLoader.load();
        timer.step('加载期望配置');

        if (expectedConfig.errors && expectedConfig.errors.length > 0) {
          throw new Error(`加载期望配置失败: ${expectedConfig.errors.join(', ')}`);
        }

        // 2. 加载实际配置（从容器）
        if (!isJsonOutput()) {
          console.log(chalk.white('正在读取容器实际环境变量...\n'));
        }

        const containerLoader = new ContainerConfigLoader(service, env, ssh);
        const actualConfig = await containerLoader.load();
        timer.step('读取容器配置');

        if (actualConfig.errors && actualConfig.errors.length > 0) {
          throw new Error(`读取容器配置失败: ${actualConfig.errors.join(', ')}`);
        }

        // 3. 对比差异
        const differences: Array<{
          field: string;
          expected: string;
          actual: string;
          status: 'missing' | 'different' | 'extra';
        }> = [];

        const expectedKeys = Object.keys(expectedConfig.config);
        const actualKeys = Object.keys(actualConfig.config);

        // 检查缺失和不同的参数
        for (const key of expectedKeys) {
          if (!actualKeys.includes(key)) {
            differences.push({
              field: key,
              expected: expectedConfig.config[key],
              actual: '(缺失)',
              status: 'missing',
            });
          } else if (expectedConfig.config[key] !== actualConfig.config[key]) {
            differences.push({
              field: key,
              expected: expectedConfig.config[key],
              actual: actualConfig.config[key],
              status: 'different',
            });
          }
        }

        // 检查额外的参数（容器中有但 SSM 中没有）
        for (const key of actualKeys) {
          if (!expectedKeys.includes(key) && userAuthMetadata.required.includes(key)) {
            differences.push({
              field: key,
              expected: '(未配置)',
              actual: actualConfig.config[key],
              status: 'extra',
            });
          }
        }

        // 输出结果
        const passed = differences.filter(d => d.status !== 'extra').length === 0;

        if (isJsonOutput()) {
          const output = {
            service,
            environment: env,
            passed,
            summary: {
              expected_params: expectedKeys.length,
              actual_params: actualKeys.length,
              differences: differences.length,
              missing: differences.filter(d => d.status === 'missing').length,
              different: differences.filter(d => d.status === 'different').length,
              extra: differences.filter(d => d.status === 'extra').length,
            },
            differences: options.showValues
              ? differences
              : differences.map(d => ({
                  ...d,
                  expected: userAuthMetadata.sensitive.includes(d.field) ? '***' : d.expected,
                  actual: userAuthMetadata.sensitive.includes(d.field) ? '***' : d.actual,
                })),
            _timing: isTimingEnabled() ? timer.getTimingData() : undefined,
          };
          outputSuccess(output);
        } else {
          // 显示汇总
          console.log(chalk.cyan('验证结果:\n'));
          const summaryTable = createTable({
            colWidths: [25, 30],
          });
          summaryTable.push(
            ['服务', service],
            ['环境', env],
            ['期望参数数', `${expectedKeys.length} 个`],
            ['实际参数数', `${actualKeys.length} 个`],
            ['差异数', differences.length > 0 ? chalk.yellow(differences.length.toString()) : chalk.green('0')],
            ['缺失参数', differences.filter(d => d.status === 'missing').length.toString()],
            ['值不同', differences.filter(d => d.status === 'different').length.toString()],
            ['额外参数', differences.filter(d => d.status === 'extra').length.toString()],
            ['状态', passed ? chalk.green('✓ 通过') : chalk.yellow('⚠ 有差异')],
          );
          console.log(summaryTable.toString());

          // 显示差异详情
          if (differences.length > 0) {
            console.log(chalk.cyan('\n差异详情:\n'));
            const diffTable = createTable({
              head: ['字段', '期望值', '实际值', '状态'],
            });

            for (const diff of differences) {
              const isSensitive = userAuthMetadata.sensitive.includes(diff.field);
              const expectedDisplay = options.showValues || !isSensitive
                ? diff.expected
                : '***';
              const actualDisplay = options.showValues || !isSensitive
                ? diff.actual
                : '***';

              const statusDisplay =
                diff.status === 'missing'
                  ? chalk.red('缺失')
                  : diff.status === 'different'
                  ? chalk.yellow('不同')
                  : chalk.blue('额外');

              diffTable.push([
                diff.field,
                expectedDisplay,
                actualDisplay,
                statusDisplay,
              ]);
            }

            console.log(diffTable.toString());

            if (!options.showValues) {
              console.log();
              console.log(chalk.gray('💡 提示: 使用 --show-values 显示敏感参数的实际值'));
            }
          }

          // 显示计时
          if (isTimingEnabled()) {
            timer.printSummary();
          }

          console.log();

          // 退出码
          if (!passed) {
            process.exit(1);
          }
        }
      } finally {
        await ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
