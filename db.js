const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
let dbInstance = null;

async function initDB() {
  if (dbInstance) return dbInstance;
  
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Create Tables
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      meta_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default admin if none exists
  const checkUser = await dbInstance.get('SELECT * FROM users WHERE username = ?', ['admin']);
  if (!checkUser) {
    const hash = bcrypt.hashSync('admin123', 10);
    await dbInstance.run('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', hash]);
    console.log('Default admin user created. (admin / admin123)');
  }

  return dbInstance;
}

module.exports = { initDB };
