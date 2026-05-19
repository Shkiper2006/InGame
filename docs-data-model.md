# InGame Data Model

## Entities

- **Quest** (`quests`): верхнеуровневый квест с метаданными и ссылкой на корневую локацию.
- **LocationNode** (`location_nodes`): узел повествования (локация/событие) внутри конкретного квеста.
- **ActionOption** (`action_options`): пользовательский вариант действия из текущей локации.
- **Contribution** (`contributions`): пользовательский вклад в развитие квеста (комментарий/предложение ветки).

## LocationNode fields

Каждая локация хранит:

- `event_text` — текст события.
- `image_url` — опциональное изображение.
- `parent_location_id` — ссылка на родительскую локацию (для дерева/графа).
- `author` — автор узла.
- `created_at` — время создания.

## Rule: exactly two actions

Для каждой `LocationNode` приложение создает **ровно две** записи в `action_options`.

## Empty branch state

`ActionOption.child_location_id` может быть `NULL`. Это состояние означает «пустая ветка»: пользователь уже выбрал/видит действие, но продолжение еще не создано.

## Indexes

Добавлены индексы:

- `idx_location_nodes_quest_id` по `location_nodes.quest_id`
- `idx_location_nodes_parent_location_id` по `location_nodes.parent_location_id`
- `idx_location_nodes_created_at` по `location_nodes.created_at`
