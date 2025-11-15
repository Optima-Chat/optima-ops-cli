import { Command } from 'commander';
import chalk from 'chalk';
import { SSMConfigLoader } from '../../loaders/config-loader.js';
import { userAuthMetadata } from '../../schemas/service-schemas/user-auth.schema.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { handleError } from '../../utils/error.js';
import { CommandTimer, isTimingEnabled } from '../../utils/timer.js';

export const diffCommand = new Command('diff')
  .description('对比两个环境的配置差异')
  .argument('<service>', '服务名称')
  .requiredOption('--from-env <env>', '源环境 (production/stage/development)')
  .requiredOption('--to-env <env>', '目标环境 (production/stage/development)')
  .option('--show-values', '显示参数值（默认脱敏）')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const timer = new CommandTimer();
      const fromEnv = options.fromEnv;
      const toEnv = options.toEnv;

      if (fromEnv === toEnv) {
        throw new Error('源环境和目标环境不能相同');
      }

      if (!isJsonOutput()) {
        printTitle(`🔍 配置差异对比 - ${service}`);
        console.log(chalk.gray(`对比: ${fromEnv} → ${toEnv}\n`));
      }

      // 目前只支持 user-auth
      if (service !== 'user-auth') {
        throw new Error(`服务 ${service} 的 schema 暂未实现。当前仅支持: user-auth`);
      }

      // 加载两个环境的配置
      if (!isJsonOutput()) {
        console.log(chalk.white(`正在加载 ${fromEnv} 环境配置...`));
      }

      const fromLoader = new SSMConfigLoader(service, fromEnv);
      const fromConfig = await fromLoader.load();
      timer.step(`加载 ${fromEnv} 配置`);

      if (fromConfig.errors && fromConfig.errors.length > 0) {
        throw new Error(`加载 ${fromEnv} 配置失败: ${fromConfig.errors.join(', ')}`);
      }

      if (!isJsonOutput()) {
        console.log(chalk.white(`正在加载 ${toEnv} 环境配置...\n`));
      }

      const toLoader = new SSMConfigLoader(service, toEnv);
      const toConfig = await toLoader.load();
      timer.step(`加载 ${toEnv} 配置`);

      if (toConfig.errors && toConfig.errors.length > 0) {
        throw new Error(`加载 ${toEnv} 配置失败: ${toConfig.errors.join(', ')}`);
      }

      // 分析差异
      const differences: Array<{
        field: string;
        from_value: string;
        to_value: string;
        status: 'missing_in_to' | 'missing_in_from' | 'different' | 'same';
        should_be_same: boolean;
      }> = [];

      const fromKeys = Object.keys(fromConfig.config);
      const toKeys = Object.keys(toConfig.config);
      const allKeys = Array.from(new Set([...fromKeys, ...toKeys]));

      // 环境特定参数（应该不同）
      const envSpecificParams = [
        'DATABASE_URL',
        'REDIS_URL',
        'OAUTH_ISSUER',
        'DEVICE_VERIFICATION_URI',
        'NEXT_PUBLIC_API_URL',
        'BACKEND_CORS_ORIGINS',
        'NODE_ENV',
      ];

      for (const key of allKeys) {
        const fromValue = fromConfig.config[key];
        const toValue = toConfig.config[key];
        const shouldBeSame = !envSpecificParams.includes(key);

        if (!fromValue && toValue) {
          differences.push({
            field: key,
            from_value: '(缺失)',
            to_value: toValue,
            status: 'missing_in_from',
            should_be_same: shouldBeSame,
          });
        } else if (fromValue && !toValue) {
          differences.push({
            field: key,
            from_value: fromValue,
            to_value: '(缺失)',
            status: 'missing_in_to',
            should_be_same: shouldBeSame,
          });
        } else if (fromValue !== toValue) {
          differences.push({
            field: key,
            from_value: fromValue,
            to_value: toValue,
            status: 'different',
            should_be_same: shouldBeSame,
          });
        }
      }

      // 区分问题和正常差异
      const issues = differences.filter(
        d => (d.should_be_same && d.status === 'different') || d.status.includes('missing')
      );
      const normalDiffs = differences.filter(
        d => !d.should_be_same && d.status === 'different'
      );

      if (isJsonOutput()) {
        const output = {
          service,
          from_env: fromEnv,
          to_env: toEnv,
          summary: {
            total_params: allKeys.length,
            issues: issues.length,
            normal_differences: normalDiffs.length,
          },
          issues: options.showValues
            ? issues
            : issues.map(d => ({
                ...d,
                from_value: userAuthMetadata.sensitive.includes(d.field) ? '***' : d.from_value,
                to_value: userAuthMetadata.sensitive.includes(d.field) ? '***' : d.to_value,
              })),
          normal_differences: normalDiffs,
          _timing: isTimingEnabled() ? timer.getTimingData() : undefined,
        };
        outputSuccess(output);
      } else {
        // 显示汇总
        console.log(chalk.cyan('对比结果:\n'));
        const summaryTable = createTable({
          colWidths: [25, 30],
        });
        summaryTable.push(
          ['服务', service],
          ['源环境', fromEnv],
          ['目标环境', toEnv],
          ['总参数数', `${allKeys.length} 个`],
          ['问题', issues.length > 0 ? chalk.red(issues.length.toString()) : chalk.green('0')],
          ['正常差异', normalDiffs.length > 0 ? chalk.yellow(normalDiffs.length.toString()) : chalk.green('0')],
        );
        console.log(summaryTable.toString());

        // 显示问题
        if (issues.length > 0) {
          console.log(chalk.red('\n⚠️  发现问题:\n'));
          const issuesTable = createTable({
            head: ['字段', fromEnv, toEnv, '状态'],
          });

          for (const issue of issues) {
            const isSensitive = userAuthMetadata.sensitive.includes(issue.field);
            const fromDisplay = options.showValues || !isSensitive ? issue.from_value : '***';
            const toDisplay = options.showValues || !isSensitive ? issue.to_value : '***';

            const statusDisplay =
              issue.status === 'missing_in_to'
                ? chalk.red('目标缺失')
                : issue.status === 'missing_in_from'
                ? chalk.red('源缺失')
                : chalk.yellow('应该相同但不同');

            issuesTable.push([issue.field, fromDisplay, toDisplay, statusDisplay]);
          }

          console.log(issuesTable.toString());
        }

        // 显示正常差异
        if (normalDiffs.length > 0) {
          console.log(chalk.cyan('\n✓ 正常差异（环境特定参数）:\n'));
          const normalTable = createTable({
            head: ['字段', fromEnv, toEnv],
          });

          for (const diff of normalDiffs.slice(0, 10)) {
            const isSensitive = userAuthMetadata.sensitive.includes(diff.field);
            const fromDisplay = options.showValues || !isSensitive ? diff.from_value : '***';
            const toDisplay = options.showValues || !isSensitive ? diff.to_value : '***';

            normalTable.push([diff.field, fromDisplay, toDisplay]);
          }

          console.log(normalTable.toString());

          if (normalDiffs.length > 10) {
            console.log(chalk.gray(`\n... 还有 ${normalDiffs.length - 10} 个正常差异`));
          }
        }

        // 显示计时
        if (isTimingEnabled()) {
          timer.printSummary();
        }

        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });
