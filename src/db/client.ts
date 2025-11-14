import { Client, ClientConfig } from 'pg';
import { Environment } from '../utils/config.js';
import { DatabaseError } from '../utils/error.js';
import { getDatabaseUser } from './password.js';
import { SSHTunnel } from './tunnel.js';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  executionTime: number;
}

export class DatabaseClient {
  private client: Client | null = null;
  private tunnel: SSHTunnel | null = null;
  private connected: boolean = false;

  constructor(
    private readonly env: Environment,
    private readonly database: string,
    private readonly password: string
  ) {}

  /**
   * Connect to the database
   * Automatically establishes SSH tunnel to private RDS
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Establish SSH tunnel first
      this.tunnel = new SSHTunnel(this.env);
      const localPort = await this.tunnel.connect();

      // Connect to database through tunnel
      const connectionString = this.getConnectionString(localPort);

      const config: ClientConfig = {
        connectionString,
        statement_timeout: 30000, // 30 seconds
        query_timeout: 30000,
        idle_in_transaction_session_timeout: 60000, // 1 minute
        application_name: 'optima-ops-cli',
        ssl: {
          rejectUnauthorized: false, // RDS uses self-signed cert through SSH tunnel
        },
      };

      this.client = new Client(config);
      await this.client.connect();
      this.connected = true;
    } catch (error: any) {
      // Clean up tunnel if connection failed
      if (this.tunnel) {
        await this.tunnel.disconnect();
        this.tunnel = null;
      }

      throw new DatabaseError(
        `无法连接到数据库 ${this.database}: ${error.message}`,
        { database: this.database, env: this.env, error: error.message }
      );
    }
  }

  /**
   * Disconnect from the database and close SSH tunnel
   */
  async disconnect(): Promise<void> {
    if (!this.connected && !this.tunnel) return;

    try {
      if (this.client) {
        await this.client.end();
        this.client = null;
      }
    } catch (error) {
      // Ignore disconnection errors
    }

    try {
      if (this.tunnel) {
        await this.tunnel.disconnect();
        this.tunnel = null;
      }
    } catch (error) {
      // Ignore tunnel close errors
    }

    this.connected = false;
  }

  /**
   * Execute a read-only query (enforces READ ONLY transaction)
   */
  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.connected || !this.client) {
      throw new DatabaseError('Database not connected. Call connect() first.');
    }

    const startTime = Date.now();

    try {
      // Force READ ONLY transaction
      await this.client.query('BEGIN TRANSACTION READ ONLY');

      const result = await this.client.query(sql, params);

      await this.client.query('COMMIT');

      const executionTime = Date.now() - startTime;

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
        executionTime,
      };
    } catch (error: any) {
      await this.client.query('ROLLBACK').catch(() => {});
      throw new DatabaseError(`查询执行失败: ${error.message}`, {
        sql: sql.substring(0, 100) + '...',
        error: error.message,
      });
    }
  }

  /**
   * Get list of all databases
   */
  async listDatabases(): Promise<
    Array<{ name: string; size: string; owner: string }>
  > {
    const { rows } = await this.query(`
      SELECT
        datname AS name,
        pg_size_pretty(pg_database_size(datname)) AS size,
        pg_catalog.pg_get_userbyid(datdba) AS owner
      FROM pg_database
      WHERE datistemplate = false
        AND datname NOT IN ('postgres', 'rdsadmin')
      ORDER BY pg_database_size(datname) DESC
    `);
    return rows;
  }

  /**
   * Get database information
   */
  async getDatabaseInfo(): Promise<{
    database: string;
    size: string;
    table_count: number;
    active_connections: number;
  }> {
    const sizeQuery = await this.query<{ size: string }>(`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size
    `);

    const tablesQuery = await this.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const connectionsQuery = await this.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);

    return {
      database: this.database,
      size: sizeQuery.rows[0]?.size || '0 bytes',
      table_count: parseInt(tablesQuery.rows[0]?.count || '0'),
      active_connections: parseInt(connectionsQuery.rows[0]?.count || '0'),
    };
  }

  /**
   * List all tables in the current database
   */
  async listTables(): Promise<
    Array<{
      name: string;
      size: string;
      rows: number;
      last_vacuum: string | null;
    }>
  > {
    const { rows } = await this.query(`
      SELECT
        tablename AS name,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        n_live_tup AS rows,
        last_vacuum
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);
    return rows;
  }

  /**
   * Describe table structure (columns, indexes, foreign keys)
   */
  async describeTable(tableName: string): Promise<{
    columns: any[];
    indexes: any[];
    foreign_keys: any[];
  }> {
    // Get columns
    const columns = await this.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    // Get indexes
    const indexes = await this.query(`
      SELECT
        indexname,
        indexdef,
        pg_size_pretty(pg_relation_size(indexrelid)) AS size
      FROM pg_indexes
      JOIN pg_stat_user_indexes ON pg_indexes.indexname = pg_stat_user_indexes.indexrelname
      WHERE schemaname = 'public' AND tablename = $1
    `, [tableName]);

    // Get foreign keys
    const foreignKeys = await this.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
    `, [tableName]);

    return {
      columns: columns.rows,
      indexes: indexes.rows,
      foreign_keys: foreignKeys.rows,
    };
  }

  /**
   * Get table relationships (dependencies and dependents)
   */
  async getTableRelationships(tableName: string): Promise<{
    dependencies: string[];
    dependents: string[];
  }> {
    // Tables this table depends on (foreign keys point to)
    const dependencies = await this.query<{ depends_on: string }>(`
      SELECT DISTINCT ccu.table_name AS depends_on
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
        AND ccu.table_name != $1
    `, [tableName]);

    // Tables that depend on this table (foreign keys from other tables)
    const dependents = await this.query<{ dependent: string }>(`
      SELECT DISTINCT tc.table_name AS dependent
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_name = $1
        AND tc.table_name != $1
    `, [tableName]);

    return {
      dependencies: dependencies.rows.map(r => r.depends_on),
      dependents: dependents.rows.map(r => r.dependent),
    };
  }

  /**
   * Sample data from a table (uses TABLESAMPLE for large tables)
   */
  async sampleTable(tableName: string, limit: number = 100): Promise<any[]> {
    const { rows } = await this.query(`
      SELECT * FROM ${tableName}
      TABLESAMPLE BERNOULLI(1)
      LIMIT $1
    `, [limit]);

    return rows;
  }

  /**
   * Get connection string for the database
   */
  private getConnectionString(localPort: number): string {
    const dbUser = getDatabaseUser(this.database, this.env);

    return `postgresql://${dbUser}:${this.password}@127.0.0.1:${localPort}/${this.database}`;
  }
}
