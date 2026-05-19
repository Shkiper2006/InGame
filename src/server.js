const path = require('path');
const express = require('express');
const { all, get, run, initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('welcome');
});

app.get('/quests', async (req, res, next) => {
  try {
    const quests = await all('SELECT id, title, image_url, short_description FROM quests ORDER BY id DESC');
    res.render('quests-list', { quests });
  } catch (error) {
    next(error);
  }
});

app.get('/quests/new', (req, res) => {
  res.render('new-quest');
});

app.post('/quests', async (req, res, next) => {
  const {
    title,
    imageUrl,
    shortDescription,
    rootLocation,
    rootLocationImage,
    firstAction,
    secondAction
  } = req.body;

  try {
    const quest = await run(
      `INSERT INTO quests (title, image_url, short_description)
       VALUES (?, ?, ?)`,
      [title, imageUrl, shortDescription]
    );

    const locationNode = await run(
      `INSERT INTO location_nodes (quest_id, event_text, image_url, parent_location_id, author)
       VALUES (?, ?, ?, ?, ?)`,
      [quest.id, rootLocation, rootLocationImage || null, null, 'creator']
    );

    await run('UPDATE quests SET root_location_id = ? WHERE id = ?', [locationNode.id, quest.id]);

    await run(
      `INSERT INTO action_options (location_node_id, action_text, child_location_id)
       VALUES (?, ?, NULL), (?, ?, NULL)`,
      [locationNode.id, firstAction, locationNode.id, secondAction]
    );

    res.redirect(`/quests/${quest.id}`);
  } catch (error) {
    next(error);
  }
});

app.get('/quests/:questId', async (req, res, next) => {
  const { questId } = req.params;

  try {
    const quest = await get(
      `SELECT q.id, q.title, q.short_description,
              ln.id AS location_id,
              ln.event_text,
              ln.image_url,
              ln.parent_location_id,
              ln.author,
              ln.created_at
       FROM quests q
       LEFT JOIN location_nodes ln ON ln.id = q.root_location_id
       WHERE q.id = ?`,
      [questId]
    );

    if (!quest) {
      return res.status(404).send('Квест не найден');
    }

    const actions = await all(
      `SELECT id, action_text, child_location_id
       FROM action_options
       WHERE location_node_id = ?
       ORDER BY id ASC`,
      [quest.location_id]
    );

    res.render('quest-play', { quest, actions });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Что-то пошло не так. Попробуйте снова позже.');
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`InGame запущен на http://localhost:${PORT}`);
  });
});
