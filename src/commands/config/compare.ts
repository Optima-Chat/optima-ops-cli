import { Command } from 'commander';
import chalk from 'chalk';
import { Environment } from '../../utils/config.js';
import { getParametersByPath } from '../../utils/aws/ssm.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printSection,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface ParameterComparison {
  name: string;
  exists_in_from: boolean;
  exists_in_to: boolean;
  values_match: boolean;
  type_from?: string;
  type_to?: string;
}

interface CompareResult {
  service: string;
  from_env: string;
  to_env: string;
  only_in_from: string[];
  only_in_to: string[];
  value_different: string[];
  type_different: string[];
  identical: string[];
  total_from: number;
  total_to: number;
  details: ParameterComparison[];
}

export const compareCommand = new Command('compare')
  .description('对比两个环境的配置差异')
  .argument('<service>', '服务名称 (user-auth, mcp-host, commerce-backend, agentic-chat)')
  .requiredOption('--from-env <env>', '源环境 (production/stage/development)')
  .requiredOption('--to-env <env>', '目标环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const fromEnv = options.fromEnv as Environment;
      const toEnv = options.toEnv as Environment;

      // 验证环境
      const validEnvs: Environment[] = ['production', 'stage', 'development'];
      if (!validEnvs.includes(fromEnv) || !validEnvs.includes(toEnv)) {
        throw new Error('无效的环境。可用环境: production, stage, development');
      }

      if (fromEnv === toEnv) {
        throw new Error('源环境和目标环境不能相同');
      }

      if (!isJsonOutput()) {
        printTitle(`🔄 配置对比 - ${service}`);
        console.log(chalk.gray(`源环境: ${fromEnv} → 目标环境: ${toEnv}`));
        console.log();
      }

      const result: CompareResult = {
        service,
        from_env: fromEnv,
        to_env: toEnv,
        only_in_from: [],
        only_in_to: [],
        value_different: [],
        type_different: [],
        identical: [],
        total_from: 0,
        total_to: 0,
        details: [],
      };

      try {
        // 获取两个环境的参数
        const fromPath = `/optima/${fromEnv}/${service}/`;
        const toPath = `/optima/${toEnv}/${service}/`;

        const [fromParams, toParams] = await Promise.all([
          getParametersByPath(fromPath, true),
          getParametersByPath(toPath, true),
        ]);

        // 构建参数映射
        const fromMap = new Map<string, any>();
        const toMap = new Map<string, any>();

        if (fromParams) {
          for (const param of fromParams) {
            if (param.Name) {
              const name = param.Name.replace(fromPath, '');
              fromMap.set(name, param);
            }
          }
        }

        if (toParams) {
          for (const param of toParams) {
            if (param.Name) {
              const name = param.Name.replace(toPath, '');
              toMap.set(name, param);
            }
          }
        }

        result.total_from = fromMap.size;
        result.total_to = toMap.size;

        // 获取所有参数名称
        const allNames = new Set([...fromMap.keys(), ...toMap.keys()]);

        // 对比参数
        for (const name of allNames) {
          const fromParam = fromMap.get(name);
          const toParam = toMap.get(name);

          const comparison: ParameterComparison = {
            name,
            exists_in_from: !!fromParam,
            exists_in_to: !!toParam,
            values_match: false,
            type_from: fromParam?.Type,
            type_to: toParam?.Type,
          };

          if (fromParam && !toParam) {
            // 只在源环境存在
            result.only_in_from.push(name);
          } else if (!fromParam && toParam) {
            // 只在目标环境存在
            result.only_in_to.push(name);
          } else if (fromParam && toParam) {
            // 两个环境都存在
            if (fromParam.Value === toParam.Value) {
              comparison.values_match = true;
              result.identical.push(name);
            } else {
              comparison.values_match = false;
              result.value_different.push(name);
            }

            // 检查类型差异
            if (fromParam.Type !== toParam.Type) {
              result.type_different.push(name);
            }
          }

          result.details.push(comparison);
        }

        // 排序
        result.only_in_from.sort();
        result.only_in_to.sort();
        result.value_different.sort();
        result.type_different.sort();
        result.identical.sort();

        // 输出结果
        if (isJsonOutput()) {
          outputSuccess(result);
        } else {
          // 摘要
          printSection('对比摘要');
          console.log(chalk.gray(`  ${fromEnv}: ${result.total_from} 个参数`));
          console.log(chalk.gray(`  ${toEnv}: ${result.total_to} 个参数`));
          console.log();

          // 只在源环境
          if (result.only_in_from.length > 0) {
            printSection(`只在 ${fromEnv} 环境 (${result.only_in_from.length})`);
            for (const name of result.only_in_from) {
              console.log(chalk.red(`  - ${name}`));
            }
            console.log();
          }

          // 只在目标环境
          if (result.only_in_to.length > 0) {
            printSection(`只在 ${toEnv} 环境 (${result.only_in_to.length})`);
            for (const name of result.only_in_to) {
              console.log(chalk.green(`  + ${name}`));
            }
            console.log();
          }

          // 值不同
          if (result.value_different.length > 0) {
            printSection(`值不同 (${result.value_different.length})`);
            for (const name of result.value_different) {
              console.log(chalk.yellow(`  ≠ ${name}`));
            }
            console.log();
          }

          // 类型不同
          if (result.type_different.length > 0) {
            printSection(`类型不同 (${result.type_different.length})`);
            for (const name of result.type_different) {
              const detail = result.details.find(d => d.name === name);
              if (detail) {
                console.log(chalk.yellow(`  ⚠ ${name}: ${detail.type_from} → ${detail.type_to}`));
              }
            }
            console.log();
          }

          // 完全相同
          if (result.identical.length > 0) {
            printSection(`完全相同 (${result.identical.length})`);
            const maxShow = 10;
            for (const name of result.identical.slice(0, maxShow)) {
              console.log(chalk.gray(`  ✓ ${name}`));
            }
            if (result.identical.length > maxShow) {
              console.log(chalk.gray(`  ... 还有 ${result.identical.length - maxShow} 个相同参数`));
            }
            console.log();
          }

          // 总结
          const totalDiff = result.only_in_from.length + result.only_in_to.length + result.value_different.length;
          if (totalDiff === 0) {
            console.log(chalk.green.bold('✓ 两个环境的配置完全一致'));
          } else {
            console.log(chalk.yellow.bold(`⚠️  发现 ${totalDiff} 处差异`));
          }

          console.log();
          console.log(chalk.gray('💡 提示:'));
          console.log(chalk.gray('  - 使用 config show <service> --env <env> 查看详细配置'));
          console.log(chalk.gray('  - 使用 config get <service> <param> --env <env> 查看具体参数值'));
          console.log(chalk.gray('  - 值差异不会显示具体内容，需要单独查看'));
        }
      } catch (error: any) {
        throw new Error(`配置对比失败: ${error.message}`);
      }
    } catch (error) {
      handleError(error);
    }
  });
