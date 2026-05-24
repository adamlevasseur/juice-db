"use strict";
const electron = require("electron");
const path = require("path");
const pg = require("pg");
const mysql = require("mysql2/promise");
const sql = require("mssql");
const fs = require("fs");
class PostgresDriver {
  constructor(config) {
    this.config = config;
  }
  pool = null;
  async connect() {
    this.pool = new pg.Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 3e4
    });
    await this.pool.query("SELECT 1");
  }
  async disconnect() {
    await this.pool?.end();
    this.pool = null;
  }
  async testConnection() {
    const pool = new pg.Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5e3
    });
    try {
      await pool.query("SELECT 1");
    } finally {
      await pool.end();
    }
  }
  async query(sql2) {
    if (!this.pool) throw new Error("Not connected");
    const start = Date.now();
    const result = await this.pool.query(sql2);
    return {
      columns: result.fields.map((f) => f.name),
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      duration: Date.now() - start
    };
  }
  async getDatabases() {
    const result = await this.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
    );
    return result.rows.map((r) => r.datname);
  }
  async getTables() {
    const result = await this.query(`
      SELECT table_schema as schema, table_name as name,
        CASE table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END as type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name
    `);
    return result.rows;
  }
  async getColumns(table, schema = "public") {
    const result = await this.query(`
      SELECT
        c.column_name as name,
        c.data_type as "dataType",
        c.is_nullable = 'YES' as nullable,
        c.column_default as "defaultValue",
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = '${table}' AND tc.constraint_type = 'PRIMARY KEY'
            AND kcu.column_name = c.column_name
        ) as "isPrimaryKey"
      FROM information_schema.columns c
      WHERE c.table_name = '${table}' AND c.table_schema = '${schema}'
      ORDER BY c.ordinal_position
    `);
    return result.rows;
  }
}
class MySQLDriver {
  constructor(config) {
    this.config = config;
  }
  pool = null;
  async connect() {
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : void 0,
      connectionLimit: 5,
      waitForConnections: true
    });
    await this.pool.query("SELECT 1");
  }
  async disconnect() {
    await this.pool?.end();
    this.pool = null;
  }
  async testConnection() {
    const conn = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : void 0,
      connectTimeout: 5e3
    });
    try {
      await conn.query("SELECT 1");
    } finally {
      await conn.end();
    }
  }
  async query(sql2) {
    if (!this.pool) throw new Error("Not connected");
    const start = Date.now();
    const [rows, fields] = await this.pool.query({ sql: sql2, rowsAsArray: false });
    const rowArray = Array.isArray(rows) ? rows : [];
    return {
      columns: Array.isArray(fields) ? fields.map((f) => f.name) : [],
      rows: rowArray,
      rowCount: rowArray.length,
      duration: Date.now() - start
    };
  }
  async getDatabases() {
    const result = await this.query("SHOW DATABASES");
    return result.rows.map((r) => Object.values(r)[0]);
  }
  async getTables(database) {
    const db = database ?? this.config.database;
    const result = await this.query(`
      SELECT table_schema as \`schema\`, table_name as name,
        CASE table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END as type
      FROM information_schema.tables
      WHERE table_schema = '${db}'
      ORDER BY table_name
    `);
    return result.rows;
  }
  async getColumns(table, schema) {
    const db = schema ?? this.config.database;
    const result = await this.query(`
      SELECT
        column_name as name,
        data_type as dataType,
        is_nullable = 'YES' as nullable,
        column_default as defaultValue,
        column_key = 'PRI' as isPrimaryKey
      FROM information_schema.columns
      WHERE table_name = '${table}' AND table_schema = '${db}'
      ORDER BY ordinal_position
    `);
    return result.rows;
  }
}
class MSSQLDriver {
  constructor(config) {
    this.config = config;
  }
  pool = null;
  buildConfig() {
    return {
      server: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      options: {
        encrypt: this.config.ssl ?? false,
        trustServerCertificate: !this.config.ssl,
        connectTimeout: 5e3
      },
      pool: { max: 5, min: 0, idleTimeoutMillis: 3e4 }
    };
  }
  async connect() {
    this.pool = await new sql.ConnectionPool(this.buildConfig()).connect();
  }
  async disconnect() {
    await this.pool?.close();
    this.pool = null;
  }
  async testConnection() {
    const pool = await new sql.ConnectionPool(this.buildConfig()).connect();
    await pool.close();
  }
  async query(sqlStr) {
    if (!this.pool) throw new Error("Not connected");
    const start = Date.now();
    const result = await this.pool.request().query(sqlStr);
    const columns = result.recordset?.columns ? Object.keys(result.recordset.columns) : [];
    return {
      columns,
      rows: result.recordset ?? [],
      rowCount: result.rowsAffected?.[0] ?? result.recordset?.length ?? 0,
      duration: Date.now() - start
    };
  }
  async getDatabases() {
    const result = await this.query("SELECT name FROM sys.databases ORDER BY name");
    return result.rows.map((r) => r.name);
  }
  async getTables() {
    const result = await this.query(`
      SELECT TABLE_SCHEMA as [schema], TABLE_NAME as name,
        CASE TABLE_TYPE WHEN 'VIEW' THEN 'view' ELSE 'table' END as type
      FROM INFORMATION_SCHEMA.TABLES
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    return result.rows;
  }
  async getColumns(table, schema = "dbo") {
    const result = await this.query(`
      SELECT
        c.COLUMN_NAME as name,
        c.DATA_TYPE as dataType,
        CASE c.IS_NULLABLE WHEN 'YES' THEN 1 ELSE 0 END as nullable,
        c.COLUMN_DEFAULT as defaultValue,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as isPrimaryKey
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.TABLE_NAME = '${table}' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ) pk ON pk.COLUMN_NAME = c.COLUMN_NAME
      WHERE c.TABLE_NAME = '${table}' AND c.TABLE_SCHEMA = '${schema}'
      ORDER BY c.ORDINAL_POSITION
    `);
    return result.rows.map((r) => ({ ...r, nullable: !!r.nullable, isPrimaryKey: !!r.isPrimaryKey }));
  }
}
const activeConnections = /* @__PURE__ */ new Map();
function createDriver(config) {
  switch (config.type) {
    case "postgres":
      return new PostgresDriver(config);
    case "mysql":
      return new MySQLDriver(config);
    case "mssql":
      return new MSSQLDriver(config);
  }
}
async function getOrCreateConnection(config) {
  const existing = activeConnections.get(config.id);
  if (existing) return existing;
  const driver = createDriver(config);
  await driver.connect();
  activeConnections.set(config.id, driver);
  return driver;
}
async function disconnect(id) {
  const driver = activeConnections.get(id);
  if (driver) {
    await driver.disconnect();
    activeConnections.delete(id);
  }
}
let _dataDir = null;
let _data = null;
let _nextId = 1;
function dataDir() {
  if (!_dataDir) {
    _dataDir = path.join(electron.app.getPath("userData"), "juicedb");
    if (!fs.existsSync(_dataDir)) fs.mkdirSync(_dataDir, { recursive: true });
  }
  return _dataDir;
}
function load() {
  if (_data) return _data;
  const file = path.join(dataDir(), "data.json");
  if (fs.existsSync(file)) {
    try {
      _data = JSON.parse(fs.readFileSync(file, "utf-8"));
      const maxId = Math.max(0, ...(_data.history ?? []).map((h) => h.id));
      _nextId = maxId + 1;
      return _data;
    } catch {
    }
  }
  _data = { connections: [], history: [] };
  return _data;
}
function save() {
  const file = path.join(dataDir(), "data.json");
  fs.writeFileSync(file, JSON.stringify(_data, null, 2));
}
function saveConnection(config) {
  const data = load();
  const idx = data.connections.findIndex((c) => c.id === config.id);
  if (idx >= 0) {
    data.connections[idx] = config;
  } else {
    data.connections.push(config);
  }
  save();
}
function loadConnections() {
  return load().connections;
}
function deleteConnection(id) {
  const data = load();
  data.connections = data.connections.filter((c) => c.id !== id);
  save();
}
function addHistory(entry) {
  const data = load();
  data.history.unshift({
    ...entry,
    id: _nextId++,
    executedAt: Math.floor(Date.now() / 1e3)
  });
  const connEntries = data.history.filter((h) => h.connectionId === entry.connectionId);
  if (connEntries.length > 500) {
    const toRemove = connEntries.slice(500).map((h) => h.id);
    data.history = data.history.filter((h) => !toRemove.includes(h.id));
  }
  save();
}
function getHistory(connectionId, limit = 100) {
  return load().history.filter((h) => h.connectionId === connectionId).slice(0, limit);
}
function clearHistory(connectionId) {
  const data = load();
  data.history = data.history.filter((h) => h.connectionId !== connectionId);
  save();
}
function registerIpcHandlers() {
  electron.ipcMain.handle("connections:load", () => loadConnections());
  electron.ipcMain.handle("connections:save", (_e, config) => {
    saveConnection(config);
    return loadConnections();
  });
  electron.ipcMain.handle("connections:delete", (_e, id) => {
    disconnect(id).catch(() => {
    });
    deleteConnection(id);
    return loadConnections();
  });
  electron.ipcMain.handle("connections:test", async (_e, config) => {
    const driver = createDriver(config);
    await driver.testConnection();
  });
  electron.ipcMain.handle("connections:connect", async (_e, config) => {
    await getOrCreateConnection(config);
  });
  electron.ipcMain.handle("connections:disconnect", async (_e, id) => {
    await disconnect(id);
  });
  electron.ipcMain.handle("query:run", async (_e, { connectionId, sql: sql2, config }) => {
    const driver = await getOrCreateConnection(config);
    try {
      const result = await driver.query(sql2);
      addHistory({ connectionId, sql: sql2, duration: result.duration, rowCount: result.rowCount, error: null });
      return { ok: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addHistory({ connectionId, sql: sql2, duration: null, rowCount: null, error: message });
      return { ok: false, error: message };
    }
  });
  electron.ipcMain.handle("schema:databases", async (_e, config) => {
    const driver = await getOrCreateConnection(config);
    return driver.getDatabases();
  });
  electron.ipcMain.handle("schema:tables", async (_e, { config, database }) => {
    const driver = await getOrCreateConnection(config);
    return driver.getTables(database);
  });
  electron.ipcMain.handle("schema:columns", async (_e, { config, table, schema }) => {
    const driver = await getOrCreateConnection(config);
    return driver.getColumns(table, schema);
  });
  electron.ipcMain.handle("history:get", (_e, connectionId) => getHistory(connectionId));
  electron.ipcMain.handle("history:clear", (_e, connectionId) => {
    clearHistory(connectionId);
  });
}
const isDev = !electron.app.isPackaged;
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1e1e2e",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
