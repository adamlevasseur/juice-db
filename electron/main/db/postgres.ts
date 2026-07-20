import { Pool } from 'pg'
import { ensureTunnel, closeTunnel, consumeRelayError, isTunnelAlive } from './tunnel'
import type { ConnectionConfig, DbDriver, QueryResult, SchemaTable, TableColumn } from './types'

export class PostgresDriver implements DbDriver {
  private pool: Pool | null = null

  constructor(private config: ConnectionConfig) {}

  async connect(): Promise<void> {
    const proxy = await ensureTunnel(this.config.id, this.config)
    this.pool = new Pool({
      host: proxy?.host ?? this.config.host,
      port: proxy?.port ?? this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000
    })
    this.pool.on('error', (err) => console.error('Postgres pool error:', err.message))
    try {
      await this.pool.query('SELECT 1')
    } catch (err) {
      throw this.augmentTunnelError(err, proxy !== null)
    }
  }

  async disconnect(): Promise<void> {
    await this.pool?.end()
    this.pool = null
    await closeTunnel(this.config.id)
  }

  async testConnection(): Promise<void> {
    const tunnelKey = `test:${this.config.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`
    const proxy = await ensureTunnel(tunnelKey, this.config)
    const pool = new Pool({
      host: proxy?.host ?? this.config.host,
      port: proxy?.port ?? this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000
    })
    try {
      await pool.query('SELECT 1')
    } catch (err) {
      throw this.augmentTunnelError(err, proxy !== null, tunnelKey)
    } finally {
      await pool.end()
      if (proxy) await closeTunnel(tunnelKey)
    }
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.pool) throw new Error('Not connected')
    const start = Date.now()
    try {
      const result = await this.pool.query(sql)
      return {
        columns: result.fields.map((f) => f.name),
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
        duration: Date.now() - start
      }
    } catch (err) {
      if (this.config.sshHops?.length && !isTunnelAlive(this.config.id)) {
        await this.disconnect()
      }
      throw err
    }
  }

  private augmentTunnelError(err: unknown, tunneled: boolean, key: string = this.config.id): Error {
    if (!tunneled) return err instanceof Error ? err : new Error(String(err))
    const relayError = consumeRelayError(key)
    if (relayError) return new Error(`SSH/Docker relay error: ${relayError}`)
    return err instanceof Error ? err : new Error(String(err))
  }

  async getDatabases(): Promise<string[]> {
    const result = await this.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
    )
    return result.rows.map((r) => r.datname as string)
  }

  async getTables(): Promise<SchemaTable[]> {
    const result = await this.query(`
      SELECT table_schema as schema, table_name as name,
        CASE table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END as type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name
    `)
    return result.rows as SchemaTable[]
  }

  async getColumns(table: string, schema = 'public'): Promise<TableColumn[]> {
    const result = await this.query(`
      SELECT
        c.column_name as name,
        c.data_type as "dataType",
        c.is_nullable = 'YES' as nullable,
        c.column_default as "defaultValue",
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = '${table}' AND tc.constraint_type = 'PRIMARY KEY'
            AND kcu.column_name = c.column_name
        ) as "isPrimaryKey"
      FROM information_schema.columns c
      WHERE c.table_name = '${table}' AND c.table_schema = '${schema}'
      ORDER BY c.ordinal_position
    `)
    return result.rows as TableColumn[]
  }
}
