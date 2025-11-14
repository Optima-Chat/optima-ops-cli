import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { getParametersByPath } from '../../utils/aws/ssm.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface ParameterInfo {
  name: string;
  type: string;
  last_modified: string;
  version: number;
}

interface ListResult {
  environment: string;
  service: string;
  parameters: ParameterInfo[];
  total_count: number;
}

export const listCommand = new Command('list')
  .description('列出服务的所有配置参数（不显示值）')
  .argument('<service>', '服务名称 (user-auth, mcp-host, commerce-backend, agentic-chat)')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();

      if (!isJsonOutput()) {
        printTitle(`📋 配置参数列表 - ${service} (${env} 环境)`);
      }

      // 构建 AWS Parameter Store 路径
      const pathPrefix = `/optima/${env}/${service}/`;

      const result: ListResult = {
        environment: env,
        service,
        parameters: [],
        total_count: 0,
      };

      try {
        // 从 AWS Parameter Store 获取所有参数
        const params = await getParametersByPath(pathPrefix);

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
          if (param.Name) {
            // 提取参数名称（去掉路径前缀）
            const paramName = param.Name.replace(pathPrefix, '');

            result.parameters.push({
              name: paramName,
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
          outputSuccess(result);
        } else {
          const table = new Table({
            head: ['参数名称', '类型', '版本', '最后修改时间'],
            colWidths: [40, 15, 8, 30],
            wordWrap: true,
          });

          for (const param of result.parameters) {
            const typeColor = param.type === 'SecureString' ? chalk.yellow : chalk.gray;

            table.push([
              param.name,
              typeColor(param.type),
              param.version.toString(),
              param.last_modified
                ? new Date(param.last_modified).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                : 'N/A',
            ]);
          }

          console.log(table.toString());
          console.log();
          console.log(chalk.gray(`共 ${result.total_count} 个配置参数`));

          console.log();
          console.log(chalk.gray('💡 提示:'));
          console.log(chalk.gray('  - 使用 config get <service> <param> 查看参数值'));
          console.log(chalk.gray('  - 使用 config show <service> 查看所有参数值'));
          console.log(chalk.gray('  - SecureString 类型参数存储加密'));
        }
      } catch (error: any) {
        throw new Error(`获取配置参数失败: ${error.message}`);
      }
    } catch (error) {
      handleError(error);
    }
  });
