export type DbType = 'postgres' | 'mysql' | 'mssql'

export interface Workspace {
  id: string
  name: string
  color?: string
}

export interface SshAuthPassword {
  method: 'password'
  password: string
}

export interface SshAuthPrivateKey {
  method: 'privateKey'
  privateKeyPath: string
  passphrase?: string
}

export interface SshAuthAgent {
  method: 'agent'
}

export type SshAuth = SshAuthPassword | SshAuthPrivateKey | SshAuthAgent

export interface SshHop {
  host: string
  port: number
  username: string
  auth: SshAuth
  /** Local command whose stdio becomes this hop's transport (ssh's ProxyCommand equivalent),
   *  e.g. "cloudflared access ssh --hostname %h". %h/%p are substituted with host/port. */
  proxyCommand?: string
}

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
  workspaceId: string
  sshHops?: SshHop[]
  dockerContainer?: string
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
      workspaces: {
        load: () => Promise<Workspace[]>
        save: (workspace: Workspace) => Promise<Workspace[]>
        delete: (id: string) => Promise<{ ok: boolean; reason?: string; workspaces: Workspace[] }>
      }
      connections: {
        load: () => Promise<ConnectionConfig[]>
        save: (config: ConnectionConfig) => Promise<ConnectionConfig[]>
        delete: (id: string) => Promise<ConnectionConfig[]>
        duplicate: (id: string) => Promise<ConnectionConfig[]>
        test: (config: ConnectionConfig) => Promise<void>
        connect: (config: ConnectionConfig) => Promise<void>
        disconnect: (id: string) => Promise<void>
      }
      system: {
        pickFile: () => Promise<string | null>
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
