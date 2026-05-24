import sql from 'mssql'
import type { ConnectionConfig, DbDriver, QueryResult, SchemaTable, TableColumn } from './types'

export class MSSQLDriver implements DbDriver {
  private pool: sql.ConnectionPool | null = null

  constructor(private config: ConnectionConfig) {}

  private buildConfig(): sql.config {
    return {
      server: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      options: {
        encrypt: this.config.ssl ?? false,
        trustServerCertificate: !this.config.ssl,
        connectTimeout: 5000
      },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
    }
  }

  async connect(): Promise<void> {
    this.pool = await new sql.ConnectionPool(this.buildConfig()).connect()
  }

  async disconnect(): Promise<void> {
    await this.pool?.close()
    this.pool = null
  }

  async testConnection(): Promise<void> {
    const pool = await new sql.ConnectionPool(this.buildConfig()).connect()
    await pool.close()
  }

  async query(sqlStr: string): Promise<QueryResult> {
    if (!this.pool) throw new Error('Not connected')
    const start = Date.now()
    const result = await this.pool.request().query(sqlStr)
    const columns = result.recordset?.columns
      ? Object.keys(result.recordset.columns)
      : []
    return {
      columns,
      rows: result.recordset ?? [],
      rowCount: result.rowsAffected?.[0] ?? result.recordset?.length ?? 0,
      duration: Date.now() - start
    }
  }

  async getDatabases(): Promise<string[]> {
    const result = await this.query('SELECT name FROM sys.databases ORDER BY name')
    return result.rows.map((r) => r.name as string)
  }

  async getTables(): Promise<SchemaTable[]> {
    const result = await this.query(`
      SELECT TABLE_SCHEMA as [schema], TABLE_NAME as name,
        CASE TABLE_TYPE WHEN 'VIEW' THEN 'view' ELSE 'table' END as type
      FROM INFORMATION_SCHEMA.TABLES
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `)
    return result.rows as SchemaTable[]
  }

  async getColumns(table: string, schema = 'dbo'): Promise<TableColumn[]> {
    const result = await this.query(`
      SELECT
        c.COLUMN_NAME as name,
        c.DATA_TYPE as dataType,
        CASE c.IS_NULLABLE WHEN 'YES' THEN 1 ELSE 0 END as nullable,
        c.COLUMN_DEFAULT as defaultValue,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as isPrimaryKey
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.TABLE_NAME = '${table}' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ) pk ON pk.COLUMN_NAME = c.COLUMN_NAME
      WHERE c.TABLE_NAME = '${table}' AND c.TABLE_SCHEMA = '${schema}'
      ORDER BY c.ORDINAL_POSITION
    `)
    return result.rows.map((r) => ({ ...r, nullable: !!r.nullable, isPrimaryKey: !!r.isPrimaryKey })) as TableColumn[]
  }
}
