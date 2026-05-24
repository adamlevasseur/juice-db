export type DbType = 'postgres' | 'mysql' | 'mssql'

export interface ConnectionConfig {
  id: string
  name: string
  type: DbType
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl?: boolean
  color?: string
  folder?: string
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  duration: number
}

export interface SchemaTable {
  schema: string
  name: string
  type: 'table' | 'view'
}

export interface TableColumn {
  name: string
  dataType: string
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
}

export interface DbDriver {
  connect(): Promise<void>
  disconnect(): Promise<void>
  query(sql: string): Promise<QueryResult>
  getDatabases(): Promise<string[]>
  getTables(database?: string): Promise<SchemaTable[]>
  getColumns(table: string, schema?: string): Promise<TableColumn[]>
  testConnection(): Promise<void>
}
