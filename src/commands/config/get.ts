import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { getParameter } from '../../utils/aws/ssm.js';
import { maskValue } from '../../utils/mask.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface GetResult {
  environment: string;
  service: string;
  parameter: string;
  value: string;
  masked_value: string;
  type: string;
  last_modified?: string;
}

export const getCommand = new Command('get')
  .description('获取单个配置参数值（自动脱敏）')
  .argument('<service>', '服务名称 (user-auth, mcp-host, commerce-backend, agentic-chat)')
  .argument('<parameter>', '参数名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--raw', '显示原始值（不脱敏，需谨慎使用）', false)
  .option('--json', 'JSON 格式输出')
  .action(async (service, parameter, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();

      if (!isJsonOutput()) {
        printTitle(`🔐 配置参数 - ${service}/${parameter} (${env} 环境)`);
        if (!options.raw) {
          console.log(chalk.yellow('⚠️  敏感值已自动脱敏'));
        }
        console.log();
      }

      // 构建 AWS Parameter Store 路径
      const parameterPath = `/optima/${env}/${service}/${parameter}`;

      const result: GetResult = {
        environment: env,
        service,
        parameter,
        value: '',
        masked_value: '',
        type: 'String',
      };

      try {
        // 从 AWS Parameter Store 获取参数
        const paramData = await getParameter(parameterPath);

        if (!paramData || !paramData.Value) {
          throw new Error(`参数不存在: ${parameterPath}`);
        }

        result.value = paramData.Value;
        result.masked_value = options.raw ? paramData.Value : maskValue(parameter, paramData.Value);
        result.type = paramData.Type || 'String';
        result.last_modified = paramData.LastModifiedDate?.toISOString();

        // 输出结果
        if (isJsonOutput()) {
          outputSuccess({
            ...result,
            // JSON 输出时不包含原始值（除非指定 --raw）
            value: options.raw ? result.value : undefined,
          });
        } else {
          console.log(chalk.cyan('参数信息:'));
          console.log(chalk.gray(`  路径: ${parameterPath}`));
          console.log(chalk.gray(`  类型: ${result.type}`));
          if (result.last_modified) {
            console.log(chalk.gray(`  修改时间: ${new Date(result.last_modified).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`));
          }
          console.log();

          if (options.raw) {
            console.log(chalk.yellow('原始值:'));
            console.log(chalk.white(`  ${result.value}`));
          } else {
            console.log(chalk.green('脱敏值:'));
            console.log(chalk.white(`  ${result.masked_value}`));
          }

          console.log();
          console.log(chalk.gray('💡 提示:'));
          console.log(chalk.gray('  - 使用 --raw 显示原始值（需谨慎）'));
          console.log(chalk.gray('  - 使用 config show <service> 查看所有配置'));
          console.log(chalk.gray('  - 使用 config list <service> 查看配置列表'));
        }
      } catch (error: any) {
        if (error.name === 'ParameterNotFound' || error.message?.includes('ParameterNotFound')) {
          throw new Error(`参数不存在: ${parameterPath}\n\n可用服务: user-auth, mcp-host, commerce-backend, agentic-chat`);
        }
        throw error;
      }
    } catch (error) {
      handleError(error);
    }
  });
