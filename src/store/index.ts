import { create } from 'zustand'
import type { ConnectionConfig, Tab, QueryResult } from '../types'

interface AppState {
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  tabs: Tab[]
  activeTabId: string | null
  sidebarWidth: number

  setConnections: (conns: ConnectionConfig[]) => void
  setActiveConnection: (id: string | null) => void

  openTab: (connectionId: string, sql?: string, title?: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabSql: (id: string, sql: string) => void
  setTabResult: (id: string, result: QueryResult | null, error: string | null) => void
  setTabRunning: (id: string, running: boolean) => void
  renameTab: (id: string, title: string) => void

  setSidebarWidth: (w: number) => void
}

let tabCounter = 0

function newTab(connectionId: string, sql = '', title?: string): Tab {
  tabCounter++
  return {
    id: `tab-${tabCounter}`,
    connectionId,
    title: title ?? `Query ${tabCounter}`,
    sql,
    result: null,
    error: null,
    running: false,
    userRenamed: !!title
  }
}

export const useAppStore = create<AppState>((set) => ({
  connections: [],
  activeConnectionId: null,
  tabs: [],
  activeTabId: null,
  sidebarWidth: 240,

  setConnections: (connections) => set({ connections }),
  setActiveConnection: (id) => set({ activeConnectionId: id }),

  openTab: (connectionId, sql = '', title) =>
    set((s) => {
      const tab = newTab(connectionId, sql, title)
      return { tabs: [...s.tabs, tab], activeTabId: tab.id }
    }),

  closeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeTabId =
        s.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId
      return { tabs, activeTabId }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabSql: (id, sql) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, sql } : t)) })),

  setTabResult: (id, result, error) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, result, error, running: false } : t)) })),

  setTabRunning: (id, running) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, running } : t)) })),

  renameTab: (id, title) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title, userRenamed: true } : t)) })),

  setSidebarWidth: (w) => set({ sidebarWidth: w })
}))
