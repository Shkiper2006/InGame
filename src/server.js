const path = require('path');
const express = require('express');
const { all, get, run, initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const LIMITS = {
  eventText: 2000,
  actionText: 200,
  imageUrl: 2048
};

function validateBranchInput(body) {
  const errors = [];
  const eventText = (body.eventText || '').trim();
  const firstAction = (body.firstAction || '').trim();
  const secondAction = (body.secondAction || '').trim();
  const imageUrl = (body.imageUrl || '').trim();

  if (!eventText) errors.push('Текст продолжения обязателен.');
  if (eventText.length > LIMITS.eventText) errors.push(`Текст продолжения не должен превышать ${LIMITS.eventText} символов.`);

  if (!firstAction) errors.push('Первый вариант действия обязателен.');
  if (firstAction.length > LIMITS.actionText) errors.push(`Первый вариант действия не должен превышать ${LIMITS.actionText} символов.`);

  if (!secondAction) errors.push('Второй вариант действия обязателен.');
  if (secondAction.length > LIMITS.actionText) errors.push(`Второй вариант действия не должен превышать ${LIMITS.actionText} символов.`);

  if (imageUrl.length > LIMITS.imageUrl) {
    errors.push(`Ссылка на изображение не должна превышать ${LIMITS.imageUrl} символов.`);
  }

  if (imageUrl) {
    const lower = imageUrl.toLowerCase();
    const hasAllowedExt = /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/.test(lower);
    if (!hasAllowedExt) {
      errors.push('Поддерживаются только изображения PNG, JPG, JPEG, WEBP, GIF или SVG.');
    }
    try {
      const parsed = new URL(imageUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push('Ссылка на изображение должна использовать http или https.');
      }
    } catch (e) {
      errors.push('Некорректная ссылка на изображение.');
    }
  }

  return { errors, cleaned: { eventText, firstAction, secondAction, imageUrl } };
}

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
  const locationIdFromQuery = req.query.locationId ? Number(req.query.locationId) : null;

  try {
    const quest = await get(
      `SELECT q.id, q.title, q.short_description,
              ln.id AS root_location_id,
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

    const targetLocation = locationIdFromQuery
      ? await get(
          `SELECT id, quest_id, event_text, image_url, parent_location_id, author, created_at
           FROM location_nodes
           WHERE id = ? AND quest_id = ?`,
          [locationIdFromQuery, questId]
        )
      : await get(
          `SELECT id, quest_id, event_text, image_url, parent_location_id, author, created_at
           FROM location_nodes
           WHERE id = ? AND quest_id = ?`,
          [quest.root_location_id, questId]
        );

    if (!targetLocation) {
      return res.status(404).send('Локация не найдена для этого квеста');
    }

    const actions = await all(
      `SELECT id, action_text, child_location_id
       FROM action_options
       WHERE location_node_id = ?
       ORDER BY id ASC`,
      [targetLocation.id]
    );

    res.render('quest-play', { quest, currentLocation: targetLocation, actions });
  } catch (error) {
    next(error);
  }
});

app.post('/quests/:questId/actions/:actionId/choose', async (req, res, next) => {
  const { questId, actionId } = req.params;
  try {
    const action = await get(
      `SELECT ao.id, ao.location_node_id, ao.child_location_id
       FROM action_options ao
       JOIN location_nodes ln ON ln.id = ao.location_node_id
       WHERE ao.id = ? AND ln.quest_id = ?`,
      [actionId, questId]
    );

    if (!action) {
      return res.status(404).send('Выбранное действие не найдено.');
    }

    if (action.child_location_id) {
      return res.redirect(`/quests/${questId}?locationId=${action.child_location_id}`);
    }

    res.render('branch-input', {
      questId,
      actionId,
      values: { eventText: '', imageUrl: '', firstAction: '', secondAction: '' },
      errors: []
    });
  } catch (error) {
    next(error);
  }
});

app.post('/quests/:questId/actions/:actionId/branch', async (req, res, next) => {
  const { questId, actionId } = req.params;
  const { errors, cleaned } = validateBranchInput(req.body);

  try {
    const action = await get(
      `SELECT ao.id, ao.location_node_id, ao.child_location_id
       FROM action_options ao
       JOIN location_nodes ln ON ln.id = ao.location_node_id
       WHERE ao.id = ? AND ln.quest_id = ?`,
      [actionId, questId]
    );

    if (!action) {
      return res.status(404).send('Выбранное действие не найдено.');
    }

    if (action.child_location_id) {
      return res.redirect(`/quests/${questId}?locationId=${action.child_location_id}`);
    }

    if (errors.length) {
      return res.status(422).render('branch-input', {
        questId,
        actionId,
        values: cleaned,
        errors
      });
    }

    const newLocation = await run(
      `INSERT INTO location_nodes (quest_id, event_text, image_url, parent_location_id, author)
       VALUES (?, ?, ?, ?, ?)`,
      [questId, cleaned.eventText, cleaned.imageUrl || null, action.location_node_id, 'contributor']
    );

    await run('UPDATE action_options SET child_location_id = ? WHERE id = ?', [newLocation.id, actionId]);

    await run(
      `INSERT INTO action_options (location_node_id, action_text, child_location_id)
       VALUES (?, ?, NULL), (?, ?, NULL)`,
      [newLocation.id, cleaned.firstAction, newLocation.id, cleaned.secondAction]
    );

    return res.render('branch-saved', {
      questId,
      locationId: newLocation.id
    });
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
