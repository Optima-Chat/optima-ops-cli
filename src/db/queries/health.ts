/**
 * Database health monitoring queries
 */

/**
 * Get connection statistics
 */
export const CONNECTIONS_QUERY = `
  SELECT
    datname AS database,
    usename AS user,
    state,
    COUNT(*) AS count
  FROM pg_stat_activity
  WHERE datname IS NOT NULL
  GROUP BY datname, usename, state
  ORDER BY count DESC
`;

/**
 * Get connection limits and current usage
 */
export const CONNECTION_LIMITS_QUERY = `
  SELECT
    (SELECT COUNT(*) FROM pg_stat_activity) AS current_connections,
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
    ROUND(
      (SELECT COUNT(*)::numeric FROM pg_stat_activity) /
      (SELECT setting::numeric FROM pg_settings WHERE name = 'max_connections') * 100,
      2
    ) AS usage_pct
`;

/**
 * Get cache hit ratio (overall)
 */
export const CACHE_HIT_RATIO_QUERY = `
  SELECT
    ROUND(
      sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit + heap_blks_read), 0) * 100,
      2
    ) AS cache_hit_ratio
  FROM pg_statio_user_tables
`;

/**
 * Get cache hit ratio by table
 */
export const CACHE_HIT_BY_TABLE_QUERY = `
  SELECT
    schemaname || '.' || tablename AS table_name,
    heap_blks_hit + heap_blks_read AS total_reads,
    CASE
      WHEN (heap_blks_hit + heap_blks_read) = 0 THEN NULL
      ELSE ROUND(heap_blks_hit::numeric / (heap_blks_hit + heap_blks_read) * 100, 2)
    END AS cache_hit_ratio
  FROM pg_statio_user_tables
  WHERE heap_blks_hit + heap_blks_read > 0
  ORDER BY total_reads DESC
  LIMIT 20
`;

/**
 * Get active locks
 */
export const LOCKS_QUERY = `
  SELECT
    pg_locks.locktype,
    pg_locks.database,
    pg_locks.relation::regclass AS relation,
    pg_locks.mode,
    pg_locks.granted,
    pg_stat_activity.pid,
    pg_stat_activity.usename,
    pg_stat_activity.query,
    pg_stat_activity.query_start
  FROM pg_locks
  JOIN pg_stat_activity ON pg_locks.pid = pg_stat_activity.pid
  WHERE NOT pg_locks.granted
  ORDER BY pg_stat_activity.query_start
`;

/**
 * Get blocking queries
 */
export const BLOCKING_QUERIES_QUERY = `
  SELECT
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocked_activity.query AS blocked_query,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocking_activity.query AS blocking_query,
    blocked_activity.application_name AS blocked_application
  FROM pg_catalog.pg_locks blocked_locks
  JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
  JOIN pg_catalog.pg_locks blocking_locks
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
  JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
  WHERE NOT blocked_locks.granted
`;

/**
 * Get slow queries (queries running longer than threshold)
 */
export function getSlowQueriesQuery(thresholdSeconds: number = 5): string {
  return `
    SELECT
      pid,
      usename,
      datname,
      state,
      query,
      NOW() - query_start AS duration,
      query_start
    FROM pg_stat_activity
    WHERE state != 'idle'
      AND query_start < NOW() - INTERVAL '${thresholdSeconds} seconds'
      AND query NOT LIKE '%pg_stat_activity%'
    ORDER BY query_start
  `;
}

/**
 * Get table bloat (dead tuples)
 */
export const TABLE_BLOAT_QUERY = `
  SELECT
    schemaname || '.' || tablename AS table_name,
    n_live_tup AS live_tuples,
    n_dead_tup AS dead_tuples,
    ROUND(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) AS bloat_pct,
    last_vacuum,
    last_autovacuum
  FROM pg_stat_user_tables
  WHERE n_dead_tup > 0
  ORDER BY n_dead_tup DESC
  LIMIT 20
`;

/**
 * Get index usage statistics
 */
export const INDEX_USAGE_QUERY = `
  SELECT
    schemaname || '.' || tablename AS table_name,
    indexrelname AS index_name,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
  FROM pg_stat_user_indexes
  ORDER BY idx_scan, pg_relation_size(indexrelid) DESC
`;

/**
 * Get unused indexes (never scanned)
 */
export const UNUSED_INDEXES_QUERY = `
  SELECT
    schemaname || '.' || tablename AS table_name,
    indexrelname AS index_name,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    idx_scan
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0
    AND indexrelname NOT LIKE '%_pkey'
  ORDER BY pg_relation_size(indexrelid) DESC
`;
