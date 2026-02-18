const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'nexus.db');

async function initDb() {
  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  const save = () => fs.writeFileSync(dbPath, Buffer.from(db.export()));

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      avatar TEXT DEFAULT '🌸',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const res = db.exec('SELECT COUNT(*) as c FROM users');
  const userCount = res[0] ? res[0].values[0][0] : 0;
  if (userCount === 0) {
    db.run('INSERT INTO users (name, username, avatar) VALUES (?, ?, ?)', ['Luna', 'luna_midnight', '🌙']);
    db.run('INSERT INTO users (name, username, avatar) VALUES (?, ?, ?)', ['Amara', 'amara_rose', '🌹']);
    db.run('INSERT INTO users (name, username, avatar) VALUES (?, ?, ?)', ['Seren', 'seren_soul', '✨']);
    db.run('INSERT INTO posts (user_id, content) VALUES (?, ?)', [1, 'Lost in thought under the stars tonight. Who else feels the pull of the moon?']);
    db.run('INSERT INTO posts (user_id, content) VALUES (?, ?)', [2, 'Life is too short for ordinary moments. Chase the ones that make your heart race.']);
    db.run('INSERT INTO posts (user_id, content) VALUES (?, ?)', [3, 'Connection is everything. Reach out to someone who crossed your mind today.']);
    db.run('INSERT INTO posts (user_id, content) VALUES (?, ?)', [1, 'The best conversations happen in the quiet hours when the world sleeps.']);
    db.run('INSERT INTO posts (user_id, content) VALUES (?, ?)', [2, 'You attract what you radiate. What are you putting out there?']);
  }
  save();

  function prepare(sql) {
    return {
      get(...params) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const row = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return row;
      },
      all(...params) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
      run(...params) {
        db.run(sql, params);
        const r = db.exec('SELECT last_insert_rowid() as id');
        const lastInsertRowid = r[0]?.values[0][0] ?? 0;
        save();
        return { lastInsertRowid };
      }
    };
  }

  return { prepare };
}

let dbPromise = initDb();

module.exports = {
  getDb: () => dbPromise
};
