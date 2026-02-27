-- Patch: Seed World Days + Saudi national occasions (annual)
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS world_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  day_date TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  source TEXT,
  source_ref TEXT,
  recurrence TEXT,
  month_day TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
DELETE FROM world_days
WHERE source_ref IS NOT NULL AND source_ref <> ''
  AND rowid NOT IN (SELECT MIN(rowid) FROM world_days WHERE source_ref IS NOT NULL AND source_ref <> '' GROUP BY source_ref);
CREATE UNIQUE INDEX IF NOT EXISTS idx_world_days_source_ref ON world_days(source_ref);
UPDATE world_days
SET title='يوم التأسيس',
    day_date='2000-02-22',
    category='مناسبة وطنية',
    source='mofa.gov.sa',
    recurrence='annual',
    month_day='02-22',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='ksa:founding-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('يوم التأسيس', '2000-02-22', 'مناسبة وطنية', NULL, 'mofa.gov.sa', 'ksa:founding-day', 'annual', '02-22', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='يوم العَلَم السعودي',
    day_date='2000-03-11',
    category='مناسبة وطنية',
    source='splonline.com.sa',
    recurrence='annual',
    month_day='03-11',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='ksa:flag-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('يوم العَلَم السعودي', '2000-03-11', 'مناسبة وطنية', NULL, 'splonline.com.sa', 'ksa:flag-day', 'annual', '03-11', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الوطني السعودي',
    day_date='2000-09-23',
    category='مناسبة وطنية',
    source='mofa.gov.sa',
    recurrence='annual',
    month_day='09-23',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='ksa:national-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الوطني السعودي', '2000-09-23', 'مناسبة وطنية', NULL, 'mofa.gov.sa', 'ksa:national-day', 'annual', '09-23', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي للتعليم',
    day_date='2000-01-24',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='01-24',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:education-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي للتعليم', '2000-01-24', 'أممي', NULL, 'un.org', 'un:education-day', 'annual', '01-24', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي للطاقة النظيفة',
    day_date='2000-01-26',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='01-26',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:clean-energy-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي للطاقة النظيفة', '2000-01-26', 'أممي', NULL, 'un.org', 'un:clean-energy-day', 'annual', '01-26', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي لإحياء ذكرى ضحايا الهولوكوست',
    day_date='2000-01-27',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='01-27',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:holocaust-remembrance';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي لإحياء ذكرى ضحايا الهولوكوست', '2000-01-27', 'أممي', NULL, 'un.org', 'un:holocaust-remembrance', 'annual', '01-27', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للبرايل',
    day_date='2000-01-04',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='01-04',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:braille-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للبرايل', '2000-01-04', 'أممي', NULL, 'un.org', 'un:braille-day', 'annual', '01-04', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للسرطان',
    day_date='2000-02-04',
    category='صحي',
    source='who.int',
    recurrence='annual',
    month_day='02-04',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='who:cancer-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للسرطان', '2000-02-04', 'صحي', NULL, 'who.int', 'who:cancer-day', 'annual', '02-04', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للإذاعة',
    day_date='2000-02-13',
    category='ثقافي',
    source='unesco.org',
    recurrence='annual',
    month_day='02-13',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='unesco:radio-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للإذاعة', '2000-02-13', 'ثقافي', NULL, 'unesco.org', 'unesco:radio-day', 'annual', '02-13', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي للغة الأم',
    day_date='2000-02-21',
    category='ثقافي',
    source='unesco.org',
    recurrence='annual',
    month_day='02-21',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='unesco:mother-language';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي للغة الأم', '2000-02-21', 'ثقافي', NULL, 'unesco.org', 'unesco:mother-language', 'annual', '02-21', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للمرأة',
    day_date='2000-03-08',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='03-08',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:womens-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للمرأة', '2000-03-08', 'أممي', NULL, 'un.org', 'un:womens-day', 'annual', '03-08', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي للسعادة',
    day_date='2000-03-20',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='03-20',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:happiness-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي للسعادة', '2000-03-20', 'أممي', NULL, 'un.org', 'un:happiness-day', 'annual', '03-20', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للمياه',
    day_date='2000-03-22',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='03-22',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:water-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للمياه', '2000-03-22', 'أممي', NULL, 'un.org', 'un:water-day', 'annual', '03-22', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للأرصاد الجوية',
    day_date='2000-03-23',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='03-23',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:meteorological-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للأرصاد الجوية', '2000-03-23', 'أممي', NULL, 'un.org', 'un:meteorological-day', 'annual', '03-23', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي لمكافحة الهدر (صفر نفايات)',
    day_date='2000-03-30',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='03-30',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:zero-waste-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي لمكافحة الهدر (صفر نفايات)', '2000-03-30', 'أممي', NULL, 'un.org', 'un:zero-waste-day', 'annual', '03-30', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للصحة',
    day_date='2000-04-07',
    category='صحي',
    source='who.int',
    recurrence='annual',
    month_day='04-07',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='who:health-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للصحة', '2000-04-07', 'صحي', NULL, 'who.int', 'who:health-day', 'annual', '04-07', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي لأمّنا الأرض',
    day_date='2000-04-22',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='04-22',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:mother-earth-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي لأمّنا الأرض', '2000-04-22', 'أممي', NULL, 'un.org', 'un:mother-earth-day', 'annual', '04-22', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للكتاب وحقوق المؤلف',
    day_date='2000-04-23',
    category='ثقافي',
    source='unesco.org',
    recurrence='annual',
    month_day='04-23',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='unesco:book-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للكتاب وحقوق المؤلف', '2000-04-23', 'ثقافي', NULL, 'unesco.org', 'unesco:book-day', 'annual', '04-23', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي لحرية الصحافة',
    day_date='2000-05-03',
    category='إعلام',
    source='un.org',
    recurrence='annual',
    month_day='05-03',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:press-freedom';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي لحرية الصحافة', '2000-05-03', 'إعلام', NULL, 'un.org', 'un:press-freedom', 'annual', '05-03', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للاتصالات ومجتمع المعلومات',
    day_date='2000-05-17',
    category='تقني',
    source='itu.int',
    recurrence='annual',
    month_day='05-17',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='itu:telecom-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للاتصالات ومجتمع المعلومات', '2000-05-17', 'تقني', NULL, 'itu.int', 'itu:telecom-day', 'annual', '05-17', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للنحل',
    day_date='2000-05-20',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='05-20',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:bee-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للنحل', '2000-05-20', 'أممي', NULL, 'un.org', 'un:bee-day', 'annual', '05-20', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي للتنوع البيولوجي',
    day_date='2000-05-22',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='05-22',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:biodiversity';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي للتنوع البيولوجي', '2000-05-22', 'أممي', NULL, 'un.org', 'un:biodiversity', 'annual', '05-22', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للإقلاع عن التبغ',
    day_date='2000-05-31',
    category='صحي',
    source='who.int',
    recurrence='annual',
    month_day='05-31',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='who:no-tobacco';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للإقلاع عن التبغ', '2000-05-31', 'صحي', NULL, 'who.int', 'who:no-tobacco', 'annual', '05-31', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للبيئة',
    day_date='2000-06-05',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='06-05',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:environment-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للبيئة', '2000-06-05', 'أممي', NULL, 'un.org', 'un:environment-day', 'annual', '06-05', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للمحيطات',
    day_date='2000-06-08',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='06-08',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:oceans-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للمحيطات', '2000-06-08', 'أممي', NULL, 'un.org', 'un:oceans-day', 'annual', '06-08', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للاجئين',
    day_date='2000-06-20',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='06-20',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:refugee-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للاجئين', '2000-06-20', 'أممي', NULL, 'un.org', 'un:refugee-day', 'annual', '06-20', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي للمشروعات المتناهية الصغر والصغيرة والمتوسطة',
    day_date='2000-06-27',
    category='اقتصاد',
    source='un.org',
    recurrence='annual',
    month_day='06-27',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:msme-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي للمشروعات المتناهية الصغر والصغيرة والمتوسطة', '2000-06-27', 'اقتصاد', NULL, 'un.org', 'un:msme-day', 'annual', '06-27', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للسكان',
    day_date='2000-07-11',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='07-11',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:population-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للسكان', '2000-07-11', 'أممي', NULL, 'un.org', 'un:population-day', 'annual', '07-11', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي لمهارات الشباب',
    day_date='2000-07-15',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='07-15',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:youth-skills-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي لمهارات الشباب', '2000-07-15', 'أممي', NULL, 'un.org', 'un:youth-skills-day', 'annual', '07-15', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي لالتهاب الكبد',
    day_date='2000-07-28',
    category='صحي',
    source='who.int',
    recurrence='annual',
    month_day='07-28',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='who:hepatitis-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي لالتهاب الكبد', '2000-07-28', 'صحي', NULL, 'who.int', 'who:hepatitis-day', 'annual', '07-28', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي للشباب',
    day_date='2000-08-12',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='08-12',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:youth-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي للشباب', '2000-08-12', 'أممي', NULL, 'un.org', 'un:youth-day', 'annual', '08-12', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للعمل الإنساني',
    day_date='2000-08-19',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='08-19',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:humanitarian-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للعمل الإنساني', '2000-08-19', 'أممي', NULL, 'un.org', 'un:humanitarian-day', 'annual', '08-19', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي لمحو الأمية',
    day_date='2000-09-08',
    category='ثقافي',
    source='unesco.org',
    recurrence='annual',
    month_day='09-08',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='unesco:literacy-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي لمحو الأمية', '2000-09-08', 'ثقافي', NULL, 'unesco.org', 'unesco:literacy-day', 'annual', '09-08', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي للسلام',
    day_date='2000-09-21',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='09-21',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:peace-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي للسلام', '2000-09-21', 'أممي', NULL, 'un.org', 'un:peace-day', 'annual', '09-21', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للسياحة',
    day_date='2000-09-27',
    category='أممي',
    source='unwto.org',
    recurrence='annual',
    month_day='09-27',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='unwto:tourism-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للسياحة', '2000-09-27', 'أممي', NULL, 'unwto.org', 'unwto:tourism-day', 'annual', '09-27', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للمعلم',
    day_date='2000-10-05',
    category='تعليمي',
    source='unesco.org',
    recurrence='annual',
    month_day='10-05',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='unesco:teachers-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للمعلم', '2000-10-05', 'تعليمي', NULL, 'unesco.org', 'unesco:teachers-day', 'annual', '10-05', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للصحة النفسية',
    day_date='2000-10-10',
    category='صحي',
    source='who.int',
    recurrence='annual',
    month_day='10-10',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='who:mental-health';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للصحة النفسية', '2000-10-10', 'صحي', NULL, 'who.int', 'who:mental-health', 'annual', '10-10', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للغذاء',
    day_date='2000-10-16',
    category='أممي',
    source='fao.org',
    recurrence='annual',
    month_day='10-16',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='fao:food-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للغذاء', '2000-10-16', 'أممي', NULL, 'fao.org', 'fao:food-day', 'annual', '10-16', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='يوم الأمم المتحدة',
    day_date='2000-10-24',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='10-24',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:un-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('يوم الأمم المتحدة', '2000-10-24', 'أممي', NULL, 'un.org', 'un:un-day', 'annual', '10-24', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للسكري',
    day_date='2000-11-14',
    category='صحي',
    source='who.int',
    recurrence='annual',
    month_day='11-14',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='who:diabetes-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للسكري', '2000-11-14', 'صحي', NULL, 'who.int', 'who:diabetes-day', 'annual', '11-14', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للطفل',
    day_date='2000-11-20',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='11-20',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:children-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للطفل', '2000-11-20', 'أممي', NULL, 'un.org', 'un:children-day', 'annual', '11-20', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للتلفزيون',
    day_date='2000-11-21',
    category='إعلام',
    source='un.org',
    recurrence='annual',
    month_day='11-21',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:television-day';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للتلفزيون', '2000-11-21', 'إعلام', NULL, 'un.org', 'un:television-day', 'annual', '11-21', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم الدولي للأشخاص ذوي الإعاقة',
    day_date='2000-12-03',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='12-03',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:persons-with-disabilities';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم الدولي للأشخاص ذوي الإعاقة', '2000-12-03', 'أممي', NULL, 'un.org', 'un:persons-with-disabilities', 'annual', '12-03', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي لحقوق الإنسان',
    day_date='2000-12-10',
    category='أممي',
    source='un.org',
    recurrence='annual',
    month_day='12-10',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='un:human-rights';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي لحقوق الإنسان', '2000-12-10', 'أممي', NULL, 'un.org', 'un:human-rights', 'annual', '12-10', 1, datetime('now'), datetime('now'));
UPDATE world_days
SET title='اليوم العالمي للغة العربية',
    day_date='2000-12-18',
    category='ثقافي',
    source='unesco.org',
    recurrence='annual',
    month_day='12-18',
    is_active=1,
    updated_at=datetime('now')
WHERE source_ref='unesco:arabic-language';
INSERT OR IGNORE INTO world_days
(title, day_date, category, notes, source, source_ref, recurrence, month_day, is_active, created_at, updated_at)
VALUES ('اليوم العالمي للغة العربية', '2000-12-18', 'ثقافي', NULL, 'unesco.org', 'unesco:arabic-language', 'annual', '12-18', 1, datetime('now'), datetime('now'));
COMMIT;