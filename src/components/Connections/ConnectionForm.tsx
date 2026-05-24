import React, { useState } from 'react'
import type { ConnectionConfig, DbType } from '../../types'
import styles from './ConnectionForm.module.css'

const DEFAULT_PORTS: Record<DbType, number> = {
  postgres: 5432,
  mysql: 3306,
  mssql: 1433
}

const PALETTE = [
  { label: 'None', value: '' },
  { label: 'Red', value: '#f38ba8' },
  { label: 'Orange', value: '#fab387' },
  { label: 'Yellow', value: '#f9e2af' },
  { label: 'Green', value: '#a6e3a1' },
  { label: 'Blue', value: '#89b4fa' },
  { label: 'Purple', value: '#cba6f7' },
  { label: 'Teal', value: '#94e2d5' },
  { label: 'Pink', value: '#f5c2e7' },
]

interface Props {
  initial?: Partial<ConnectionConfig>
  onSave: (config: ConnectionConfig) => void
  onCancel: () => void
}

export function ConnectionForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Omit<ConnectionConfig, 'id'>>({
    name: initial?.name ?? '',
    type: initial?.type ?? 'postgres',
    host: initial?.host ?? 'localhost',
    port: initial?.port ?? DEFAULT_PORTS[initial?.type ?? 'postgres'],
    database: initial?.database ?? '',
    username: initial?.username ?? '',
    password: initial?.password ?? '',
    ssl: initial?.ssl ?? false,
    color: initial?.color ?? '',
    folder: initial?.folder ?? ''
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function field<K extends keyof typeof form>(key: K, val: typeof form[K]) {
    setForm((f) => {
      const next = { ...f, [key]: val }
      if (key === 'type') next.port = DEFAULT_PORTS[val as DbType]
      return next
    })
    setTestResult(null)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      await window.api.connections.test({ ...form, id: initial?.id ?? 'test' })
      setTestResult({ ok: true, msg: 'Connection successful' })
    } catch (e: unknown) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({ ...form, id: initial?.id ?? crypto.randomUUID() })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2>{initial?.id ? 'Edit Connection' : 'New Connection'}</h2>

      <label>Name
        <input value={form.name} onChange={(e) => field('name', e.target.value)} required placeholder="My DB" />
      </label>

      <label>Type
        <select value={form.type} onChange={(e) => field('type', e.target.value as DbType)}>
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
          <option value="mssql">SQL Server</option>
        </select>
      </label>

      <div className={styles.row}>
        <label style={{ flex: 1 }}>Host
          <input value={form.host} onChange={(e) => field('host', e.target.value)} required />
        </label>
        <label style={{ width: 90 }}>Port
          <input type="number" value={form.port} onChange={(e) => field('port', Number(e.target.value))} required />
        </label>
      </div>

      <label>Database
        <input value={form.database} onChange={(e) => field('database', e.target.value)} required />
      </label>

      <div className={styles.row}>
        <label style={{ flex: 1 }}>Username
          <input value={form.username} onChange={(e) => field('username', e.target.value)} required />
        </label>
        <label style={{ flex: 1 }}>Password
          <input type="password" value={form.password} onChange={(e) => field('password', e.target.value)} />
        </label>
      </div>

      <label>Folder <span className={styles.hint}>(group connections together)</span>
        <input
          value={form.folder ?? ''}
          onChange={(e) => field('folder', e.target.value)}
          placeholder="e.g. Production, Development"
        />
      </label>

      <div>
        <div className={styles.paletteLabel}>Color <span className={styles.hint}>(shown when this connection is active)</span></div>
        <div className={styles.palette}>
          {PALETTE.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              title={label}
              className={`${styles.swatch} ${form.color === value ? styles.swatchSelected : ''}`}
              style={value ? { background: value } : undefined}
              onClick={() => field('color', value)}
            >
              {!value && <span className={styles.noColor}>×</span>}
            </button>
          ))}
        </div>
      </div>

      <label className={styles.checkbox}>
        <input type="checkbox" checked={!!form.ssl} onChange={(e) => field('ssl', e.target.checked)} />
        Use SSL
      </label>

      {testResult && (
        <div className={testResult.ok ? styles.success : styles.error}>{testResult.msg}</div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.testBtn} onClick={handleTest} disabled={testing}>
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn}>Save</button>
      </div>
    </form>
  )
}
