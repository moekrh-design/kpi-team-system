BEGIN;
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

-- تنظيف التكرارات قبل إنشاء فهرس فريد
DELETE FROM kiosk_calendar_events
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM kiosk_calendar_events GROUP BY event_date, title
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kiosk_calendar_unique ON kiosk_calendar_events(event_date, title);
-- إدراج التقويم الدراسي 1447/1448
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('عودة الهيئة الإدارية والمشرفين التربويين', '2025-08-12', NULL, 'return', '18 صفر 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('عودة المعلمين', '2025-08-17', NULL, 'return', '23 صفر 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('بداية الدراسة للطلاب', '2025-08-24', NULL, 'start', '1 ربيع الأول 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('إجازة اليوم الوطني', '2025-09-23', NULL, 'holiday', '1 ربيع الآخر 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('إجازة إضافية', '2025-10-12', NULL, 'holiday', '20 ربيع الآخر 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('إجازة الخريف', '2025-11-21', '2025-11-29', 'vacation', 'من 30 جمادى الأولى إلى 8 جمادى الآخرة 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('إجازة إضافية', '2025-12-11', '2025-12-14', 'holiday', 'من 20 إلى 23 جمادى الآخرة 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('إجازة منتصف العام', '2026-01-09', '2026-01-17', 'vacation', 'من 20 رجب إلى 28 شعبان 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('إجازة يوم التأسيس', '2026-02-22', NULL, 'holiday', '5 رمضان 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('إجازة عيد الفطر', '2026-03-06', '2026-03-28', 'vacation', 'من 17 رمضان إلى 9 شوال 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('إجازة عيد الأضحى', '2026-05-22', '2026-06-01', 'vacation', 'من 5 إلى 15 ذي الحجة 1447هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('بداية إجازة نهاية العام', '2026-06-25', NULL, 'vacation', '10 محرم 1448هـ', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO kiosk_calendar_events (title, event_date, end_date, category, notes, is_active, created_at, updated_at)
VALUES ('بداية الدراسة للعام الدراسي 1448/1449', '2026-08-23', NULL, 'start', '10 ربيع الأول 1448هـ', 1, datetime('now'), datetime('now'));
COMMIT;
