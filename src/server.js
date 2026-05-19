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
    firstAction,
    secondAction
  } = req.body;

  try {
    const quest = await run(
      `INSERT INTO quests (title, image_url, short_description, current_location)
       VALUES (?, ?, ?, ?)`,
      [title, imageUrl, shortDescription, rootLocation]
    );

    await run(
      'INSERT INTO quest_actions (quest_id, action_text) VALUES (?, ?), (?, ?)',
      [quest.id, firstAction, quest.id, secondAction]
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
      'SELECT id, title, current_location, short_description FROM quests WHERE id = ?',
      [questId]
    );

    if (!quest) {
      return res.status(404).send('Квест не найден');
    }

    const actions = await all(
      'SELECT id, action_text FROM quest_actions WHERE quest_id = ? ORDER BY id ASC',
      [questId]
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
