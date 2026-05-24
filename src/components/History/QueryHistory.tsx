import React, { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import type { HistoryEntry } from '../../types'
import styles from './QueryHistory.module.css'

export function QueryHistory() {
  const { activeConnectionId, openTab, connections } = useAppStore()
  const [history, setHistory] = useState<HistoryEntry[]>([])

  useEffect(() => {
    if (!activeConnectionId) return
    window.api.history.get(activeConnectionId).then(setHistory)
  }, [activeConnectionId])

  async function handleClear() {
    if (!activeConnectionId) return
    await window.api.history.clear(activeConnectionId)
    setHistory([])
  }

  function handleRerun(entry: HistoryEntry) {
    openTab(entry.connectionId, entry.sql)
  }

  if (!activeConnectionId) {
    return <div className={styles.empty}>Select a connection to see history</div>
  }

  const connName = connections.find((c) => c.id === activeConnectionId)?.name

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>Query History</span>
        {connName && <span className={styles.conn}>{connName}</span>}
        <button className={styles.clearBtn} onClick={handleClear}>Clear</button>
      </div>
      <div className={styles.list}>
        {history.length === 0 && <div className={styles.empty}>No history yet</div>}
        {history.map((entry) => (
          <div key={entry.id} className={`${styles.entry} ${entry.error ? styles.err : ''}`}>
            <pre className={styles.sql}>{entry.sql.length > 200 ? entry.sql.slice(0, 200) + '…' : entry.sql}</pre>
            <div className={styles.entryMeta}>
              <span>{new Date(entry.executedAt * 1000).toLocaleTimeString()}</span>
              {entry.duration != null && <span>{entry.duration}ms</span>}
              {entry.rowCount != null && <span>{entry.rowCount} rows</span>}
              {entry.error && <span className={styles.errTag}>Error</span>}
              <button className={styles.rerunBtn} onClick={() => handleRerun(entry)}>Rerun</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
