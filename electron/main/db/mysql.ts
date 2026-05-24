import mysql from 'mysql2/promise'
import type { ConnectionConfig, DbDriver, QueryResult, SchemaTable, TableColumn } from './types'

export class MySQLDriver implements DbDriver {
  private pool: mysql.Pool | null = null

  constructor(private config: ConnectionConfig) {}

  async connect(): Promise<void> {
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 5,
      waitForConnections: true
    })
    await this.pool.query('SELECT 1')
  }

  async disconnect(): Promise<void> {
    await this.pool?.end()
    this.pool = null
  }

  async testConnection(): Promise<void> {
    const conn = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      connectTimeout: 5000
    })
    try {
      await conn.query('SELECT 1')
    } finally {
      await conn.end()
    }
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.pool) throw new Error('Not connected')
    const start = Date.now()
    const [rows, fields] = await this.pool.query({ sql, rowsAsArray: false })
    const rowArray = Array.isArray(rows) ? rows : []
    return {
      columns: Array.isArray(fields) ? fields.map((f) => f.name) : [],
      rows: rowArray as Record<string, unknown>[],
      rowCount: rowArray.length,
      duration: Date.now() - start
    }
  }

  async getDatabases(): Promise<string[]> {
    const result = await this.query('SHOW DATABASES')
    return result.rows.map((r) => Object.values(r)[0] as string)
  }

  async getTables(database?: string): Promise<SchemaTable[]> {
    const db = database ?? this.config.database
    const result = await this.query(`
      SELECT table_schema as \`schema\`, table_name as name,
        CASE table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END as type
      FROM information_schema.tables
      WHERE table_schema = '${db}'
      ORDER BY table_name
    `)
    return result.rows as SchemaTable[]
  }

  async getColumns(table: string, schema?: string): Promise<TableColumn[]> {
    const db = schema ?? this.config.database
    const result = await this.query(`
      SELECT
        column_name as name,
        data_type as dataType,
        is_nullable = 'YES' as nullable,
        column_default as defaultValue,
        column_key = 'PRI' as isPrimaryKey
      FROM information_schema.columns
      WHERE table_name = '${table}' AND table_schema = '${db}'
      ORDER BY ordinal_position
    `)
    return result.rows as TableColumn[]
  }
}
