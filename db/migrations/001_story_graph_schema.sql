CREATE TABLE IF NOT EXISTS quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  short_description TEXT NOT NULL,
  root_location_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (root_location_id) REFERENCES location_nodes(id)
);

CREATE TABLE IF NOT EXISTS location_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quest_id INTEGER NOT NULL,
  event_text TEXT NOT NULL,
  image_url TEXT,
  parent_location_id INTEGER,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_location_id) REFERENCES location_nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS action_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_node_id INTEGER NOT NULL,
  action_text TEXT NOT NULL,
  child_location_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_node_id) REFERENCES location_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (child_location_id) REFERENCES location_nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quest_id INTEGER NOT NULL,
  action_option_id INTEGER,
  author TEXT NOT NULL,
  content TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
  FOREIGN KEY (action_option_id) REFERENCES action_options(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_location_nodes_quest_id ON location_nodes (quest_id);
CREATE INDEX IF NOT EXISTS idx_location_nodes_parent_location_id ON location_nodes (parent_location_id);
CREATE INDEX IF NOT EXISTS idx_location_nodes_created_at ON location_nodes (created_at);
