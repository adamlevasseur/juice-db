import React from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import type { ColDef } from 'ag-grid-community'
import { useAppStore } from '../../store'
import styles from './ResultsGrid.module.css'

interface Props { tabId: string }

export function ResultsGrid({ tabId }: Props) {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId))

  if (!tab) return null

  if (tab.running) {
    return <div className={styles.state}>Running query…</div>
  }

  if (tab.error) {
    return (
      <div className={styles.error}>
        <div className={styles.errorTitle}>Query Error</div>
        <pre className={styles.errorMsg}>{tab.error}</pre>
      </div>
    )
  }

  if (!tab.result) {
    return <div className={styles.state}>Run a query to see results</div>
  }

  const { columns, rows } = tab.result

  const colDefs: ColDef[] = columns.map((col) => ({
    field: col,
    headerName: col,
    sortable: true,
    resizable: true,
    filter: true,
    editable: true,
    cellDataType: false,
    valueFormatter: (p) => {
      if (p.value === null) return 'NULL'
      if (p.value instanceof Date) return p.value.toISOString()
      if (typeof p.value === 'object') return JSON.stringify(p.value)
      return String(p.value)
    }
  }))

  return (
    <div className={`${styles.grid} ag-theme-alpine-dark`}>
      <AgGridReact
        rowData={rows}
        columnDefs={colDefs}
        defaultColDef={{ minWidth: 80, flex: 1 }}
        rowSelection="multiple"
        enableCellTextSelection
        suppressMenuHide
        animateRows={false}
      />
    </div>
  )
}
