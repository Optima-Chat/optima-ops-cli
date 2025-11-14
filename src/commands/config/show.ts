import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { getParametersByPath } from '../../utils/aws/ssm.js';
import { maskValue } from '../../utils/mask.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface ParameterDetail {
  name: string;
  value: string;
  masked_value: string;
  type: string;
  last_modified: string;
  version: number;
}

interface ShowResult {
  environment: string;
  service: string;
  parameters: ParameterDetail[];
  total_count: number;
}

export const showCommand = new Command('show')
  .description('显示服务的所有配置参数（值已脱敏）')
  .argument('<service>', '服务名称 (user-auth, mcp-host, commerce-backend, agentic-chat)')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--raw', '显示原始值（不脱敏，需谨慎使用）', false)
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();

      if (!isJsonOutput()) {
        printTitle(`🔐 配置参数详情 - ${service} (${env} 环境)`);
        if (!options.raw) {
          console.log(chalk.yellow('⚠️  敏感值已自动脱敏'));
        } else {
          console.log(chalk.red('⚠️  显示原始值模式 - 请谨慎使用'));
        }
        console.log();
      }

      // 构建 AWS Parameter Store 路径
      const pathPrefix = `/optima/${env}/${service}/`;

      const result: ShowResult = {
        environment: env,
        service,
        parameters: [],
        total_count: 0,
      };

      try {
        // 从 AWS Parameter Store 获取所有参数（包括值）
        const params = await getParametersByPath(pathPrefix, true); // withDecryption = true

        if (!params || params.length === 0) {
          if (!isJsonOutput()) {
            console.log(chalk.yellow(`未找到配置参数: ${pathPrefix}`));
            console.log();
            console.log(chalk.gray('💡 可用服务:'));
            console.log(chalk.gray('  - user-auth'));
            console.log(chalk.gray('  - mcp-host'));
            console.log(chalk.gray('  - commerce-backend'));
            console.log(chalk.gray('  - agentic-chat'));
          }
          return;
        }

        // 处理参数列表
        for (const param of params) {
          if (param.Name && param.Value) {
            // 提取参数名称（去掉路径前缀）
            const paramName = param.Name.replace(pathPrefix, '');
            const paramValue = param.Value;

            result.parameters.push({
              name: paramName,
              value: paramValue,
              masked_value: maskValue(paramName, paramValue),
              type: param.Type || 'String',
              last_modified: param.LastModifiedDate?.toISOString() || '',
              version: param.Version || 1,
            });
          }
        }

        result.total_count = result.parameters.length;

        // 按名称排序
        result.parameters.sort((a, b) => a.name.localeCompare(b.name));

        // 输出结果
        if (isJsonOutput()) {
          outputSuccess({
            ...result,
            // JSON 输出时移除原始值（除非指定 --raw）
            parameters: result.parameters.map(p => ({
              name: p.name,
              value: options.raw ? p.value : undefined,
              masked_value: p.masked_value,
              type: p.type,
              last_modified: p.last_modified,
              version: p.version,
            })),
          });
        } else {
          const table = new Table({
            head: ['参数名称', '值', '类型', '版本'],
            colWidths: [35, 50, 15, 8],
            wordWrap: true,
          });

          for (const param of result.parameters) {
            const displayValue = options.raw ? param.value : param.masked_value;
            const typeColor = param.type === 'SecureString' ? chalk.yellow : chalk.gray;
            const valueColor = displayValue.includes('***') ? chalk.yellow : chalk.white;

            table.push([
              param.name,
              valueColor(displayValue),
              typeColor(param.type),
              param.version.toString(),
            ]);
          }

          console.log(table.toString());
          console.log();
          console.log(chalk.gray(`共 ${result.total_count} 个配置参数`));

          // 统计
          const secureCount = result.parameters.filter(p => p.type === 'SecureString').length;
          if (secureCount > 0) {
            console.log(chalk.gray(`其中 ${secureCount} 个为加密参数 (SecureString)`));
          }

          console.log();
          console.log(chalk.gray('💡 提示:'));
          console.log(chalk.gray('  - 使用 --raw 显示原始值（需谨慎）'));
          console.log(chalk.gray('  - 使用 config get <service> <param> 查看单个参数'));
          console.log(chalk.gray('  - 使用 config compare --from-env prod --to-env stage 对比环境'));
        }
      } catch (error: any) {
        throw new Error(`获取配置参数失败: ${error.message}`);
      }
    } catch (error) {
      handleError(error);
    }
  });
