const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
let dbInstance = null;

// Save database to disk
function saveDB() {
  if (dbInstance) {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

async function initDB() {
  if (dbInstance) return;

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Create Tables
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      meta_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default admin if none exists
  const result = dbInstance.exec("SELECT * FROM users WHERE username = 'admin'");
  if (result.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    dbInstance.run('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', hash]);
    saveDB();
    console.log('Default admin user created. (admin / admin123)');
  }

  // Auto-save on exit
  process.on('exit', saveDB);
  process.on('SIGINT', () => { saveDB(); process.exit(); });
  process.on('SIGTERM', () => { saveDB(); process.exit(); });
}

// Helper: convert sql.js result to array of objects
function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const columns = result[0].columns;
  const values = result[0].values;
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// Query helpers that mimic the old API
function getAll(sql, params = []) {
  const result = dbInstance.exec(sql, params);
  return rowsToObjects(result);
}

function getOne(sql, params = []) {
  const rows = getAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function run(sql, params = []) {
  dbInstance.run(sql, params);
  saveDB();
}

module.exports = { initDB, getAll, getOne, run };
