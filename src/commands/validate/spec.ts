import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfigSpec, getRequiredVariables, getSensitiveVariables, getDeprecatedVariables } from '../../loaders/spec-loader.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { handleError } from '../../utils/error.js';
import { getServiceConfig } from '../../utils/config.js';
import { getServicePath, isInWorkspace, getWorkspaceRoot } from '../../utils/workspace.js';

export const specCommand = new Command('spec')
  .description('查看和验证服务配置规范')
  .argument('<service>', '服务名称')
  .option('--check', '验证 spec 文件格式')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      if (!isJsonOutput()) {
        printTitle(`📋 配置规范 - ${service}`);
      }

      // 获取服务配置
      const serviceConfig = getServiceConfig(service);
      if (!serviceConfig) {
        throw new Error(`未知服务: ${service}`);
      }

      // 使用 workspace 模块获取服务路径
      let servicePath = getServicePath(service);

      // 如果 workspace 中未找到，回退到硬编码路径
      if (!servicePath) {
        // 硬编码路径用于兼容非 workspace 环境
        servicePath = `/mnt/d/work_optima_new/core-services/${service}`;
        if (!isJsonOutput()) {
          console.log(chalk.yellow(`⚠️  未在 workspace 中找到服务 ${service}，使用默认路径\n`));
        }
      } else if (!isJsonOutput()) {
        const workspaceRoot = getWorkspaceRoot();
        console.log(chalk.gray(`📁 Workspace: ${workspaceRoot}`));
        console.log(chalk.gray(`📁 服务路径: ${servicePath}\n`));
      }

      // 加载 config-spec.yaml
      const spec = loadConfigSpec(servicePath);

      // 提取信息
      const totalVars = Object.keys(spec.variables).length;
      const requiredVars = getRequiredVariables(spec);
      const sensitiveVars = getSensitiveVariables(spec);
      const deprecatedVars = getDeprecatedVariables(spec);

      const envSpecificVars = Object.entries(spec.variables)
        .filter(([_, v]) => v.env_specific === true)
        .map(([name, _]) => name);

      const buildTimeVars = Object.entries(spec.variables)
        .filter(([_, v]) => v.build_time === true)
        .map(([name, _]) => name);

      const containerPathVars = Object.entries(spec.variables)
        .filter(([_, v]) => v.container_path === true)
        .map(([name, _]) => name);

      if (isJsonOutput()) {
        outputSuccess({
          service: spec.service,
          version: spec.version,
          last_updated: spec.last_updated,
          summary: {
            total_variables: totalVars,
            required: requiredVars.length,
            sensitive: sensitiveVars.length,
            env_specific: envSpecificVars.length,
            build_time: buildTimeVars.length,
            container_path: containerPathVars.length,
            deprecated: deprecatedVars.length,
          },
          variables: Object.keys(spec.variables),
          required_variables: requiredVars,
          sensitive_variables: sensitiveVars,
          deprecated_variables: deprecatedVars,
        });
      } else {
        // 显示基本信息
        console.log(chalk.cyan('基本信息:\n'));
        const infoTable = createTable({
          colWidths: [25, 40],
        });
        infoTable.push(
          ['服务名称', spec.service],
          ['规范版本', spec.version],
          ['最后更新', spec.last_updated],
          ['总变量数', `${totalVars} 个`],
          ['必需变量', `${requiredVars.length} 个`],
          ['敏感变量', `${sensitiveVars.length} 个`],
          ['环境特定', `${envSpecificVars.length} 个`],
          ['构建时变量', `${buildTimeVars.length} 个`],
          ['已废弃', deprecatedVars.length > 0 ? chalk.yellow(`${deprecatedVars.length} 个`) : '0 个'],
        );
        console.log(infoTable.toString());

        // 显示必需变量列表
        console.log(chalk.cyan('\n必需变量:\n'));
        const requiredTable = createTable({
          head: ['变量名', '类型', '描述'],
        });

        for (const varName of requiredVars) {
          const varSpec = spec.variables[varName];
          requiredTable.push([
            varName,
            varSpec.type === 'secret' ? chalk.red('secret') : chalk.blue('config'),
            varSpec.description || 'N/A',
          ]);
        }

        console.log(requiredTable.toString());

        // 显示已废弃变量
        if (deprecatedVars.length > 0) {
          console.log(chalk.yellow('\n⚠️  已废弃变量:\n'));
          const deprecatedTable = createTable({
            head: ['变量名', '原因', '移除时间'],
          });

          for (const varName of deprecatedVars) {
            const dep = spec.deprecated![varName];
            deprecatedTable.push([
              varName,
              dep.reason,
              dep.removed_in,
            ]);
          }

          console.log(deprecatedTable.toString());
        }

        // 显示配置源信息
        if (spec.config_sources) {
          console.log(chalk.cyan('\n配置源:\n'));
          const sourceTable = createTable({
            head: ['环境', '主配置源', '路径'],
          });

          for (const [env, source] of Object.entries(spec.config_sources)) {
            sourceTable.push([
              env,
              source.primary,
              source.path || `${source.project}/${source.environment}${source.path || ''}`,
            ]);
          }

          console.log(sourceTable.toString());
        }

        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });
