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

export interface HistoryEntry {
  id: number
  connectionId: string
  sql: string
  duration: number | null
  rowCount: number | null
  error: string | null
  executedAt: number
}

export interface Tab {
  id: string
  connectionId: string
  title: string
  sql: string
  result: QueryResult | null
  error: string | null
  running: boolean
  userRenamed?: boolean
}

declare global {
  interface Window {
    api: {
      connections: {
        load: () => Promise<ConnectionConfig[]>
        save: (config: ConnectionConfig) => Promise<ConnectionConfig[]>
        delete: (id: string) => Promise<ConnectionConfig[]>
        test: (config: ConnectionConfig) => Promise<void>
        connect: (config: ConnectionConfig) => Promise<void>
        disconnect: (id: string) => Promise<void>
      }
      query: {
        run: (args: { connectionId: string; sql: string; config: ConnectionConfig }) => Promise<{ ok: true; result: QueryResult } | { ok: false; error: string }>
      }
      schema: {
        databases: (config: ConnectionConfig) => Promise<string[]>
        tables: (args: { config: ConnectionConfig; database?: string }) => Promise<SchemaTable[]>
        columns: (args: { config: ConnectionConfig; table: string; schema?: string }) => Promise<TableColumn[]>
      }
      history: {
        get: (connectionId: string) => Promise<HistoryEntry[]>
        clear: (connectionId: string) => Promise<void>
      }
    }
  }
}
