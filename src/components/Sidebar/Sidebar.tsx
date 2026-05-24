import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../store'
import { ConnectionForm } from '../Connections/ConnectionForm'
import type { ConnectionConfig, SchemaTable, TableColumn } from '../../types'
import styles from './Sidebar.module.css'

const DB_ICONS: Record<string, string> = { postgres: 'PG', mysql: 'MY', mssql: 'MS' }

function ColIcon({ isPrimaryKey }: { isPrimaryKey: boolean }) {
  return <span className={isPrimaryKey ? styles.pk : styles.col}>{isPrimaryKey ? '🔑' : '·'}</span>
}

function TableNode({
  table,
  config,
  indent
}: {
  table: SchemaTable
  config: ConnectionConfig
  indent: number
}) {
  const [open, setOpen] = useState(false)
  const [columns, setColumns] = useState<TableColumn[]>([])
  const [loaded, setLoaded] = useState(false)
  const { openTab, setActiveTab, tabs } = useAppStore()

  async function toggle() {
    if (!open && !loaded) {
      const cols = await window.api.schema.columns({ config, table: table.name, schema: table.schema })
      setColumns(cols)
      setLoaded(true)
    }
    setOpen((o) => !o)
  }

  async function handleDoubleClick() {
    let cols = columns
    if (!loaded) {
      cols = await window.api.schema.columns({ config, table: table.name, schema: table.schema })
      setColumns(cols)
      setLoaded(true)
    }
    const schema = table.schema
    const colList = cols.map((c) => `  ${c.name}`).join(',\n')
    const from = `${schema ? `${schema}.` : ''}${table.name}`
    const sql = `SELECT\n${colList}\nFROM ${from}\nLIMIT 1000;`
    const existing = tabs.find((t) => t.connectionId === config.id && t.sql === sql)
    if (existing) {
      setActiveTab(existing.id)
    } else {
      const parts = [config.database, schema, table.name].filter(Boolean)
      const tabTitle = parts.join('.')
      openTab(config.id, sql, tabTitle)
    }
  }

  return (
    <>
      <div
        className={styles.treeRow}
        style={{ paddingLeft: indent * 12 + 8 }}
        onClick={toggle}
        onDoubleClick={handleDoubleClick}
        title="Double-click to query"
      >
        <span className={styles.tableArrow}>{open ? '▾' : '▸'}</span>
        <span className={table.type === 'view' ? styles.viewIcon : styles.tableIcon}>
          {table.type === 'view' ? 'V' : 'T'}
        </span>
        <span className={styles.label}>{table.name}</span>
        {table.schema && table.schema !== 'public' && table.schema !== 'dbo' && (
          <span className={styles.badge}>{table.schema}</span>
        )}
      </div>
      {open && columns.map((col) => (
        <div key={col.name} className={styles.treeRow} style={{ paddingLeft: (indent + 1) * 12 + 8 }}>
          <ColIcon isPrimaryKey={col.isPrimaryKey} />
          <span className={styles.label}>{col.name}</span>
          <span className={styles.type}>{col.dataType}</span>
        </div>
      ))}
    </>
  )
}

function ConnectionNode({
  config,
  onEdit
}: {
  config: ConnectionConfig
  onEdit: (c: ConnectionConfig) => void
}) {
  const { activeConnectionId, setActiveConnection, openTab } = useAppStore()
  const [open, setOpen] = useState(false)
  const [tables, setTables] = useState<SchemaTable[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isActive = activeConnectionId === config.id

  async function toggle() {
    if (!open) {
      setLoading(true)
      setError(null)
      try {
        await window.api.connections.connect(config)
        const t = await window.api.schema.tables({ config })
        setTables(t)
        setActiveConnection(config.id)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
    setOpen((o) => !o)
  }

  function handleNewQuery() {
    setActiveConnection(config.id)
    openTab(config.id)
  }

  return (
    <>
      <div
        className={`${styles.connRow} ${isActive ? styles.active : ''}`}
        onClick={toggle}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(config) }}
        title="Click to expand · Double-click to edit"
      >
        {config.color && <span className={styles.colorSwatch} style={{ background: config.color }} />}
        <span className={styles.arrow}>{open ? '▾' : '▸'}</span>
        <span className={styles.dbBadge}>{DB_ICONS[config.type]}</span>
        <span className={styles.connName}>{config.name}</span>
        {loading && <span className={styles.spinner}>↻</span>}
        <button
          className={styles.newQueryBtn}
          title="New query"
          onClick={(e) => { e.stopPropagation(); handleNewQuery() }}
        >+</button>
      </div>
      {error && <div className={styles.errorMsg} style={{ paddingLeft: 28 }}>{error}</div>}
      {open && !loading && tables.map((t) => (
        <TableNode key={`${t.schema}.${t.name}`} table={t} config={config} indent={1} />
      ))}
    </>
  )
}

function FolderNode({
  name,
  connections,
  onEdit
}: {
  name: string
  connections: ConnectionConfig[]
  onEdit: (c: ConnectionConfig) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <>
      <div className={styles.folderRow} onClick={() => setOpen((o) => !o)}>
        <span className={styles.folderArrow}>{open ? '▾' : '▸'}</span>
        <span className={styles.folderIcon}>📁</span>
        <span className={styles.folderName}>{name}</span>
        <span className={styles.folderCount}>{connections.length}</span>
      </div>
      {open && connections.map((c) => (
        <div key={c.id} className={styles.folderIndent}>
          <ConnectionNode config={c} onEdit={onEdit} />
        </div>
      ))}
    </>
  )
}

export function Sidebar() {
  const { connections, setConnections } = useAppStore()
  const [showForm, setShowForm] = useState(false)
  const [editConn, setEditConn] = useState<ConnectionConfig | null>(null)

  useEffect(() => {
    window.api.connections.load().then(setConnections)
  }, [])

  async function handleSave(config: ConnectionConfig) {
    const updated = await window.api.connections.save(config)
    setConnections(updated)
    setShowForm(false)
    setEditConn(null)
  }

  function handleEdit(c: ConnectionConfig) {
    setEditConn(c)
  }

  // Group connections: those with a folder go into folder groups; others stay at root
  const folderMap = new Map<string, ConnectionConfig[]>()
  const rootConns: ConnectionConfig[] = []

  for (const c of connections) {
    if (c.folder?.trim()) {
      const key = c.folder.trim()
      if (!folderMap.has(key)) folderMap.set(key, [])
      folderMap.get(key)!.push(c)
    } else {
      rootConns.push(c)
    }
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.title}>Connections</span>
        <button className={styles.addBtn} onClick={() => setShowForm(true)} title="New connection">+</button>
      </div>

      <div className={styles.tree}>
        {connections.length === 0 && (
          <div className={styles.empty}>No connections yet.<br />Click + to add one.</div>
        )}

        {/* Folder groups */}
        {[...folderMap.entries()].map(([name, conns]) => (
          <FolderNode key={name} name={name} connections={conns} onEdit={handleEdit} />
        ))}

        {/* Root-level connections (no folder) */}
        {rootConns.map((c) => (
          <ConnectionNode key={c.id} config={c} onEdit={handleEdit} />
        ))}
      </div>

      {(showForm || editConn) && (
        <div className={styles.overlay}>
          <ConnectionForm
            initial={editConn ?? undefined}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditConn(null) }}
          />
        </div>
      )}
    </div>
  )
}
