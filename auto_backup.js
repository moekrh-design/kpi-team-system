/**
 * auto_backup.js — نظام النسخ الاحتياطية التلقائية الاحترافي
 * ============================================================
 * الاستراتيجية:
 *  - نسخة فورية بعد كل عملية تغيير (مهمة/مستخدم/إعداد/حدث)
 *  - نسخة دورية كل 6 ساعات (حماية من الفقدان الصامت)
 *  - نسخة يومية محفوظة لمدة 30 يوم
 *  - تنظيف تلقائي: الاحتفاظ بـ 48 نسخة فورية + 30 يومية
 *  - كل نسخة تشمل: قاعدة البيانات + المرفقات + الشعار والختم
 *  - سجل مفصل لكل نسخة (من أجراها، السبب، الحجم)
 */

'use strict';
const path = require('path');
const fs   = require('fs');
const archiver = require('archiver');

// ─── ثوابت ─────────────────────────────────────────────────────────────────
const BACKUPS_DIR        = path.join(__dirname, 'data', 'auto_backups');
const BACKUP_LOG_FILE    = path.join(BACKUPS_DIR, '_backup_log.json');
const MAX_INSTANT_KEEP   = 48;   // أحدث 48 نسخة فورية (≈ 48 تغيير)
const MAX_DAILY_KEEP     = 30;   // 30 يوم
const PERIODIC_INTERVAL  = 6 * 60 * 60 * 1000; // 6 ساعات

// ─── تهيئة المجلد ──────────────────────────────────────────────────────────
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

