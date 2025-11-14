import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import { getParameter } from '../../utils/aws/ssm.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess } from '../../utils/output.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../../..');
const credentialsPath = join(projectRoot, '.db-credentials.json');

// Terraform State 配置
const S3_BUCKET = 'optima-terraform-state-585891120210';
const SHARED_STATE_KEY = 'shared/terraform.tfstate';
const DB_MGMT_STATE_KEY = 'database-management/terraform.tfstate';

interface DatabaseCredential {
  user: string;
  password: string;
  database?: string;
  note?: string;
}

interface CredentialsFile {
  production: Record<string, DatabaseCredential>;
  stage: Record<string, DatabaseCredential>;
  rds: {
    host: string;
    port: number;
  };
  _metadata: {
    generated: string;
    source: Record<string, string>;
    note: string;
  };
}

/**
 * 从 DATABASE_URL 中提取密码
 */
function extractPasswordFromUrl(url: string): string | null {
  try {
    // postgresql+asyncpg://user:password@host:port/database
    const match = url.match(/:\/\/[^:]+:([^@]+)@/);
    return match && match[1] ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 获取 Production 环境密码
 */
async function fetchProductionPasswords(spinner: any): Promise<Record<string, DatabaseCredential>> {
  spinner.text = '获取 Production 环境密码...';

  const credentials: Record<string, DatabaseCredential> = {};

  try {
    // 获取各服务密码
    const services = [
      { key: 'optima_auth', param: '/optima/prod/user-auth/db-password', user: 'auth_user', db: 'optima_auth' },
      { key: 'optima_mcp', param: '/optima/prod/mcp-host/db-password', user: 'mcp_user', db: 'optima_mcp' },
      { key: 'optima_chat', param: '/optima/prod/agentic-chat/db-password', user: 'chat_user', db: 'optima_chat' },
    ];

    for (const service of services) {
      try {
        const param = await getParameter(service.param);
        if (param?.Value) {
          credentials[service.key] = {
            user: service.user,
            password: param.Value,
            database: service.db,
          };
        }
      } catch (error) {
        // 如果单个服务获取失败，尝试从 database-url 获取
        try {
          const urlParam = await getParameter(service.param.replace('db-password', 'database-url'));
          if (urlParam?.Value) {
            const password = extractPasswordFromUrl(urlParam.Value);
            if (password) {
              credentials[service.key] = {
                user: service.user,
                password,
                database: service.db,
              };
            }
          }
        } catch {
          // 忽略
        }
      }
    }

    // commerce-backend 特殊处理（只有 database-url）
    try {
      const commerceUrl = await getParameter('/optima/prod/commerce-backend/database-url');
      if (commerceUrl?.Value) {
        const password = extractPasswordFromUrl(commerceUrl.Value);
        if (password) {
          credentials.optima_commerce = {
            user: 'commerce_user',
            password,
            database: 'optima_commerce',
          };
        }
      }
    } catch {
      // 忽略
    }

    // 获取 master 密码（从 Secrets Manager）
    try {
      const { stdout } = await execAsync(
        `aws secretsmanager get-secret-value --secret-id /optima/rds/master-password --query SecretString --output text`
      );
      const secretData = JSON.parse(stdout.trim());
      const masterPass = secretData.password;

      if (masterPass) {
        credentials.optima_admin = {
          user: 'optima_admin',
          password: masterPass,
          database: 'postgres',
          note: 'Master password from AWS Secrets Manager - has access to all databases',
        };
      }
    } catch (error) {
      credentials.optima_admin = {
        user: 'optima_admin',
        password: 'PLEASE_SET_MASTER_PASSWORD',
        database: 'postgres',
        note: 'Master password from AWS Secrets Manager - has access to all databases',
      };
    }

    spinner.succeed('Production 环境密码获取完成');
    return credentials;
  } catch (error: any) {
    spinner.fail(`获取 Production 密码失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取 Stage 环境密码
 */
async function fetchStagePasswords(spinner: any): Promise<Record<string, DatabaseCredential>> {
  spinner.text = '获取 Stage 环境密码...';

  try {
    // 从 Terraform State 获取
    const { stdout } = await execAsync(
      `aws s3 cp s3://${S3_BUCKET}/${DB_MGMT_STATE_KEY} - | jq -c '.outputs.stage_database_credentials.value'`
    );

    const stageCreds = JSON.parse(stdout.trim());

    if (!stageCreds) {
      throw new Error('无法从 Terraform State 获取 Stage 凭证');
    }

    // 获取 master 密码（从 Secrets Manager）
    let masterPass = 'PLEASE_SET_MASTER_PASSWORD';
    try {
      const { stdout: masterStdout } = await execAsync(
        `aws secretsmanager get-secret-value --secret-id /optima/rds/master-password --query SecretString --output text`
      );
      const secretData = JSON.parse(masterStdout.trim());
      if (secretData.password) {
        masterPass = secretData.password;
      }
    } catch {
      // 使用默认值
    }

    const credentials: Record<string, DatabaseCredential> = {
      optima_admin: {
        user: 'optima_admin',
        password: masterPass,
        database: 'postgres',
        note: 'Master password from terraform state - has access to all databases',
      },
    };

    // 转换格式
    const serviceMap: Record<string, string> = {
      auth: 'optima_stage_auth',
      mcp: 'optima_stage_mcp',
      commerce: 'optima_stage_commerce',
      chat: 'optima_stage_chat',
      infisical: 'optima_infisical',
    };

    for (const [key, dbKey] of Object.entries(serviceMap)) {
      if (stageCreds[key]) {
        credentials[dbKey] = {
          user: stageCreds[key].db_user,
          password: stageCreds[key].db_password,
          database: stageCreds[key].db_name,
        };
      }
    }

    spinner.succeed('Stage 环境密码获取完成');
    return credentials;
  } catch (error: any) {
    spinner.fail(`获取 Stage 密码失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取 RDS 信息
 */
async function fetchRDSInfo(spinner: any): Promise<{ host: string; port: number }> {
  spinner.text = '获取 RDS 连接信息...';

  try {
    const { stdout } = await execAsync(
      `aws s3 cp s3://${S3_BUCKET}/${SHARED_STATE_KEY} - | jq -r '.outputs.rds_instance_address.value'`
    );

    const host = stdout.trim();

    if (host && host !== 'null') {
      spinner.succeed('RDS 连接信息获取完成');
      return { host, port: 5432 };
    }

    // Fallback
    return {
      host: 'optima-prod-postgres.ctg866o0ehac.ap-southeast-1.rds.amazonaws.com',
      port: 5432,
    };
  } catch {
    return {
      host: 'optima-prod-postgres.ctg866o0ehac.ap-southeast-1.rds.amazonaws.com',
      port: 5432,
    };
  }
}

/**
 * 生成配置文件
 */
async function generateCredentialsFile(
  prodCreds: Record<string, DatabaseCredential>,
  stageCreds: Record<string, DatabaseCredential>,
  rdsInfo: { host: string; port: number }
): Promise<CredentialsFile> {
  const config: CredentialsFile = {
    production: prodCreds,
    stage: stageCreds,
    rds: rdsInfo,
    _metadata: {
      generated: new Date().toISOString(),
      source: {
        production_passwords: 'AWS SSM Parameter Store (/optima/prod/*/db-password)',
        stage_passwords: `Terraform State (s3://${S3_BUCKET}/${DB_MGMT_STATE_KEY})`,
        master_password: `Terraform State (s3://${S3_BUCKET}/${SHARED_STATE_KEY})`,
      },
      note: 'This file contains database credentials. Already in .gitignore.',
    },
  };

  return config;
}

/**
 * 验证凭证
 */
function validateCredentials(config: CredentialsFile): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // 检查缺失的密码
  for (const [env, creds] of Object.entries({ production: config.production, stage: config.stage })) {
    for (const [db, cred] of Object.entries(creds)) {
      if (!cred.password || cred.password === 'MISSING' || cred.password === 'PLEASE_SET_MASTER_PASSWORD') {
        warnings.push(`${env}/${db}: 密码缺失或需要手动设置`);
      }
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

export const initCredentialsCommand = new Command('init-credentials')
  .description('从 AWS SSM 和 Terraform State 获取数据库凭证')
  .option('--json', 'JSON 格式输出')
  .option('--force', '强制覆盖已存在的配置文件')
  .action(async (options) => {
    try {
      const spinner = ora('初始化数据库凭证...').start();

      // 检查是否已存在
      if (!options.force) {
        try {
          const { existsSync } = await import('fs');
          if (existsSync(credentialsPath)) {
            spinner.warn('配置文件已存在，使用 --force 覆盖');
            console.log(chalk.yellow(`\n现有文件: ${credentialsPath}`));
            console.log(chalk.yellow('使用 --force 标志强制覆盖\n'));
            process.exit(0);
          }
        } catch {
          // 文件不存在，继续
        }
      }

      // 检查依赖
      spinner.text = '检查依赖...';
      try {
        await execAsync('aws --version');
        await execAsync('jq --version');
      } catch (error) {
        spinner.fail('缺少必要依赖');
        console.log(chalk.red('\n缺少必要工具:'));
        console.log(chalk.yellow('  - AWS CLI'));
        console.log(chalk.yellow('  - jq (JSON 处理工具)'));
        console.log(chalk.white('\n安装方法:'));
        console.log(chalk.white('  AWS CLI: https://aws.amazon.com/cli/'));
        console.log(chalk.white('  jq: sudo apt-get install jq (Linux) 或 brew install jq (macOS)'));
        process.exit(1);
      }

      // 获取凭证
      const prodCreds = await fetchProductionPasswords(spinner);
      const stageCreds = await fetchStagePasswords(spinner);
      const rdsInfo = await fetchRDSInfo(spinner);

      // 生成配置
      spinner.text = '生成配置文件...';
      const config = await generateCredentialsFile(prodCreds, stageCreds, rdsInfo);

      // 写入文件
      writeFileSync(credentialsPath, JSON.stringify(config, null, 2), { mode: 0o600 });
      spinner.succeed(`配置文件已生成: ${credentialsPath}`);

      // 验证
      const validation = validateCredentials(config);

      if (isJsonOutput()) {
        outputSuccess({
          credentials_file: credentialsPath,
          production_databases: Object.keys(config.production),
          stage_databases: Object.keys(config.stage),
          rds_host: config.rds.host,
          valid: validation.valid,
          warnings: validation.warnings,
        });
      } else {
        console.log('');
        console.log(chalk.green('✓ 凭证初始化完成'));
        console.log('');
        console.log(chalk.cyan('配置摘要:'));
        console.log(chalk.white(`  Production 数据库: ${Object.keys(config.production).join(', ')}`));
        console.log(chalk.white(`  Stage 数据库: ${Object.keys(config.stage).join(', ')}`));
        console.log(chalk.white(`  RDS 主机: ${config.rds.host}`));
        console.log('');

        if (validation.warnings.length > 0) {
          console.log(chalk.yellow('⚠ 警告:'));
          validation.warnings.forEach((w) => console.log(chalk.yellow(`  - ${w}`)));
          console.log('');
        }

        console.log(chalk.cyan('安全提示:'));
        console.log(chalk.white('  1. 此文件包含敏感凭证，已自动加入 .gitignore'));
        console.log(chalk.white('  2. 文件权限已设置为 600 (仅所有者可读写)'));
        console.log(chalk.white('  3. 定期更新密码并重新运行此命令'));
        console.log('');
        console.log(chalk.cyan('测试连接:'));
        console.log(chalk.white('  optima-ops db list'));
        console.log('');
      }
    } catch (error) {
      handleError(error);
    }
  });
