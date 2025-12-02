import { Command } from 'commander';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import chalk from 'chalk';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess } from '../../utils/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// infisical-envs 目录路径
const INFISICAL_ENVS_DIR = path.resolve(__dirname, '../../../infisical-envs');
const SYNC_SCRIPT = path.join(INFISICAL_ENVS_DIR, 'scripts/sync_to_infisical.py');

// ============== sync ==============

const syncCommand = new Command('sync')
  .description('同步环境变量到 Infisical')
  .option('--path <path>', 'Infisical 路径 (如 /services/user-auth)')
  .option('--file <file>', '指定 .env 文件路径')
  .option('-r, --recursive', '递归同步路径下所有文件')
  .option('--dry-run', '预览模式，不实际执行')
  .option('--all', '同步所有配置（完整同步）')
  .action(async (options) => {
    try {
      // 检查 Python 脚本是否存在
      if (!fs.existsSync(SYNC_SCRIPT)) {
        throw new Error(`同步脚本不存在: ${SYNC_SCRIPT}`);
      }

      // 构建命令参数
      const args: string[] = [SYNC_SCRIPT];

      if (options.dryRun) {
        args.push('--dry-run');
      }

      if (options.path) {
        args.push('--path', options.path);
      }

      if (options.file) {
        args.push('--file', options.file);
      }

      if (options.recursive) {
        args.push('--recursive');
      }

      if (!options.path && !options.file && !options.all) {
        console.log(chalk.yellow('请指定同步目标:'));
        console.log(chalk.gray('  --path <path>  同步指定 Infisical 路径'));
        console.log(chalk.gray('  --file <file>  同步指定 .env 文件'));
        console.log(chalk.gray('  --all          完整同步所有配置'));
        console.log(chalk.gray('\n示例:'));
        console.log(chalk.gray('  optima-ops infisical sync --path /services/user-auth'));
        console.log(chalk.gray('  optima-ops infisical sync --path /services/bi -r'));
        console.log(chalk.gray('  optima-ops infisical sync --all --dry-run'));
        return;
      }

      console.log(chalk.cyan('启动 Infisical 同步...\n'));

      // 执行 Python 脚本
      const proc = spawn('python3', args, {
        cwd: INFISICAL_ENVS_DIR,
        stdio: 'inherit',
      });

      proc.on('error', (err) => {
        throw new Error(`无法执行 Python 脚本: ${err.message}`);
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          console.log(chalk.red(`\n同步失败，退出码: ${code}`));
          process.exit(code || 1);
        }
      });
    } catch (error) {
      handleError(error);
    }
  });

// ============== list-services ==============

