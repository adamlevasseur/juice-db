import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { ConnectionConfig } from './types'

interface StoreData {
  connections: ConnectionConfig[]
  history: HistoryEntry[]
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
  if (existsSync(file)) {
    try {
      _data = JSON.parse(readFileSync(file, 'utf-8'))
      // Find max history id
      const maxId = Math.max(0, ...(_data!.history ?? []).map((h) => h.id))
      _nextId = maxId + 1
      return _data!
    } catch {
      // corrupted file — start fresh
    }
  }
  _data = { connections: [], history: [] }
  return _data
}

function save(): void {
  const file = join(dataDir(), 'data.json')
  writeFileSync(file, JSON.stringify(_data, null, 2))
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
