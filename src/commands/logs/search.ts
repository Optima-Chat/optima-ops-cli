import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { PromptHelper } from '../../utils/prompt.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface LogMatch {
  timestamp?: string;
  service: string;
  line: string;
  line_number?: number;
}

interface SearchResult {
  environment: string;
  pattern: string;
  service?: string;
  since?: string;
  matches: LogMatch[];
  total_matches: number;
}

export const searchCommand = new Command('search')
  .description('在容器日志中搜索关键词')
  .argument('[pattern]', '搜索模式（支持正则表达式）')
  .option('--service <service>', '指定服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--since <time>', '时间范围 (如: 1h, 30m, 2d)', '1h')
  .option('--case-sensitive', '区分大小写', false)
  .option('--context <lines>', '显示匹配行前后的上下文行数', '0')
  .option('--json', 'JSON 格式输出')
  .action(async (pattern, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();

      // 交互式获取 pattern
      let searchPattern = pattern;
      if (!searchPattern && !isJsonOutput()) {
        searchPattern = await PromptHelper.inputText('请输入搜索模式:', '');
        if (!searchPattern) {
          throw new Error('搜索模式不能为空');
        }
      } else if (!searchPattern) {
        throw new Error('请提供搜索模式: logs search <pattern>');
      }

      // 交互式选择服务
      let targetService = options.service;
      if (!targetService && !isJsonOutput()) {
        targetService = await PromptHelper.selectService(Array.from(envConfig.services));
      }

      if (!isJsonOutput()) {
        const serviceText = targetService ? ` - ${targetService}` : ' - 所有服务';
        printTitle(`🔍 日志搜索${serviceText} (${env} 环境)`);
        console.log(chalk.gray(`搜索模式: ${searchPattern}`));
        console.log(chalk.gray(`时间范围: ${options.since}`));
        console.log();
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      const result: SearchResult = {
        environment: env,
        pattern: searchPattern,
        service: targetService,
        since: options.since,
        matches: [],
        total_matches: 0,
      };

      try {
        const services = targetService ? [targetService] : Array.from(envConfig.services);
        const contextLines = parseInt(options.context) || 0;
        const caseFlag = options.caseSensitive ? '' : '-i';

        for (const service of services) {
          const containerName = env === 'production'
            ? `optima-${service}-prod`
            : env === 'stage'
            ? `optima-${service}-stage`
            : `optima-${service}-dev`;

          // 构建搜索命令
          let grepCommand = `docker logs ${containerName} --since ${options.since} 2>&1`;

          if (contextLines > 0) {
            grepCommand += ` | grep ${caseFlag} -n -C ${contextLines} "${searchPattern}"`;
          } else {
            grepCommand += ` | grep ${caseFlag} -n "${searchPattern}"`;
          }

          try {
            const searchResult = await ssh.executeCommand(grepCommand);

            if (searchResult.stdout.trim()) {
              const lines = searchResult.stdout.trim().split('\n');

              for (const line of lines) {
                // 尝试解析行号（如果有 grep -n）
                const lineMatch = line.match(/^(\d+)[:-](.*)$/);
                if (lineMatch && lineMatch[1] && lineMatch[2] !== undefined) {
                  result.matches.push({
                    service,
                    line: lineMatch[2] || line,
                    line_number: parseInt(lineMatch[1]),
                  });
                } else {
                  result.matches.push({
                    service,
                    line: line,
                  });
                }
              }
            }
          } catch (error: any) {
            // 没有匹配或容器不存在，继续
            if (!error.message.includes('No such container')) {
              // 忽略 grep 没有匹配的情况（exit code 1）
            }
          }
        }

        result.total_matches = result.matches.length;
      } finally {
        await ssh.disconnect();
      }

      // 输出结果
      if (isJsonOutput()) {
        outputSuccess(result);
      } else {
        if (result.matches.length === 0) {
          console.log(chalk.yellow('未找到匹配的日志'));
        } else {
          console.log(chalk.green(`找到 ${result.total_matches} 条匹配记录:\n`));

          let currentService = '';
          for (const match of result.matches) {
            // 显示服务分隔
            if (match.service !== currentService) {
              if (currentService !== '') {
                console.log(); // 服务之间空行
              }
              currentService = match.service;
              console.log(chalk.cyan.bold(`[${match.service}]`));
            }

            // 高亮显示匹配的模式
            let displayLine = match.line;
            try {
              const regex = new RegExp(searchPattern, options.caseSensitive ? 'g' : 'gi');
              displayLine = displayLine.replace(regex, (matched) => chalk.yellow.bold(matched));
            } catch (error) {
              // 正则表达式无效，不高亮
            }

            // 显示行号（如果有）
            if (match.line_number) {
              console.log(chalk.gray(`  ${match.line_number}:`) + ` ${displayLine}`);
            } else {
              console.log(`  ${displayLine}`);
            }
          }
        }

        console.log();
        console.log(chalk.gray('💡 提示:'));
        console.log(chalk.gray('  - 使用 --context 3 显示匹配行前后 3 行上下文'));
        console.log(chalk.gray('  - 使用 --case-sensitive 进行区分大小写搜索'));
        console.log(chalk.gray('  - 使用 --since 2h 扩大时间范围'));
      }
    } catch (error) {
      handleError(error);
    }
  });
