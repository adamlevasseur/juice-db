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

export interface DbDriver {
  connect(): Promise<void>
  disconnect(): Promise<void>
  query(sql: string): Promise<QueryResult>
  getDatabases(): Promise<string[]>
  getTables(database?: string): Promise<SchemaTable[]>
  getColumns(table: string, schema?: string): Promise<TableColumn[]>
  testConnection(): Promise<void>
}
