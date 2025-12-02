import { Command } from 'commander';
import chalk from 'chalk';
import axios from 'axios';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess } from '../../utils/output.js';
import { SSHClient } from '../../utils/ssh.js';

// BI 数据机器配置
const BI_DATA_HOST = 'bi-data.optima.onl';
const BI_SERVICES = ['clickhouse', 'kafka', 'zookeeper', 'debezium'];

// ============== bi status ==============

const statusCommand = new Command('status')
  .description('查看 BI 数据服务状态')
  .option('--json', 'JSON 输出')
  .action(async () => {
    try {
      console.log(chalk.cyan('连接到 BI 数据机器...\n'));

      const ssh = new SSHClient('bi-data');
      await ssh.connect();

      // 检查 Docker 服务状态
      const { stdout: dockerPs } = await ssh.executeCommand(
        'docker ps --format "{{.Names}}|{{.Status}}|{{.Image}}"'
      );

      const containers = dockerPs
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const [name, status, image] = line.split('|');
          return {
            name,
            status,
            image,
            running: status?.toLowerCase().includes('up'),
          };
        });

      // 过滤 BI 相关的容器
      const biContainers = containers.filter((c) =>
        BI_SERVICES.some(
          (svc) =>
            c.name?.toLowerCase().includes(svc) ||
            c.image?.toLowerCase().includes(svc)
        )
      );

      await ssh.disconnect();

      if (isJsonOutput()) {
        outputSuccess({
          host: BI_DATA_HOST,
          containers: biContainers,
          allContainers: containers,
        });
      } else {
        console.log(chalk.bold('BI 数据服务状态\n'));
        console.log(chalk.gray(`主机: ${BI_DATA_HOST}`));
        console.log(chalk.gray('─'.repeat(70)));

        if (biContainers.length === 0) {
          console.log(chalk.yellow('未找到 BI 相关容器'));
          console.log(chalk.gray('\n所有运行中的容器:'));
          for (const c of containers) {
            console.log(`  - ${c.name}`);
          }
        } else {
          for (const c of biContainers) {
            const statusIcon = c.running
              ? chalk.green('✓')
              : chalk.red('✗');
            console.log(
              `${statusIcon} ${chalk.cyan(c.name?.padEnd(25))} ${c.status}`
            );
          }
        }

        console.log(chalk.gray('─'.repeat(70)));
        console.log(`共 ${biContainers.length} 个 BI 服务容器\n`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== bi clickhouse ==============

const clickhouseCommand = new Command('clickhouse')
  .description('ClickHouse 管理命令');

clickhouseCommand
  .command('status')
  .description('查看 ClickHouse 状态')
  .option('--json', 'JSON 输出')
  .action(async () => {
    try {
      const ssh = new SSHClient('bi-data');
      await ssh.connect();

      // 检查 ClickHouse 容器
      const { stdout: containerStatus } = await ssh.executeCommand(
        'docker ps --filter "name=clickhouse" --format "{{.Names}}|{{.Status}}|{{.Ports}}"'
      );

      // 尝试获取 ClickHouse 版本
      let version = 'N/A';
      try {
        const { stdout: versionOutput } = await ssh.executeCommand(
          'docker exec clickhouse clickhouse-client --query "SELECT version()"'
        );
        version = versionOutput.trim();
      } catch {
        // 忽略错误
      }

      await ssh.disconnect();

      const lines = containerStatus.split('\n').filter((l) => l.trim());
      const container = lines[0]?.split('|');

      if (isJsonOutput()) {
        outputSuccess({
          service: 'clickhouse',
          running: lines.length > 0,
          container: container?.[0],
          status: container?.[1],
          ports: container?.[2],
          version,
        });
      } else {
        console.log(chalk.bold('\nClickHouse 状态\n'));
        console.log(chalk.gray('─'.repeat(50)));

        if (lines.length > 0) {
          console.log(chalk.green('✓') + ' 运行中');
          console.log(`容器: ${container?.[0]}`);
          console.log(`状态: ${container?.[1]}`);
          console.log(`端口: ${container?.[2]}`);
          console.log(`版本: ${version}`);
        } else {
          console.log(chalk.red('✗') + ' ClickHouse 未运行');
        }

        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

clickhouseCommand
  .command('query')
  .description('执行 ClickHouse 查询')
  .argument('<sql>', 'SQL 查询语句')
  .option('--format <format>', '输出格式 (Pretty|JSON|CSV)', 'Pretty')
  .action(async (sql, options) => {
    try {
      const ssh = new SSHClient('bi-data');
      await ssh.connect();

      // 安全检查：只允许 SELECT 查询
      if (!sql.trim().toLowerCase().startsWith('select')) {
        throw new Error('安全限制：只允许执行 SELECT 查询');
      }

      const { stdout } = await ssh.executeCommand(
        `docker exec clickhouse clickhouse-client --query "${sql.replace(/"/g, '\\"')}" --format ${options.format}`
      );

      await ssh.disconnect();

      console.log(stdout);
    } catch (error) {
      handleError(error);
    }
  });

// ============== bi kafka ==============

const kafkaCommand = new Command('kafka')
  .description('Kafka 管理命令');

kafkaCommand
  .command('status')
  .description('查看 Kafka 状态')
  .option('--json', 'JSON 输出')
  .action(async () => {
    try {
      const ssh = new SSHClient('bi-data');
      await ssh.connect();

      // 检查 Kafka 容器
      const { stdout: containerStatus } = await ssh.executeCommand(
        'docker ps --filter "name=kafka" --format "{{.Names}}|{{.Status}}|{{.Ports}}"'
      );

      await ssh.disconnect();

      const lines = containerStatus.split('\n').filter((l) => l.trim());
      const container = lines[0]?.split('|');

      if (isJsonOutput()) {
        outputSuccess({
          service: 'kafka',
          running: lines.length > 0,
          container: container?.[0],
          status: container?.[1],
          ports: container?.[2],
        });
      } else {
        console.log(chalk.bold('\nKafka 状态\n'));
        console.log(chalk.gray('─'.repeat(50)));

        if (lines.length > 0) {
          console.log(chalk.green('✓') + ' 运行中');
          console.log(`容器: ${container?.[0]}`);
          console.log(`状态: ${container?.[1]}`);
          console.log(`端口: ${container?.[2]}`);
        } else {
          console.log(chalk.red('✗') + ' Kafka 未运行');
        }

        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

kafkaCommand
  .command('topics')
  .description('列出 Kafka topics')
  .option('--json', 'JSON 输出')
  .action(async () => {
    try {
      const ssh = new SSHClient('bi-data');
      await ssh.connect();

      const { stdout } = await ssh.executeCommand(
        'docker exec kafka kafka-topics --bootstrap-server localhost:9092 --list'
      );

      await ssh.disconnect();

      const topics = stdout.split('\n').filter((t) => t.trim());

      if (isJsonOutput()) {
        outputSuccess({ topics });
      } else {
        console.log(chalk.bold('\nKafka Topics\n'));
        console.log(chalk.gray('─'.repeat(50)));

        for (const topic of topics) {
          console.log(`  - ${topic}`);
        }

        console.log(chalk.gray('─'.repeat(50)));
        console.log(`共 ${topics.length} 个 topics\n`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== bi logs ==============

const logsCommand = new Command('logs')
  .description('查看 BI 服务日志')
  .argument('<service>', '服务名称 (clickhouse|kafka|zookeeper|debezium)')
  .option('--tail <lines>', '显示最后 N 行', '100')
  .option('--follow', '持续输出')
  .action(async (service, options) => {
    try {
      if (!BI_SERVICES.includes(service)) {
        throw new Error(
          `未知服务: ${service}。可用服务: ${BI_SERVICES.join(', ')}`
        );
      }

      const ssh = new SSHClient('bi-data');
      await ssh.connect();

      const followFlag = options.follow ? '-f' : '';
      const { stdout } = await ssh.executeCommand(
        `docker logs ${followFlag} --tail ${options.tail} ${service}`
      );

      await ssh.disconnect();

      console.log(stdout);
    } catch (error) {
      handleError(error);
    }
  });

// ============== bi restart ==============

const restartCommand = new Command('restart')
  .description('重启 BI 服务')
  .argument('<service>', '服务名称 (clickhouse|kafka|zookeeper|debezium)')
  .option('--yes', '跳过确认')
  .action(async (service, options) => {
    try {
      if (!BI_SERVICES.includes(service)) {
        throw new Error(
          `未知服务: ${service}。可用服务: ${BI_SERVICES.join(', ')}`
        );
      }

      if (!options.yes) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            chalk.yellow(`确定要重启服务 ${service} 吗? (y/N) `),
            resolve
          );
        });
        rl.close();

        if (answer.toLowerCase() !== 'y') {
          console.log('已取消');
          return;
        }
      }

      console.log(chalk.cyan(`正在重启 ${service}...`));

      const ssh = new SSHClient('bi-data');
      await ssh.connect();

      await ssh.executeCommand(`docker restart ${service}`);

      await ssh.disconnect();

      console.log(chalk.green(`✓ ${service} 已重启`));
    } catch (error) {
      handleError(error);
    }
  });

// ============== 导出 ==============

export const biCommand = new Command('bi')
  .description('BI 数据服务管理')
  .addCommand(statusCommand)
  .addCommand(clickhouseCommand)
  .addCommand(kafkaCommand)
  .addCommand(logsCommand)
  .addCommand(restartCommand);
