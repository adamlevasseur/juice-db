import { ipcMain } from 'electron'
import { createDriver, getOrCreateConnection, disconnect } from '../db'
import {
  saveConnection,
  loadConnections,
  deleteConnection,
  addHistory,
  getHistory,
  clearHistory,
  loadWorkspaces,
  saveWorkspace,
  deleteWorkspace
} from '../db/store'
import type { ConnectionConfig, Workspace } from '../db/types'

export function registerIpcHandlers(): void {
  // Workspaces
  ipcMain.handle('workspaces:load', () => loadWorkspaces())

  ipcMain.handle('workspaces:save', (_e, workspace: Workspace) => {
    saveWorkspace(workspace)
    return loadWorkspaces()
  })

  ipcMain.handle('workspaces:delete', (_e, id: string) => {
    const result = deleteWorkspace(id)
    return { ...result, workspaces: loadWorkspaces() }
  })

  // Connections
  ipcMain.handle('connections:load', () => loadConnections())

  ipcMain.handle('connections:save', (_e, config: ConnectionConfig) => {
    saveConnection(config)
    return loadConnections()
  })

  ipcMain.handle('connections:delete', (_e, id: string) => {
    disconnect(id).catch(() => {})
    deleteConnection(id)
    return loadConnections()
  })

  ipcMain.handle('connections:test', async (_e, config: ConnectionConfig) => {
    const driver = createDriver(config)
    await driver.testConnection()
  })

  ipcMain.handle('connections:connect', async (_e, config: ConnectionConfig) => {
    await getOrCreateConnection(config)
  })

  ipcMain.handle('connections:disconnect', async (_e, id: string) => {
    await disconnect(id)
  })

  // Queries
  ipcMain.handle('query:run', async (_e, { connectionId, sql, config }: { connectionId: string; sql: string; config: ConnectionConfig }) => {
    const driver = await getOrCreateConnection(config)
    try {
      const result = await driver.query(sql)
      addHistory({ connectionId, sql, duration: result.duration, rowCount: result.rowCount, error: null })
      return { ok: true, result }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      addHistory({ connectionId, sql, duration: null, rowCount: null, error: message })
      return { ok: false, error: message }
    }
  })

  // Schema
  ipcMain.handle('schema:databases', async (_e, config: ConnectionConfig) => {
    const driver = await getOrCreateConnection(config)
    return driver.getDatabases()
  })

  ipcMain.handle('schema:tables', async (_e, { config, database }: { config: ConnectionConfig; database?: string }) => {
    const driver = await getOrCreateConnection(config)
    return driver.getTables(database)
  })

  ipcMain.handle('schema:columns', async (_e, { config, table, schema }: { config: ConnectionConfig; table: string; schema?: string }) => {
    const driver = await getOrCreateConnection(config)
    return driver.getColumns(table, schema)
  })

  // History
  ipcMain.handle('history:get', (_e, connectionId: string) => getHistory(connectionId))
  ipcMain.handle('history:clear', (_e, connectionId: string) => {
    clearHistory(connectionId)
  })
}
