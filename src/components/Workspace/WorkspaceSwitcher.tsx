import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import type { Workspace } from '../../types'
import { PALETTE } from '../../lib/palette'
import styles from './WorkspaceSwitcher.module.css'

function WorkspaceEditRow({
  workspace,
  onDone
}: {
  workspace: Partial<Workspace> | Workspace
  onDone: () => void
}) {
  const { setWorkspaces, setActiveWorkspace } = useAppStore()
  const [name, setName] = useState(workspace.name ?? '')
  const [color, setColor] = useState(workspace.color ?? '')
  const isNew = !('id' in workspace) || !workspace.id

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const saved: Workspace = { id: (workspace as Workspace).id ?? crypto.randomUUID(), name: name.trim(), color }
    const updated = await window.api.workspaces.save(saved)
    setWorkspaces(updated)
    if (isNew) setActiveWorkspace(saved.id)
    onDone()
  }

  return (
    <form className={styles.editRow} onSubmit={handleSave}>
      <input
        className={styles.editInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Workspace name"
        autoFocus
      />
      <div className={styles.palette}>
        {PALETTE.map((p) => (
          <button
            key={p.label}
            type="button"
            title={p.label}
            className={`${styles.swatch} ${color === p.value ? styles.swatchSelected : ''}`}
            style={p.value ? { background: p.value } : undefined}
            onClick={() => setColor(p.value)}
          >
            {!p.value && <span className={styles.noColor}>×</span>}
          </button>
        ))}
      </div>
      <div className={styles.editActions}>
        <button type="button" onClick={onDone}>Cancel</button>
        <button type="submit" className={styles.saveBtn}>Save</button>
      </div>
    </form>
  )
}

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, setWorkspaces, setActiveWorkspace, connections } = useAppStore()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setEditingId(null)
        setCreating(false)
        setDeleteError(null)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const active = workspaces.find((w) => w.id === activeWorkspaceId)

  async function handleDelete(id: string) {
    const result = await window.api.workspaces.delete(id)
    setWorkspaces(result.workspaces)
    if (!result.ok) setDeleteError(result.reason ?? 'Could not delete workspace')
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        {active?.color && <span className={styles.dot} style={{ background: active.color }} />}
        <span className={styles.name}>{active?.name ?? 'Workspace'}</span>
        <span className={styles.arrow}>▾</span>
      </button>

      {open && (
        <div className={styles.popover}>
          {workspaces.map((w) =>
            editingId === w.id ? (
              <WorkspaceEditRow key={w.id} workspace={w} onDone={() => setEditingId(null)} />
            ) : (
              <div
                key={w.id}
                className={`${styles.row} ${w.id === activeWorkspaceId ? styles.rowActive : ''}`}
                onClick={() => { setActiveWorkspace(w.id); setOpen(false) }}
              >
                {w.color && <span className={styles.dot} style={{ background: w.color }} />}
                <span className={styles.rowName}>{w.name}</span>
                <span className={styles.count}>{connections.filter((c) => c.workspaceId === w.id).length}</span>
                <button
                  className={styles.iconBtn}
                  title="Rename / recolor"
                  onClick={(e) => { e.stopPropagation(); setEditingId(w.id); setDeleteError(null) }}
                >✎</button>
                <button
                  className={styles.iconBtn}
                  title="Delete workspace"
                  onClick={(e) => { e.stopPropagation(); handleDelete(w.id) }}
                >🗑</button>
              </div>
            )
          )}

          {deleteError && <div className={styles.error}>{deleteError}</div>}

          {creating ? (
            <WorkspaceEditRow workspace={{}} onDone={() => setCreating(false)} />
          ) : (
            <button className={styles.newBtn} onClick={() => setCreating(true)}>+ New Workspace</button>
          )}
        </div>
      )}
    </div>
  )
}
