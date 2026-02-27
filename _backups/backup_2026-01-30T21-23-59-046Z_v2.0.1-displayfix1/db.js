const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'data', 'app.db');

function runMigrationsFromFolder(db) {
  try {
    const migDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migDir)) return;

    db.exec(`CREATE TABLE IF NOT EXISTS applied_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);`);
    const appliedRows = db.prepare('SELECT name FROM applied_migrations').all();
    const applied = new Set(appliedRows.map(r => r.name));

    const files = fs.readdirSync(migDir)
      .filter(f => f.toLowerCase().endsWith('.sql'))
      .sort();

    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      if (!sql.trim()) {
        db.prepare('INSERT OR IGNORE INTO applied_migrations(name, applied_at) VALUES(?,?)')
          .run(f, new Date().toISOString());
        continue;
      }
      db.exec(sql);
      db.prepare('INSERT OR IGNORE INTO applied_migrations(name, applied_at) VALUES(?,?)')
        .run(f, new Date().toISOString());
    }
  } catch (e) {
    console.error('[migrations] failed:', e && e.message ? e.message : e);
  }
}


function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

function hasColumn(db, table, col) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === col);
}

function addColumnIfMissing(db, table, col, defSql) {
  if (!hasColumn(db, table, col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${defSql};`);
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      org_name TEXT,
      org_department TEXT,
      header_line TEXT,
      footer_line TEXT,
      logo_filename TEXT,

      report_prefix TEXT,
      show_qr INTEGER NOT NULL DEFAULT 1,
      show_barcode INTEGER NOT NULL DEFAULT 1,
      seal_filename TEXT,

      sig_prepared_title TEXT,
      sig_prepared_name TEXT,
      sig_reviewed_title TEXT,
      sig_reviewed_name TEXT,
      sig_approved_title TEXT,
      sig_approved_name TEXT,

      kiosk_display_mode TEXT NOT NULL DEFAULT 'both',
      kiosk_chart_variant TEXT NOT NULL DEFAULT 'ring',
      kiosk_interval_sec INTEGER NOT NULL DEFAULT 5,
      kiosk_show_event INTEGER NOT NULL DEFAULT 1,
      kiosk_show_due INTEGER NOT NULL DEFAULT 1,
      kiosk_show_status INTEGER NOT NULL DEFAULT 1,
      kiosk_chart_size TEXT NOT NULL DEFAULT 'xl',
      kiosk_color_scheme TEXT NOT NULL DEFAULT 'dark',
      kiosk_transition TEXT NOT NULL DEFAULT 'fade',
      kiosk_theme_auto_cycle INTEGER NOT NULL DEFAULT 0,
      kiosk_date_from TEXT,
      kiosk_date_to TEXT,

      /* World Days auto schedule */
      world_days_auto_enabled INTEGER NOT NULL DEFAULT 1,
      world_days_auto_time TEXT NOT NULL DEFAULT '03:10',
      world_days_auto_sources TEXT NOT NULL DEFAULT 'un_ar,unesco_en',
      world_days_last_auto_at TEXT,
      world_days_last_auto_status TEXT,
      world_days_last_auto_msg TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','supervisor','employee')),
      user_kind TEXT NOT NULL DEFAULT 'employee' CHECK (user_kind IN ('employee','collaborator')),
      can_login INTEGER NOT NULL DEFAULT 1,
      can_approve_tasks INTEGER NOT NULL DEFAULT 0,
      specialty TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      supervisor_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (supervisor_id) REFERENCES users(id) ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_id INTEGER,
      employee_id INTEGER,
      supervisor_id INTEGER,
      target_value REAL NOT NULL DEFAULT 0,
      done_value REAL NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
      start_date TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','pending_approval','completed','overdue','cancelled')),
      progress_mode TEXT NOT NULL DEFAULT 'simple' CHECK (progress_mode IN ('simple','stages')),
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS task_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      done_value REAL,
      note TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
      comment TEXT,
      approved_by INTEGER,
      approved_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      stored_filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      uploaded_by INTEGER,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );

    /* Project (Event) file library */
    CREATE TABLE IF NOT EXISTS project_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      task_id INTEGER,
      stored_relpath TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      visibility TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('team','private')),
      uploaded_by INTEGER,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_project_files_event ON project_files(event_id);

    CREATE TABLE IF NOT EXISTS task_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      stage_key TEXT,
      stage_name TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0,
      assigned_to INTEGER,
      progress REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','completed','cancelled')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS stage_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_id INTEGER NOT NULL,
      progress REAL,
      note TEXT,
      updated_by INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (stage_id) REFERENCES task_stages(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      task_id INTEGER,
      stage_id INTEGER,
      to_email TEXT NOT NULL,
      ref TEXT,
      meta_json TEXT,
      sent_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (stage_id) REFERENCES task_stages(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_unique ON email_logs(type, task_id, stage_id, to_email, ref);

    /* Asset Library (Indexing) */
    CREATE TABLE IF NOT EXISTS asset_drives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      serial TEXT,
      location TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_id INTEGER,
      task_id INTEGER,
      drive_id INTEGER,
      file_path TEXT NOT NULL,
      file_name TEXT,
      asset_type TEXT NOT NULL DEFAULT 'other' CHECK (asset_type IN ('video','photo','audio','project','doc','other')),
      tags TEXT,
      visibility TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('team','private','public')),
      thumb_relpath TEXT,
      meta_json TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (drive_id) REFERENCES asset_drives(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assets_event ON assets(event_id);
    CREATE INDEX IF NOT EXISTS idx_assets_drive ON assets(drive_id);
    CREATE INDEX IF NOT EXISTS idx_assets_created ON assets(created_at);

    /* World Days (Global Days) */
    CREATE TABLE IF NOT EXISTS world_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      day_date TEXT NOT NULL, /* YYYY-MM-DD */
      category TEXT,
      notes TEXT,
      source TEXT,            /* manual | excel | un | unesco | ... */
      source_ref TEXT,        /* URL or unique key */
      recurrence TEXT,        /* annual | once */
      month_day TEXT,         /* MM-DD for annual */
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_world_days_date ON world_days(day_date);

    /* Kiosk content: Quotes, Ticker, Calendar */
    CREATE TABLE IF NOT EXISTS kiosk_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_text TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kiosk_ticker_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_text TEXT NOT NULL,
      item_link TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kiosk_calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL, /* YYYY-MM-DD */
      end_date TEXT,
      category TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kiosk_calendar_date ON kiosk_calendar_events(event_date);

    CREATE TABLE IF NOT EXISTS kiosk_rss_cache (
      url TEXT PRIMARY KEY,
      items_json TEXT,
      fetched_at TEXT
    );
  `);

  // Notifications (in-app)
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      url TEXT,
      meta_json TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);
  `);

  // Backward-compatible: add missing columns for older DBs
  addColumnIfMissing(db, 'settings', 'report_prefix', 'TEXT');
  addColumnIfMissing(db, 'settings', 'show_qr', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'settings', 'show_barcode', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'settings', 'seal_filename', 'TEXT');
  addColumnIfMissing(db, 'settings', 'sig_prepared_title', 'TEXT');
  addColumnIfMissing(db, 'settings', 'sig_prepared_name', 'TEXT');
  addColumnIfMissing(db, 'settings', 'sig_reviewed_title', 'TEXT');
  addColumnIfMissing(db, 'settings', 'sig_reviewed_name', 'TEXT');
  addColumnIfMissing(db, 'settings', 'sig_approved_title', 'TEXT');
  addColumnIfMissing(db, 'settings', 'sig_approved_name', 'TEXT');
  addColumnIfMissing(db, 'settings', 'kiosk_display_mode', "TEXT NOT NULL DEFAULT 'both'");
  addColumnIfMissing(db, 'settings', 'kiosk_chart_variant', "TEXT NOT NULL DEFAULT 'ring'");
  addColumnIfMissing(db, 'settings', 'kiosk_interval_sec', 'INTEGER NOT NULL DEFAULT 5');
  addColumnIfMissing(db, 'settings', 'kiosk_show_event', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'settings', 'kiosk_show_due', 'INTEGER NOT NULL DEFAULT 1');

  // World days import metadata (non-breaking)
  addColumnIfMissing(db, 'world_days', 'source', 'TEXT');
  addColumnIfMissing(db, 'world_days', 'source_ref', 'TEXT');
  addColumnIfMissing(db, 'world_days', 'recurrence', 'TEXT');
  addColumnIfMissing(db, 'world_days', 'month_day', 'TEXT');
  addColumnIfMissing(db, 'settings', 'kiosk_show_status', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'settings', 'kiosk_chart_size', "TEXT NOT NULL DEFAULT 'xl'");
  addColumnIfMissing(db, 'settings', 'kiosk_color_scheme', "TEXT NOT NULL DEFAULT 'dark'");
  addColumnIfMissing(db, 'settings', 'kiosk_theme_auto_cycle', 'INTEGER NOT NULL DEFAULT 0');
  // How the kiosk screen transitions between tasks (fade | slide | slide_up | zoom | flip | none)
  addColumnIfMissing(db, 'settings', 'kiosk_transition', "TEXT NOT NULL DEFAULT 'fade'");
  addColumnIfMissing(db, 'settings', 'kiosk_date_from', 'TEXT');
  
  addColumnIfMissing(db, 'settings', 'kiosk_date_to', 'TEXT');

  // Kiosk: additional pages + ticker + HUD
  addColumnIfMissing(db, 'settings', 'kiosk_other_interval_sec', 'INTEGER NOT NULL DEFAULT 10');
  addColumnIfMissing(db, 'settings', 'kiosk_task_order', "TEXT NOT NULL DEFAULT 'due'");
  addColumnIfMissing(db, 'settings', 'kiosk_pages_default', "TEXT NOT NULL DEFAULT 'home,tasks,days,calendar'");

  addColumnIfMissing(db, 'settings', 'kiosk_ticker_mode', "TEXT NOT NULL DEFAULT 'manual'");
  addColumnIfMissing(db, 'settings', 'kiosk_ticker_rss_urls', 'TEXT');
  addColumnIfMissing(db, 'settings', 'kiosk_ticker_speed', 'INTEGER NOT NULL DEFAULT 60');
  
  addColumnIfMissing(db, 'settings', 'kiosk_ticker_font_size', 'INTEGER NOT NULL DEFAULT 18');
addColumnIfMissing(db, 'settings', 'kiosk_ticker_refresh_min', 'INTEGER NOT NULL DEFAULT 15');
  addColumnIfMissing(db, 'settings', 'kiosk_ticker_max_items', 'INTEGER NOT NULL DEFAULT 20');

  addColumnIfMissing(db, 'settings', 'kiosk_weather_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'settings', 'kiosk_weather_city', "TEXT NOT NULL DEFAULT 'Riyadh'");

  addColumnIfMissing(db, 'settings', 'kiosk_calendar_days_ahead', 'INTEGER NOT NULL DEFAULT 60');
  addColumnIfMissing(db, 'settings', 'kiosk_calendar_max_items', 'INTEGER NOT NULL DEFAULT 12');

  addColumnIfMissing(db, 'settings', 'kiosk_calendar_source', "TEXT NOT NULL DEFAULT 'manual'");
  addColumnIfMissing(db, 'settings', 'kiosk_calendar_moe_url', 'TEXT');
  addColumnIfMissing(db, 'settings', 'kiosk_calendar_moe_refresh_min', 'INTEGER NOT NULL DEFAULT 240');

  // Welcome screen
  addColumnIfMissing(db, 'settings', 'kiosk_welcome_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'settings', 'kiosk_welcome_text', 'TEXT');

  // World Days: daily auto schedule
  addColumnIfMissing(db, 'settings', 'world_days_auto_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'settings', 'world_days_auto_time', "TEXT NOT NULL DEFAULT '03:10'");
  addColumnIfMissing(db, 'settings', 'world_days_auto_sources', "TEXT NOT NULL DEFAULT 'un_ar,unesco_en'");
  addColumnIfMissing(db, 'settings', 'world_days_last_auto_at', 'TEXT');
  addColumnIfMissing(db, 'settings', 'world_days_last_auto_status', 'TEXT');
  addColumnIfMissing(db, 'settings', 'world_days_last_auto_msg', 'TEXT');

  // Email settings
  addColumnIfMissing(db, 'settings', 'email_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'settings', 'email_from_email', 'TEXT');
  addColumnIfMissing(db, 'settings', 'email_from_name', 'TEXT');
  addColumnIfMissing(db, 'settings', 'email_smtp_host', 'TEXT');
  addColumnIfMissing(db, 'settings', 'email_smtp_port', 'INTEGER');
  addColumnIfMissing(db, 'settings', 'email_smtp_secure', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'settings', 'email_smtp_user', 'TEXT');
  addColumnIfMissing(db, 'settings', 'email_smtp_pass', 'TEXT');
  addColumnIfMissing(db, 'settings', 'email_due_days', 'INTEGER NOT NULL DEFAULT 2');

  // Stage templates in settings (one label per line)
  addColumnIfMissing(db, 'settings', 'stage_templates_text', 'TEXT');


  // Users extensions
  addColumnIfMissing(db, 'users', 'user_kind', "TEXT NOT NULL DEFAULT 'employee'");
  addColumnIfMissing(db, 'users', 'can_login', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'users', 'can_approve_tasks', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'users', 'specialty', 'TEXT');
  addColumnIfMissing(db, 'users', 'email', 'TEXT');

  // Tasks extensions
  addColumnIfMissing(db, 'tasks', 'progress_mode', "TEXT NOT NULL DEFAULT 'simple'");
  addColumnIfMissing(db, 'tasks', 'kiosk_visible', 'INTEGER NOT NULL DEFAULT 1');
  try { db.exec("UPDATE tasks SET kiosk_visible=1 WHERE kiosk_visible IS NULL"); } catch (e) {}

  // Ensure settings row exists
  const row = db.prepare('SELECT id FROM settings WHERE id=1').get();
  if (!row) {
    db.prepare(`
      INSERT INTO settings (
        id, org_name, org_department, header_line, footer_line, logo_filename,
        report_prefix, show_qr, show_barcode, seal_filename,
        sig_prepared_title, sig_prepared_name, sig_reviewed_title, sig_reviewed_name, sig_approved_title, sig_approved_name
      ) VALUES (1, NULL, NULL, NULL, NULL, NULL, NULL, 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
    `).run();
  }

  // Apply optional SQL migrations (only once per file)
  runMigrationsFromFolder(db);

}

module.exports = {
  openDb,
  migrate,
};
