import sqlite3
import os
from contextlib import contextmanager
from .config import settings

DDL = """
CREATE TABLE IF NOT EXISTS meals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT,
    category        TEXT,
    restaurant      TEXT,
    meal_name       TEXT NOT NULL,
    rating_text     TEXT,
    rating          INTEGER CHECK(rating IS NULL OR rating BETWEEN 1 AND 5),
    repurchase      INTEGER CHECK(repurchase IS NULL OR repurchase BETWEEN 0 AND 5),
    satiety         TEXT,
    price           REAL,
    notes           TEXT,
    calories        REAL,
    calories_min    REAL,
    calories_max    REAL,
    protein_g       REAL,
    carbs_g         REAL,
    fat_g           REAL,
    sodium_mg       REAL,
    fiber_g         REAL,
    photo_url       TEXT,
    source          TEXT DEFAULT 'manual',
    ai_confidence   REAL,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meal_tags (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_analysis_cache (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_name_hash  TEXT UNIQUE NOT NULL,
    meal_name       TEXT NOT NULL,
    response_json   TEXT NOT NULL,
    model_version   TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    expires_at      TEXT
);

CREATE TABLE IF NOT EXISTS daily_summaries (
    date            TEXT PRIMARY KEY,
    total_calories  REAL DEFAULT 0,
    total_protein_g REAL DEFAULT 0,
    total_carbs_g   REAL DEFAULT 0,
    total_fat_g     REAL DEFAULT 0,
    total_sodium_mg REAL DEFAULT 0,
    meal_count      INTEGER DEFAULT 0,
    avg_rating      REAL,
    fat_loss_score  REAL,
    water_risk_flag INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_profile (
    id               INTEGER PRIMARY KEY DEFAULT 1,
    name             TEXT DEFAULT '使用者',
    tdee_calories    REAL DEFAULT 1800,
    goal             TEXT DEFAULT 'fat_loss',
    target_protein_g REAL DEFAULT 120,
    target_carbs_g   REAL DEFAULT 150,
    target_fat_g     REAL DEFAULT 55,
    target_sodium_mg REAL DEFAULT 2000,
    updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meals_date       ON meals(date);
CREATE INDEX IF NOT EXISTS idx_meals_category   ON meals(category);
CREATE INDEX IF NOT EXISTS idx_meals_restaurant ON meals(restaurant);
CREATE INDEX IF NOT EXISTS idx_meals_rating     ON meals(rating);
CREATE INDEX IF NOT EXISTS idx_meal_tags_meal   ON meal_tags(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_tags_tag    ON meal_tags(tag);

CREATE TRIGGER IF NOT EXISTS meals_updated_at
    AFTER UPDATE ON meals FOR EACH ROW
BEGIN
    UPDATE meals SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS refresh_daily_insert
    AFTER INSERT ON meals WHEN NEW.date IS NOT NULL
BEGIN
    INSERT OR REPLACE INTO daily_summaries
        (date, total_calories, total_protein_g, total_carbs_g, total_fat_g,
         total_sodium_mg, meal_count, avg_rating)
    SELECT date, COALESCE(SUM(calories),0), COALESCE(SUM(protein_g),0),
           COALESCE(SUM(carbs_g),0), COALESCE(SUM(fat_g),0),
           COALESCE(SUM(sodium_mg),0), COUNT(*), AVG(rating)
    FROM meals WHERE date = NEW.date;
END;

CREATE TRIGGER IF NOT EXISTS refresh_daily_update
    AFTER UPDATE ON meals WHEN NEW.date IS NOT NULL
BEGIN
    INSERT OR REPLACE INTO daily_summaries
        (date, total_calories, total_protein_g, total_carbs_g, total_fat_g,
         total_sodium_mg, meal_count, avg_rating)
    SELECT date, COALESCE(SUM(calories),0), COALESCE(SUM(protein_g),0),
           COALESCE(SUM(carbs_g),0), COALESCE(SUM(fat_g),0),
           COALESCE(SUM(sodium_mg),0), COUNT(*), AVG(rating)
    FROM meals WHERE date = NEW.date;
END;

CREATE TRIGGER IF NOT EXISTS refresh_daily_delete
    AFTER DELETE ON meals WHEN OLD.date IS NOT NULL
BEGIN
    INSERT OR REPLACE INTO daily_summaries
        (date, total_calories, total_protein_g, total_carbs_g, total_fat_g,
         total_sodium_mg, meal_count, avg_rating)
    SELECT date, COALESCE(SUM(calories),0), COALESCE(SUM(protein_g),0),
           COALESCE(SUM(carbs_g),0), COALESCE(SUM(fat_g),0),
           COALESCE(SUM(sodium_mg),0), COUNT(*), AVG(rating)
    FROM meals WHERE date = OLD.date;
END;
"""


def get_db_path() -> str:
    path = settings.db_path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def init_db():
    conn = sqlite3.connect(get_db_path())
    conn.executescript(DDL)
    # Seed default profile if empty
    conn.execute(
        "INSERT OR IGNORE INTO user_profile (id) VALUES (1)"
    )
    conn.commit()
    conn.close()


@contextmanager
def get_db():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
