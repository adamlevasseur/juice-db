import { create } from 'zustand'
import type { ConnectionConfig, Tab, QueryResult, Workspace } from '../types'

interface AppState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  tabs: Tab[]
  activeTabId: string | null
  sidebarWidth: number

  setWorkspaces: (workspaces: Workspace[]) => void
  setActiveWorkspace: (id: string) => void

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

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  connections: [],
  activeConnectionId: null,
  tabs: [],
  activeTabId: null,
  sidebarWidth: 240,

  setWorkspaces: (workspaces) =>
    set((s) => ({
      workspaces,
      activeWorkspaceId:
        s.activeWorkspaceId && workspaces.some((w) => w.id === s.activeWorkspaceId)
          ? s.activeWorkspaceId
          : (workspaces[0]?.id ?? null)
    })),

  setActiveWorkspace: (id) => {
    const { tabs, connections, activeTabId, activeConnectionId } = get()
    const workspaceOf = (connectionId: string) =>
      connections.find((c) => c.id === connectionId)?.workspaceId
    const visibleTabs = tabs.filter((t) => workspaceOf(t.connectionId) === id)
    const activeTabStillVisible = visibleTabs.some((t) => t.id === activeTabId)
    set({
      activeWorkspaceId: id,
      activeTabId: activeTabStillVisible ? activeTabId : (visibleTabs[visibleTabs.length - 1]?.id ?? null),
      activeConnectionId:
        activeConnectionId && workspaceOf(activeConnectionId) === id ? activeConnectionId : null
    })
  },

  setConnections: (connections) => set({ connections }),
  setActiveConnection: (id) => set({ activeConnectionId: id }),

  openTab: (connectionId, sql = '', title) =>
    set((s) => {
      const tab = newTab(connectionId, sql, title)
      return { tabs: [...s.tabs, tab], activeTabId: tab.id }
    }),

  closeTab: (id) =>
    set((s) => {
      const closed = s.tabs.find((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (s.activeTabId === id) {
        const workspaceId = closed
          ? s.connections.find((c) => c.id === closed.connectionId)?.workspaceId
          : s.activeWorkspaceId
        const candidates = tabs.filter(
          (t) => s.connections.find((c) => c.id === t.connectionId)?.workspaceId === workspaceId
        )
        activeTabId = candidates[candidates.length - 1]?.id ?? null
      }
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
