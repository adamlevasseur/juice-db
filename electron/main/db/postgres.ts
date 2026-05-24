import { Pool } from 'pg'
import type { ConnectionConfig, DbDriver, QueryResult, SchemaTable, TableColumn } from './types'

export class PostgresDriver implements DbDriver {
  private pool: Pool | null = null

  constructor(private config: ConnectionConfig) {}

  async connect(): Promise<void> {
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000
    })
    await this.pool.query('SELECT 1')
  }

  async disconnect(): Promise<void> {
    await this.pool?.end()
    this.pool = null
  }

  async testConnection(): Promise<void> {
    const pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000
    })
    try {
      await pool.query('SELECT 1')
    } finally {
      await pool.end()
    }
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.pool) throw new Error('Not connected')
    const start = Date.now()
    const result = await this.pool.query(sql)
    return {
      columns: result.fields.map((f) => f.name),
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      duration: Date.now() - start
    }
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
