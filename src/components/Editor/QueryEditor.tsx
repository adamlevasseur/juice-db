import React, { useRef, useCallback, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useAppStore } from '../../store'
import { DangerModal } from './DangerModal'
import styles from './QueryEditor.module.css'

function getDangerMessage(sql: string): string | null {
  const stripped = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const statements = stripped.split(';').map((s) => s.trim()).filter(Boolean)
  for (const stmt of statements) {
    if (/^\s*TRUNCATE\b/i.test(stmt))
      return 'TRUNCATE will permanently delete all rows in the table.'
    if (/^\s*DROP\b/i.test(stmt))
      return 'DROP will permanently delete the database object and cannot be undone.'
    if (/^\s*DELETE\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt))
      return 'DELETE without a WHERE clause will permanently delete every row in the table.'
    if (/^\s*UPDATE\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt))
      return 'UPDATE without a WHERE clause will overwrite every row in the table.'
  }
  return null
}

interface Props {
  tabId: string
}

export function QueryEditor({ tabId }: Props) {
  const { tabs, connections, updateTabSql, setTabResult, setTabRunning } = useAppStore()
  const tab = tabs.find((t) => t.id === tabId)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const runRef = useRef<() => void>(() => {})
  const [dangerState, setDangerState] = useState<{ message: string; sql: string; config: import('../../types').ConnectionConfig } | null>(null)

  const executeQuery = useCallback(async (sql: string, config: import('../../types').ConnectionConfig) => {
    setTabRunning(tabId, true)
    const res = await window.api.query.run({ connectionId: config.id, sql, config })
    if (res.ok) {
      setTabResult(tabId, res.result, null)
    } else {
      setTabResult(tabId, null, res.error)
    }
  }, [tabId, setTabRunning, setTabResult])

  const runQuery = useCallback(async () => {
    const currentTab = useAppStore.getState().tabs.find((t) => t.id === tabId)
    const currentConns = useAppStore.getState().connections
    if (!currentTab || currentTab.running) return
    const config = currentConns.find((c) => c.id === currentTab.connectionId)
    if (!config) return

    const editor = editorRef.current
    let sql = currentTab.sql
    if (editor) {
      const selection = editor.getSelection()
      if (selection && !selection.isEmpty()) {
        sql = editor.getModel()?.getValueInRange(selection) ?? sql
      }
    }
    if (!sql.trim()) return

    const dangerMsg = getDangerMessage(sql)
    if (dangerMsg) {
      setDangerState({ message: dangerMsg, sql, config })
      return
    }

    await executeQuery(sql, config)
  }, [tabId, executeQuery])

  runRef.current = runQuery

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => runRef.current()
    )
  }

  if (!tab) return null

  const config = connections.find((c) => c.id === tab.connectionId)

  return (
    <div className={styles.wrap}>
      {dangerState && (
        <DangerModal
          message={dangerState.message}
          onCancel={() => setDangerState(null)}
          onConfirm={() => {
            const { sql, config: cfg } = dangerState
            setDangerState(null)
            executeQuery(sql, cfg)
          }}
        />
      )}
      <div className={styles.toolbar}>
        <button
          className={styles.runBtn}
          onClick={() => runRef.current()}
          disabled={!config || tab.running}
          title="Run query (Cmd+Enter)"
        >
          {tab.running ? '↻ Running…' : '▶ Run'}
        </button>
        {config && <span className={styles.connLabel}>{config.name}</span>}
        {tab.result && (
          <span className={styles.meta}>{tab.result.rowCount} rows · {tab.result.duration}ms</span>
        )}
        {tab.error && <span className={styles.errLabel} title={tab.error}>Error</span>}
      </div>

      <Editor
        height="100%"
        language="sql"
        value={tab.sql}
        onChange={(val) => updateTabSql(tabId, val ?? '')}
        onMount={handleMount}
        theme="vs-dark"
        options={{
          fontSize: 13,
          fontFamily: 'JetBrains Mono, Cascadia Code, Fira Code, Menlo, monospace',
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderLineHighlight: 'gutter',
          padding: { top: 12 },
          wordWrap: 'on',
          automaticLayout: true,
          suggestOnTriggerCharacters: true,
          quickSuggestions: { other: true, comments: false, strings: false }
        }}
      />
    </div>
  )
}
