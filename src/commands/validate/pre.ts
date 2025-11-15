import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { SSMConfigLoader } from '../../loaders/config-loader.js';
import { userAuthSchema, userAuthMetadata } from '../../schemas/service-schemas/user-auth.schema.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { handleError } from '../../utils/error.js';
import { CommandTimer, isTimingEnabled } from '../../utils/timer.js';

export const preCommand = new Command('pre')
  .description('部署前验证配置完整性')
  .argument('<service>', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const timer = new CommandTimer();
      const env: Environment = options.env || getCurrentEnvironment();

      if (!isJsonOutput()) {
        printTitle(`✓ 部署前验证 - ${service} (${env})`);
      }

      // 目前只支持 user-auth
      if (service !== 'user-auth') {
        throw new Error(`服务 ${service} 的 schema 暂未实现。当前仅支持: user-auth`);
      }

      // 加载配置
      if (!isJsonOutput()) {
        console.log(chalk.white('正在从 AWS SSM 加载配置...'));
      }

      const loader = new SSMConfigLoader(service, env);
      const loadResult = await loader.load();
      timer.step('加载配置');

      if (loadResult.errors && loadResult.errors.length > 0) {
        throw new Error(`加载配置失败: ${loadResult.errors.join(', ')}`);
      }

      // 验证配置
      if (!isJsonOutput()) {
        console.log(chalk.white('正在验证配置...\n'));
      }

      const validationResult = userAuthSchema.safeParse(loadResult.config);
      timer.step('验证配置');

      // 分析结果
      const issues: Array<{
        field: string;
        issue: string;
        severity: 'error' | 'warning';
      }> = [];

      const loadedKeys = Object.keys(loadResult.config);
      const requiredKeys = userAuthMetadata.required;

      // 检查缺失的必需参数
      for (const required of requiredKeys) {
        if (!loadedKeys.includes(required)) {
          issues.push({
            field: required,
            issue: '缺失必需参数',
            severity: 'error',
          });
        }
      }

      // 检查 Zod 验证错误
      if (!validationResult.success) {
        for (const issue of validationResult.error.issues) {
          issues.push({
            field: issue.path.join('.') || 'unknown',
            issue: issue.message,
            severity: 'error',
          });
        }
      }

      // 检查环境特定规则
      const envRules = userAuthMetadata.environmentRules[env as 'production' | 'stage'];
      if (envRules) {
        for (const [key, rule] of Object.entries(envRules)) {
          const value = loadResult.config[key];
          if (value && !rule(value)) {
            issues.push({
              field: key,
              issue: `不符合 ${env} 环境规范`,
              severity: 'warning',
            });
          }
        }
      }

      // 输出结果
      const errors = issues.filter(i => i.severity === 'error');
      const warnings = issues.filter(i => i.severity === 'warning');
      const passed = errors.length === 0;

      if (isJsonOutput()) {
        outputSuccess({
          service,
          environment: env,
          passed,
          summary: {
            total_params: loadedKeys.length,
            required_params: requiredKeys.length,
            errors: errors.length,
            warnings: warnings.length,
          },
          issues,
          loaded_config: Object.keys(loadResult.config),
          _timing: isTimingEnabled() ? timer.getTimingData() : undefined,
        });
      } else {
        // 显示汇总
        console.log(chalk.cyan('验证结果:\n'));
        const summaryTable = createTable({
          colWidths: [25, 30],
        });
        summaryTable.push(
          ['服务', service],
          ['环境', env],
          ['配置源', 'AWS SSM Parameter Store'],
          ['加载参数数', `${loadedKeys.length} 个`],
          ['必需参数数', `${requiredKeys.length} 个`],
          ['错误', errors.length > 0 ? chalk.red(errors.length.toString()) : chalk.green('0')],
          ['警告', warnings.length > 0 ? chalk.yellow(warnings.length.toString()) : chalk.green('0')],
          ['状态', passed ? chalk.green('✓ 通过') : chalk.red('✗ 失败')],
        );
        console.log(summaryTable.toString());

        // 显示问题详情
        if (issues.length > 0) {
          console.log(chalk.cyan('\n问题详情:\n'));
          const issuesTable = createTable({
            head: ['字段', '问题', '严重程度'],
          });

          for (const issue of issues) {
            issuesTable.push([
              issue.field,
              issue.issue,
              issue.severity === 'error' ? chalk.red('错误') : chalk.yellow('警告'),
            ]);
          }

          console.log(issuesTable.toString());
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
    } catch (error) {
      handleError(error);
    }
  });
