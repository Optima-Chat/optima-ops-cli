import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle } from '../../utils/output.js';
import { selectPrompt } from '../../utils/prompt.js';

export const schemaGraphCommand = new Command('schema-graph')
  .description('生成数据库关系图')
  .option('--database <name>', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--format <format>', '输出格式 (json/mermaid)', 'json')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      let database = options.database;
      const format = options.format;

      // Select database if not specified
      if (!database) {
        const password = await getDatabasePassword(env, 'postgres');
        const client = new DatabaseClient(env, 'postgres', password);
        await client.connect();

        try {
          const databases = await client.listDatabases();
          await client.disconnect();

          const choices = databases.map(db => ({
            name: `${db.name} (${db.size})`,
            value: db.name,
          }));

          database = await selectPrompt('选择数据库:', choices);
        } catch (error) {
          await client.disconnect();
          throw error;
        }
      }

      if (!isJsonOutput()) {
        printTitle(`📊 数据库关系图 - ${database}`);
        console.log(chalk.gray('正在生成关系图...\\n'));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        // Get all tables
        const tables = await client.listTables();

        // Get relationships for all tables
        const nodes = tables.map(t => ({
          id: t.name,
          label: t.name,
          rows: t.rows,
          size: t.size,
        }));

        const edges: Array<{ from: string; to: string; label: string }> = [];

        for (const table of tables) {
          const relationships = await client.getTableRelationships(table.name);

          // Add edges for dependencies (this table -> depends on)
          for (const dep of relationships.dependencies) {
            edges.push({
              from: table.name,
              to: dep,
              label: 'depends on',
            });
          }
        }

        if (format === 'mermaid') {
          // Generate Mermaid diagram syntax
          const mermaid = generateMermaidDiagram(nodes, edges);

          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              database,
              format: 'mermaid',
              diagram: mermaid,
            });
          } else {
            console.log(chalk.cyan('Mermaid 关系图:'));
            console.log(chalk.gray('─'.repeat(80)));
            console.log(mermaid);
            console.log(chalk.gray('─'.repeat(80)));
            console.log();
            console.log(chalk.gray('💡 复制上面的代码到 Markdown 文件中查看'));
            console.log();
          }
        } else {
          // JSON format
          const graph = {
            nodes,
            edges,
            metadata: {
              database,
              table_count: nodes.length,
              relationship_count: edges.length,
            },
          };

          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              ...graph,
            });
          } else {
            console.log(JSON.stringify(graph, null, 2));
            console.log();
          }
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });

function generateMermaidDiagram(
  nodes: Array<{ id: string; label: string; rows: number; size: string }>,
  edges: Array<{ from: string; to: string; label: string }>
): string {
  const lines: string[] = [];

  lines.push('```mermaid');
  lines.push('erDiagram');

  // Add relationships
  for (const edge of edges) {
    // Format: TableA ||--o{ TableB : "label"
    lines.push(`    ${edge.from} ||--o{ ${edge.to} : "${edge.label}"`);
  }

  // Add table details
  for (const node of nodes) {
    lines.push(`    ${node.id} {`);
    lines.push(`        string name PK`);
    lines.push(`    }`);
  }

  lines.push('```');

  return lines.join('\n');
}