// ─── قراءة/كتابة السجل ─────────────────────────────────────────────────────
function readLog() {
  try {
    if (fs.existsSync(BACKUP_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(BACKUP_LOG_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

function writeLog(entries) {
  try {
    fs.writeFileSync(BACKUP_LOG_FILE, JSON.stringify(entries, null, 2), 'utf8');
  } catch (e) {
    console.error('[AutoBackup] خطأ في كتابة السجل:', e.message);
  }
}

// ─── إنشاء نسخة احتياطية ───────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.trigger   - 'instant' | 'periodic' | 'daily' | 'manual'
 * @param {string} opts.reason    - وصف سبب النسخة (مثل: 'إضافة مهمة جديدة')
 * @param {string} [opts.user]    - اسم المستخدم الذي أجرى التغيير
 * @param {string} opts.appDir    - مسار مجلد التطبيق (__dirname)
 * @returns {Promise<object>}     - بيانات النسخة المنشأة
 */
async function createBackup({ trigger = 'instant', reason = '', user = 'system', appDir }) {
  const now     = new Date();
  const stamp   = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dateStr = now.toISOString().slice(0, 10);
  const fileName = `backup_${trigger}_${stamp}.zip`;
  const filePath = path.join(BACKUPS_DIR, fileName);

  return new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      const entry = {
        id:        stamp,
        file:      fileName,
        trigger,
        reason,
        user,
        date:      now.toISOString(),
        date_str:  dateStr,
        size_mb:   parseFloat(sizeMB),
        size_bytes: archive.pointer(),
      };

      // تسجيل في السجل
      const log = readLog();
      log.unshift(entry);
      // الاحتفاظ بآخر 500 سجل فقط في الملف
      writeLog(log.slice(0, 500));

      // تنظيف النسخ القديمة
      cleanupOldBackups(trigger);

      console.log(`[AutoBackup] ✅ ${trigger} | ${reason} | ${sizeMB} MB | ${fileName}`);
      resolve(entry);
    });

    archive.on('error', (err) => {
      console.error('[AutoBackup] ❌ خطأ:', err.message);
      // حذف الملف الناقص إن وجد
      try { fs.unlinkSync(filePath); } catch (_) {}
      reject(err);
    });

    archive.pipe(output);

    // ── محتوى النسخة ──────────────────────────────────────────────────────
    // 1. قاعدة البيانات
    const dbPath = path.join(appDir, 'data', 'app.db');
    if (fs.existsSync(dbPath)) {
      archive.file(dbPath, { name: 'data/app.db' });
    }

    // 2. مجلد المرفقات (uploads)
    const uploadsPath = path.join(appDir, 'uploads');
    if (fs.existsSync(uploadsPath)) {
      archive.directory(uploadsPath, 'uploads');
    }

    // 3. ملف manifest
    const manifest = {
      app:        'kpi-team-app',
      trigger,
      reason,
      user,
      created_at: now.toISOString(),
      restore_instructions: 'استخدم صفحة الإعدادات > النسخ الاحتياطية > استرجاع للاستعادة',
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    archive.finalize();
  });
}

// ─── تنظيف النسخ القديمة ────────────────────────────────────────────────────
function cleanupOldBackups(trigger) {
  try {
    const log = readLog();

    // تصفية حسب النوع
    const instantEntries = log.filter(e => e.trigger === 'instant');
    const dailyEntries   = log.filter(e => e.trigger === 'daily');

    // حذف النسخ الفورية الزائدة
    if (instantEntries.length > MAX_INSTANT_KEEP) {
      const toDelete = instantEntries.slice(MAX_INSTANT_KEEP);
      toDelete.forEach(e => deleteBackupFile(e.file));
    }

    // حذف النسخ اليومية القديمة (أكثر من 30 يوم)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAILY_KEEP);
    dailyEntries.forEach(e => {
      if (new Date(e.date) < cutoff) deleteBackupFile(e.file);
    });

    // تنظيف السجل من الإدخالات المحذوفة
    const existingFiles = new Set(
      fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.zip'))
    );
    const cleanedLog = log.filter(e => existingFiles.has(e.file));
    writeLog(cleanedLog);

  } catch (e) {
    console.error('[AutoBackup] خطأ في التنظيف:', e.message);
  }
}

function deleteBackupFile(fileName) {
  try {
    const fp = path.join(BACKUPS_DIR, fileName);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      console.log(`[AutoBackup] 🗑 حذف نسخة قديمة: ${fileName}`);
    }
  } catch (_) {}
}

// ─── جدولة النسخ الدورية ────────────────────────────────────────────────────
let _periodicTimer  = null;
let _dailyTimer     = null;
let _appDir         = null;

function startScheduler(appDir) {
  _appDir = appDir;

  // نسخة دورية كل 6 ساعات
  _periodicTimer = setInterval(async () => {
    try {
      await createBackup({ trigger: 'periodic', reason: 'نسخة دورية تلقائية (كل 6 ساعات)', appDir });
    } catch (_) {}
  }, PERIODIC_INTERVAL);

  // نسخة يومية في منتصف الليل
  scheduleDailyBackup(appDir);

  console.log('[AutoBackup] ✅ جدولة النسخ الاحتياطية التلقائية تعمل');
}

function scheduleDailyBackup(appDir) {
  const now       = new Date();
  const midnight  = new Date(now);
  midnight.setHours(0, 5, 0, 0); // 00:05 صباحاً
  if (midnight <= now) midnight.setDate(midnight.getDate() + 1);
  const msUntil = midnight - now;

  _dailyTimer = setTimeout(async () => {
    try {
      await createBackup({ trigger: 'daily', reason: 'نسخة يومية تلقائية (منتصف الليل)', appDir });
    } catch (_) {}
    // جدولة اليوم التالي
    scheduleDailyBackup(appDir);
  }, msUntil);
}

// ─── قائمة النسخ المتاحة (للواجهة) ─────────────────────────────────────────
/**
 * إرجاع النسخ الاحتياطية خلال آخر 30 يوم مع تفاصيلها
 */
function listBackups({ days = 30 } = {}) {
  const log = readLog();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // فلترة حسب التاريخ + التحقق من وجود الملف فعلياً
  const existing = new Set(
    fs.existsSync(BACKUPS_DIR)
      ? fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.zip'))
      : []
  );

  return log
    .filter(e => new Date(e.date) >= cutoff && existing.has(e.file))
    .map(e => ({
      ...e,
      file_path: path.join(BACKUPS_DIR, e.file),
      // تصنيف لوني للواجهة
      badge: e.trigger === 'daily'    ? 'يومية'
           : e.trigger === 'periodic' ? 'دورية'
           : e.trigger === 'manual'   ? 'يدوية'
           : 'فورية',
      badge_color: e.trigger === 'daily'    ? '#0d6efd'
                 : e.trigger === 'periodic' ? '#6f42c1'
                 : e.trigger === 'manual'   ? '#198754'
                 : '#fd7e14',
    }));
}

/**
 * إحصائيات سريعة للواجهة
 */
function getBackupStats() {
  const all = listBackups({ days: 30 });
  const totalSize = all.reduce((s, e) => s + (e.size_bytes || 0), 0);
  return {
    total:       all.length,
    instant:     all.filter(e => e.trigger === 'instant').length,
    periodic:    all.filter(e => e.trigger === 'periodic').length,
    daily:       all.filter(e => e.trigger === 'daily').length,
    manual:      all.filter(e => e.trigger === 'manual').length,
    total_mb:    (totalSize / 1024 / 1024).toFixed(1),
    last_backup: all[0] || null,
  };
}

// ─── Middleware: نسخة فورية قبل أي تغيير ────────────────────────────────────
/**
 * استخدام: أضف triggerInstantBackup(req, 'وصف التغيير') في أي route تريد حمايته
 */
async function triggerInstantBackup(req, reason) {
  if (!_appDir) return;
  const user = (req.session && req.session.username) ? req.session.username : 'system';
  try {
    await createBackup({ trigger: 'instant', reason, user, appDir: _appDir });
  } catch (e) {
    console.error('[AutoBackup] فشل النسخ الفوري:', e.message);
    // لا نوقف العملية — النسخ الاحتياطي لا يجب أن يعطل العمل
  }
}

module.exports = {
  createBackup,
  startScheduler,
  triggerInstantBackup,
  listBackups,
  getBackupStats,
  BACKUPS_DIR,
};
