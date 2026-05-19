# InGame

Минимальный прототип платформы для текстовых квестов.

## Выбранный стек

- **Backend:** Node.js + Express
- **Frontend:** EJS-шаблоны + CSS
- **База данных:** SQLite

## Структура проекта

- `src/server.js` — сервер и маршруты страниц.
- `src/db/database.js` — инициализация БД, сидирование, SQL-helpers.
- `src/views/` — страницы:
  - `welcome.ejs` — приветственная страница (`/`).
  - `quests-list.ejs` — список квестов (`/quests`).
  - `quest-play.ejs` — прохождение квеста (`/quests/:questId`).
  - `new-quest.ejs` — создание квеста (`/quests/new`).
- `src/public/styles.css` — базовые стили.

## Как запустить

1. Установите зависимости:
   ```bash
   npm install
   ```
2. Запустите проект:
   ```bash
   npm run start
   ```
3. Откройте в браузере:
   - `http://localhost:3000/` — приветствие.
   - `http://localhost:3000/quests` — список квестов.
   - `http://localhost:3000/quests/new` — создание квеста.
   - `http://localhost:3000/quests/1` — пример прохождения существующего квеста.