const listServicesCommand = new Command('list-services')
  .description('列出所有可同步的服务')
  .option('--json', 'JSON 输出')
  .action(async () => {
    try {
      const servicesDir = path.join(INFISICAL_ENVS_DIR, 'v2/services');

      if (!fs.existsSync(servicesDir)) {
        throw new Error(`服务目录不存在: ${servicesDir}`);
      }

      const services: Array<{
        name: string;
        path: string;
        environments: string[];
      }> = [];

      // 递归扫描服务目录
      function scanDir(dir: string, basePath: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        const envFiles = entries.filter(
          (e) => e.isFile() && e.name.endsWith('.env')
        );

        if (envFiles.length > 0) {
          const environments = envFiles
            .map((e) => e.name.replace('.env', ''))
            .filter((e) => ['common', 'prod', 'staging'].includes(e));

          services.push({
            name: basePath.replace('/services/', ''),
            path: basePath,
            environments,
          });
        }

        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            scanDir(
              path.join(dir, entry.name),
              `${basePath}/${entry.name}`
            );
          }
        }
      }

      const serviceDirs = fs.readdirSync(servicesDir, { withFileTypes: true });
      for (const serviceDir of serviceDirs) {
        if (serviceDir.isDirectory()) {
          scanDir(
            path.join(servicesDir, serviceDir.name),
            `/services/${serviceDir.name}`
          );
        }
      }

      if (isJsonOutput()) {
        outputSuccess({ services });
      } else {
        console.log(chalk.bold('\n可同步的服务列表\n'));
        console.log(chalk.gray('─'.repeat(70)));

        for (const svc of services) {
          const envs = svc.environments.join(', ');
          console.log(
            `${chalk.cyan(svc.name.padEnd(30))} ` +
              `${chalk.gray(svc.path.padEnd(25))} ` +
              `[${envs}]`
          );
        }

        console.log(chalk.gray('─'.repeat(70)));
        console.log(`共 ${services.length} 个服务\n`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== list-shared ==============

const listSharedCommand = new Command('list-shared')
  .description('列出所有共享密钥配置')
  .option('--json', 'JSON 输出')
  .action(async () => {
    try {
      const sharedDir = path.join(INFISICAL_ENVS_DIR, 'v2/shared-secrets');

      if (!fs.existsSync(sharedDir)) {
        throw new Error(`共享密钥目录不存在: ${sharedDir}`);
      }

      const secrets: Array<{
        name: string;
        path: string;
        environments: string[];
      }> = [];

      // 扫描每个环境目录
      for (const envName of ['common', 'prod', 'staging']) {
        const envDir = path.join(sharedDir, envName);
        if (!fs.existsSync(envDir)) continue;

        function scanEnvDir(dir: string, basePath: string) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.env')) {
              const secretName = entry.name.replace('.env', '');
              const secretPath = `${basePath}/${secretName}`;

              // 查找或创建记录
              let secret = secrets.find((s) => s.path === secretPath);
              if (!secret) {
                secret = {
                  name: secretPath.replace('/shared-secrets/', ''),
                  path: secretPath,
                  environments: [],
                };
                secrets.push(secret);
              }
              secret.environments.push(envName);
            } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
              scanEnvDir(
                path.join(dir, entry.name),
                `${basePath}/${entry.name}`
              );
            }
          }
        }

        scanEnvDir(envDir, '/shared-secrets');
      }

      // 按路径排序
      secrets.sort((a, b) => a.path.localeCompare(b.path));

      if (isJsonOutput()) {
        outputSuccess({ secrets });
      } else {
        console.log(chalk.bold('\n共享密钥配置列表\n'));
        console.log(chalk.gray('─'.repeat(70)));

        for (const secret of secrets) {
          const envs = secret.environments.join(', ');
          console.log(
            `${chalk.cyan(secret.name.padEnd(30))} ` +
              `${chalk.gray(secret.path.padEnd(30))} ` +
              `[${envs}]`
          );
        }

        console.log(chalk.gray('─'.repeat(70)));
        console.log(`共 ${secrets.length} 个配置\n`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== status ==============

const statusCommand = new Command('status')
  .description('检查 Infisical 同步状态')
  .action(async () => {
    try {
      const configFile = path.join(INFISICAL_ENVS_DIR, 'config.local.yaml');

      console.log(chalk.bold('\nInfisical 同步状态\n'));
      console.log(chalk.gray('─'.repeat(50)));

      // 检查配置文件
      if (fs.existsSync(configFile)) {
        console.log(chalk.green('✓') + ' 配置文件: config.local.yaml');
      } else {
        console.log(chalk.red('✗') + ' 配置文件缺失');
        console.log(
          chalk.gray('  请从 config.local.yaml.example 复制并配置')
        );
      }

      // 检查 v2 目录
      const v2Dir = path.join(INFISICAL_ENVS_DIR, 'v2');
      if (fs.existsSync(v2Dir)) {
        console.log(chalk.green('✓') + ' v2 目录存在');

        // 统计服务数量
        const servicesDir = path.join(v2Dir, 'services');
        if (fs.existsSync(servicesDir)) {
          const serviceCount = fs
            .readdirSync(servicesDir, { withFileTypes: true })
            .filter((e) => e.isDirectory()).length;
          console.log(chalk.gray(`  服务目录: ${serviceCount} 个`));
        }

        // 统计共享密钥数量
        const sharedDir = path.join(v2Dir, 'shared-secrets');
        if (fs.existsSync(sharedDir)) {
          let envCount = 0;
          for (const env of ['common', 'prod', 'staging']) {
            const envDir = path.join(sharedDir, env);
            if (fs.existsSync(envDir)) envCount++;
          }
          console.log(chalk.gray(`  共享密钥环境: ${envCount} 个`));
        }
      } else {
        console.log(chalk.red('✗') + ' v2 目录不存在');
      }

      // 检查 Python 脚本
      if (fs.existsSync(SYNC_SCRIPT)) {
        console.log(chalk.green('✓') + ' 同步脚本可用');
      } else {
        console.log(chalk.red('✗') + ' 同步脚本缺失');
      }

      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.gray('\n使用 "optima-ops infisical sync --help" 查看同步选项\n'));
    } catch (error) {
      handleError(error);
    }
  });

// ============== 导出 ==============

export const infisicalCommand = new Command('infisical')
  .description('Infisical 密钥同步管理')
  .addCommand(syncCommand)
  .addCommand(listServicesCommand)
  .addCommand(listSharedCommand)
  .addCommand(statusCommand);
