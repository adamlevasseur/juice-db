import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'node:crypto'
import type { ConnectionConfig, Workspace } from './types'

interface StoreData {
  workspaces: Workspace[]
  connections: ConnectionConfig[]
  history: HistoryEntry[]
}

const DEFAULT_WORKSPACE: Workspace = { id: 'default', name: 'Default' }

export interface HistoryEntry {
  id: number
  connectionId: string
  sql: string
  duration: number | null
  rowCount: number | null
  error: string | null
  executedAt: number
}

let _dataDir: string | null = null
let _data: StoreData | null = null
let _nextId = 1

function dataDir(): string {
  if (!_dataDir) {
    _dataDir = join(app.getPath('userData'), 'juicedb')
    if (!existsSync(_dataDir)) mkdirSync(_dataDir, { recursive: true })
  }
  return _dataDir
}

function load(): StoreData {
  if (_data) return _data
  const file = join(dataDir(), 'data.json')
  let needsSave = false
  if (existsSync(file)) {
    try {
      _data = JSON.parse(readFileSync(file, 'utf-8'))
      // Find max history id
      const maxId = Math.max(0, ...(_data!.history ?? []).map((h) => h.id))
      _nextId = maxId + 1
    } catch {
      // corrupted file — start fresh
      _data = { workspaces: [], connections: [], history: [] }
    }
  } else {
    _data = { workspaces: [], connections: [], history: [] }
  }

  // Migration: ensure at least one workspace exists, and every connection belongs to one
  if (!_data!.workspaces || _data!.workspaces.length === 0) {
    _data!.workspaces = [DEFAULT_WORKSPACE]
    needsSave = true
  }
  const fallbackWorkspaceId = _data!.workspaces[0].id
  for (const c of _data!.connections) {
    if (!c.workspaceId) {
      c.workspaceId = fallbackWorkspaceId
      needsSave = true
    }
  }

  if (needsSave) save()
  return _data!
}

function save(): void {
  const file = join(dataDir(), 'data.json')
  writeFileSync(file, JSON.stringify(_data, null, 2))
}

export function loadWorkspaces(): Workspace[] {
  return load().workspaces
}

export function saveWorkspace(workspace: Workspace): void {
  const data = load()
  const idx = data.workspaces.findIndex((w) => w.id === workspace.id)
  if (idx >= 0) {
    data.workspaces[idx] = workspace
  } else {
    data.workspaces.push(workspace)
  }
  save()
}

export function deleteWorkspace(id: string): { ok: boolean; reason?: string } {
  const data = load()
  if (data.workspaces.length <= 1) {
    return { ok: false, reason: 'At least one workspace is required.' }
  }
  if (data.connections.some((c) => c.workspaceId === id)) {
    return { ok: false, reason: 'Move or delete this workspace\'s connections first.' }
  }
  data.workspaces = data.workspaces.filter((w) => w.id !== id)
  save()
  return { ok: true }
}

export function saveConnection(config: ConnectionConfig): void {
  const data = load()
  const idx = data.connections.findIndex((c) => c.id === config.id)
  if (idx >= 0) {
    data.connections[idx] = config
  } else {
    data.connections.push(config)
  }
  save()
}

export function loadConnections(): ConnectionConfig[] {
  return load().connections
}

export function deleteConnection(id: string): void {
  const data = load()
  data.connections = data.connections.filter((c) => c.id !== id)
  save()
}

export function duplicateConnection(id: string): ConnectionConfig | null {
  const data = load()
  const source = data.connections.find((c) => c.id === id)
  if (!source) return null

  const siblingNames = new Set(
    data.connections.filter((c) => c.workspaceId === source.workspaceId).map((c) => c.name)
  )
  let name = `${source.name} (copy)`
  let n = 2
  while (siblingNames.has(name)) {
    name = `${source.name} (copy ${n})`
    n++
  }

  const copy: ConnectionConfig = { ...source, id: randomUUID(), name }
  data.connections.push(copy)
  save()
  return copy
}

export function addHistory(entry: Omit<HistoryEntry, 'id' | 'executedAt'>): void {
  const data = load()
  data.history.unshift({
    ...entry,
    id: _nextId++,
    executedAt: Math.floor(Date.now() / 1000)
  })
  // Keep last 500 entries per connection
  const connEntries = data.history.filter((h) => h.connectionId === entry.connectionId)
  if (connEntries.length > 500) {
    const toRemove = connEntries.slice(500).map((h) => h.id)
    data.history = data.history.filter((h) => !toRemove.includes(h.id))
  }
  save()
}

export function getHistory(connectionId: string, limit = 100): HistoryEntry[] {
  return load()
    .history.filter((h) => h.connectionId === connectionId)
    .slice(0, limit)
}

export function clearHistory(connectionId: string): void {
  const data = load()
  data.history = data.history.filter((h) => h.connectionId !== connectionId)
  save()
}
