import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Sidebar } from './components/Sidebar/Sidebar'
import { QueryEditor } from './components/Editor/QueryEditor'
import { ResultsGrid } from './components/Results/ResultsGrid'
import { QueryHistory } from './components/History/QueryHistory'
import { WorkspaceSwitcher } from './components/Workspace/WorkspaceSwitcher'
import { useAppStore } from './store'
import styles from './App.module.css'

type RightPanel = 'results' | 'history'

export default function App() {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    openTab,
    activeConnectionId,
    activeWorkspaceId,
    workspaces,
    setWorkspaces,
    connections,
    renameTab
  } = useAppStore()
  const [rightPanel, setRightPanel] = useState<RightPanel>('results')
  const [splitPct, setSplitPct] = useState(55)
  const [sidebarWidth, setSidebarWidth] = useAppStore((s) => [s.sidebarWidth, s.setSidebarWidth])
  const dragging = useRef<'sidebar' | 'split' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Tab inline rename state
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    window.api.workspaces.load().then(setWorkspaces)
  }, [])

  const onMouseDown = useCallback((handle: 'sidebar' | 'split') => {
    dragging.current = handle
  }, [])

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (dragging.current === 'sidebar') {
        setSidebarWidth(Math.max(160, Math.min(400, e.clientX - rect.left)))
      } else {
        const pct = ((e.clientY - rect.top) / rect.height) * 100
        setSplitPct(Math.max(20, Math.min(80, pct)))
      }
    },
    [setSidebarWidth]
  )

  const onMouseUp = useCallback(() => {
    dragging.current = null
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  function getConnectionColor(connectionId: string): string | undefined {
    return connections.find((c) => c.id === connectionId)?.color || undefined
  }

  function startRename(tab: { id: string; title: string }, e: React.MouseEvent) {
    e.stopPropagation()
    setRenamingTabId(tab.id)
    setRenameValue(tab.title)
  }

  function commitRename() {
    if (renamingTabId && renameValue.trim()) {
      renameTab(renamingTabId, renameValue.trim())
    }
    setRenamingTabId(null)
  }

  const activeColor = activeTab ? getConnectionColor(activeTab.connectionId) : undefined
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const visibleTabs = tabs.filter(
    (t) => connections.find((c) => c.id === t.connectionId)?.workspaceId === activeWorkspaceId
  )

  return (
    <div className={styles.appRoot}>
      {/* Workspace banner — top-most row, doubles as the window drag region */}
      <div
        className={styles.workspaceBanner}
        style={activeWorkspace?.color ? { background: `color-mix(in srgb, ${activeWorkspace.color} 16%, var(--bg-panel))` } : undefined}
      >
        <WorkspaceSwitcher />
      </div>

      <div
        className={styles.app}
        ref={containerRef}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Sidebar */}
        <div className={styles.sidebar} style={{ width: sidebarWidth }}>
          <Sidebar />
        </div>

        {/* Sidebar resize handle */}
        <div className={styles.resizeH} onMouseDown={() => onMouseDown('sidebar')} />

        {/* Main area */}
        <div className={styles.main}>
          {/* Connection color stripe — visible strip showing the active connection's color */}
          <div
            className={styles.colorStripe}
            style={{ background: activeColor ?? 'transparent', opacity: activeColor ? 1 : 0 }}
          />

          {/* Tab bar */}
          <div className={styles.tabBar}>
          {visibleTabs.map((tab) => {
            const color = getConnectionColor(tab.connectionId)
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                style={isActive && color ? ({ '--tab-accent': color } as React.CSSProperties) : undefined}
                onClick={() => setActiveTab(tab.id)}
              >
                {color && (
                  <span className={styles.tabColorDot} style={{ background: color }} />
                )}
                {renamingTabId === tab.id ? (
                  <input
                    className={styles.tabRenameInput}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenamingTabId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span
                    className={styles.tabTitle}
                    onDoubleClick={(e) => startRename(tab, e)}
                    title="Double-click to rename"
                  >
                    {tab.title}
                  </span>
                )}
                <button
                  className={styles.tabClose}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
          {activeConnectionId && (
            <button
              className={styles.newTab}
              onClick={() => openTab(activeConnectionId)}
              title="New tab"
            >
              +
            </button>
          )}
        </div>

        {/* Editor + Results split */}
        {activeTab ? (
          <div
            className={styles.split}
            style={activeColor ? { borderTop: `3px solid ${activeColor}` } : undefined}
          >
            {/* Editor */}
            <div className={styles.editorPane} style={{ height: `${splitPct}%` }}>
              <QueryEditor tabId={activeTab.id} />
            </div>

            {/* Split drag handle */}
            <div className={styles.resizeV} onMouseDown={() => onMouseDown('split')} />

            {/* Bottom panel */}
            <div className={styles.bottomPane} style={{ height: `${100 - splitPct}%` }}>
              <div className={styles.panelTabs}>
                <button
                  className={rightPanel === 'results' ? styles.panelTabActive : styles.panelTab}
                  onClick={() => setRightPanel('results')}
                >
                  Results
                </button>
                <button
                  className={rightPanel === 'history' ? styles.panelTabActive : styles.panelTab}
                  onClick={() => setRightPanel('history')}
                >
                  History
                </button>
              </div>
              <div className={styles.panelContent}>
                {rightPanel === 'results' ? (
                  <ResultsGrid tabId={activeTab.id} />
                ) : (
                  <QueryHistory />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.welcome}>
            <div className={styles.welcomeText}>
              <h1>JuiceDB</h1>
              <p>Select a connection in the sidebar and click + to open a query tab.</p>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
