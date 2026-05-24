import { PostgresDriver } from './postgres'
import { MySQLDriver } from './mysql'
import { MSSQLDriver } from './mssql'
import type { ConnectionConfig, DbDriver } from './types'

const activeConnections = new Map<string, DbDriver>()

export function createDriver(config: ConnectionConfig): DbDriver {
  switch (config.type) {
    case 'postgres': return new PostgresDriver(config)
    case 'mysql': return new MySQLDriver(config)
    case 'mssql': return new MSSQLDriver(config)
  }
}

export async function getOrCreateConnection(config: ConnectionConfig): Promise<DbDriver> {
  const existing = activeConnections.get(config.id)
  if (existing) return existing
  const driver = createDriver(config)
  await driver.connect()
  activeConnections.set(config.id, driver)
  return driver
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...activeConnections.values()].map((d) => d.disconnect()))
  activeConnections.clear()
}

export async function disconnect(id: string): Promise<void> {
  const driver = activeConnections.get(id)
  if (driver) {
    await driver.disconnect()
    activeConnections.delete(id)
  }
}

export { createDriver as testConnection }
export type { ConnectionConfig, DbDriver }
