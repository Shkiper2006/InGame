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
  await run('PRAGMA foreign_keys = ON');

  await run(`CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    short_description TEXT NOT NULL,
    root_location_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (root_location_id) REFERENCES location_nodes(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS location_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_id INTEGER NOT NULL,
    event_text TEXT NOT NULL,
    image_url TEXT,
    parent_location_id INTEGER,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_location_id) REFERENCES location_nodes(id) ON DELETE SET NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS action_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_node_id INTEGER NOT NULL,
    action_text TEXT NOT NULL,
    child_location_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_node_id) REFERENCES location_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (child_location_id) REFERENCES location_nodes(id) ON DELETE SET NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_id INTEGER NOT NULL,
    action_option_id INTEGER,
    author TEXT NOT NULL,
    content TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
    FOREIGN KEY (action_option_id) REFERENCES action_options(id) ON DELETE SET NULL
  )`);

  await run('CREATE INDEX IF NOT EXISTS idx_location_nodes_quest_id ON location_nodes (quest_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_location_nodes_parent_location_id ON location_nodes (parent_location_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_location_nodes_created_at ON location_nodes (created_at)');

  const countRow = await get('SELECT COUNT(*) as count FROM quests');
  if (countRow.count === 0) {
    const seedQuest = await run(
      `INSERT INTO quests (title, image_url, short_description)
       VALUES (?, ?, ?)`,
      [
        'Тайна Лунного Леса',
        'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=900&q=80',
        'Герою нужно найти источник странного сияния в лесу.'
      ]
    );

    const rootLocation = await run(
      `INSERT INTO location_nodes (quest_id, event_text, image_url, parent_location_id, author)
       VALUES (?, ?, ?, ?, ?)`,
      [seedQuest.id, 'Вы стоите у старых ворот леса.', null, null, 'system']
    );

    await run('UPDATE quests SET root_location_id = ? WHERE id = ?', [rootLocation.id, seedQuest.id]);

    await run(
      `INSERT INTO action_options (location_node_id, action_text, child_location_id)
       VALUES (?, ?, NULL), (?, ?, NULL)`,
      [rootLocation.id, 'Войти в лес', rootLocation.id, 'Вернуться в деревню']
    );
  }
}

module.exports = { db, run, get, all, initDb };
