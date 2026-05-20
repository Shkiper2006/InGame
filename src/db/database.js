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

function begin(mode = 'DEFERRED') {
  return run(`BEGIN ${mode} TRANSACTION`);
}

function commit() {
  return run('COMMIT');
}

function rollback() {
  return run('ROLLBACK');
}

async function withTransaction(work, mode = 'IMMEDIATE') {
  await begin(mode);
  try {
    const result = await work();
    await commit();
    return result;
  } catch (error) {
    try {
      await rollback();
    } catch (rollbackError) {
      // ignore rollback errors to preserve the original exception
    }
    throw error;
  }
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
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_action_options_location_action_text_unique ON action_options (location_node_id, action_text)');

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
      [seedQuest.id, 'Вы стоите у старых ворот леса. Лунное сияние пульсирует, будто зовёт дальше.', null, null, 'system']
    );

    await run('UPDATE quests SET root_location_id = ? WHERE id = ?', [rootLocation.id, seedQuest.id]);

    const endingTexts = [
      'Концовка I — Рассвет Хранителя: вы стабилизируете Лунное Сердце и становитесь новым хранителем леса.',
      'Концовка II — Затухающий Свет: источник спасён, но вы теряете память о своей прошлой жизни.',
      'Концовка III — Союз Теней: вы объединяете лесных духов и людей, открывая мирный путь.',
      'Концовка IV — Осколки Луны: печать рушится, лес выживает, но навсегда меняется.',
      'Концовка V — Вечная Ночь: неверный ритуал запускает цикл тьмы, и история начинается заново.'
    ];

    const endingNodeIds = [];
    for (const text of endingTexts) {
      const endingNode = await run(
        `INSERT INTO location_nodes (quest_id, event_text, image_url, parent_location_id, author)
         VALUES (?, ?, ?, ?, ?)`,
        [seedQuest.id, text, null, null, 'system']
      );
      endingNodeIds.push(endingNode.id);
    }

    let previousLayerNodeId = rootLocation.id;
    let previousLayerActionIds = [];

    for (let layer = 1; layer <= 75; layer += 1) {
      const eventNode = await run(
        `INSERT INTO location_nodes (quest_id, event_text, image_url, parent_location_id, author)
         VALUES (?, ?, ?, ?, ?)`,
        [
          seedQuest.id,
          `Слой ${layer}: вы продвигаетесь глубже в Лунный Лес. Текущие решения переплетаются с отголосками прошлых выборов.`,
          null,
          previousLayerNodeId,
          'system'
        ]
      );

      await run(
        `INSERT INTO action_options (location_node_id, action_text, child_location_id)
         VALUES (?, ?, ?), (?, ?, ?)`,
        [
          eventNode.id,
          `Слой ${layer}: следовать за серебряными огнями`,
          null,
          eventNode.id,
          `Слой ${layer}: прислушаться к шёпоту из чащи`,
          null
        ]
      );

      const currentLayerActions = await all(
        `SELECT id
         FROM action_options
         WHERE location_node_id = ?
         ORDER BY id ASC`,
        [eventNode.id]
      );

      if (layer === 1) {
        await run(
          `INSERT INTO action_options (location_node_id, action_text, child_location_id)
           VALUES (?, ?, ?), (?, ?, ?)`,
          [
            rootLocation.id,
            'Войти в лес по светящейся тропе',
            eventNode.id,
            rootLocation.id,
            'Сделать круг и войти через старый мост',
            eventNode.id
          ]
        );
      }

      if (previousLayerActionIds.length) {
        const toCurrentNode = previousLayerActionIds[0];
        const toCurrentAction = previousLayerActionIds[1];
        await run('UPDATE action_options SET child_location_id = ? WHERE id IN (?, ?)', [
          eventNode.id,
          toCurrentNode,
          toCurrentAction
        ]);
      }

      if (layer > 2) {
        await run('UPDATE action_options SET child_location_id = ? WHERE id = ?', [eventNode.id, previousLayerActionIds[1]]);
      }

      previousLayerNodeId = eventNode.id;
      previousLayerActionIds = currentLayerActions.map((action) => action.id);
    }

    for (let i = 0; i < previousLayerActionIds.length; i += 1) {
      const targetEndingId = endingNodeIds[i % endingNodeIds.length];
      await run('UPDATE action_options SET child_location_id = ? WHERE id = ?', [targetEndingId, previousLayerActionIds[i]]);
    }

    await run(
      `INSERT INTO action_options (location_node_id, action_text, child_location_id)
       VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
      [
        previousLayerNodeId,
        'Активировать печать хранителя',
        endingNodeIds[0],
        previousLayerNodeId,
        'Принять жертву ради равновесия',
        endingNodeIds[1],
        previousLayerNodeId,
        'Заключить союз людей и духов',
        endingNodeIds[2],
        previousLayerNodeId,
        'Разделить силу на осколки',
        endingNodeIds[3],
        previousLayerNodeId,
        'Провести запретный ритуал',
        endingNodeIds[4]
      ]
    );
  }
}

module.exports = { db, run, get, all, initDb, withTransaction };
