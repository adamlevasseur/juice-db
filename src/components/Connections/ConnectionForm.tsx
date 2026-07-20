import React, { useState } from 'react'
import type { ConnectionConfig, DbType, SshAuth, SshHop, Workspace } from '../../types'
import { PALETTE } from '../../lib/palette'
import styles from './ConnectionForm.module.css'

const DEFAULT_PORTS: Record<DbType, number> = {
  postgres: 5432,
  mysql: 3306,
  mssql: 1433
}

function newHop(): SshHop {
  return { host: '', port: 22, username: '', auth: { method: 'password', password: '' } }
}

interface Props {
  initial?: Partial<ConnectionConfig>
  workspaces: Workspace[]
  onSave: (config: ConnectionConfig) => void
  onCancel: () => void
}

export function ConnectionForm({ initial, workspaces, onSave, onCancel }: Props) {
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
    folder: initial?.folder ?? '',
    workspaceId: initial?.workspaceId ?? workspaces[0]?.id ?? '',
    sshHops: initial?.sshHops ?? [],
    dockerContainer: initial?.dockerContainer ?? ''
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [sshOpen, setSshOpen] = useState((initial?.sshHops?.length ?? 0) > 0)

  function field<K extends keyof typeof form>(key: K, val: typeof form[K]) {
    setForm((f) => {
      const next = { ...f, [key]: val }
      if (key === 'type') next.port = DEFAULT_PORTS[val as DbType]
      return next
    })
    setTestResult(null)
  }

  function updateHops(updater: (hops: SshHop[]) => SshHop[]) {
    setForm((f) => ({ ...f, sshHops: updater(f.sshHops ?? []) }))
    setTestResult(null)
  }

  function addHop() {
    updateHops((hops) => [...hops, newHop()])
    setSshOpen(true)
  }

  function removeHop(index: number) {
    updateHops((hops) => hops.filter((_, i) => i !== index))
  }

  function updateHop(index: number, patch: Partial<SshHop>) {
    updateHops((hops) => hops.map((h, i) => (i === index ? { ...h, ...patch } : h)))
  }

  function setHopAuthMethod(index: number, method: SshAuth['method']) {
    const auth: SshAuth =
      method === 'password'
        ? { method: 'password', password: '' }
        : method === 'privateKey'
          ? { method: 'privateKey', privateKeyPath: '' }
          : { method: 'agent' }
    updateHop(index, { auth })
  }

  function updateHopAuth(index: number, patch: Partial<SshAuth>) {
    updateHops((hops) =>
      hops.map((h, i) => (i === index ? { ...h, auth: { ...h.auth, ...patch } as SshAuth } : h))
    )
  }

  async function pickPrivateKey(index: number) {
    const path = await window.api.system.pickFile()
    if (path) updateHopAuth(index, { privateKeyPath: path })
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
      <div className={styles.formBody}>
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
        <label style={{ flex: 1 }}>
          Host{(form.sshHops?.length ?? 0) > 0 && (
            <span className={styles.hint}> (reachable from inside the container — usually localhost)</span>
          )}
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

      <label>Workspace
        <select value={form.workspaceId} onChange={(e) => field('workspaceId', e.target.value)}>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </label>

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

      <div>
        <button type="button" className={styles.sshToggle} onClick={() => setSshOpen((o) => !o)}>
          {sshOpen ? '▾' : '▸'} SSH Tunnel {form.sshHops?.length ? `(${form.sshHops.length} hop${form.sshHops.length > 1 ? 's' : ''})` : ''}
        </button>

        {sshOpen && (
          <div className={styles.sshSection}>
            <div className={styles.hint}>
              Connect through one or more SSH hops, then <code>docker exec</code> into a container to reach the database above.
            </div>

            {(form.sshHops ?? []).map((hop, i) => (
              <div key={i} className={styles.hopCard}>
                <div className={styles.hopHeader}>
                  <span>Hop {i + 1}</span>
                  <button type="button" className={styles.removeHopBtn} onClick={() => removeHop(i)} title="Remove hop">×</button>
                </div>

                <div className={styles.row}>
                  <label style={{ flex: 1 }}>Host
                    <input value={hop.host} onChange={(e) => updateHop(i, { host: e.target.value })} required />
                  </label>
                  <label style={{ width: 80 }}>Port
                    <input
                      type="number"
                      value={hop.port}
                      onChange={(e) => updateHop(i, { port: Number(e.target.value) })}
                      required
                    />
                  </label>
                </div>

                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={hop.proxyCommand !== undefined}
                    onChange={(e) => updateHop(i, { proxyCommand: e.target.checked ? '' : undefined })}
                  />
                  Use ProxyCommand <span className={styles.hint}>(Cloudflare Access, corporate SSO gateways, etc.)</span>
                </label>

                {hop.proxyCommand !== undefined && (
                  <label>Command <span className={styles.hint}>(%h and %p are replaced with this hop's host/port)</span>
                    <input
                      value={hop.proxyCommand}
                      onChange={(e) => updateHop(i, { proxyCommand: e.target.value })}
                      placeholder="cloudflared access ssh --hostname %h"
                    />
                  </label>
                )}

                <label>Username
                  <input value={hop.username} onChange={(e) => updateHop(i, { username: e.target.value })} required />
                </label>

                <label>Auth method
                  <select
                    value={hop.auth.method}
                    onChange={(e) => setHopAuthMethod(i, e.target.value as SshAuth['method'])}
                  >
                    <option value="password">Password</option>
                    <option value="privateKey">Private Key</option>
                    <option value="agent">SSH Agent</option>
                  </select>
                </label>

                {hop.auth.method === 'password' && (
                  <label>Password
                    <input
                      type="password"
                      value={hop.auth.password}
                      onChange={(e) => updateHopAuth(i, { password: e.target.value })}
                    />
                  </label>
                )}

                {hop.auth.method === 'privateKey' && (
                  <>
                    <label>Private key file
                      <div className={styles.row}>
                        <input value={hop.auth.privateKeyPath} readOnly placeholder="No file selected" style={{ flex: 1 }} />
                        <button type="button" className={styles.testBtn} onClick={() => pickPrivateKey(i)}>Browse…</button>
                      </div>
                    </label>
                    <label>Passphrase <span className={styles.hint}>(optional)</span>
                      <input
                        type="password"
                        value={hop.auth.passphrase ?? ''}
                        onChange={(e) => updateHopAuth(i, { passphrase: e.target.value })}
                      />
                    </label>
                  </>
                )}

                {hop.auth.method === 'agent' && (
                  <div className={styles.hint}>Uses the local SSH agent (SSH_AUTH_SOCK).</div>
                )}
              </div>
            ))}

            <button type="button" className={styles.addHopBtn} onClick={addHop}>+ Add Hop</button>

            {(form.sshHops?.length ?? 0) > 0 && (
              <label>Docker container
                <input
                  value={form.dockerContainer ?? ''}
                  onChange={(e) => field('dockerContainer', e.target.value)}
                  placeholder="e.g. my-postgres-container"
                  required
                />
              </label>
            )}
          </div>
        )}
      </div>

      {testResult && (
        <div className={testResult.ok ? styles.success : styles.error}>{testResult.msg}</div>
      )}
      </div>

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
