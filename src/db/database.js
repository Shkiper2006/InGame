const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'ingame.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    short_description TEXT NOT NULL,
    current_location TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quest_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_id INTEGER NOT NULL,
    action_text TEXT NOT NULL,
    FOREIGN KEY (quest_id) REFERENCES quests(id)
  )`);

  const countRow = await get('SELECT COUNT(*) as count FROM quests');
  if (countRow.count === 0) {
    const seedQuest = await run(
      `INSERT INTO quests (title, image_url, short_description, current_location)
       VALUES (?, ?, ?, ?)`,
      [
        'Тайна Лунного Леса',
        'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=900&q=80',
        'Герою нужно найти источник странного сияния в лесу.',
        'Вы стоите у старых ворот леса.'
      ]
    );

    await run(
      'INSERT INTO quest_actions (quest_id, action_text) VALUES (?, ?), (?, ?)',
      [seedQuest.id, 'Войти в лес', seedQuest.id, 'Вернуться в деревню']
    );
  }
}

module.exports = { db, run, get, all, initDb };
