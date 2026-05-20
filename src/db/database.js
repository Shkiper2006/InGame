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

  const stormArchiveQuestTitle = 'Архив Штормового Сердца';
  const existingStormArchiveQuest = await get('SELECT id FROM quests WHERE title = ? LIMIT 1', [stormArchiveQuestTitle]);
  if (!existingStormArchiveQuest) {
    const seedQuest = await run(
      `INSERT INTO quests (title, image_url, short_description)
       VALUES (?, ?, ?)`,
      [
        stormArchiveQuestTitle,
        'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80',
        'Курьер с живой картой отправляется в небесный город, чтобы остановить шторм, пожирающий память мира.'
      ]
    );

    const rootLocation = await run(
      `INSERT INTO location_nodes (quest_id, event_text, image_url, parent_location_id, author)
       VALUES (?, ?, ?, ?, ?)`,
      [seedQuest.id, 'Ночной экспресс дирижаблей глохнет над городом Лиор. В ваших руках — живая карта Нейра, и на ней горит запретная метка: «Архив Штормового Сердца открыт».', null, null, 'system']
    );

    await run('UPDATE quests SET root_location_id = ? WHERE id = ?', [rootLocation.id, seedQuest.id]);

    const endingTexts = [
      'Концовка I — Маяк Новой Бури: вы переписываете Сердце, шторм становится источником энергии, а Лиор переживает эпоху света.',
      'Концовка II — Тихий Архивариус: город спасён, но ваши воспоминания запечатаны в кристалле; вы храните чужие истории, забыв свою.',
      'Концовка III — Пакт Облаков: люди, механики и кочевники Небесной Гряды объединяются в совет, впервые деля власть и знания.',
      'Концовка IV — Раскол Неба: вы ломаете контур Сердца; мир выживает, но небо делится на пять климатических королевств.',
      'Концовка V — Петля Шквала: доверившись голосу из ядра, вы запускаете временную бурю, и утро снова превращается в эту же ночь.'
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

    const chapterTitles = [
      'Зов Штормового Сердца',
      'Галереи Затонувшей Памяти',
      'Механика Клятв и Ветра',
      'Война Тихих Башен',
      'Предел Небесного Архива'
    ];
    const motifByAct = [
      'голоса уличных маяков',
      'пыль стеклянных манускриптов',
      'искра в медных жилах города',
      'тени от парящих крепостей',
      'эхо работающего ядра'
    ];

    let previousLayerActionIds = [];
    let branchAnchorA = rootLocation.id;
    let branchAnchorB = rootLocation.id;

    for (let layer = 1; layer <= 75; layer += 1) {
      const actIndex = Math.floor((layer - 1) / 15);
      const chapter = chapterTitles[actIndex];
      const motif = motifByAct[actIndex];
      const pressure = (layer % 5) + 1;
      const nodeParent = layer % 2 === 0 ? branchAnchorA : branchAnchorB;

      const eventNode = await run(
        `INSERT INTO location_nodes (quest_id, event_text, image_url, parent_location_id, author)
         VALUES (?, ?, ?, ?, ?)`,
        [
          seedQuest.id,
          `Узел ${layer}/75 — ${chapter}. Нейра фиксирует ${pressure}-й уровень турбулентности: ${motif}. Вы находите фрагмент правды о том, что шторм питается не молниями, а чужими невысказанными клятвами.`,
          null,
          nodeParent,
          'system'
        ]
      );

      await run(
        `INSERT INTO action_options (location_node_id, action_text, child_location_id)
         VALUES (?, ?, ?), (?, ?, ?)`,
        [
          eventNode.id,
          `Узел ${layer}: принять риск и идти по верхним вантам к ядру`,
          null,
          eventNode.id,
          `Узел ${layer}: спуститься в сервисные катакомбы и искать скрытый обход`,
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
            'Довериться Нейре и подняться к Башне Изломанных Компасов',
            eventNode.id,
            rootLocation.id,
            'Скрыться от дозорных и войти через грузовые доки облачной станции',
            eventNode.id
          ]
        );
      }

      if (previousLayerActionIds.length) {
        await run('UPDATE action_options SET child_location_id = ? WHERE id IN (?, ?)', [eventNode.id, previousLayerActionIds[0], previousLayerActionIds[1]]);
      }

      previousLayerActionIds = currentLayerActions.map((action) => action.id);
      if (layer % 3 === 0) {
        branchAnchorA = eventNode.id;
      }
      if (layer % 4 === 0) {
        branchAnchorB = eventNode.id;
      }
    }

    for (let i = 0; i < previousLayerActionIds.length; i += 1) {
      const targetEndingId = endingNodeIds[i % endingNodeIds.length];
      await run('UPDATE action_options SET child_location_id = ? WHERE id = ?', [targetEndingId, previousLayerActionIds[i]]);
    }

    await run(
      `INSERT INTO action_options (location_node_id, action_text, child_location_id)
       VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
      [
        branchAnchorA,
        'Вплести шторм в городскую сеть маяков',
        endingNodeIds[0],
        branchAnchorA,
        'Запечатать Сердце ценой собственной памяти',
        endingNodeIds[1],
        branchAnchorA,
        'Созвать Совет Облаков и разделить власть',
        endingNodeIds[2],
        branchAnchorA,
        'Разбить ядро на пять фрагментов климата',
        endingNodeIds[3],
        branchAnchorA,
        'Принять шёпот ядра и перезапустить ночь',
        endingNodeIds[4]
      ]
    );
  }
}

module.exports = { db, run, get, all, initDb, withTransaction };
