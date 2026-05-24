"use strict";
const electron = require("electron");
const api = {
  connections: {
    load: () => electron.ipcRenderer.invoke("connections:load"),
    save: (config) => electron.ipcRenderer.invoke("connections:save", config),
    delete: (id) => electron.ipcRenderer.invoke("connections:delete", id),
    test: (config) => electron.ipcRenderer.invoke("connections:test", config),
    connect: (config) => electron.ipcRenderer.invoke("connections:connect", config),
    disconnect: (id) => electron.ipcRenderer.invoke("connections:disconnect", id)
  },
  query: {
    run: (args) => electron.ipcRenderer.invoke("query:run", args)
  },
  schema: {
    databases: (config) => electron.ipcRenderer.invoke("schema:databases", config),
    tables: (args) => electron.ipcRenderer.invoke("schema:tables", args),
    columns: (args) => electron.ipcRenderer.invoke("schema:columns", args)
  },
  history: {
    get: (connectionId) => electron.ipcRenderer.invoke("history:get", connectionId),
    clear: (connectionId) => electron.ipcRenderer.invoke("history:clear", connectionId)
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
