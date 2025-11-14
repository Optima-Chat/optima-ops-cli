import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printSection,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface DiskPartition {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  use_percent: string;
  mount_point: string;
}

interface DirectoryUsage {
  path: string;
  size: string;
  percentage?: string;
}

interface DiskInfo {
  environment: string;
  partitions: DiskPartition[];
  docker_usage?: {
    total_size: string;
    containers: DirectoryUsage[];
    images: DirectoryUsage[];
    volumes: DirectoryUsage[];
  };
  top_directories?: DirectoryUsage[];
  warnings: string[];
  cleanup_suggestions: string[];
}

export const diskCommand = new Command('disk')
  .description('查看磁盘使用情况')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .option('--details', '显示详细的目录使用情况')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const showDetails = options.details || false;

      if (!isJsonOutput()) {
        printTitle(`💾 磁盘使用情况 - ${env} 环境`);
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      const result: DiskInfo = {
        environment: env,
        partitions: [],
        warnings: [],
        cleanup_suggestions: [],
      };

      try {
        // 获取文件系统使用情况
        const dfResult = await ssh.executeCommand('df -h');
        const dfLines = dfResult.stdout.trim().split('\n');

        // 跳过表头
        for (let i = 1; i < dfLines.length; i++) {
          const line = dfLines[i]?.trim();
          if (!line) continue;

          const parts = line.split(/\s+/);
          if (parts.length >= 6) {
            // 只显示重要的文件系统
            const fs = parts[0];
            const mountPoint = parts[5];

            // 过滤掉临时文件系统和循环设备
            if (
              fs && mountPoint &&
              fs.startsWith('/dev/') &&
              !fs.startsWith('/dev/loop') &&
              (mountPoint === '/' || mountPoint === '/data' || mountPoint.startsWith('/mnt'))
            ) {
              const usePercent = parts[4]?.replace('%', '') || '0';
              result.partitions.push({
                filesystem: fs,
                size: parts[1] || '',
                used: parts[2] || '',
                available: parts[3] || '',
                use_percent: usePercent,
                mount_point: mountPoint,
              });

              // 检查使用率，生成警告
              const usage = parseInt(usePercent);
              if (usage >= 90) {
                result.warnings.push(`${mountPoint} 磁盘使用率达到 ${usePercent}%，严重不足`);
                result.cleanup_suggestions.push(`立即清理 ${mountPoint} 磁盘空间`);
              } else if (usage >= 85) {
                result.warnings.push(`${mountPoint} 磁盘使用率达到 ${usePercent}%，建议清理`);
                result.cleanup_suggestions.push(`考虑清理 ${mountPoint} 磁盘空间`);
              }
            }
          }
        }

        // 获取 Docker 数据使用情况（如果安装了 Docker）
        try {
          const dockerRoot = await ssh.executeCommand('docker info --format "{{.DockerRootDir}}"');
          const dockerRootDir = dockerRoot.stdout.trim() || '/var/lib/docker';

          result.docker_usage = {
            total_size: 'N/A',
            containers: [],
            images: [],
            volumes: [],
          };

          // Docker 总使用量
          try {
            const dockerSizeResult = await ssh.executeCommand(`du -sh ${dockerRootDir} 2>/dev/null | cut -f1`);
            result.docker_usage.total_size = dockerSizeResult.stdout.trim();
          } catch (error) {
            // 忽略权限错误
          }

          // 容器数据使用
          try {
            const containersResult = await ssh.executeCommand(
              `du -sh ${dockerRootDir}/containers/* 2>/dev/null | sort -rh | head -5 || echo ""`
            );
            if (containersResult.stdout.trim()) {
              const containerLines = containersResult.stdout.trim().split('\n');
              for (const line of containerLines) {
                const parts = line.split(/\s+/);
                if (parts.length >= 2 && parts[0] && parts[1]) {
                  const containerId = parts[1].split('/').pop() || '';
                  result.docker_usage.containers.push({
                    path: containerId.substring(0, 12),
                    size: parts[0],
                  });
                }
              }
            }
          } catch (error) {
            // 忽略
          }

          // 镜像使用
          try {
            const imagesResult = await ssh.executeCommand(
              `du -sh ${dockerRootDir}/image/overlay2/layerdb/sha256/* 2>/dev/null | sort -rh | head -5 || echo ""`
            );
            if (imagesResult.stdout.trim()) {
              const imageLines = imagesResult.stdout.trim().split('\n');
              for (const line of imageLines) {
                const parts = line.split(/\s+/);
                if (parts.length >= 2 && parts[0] && parts[1]) {
                  const layerId = parts[1].split('/').pop() || '';
                  result.docker_usage.images.push({
                    path: layerId.substring(0, 12),
                    size: parts[0],
                  });
                }
              }
            }
          } catch (error) {
            // 忽略
          }

          // 卷使用
          try {
            const volumesResult = await ssh.executeCommand(
              `du -sh ${dockerRootDir}/volumes/* 2>/dev/null | sort -rh | head -5 || echo ""`
            );
            if (volumesResult.stdout.trim()) {
              const volumeLines = volumesResult.stdout.trim().split('\n');
              for (const line of volumeLines) {
                const parts = line.split(/\s+/);
                if (parts.length >= 2 && parts[0] && parts[1]) {
                  const volumeName = parts[1].split('/').pop() || '';
                  result.docker_usage.volumes.push({
                    path: volumeName,
                    size: parts[0],
                  });
                }
              }
            }
          } catch (error) {
            // 忽略
          }
        } catch (error) {
          // Docker 未安装或权限不足
        }

        // 获取大目录（如果需要详细信息）
        if (showDetails) {
          try {
            const topDirsResult = await ssh.executeCommand(
              'du -sh /opt/* /data/* 2>/dev/null | sort -rh | head -10 || echo ""'
            );
            if (topDirsResult.stdout.trim()) {
              result.top_directories = [];
              const dirLines = topDirsResult.stdout.trim().split('\n');
              for (const line of dirLines) {
                const parts = line.split(/\s+/);
                if (parts.length >= 2 && parts[0] && parts[1]) {
                  result.top_directories.push({
                    path: parts[1],
                    size: parts[0],
                  });
                }
              }
            }
          } catch (error) {
            // 忽略
          }
        }
      } catch (error: any) {
        throw new Error(`获取磁盘信息失败: ${error.message}`);
      } finally {
        await ssh.disconnect();
      }

      // 生成清理建议
      if (result.warnings.length > 0) {
        result.cleanup_suggestions.push('docker system prune -a -f --volumes  # 清理未使用的 Docker 资源');
        result.cleanup_suggestions.push('journalctl --vacuum-time=7d  # 清理 7 天前的日志');
      }

      // 输出结果
      if (isJsonOutput()) {
        outputSuccess(result);
      } else {
        // 显示文件系统使用情况
        printSection('文件系统');
        const fsTable = new Table({
          head: ['文件系统', '大小', '已用', '可用', '使用率', '挂载点'],
          colWidths: [25, 10, 10, 10, 10, 15],
        });

        for (const partition of result.partitions) {
          const usage = parseInt(partition.use_percent);
          let usageDisplay = `${partition.use_percent}%`;
          if (usage >= 90) {
            usageDisplay = chalk.red(usageDisplay);
          } else if (usage >= 85) {
            usageDisplay = chalk.yellow(usageDisplay);
          } else {
            usageDisplay = chalk.green(usageDisplay);
          }

          fsTable.push([
            partition.filesystem,
            partition.size,
            partition.used,
            partition.available,
            usageDisplay,
            partition.mount_point,
          ]);
        }
        console.log(fsTable.toString());

        // 显示 Docker 使用情况
        if (result.docker_usage) {
          printSection('Docker 数据使用');
          console.log(chalk.white(`总使用量: ${chalk.cyan(result.docker_usage.total_size)}`));

          if (result.docker_usage.containers.length > 0) {
            console.log(chalk.white('\n最大容器 (Top 5):'));
            for (const container of result.docker_usage.containers) {
              console.log(`  ${container.size.padEnd(8)} ${chalk.gray(container.path)}`);
            }
          }

          if (result.docker_usage.images.length > 0) {
            console.log(chalk.white('\n最大镜像层 (Top 5):'));
            for (const image of result.docker_usage.images) {
              console.log(`  ${image.size.padEnd(8)} ${chalk.gray(image.path)}`);
            }
          }

          if (result.docker_usage.volumes.length > 0) {
            console.log(chalk.white('\n最大卷 (Top 5):'));
            for (const volume of result.docker_usage.volumes) {
              console.log(`  ${volume.size.padEnd(8)} ${chalk.gray(volume.path)}`);
            }
          }
        }

        // 显示大目录（详细模式）
        if (result.top_directories && result.top_directories.length > 0) {
          printSection('最大目录 (Top 10)');
          const dirTable = new Table({
            head: ['大小', '路径'],
            colWidths: [12, 60],
            wordWrap: true,
          });
          for (const dir of result.top_directories) {
            dirTable.push([dir.size, dir.path]);
          }
          console.log(dirTable.toString());
        }

        // 显示警告和建议
        if (result.warnings.length > 0) {
          console.log();
          console.log(chalk.red.bold('⚠️  警告:'));
          for (const warning of result.warnings) {
            console.log(chalk.red(`  - ${warning}`));
          }
        }

        if (result.cleanup_suggestions.length > 0) {
          console.log();
          console.log(chalk.yellow.bold('💡 清理建议:'));
          for (const suggestion of result.cleanup_suggestions) {
            console.log(chalk.gray(`  ${suggestion}`));
          }
        }

        // 提示
        if (!showDetails) {
          console.log();
          console.log(chalk.gray('💡 提示: 使用 --details 查看详细的目录使用情况'));
        }
      }
    } catch (error) {
      handleError(error);
    }
  });
