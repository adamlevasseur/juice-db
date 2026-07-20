import { contextBridge, ipcRenderer } from 'electron'

const api = {
  workspaces: {
    load: () => ipcRenderer.invoke('workspaces:load'),
    save: (workspace: unknown) => ipcRenderer.invoke('workspaces:save', workspace),
    delete: (id: string) => ipcRenderer.invoke('workspaces:delete', id)
  },
  connections: {
    load: () => ipcRenderer.invoke('connections:load'),
    save: (config: unknown) => ipcRenderer.invoke('connections:save', config),
    delete: (id: string) => ipcRenderer.invoke('connections:delete', id),
    duplicate: (id: string) => ipcRenderer.invoke('connections:duplicate', id),
    test: (config: unknown) => ipcRenderer.invoke('connections:test', config),
    connect: (config: unknown) => ipcRenderer.invoke('connections:connect', config),
    disconnect: (id: string) => ipcRenderer.invoke('connections:disconnect', id)
  },
  query: {
    run: (args: unknown) => ipcRenderer.invoke('query:run', args)
  },
  schema: {
    databases: (config: unknown) => ipcRenderer.invoke('schema:databases', config),
    tables: (args: unknown) => ipcRenderer.invoke('schema:tables', args),
    columns: (args: unknown) => ipcRenderer.invoke('schema:columns', args)
  },
  history: {
    get: (connectionId: string) => ipcRenderer.invoke('history:get', connectionId),
    clear: (connectionId: string) => ipcRenderer.invoke('history:clear', connectionId)
  },
  system: {
    pickFile: () => ipcRenderer.invoke('dialog:pickFile')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
