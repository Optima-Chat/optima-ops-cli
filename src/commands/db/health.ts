import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, printKeyValue } from '../../utils/output.js';
import {
  CONNECTION_LIMITS_QUERY,
  CACHE_HIT_RATIO_QUERY,
  TABLE_BLOAT_QUERY,
  getSlowQueriesQuery,
} from '../../db/queries/health.js';

export const healthCommand = new Command('health')
  .description('数据库综合健康检查')
  .option('--database <name>', '数据库名称（默认检查所有）')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const database = options.database || 'postgres';

      if (!isJsonOutput()) {
        printTitle(`🏥 数据库健康检查 - ${env} 环境`);
        console.log(chalk.gray('正在执行健康检查...\\n'));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        // 1. Connection limits
        const connectionLimits = await client.query<{
          current_connections: number;
          max_connections: number;
          usage_pct: number;
        }>(CONNECTION_LIMITS_QUERY);

        const connData = connectionLimits.rows[0];
        if (!connData) {
          throw new Error('无法获取连接限制信息');
        }

        const connStatus =
          connData.usage_pct < 80
            ? 'ok'
            : connData.usage_pct < 90
            ? 'warning'
            : 'critical';

        // 2. Cache hit ratio
        const cacheHitResult = await client.query<{ cache_hit_ratio: number }>(
          CACHE_HIT_RATIO_QUERY
        );

        const cacheHitRatio = cacheHitResult.rows[0]?.cache_hit_ratio || 0;
        const cacheStatus =
          cacheHitRatio >= 99 ? 'ok' : cacheHitRatio >= 95 ? 'warning' : 'critical';

        // 3. Slow queries
        const slowQueriesResult = await client.query(getSlowQueriesQuery(5));
        const slowQueriesCount = slowQueriesResult.rowCount;

        // 4. Table bloat
        const bloatResult = await client.query(TABLE_BLOAT_QUERY);
        const avgBloat =
          bloatResult.rows.length > 0
            ? bloatResult.rows.reduce((sum, r) => sum + (r.bloat_pct || 0), 0) /
              bloatResult.rows.length
            : 0;
        const bloatStatus = avgBloat < 10 ? 'ok' : avgBloat < 20 ? 'warning' : 'critical';

        // Determine overall status
        const criticalCount = [connStatus, cacheStatus, bloatStatus].filter(
          s => s === 'critical'
        ).length;
        const warningCount = [connStatus, cacheStatus, bloatStatus].filter(
          s => s === 'warning'
        ).length;

        const overallStatus =
          criticalCount > 0 ? 'critical' : warningCount > 0 ? 'degraded' : 'healthy';

        // Collect issues
        const issues: string[] = [];
        if (connStatus !== 'ok') {
          issues.push(`连接数使用率过高: ${connData.usage_pct}%`);
        }
        if (cacheStatus !== 'ok') {
          issues.push(`缓存命中率过低: ${cacheHitRatio}%`);
        }
        if (slowQueriesCount > 0) {
          issues.push(`检测到 ${slowQueriesCount} 个慢查询`);
        }
        if (bloatStatus !== 'ok') {
          issues.push(`表膨胀率较高: 平均 ${avgBloat.toFixed(2)}%`);
        }

        const result = {
          environment: env,
          database,
          status: overallStatus,
          metrics: {
            connections: {
              current: connData.current_connections,
              max: connData.max_connections,
              percentage: connData.usage_pct,
              status: connStatus,
            },
            cache_hit_ratio: {
              value: cacheHitRatio,
              target: 99.0,
              status: cacheStatus,
            },
            slow_queries: {
              count: slowQueriesCount,
              threshold: '5s',
            },
            bloat: {
              average_pct: parseFloat(avgBloat.toFixed(2)),
              affected_tables: bloatResult.rowCount,
              status: bloatStatus,
            },
          },
          issues,
        };

        if (isJsonOutput()) {
          outputSuccess(result);
        } else {
          // Print status with color
          const statusColor =
            overallStatus === 'healthy'
              ? chalk.green
              : overallStatus === 'degraded'
              ? chalk.yellow
              : chalk.red;

          console.log(
            statusColor(`状态: ${overallStatus.toUpperCase()}`) + '\\n'
          );

          console.log(chalk.cyan('连接数:'));
          printKeyValue(
            '  当前/最大',
            `${connData.current_connections}/${connData.max_connections} (${connData.usage_pct}%)`,
            1
          );
          printKeyValue(
            '  状态',
            connStatus === 'ok'
              ? chalk.green('正常')
              : connStatus === 'warning'
              ? chalk.yellow('警告')
              : chalk.red('危险'),
            1
          );

          console.log(chalk.cyan('\\n缓存命中率:'));
          printKeyValue('  命中率', `${cacheHitRatio}%`, 1);
          printKeyValue(
            '  状态',
            cacheStatus === 'ok'
              ? chalk.green('优秀')
              : cacheStatus === 'warning'
              ? chalk.yellow('一般')
              : chalk.red('差'),
            1
          );

          console.log(chalk.cyan('\\n慢查询:'));
          printKeyValue('  数量', slowQueriesCount.toString(), 1);

          console.log(chalk.cyan('\\n表膨胀:'));
          printKeyValue('  平均膨胀率', `${avgBloat.toFixed(2)}%`, 1);
          printKeyValue('  影响表数', bloatResult.rowCount.toString(), 1);

          if (issues.length > 0) {
            console.log(chalk.yellow('\\n⚠️  问题:'));
            issues.forEach(issue => console.log(chalk.yellow(`  • ${issue}`)));
          } else {
            console.log(chalk.green('\\n✓ 所有指标正常'));
          }

          console.log();
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
