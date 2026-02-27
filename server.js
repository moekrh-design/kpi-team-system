const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt = require('bcrypt');
const multer = require('multer');
const methodOverride = require('method-override');
const dayjs = require('dayjs');
const bwipjs = require('bwip-js');
const QRCode = require('qrcode');
const { pipeline } = require('stream');
const { promisify } = require('util');

const archiver = require('archiver');
const unzipper = require('unzipper');
const ExcelJS = require('exceljs');
const { sendMail } = require('./email');

const { openDb, migrate } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const pump = promisify(pipeline);

// Kiosk theme keys (50 themes)
const KIOSK_THEME_KEYS = new Set(['dark_moe_01', 'dark_moe_02', 'dark_moe_03', 'dark_moe_04', 'dark_moe_05', 'dark_moe_06', 'dark_moe_07', 'dark_moe_08', 'dark_moe_09', 'dark_moe_10', 'dark_moe_11', 'dark_moe_12', 'dark_moe_13', 'dark_moe_14', 'dark_moe_15', 'dark_moe_16', 'dark_moe_17', 'dark_moe_18', 'dark_moe_19', 'dark_moe_20', 'dark_moe_21', 'dark_moe_22', 'dark_moe_23', 'dark_moe_24', 'dark_moe_25', 'light_moe_01', 'light_moe_02', 'light_moe_03', 'light_moe_04', 'light_moe_05', 'light_moe_06', 'light_moe_07', 'light_moe_08', 'light_moe_09', 'light_moe_10', 'light_moe_11', 'light_moe_12', 'light_moe_13', 'light_moe_14', 'light_moe_15', 'light_moe_16', 'light_moe_17', 'light_moe_18', 'light_moe_19', 'light_moe_20', 'light_moe_21', 'light_moe_22', 'light_moe_23', 'light_moe_24', 'light_moe_25']);
const KIOSK_THEME_DEFAULT = 'dark_moe_01';

// App version label (shown inside the system)
// Displayed in footer/admin update page
const APP_VERSION = 'v2.0.0';

// --------- Setup directories ---------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function ensureDir(p){
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// Project (Event) files live under uploads/projects/<eventId>/...
const PROJECT_FILES_DIR = path.join(UPLOAD_DIR, 'projects');
if (!fs.existsSync(PROJECT_FILES_DIR)) fs.mkdirSync(PROJECT_FILES_DIR, { recursive: true });

// Asset library thumbnails (small previews) live under uploads/asset_thumbs
const ASSET_THUMBS_DIR = path.join(UPLOAD_DIR, 'asset_thumbs');
if (!fs.existsSync(ASSET_THUMBS_DIR)) fs.mkdirSync(ASSET_THUMBS_DIR, { recursive: true });

const RESTORE_DIR = path.join(__dirname, 'data', 'restore_tmp');
if (!fs.existsSync(RESTORE_DIR)) fs.mkdirSync(RESTORE_DIR, { recursive: true });

// Session files directory (needed for session-file-store on Windows)
const SESSIONS_DIR = path.join(__dirname, 'data', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// --------- DB init ---------
let db = openDb();
migrate(db);

// Seed kiosk quotes (marketing/media/vision) to ensure at least 50 items
function seedKioskQuotes(db){
  try{
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kiosk_quotes'").get();
    if(!exists) return;
    const row = db.prepare("SELECT COUNT(*) AS c FROM kiosk_quotes").get();
    const count = Number(row && row.c ? row.c : 0);
    const minCount = 50;
    if(count >= minCount) return;

    const seedList = [
      "الإعلامُ الذكيّ يبدأ برسالةٍ واضحةٍ ولغةٍ بسيطة.",
      "التواصلُ المؤسّسيّ يَصنعُ الثقةَ قبل أن يَصنعَ الخبر.",
      "صورةٌ واحدةٌ قد تُلخِّصُ مشروعًا… فاجعلها مُتقنة.",
      "المحتوى يُقاسُ بأثره… لا بعدد المشاهدات فقط.",
      "الانطباعُ الأوّلُ لا يُعاد… صمِّمْه باحتراف.",
      "كلُّ دقيقةٍ على الشاشة فرصةٌ لتعزيز الصورة الذهنية.",
      "قصةُ نجاحٍ قصيرةٌ قد تُلهِمُ فريقًا كاملًا.",
      "التوثيقُ اليوميّ يحفظ الإنجاز ويُسهّل قياس الأداء.",
      "قياسُ الأثر يبدأ من هدفٍ مكتوبٍ بوضوح.",
      "الرسالةُ الموحدة تُقلّل الضجيج وتُضاعف الفاعلية.",
      "الشفافيةُ في التواصل تُسرّعُ الثقةَ وتُقلّلُ الإشاعة.",
      "العنوانُ الجيّد نصفُ المحتوى… والنصفُ الآخر تنفيذٌ رشيق.",
      "الهويةُ البصرية لغةٌ… لا تُغيّرها في منتصف الحديث.",
      "بساطةُ التصميم تُظهِرُ قوةَ الفكرة.",
      "الإبداعُ في الإخراج لا يُغني عن دقّة المعلومة.",
      "حين تُحسن سرد الأرقام… تُحسن إقناع الناس.",
      "الفرقُ بين خبرٍ عابرٍ ورسالةٍ مؤثرة: الهدف.",
      "توحيدُ القوالب يُسرّع العمل ويحفظ الجودة.",
      "البياناتُ الجيدة تُنتج قراراتٍ أسرع.",
      "اجعل المحتوى قصيرًا… لكن غنيًّا بالمعنى.",
      "المنصّةُ ليست هدفًا… الهدفُ أثرٌ يُذكر.",
      "رسالةٌ واحدةٌ لكل الجمهور… تُضيّع نصف الجمهور.",
      "افهم جمهورك قبل أن تكتب له.",
      "قيمةُ العمل تُرى في التفاصيل الصغيرة.",
      "الاحترافُ: أن تُنجز بسرعةٍ دون أن تُفرّط بالجودة.",
      "التحسينُ المستمرّ عادةُ الفرق الرائدة.",
      "جرّب… قِس… حسّن… ثم كرّر.",
      "لا تترك إنجازك بلا توثيق… فالنسيان سريع.",
      "الوقتُ في الإعلام يُساوي سمعة.",
      "الاستجابةُ السريعة تُطفئُ الشائعة قبل أن تكبر.",
      "أقصر طريقٍ للتأثير: رسالة صادقة.",
      "اصنع محتوى يجيب: ماذا؟ لماذا؟ كيف؟",
      "اختصر النص… ووسّع الفكرة.",
      "المعيارُ الحقيقي: هل غيّر المحتوى سلوكًا أو فهمًا؟",
      "المرونةُ في التخطيط تُحافظ على الاستمرارية.",
      "التحليلُ بعد النشر أهم من النشر نفسه.",
      "الأرشفةُ الذكية تُسهّل إعداد التقارير.",
      "قاعدة ذهبية: لا تنشر قبل التحقق.",
      "في زمن السرعة… الدقةُ تميّزك.",
      "الخطّةُ الإعلامية تُبنى على أهدافٍ قابلةٍ للقياس.",
      "اربط كل نشاطٍ بمؤشر… ليظهر الأثر.",
      "تجربةُ المستخدم تبدأ من أول نقرة.",
      "التناسقُ البصري يرفع الثقة تلقائيًا.",
      "الابتكارُ ليس فكرة… الابتكار تنفيذ.",
      "قوّةُ الفريق في وضوح الأدوار.",
      "اجعل التقارير مرئية… فالمرئيات تُقنع.",
      "التحول الرقميّ يُسرّع الإنجاز ويُحسن الخدمة.",
      "التطويرُ المؤسّسيّ يبدأ من ثقافة الفريق.",
      "رسائلُ اليوم تقود سمعةَ الغد.",
      "رؤيةُ المملكة 2030: أثرٌ… كفاءةٌ… وجودةُ حياة.",
      "التواصلُ الفعّال يدعم تحقيق مستهدفات رؤية 2030.",
      "المحتوى الموثوق يرفع المصداقية ويعزّز الصورة الذهنية.",
      "كل مبادرةٍ تُروى… تُلهم مبادراتٍ أخرى.",
      "النتائجُ تُقاس… والإنجازات تُروى.",
      "إنجازٌ بلا قصة… فرصةٌ ضائعة.",
      "اجعل التصميم يخدم الرسالة… لا يزاحمها.",
      "اصنع محتوى يليق بالمنجز… ويُظهر قيمته.",
      "المعيارية في العمل تُسهّل التكامل بين الفرق.",
      "حين تتكامل البيانات والإعلام… تتكامل الصورة.",
      "التميز يبدأ من احترام الوقت.",
      "الرسالةُ الهادفة تُبنى على قيمٍ واضحة.",
      "العملُ المؤسسيّ: توثيقٌ، تنظيمٌ، متابعةٌ، أثر.",
      "لا تُكثر الشرائح… كثّف الرسالة.",
      "العلامةُ المؤسسية تُبنى بالتراكم… كل يوم.",
      "قيادة الرأي تبدأ بالمعلومة الصحيحة.",
      "التفاعل الحقيقي: سؤال ذكي… وإجابة واضحة.",
      "لأننا نخدم المجتمع… نُحسن التواصل معه.",
      "الثقة رأس مال… حافظ عليها بالدقة والوضوح."
    ];

    const existing = new Set(db.prepare("SELECT text FROM kiosk_quotes").all().map(r => String(r.text||'').trim()).filter(Boolean));
    const ins = db.prepare("INSERT INTO kiosk_quotes (quote_text, is_active, created_at) VALUES(?, 1, datetime('now'))");
    let added = 0;
    for(const q of seedList){
      if(!q) continue;
      const t = String(q).trim();
      if(!t || existing.has(t)) continue;
      ins.run(t);
      existing.add(t);
      added++;
      const nowCount = count + added;
      if(nowCount >= minCount) break;
    }
  }catch(e){}
}


function seedWorldDays(db){
  try{
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='world_days'").get();
    if(!exists) return;
    const row = db.prepare("SELECT COUNT(*) AS c FROM world_days").get();
    const count = Number(row && row.c ? row.c : 0);
    const minCount = 30;
    if(count >= minCount) return;

    const seed = [
      { title:"اليوم الدولي للتعليم", md:"01-24", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للسرطان", md:"02-04", source:"WHO", ref:"https://www.who.int" },
      { title:"اليوم العالمي للإذاعة", md:"02-13", source:"UNESCO", ref:"https://www.unesco.org" },
      { title:"اليوم الدولي للّغة الأم", md:"02-21", source:"UNESCO", ref:"https://www.unesco.org" },
      { title:"اليوم العالمي للمرأة", md:"03-08", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي للسعادة", md:"03-20", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي للغابات", md:"03-21", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي لمتلازمة داون", md:"03-21", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للمياه", md:"03-22", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للأرصاد الجوية", md:"03-23", source:"WMO", ref:"https://public.wmo.int" },
      { title:"اليوم العالمي للتوعية بالتوحّد", md:"04-02", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للصحة", md:"04-07", source:"WHO", ref:"https://www.who.int" },
      { title:"يوم الأرض", md:"04-22", source:"EarthDay", ref:"https://www.earthday.org" },
      { title:"اليوم العالمي للكتاب وحقوق المؤلف", md:"04-23", source:"UNESCO", ref:"https://www.unesco.org" },
      { title:"اليوم العالمي لحرية الصحافة", md:"05-03", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي للأسر", md:"05-15", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للاتصالات ومجتمع المعلومات", md:"05-17", source:"ITU", ref:"https://www.itu.int" },
      { title:"اليوم العالمي للامتناع عن التدخين", md:"05-31", source:"WHO", ref:"https://www.who.int" },
      { title:"اليوم العالمي للوالدين", md:"06-01", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للبيئة", md:"06-05", source:"UNEP", ref:"https://www.unep.org" },
      { title:"اليوم العالمي للمحيطات", md:"06-08", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للاجئين", md:"06-20", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي لمكافحة المخدرات والاتجار غير المشروع بها", md:"06-26", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي لنيلسون مانديلا", md:"07-18", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي لمكافحة الاتجار بالأشخاص", md:"07-30", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي للشباب", md:"08-12", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي لمحو الأمية", md:"09-08", source:"UNESCO", ref:"https://www.unesco.org" },
      { title:"اليوم الدولي لصون طبقة الأوزون", md:"09-16", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي للسلام", md:"09-21", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للمعلم", md:"10-05", source:"UNESCO", ref:"https://www.unesco.org" },
      { title:"اليوم العالمي للصحة النفسية", md:"10-10", source:"WHO", ref:"https://www.who.int" },
      { title:"اليوم العالمي للغذاء", md:"10-16", source:"FAO", ref:"https://www.fao.org" },
      { title:"يوم الأمم المتحدة", md:"10-24", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للسكري", md:"11-14", source:"WHO", ref:"https://www.who.int" },
      { title:"اليوم الدولي للتسامح", md:"11-16", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للطفل", md:"11-20", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي للأشخاص ذوي الإعاقة", md:"12-03", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم الدولي للتطوع من أجل التنمية الاقتصادية والاجتماعية", md:"12-05", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"يوم حقوق الإنسان", md:"12-10", source:"UN", ref:"https://www.un.org/en/observances" },
      { title:"اليوم العالمي للغة العربية", md:"12-18", source:"UNESCO", ref:"https://www.unesco.org" }
    ];

    const insert = db.prepare(`
      INSERT INTO world_days
        (title, day_date, recurrence, month_day, country, category, source, source_ref, is_active, created_at, updated_at)
      VALUES
        (@title, @day_date, 'annual', @month_day, '', 'global', @source, @source_ref, 1, datetime('now'), datetime('now'))
    `);

    for (const it of seed){
      const month_day = String(it.md || '').trim();
      if (!/^\d{2}\-\d{2}$/.test(month_day)) continue;
      insert.run({
        title: it.title,
        day_date: `2000-${month_day}`,
        month_day,
        source: it.source || '',
        source_ref: it.ref || ''
      });
    }
  }catch(e){}
}

seedKioskQuotes(db);
seedWorldDays(db);

// Seed admin if not exists
function ensureAdmin() {
  const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (!admin) {
    const now = new Date().toISOString();
    const hash = bcrypt.hashSync('Admin@123', 10);
    db.prepare(`INSERT INTO users (username, password_hash, display_name, role, is_active, created_at)
      VALUES (?, ?, ?, 'admin', 1, ?)`)
      .run('admin', hash, 'مدير النظام', now);
    console.log('Seeded default admin -> username: admin | password: Admin@123');
  }
}
ensureAdmin();

// --------- View engine ---------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --------- Middlewares ---------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.use(session({
  store: new FileStore({ path: SESSIONS_DIR }),
  secret: process.env.SESSION_SECRET || 'kpi-team-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
}));

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --------- Kiosk live update (SSE) ---------
// الهدف: فتح وضع الشاشة على شاشة ثانية (نافذة أخرى) وتحديثها لحظيًا عند أي تغيير في البيانات.
const kioskSseClients = new Set();

function sseWrite(res, event, data) {
  try {
    const payload = (data == null) ? {} : data;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (_) {}
}

function kioskBroadcast(event = 'update', data = {}) {
  for (const client of kioskSseClients) {
    sseWrite(client, event, data);
  }
}

// Keep-alive ping (prevents some proxies from closing the stream)
setInterval(() => {
  for (const client of kioskSseClients) {
    try { client.write(': ping\n\n'); } catch (_) {}
  }
}, 25000);

// SSE endpoint (same origin => session cookie works)
app.get('/api/kiosk/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  // Hello message
  sseWrite(res, 'hello', { ts: Date.now() });

  kioskSseClients.add(res);
  req.on('close', () => {
    kioskSseClients.delete(res);
  });
});

function shouldBroadcastKiosk(req) {
  // Only broadcast on successful writes (POST/PUT/DELETE)
  if (!['POST', 'PUT', 'DELETE'].includes(String(req.method || '').toUpperCase())) return false;
  const p = String(req.path || '');
  if (p.startsWith('/api/kiosk')) return false;
  if (p.startsWith('/public')) return false;
  if (p.startsWith('/uploads')) return false;
  return true;
}

// Broadcast after any successful write request
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400 && shouldBroadcastKiosk(req)) {
      kioskBroadcast('update', { ts: Date.now(), path: req.path, method: req.method });
    }
  });
  next();
});

// --------- Helpers ---------
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = getUser(req.session.userId);
    if (!user) return res.redirect('/login');
    if (!roles.includes(user.role)) return res.status(403).send('غير مصرح');
    next();
  };
}


// --------- In-app updater (upload Update.zip) ---------
function safeNormalizeZipPath(p) {
  const rel = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const norm = path.posix.normalize(rel).replace(/^(\.\/)+/, '');
  if (!norm || norm === '.' ) return null;
  if (norm.startsWith('..') || norm.includes('../') || norm.includes('..\\')) {
    throw new Error('ملف ZIP يحتوي على مسار غير آمن');
  }
  if (norm.includes(':')) throw new Error('مسار غير آمن داخل ZIP');
  return norm;
}

async function safeExtractZip(zipPath, outDir) {
  ensureDir(outDir);
  const dir = await unzipper.Open.file(zipPath);
  const base = path.resolve(outDir);
  for (const f of dir.files) {
    const rel = safeNormalizeZipPath(f.path);
    if (!rel) { f.stream().resume(); continue; }
    const dest = path.resolve(path.join(outDir, ...rel.split('/')));
    if (!(dest === base || dest.startsWith(base + path.sep))) {
      throw new Error('محاولة كتابة خارج مجلد التحديث');
    }
    if (f.type === 'Directory') {
      ensureDir(dest);
      continue;
    }
    ensureDir(path.dirname(dest));
    await pump(f.stream(), fs.createWriteStream(dest));
  }
}

function isAllowedTarget(targetRel, allowList) {
  const t = String(targetRel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return allowList.some(a => t === a || t.startsWith(a));
}

function listRecentDirs(dirPath, limit = 8) {
  try {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
      .map(name => ({ name, full: path.join(dirPath, name), st: fs.statSync(path.join(dirPath, name)) }))
      .filter(x => x.st.isDirectory())
      .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)
      .slice(0, limit)
      .map(x => x.name);
  } catch (_) { return []; }
}

function readUpdateLog(logPath, limit = 10) {
  try {
    if (!fs.existsSync(logPath)) return [];
    const lines = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    const items = lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return items.reverse();
  } catch (_) { return []; }
}

function appendUpdateLog(logPath, obj) {
  try {
    ensureDir(path.dirname(logPath));
    fs.appendFileSync(logPath, JSON.stringify(obj) + "\n", 'utf8');
  } catch (_) {}
}

function copyFileWithDirs(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function applyUpdateFromDir(tmpDir, db) {
  const manifestPath = path.join(tmpDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('manifest.json غير موجود داخل التحديث');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const allow = Array.isArray(manifest.allow) ? manifest.allow : ['views/', 'public/'];
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const migrations = Array.isArray(manifest.migrations) ? manifest.migrations : [];
  const version = String(manifest.version || '').trim() || 'unknown';

  // Validate files
  for (const f of files) {
    const rel = safeNormalizeZipPath(f);
    if (!rel || !rel.startsWith('patch/')) throw new Error(`ملف غير مسموح: ${f}`);
    const targetRel = rel.replace(/^patch\//, '');
    if (!isAllowedTarget(targetRel, allow)) throw new Error(`غير مسموح تحديث: ${targetRel}`);
  }

  // Prepare backup
  const backupsDir = path.join(__dirname, '_backups');
  ensureDir(backupsDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupsDir, `backup_${stamp}_${version}`);
  ensureDir(backupDir);

  // Backup DB if migrations exist
  if (migrations.length) {
    try {
      const dbPath = path.join(__dirname, 'data', 'app.db');
      if (fs.existsSync(dbPath)) copyFileWithDirs(dbPath, path.join(backupDir, '_db', 'app.db'));
    } catch (_) {}
  }

  // Backup + apply files
  for (const f of files) {
    const rel = safeNormalizeZipPath(f);
    const src = path.join(tmpDir, rel);
    const targetRel = rel.replace(/^patch\//, '');
    const dst = path.join(__dirname, targetRel);
    const bak = path.join(backupDir, targetRel);

    if (!fs.existsSync(src)) throw new Error(`ملف مفقود: ${f}`);
    if (fs.existsSync(dst)) copyFileWithDirs(dst, bak);
    copyFileWithDirs(src, dst);
  }

  // Run migrations
  for (const m of migrations) {
    const rel = safeNormalizeZipPath(m);
    if (!rel || !rel.startsWith('migrations/')) throw new Error(`ملف ترقية غير مسموح: ${m}`);
    const sqlPath = path.join(tmpDir, rel);
    if (!fs.existsSync(sqlPath)) throw new Error(`ملف ترقية غير موجود: ${m}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    db.exec(sql);
  }

  // Save manifest inside backup
  try { copyFileWithDirs(manifestPath, path.join(backupDir, 'manifest.json')); } catch (_) {}

  return {
    version,
    notes: String(manifest.notes || '').trim(),
    restart_required: !!manifest.restart_required,
    backup_dir: backupDir
  };
}

function rollbackFromBackup(backupName) {
  const backupsDir = path.join(__dirname, '_backups');
  const backupDir = path.join(backupsDir, backupName);
  if (!fs.existsSync(backupDir)) throw new Error('نسخة احتياطية غير موجودة');

  // Restore files in backup (exclude _db and manifest)
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (name === '_db') continue;
        walk(full);
      } else {
        const rel = path.relative(backupDir, full);
        if (rel === 'manifest.json') continue;
        const dst = path.join(__dirname, rel);
        copyFileWithDirs(full, dst);
      }
    }
  };
  walk(backupDir);

  // Restore DB if present
  let restoredDb = false;
  const bakDb = path.join(backupDir, '_db', 'app.db');
  if (fs.existsSync(bakDb)) {
    const dstDb = path.join(__dirname, 'data', 'app.db');
    copyFileWithDirs(bakDb, dstDb);
    restoredDb = true;
  }
  return restoredDb;
}

// Task approval permission: supervisors/admins always, optionally specific employees
function requireApprovePermission(req, res, next) {
  const user = getUser(req.session.userId);
  if (!user) return res.redirect('/login');
  if (user.role === 'admin' || user.role === 'supervisor') return next();
  if (user.role === 'employee' && Number(user.can_approve_tasks || 0) === 1) return next();
  return res.status(403).send('غير مصرح');
}

function getUser(userId) {
  if (!userId) return null;
  return db.prepare('SELECT id, username, display_name, role, user_kind, can_login, can_approve_tasks, specialty, email, is_active FROM users WHERE id=?').get(userId);
}

function getSettings() {
  return db.prepare('SELECT * FROM settings WHERE id=1').get();
}

function fmtDate(d) {
  if (!d) return '';
  return dayjs(d).format('YYYY-MM-DD');
}

function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stageStatusLabelAr(st) {
  if (st === 'completed') return 'مكتملة';
  if (st === 'in_progress') return 'جارية';
  if (st === 'cancelled') return 'ملغاة';
  return 'جديدة';
}

function createNotification(userId, { type, title, body, url, meta } = {}) {
  try {
    db.prepare(`INSERT INTO notifications (user_id, type, title, body, url, meta_json, is_read, created_at)
                VALUES (?,?,?,?,?,?,0,datetime('now'))`)
      .run(
        Number(userId),
        String(type || 'general'),
        String(title || ''),
        body ? String(body) : null,
        url ? String(url) : null,
        meta ? JSON.stringify(meta) : null
      );
  } catch (e) {
    // ignore (table missing etc.)
  }
}

function getUnreadNotificationsCount(userId) {
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND is_read=0').get(Number(userId));
    return row ? Number(row.c || 0) : 0;
  } catch (e) {
    return 0;
  }
}

function markNotificationRead(userId, notifId) {
  try {
    db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=? AND id=?').run(Number(userId), Number(notifId));
  } catch (e) {}
}

function markAllNotificationsRead(userId) {
  try {
    db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(Number(userId));
  } catch (e) {}
}

function listNotifications(userId, limit = 200) {
  try {
    return db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT ?').all(Number(userId), Number(limit));
  } catch (e) {
    return [];
  }
}

function buildTaskAssignmentEmailHtml(task, stages, userId, taskLink, reason) {
  const isMain = task.employee_id && Number(task.employee_id) === Number(userId);
  const descTxt = stripHtmlBasic(task.description || '');
  const myStages = (stages || []).filter(s => Number(s.assigned_to) === Number(userId) && String(s.status || '') !== 'cancelled');

  const subjectHint = reason === 'task_reassigned' ? 'تحديث إسناد' : 'إسناد';
  const headerTitle = reason === 'task_reassigned' ? 'تم تحديث إسناد مهمة' : 'تم إسناد مهمة';

  const stagesTable = (rows) => {
    if (!rows || !rows.length) return '<div style="color:#666">لا توجد مراحل مرتبطة.</div>';
    const tr = rows.map(r => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb">${escHtml(r.stage_name || '')}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${escHtml(r.assignee_name || '-')}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${Math.round(Number(r.progress || 0))}%</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${escHtml(stageStatusLabelAr(String(r.status || 'new')))}</td>
      </tr>
    `).join('');
    return `
      <table style="width:100%;border-collapse:collapse;margin-top:8px">
        <thead>
          <tr>
            <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc">المرحلة</th>
            <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc">المسند له</th>
            <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc">التقدم</th>
            <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc">الحالة</th>
          </tr>
        </thead>
        <tbody>${tr}</tbody>
      </table>
    `;
  };

  const myList = () => {
    if (!myStages.length) return '<div style="color:#666">لا توجد مراحل محددة لك داخل هذه المهمة.</div>';
    const items = myStages.map(r => `
      <li style="margin:4px 0"><b>${escHtml(r.stage_name || '')}</b> — التقدم: ${Math.round(Number(r.progress || 0))}% — الحالة: ${escHtml(stageStatusLabelAr(String(r.status || 'new')))}</li>
    `).join('');
    return `<ul style="margin:8px 0 0 0;padding:0 18px">${items}</ul>`;
  };

  return `
    <div style="font-family:Tahoma,Arial;direction:rtl;text-align:right;line-height:1.8">
      <div style="font-size:18px;font-weight:700;margin-bottom:6px">${headerTitle}</div>
      <div style="color:#111827"><b>المهمة:</b> ${escHtml(task.title || '')}</div>
      ${task.event_title ? `<div><b>المناسبة:</b> ${escHtml(task.event_title)}</div>` : ``}
      ${task.supervisor_name ? `<div><b>المشرف:</b> ${escHtml(task.supervisor_name)}</div>` : ``}
      ${task.due_date ? `<div><b>تاريخ الاستحقاق:</b> ${escHtml(fmtDate(task.due_date))}</div>` : ``}
      ${descTxt ? `<div style="margin-top:6px"><b>الوصف:</b> ${escHtml(descTxt)}</div>` : ``}
      <div style="margin-top:12px;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#fcfcfd">
        <div style="font-weight:700;margin-bottom:6px">${isMain ? 'تفاصيل المراحل (كامل المهمة)' : 'المطلوب منك داخل المهمة'}</div>
        ${isMain ? stagesTable(stages) : myList()}
      </div>
      <div style="margin-top:12px">
        <a href="${taskLink}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:8px 12px;border-radius:8px">فتح المهمة</a>
      </div>
      <div style="margin-top:10px;color:#6b7280;font-size:12px">نظام المهام ومؤشرات الأداء</div>
    </div>
  `;
}

function sendTaskAssignmentEmailsAll(req, taskId, { reason } = {}) {
  try {
    const settings = getSettings();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const task = db.prepare(`
      SELECT t.*,
        e.title AS event_title,
        u1.display_name AS employee_name, u1.email AS employee_email,
        u2.display_name AS supervisor_name
      FROM tasks t
      LEFT JOIN events e ON e.id=t.event_id
      LEFT JOIN users u1 ON u1.id=t.employee_id
      LEFT JOIN users u2 ON u2.id=t.supervisor_id
      WHERE t.id=?
    `).get(Number(taskId));
    if (!task) return;

    const stages = db.prepare(`
      SELECT s.*, u.display_name AS assignee_name, u.email AS assignee_email
      FROM task_stages s
      LEFT JOIN users u ON u.id=s.assigned_to
      WHERE s.task_id=? AND s.status!='cancelled'
      ORDER BY s.sort_order ASC, s.id ASC
    `).all(Number(taskId));

    const recipients = [];
    if (task.employee_id) recipients.push(Number(task.employee_id));
    for (const s of stages) if (s.assigned_to) recipients.push(Number(s.assigned_to));

    const uniq = [...new Set(recipients)].filter(Boolean);
    const taskLink = `${baseUrl}/tasks/${taskId}`;

    for (const uid of uniq) {
      const user = db.prepare('SELECT id, display_name, email FROM users WHERE id=?').get(uid);
      if (!user || !user.email) continue;

      const subjectPrefix = reason === 'task_reassigned' ? 'تحديث إسناد مهمة' : 'تم إسناد مهمة';
      const subject = `${subjectPrefix}: ${task.title}`;

      const html = buildTaskAssignmentEmailHtml(task, stages, uid, taskLink, reason || 'new_task');
      sendMail(settings, { to: user.email, subject, html }).catch(() => {});

      createNotification(uid, {
        type: 'task_assigned',
        title: reason === 'task_reassigned' ? 'تحديث إسناد مهمة' : 'مهمة جديدة',
        body: task.title,
        url: `/tasks/${taskId}`,
        meta: { task_id: Number(taskId), reason: reason || 'new_task' }
      });
    }
  } catch (e) {
    // ignore
  }
}

function sendStageAssignedEmailAndNotify(req, { taskId, stageName, userId }) {
  try {
    const settings = getSettings();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const task = db.prepare('SELECT id, title, due_date FROM tasks WHERE id=?').get(Number(taskId));
    if (!task) return;
    const user = db.prepare('SELECT id, display_name, email FROM users WHERE id=?').get(Number(userId));
    if (user && user.email) {
      const taskLink = `${baseUrl}/tasks/${taskId}`;
      const subject = `تم إسناد مرحلة لك ضمن مهمة: ${task.title}`;
      const html = `
        <div style="font-family:Tahoma,Arial;direction:rtl;text-align:right;line-height:1.8">
          <h3 style="margin:0 0 8px 0">تم إسناد مرحلة لك</h3>
          <div><b>المهمة:</b> ${escHtml(task.title || '')}</div>
          <div><b>المرحلة:</b> ${escHtml(stageName || '')}</div>
          ${task.due_date ? `<div><b>استحقاق المهمة:</b> ${escHtml(fmtDate(task.due_date))}</div>` : ``}
          <div style="margin-top:10px"><a href="${taskLink}">فتح المهمة</a></div>
        </div>
      `;
      sendMail(settings, { to: user.email, subject, html }).catch(() => {});
    }
    createNotification(Number(userId), {
      type: 'stage_assigned',
      title: 'تم إسناد مرحلة لك',
      body: `${task.title} — ${stageName}`,
      url: `/tasks/${taskId}`,
      meta: { task_id: Number(taskId), stage_name: stageName }
    });
  } catch (e) {}
}

// --------- World Days Import Helpers ---------
function stripHtmlBasic(html) {
  if (!html) return '';
  let out = String(html);
  out = out.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  out = out.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  out = out.replace(/<[^>]+>/g, ' ');
  out = out.replace(/&nbsp;/g, ' ');
  out = out.replace(/&amp;/g, '&');
  out = out.replace(/&quot;/g, '"');
  out = out.replace(/&#39;/g, "'");
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

// Similar to stripHtmlBasic but preserves line breaks for list-style pages
function stripHtmlWithBreaks(html) {
  let out = String(html || '');
  // Remove scripts/styles
  out = out.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  out = out.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  // Add line breaks around common block tags
  out = out.replace(/<\s*br\s*\/?>/gi, '\n');
  out = out.replace(/<\/(p|li|tr|div|h\d)\s*>/gi, '\n');
  out = out.replace(/<\s*(p|li|tr|div|h\d)[^>]*>/gi, '\n');
  // Strip remaining tags
  out = out.replace(/<[^>]+>/g, ' ');
  // Decode basic entities
  out = out.replace(/&nbsp;/g, ' ');
  out = out.replace(/&amp;/g, '&');
  out = out.replace(/&quot;/g, '"');
  out = out.replace(/&#39;/g, "'");
  // Normalize whitespace but keep newlines
  out = out.replace(/\r/g, '');
  out = out.replace(/[ \t]+/g, ' ');
  out = out.replace(/\n[ \t]+/g, '\n');
  out = out.replace(/\n{2,}/g, '\n');
  return out.trim();
}

function monthNumberFromLabel(label) {
  const s = String(label || '').toLowerCase();

  // Arabic (UN often shows Arabic/English combined with a slash)
  const ar = String(label || '').replace(/\s+/g, ' ').trim();
  const pick = (k) => ar.includes(k);
  if (pick('يناير') || pick('كانون الثاني') || s.includes('january')) return 1;
  if (pick('فبراير') || pick('شباط') || s.includes('february')) return 2;
  if (pick('مارس') || pick('آذار') || pick('اذار') || s.includes('march')) return 3;
  if (pick('أبريل') || pick('ابريل') || pick('نيسان') || s.includes('april')) return 4;
  if (pick('مايو') || pick('أيار') || pick('ايار') || s.includes('may')) return 5;
  if (pick('يونيو') || pick('حزيران') || s.includes('june')) return 6;
  if (pick('يوليو') || pick('تموز') || s.includes('july')) return 7;
  if (pick('أغسطس') || pick('اغسطس') || pick('آب') || pick('اب') || s.includes('august')) return 8;
  if (pick('سبتمبر') || pick('أيلول') || pick('ايلول') || s.includes('september')) return 9;
  if (pick('أكتوبر') || pick('اكتوبر') || pick('تشرين الأول') || pick('تشرين الاول') || s.includes('october')) return 10;
  if (pick('نوفمبر') || pick('تشرين الثاني') || s.includes('november')) return 11;
  if (pick('ديسمبر') || pick('كانون الأول') || pick('كانون الاول') || s.includes('december')) return 12;

  // Abbreviations
  const abbr = s.slice(0, 4);
  if (abbr === 'jan') return 1;
  if (abbr === 'feb') return 2;
  if (abbr === 'mar') return 3;
  if (abbr === 'apr') return 4;
  if (abbr === 'may') return 5;
  if (abbr === 'jun') return 6;
  if (abbr === 'jul') return 7;
  if (abbr === 'aug') return 8;
  if (abbr === 'sep' || abbr === 'sept') return 9;
  if (abbr === 'oct') return 10;
  if (abbr === 'nov') return 11;
  if (abbr === 'dec') return 12;
  return null;
}

function computeNextOccurrenceDate(monthNum, dayNum) {
  const m = Number(monthNum || 0);
  const d = Number(dayNum || 0);
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const today = dayjs().startOf('day');
  let dt = dayjs(`${today.year()}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  if (!dt.isValid()) return null;
  if (dt.isBefore(today)) dt = dt.add(1, 'year');
  return dt.format('YYYY-MM-DD');
}

function looksLikeIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

function parseWorldDaysFromUnArabic(html) {
  // UN Arabic list is typically: "<day> <month> – <title>".
  // The page structure changes often, so we:
  // 1) Convert to text preserving line breaks.
  // 2) Parse line-by-line, with fallback chunk parsing.

  const cleanTitle = (s) => {
    let t = String(s || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/\((?:[^()]{0,200})\)/g, ' ').trim();
    t = t.replace(/\[[^\]]{0,200}\]/g, ' ').trim();
    t = t.replace(/^[-–—•\s:؛\.]+/g, '').trim();
    t = t.replace(/[\s\.,،:؛\-]+$/g, '').trim();
    t = t.replace(/^قائمة\s+الأيام\s+والأسابيع\s+الدولية\s*/,'').trim();
    return t.replace(/\s+/g, ' ').trim();
  };

  const monthOnly = (t) => {
    const x = String(t || '').trim();
    if (!x) return false;
    if (/^\d+$/.test(x)) return true;
    const arMonths = ['يناير','فبراير','مارس','أبريل','ابريل','مايو','يونيو','يوليو','أغسطس','اغسطس','سبتمبر','أكتوبر','اكتوبر','نوفمبر','ديسمبر',
      'كانون الثاني','شباط','آذار','اذار','نيسان','أيار','ايار','حزيران','تموز','آب','اب','أيلول','ايلول','تشرين الأول','تشرين الاول','تشرين الثاني','كانون الأول','كانون الاول'];
    if (arMonths.some(mm => x === mm)) return true;
    const low = x.toLowerCase();
    const enMonths = ['january','february','march','april','may','june','july','august','september','october','november','december',
      'jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec'];
    return enMonths.includes(low);
  };

  const txt = stripHtmlWithBreaks(html);
  if (!txt) return [];
  const lines = txt.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const items = [];
  const seen = new Set();
  const add = (title, day, month, rawMonth) => {
    const t = cleanTitle(title);
    if (!t || monthOnly(t)) return;
    const key = `${month}-${day}-${t.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ title: t, day: Number(day), month: Number(month), raw_month: rawMonth || null });
  };

  const tryParseLine = (line) => {
    // Common formats:
    // 1) "1 يناير – عنوان"  (dash)
    // 2) "1 يناير عنوان"    (space)
    let m = line.match(/^(\d{1,2})\s+([^\d]{2,50})\s*[-–—:؛]\s*(.+)$/);
    if (!m) m = line.match(/^(\d{1,2})\s+([^\d]{2,50})\s+(.+)$/);
    if (m) {
      const day = Number(m[1]);
      const rawMonth = String(m[2] || '').trim();
      const month = monthNumberFromLabel(rawMonth);
      const title = String(m[3] || '').trim();
      if (month && day >= 1 && day <= 31 && title) {
        add(title, day, month, rawMonth);
        return true;
      }
    }
    return false;
  };

  for (const line of lines) {
    if (monthOnly(line)) continue;
    if (tryParseLine(line)) continue;

    // Fallback: a line can contain multiple items.
    // Split whenever we see "<day> <month>" starting.
    const parts = line.split(/\s+(?=\d{1,2}\s+[^\d]{2,50}(?:\s*[-–—:؛]|\s))/g);
    if (parts.length > 1) {
      for (const p of parts) {
        const pp = String(p || '').trim();
        if (!pp) continue;
        tryParseLine(pp);
      }
    }
  }

  return items;
}

function parseWorldDaysFromUnescoEnglish(html) {
  const items = [];
  const re1 = /(\b\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s*<a[^>]*>([^<]{3,220})<\/a>/gi;
  let m;
  while ((m = re1.exec(String(html || ''))) !== null) {
    const dayNum = Number(m[1]);
    const monthNum = monthNumberFromLabel(m[2]);
    const title = String(m[3] || '').replace(/\s+/g,' ').trim();
    if (monthNum && title) items.push({ title, day: dayNum, month: monthNum });
  }
  // Fallback: sometimes date could appear after the link
  if (items.length === 0) {
    const re2 = /<a[^>]*>([^<]{3,220})<\/a>\s*(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)/gi;
    while ((m = re2.exec(String(html || ''))) !== null) {
      const title = String(m[1] || '').replace(/\s+/g,' ').trim();
      const dayNum = Number(m[2]);
      const monthNum = monthNumberFromLabel(m[3]);
      if (monthNum && title) items.push({ title, day: dayNum, month: monthNum });
    }
  }
  return items;
}

function calcProgress(done, target) {
  const d = Number(done || 0);
  const t = Number(target || 0);
  if (t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((d / t) * 100)));
}

function max0min100(n){
  n = Number(n || 0);
  if (Number.isNaN(n)) n = 0;
  return Math.max(0, Math.min(100, n));
}

async function safeFetchText(url, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 12000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (KPI Team System; +https://example.invalid)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ...(opts.headers || {})
  };
  try {
    const res = await fetch(url, { method: 'GET', ...opts, headers, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function safeSlug(s){
  const x = String(s || '').trim();
  if (!x) return 'project';
  // Keep Arabic + Latin + digits + dash; normalize spaces to dashes
  const out = x
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06FF-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (out || 'project').slice(0, 48);
}


function computeTaskStatus(task) {
  // Overdue auto flag (do not override completed/cancelled)
  if (task.status === 'completed' || task.status === 'cancelled') return task.status;
  if (task.due_date) {
    const due = dayjs(task.due_date);
    if (due.isValid() && due.endOf('day').isBefore(dayjs())) {
      return task.status === 'pending_approval' ? 'pending_approval' : 'overdue';
    }
  }
  return task.status;
}

// --------- Stages (تفصيل المهام) ---------
function ensureArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

const STAGE_TEMPLATES = [
  { key: 'idea', name: 'كتابة فكرة' },
  { key: 'research', name: 'بحث وتجميع معلومات' },
  { key: 'brief', name: 'إعداد ملخص/Brief' },
  { key: 'script', name: 'كتابة سيناريو' },
  { key: 'copy', name: 'صياغة محتوى/نص إعلامي' },
  { key: 'storyboard', name: 'ستوري بورد / توزيع مشاهد' },
  { key: 'coordination', name: 'تنسيق وتجهيز' },
  { key: 'followup', name: 'متابعة إنتاج' },

  { key: 'shooting', name: 'تصوير فيديو' },
  { key: 'photo', name: 'تصوير فوتوغرافي' },
  { key: 'design', name: 'تصميم' },
  { key: 'layout', name: 'تنسيق وإخراج' },
  { key: 'graphics', name: 'جرافيك / موشن' },
  { key: 'animation', name: 'تحريك/أنيميشن' },

  { key: 'voice', name: 'تسجيل صوت' },
  { key: 'soundfx', name: 'مؤثرات/مكساج صوت' },
  { key: 'subtitles', name: 'ترجمة/كتابة نصوص' },

  { key: 'montage', name: 'مونتاج' },
  { key: 'programming', name: 'برمجة / أتمتة' },
  { key: 'report', name: 'تنفيذ تقرير' },
  { key: 'press', name: 'خبر/بيان صحفي' },
  { key: 'social', name: 'منشور منصات' },
  { key: 'publish', name: 'نشر/رفع' },

  { key: 'review', name: 'مراجعة واعتماد' },
  { key: 'measure', name: 'قياس وتحليل' },
];


function getStageTemplatesFromSettings(settings) {
  // Admin can override templates by writing one item per line in "الثوابت"
  // Each line may be: key|label  OR just label
  const raw = (settings && settings.stage_templates_text) ? String(settings.stage_templates_text) : '';
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return STAGE_TEMPLATES;

  const crypto = require('crypto');
  const out = [];
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim()).filter(Boolean);
    let key, name;
    if (parts.length >= 2) {
      key = parts[0];
      name = parts.slice(1).join(' | ');
    } else {
      name = parts[0];
      key = 'tpl_' + crypto.createHash('md5').update(name).digest('hex').slice(0, 10);
    }
    out.push({ key, name });
  }
  // Ensure unique keys
  const seen = new Set();
  return out.filter(t => (seen.has(t.key) ? false : (seen.add(t.key), true)));
}


function stageNameFromKey(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  // Try custom templates from settings first (supports tpl_xxx keys)
  try {
    const settings = getSettings();
    const list = getStageTemplatesFromSettings(settings) || [];
    const t1 = list.find(x => x && x.key === k);
    if (t1) return String(t1.name || t1.label || k).trim();
  } catch (e) {
    // ignore
  }
  // Fallback to defaults
  const t = STAGE_TEMPLATES.find(x => x.key === k);
  return t ? t.name : k;
}

function isTaskVisibleToEmployee(taskId, employeeId) {
  const row = db.prepare(`SELECT 1 AS ok FROM tasks WHERE id=? AND employee_id=? LIMIT 1`).get(taskId, employeeId);
  if (row) return true;
  const st = db.prepare(`SELECT 1 AS ok FROM task_stages WHERE task_id=? AND assigned_to=? LIMIT 1`).get(taskId, employeeId);
  return !!st;
}

function isUserInEvent(me, eventId){
  const eid = Number(eventId || 0);
  if (!eid) return false;
  if (!me) return false;
  if (me.role === 'admin') return true;

  const ev = db.prepare('SELECT id, supervisor_id FROM events WHERE id=?').get(eid);
  if (!ev) return false;

  if (me.role === 'supervisor') {
    if (Number(ev.supervisor_id || 0) === Number(me.id)) return true;
    const row = db.prepare('SELECT 1 AS ok FROM tasks WHERE event_id=? AND supervisor_id=? LIMIT 1').get(eid, me.id);
    return !!row;
  }

  if (me.role === 'employee') {
    const row = db.prepare(`
      SELECT 1 AS ok
      FROM tasks t
      WHERE t.event_id=?
        AND (
          t.employee_id=?
          OR EXISTS (SELECT 1 FROM task_stages s WHERE s.task_id=t.id AND s.assigned_to=?)
        )
      LIMIT 1
    `).get(eid, me.id, me.id);
    return !!row;
  }

  return false;
}

function uniqNums(list) {
  const out = [];
  const seen = new Set();
  for (const x of (list || [])) {
    const n = Number(x || 0);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

// Events user can access (used for asset library visibility)
function getAccessibleEventIds(me) {
  if (!me) return [];
  if (me.role === 'admin') return [];
  if (me.role === 'supervisor') {
    const rows = db.prepare(`
      SELECT e.id
      FROM events e
      WHERE e.supervisor_id=?
      UNION
      SELECT DISTINCT t.event_id AS id
      FROM tasks t
      WHERE t.event_id IS NOT NULL AND t.supervisor_id=?
    `).all(me.id, me.id);
    return uniqNums(rows.map(r => r.id));
  }
  // employee
  const rows = db.prepare(`
    SELECT DISTINCT t.event_id AS id
    FROM tasks t
    WHERE t.event_id IS NOT NULL
      AND (
        t.employee_id=?
        OR EXISTS (SELECT 1 FROM task_stages s WHERE s.task_id=t.id AND s.assigned_to=?)
      )
  `).all(me.id, me.id);
  return uniqNums(rows.map(r => r.id));
}

function getSupervisorOwnedEventIds(me) {
  if (!me) return [];
  if (me.role !== 'supervisor') return [];
  const rows = db.prepare('SELECT id FROM events WHERE supervisor_id=?').all(me.id);
  return uniqNums(rows.map(r => r.id));
}

function recalcTaskFromStages(taskId, opts = {}) {
  // SQLite string literals must use single quotes. Double quotes would be treated as an identifier.
  const stages = db.prepare('SELECT * FROM task_stages WHERE task_id=? AND status<>\'cancelled\' ORDER BY sort_order ASC').all(taskId);
  if (!stages || stages.length === 0) return;

  // Normalize weights (equal split by default)
  const count = stages.length;
  const baseW = count ? (100 / count) : 0;
  let sum = 0;
  for (const s of stages) {
    const w = (Number(s.weight || 0) > 0) ? Number(s.weight) : baseW;
    sum += (Math.max(0, Math.min(100, Number(s.progress || 0))) * w) / 100;
  }
  const done = Math.max(0, Math.min(100, Math.round(sum)));

  // Status based on stages
  const anyProgress = stages.some(s => Number(s.progress || 0) > 0);
  const allDone = stages.every(s => Number(s.progress || 0) >= 100);
  let status = anyProgress ? 'in_progress' : 'new';
  if (allDone) status = opts.completeIfSupervisor ? 'completed' : 'pending_approval';

  // NOTE: SQLite string literals must use single quotes (') not double quotes (")
  db.prepare("UPDATE tasks SET progress_mode='stages', target_value=100, done_value=?, status=?, updated_at=? WHERE id=?")
    .run(done, status, new Date().toISOString(), taskId);
}




// --------- File helpers ---------
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    const from = path.join(src, ent.name);
    const to = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function safeRemoveDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (_) {}
}

// --------- Alerts: due soon ---------
function getDueSoon(me) {
  if (!me) return { count: 0, items: [] };

  const from = dayjs().format('YYYY-MM-DD');
  const to = dayjs().add(2, 'day').format('YYYY-MM-DD');

  let where = "t.status NOT IN ('completed','cancelled') AND t.due_date IS NOT NULL";
  const params = [];

  if (me.role === 'employee') {
    where += ' AND (t.employee_id=? OR EXISTS (SELECT 1 FROM task_stages s WHERE s.task_id=t.id AND s.assigned_to=?))';
    params.push(me.id, me.id);
  } else if (me.role === 'supervisor') {
    where += ' AND t.supervisor_id=?';
    params.push(me.id);
  }

  where += ' AND date(t.due_date) >= date(?) AND date(t.due_date) <= date(?)';
  params.push(from, to);

  const items = db.prepare(`
    SELECT t.id, t.title, t.due_date,
      u1.display_name AS employee_name
    FROM tasks t
    LEFT JOIN users u1 ON u1.id=t.employee_id
    WHERE ${where}
    ORDER BY date(t.due_date) ASC
    LIMIT 5
  `).all(...params)

  return { count: items.length, items };
}

// --------- Report helpers (QR/Barcode/Stats) ---------
async function buildReportMeta(req, title, rows) {
  const settings = getSettings();
  const prefix = (settings && settings.report_prefix) ? String(settings.report_prefix).trim() : '';
  const reportNo = `${prefix ? prefix + '-' : ''}${dayjs().format('YYYYMMDD')}-${Math.floor(100000 + Math.random() * 900000)}`;

  // Count attachments for tasks included in report
  let attachmentsCount = 0;
  try {
    const ids = (rows || []).map(r => r.id).filter(Boolean);
    if (ids.length) {
      const placeholders = ids.map(_ => '?').join(',');
      const row = db.prepare(`SELECT COUNT(*) AS cnt FROM attachments WHERE task_id IN (${placeholders})`).get(...ids);
      attachmentsCount = Number(row?.cnt || 0);
    }
  } catch (e) {
    attachmentsCount = 0;
  }

  // QR points to the same report page
  let qrDataUrl = null;
  let barcodeDataUrl = null;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const reportUrl = `${baseUrl}${req.originalUrl}${req.originalUrl.includes('?') ? '&' : '?'}rid=${encodeURIComponent(reportNo)}`;

  if (settings && Number(settings.show_qr) === 1) {
    try {
      qrDataUrl = await QRCode.toDataURL(reportUrl, { margin: 1, width: 170 });
    } catch (e) {
      qrDataUrl = null;
    }
  }

  if (settings && Number(settings.show_barcode) === 1) {
    try {
      const buf = await bwipjs.toBuffer({
        bcid: 'code128',
        text: reportNo,
        scale: 2,
        height: 12,
        includetext: false,
        backgroundcolor: 'FFFFFF',
      });
      barcodeDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    } catch (e) {
      barcodeDataUrl = null;
    }
  }

  return {
    title,
    reportNo,
    reportUrl,
    attachmentsCount,
    qrDataUrl,
    barcodeDataUrl,
  };
}

function calcReportStats(rows) {
  const stats = {
    total: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
    cancelled: 0,
    inProgress: 0,
    avgProgress: 0,
  };
  if (!rows || !rows.length) return stats;

  stats.total = rows.length;
  let sum = 0;
  for (const r of rows) {
    const st = r.status;
    const p = Number(r.progress || 0);
    sum += p;
    if (st === 'completed') stats.completed++;
    else if (st === 'pending_approval') stats.pending++;
    else if (st === 'overdue') stats.overdue++;
    else if (st === 'cancelled') stats.cancelled++;
    else stats.inProgress++;
  }
  stats.avgProgress = Math.round(sum / stats.total);
  return stats;
}

function buildTop(rows, key) {
  const m = new Map();
  for (const r of (rows || [])) {
    const name = (r && r[key]) ? String(r[key]) : 'غير محدد';
    const item = m.get(name) || { name, count: 0, sum: 0 };
    item.count += 1;
    item.sum += Number(r.progress || 0);
    m.set(name, item);
  }
  const list = [...m.values()].map(x => ({
    name: x.name,
    count: x.count,
    avg: x.count ? Math.round(x.sum / x.count) : 0,
  }));
  list.sort((a, b) => (b.avg - a.avg) || (b.count - a.count));
  return list.slice(0, 10);
}


function statusLabelAr(st) {
  if (st === 'completed') return 'مكتملة';
  if (st === 'pending_approval') return 'بانتظار اعتماد';
  if (st === 'overdue') return 'متأخرة';
  if (st === 'cancelled') return 'ملغاة';
  if (st === 'in_progress') return 'جارية';
  return 'جديدة';
}

async function sendExcelReport(res, title, rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KPI Team System';
  wb.created = new Date();

  const ws = wb.addWorksheet('التقرير');
  ws.views = [{ rightToLeft: true }];

  ws.columns = [
    { header: 'رقم', key: 'id', width: 8 },
    { header: 'المهمة', key: 'title', width: 42 },
    { header: 'المناسبة', key: 'event_title', width: 24 },
    { header: 'الموظف', key: 'employee_name', width: 18 },
    { header: 'المشرف', key: 'supervisor_name', width: 18 },
    { header: 'تاريخ البداية', key: 'start_date', width: 14 },
    { header: 'تاريخ الاستحقاق', key: 'due_date', width: 14 },
    { header: 'الهدف', key: 'target_value', width: 10 },
    { header: 'المنجز', key: 'done_value', width: 10 },
    { header: 'الإنجاز %', key: 'progress', width: 10 },
    { header: 'الحالة', key: 'status_label', width: 14 },
  ];

  // Header style
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 22;

  for (const r of (rows || [])) {
    ws.addRow({
      id: r.id,
      title: r.title || '',
      event_title: r.event_title || '-',
      employee_name: r.employee_name || '-',
      supervisor_name: r.supervisor_name || '-',
      start_date: r.start_date || '',
      due_date: r.due_date || '',
      target_value: Number(r.target_value || 0),
      done_value: Number(r.done_value || 0),
      progress: Number(r.progress || 0),
      status_label: statusLabelAr(r.status),
    });
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  // Borders + align
  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };
      if (rowNumber === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F6EF' } };
      }
      cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
    });
  });

  const safeName = (title || 'report').replace(/[^a-zA-Z0-9؀-ۿ_-]/g, '_');
  const fileName = `${safeName}-${dayjs().format('YYYYMMDD')}.xlsx`;
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // Better compatibility across browsers (supports Arabic via filename*)
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);

  await wb.xlsx.write(res);
  res.end();
}

// --------- Asset Library Excel Reports (Archive) ---------
function assetTypeLabelAr(t) {
  if (t === 'video') return 'فيديو';
  if (t === 'photo') return 'صورة';
  if (t === 'audio') return 'صوت';
  if (t === 'project') return 'ملفات مشروع';
  if (t === 'doc') return 'مستند';
  return 'أخرى';
}

function assetVisLabelAr(v) {
  if (v === 'public') return 'عام';
  if (v === 'private') return 'خاص';
  return 'فريق';
}

function asciiSafeName(name) {
  const s = String(name || 'file').trim();
  if (!s) return 'file';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += (c >= 32 && c <= 126) ? s[i] : '_';
  }
  return out || 'file';
}

async function sendArchiveExcelReport(res, title, rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KPI Team System';
  wb.created = new Date();

  const ws = wb.addWorksheet('الأرشيف');
  ws.views = [{ rightToLeft: true }];

  ws.columns = [
    { header: 'رقم', key: 'id', width: 8 },
    { header: 'العنوان', key: 'title', width: 34 },
    { header: 'النوع', key: 'asset_type', width: 14 },
    { header: 'الوسوم', key: 'tags', width: 26 },
    { header: 'المناسبة', key: 'event_title', width: 22 },
    { header: 'الهارد', key: 'drive_name', width: 16 },
    { header: 'المسار', key: 'file_path', width: 46 },
    { header: 'اسم الملف', key: 'file_name', width: 22 },
    { header: 'الخصوصية', key: 'visibility', width: 12 },
    { header: 'المُفهرِس', key: 'created_by_name', width: 16 },
    { header: 'تاريخ الإضافة', key: 'created_at', width: 18 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 22;

  for (const r of (rows || [])) {
    ws.addRow({
      id: r.id,
      title: r.title || '',
      asset_type: assetTypeLabelAr(String(r.asset_type || 'other')),
      tags: r.tags || '',
      event_title: r.event_title || '-',
      drive_name: r.drive_name || '-',
      file_path: r.file_path || '',
      file_name: r.file_name || '',
      visibility: assetVisLabelAr(String(r.visibility || 'team')),
      created_by_name: r.created_by_name || '-',
      created_at: fmtDate(r.created_at) || '',
    });
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };
      if (rowNumber === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F6EF' } };
      }
      cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
    });
  });

  const safe = safeSlug(title || 'archive');
  const fileName = `${safe}-${dayjs().format('YYYYMMDD')}.xlsx`;
  const asciiName = asciiSafeName(fileName);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  await wb.xlsx.write(res);
  res.end();
}

async function sendArchiveDrivesExcelReport(res, title, rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KPI Team System';
  wb.created = new Date();
  const ws = wb.addWorksheet('الهاردسكات');
  ws.views = [{ rightToLeft: true }];

  ws.columns = [
    { header: 'رقم', key: 'id', width: 8 },
    { header: 'اسم الهارد', key: 'name', width: 22 },
    { header: 'Serial', key: 'serial', width: 18 },
    { header: 'الموقع', key: 'location', width: 18 },
    { header: 'عدد الأصول', key: 'asset_count', width: 12 },
    { header: 'عدد المشاريع', key: 'event_count', width: 12 },
    { header: 'آخر تواجد', key: 'last_seen_at', width: 18 },
    { header: 'ملاحظات', key: 'notes', width: 26 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 22;

  for (const r of (rows || [])) {
    ws.addRow({
      id: r.id,
      name: r.name || '',
      serial: r.serial || '',
      location: r.location || '',
      asset_count: Number(r.asset_count || 0),
      event_count: Number(r.event_count || 0),
      last_seen_at: fmtDate(r.last_seen_at) || '',
      notes: r.notes || '',
    });
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };
      if (rowNumber === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F6EF' } };
      }
      cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
    });
  });

  const safe = safeSlug(title || 'archive-drives');
  const fileName = `${safe}-${dayjs().format('YYYYMMDD')}.xlsx`;
  const asciiName = asciiSafeName(fileName);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  await wb.xlsx.write(res);
  res.end();
}

async function sendArchiveGapsExcelReport(res, title, rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KPI Team System';
  wb.created = new Date();
  const ws = wb.addWorksheet('نواقص الأرشفة');
  ws.views = [{ rightToLeft: true }];

  ws.columns = [
    { header: 'رقم', key: 'id', width: 8 },
    { header: 'العنوان', key: 'title', width: 32 },
    { header: 'المشكلة', key: 'gap', width: 18 },
    { header: 'المناسبة', key: 'event_title', width: 22 },
    { header: 'الهارد', key: 'drive_name', width: 16 },
    { header: 'المسار', key: 'file_path', width: 46 },
    { header: 'النوع', key: 'asset_type', width: 14 },
    { header: 'الوسوم', key: 'tags', width: 22 },
    { header: 'المُفهرِس', key: 'created_by_name', width: 16 },
    { header: 'تاريخ الإضافة', key: 'created_at', width: 18 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 22;

  for (const r of (rows || [])) {
    ws.addRow({
      id: r.id,
      title: r.title || '',
      gap: r.gap || '',
      event_title: r.event_title || '-',
      drive_name: r.drive_name || '-',
      file_path: r.file_path || '',
      asset_type: assetTypeLabelAr(String(r.asset_type || 'other')),
      tags: r.tags || '',
      created_by_name: r.created_by_name || '-',
      created_at: fmtDate(r.created_at) || '',
    });
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };
      if (rowNumber === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F6EF' } };
      }
      cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
    });
  });

  const safe = safeSlug(title || 'archive-gaps');
  const fileName = `${safe}-${dayjs().format('YYYYMMDD')}.xlsx`;
  const asciiName = asciiSafeName(fileName);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  await wb.xlsx.write(res);
  res.end();
}
// Attach locals
app.use((req, res, next) => {
  const user = getUser(req.session.userId);
  res.locals.me = user;
  res.locals.settings = getSettings();
  res.locals.fmtDate = fmtDate;
  res.locals.calcProgress = calcProgress;
  res.locals.appVersion = APP_VERSION;

  // Alerts: tasks due within 2 days
  try {
    if (user) {
      const due = getDueSoon(user);
      res.locals.dueSoonCount = due.count;
      res.locals.dueSoonItems = due.items || [];
    } else {
      res.locals.dueSoonCount = 0;
      res.locals.dueSoonItems = [];
    }
  } catch (_) {
    res.locals.dueSoonCount = 0;
    res.locals.dueSoonItems = [];
  }


  // Notifications (unread)
  try {
    if (user) {
      res.locals.notifUnreadCount = getUnreadNotificationsCount(user.id);
    } else {
      res.locals.notifUnreadCount = 0;
    }
  } catch (_) {
    res.locals.notifUnreadCount = 0;
  }
  next();
});

// --------- Uploads ---------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeBase = file.originalname.replace(/[^a-zA-Z0-9._-\u0600-\u06FF]/g, '_');
    const stamp = Date.now();
    cb(null, `${stamp}_${safeBase}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Update ZIP upload (admin-only)
const UPDATE_UPLOAD_DIR = path.join(UPLOAD_DIR, 'updates');
ensureDir(UPDATE_UPLOAD_DIR);
const updateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPDATE_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeBase = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = Date.now();
    cb(null, `${stamp}_${safeBase}`);
  },
});
const updateUpload = multer({
  storage: updateStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

// Project file library upload (stored under /uploads/projects/<eventId>/...)
const projectStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const eid = Number(req.params.id || 0);
    const dir = path.join(PROJECT_FILES_DIR, String(eid || 0));
    try { fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const eid = Number(req.params.id || 0);
    let title = '';
    try {
      const ev = db.prepare('SELECT title FROM events WHERE id=?').get(eid);
      title = ev ? String(ev.title || '') : '';
    } catch(e) {}

    const slug = safeSlug(title);
    const ext = path.extname(file.originalname || '').toLowerCase();
    const rand = Math.random().toString(16).slice(2, 8);
    cb(null, `${eid}_${slug}_${Date.now()}_${rand}${ext}`);
  }
});

const projectUpload = multer({
  storage: projectStorage,
  limits: { fileSize: 35 * 1024 * 1024 }, // 35MB
});

// Asset thumbnails upload (optional small preview images)
const assetThumbStorage = multer.diskStorage({
  // On some Windows setups the folder may not exist (zip extraction / permissions / manual delete).
  // Ensure it exists at upload-time to prevent ENOENT.
  destination: (req, file, cb) => {
    try { fs.mkdirSync(ASSET_THUMBS_DIR, { recursive: true }); } catch (e) {}
    cb(null, ASSET_THUMBS_DIR);
  },
  filename: (req, file, cb) => {
    const safeBase = (file.originalname || 'thumb').replace(/[^a-zA-Z0-9._-\u0600-\u06FF]/g, '_');
    const stamp = Date.now();
    const rand = Math.random().toString(16).slice(2, 8);
    cb(null, `${stamp}_${rand}_${safeBase}`);
  },
});

const assetThumbUpload = multer({
  storage: assetThumbStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return cb(null, true);
    cb(new Error('INVALID_THUMB_TYPE'));
  },
});

// World days Excel import (in-memory)
const worldDaysExcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx')) return cb(null, true);
    cb(new Error('INVALID_EXCEL_TYPE'));
  }
});

// Restore upload (ZIP backup)
const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RESTORE_DIR),
    filename: (req, file, cb) => {
      const safe = (file.originalname || 'backup.zip').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 120 * 1024 * 1024 }, // 120MB
});

// --------- Auth routes ---------
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(username);
  if (!user) return res.render('login', { error: 'بيانات الدخول غير صحيحة' });
  if (Number(user.can_login) === 0) return res.render('login', { error: 'هذا الحساب غير مفعّل للدخول' });
  const ok = bcrypt.compareSync(password || '', user.password_hash);
  if (!ok) return res.render('login', { error: 'بيانات الدخول غير صحيحة' });
  req.session.userId = user.id;
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});



// --------- Account: Change Password ---------
// --------- Notifications (in-app) ---------
app.get('/notifications', requireAuth, (req, res) => {
  const me = res.locals.me;
  const rows = listNotifications(me.id, 200);
  res.render('notifications', { pageTitle: 'الإشعارات', rows });
});

app.get('/notifications/open/:id', requireAuth, (req, res) => {
  const me = res.locals.me;
  const id = Number(req.params.id);
  let url = '/notifications';
  try {
    const row = db.prepare('SELECT * FROM notifications WHERE user_id=? AND id=?').get(me.id, id);
    if (row && row.url) url = row.url;
    markNotificationRead(me.id, id);
  } catch (e) {}
  return res.redirect(url);
});

app.post('/notifications/mark-read', requireAuth, (req, res) => {
  const me = res.locals.me;
  const id = String(req.body.id || '');
  if (id === 'all') {
    markAllNotificationsRead(me.id);
  } else {
    const n = Number(id);
    if (n) markNotificationRead(me.id, n);
  }
  res.redirect('/notifications');
});

app.get('/account/password', requireAuth, (req, res) => {
  const me = res.locals.me;
  res.render('account_password', { me, error: null, success: null });
});

app.post('/account/password', requireAuth, (req, res) => {
  const me = res.locals.me;
  const { current_password, new_password, confirm_password } = req.body || {};
  const cur = String(current_password || '');
  const np = String(new_password || '');
  const cp = String(confirm_password || '');

  if (!cur || !np || !cp) {
    return res.render('account_password', { me, error: 'الرجاء تعبئة جميع الحقول', success: null });
  }
  if (np.length < 6) {
    return res.render('account_password', { me, error: 'كلمة المرور الجديدة قصيرة (يفضّل 6 أحرف فأكثر)', success: null });
  }
  if (np !== cp) {
    return res.render('account_password', { me, error: 'تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة', success: null });
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id=? AND is_active=1').get(me.id);
  if (!row) return res.redirect('/login');

  const ok = bcrypt.compareSync(cur, row.password_hash || '');
  if (!ok) {
    return res.render('account_password', { me, error: 'كلمة المرور الحالية غير صحيحة', success: null });
  }

  // منع استخدام نفس كلمة المرور السابقة
  const same = bcrypt.compareSync(np, row.password_hash || '');
  if (same) {
    return res.render('account_password', { me, error: 'اختر كلمة مرور مختلفة عن الحالية', success: null });
  }

  const newHash = bcrypt.hashSync(np, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(newHash, me.id);

  res.render('account_password', { me, error: null, success: 'تم تغيير كلمة المرور بنجاح' });
});

// --------- Dashboard ---------
app.get('/', requireAuth, (req, res) => {
  const me = res.locals.me;

  // Base scope by role
  let where = "(t.status IS NULL OR t.status <> 'cancelled')";
  const params = [];
  if (me.role === 'employee') {
    where += ' AND (t.employee_id=? OR EXISTS (SELECT 1 FROM task_stages s WHERE s.task_id=t.id AND s.assigned_to=?))';
    params.push(me.id, me.id);
  } else if (me.role === 'supervisor') {
    where += ' AND t.supervisor_id=?';
    params.push(me.id);
  }

  const tasks = db.prepare(`
    SELECT t.*, e.title AS event_title,
      u1.display_name AS employee_name,
      u2.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u1 ON u1.id=t.employee_id
    LEFT JOIN users u2 ON u2.id=t.supervisor_id
    WHERE ${where}
    ORDER BY datetime(t.updated_at) DESC
    LIMIT 15
  `).all(...params);

  const computed = tasks.map(t => {
    const status = computeTaskStatus(t);
    return { ...t, status, progress: calcProgress(t.done_value, t.target_value) };
  });

  const allForStats = db.prepare(`SELECT t.* FROM tasks t WHERE ${where}`).all(...params);
  const stats = {
    total: allForStats.length,
    completed: 0,
    overdue: 0,
    pending: 0,
    avgProgress: 0,
  };
  let progressSum = 0;

  for (const t of allForStats) {
    const st = computeTaskStatus(t);
    const p = calcProgress(t.done_value, t.target_value);
    progressSum += p;
    if (st === 'completed') stats.completed += 1;
    if (st === 'overdue') stats.overdue += 1;
    if (st === 'pending_approval') stats.pending += 1;
  }
  stats.avgProgress = allForStats.length ? Math.round(progressSum / allForStats.length) : 0;

  res.render('dashboard', { tasks: computed, stats });
});

// Compatibility alias: some kiosk/links might go back to /dashboard
// In this app the main dashboard lives at '/'
app.get('/dashboard', requireAuth, (req, res) => {
  return res.redirect('/');
});


// --------- My Work (for employees) ---------
app.get('/my', requireAuth, (req, res) => {
  const me = res.locals.me;

  // Employees: show stages assigned to them + direct tasks
  // Supervisors/Admin: redirect to tasks list
  if (me.role !== 'employee') return res.redirect('/tasks');

  const stages = db.prepare(`
    SELECT s.*, t.title AS task_title, t.id AS task_id, t.due_date, t.priority, t.status AS task_status,
      e.title AS event_title,
      u.display_name AS supervisor_name
    FROM task_stages s
    JOIN tasks t ON t.id=s.task_id
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u ON u.id=t.supervisor_id
    WHERE s.assigned_to=? AND t.status <> 'cancelled'
    ORDER BY (CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END), date(t.due_date) ASC, datetime(t.updated_at) DESC, s.sort_order ASC
  `).all(me.id);

  const directTasks = db.prepare(`
    SELECT t.*, e.title AS event_title, u.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u ON u.id=t.supervisor_id
    WHERE t.employee_id=? AND (t.progress_mode IS NULL OR t.progress_mode='simple') AND t.status <> 'cancelled'
    ORDER BY (CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END), date(t.due_date) ASC, datetime(t.updated_at) DESC
  `).all(me.id);

  const computedTasks = directTasks.map(t => ({
    ...t,
    status: computeTaskStatus(t),
    progress: calcProgress(t.done_value, t.target_value),
  }));

  const computedStages = stages.map(s => ({
    ...s,
    progress: Math.max(0, Math.min(100, Number(s.progress || 0))),
  }));

  res.render('my_tasks', { stages: computedStages, directTasks: computedTasks });
});

// --------- Admin: Users ---------
app.get('/admin/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, role, user_kind, can_login, specialty, email, is_active, created_at FROM users ORDER BY id DESC').all();
  res.render('admin_users', { users });
});

app.get('/admin/users/new', requireAuth, requireRole('admin'), (req, res) => {
  res.render('admin_user_form', { user: null, error: null });
});

app.post('/admin/users', requireAuth, requireRole('admin'), (req, res) => {
  const { username, display_name, role, password, user_kind, can_login, can_approve_tasks, specialty, email, is_active } = req.body;
  if (!username || !display_name || !role || !password) {
    return res.render('admin_user_form', { user: null, error: 'فضلاً أكمل جميع الحقول' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (exists) {
    return res.render('admin_user_form', { user: null, error: 'اسم المستخدم مستخدم مسبقًا' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (username, password_hash, display_name, role, user_kind, can_login, can_approve_tasks, specialty, email, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(
      username,
      hash,
      display_name,
      role,
      (user_kind || 'employee'),
      Number(can_login || 0) ? 1 : 0,
      (role === 'employee' && Number(can_approve_tasks || 0) ? 1 : 0),
      (specialty || null),
      (email ? String(email).trim() : null),
      Number(is_active ?? 1) ? 1 : 0,
      now
    );
  res.redirect('/admin/users');
});

app.get('/admin/users/:id/edit', requireAuth, requireRole('admin'), (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, role, user_kind, can_login, can_approve_tasks, specialty, email, is_active FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).send('غير موجود');
  res.render('admin_user_form', { user, error: null });
});

app.put('/admin/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { display_name, role, user_kind, can_login, can_approve_tasks, specialty, email, is_active, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).send('غير موجود');

  const now = new Date().toISOString();

  const approveFlag = (role === 'employee' && Number(can_approve_tasks || 0) ? 1 : 0);

  if (password && password.trim().length >= 4) {
    const hash = bcrypt.hashSync(password.trim(), 10);
    db.prepare('UPDATE users SET display_name=?, role=?, user_kind=?, can_login=?, can_approve_tasks=?, specialty=?, email=?, is_active=?, password_hash=? WHERE id=?')
      .run(display_name, role, (user_kind || user.user_kind || 'employee'), Number(can_login || 0) ? 1 : 0, approveFlag, (specialty || null), (email ? String(email).trim() : null), Number(is_active), hash, req.params.id);
  } else {
    db.prepare('UPDATE users SET display_name=?, role=?, user_kind=?, can_login=?, can_approve_tasks=?, specialty=?, email=?, is_active=? WHERE id=?')
      .run(display_name, role, (user_kind || user.user_kind || 'employee'), Number(can_login || 0) ? 1 : 0, approveFlag, (specialty || null), (email ? String(email).trim() : null), Number(is_active), req.params.id);
  }

  res.redirect('/admin/users');
});

// --------- Admin: Settings ---------

// --------- Admin: In-app updater ---------
app.get('/admin/update', requireAuth, requireRole('admin'), (req, res) => {
  const msg = req.query.msg ? String(req.query.msg) : '';
  const updatesLogPath = path.join(__dirname, '_updates', 'update_log.jsonl');
  const updates = readUpdateLog(updatesLogPath, 10);
  const backups = listRecentDirs(path.join(__dirname, '_backups'), 12);
  res.render('admin_update', { msg, updates, backups });
});

app.post('/admin/update', requireAuth, requireRole('admin'), updateUpload.single('update_zip'), async (req, res) => {
  const updatesLogPath = path.join(__dirname, '_updates', 'update_log.jsonl');
  const user = getUser(req.session.userId);
  try {
    if (!req.file || !req.file.path) throw new Error('لم يتم رفع ملف التحديث');
    const zipPath = req.file.path;

    const tmpDir = path.join(__dirname, '_update_tmp', String(Date.now()));
    ensureDir(tmpDir);

    await safeExtractZip(zipPath, tmpDir);

    // Apply update
    const result = applyUpdateFromDir(tmpDir, db);

    // Clean temp + uploaded zip
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(zipPath); } catch (_) {}

    appendUpdateLog(updatesLogPath, {
      ts: new Date().toISOString(),
      user: user ? { id: user.id, name: user.name, role: user.role } : null,
      action: 'update',
      version: result.version,
      notes: result.notes,
      backup: path.basename(result.backup_dir),
      ok: true
    });

    const msg = encodeURIComponent(`تم تطبيق التحديث (${result.version}) بنجاح ✅ — نسخة احتياطية: ${path.basename(result.backup_dir)}${result.restart_required ? ' — يُفضّل إعادة تشغيل النظام.' : ''}`);
    res.redirect('/admin/update?msg=' + msg);
  } catch (e) {
    try { if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (_) {}
    appendUpdateLog(updatesLogPath, {
      ts: new Date().toISOString(),
      user: user ? { id: user.id, name: user.name, role: user.role } : null,
      action: 'update',
      ok: false,
      error: String(e && e.message ? e.message : e)
    });
    res.redirect('/admin/update?msg=' + encodeURIComponent('فشل التحديث: ' + (e && e.message ? e.message : e)));
  }
});

app.post('/admin/update/rollback', requireAuth, requireRole('admin'), (req, res) => {
  const updatesLogPath = path.join(__dirname, '_updates', 'update_log.jsonl');
  const user = getUser(req.session.userId);
  try {
    const backup = String(req.body.backup || '').trim();
    if (!backup) throw new Error('اختر نسخة احتياطية');
    // safety: only directory name
    if (backup.includes('..') || backup.includes('/') || backup.includes('\\')) throw new Error('اسم نسخة غير صالح');

    const restoredDb = rollbackFromBackup(backup);
    if (restoredDb) {
      try { db.close(); } catch (_) {}
      db = openDb();
      migrate(db);
    }

    appendUpdateLog(updatesLogPath, {
      ts: new Date().toISOString(),
      user: user ? { id: user.id, name: user.name, role: user.role } : null,
      action: 'rollback',
      backup,
      ok: true
    });

    res.redirect('/admin/update?msg=' + encodeURIComponent('تمت الاستعادة من النسخة: ' + backup + ' ✅ (يفضّل إعادة تشغيل النظام)'));
  } catch (e) {
    appendUpdateLog(updatesLogPath, {
      ts: new Date().toISOString(),
      user: user ? { id: user.id, name: user.name, role: user.role } : null,
      action: 'rollback',
      ok: false,
      error: String(e && e.message ? e.message : e)
    });
    res.redirect('/admin/update?msg=' + encodeURIComponent('فشل الاستعادة: ' + (e && e.message ? e.message : e)));
  }
});

app.get('/admin/settings', requireAuth, requireRole('admin'), (req, res) => {
  const settings = getSettings();
  res.render('admin_settings', {
    settings,
    ok: req.query.ok === '1',
    restore_ok: req.query.restore_ok === '1',
    restore_err: req.query.restore_err === '1',
  });
});

app.post('/admin/settings', requireAuth, requireRole('admin'), upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'seal', maxCount: 1 }]), (req, res) => {
  const {
    org_name, org_department, header_line, footer_line,
    report_prefix,
    sig_prepared_title, sig_prepared_name,
    sig_reviewed_title, sig_reviewed_name,
    sig_approved_title, sig_approved_name,

    // Kiosk settings
    kiosk_display_mode,
    kiosk_chart_variant,
    kiosk_interval_sec,
    kiosk_chart_size,
    kiosk_color_scheme,
    kiosk_transition,
    kiosk_theme_auto_cycle,
    kiosk_other_interval_sec,
    kiosk_task_order,
    kiosk_pages_default,
    kiosk_ticker_mode,
    kiosk_ticker_rss_urls,
    kiosk_ticker_speed,
    kiosk_ticker_font_size,
    kiosk_ticker_refresh_min,
    kiosk_ticker_max_items,
    kiosk_weather_enabled,
    kiosk_weather_city,
    kiosk_calendar_days_ahead,
    kiosk_calendar_max_items,
    kiosk_calendar_source,
    kiosk_calendar_moe_url,
    kiosk_calendar_moe_refresh_min,

    // Email + templates
    email_enabled,
    email_from_email,
    email_from_name,
    email_smtp_host,
    email_smtp_port,
    email_smtp_secure,
    email_smtp_user,
    email_smtp_pass,
    email_due_days,
    stage_templates_text
  } = req.body;

  const settings = getSettings();
  let logo_filename = settings.logo_filename;
  let seal_filename = settings.seal_filename;

  if (req.files && req.files.logo && req.files.logo[0]) {
    logo_filename = req.files.logo[0].filename;
  }
  if (req.files && req.files.seal && req.files.seal[0]) {
    seal_filename = req.files.seal[0].filename;
  }

  const show_qr = req.body.show_qr ? 1 : 0;
  const show_barcode = req.body.show_barcode ? 1 : 0;

  // Kiosk settings
  const kiosk_show_event = req.body.kiosk_show_event ? 1 : 0;
  const kiosk_show_due = req.body.kiosk_show_due ? 1 : 0;
  const kiosk_show_status = req.body.kiosk_show_status ? 1 : 0;
  const _kiosk_display_mode = (kiosk_display_mode || 'both');
  const _kiosk_chart_variant = (kiosk_chart_variant || 'ring');
  const _kiosk_interval_sec = Math.max(2, Math.min(60, Number(kiosk_interval_sec || 5)));
  const _kiosk_chart_size = (kiosk_chart_size || 'xl');
  const _kiosk_color_scheme = (kiosk_color_scheme || 'dark');
  const _kiosk_transition = (kiosk_transition || 'fade');
  const _kiosk_theme_auto_cycle = kiosk_theme_auto_cycle ? 1 : 0;
  const _kiosk_date_from = (req.body.kiosk_date_from || '').trim() || null;
  const _kiosk_date_to = (req.body.kiosk_date_to || '').trim() || null;

  const _kiosk_other_interval_sec = Math.max(3, Math.min(180, Number(kiosk_other_interval_sec || 10)));
  const allowedOrder = ['due','updated','priority'];
  const _kiosk_task_order = allowedOrder.includes(String(kiosk_task_order || 'due')) ? String(kiosk_task_order || 'due') : 'due';

  const allowedPages = ['home','tasks','days','calendar'];
  const rawPages = String(kiosk_pages_default || '').split(',').map(s => s.trim()).filter(Boolean);
  const cleanPages = rawPages.filter(p => allowedPages.includes(p));
  const _kiosk_pages_default = (cleanPages.length ? cleanPages : ['home','tasks','days','calendar']).join(',');

  const _kiosk_ticker_mode = (['manual','rss','mixed'].includes(String((kiosk_ticker_mode || settings.kiosk_ticker_mode || 'manual')))) ? String((kiosk_ticker_mode || settings.kiosk_ticker_mode || 'manual')) : 'manual';
  const _kiosk_ticker_rss_urls = (kiosk_ticker_rss_urls || settings.kiosk_ticker_rss_urls || '').trim() || null;
  const _kiosk_ticker_speed = Math.max(5, Math.min(300, Number(kiosk_ticker_speed || settings.kiosk_ticker_speed || 60)));
const _kiosk_ticker_font_size = Math.max(12, Math.min(64, Number(kiosk_ticker_font_size || settings.kiosk_ticker_font_size || 18)));
  const _kiosk_ticker_refresh_min = Math.max(1, Math.min(240, Number((kiosk_ticker_refresh_min || settings.kiosk_ticker_refresh_min || 15))));
  const _kiosk_ticker_max_items = Math.max(5, Math.min(100, Number((kiosk_ticker_max_items || settings.kiosk_ticker_max_items || 20))));

  const _kiosk_weather_enabled = kiosk_weather_enabled ? 1 : 0;
  const _kiosk_weather_city = (kiosk_weather_city || 'Riyadh').trim() || 'Riyadh';

  const _kiosk_calendar_days_ahead = Math.max(7, Math.min(365, Number((kiosk_calendar_days_ahead || settings.kiosk_calendar_days_ahead || 60))));
  const _kiosk_calendar_max_items = Math.max(5, Math.min(50, Number((kiosk_calendar_max_items || settings.kiosk_calendar_max_items || 12))));
  const _kiosk_calendar_source = (String(kiosk_calendar_source || settings.kiosk_calendar_source || 'moe').trim() === 'moe') ? 'moe' : 'manual';
  const _kiosk_calendar_moe_url = String(kiosk_calendar_moe_url || settings.kiosk_calendar_moe_url || 'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx').trim();
  const _kiosk_calendar_moe_refresh_min = Math.max(5, Math.min(1440, Number(kiosk_calendar_moe_refresh_min || 240)));


  // Email settings
  const _email_enabled = email_enabled ? 1 : 0;
  const _email_from_email = (email_from_email || '').trim() || null;
  const _email_from_name = (email_from_name || '').trim() || null;
  const _email_smtp_host = (email_smtp_host || 'smtp.office365.com').trim();
  const _email_smtp_port = Number(email_smtp_port || 587);
  const _email_smtp_secure = email_smtp_secure ? 1 : 0;
  const _email_smtp_user = (email_smtp_user || '').trim() || null;
  const _email_smtp_pass = (email_smtp_pass || '').trim() || null;
  const _email_due_days = Math.max(0, Math.min(30, Number(email_due_days || 2)));

  const _stage_templates_text = (stage_templates_text || '').trim() || null;


  db.prepare(`UPDATE settings SET
    org_name=?, org_department=?, header_line=?, footer_line=?,
    logo_filename=?,
    report_prefix=?, show_qr=?, show_barcode=?, seal_filename=?,
    sig_prepared_title=?, sig_prepared_name=?,
    sig_reviewed_title=?, sig_reviewed_name=?,
    sig_approved_title=?, sig_approved_name=?,

    kiosk_display_mode=?, kiosk_chart_variant=?, kiosk_interval_sec=?,
    kiosk_show_event=?, kiosk_show_due=?, kiosk_show_status=?,
    kiosk_chart_size=?, kiosk_color_scheme=?, kiosk_transition=?, kiosk_theme_auto_cycle=?, kiosk_date_from=?, kiosk_date_to=?,
    kiosk_other_interval_sec=?, kiosk_task_order=?, kiosk_pages_default=?,
    kiosk_ticker_mode=?, kiosk_ticker_rss_urls=?, kiosk_ticker_speed=?, kiosk_ticker_font_size=?, kiosk_ticker_refresh_min=?, kiosk_ticker_max_items=?,
    kiosk_weather_enabled=?, kiosk_weather_city=?,
    kiosk_calendar_days_ahead=?, kiosk_calendar_max_items=?, kiosk_calendar_source=?, kiosk_calendar_moe_url=?, kiosk_calendar_moe_refresh_min=?,
    email_enabled=?, email_from_email=?, email_from_name=?,
    email_smtp_host=?, email_smtp_port=?, email_smtp_secure=?,
    email_smtp_user=?, email_smtp_pass=?, email_due_days=?,
    stage_templates_text=?
    WHERE id=1`).run(
      org_name || null,
      org_department || null,
      header_line || null,
      footer_line || null,
      logo_filename || null,
      (report_prefix || null),
      show_qr,
      show_barcode,
      seal_filename || null,
      sig_prepared_title || null,
      sig_prepared_name || null,
      sig_reviewed_title || null,
      sig_reviewed_name || null,
      sig_approved_title || null,
      sig_approved_name || null,

      _kiosk_display_mode,
      _kiosk_chart_variant,
      _kiosk_interval_sec,
      kiosk_show_event,
      kiosk_show_due,
      kiosk_show_status,
      _kiosk_chart_size,
      _kiosk_color_scheme,
      _kiosk_transition,
      _kiosk_theme_auto_cycle,
      _kiosk_date_from,
      _kiosk_date_to,
      _kiosk_other_interval_sec,
      _kiosk_task_order,
      _kiosk_pages_default,
      _kiosk_ticker_mode,
      _kiosk_ticker_rss_urls,
      _kiosk_ticker_speed,
      _kiosk_ticker_font_size,
    _kiosk_ticker_refresh_min,
      _kiosk_ticker_max_items,
      _kiosk_weather_enabled,
      _kiosk_weather_city,
      _kiosk_calendar_days_ahead,
      _kiosk_calendar_max_items,
      _kiosk_calendar_source,
      _kiosk_calendar_moe_url,
      _kiosk_calendar_moe_refresh_min,
      _email_enabled,
      _email_from_email,
      _email_from_name,
      _email_smtp_host,
      _email_smtp_port,
      _email_smtp_secure,
      _email_smtp_user,
      _email_smtp_pass,
      _email_due_days,
      _stage_templates_text
    );

  res.redirect('/admin/settings?ok=1');
});


// --------- Admin: Backup / Restore ---------
app.get('/admin/backup', requireAuth, requireRole('admin'), (req, res) => {
  const stamp = dayjs().format('YYYYMMDD-HHmm');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="kpi-team-backup-${stamp}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Backup error:', err);
    try { res.status(500).end('Backup failed'); } catch (_) {}
  });

  archive.pipe(res);

  // DB file
  const dbPath = path.join(__dirname, 'data', 'app.db');
  if (fs.existsSync(dbPath)) {
    archive.file(dbPath, { name: 'data/app.db' });
  }

  // Uploads (attachments + logo + seal)
  const uploadsPath = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploadsPath)) {
    archive.directory(uploadsPath, 'uploads');
  }

  // Manifest
  const manifest = {
    app: 'kpi-team-app',
    version: '1.1.0',
    exported_at: new Date().toISOString(),
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

  archive.finalize();
});

app.post('/admin/restore', requireAuth, requireRole('admin'), restoreUpload.single('backupZip'), async (req, res) => {
  if (!req.file) return res.redirect('/admin/settings?restore_err=1');

  const zipPath = req.file.path;
  const extractPath = path.join(RESTORE_DIR, `extract_${Date.now()}`);
  fs.mkdirSync(extractPath, { recursive: true });

  try {
    // Extract
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .promise();

    const extractedDb = path.join(extractPath, 'data', 'app.db');
    const extractedUploads = path.join(extractPath, 'uploads');

    if (!fs.existsSync(extractedDb)) {
      safeRemoveDir(extractPath);
      fs.unlinkSync(zipPath);
      return res.redirect('/admin/settings?restore_err=1');
    }

    // Backup current
    const now = dayjs().format('YYYYMMDD-HHmmss');
    const currentDb = path.join(__dirname, 'data', 'app.db');
    const currentUploads = path.join(__dirname, 'uploads');

    try { db.close(); } catch (_) {}

    if (fs.existsSync(currentDb)) {
      fs.copyFileSync(currentDb, path.join(__dirname, 'data', `app.db.bak-${now}`));
    }

    // Replace DB
    fs.copyFileSync(extractedDb, currentDb);

    // Replace uploads (if provided)
    if (fs.existsSync(extractedUploads)) {
      const bakUploads = path.join(__dirname, `uploads.bak-${now}`);
      try {
        if (fs.existsSync(currentUploads)) fs.renameSync(currentUploads, bakUploads);
      } catch (_) {
        // fallback copy
      }
      if (!fs.existsSync(currentUploads)) fs.mkdirSync(currentUploads, { recursive: true });
      copyDir(extractedUploads, currentUploads);
    }

    // Re-open DB
    db = openDb();
    migrate(db);
    ensureAdmin();

    safeRemoveDir(extractPath);
    try { fs.unlinkSync(zipPath); } catch (_) {}

    return res.redirect('/admin/settings?restore_ok=1');
  } catch (err) {
    console.error('Restore error:', err);
    safeRemoveDir(extractPath);
    try { fs.unlinkSync(zipPath); } catch (_) {}
    return res.redirect('/admin/settings?restore_err=1');
  }
});

// --------- Events ---------
app.get('/events', requireAuth, (req, res) => {
  const me = res.locals.me;
  let where = '1=1';
  const params = [];
  if (me.role === 'supervisor') {
    where = 'e.supervisor_id=?';
    params.push(me.id);
  } else if (me.role === 'employee') {
    // Employees only see events they participate in (directly or via stages)
    where = `EXISTS (
      SELECT 1
      FROM tasks t
      WHERE t.event_id=e.id
        AND (
          t.employee_id=?
          OR EXISTS (SELECT 1 FROM task_stages s WHERE s.task_id=t.id AND s.assigned_to=?)
        )
      LIMIT 1
    )`;
    params.push(me.id, me.id);
  }

  const events = db.prepare(`
    SELECT e.*, u.display_name AS supervisor_name
    FROM events e
    LEFT JOIN users u ON u.id=e.supervisor_id
    WHERE ${where}
    ORDER BY datetime(e.created_at) DESC
  `).all(...params);

  res.render('events', { events });
});

app.get('/events/new', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const supervisors = db.prepare("SELECT id, display_name FROM users WHERE role IN ('admin','supervisor') AND is_active=1 ORDER BY display_name").all();
  res.render('event_form', { event: null, supervisors, error: null });
});

app.post('/events', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const { title, start_date, end_date, supervisor_id } = req.body;
  if (!title) {
    const supervisors = db.prepare("SELECT id, display_name FROM users WHERE role IN ('admin','supervisor') AND is_active=1 ORDER BY display_name").all();
    return res.render('event_form', { event: null, supervisors, error: 'اسم المناسبة مطلوب' });
  }
  const now = new Date().toISOString();
  db.prepare('INSERT INTO events (title, start_date, end_date, supervisor_id, created_at) VALUES (?,?,?,?,?)')
    .run(title, start_date || null, end_date || null, supervisor_id || null, now);
  res.redirect('/events');
});

app.get('/events/:id/edit', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!event) return res.status(404).send('غير موجود');
  const supervisors = db.prepare("SELECT id, display_name FROM users WHERE role IN ('admin','supervisor') AND is_active=1 ORDER BY display_name").all();
  res.render('event_form', { event, supervisors, error: null });
});

app.put('/events/:id', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const { title, start_date, end_date, supervisor_id } = req.body;
  db.prepare('UPDATE events SET title=?, start_date=?, end_date=?, supervisor_id=? WHERE id=?')
    .run(title, start_date || null, end_date || null, supervisor_id || null, req.params.id);
  res.redirect('/events');
});

// --------- Project (Event) files ---------
app.get('/events/:id/files', requireAuth, (req, res) => {
  const me = res.locals.me;
  const eid = Number(req.params.id || 0);
  const event = db.prepare(`
    SELECT e.*, u.display_name AS supervisor_name
    FROM events e
    LEFT JOIN users u ON u.id=e.supervisor_id
    WHERE e.id=?
  `).get(eid);
  if (!event) return res.status(404).send('غير موجود');
  if (!isUserInEvent(me, eid)) return res.status(403).send('غير مصرح');

  let where = 'pf.event_id=?';
  const params = [eid];
  // Employees: show team files + their private files only
  if (me.role === 'employee') {
    where += " AND (pf.visibility='team' OR pf.uploaded_by=?)";
    params.push(me.id);
  }

  const files = db.prepare(`
    SELECT pf.*, u.display_name AS uploaded_by_name
    FROM project_files pf
    LEFT JOIN users u ON u.id=pf.uploaded_by
    WHERE ${where}
    ORDER BY datetime(pf.uploaded_at) DESC
  `).all(...params);

  const errKey = String(req.query.err || '');
  const error = errKey === 'filetype' ? 'نوع الملف غير مسموح. المسموح: PDF / صور / Word / Excel / PowerPoint / TXT / CSV / ZIP.' : null;
  res.render('event_files', { event, files, ok: req.query.ok === '1', error });
});

app.post('/events/:id/files/upload', requireAuth, projectUpload.single('file'), (req, res) => {
  const me = res.locals.me;
  const eid = Number(req.params.id || 0);
  const event = db.prepare('SELECT id, title, supervisor_id FROM events WHERE id=?').get(eid);
  if (!event) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return res.status(404).send('غير موجود');
  }
  if (!isUserInEvent(me, eid)) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return res.status(403).send('غير مصرح');
  }
  if (!req.file) return res.redirect(`/events/${eid}/files`);

  const ext = path.extname(req.file.originalname || '').toLowerCase();
  const allowedExt = new Set([
    '.pdf', '.png', '.jpg', '.jpeg', '.webp',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.zip'
  ]);
  if (!allowedExt.has(ext)) {
    try { fs.unlinkSync(req.file.path); } catch(e) {}
    return res.redirect(`/events/${eid}/files?err=filetype`);
  }

  const visibility = (req.body.visibility === 'private') ? 'private' : 'team';
  const now = new Date().toISOString();
  const stored_relpath = path.join('projects', String(eid), req.file.filename).replace(/\\/g, '/');

  db.prepare(`
    INSERT INTO project_files (event_id, task_id, stored_relpath, original_name, mime_type, size_bytes, visibility, uploaded_by, uploaded_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(eid, null, stored_relpath, req.file.originalname, req.file.mimetype, req.file.size, visibility, me.id, now);

  res.redirect(`/events/${eid}/files?ok=1`);
});

// Secure file view/download (checks permissions)
app.get('/files/:id', requireAuth, (req, res) => {
  const me = res.locals.me;
  const fid = Number(req.params.id || 0);
  const f = db.prepare('SELECT * FROM project_files WHERE id=?').get(fid);
  if (!f) return res.status(404).send('غير موجود');

  const eid = Number(f.event_id || 0);
  if (!isUserInEvent(me, eid) && me.role !== 'admin') return res.status(403).send('غير مصرح');

  // Private: only uploader + admins + event supervisor
  if (String(f.visibility || 'team') === 'private' && me.role !== 'admin') {
    const uploaderOk = Number(f.uploaded_by || 0) === Number(me.id);
    let supOk = false;
    if (me.role === 'supervisor') {
      const ev = db.prepare('SELECT supervisor_id FROM events WHERE id=?').get(eid);
      if (ev && Number(ev.supervisor_id || 0) === Number(me.id)) supOk = true;
    }
    if (!uploaderOk && !supOk) return res.status(403).send('غير مصرح');
  }

  const absPath = path.join(UPLOAD_DIR, String(f.stored_relpath || ''));
  const resolved = path.resolve(absPath);
  const base = path.resolve(UPLOAD_DIR);
  if (!resolved.startsWith(base)) return res.status(403).send('غير مصرح');
  if (!fs.existsSync(resolved)) return res.status(404).send('الملف غير موجود على الخادم');

  const fileName = String(f.original_name || 'file');
  const asciiName = fileName.replace(/[^ -~]/g, '_');
  const dl = String(req.query.dl || '') === '1';
  const disp = dl ? 'attachment' : 'inline';
  res.setHeader('Content-Type', f.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disp}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  fs.createReadStream(resolved).pipe(res);
});

// --------- Asset Library (Indexing large media/projects across drives) ---------
function assetThumbMiddleware(redirectTo) {
  return (req, res, next) => {
    assetThumbUpload.single('thumb')(req, res, (err) => {
      if (!err) return next();
      if (String(err.message || '') === 'INVALID_THUMB_TYPE') {
        const sep = redirectTo.includes('?') ? '&' : '?';
        return res.redirect(`${redirectTo}${sep}err=thumbtype`);
      }
      return next(err);
    });
  };
}

function fetchEventsForAssets(me) {
  if (!me) return [];
  if (me.role === 'admin') {
    return db.prepare('SELECT id, title FROM events ORDER BY datetime(created_at) DESC').all();
  }
  const ids = getAccessibleEventIds(me);
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  return db.prepare(`SELECT id, title FROM events WHERE id IN (${ph}) ORDER BY datetime(created_at) DESC`).all(...ids);
}

function canSeeAsset(me, a, accessibleEventIds, supOwnedEventIds) {
  if (!me) return false;
  if (me.role === 'admin') return true;
  const vis = String(a.visibility || 'team');
  if (vis === 'public') return true;
  if (Number(a.created_by || 0) === Number(me.id)) return true;
  if (vis === 'team') {
    const eid = Number(a.event_id || 0);
    return eid && accessibleEventIds.includes(eid);
  }
  if (vis === 'private' && me.role === 'supervisor') {
    const eid = Number(a.event_id || 0);
    return eid && supOwnedEventIds.includes(eid);
  }
  return false;
}

app.get('/assets', requireAuth, (req, res) => {
  const me = res.locals.me;
  const q = String(req.query.q || '').trim();
  const eventId = String(req.query.event || '').trim();
  const driveId = String(req.query.drive || '').trim();
  const type = String(req.query.type || '').trim();
  const visFilter = String(req.query.vis || '').trim();

  const accessibleEventIds = (me.role === 'admin') ? [] : getAccessibleEventIds(me);
  const supOwnedEventIds = (me.role === 'supervisor') ? getSupervisorOwnedEventIds(me) : [];

  const events = fetchEventsForAssets(me);
  const drives = db.prepare('SELECT * FROM asset_drives ORDER BY name').all();

  const whereParts = [];
  const params = [];

  // Scope by role
  if (me.role !== 'admin') {
    const scopeParts = [];
    scopeParts.push("a.visibility='public'");
    scopeParts.push('a.created_by=?');
    params.push(me.id);

    if (accessibleEventIds.length) {
      const ph = accessibleEventIds.map(() => '?').join(',');
      scopeParts.push(`(a.visibility='team' AND a.event_id IN (${ph}))`);
      params.push(...accessibleEventIds);
    }

    if (me.role === 'supervisor' && supOwnedEventIds.length) {
      const ph2 = supOwnedEventIds.map(() => '?').join(',');
      scopeParts.push(`(a.visibility='private' AND a.event_id IN (${ph2}))`);
      params.push(...supOwnedEventIds);
    }
    whereParts.push(`(${scopeParts.join(' OR ')})`);
  }

  // Filters
  if (q) {
    const like = `%${q}%`;
    whereParts.push(`(
      a.title LIKE ? OR a.description LIKE ? OR a.file_path LIKE ? OR a.file_name LIKE ? OR a.tags LIKE ?
      OR e.title LIKE ? OR d.name LIKE ? OR u.display_name LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }
  if (/^\d+$/.test(eventId)) {
    whereParts.push('a.event_id=?');
    params.push(Number(eventId));
  }
  if (/^\d+$/.test(driveId)) {
    whereParts.push('a.drive_id=?');
    params.push(Number(driveId));
  }
  if (type) {
    whereParts.push('a.asset_type=?');
    params.push(type);
  }
  if (visFilter) {
    whereParts.push('a.visibility=?');
    params.push(visFilter);
  }

  const where = whereParts.length ? whereParts.join(' AND ') : '1=1';

  const items = db.prepare(`
    SELECT a.*, e.title AS event_title, d.name AS drive_name, u.display_name AS created_by_name
    FROM assets a
    LEFT JOIN events e ON e.id=a.event_id
    LEFT JOIN asset_drives d ON d.id=a.drive_id
    LEFT JOIN users u ON u.id=a.created_by
    WHERE ${where}
    ORDER BY datetime(a.created_at) DESC
    LIMIT 800
  `).all(...params);

  res.render('assets', {
    items,
    events,
    drives,
    q,
    filters: { eventId, driveId, type, visFilter },
    err: String(req.query.err || ''),
    ok: String(req.query.ok || ''),
  });
});

app.get('/assets/new', requireAuth, (req, res) => {
  const me = res.locals.me;
  const events = fetchEventsForAssets(me);
  const drives = db.prepare('SELECT * FROM asset_drives ORDER BY name').all();
  const preEvent = String(req.query.event || '').trim();
  const errKey = String(req.query.err || '');
  const error = errKey === 'thumbtype' ? 'صورة المعاينة يجب أن تكون ملف صورة (PNG/JPG/WEBP).' : null;
  res.render('asset_form', {
    asset: null,
    events,
    drives,
    preEvent,
    error,
  });
});

app.post('/assets', requireAuth, assetThumbMiddleware('/assets/new'), (req, res) => {
  const me = res.locals.me;
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const file_path = String(req.body.file_path || '').trim();
  const file_name = String(req.body.file_name || '').trim();
  const tags = String(req.body.tags || '').trim();
  const asset_type = String(req.body.asset_type || 'other').trim();
  const visibility = String(req.body.visibility || 'team').trim();
  const event_id = String(req.body.event_id || '').trim();
  const drive_id = String(req.body.drive_id || '').trim();

  if (!title || !file_path) {
    const events = fetchEventsForAssets(me);
    const drives = db.prepare('SELECT * FROM asset_drives ORDER BY name').all();
    return res.render('asset_form', { asset: null, events, drives, preEvent: event_id, error: 'العنوان ومسار الملف مطلوبان.' });
  }

  let eid = null;
  if (/^\d+$/.test(event_id)) {
    eid = Number(event_id);
    if (!isUserInEvent(me, eid)) return res.status(403).send('غير مصرح');
  }

  let did = null;
  if (/^\d+$/.test(drive_id)) did = Number(drive_id);
  if (did) {
    const d = db.prepare('SELECT id FROM asset_drives WHERE id=?').get(did);
    if (!d) did = null;
  }

  let thumb_relpath = null;
  if (req.file) {
    thumb_relpath = path.join('asset_thumbs', req.file.filename).replace(/\\/g, '/');
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO assets (title, description, event_id, task_id, drive_id, file_path, file_name, asset_type, tags, visibility, thumb_relpath, meta_json, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    title,
    description || null,
    eid,
    null,
    did,
    file_path,
    file_name || null,
    asset_type || 'other',
    tags || null,
    (visibility === 'public' ? 'public' : (visibility === 'private' ? 'private' : 'team')),
    thumb_relpath,
    JSON.stringify({}),
    me.id,
    now,
    now
  );

  res.redirect(`/assets?ok=created`);
});

app.get('/assets/:id', requireAuth, (req, res, next) => {
  // Prevent this generic route from swallowing reserved paths like /assets/drives
  const pid = String(req.params.id || '').trim();
  if (!/^\d+$/.test(pid)) return next();
  const me = res.locals.me;
  const id = Number(pid);
  const a = db.prepare(`
    SELECT a.*, e.title AS event_title, d.name AS drive_name, u.display_name AS created_by_name
    FROM assets a
    LEFT JOIN events e ON e.id=a.event_id
    LEFT JOIN asset_drives d ON d.id=a.drive_id
    LEFT JOIN users u ON u.id=a.created_by
    WHERE a.id=?
  `).get(id);
  if (!a) return res.status(404).send('غير موجود');

  const accessibleEventIds = (me.role === 'admin') ? [] : getAccessibleEventIds(me);
  const supOwnedEventIds = (me.role === 'supervisor') ? getSupervisorOwnedEventIds(me) : [];
  if (!canSeeAsset(me, a, accessibleEventIds, supOwnedEventIds)) return res.status(403).send('غير مصرح');

  const canEdit = (me.role === 'admin') || (Number(a.created_by || 0) === Number(me.id)) || (me.role === 'supervisor' && supOwnedEventIds.includes(Number(a.event_id || 0)));
  res.render('asset_view', { a, canEdit });
});

app.get('/assets/:id/edit', requireAuth, (req, res) => {
  const me = res.locals.me;
  const id = Number(req.params.id || 0);
  const a = db.prepare('SELECT * FROM assets WHERE id=?').get(id);
  if (!a) return res.status(404).send('غير موجود');

  const accessibleEventIds = (me.role === 'admin') ? [] : getAccessibleEventIds(me);
  const supOwnedEventIds = (me.role === 'supervisor') ? getSupervisorOwnedEventIds(me) : [];
  if (!canSeeAsset(me, a, accessibleEventIds, supOwnedEventIds)) return res.status(403).send('غير مصرح');

  // Only creator/admin can edit; supervisors may edit assets inside their owned events.
  const creatorOk = Number(a.created_by || 0) === Number(me.id);
  const supOk = (me.role === 'supervisor') && supOwnedEventIds.includes(Number(a.event_id || 0));
  if (!(me.role === 'admin' || creatorOk || supOk)) return res.status(403).send('غير مصرح');

  const events = fetchEventsForAssets(me);
  const drives = db.prepare('SELECT * FROM asset_drives ORDER BY name').all();
  const errKey = String(req.query.err || '');
  const error = errKey === 'thumbtype' ? 'صورة المعاينة يجب أن تكون ملف صورة (PNG/JPG/WEBP).' : null;
  res.render('asset_form', { asset: a, events, drives, preEvent: String(a.event_id || ''), error });
});

app.put('/assets/:id', requireAuth, (req, res, next) => {
  const id = Number(req.params.id || 0);
  const redirectTo = `/assets/${id}/edit`;
  assetThumbMiddleware(redirectTo)(req, res, () => {
    const me = res.locals.me;
    const a = db.prepare('SELECT * FROM assets WHERE id=?').get(id);
    if (!a) return res.status(404).send('غير موجود');

    const accessibleEventIds = (me.role === 'admin') ? [] : getAccessibleEventIds(me);
    const supOwnedEventIds = (me.role === 'supervisor') ? getSupervisorOwnedEventIds(me) : [];
    if (!canSeeAsset(me, a, accessibleEventIds, supOwnedEventIds)) return res.status(403).send('غير مصرح');
    const creatorOk = Number(a.created_by || 0) === Number(me.id);
    const supOk = (me.role === 'supervisor') && supOwnedEventIds.includes(Number(a.event_id || 0));
    if (!(me.role === 'admin' || creatorOk || supOk)) return res.status(403).send('غير مصرح');

    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const file_path = String(req.body.file_path || '').trim();
    const file_name = String(req.body.file_name || '').trim();
    const tags = String(req.body.tags || '').trim();
    const asset_type = String(req.body.asset_type || 'other').trim();
    const visibility = String(req.body.visibility || 'team').trim();
    const event_id = String(req.body.event_id || '').trim();
    const drive_id = String(req.body.drive_id || '').trim();

    if (!title || !file_path) return res.redirect(`${redirectTo}?err=required`);

    let eid = null;
    if (/^\d+$/.test(event_id)) {
      eid = Number(event_id);
      if (!isUserInEvent(me, eid)) return res.status(403).send('غير مصرح');
    }

    let did = null;
    if (/^\d+$/.test(drive_id)) did = Number(drive_id);
    if (did) {
      const d = db.prepare('SELECT id FROM asset_drives WHERE id=?').get(did);
      if (!d) did = null;
    }

    let thumb_relpath = a.thumb_relpath || null;
    if (req.file) {
      // Delete old thumb
      if (thumb_relpath) {
        const oldAbs = path.join(UPLOAD_DIR, String(thumb_relpath || ''));
        try { if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs); } catch(e) {}
      }
      thumb_relpath = path.join('asset_thumbs', req.file.filename).replace(/\\/g, '/');
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE assets
      SET title=?, description=?, event_id=?, drive_id=?, file_path=?, file_name=?, asset_type=?, tags=?, visibility=?, thumb_relpath=?, updated_at=?
      WHERE id=?
    `).run(
      title,
      description || null,
      eid,
      did,
      file_path,
      file_name || null,
      asset_type || 'other',
      tags || null,
      (visibility === 'public' ? 'public' : (visibility === 'private' ? 'private' : 'team')),
      thumb_relpath,
      now,
      id
    );
    res.redirect(`/assets/${id}?ok=1`);
  });
});

app.post('/assets/:id/delete', requireAuth, (req, res) => {
  const me = res.locals.me;
  const id = Number(req.params.id || 0);
  const a = db.prepare('SELECT * FROM assets WHERE id=?').get(id);
  if (!a) return res.status(404).send('غير موجود');

  const supOwnedEventIds = (me.role === 'supervisor') ? getSupervisorOwnedEventIds(me) : [];
  const creatorOk = Number(a.created_by || 0) === Number(me.id);
  const supOk = (me.role === 'supervisor') && supOwnedEventIds.includes(Number(a.event_id || 0));
  if (!(me.role === 'admin' || creatorOk || supOk)) return res.status(403).send('غير مصرح');

  // Remove thumb file if present
  if (a.thumb_relpath) {
    const abs = path.join(UPLOAD_DIR, String(a.thumb_relpath || ''));
    try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch(e) {}
  }
  db.prepare('DELETE FROM assets WHERE id=?').run(id);
  res.redirect('/assets?ok=deleted');
});

app.get('/assets/drives', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const editId = Number(req.query.edit || 0);
  const editing = editId ? db.prepare('SELECT * FROM asset_drives WHERE id=?').get(editId) : null;
  const items = db.prepare(`
    SELECT d.*, (
      SELECT COUNT(1) FROM assets a WHERE a.drive_id=d.id
    ) AS asset_count
    FROM asset_drives d
    ORDER BY d.name
  `).all();
  const errKey = String(req.query.err || '');
  const okKey = String(req.query.ok || '');
  let error = null;
  if (errKey === 'name') error = 'اسم الهارد مطلوب.';
  if (errKey === 'dup') error = 'اسم الهارد مستخدم مسبقًا.';
  if (errKey === 'inuse') error = 'لا يمكن حذف الهارد لأنه مرتبط بأصول.';
  res.render('asset_drives', { items, editing, error, ok: okKey === '1' });
});

app.post('/assets/drives', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const name = String(req.body.name || '').trim();
  const serial = String(req.body.serial || '').trim();
  const location = String(req.body.location || '').trim();
  const notes = String(req.body.notes || '').trim();
  if (!name) return res.redirect('/assets/drives?err=name');
  const exists = db.prepare('SELECT id FROM asset_drives WHERE name=?').get(name);
  if (exists) return res.redirect('/assets/drives?err=dup');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO asset_drives (name, serial, location, notes, created_at, updated_at, last_seen_at) VALUES (?,?,?,?,?,?,?)')
    .run(name, serial || null, location || null, notes || null, now, now, now);
  res.redirect('/assets/drives?ok=1');
});

app.post('/assets/drives/:id/update', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id || 0);
  const name = String(req.body.name || '').trim();
  const serial = String(req.body.serial || '').trim();
  const location = String(req.body.location || '').trim();
  const notes = String(req.body.notes || '').trim();
  if (!id) return res.redirect('/assets/drives?err=name');
  if (!name) return res.redirect(`/assets/drives?edit=${id}&err=name`);

  const exists = db.prepare('SELECT id FROM asset_drives WHERE name=? AND id<>?').get(name, id);
  if (exists) return res.redirect(`/assets/drives?edit=${id}&err=dup`);

  const now = new Date().toISOString();
  db.prepare('UPDATE asset_drives SET name=?, serial=?, location=?, notes=?, updated_at=? WHERE id=?')
    .run(name, serial || null, location || null, notes || null, now, id);
  res.redirect('/assets/drives?ok=1');
});

app.post('/assets/drives/:id/ping', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id || 0);
  const now = new Date().toISOString();
  db.prepare('UPDATE asset_drives SET last_seen_at=?, updated_at=? WHERE id=?').run(now, now, id);
  res.redirect('/assets/drives?ok=1');
});

app.post('/assets/drives/:id/delete', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id || 0);
  const inUse = db.prepare('SELECT 1 AS ok FROM assets WHERE drive_id=? LIMIT 1').get(id);
  if (inUse) return res.redirect('/assets/drives?err=inuse');
  db.prepare('DELETE FROM asset_drives WHERE id=?').run(id);
  res.redirect('/assets/drives?ok=1');
});

// --------- World Days ---------
app.get('/world-days', requireAuth, (req, res) => {
  const me = res.locals.me;
  const q = String(req.query.q || '').trim();
  const todayStr = dayjs().startOf('day').format('YYYY-MM-DD');

  const okKey = String(req.query.ok || '').trim();
  const errKey = String(req.query.err || '').trim();
  const count = Number(req.query.count || 0);
  const skipped = Number(req.query.skipped || 0);
  let ok = null;
  let error = null;

  if (okKey === 'saved') ok = 'تم الحفظ ✅';
  if (okKey === 'deleted') ok = 'تم الحذف ✅';
  if (okKey === 'schedule') ok = 'تم حفظ إعداد التحديث اليومي ✅';
  if (okKey === 'excel') ok = `تم استيراد ${count} عنصر من الإكسل ✅${skipped ? ` (تم تجاوز ${skipped})` : ''}`;
  if (okKey === 'auto') ok = `تم التحديث الآلي: ${count} عنصر ✅${skipped ? ` (تم تجاوز ${skipped})` : ''}`;

  if (errKey === 'required') error = 'الملف أو البيانات المطلوبة غير مكتملة.';
  if (errKey === 'exceltype') error = 'نوع الملف غير صحيح. المطلوب .xlsx';
  if (errKey === 'excelfail') error = 'تعذر قراءة ملف الإكسل.';
  if (errKey === 'autofetch') error = 'تعذر جلب البيانات من المصدر.';
  if (errKey === 'autoparse') error = 'تم جلب الصفحة لكن لم نستطع استخراج الأيام منها.';
  if (errKey === 'source') error = 'مصدر الاستيراد غير صحيح.';

  let where = '1=1';
  const params = [];
  if (q) {
    where += ' AND (wd.title LIKE ? OR wd.category LIKE ? OR wd.notes LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const rows = db.prepare(`
    SELECT wd.*, u.display_name AS created_by_name,
      CASE
        WHEN wd.recurrence='annual' AND wd.month_day IS NOT NULL AND length(wd.month_day)=5 THEN
          CASE
            WHEN date(strftime('%Y','now') || '-' || wd.month_day) < date('now') THEN date(strftime('%Y','now') || '-' || wd.month_day, '+1 year')
            ELSE date(strftime('%Y','now') || '-' || wd.month_day)
          END
        ELSE date(wd.day_date)
      END AS effective_day_date
    FROM world_days wd
    LEFT JOIN users u ON u.id=wd.created_by
    WHERE ${where}
    ORDER BY date(effective_day_date) ASC
  `).all(...params).map(r => {
    const effective = r.effective_day_date || r.day_date;
    const diff = dayjs(effective).startOf('day').diff(dayjs(todayStr), 'day');
    return { ...r, day_date: effective, days_left: diff };
  });

  const s = getSettings();
  const schedule = {
    enabled: Number(s.world_days_auto_enabled ?? 1) ? 1 : 0,
    time: String(s.world_days_auto_time || '03:10'),
    sources: String(s.world_days_auto_sources || 'un_ar,unesco_en'),
    sourcesArr: String(s.world_days_auto_sources || 'un_ar,unesco_en').split(',').map(x => x.trim()).filter(Boolean),
    last_auto_at: s.world_days_last_auto_at || null,
    last_auto_status: s.world_days_last_auto_status || null,
    last_auto_msg: s.world_days_last_auto_msg || null,
    next_run_at: null,
  };
  try { schedule.next_run_at = new Date(Date.now() + msUntilNextLocalTime(schedule.time)).toISOString(); } catch (e) {}

  res.render('world_days', { rows, q, todayStr, canEdit: (me.role !== 'employee'), ok, error, schedule });
});

// World Days auto schedule settings
app.post('/world-days/auto-schedule', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const enabled = req.body.world_days_auto_enabled ? 1 : 0;
  const timeStr = String(req.body.world_days_auto_time || '03:10').trim();
  const sources = [];
  if (req.body.src_un_ar) sources.push('un_ar');
  if (req.body.src_unesco_en) sources.push('unesco_en');
  const srcStr = (sources.length ? sources : ['un_ar','unesco_en']).join(',');

  try {
    db.prepare('UPDATE settings SET world_days_auto_enabled=?, world_days_auto_time=?, world_days_auto_sources=? WHERE id=1')
      .run(enabled, timeStr || '03:10', srcStr);
  } catch (e) {}

  // Reschedule the daily job with new settings
  try { rescheduleWorldDaysAutoUpdate(); } catch (e) {}
  res.redirect('/world-days?ok=schedule');
});

// Download Excel template for importing world days
app.get('/world-days/template.xlsx', requireAuth, requireRole('admin','supervisor'), async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('world_days');
    ws.columns = [
      { header: 'العنوان (title)', key: 'title', width: 40 },
      { header: 'التاريخ (YYYY-MM-DD)', key: 'day_date', width: 18 },
      { header: 'التصنيف (اختياري)', key: 'category', width: 18 },
      { header: 'ملاحظات (اختياري)', key: 'notes', width: 45 },
      { header: 'مفعل (1/0)', key: 'is_active', width: 12 },
    ];
    ws.addRow({
      title: 'مثال: اليوم العالمي للمعلم',
      day_date: dayjs().add(10, 'day').format('YYYY-MM-DD'),
      category: 'يوم عالمي',
      notes: 'ملاحظة اختيارية',
      is_active: 1,
    });

    const fileName = `world-days-template-${dayjs().format('YYYYMMDD')}.xlsx`;
    const asciiName = asciiSafeName(fileName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    res.redirect('/world-days?err=excelfail');
  }
});

// Import world days from Excel (.xlsx)
app.post('/world-days/import/excel', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  worldDaysExcelUpload.single('file')(req, res, async (err) => {
    if (err) {
      if (String(err.message || '').includes('INVALID_EXCEL_TYPE')) return res.redirect('/world-days?err=exceltype');
      return res.redirect('/world-days?err=excelfail');
    }
    const me = res.locals.me;
    if (!req.file || !req.file.buffer) return res.redirect('/world-days?err=required');

    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) return res.redirect('/world-days?err=excelfail');

      // Build header map
      const headerRow = ws.getRow(1);
      const headerMap = {};
      headerRow.eachCell((cell, col) => {
        const v = String(cell.value || '').trim().toLowerCase();
        if (!v) return;
        const norm = v
          .replace(/\(.*?\)/g,'')
          .replace(/[^a-z0-9\u0600-\u06ff_\s-]/g,'')
          .replace(/\s+/g,'')
          .trim();
        headerMap[norm] = col;
      });

      const pickCol = (keys) => {
        for (const k of keys) {
          const kk = String(k).toLowerCase().replace(/\s+/g,'');
          if (headerMap[kk]) return headerMap[kk];
        }
        return null;
      };

      const colTitle = pickCol(['title','العنوان','اسم','اليوم','title']);
      const colDate = pickCol(['day_date','date','التاريخ','daydate','day_date']);
      const colCategory = pickCol(['category','التصنيف','الفئة']);
      const colNotes = pickCol(['notes','ملاحظات','note']);
      const colActive = pickCol(['is_active','active','مفعل','تفعيل']);

      if (!colTitle || !colDate) return res.redirect('/world-days?err=required');

      let inserted = 0;
      let skipped = 0;
      const now = new Date().toISOString();

      const excelSerialToDate = (serial) => {
        const n = Number(serial);
        if (!Number.isFinite(n)) return null;
        // Excel 1900 date system: ...
        const utcDays = n - 25569;
        const utcValue = utcDays * 86400; // seconds
        const dt = new Date(utcValue * 1000);
        if (Number.isNaN(dt.getTime())) return null;
        return dt;
      };

      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const titleRaw = row.getCell(colTitle).value;
        const dateRaw = row.getCell(colDate).value;
        const title = String(titleRaw || '').trim();
        if (!title) { skipped++; continue; }

        let day_date = null;
        if (dateRaw instanceof Date) {
          day_date = dayjs(dateRaw).format('YYYY-MM-DD');
        } else if (typeof dateRaw === 'number') {
          const dt = excelSerialToDate(dateRaw);
          if (dt) day_date = dayjs(dt).format('YYYY-MM-DD');
        } else {
          const s = String((dateRaw && dateRaw.text) ? dateRaw.text : (dateRaw || '')).trim();
          if (!s) { skipped++; continue; }
          // Accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD/MM
          let dt = dayjs(s, ['YYYY-MM-DD','DD/MM/YYYY','DD-MM-YYYY','YYYY/MM/DD','DD/MM'], true);
          if (!dt.isValid()) dt = dayjs(s);
          if (!dt.isValid()) { skipped++; continue; }
          // If no year provided (rare), pick next occurrence
          if (s.match(/^\d{1,2}\/\d{1,2}$/)) {
            const m = dt.month() + 1;
            const d = dt.date();
            day_date = computeNextOccurrenceDate(m, d);
          } else {
            day_date = dt.format('YYYY-MM-DD');
          }
        }

        // Always normalize to next occurrence (annual behavior)
        try {
          const dt2 = dayjs(day_date);
          if (dt2.isValid()) {
            const m2 = dt2.month() + 1;
            const d2 = dt2.date();
            const next = computeNextOccurrenceDate(m2, d2);
            if (next) day_date = next;
          }
        } catch (e) {}

        const category = colCategory ? String(row.getCell(colCategory).value || '').trim() : '';
        const notes = colNotes ? String(row.getCell(colNotes).value || '').trim() : '';
        const activeRaw = colActive ? row.getCell(colActive).value : null;
        const is_active = (String(activeRaw || '1').trim() === '0') ? 0 : 1;

        // Derive month_day for annual support
        const md = (() => {
          const dt = dayjs(day_date);
          if (!dt.isValid()) return null;
          return `${String(dt.month()+1).padStart(2,'0')}-${String(dt.date()).padStart(2,'0')}`;
        })();

        // Upsert (do not override manual entries)
        let existing = null;
        if (md) existing = db.prepare('SELECT * FROM world_days WHERE title=? AND month_day=? LIMIT 1').get(title, md);
        if (!existing) existing = db.prepare('SELECT * FROM world_days WHERE title=? AND day_date=? LIMIT 1').get(title, day_date);

        if (existing) {
          // Treat NULL source as manual (older data)
          if (!existing.source || String(existing.source || '') === 'manual') { skipped++; continue; }
          db.prepare(`
            UPDATE world_days
            SET day_date=?, category=?, notes=?, is_active=?, source=?, source_ref=?, recurrence=?, month_day=?, updated_at=?
            WHERE id=?
          `).run(day_date, category || existing.category || null, notes || existing.notes || null, is_active, 'excel', req.file.originalname || null, existing.recurrence || 'annual', md || existing.month_day || null, now, existing.id);
        } else {
          db.prepare(`
            INSERT INTO world_days (title, day_date, category, notes, is_active, source, source_ref, recurrence, month_day, created_by, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          `).run(title, day_date, category || null, notes || null, is_active, 'excel', req.file.originalname || null, 'annual', md || null, me.id, now, now);
        }
        inserted++;
      }

      // Notify kiosk clients
      try { kioskBroadcast('update', { type: 'world_days' }); } catch(e) {}
      res.redirect(`/world-days?ok=excel&count=${inserted}&skipped=${skipped}`);
    } catch (e) {
      res.redirect('/world-days?err=excelfail');
    }
  });
});

// Auto import world days from official websites
app.post('/world-days/import/auto', requireAuth, requireRole('admin','supervisor'), async (req, res) => {
  const me = res.locals.me;
  const source = String(req.body.source || 'un_ar').trim();
  let url = null;
  let parser = null;
  let sourceName = null;

  if (source === 'un_ar') {
    url = 'https://www.un.org/ar/observances/list-days-weeks';
    parser = parseWorldDaysFromUnArabic;
    sourceName = 'un';
  } else if (source === 'unesco_en') {
    url = 'https://www.unesco.org/en/days/list';
    parser = parseWorldDaysFromUnescoEnglish;
    sourceName = 'unesco';
  } else {
    return res.redirect('/world-days?err=source');
  }

  try {
    const html = await safeFetchText(url, { timeoutMs: 15000 });
    const items = (parser ? parser(html) : []) || [];
    if (!items.length) return res.redirect('/world-days?err=autoparse');

    let inserted = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const it of items) {
      const title = String(it.title || '').trim();
      const month = Number(it.month || 0);
      const day = Number(it.day || 0);
      if (!title || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) { skipped++; continue; }
      const day_date = computeNextOccurrenceDate(month, day);
      if (!day_date) { skipped++; continue; }
      const month_day = `${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const category = title.includes('أسبوع') ? 'أسبوع عالمي' : (title.includes('يوم') ? 'يوم عالمي' : 'مناسبة عالمية');

      // Upsert based on title+month_day (do not override manual)
      const existing = db.prepare('SELECT * FROM world_days WHERE title=? AND month_day=? LIMIT 1').get(title, month_day);
      if (existing) {
        // Treat NULL source as manual (older data)
        if (!existing.source || String(existing.source || '') === 'manual') { skipped++; continue; }
        db.prepare(`
          UPDATE world_days
          SET day_date=?, category=COALESCE(?,category), notes=notes, is_active=is_active,
              source=?, source_ref=?, recurrence=?, month_day=?, updated_at=?
          WHERE id=?
        `).run(day_date, category || null, sourceName, url, 'annual', month_day, now, existing.id);
        inserted++;
        continue;
      }

      db.prepare(`
        INSERT INTO world_days (title, day_date, category, notes, is_active, source, source_ref, recurrence, month_day, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(title, day_date, category || null, null, 1, sourceName, url, 'annual', month_day, me.id, now, now);
      inserted++;
    }

    // Notify kiosk clients
    try { kioskBroadcast('update', { type: 'world_days' }); } catch (e) {}
    res.redirect(`/world-days?ok=auto&count=${inserted}&skipped=${skipped}`);
  } catch (e) {
    res.redirect('/world-days?err=autofetch');
  }
});

// Update from both official sources in one click
app.post('/world-days/import/auto-all', requireAuth, requireRole('admin','supervisor'), async (req, res) => {
  try {
    const result = await runWorldDaysAutoUpdateJob('manual');
    if (result && result.ok) {
      return res.redirect(`/world-days?ok=auto&count=${result.inserted || 0}&skipped=${result.skipped || 0}`);
    }
    return res.redirect('/world-days?err=autofetch');
  } catch (e) {
    return res.redirect('/world-days?err=autofetch');
  }
});

// ---- World Days: scheduled daily auto update ----
let worldDaysAutoTimeout = null;
let worldDaysAutoInterval = null;

function clearWorldDaysAutoTimers() {
  if (worldDaysAutoTimeout) clearTimeout(worldDaysAutoTimeout);
  if (worldDaysAutoInterval) clearInterval(worldDaysAutoInterval);
  worldDaysAutoTimeout = null;
  worldDaysAutoInterval = null;
}

function msUntilNextLocalTime(timeStr) {
  const fallback = '03:10';
  const s = String(timeStr || fallback).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  const h = m ? Math.min(23, Math.max(0, Number(m[1]))) : 3;
  const min = m ? Math.min(59, Math.max(0, Number(m[2]))) : 10;
  const now = new Date();
  const next = new Date(now.getTime());
  next.setHours(h, min, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function setWorldDaysAutoStatus(status, msg) {
  try {
    db.prepare('UPDATE settings SET world_days_last_auto_at=?, world_days_last_auto_status=?, world_days_last_auto_msg=? WHERE id=1')
      .run(new Date().toISOString(), String(status || ''), msg ? String(msg).slice(0, 500) : null);
  } catch (e) {}
}

async function runWorldDaysAutoUpdateJob(trigger = 'scheduled') {
  const settings = getSettings();
  const enabled = Number(settings.world_days_auto_enabled ?? 1) ? 1 : 0;
  if (!enabled) return { ok: false, skipped: true };

  const sourcesStr = String(settings.world_days_auto_sources || 'un_ar,unesco_en');
  const sources = sourcesStr.split(',').map(s => s.trim()).filter(Boolean);
  const srcs = sources.length ? sources : ['un_ar', 'unesco_en'];

  let totalInserted = 0;
  let totalSkipped = 0;
  const now = new Date().toISOString();

  try {
    for (const source of srcs) {
      let url = null;
      let parser = null;
      let sourceName = null;
      if (source === 'un_ar') {
        url = 'https://www.un.org/ar/observances/list-days-weeks';
        parser = parseWorldDaysFromUnArabic;
        sourceName = 'un';
      } else if (source === 'unesco_en') {
        url = 'https://www.unesco.org/en/days/list';
        parser = parseWorldDaysFromUnescoEnglish;
        sourceName = 'unesco';
      } else {
        continue;
      }

      let html = null;
      try {
        html = await safeFetchText(url, { timeoutMs: 15000 });
      } catch (e) {
        totalSkipped++;
        continue;
      }
      const items = (parser ? parser(html) : []) || [];
      if (!items.length) { totalSkipped++; continue; }

      for (const it of items) {
        const title = String(it.title || '').trim();
        const month = Number(it.month || 0);
        const day = Number(it.day || 0);
        if (!title || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) { totalSkipped++; continue; }
        const day_date = computeNextOccurrenceDate(month, day);
        if (!day_date) { totalSkipped++; continue; }
        const month_day = `${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const category = title.includes('أسبوع') ? 'أسبوع عالمي' : (title.includes('يوم') ? 'يوم عالمي' : 'مناسبة عالمية');

        const existing = db.prepare('SELECT * FROM world_days WHERE title=? AND month_day=? LIMIT 1').get(title, month_day);
        if (existing) {
          if (!existing.source || String(existing.source || '') === 'manual') { totalSkipped++; continue; }
          db.prepare(`
            UPDATE world_days
            SET day_date=?, category=COALESCE(?,category), notes=notes, is_active=is_active,
                source=?, source_ref=?, recurrence=?, month_day=?, updated_at=?
            WHERE id=?
          `).run(day_date, category || null, sourceName, url, 'annual', month_day, now, existing.id);
          totalInserted++;
          continue;
        }

        db.prepare(`
          INSERT INTO world_days (title, day_date, category, notes, is_active, source, source_ref, recurrence, month_day, created_by, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(title, day_date, category || null, null, 1, sourceName, url, 'annual', month_day, null, now, now);
        totalInserted++;
      }
    }

    setWorldDaysAutoStatus('ok', `${trigger}: inserted=${totalInserted}, skipped=${totalSkipped}`);
    try { kioskBroadcast('update', { type: 'world_days' }); } catch (e) {}
    return { ok: true, inserted: totalInserted, skipped: totalSkipped };
  } catch (e) {
    setWorldDaysAutoStatus('err', `${trigger}: ${String(e && e.message ? e.message : e)}`);
    return { ok: false, error: e };
  }
}

function rescheduleWorldDaysAutoUpdate() {
  clearWorldDaysAutoTimers();
  const settings = getSettings();
  const enabled = Number(settings.world_days_auto_enabled ?? 1) ? 1 : 0;
  if (!enabled) return;
  const timeStr = settings.world_days_auto_time || '03:10';
  const ms = msUntilNextLocalTime(timeStr);
  worldDaysAutoTimeout = setTimeout(async () => {
    await runWorldDaysAutoUpdateJob('scheduled');
    worldDaysAutoInterval = setInterval(() => {
      runWorldDaysAutoUpdateJob('scheduled').catch(() => {});
    }, 24 * 60 * 60 * 1000);
  }, ms);
}

app.get('/world-days/new', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  res.render('world_day_form', { item: null, error: null });
});

app.post('/world-days/new', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const title = String(req.body.title || '').trim();
  const day_date = String(req.body.day_date || '').trim();
  const category = String(req.body.category || '').trim();
  const notes = String(req.body.notes || '').trim();
  const is_active = req.body.is_active ? 1 : 0;
  if (!title || !day_date) return res.render('world_day_form', { item: null, error: 'اسم اليوم وتاريخه مطلوبة.' });
  const now = new Date().toISOString();
  const dt = dayjs(day_date);
  const month_day = dt.isValid() ? `${String(dt.month()+1).padStart(2,'0')}-${String(dt.date()).padStart(2,'0')}` : null;
  db.prepare(`
    INSERT INTO world_days (title, day_date, category, notes, is_active, source, recurrence, month_day, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(title, day_date, category || null, notes || null, is_active, 'manual', 'once', month_day, me.id, now, now);
  try { kioskBroadcast('update', { type: 'world_days' }); } catch(e) {}
  res.redirect('/world-days?ok=saved');
});

app.get('/world-days/:id/edit', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id || 0);
  const item = db.prepare('SELECT * FROM world_days WHERE id=?').get(id);
  if (!item) return res.status(404).send('غير موجود');
  res.render('world_day_form', { item, error: null });
});

app.post('/world-days/:id/edit', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id || 0);
  const item = db.prepare('SELECT * FROM world_days WHERE id=?').get(id);
  if (!item) return res.status(404).send('غير موجود');

  const title = String(req.body.title || '').trim();
  const day_date = String(req.body.day_date || '').trim();
  const category = String(req.body.category || '').trim();
  const notes = String(req.body.notes || '').trim();
  const is_active = req.body.is_active ? 1 : 0;
  if (!title || !day_date) return res.render('world_day_form', { item: { ...item, title, day_date, category, notes, is_active }, error: 'اسم اليوم وتاريخه مطلوبة.' });

  const now = new Date().toISOString();
  const dt = dayjs(day_date);
  const month_day = dt.isValid() ? `${String(dt.month()+1).padStart(2,'0')}-${String(dt.date()).padStart(2,'0')}` : null;
  db.prepare(`
    UPDATE world_days
    SET title=?, day_date=?, category=?, notes=?, is_active=?, month_day=COALESCE(?,month_day), source=COALESCE(source,'manual'), updated_at=?
    WHERE id=?
  `).run(title, day_date, category || null, notes || null, is_active, month_day, now, id);
  try { kioskBroadcast('update', { type: 'world_days' }); } catch(e) {}
  res.redirect('/world-days?ok=saved');
});

app.post('/world-days/:id/delete', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id || 0);
  db.prepare('DELETE FROM world_days WHERE id=?').run(id);
  try { kioskBroadcast('update', { type: 'world_days' }); } catch(e) {}
  res.redirect('/world-days?ok=deleted');
});

// --------- Tasks ---------
app.get('/tasks', requireAuth, (req, res) => {
  const me = res.locals.me;
  const q = (req.query.q || '').trim();
  const status = (req.query.status || '').trim();

  let where = "(t.status IS NULL OR t.status <> 'cancelled')";
  const params = [];

  if (me.role === 'employee') {
    where += ' AND (t.employee_id=? OR EXISTS (SELECT 1 FROM task_stages s WHERE s.task_id=t.id AND s.assigned_to=?))';
    params.push(me.id, me.id);
  } else if (me.role === 'supervisor') {
    where += ' AND t.supervisor_id=?';
    params.push(me.id);
  }

  if (q) {
    where += ' AND (t.title LIKE ? OR e.title LIKE ? OR u1.display_name LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (status) {
    where += ' AND t.status=?';
    params.push(status);
  }

  const tasks = db.prepare(`
    SELECT t.*, e.title AS event_title,
      u1.display_name AS employee_name,
      u2.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u1 ON u1.id=t.employee_id
    LEFT JOIN users u2 ON u2.id=t.supervisor_id
    WHERE ${where}
    ORDER BY datetime(t.updated_at) DESC
  `).all(...params);

  const computed = tasks.map(t => ({
    ...t,
    status: computeTaskStatus(t),
    progress: calcProgress(t.done_value, t.target_value),
  }));

  res.render('tasks', { tasks: computed, q, status });
});

app.get('/tasks/new', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const events = db.prepare('SELECT id, title FROM events ORDER BY datetime(created_at) DESC').all();
  const employees = db.prepare("SELECT id, display_name, user_kind, specialty FROM users WHERE role='employee' AND is_active=1 ORDER BY display_name").all();
  const supervisors = db.prepare("SELECT id, display_name FROM users WHERE role IN ('admin','supervisor') AND is_active=1 ORDER BY display_name").all();
  const assignees = db.prepare("SELECT id, display_name, role, user_kind, specialty FROM users WHERE is_active=1 ORDER BY display_name").all();
  const settings = getSettings();
  const stageTemplates = getStageTemplatesFromSettings(settings);
  res.render('task_form', { task: null, stages: [], events, employees, supervisors, assignees, stageTemplates, error: null });
});

app.post('/tasks', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const {
    title, description, event_id, employee_id, supervisor_id,
    target_value, done_value, priority, start_date, due_date, status
  } = req.body;

  const settings = getSettings();
  const stageTemplates = getStageTemplatesFromSettings(settings);

  if (!title) {
    const events = db.prepare('SELECT id, title FROM events ORDER BY datetime(created_at) DESC').all();
    const employees = db.prepare("SELECT id, display_name, user_kind, specialty FROM users WHERE role='employee' AND is_active=1 ORDER BY display_name").all();
    const supervisors = db.prepare("SELECT id, display_name FROM users WHERE role IN ('admin','supervisor') AND is_active=1 ORDER BY display_name").all();
    const assignees = db.prepare("SELECT id, display_name, role, user_kind, specialty FROM users WHERE is_active=1 ORDER BY display_name").all();
    return res.render('task_form', { task: null, stages: [], events, employees, supervisors, assignees, stageTemplates, error: 'اسم المهمة مطلوب' });
  }

  // Stages selection (optional)
  const stageKeys = ensureArray(req.body.stage_keys).map(x => String(x || '').trim()).filter(Boolean);
  const assignedToMap = (req.body.assigned_to && typeof req.body.assigned_to === 'object') ? req.body.assigned_to : {};
  const customStageName = String(req.body.custom_stage_name || '').trim();
  const customStageAssignee = req.body.custom_stage_assigned_to ? Number(req.body.custom_stage_assigned_to) : null;

  const stageItems = [];
  for (const key of stageKeys) {
    stageItems.push({
      stage_key: key,
      stage_name: stageNameFromKey(key),
      assigned_to: assignedToMap[key] ? Number(assignedToMap[key]) : null,
    });
  }
  if (customStageName) {
    stageItems.push({
      stage_key: null,
      stage_name: customStageName,
      assigned_to: customStageAssignee,
    });
  }

  const useStages = stageItems.length > 0;
  const now = new Date().toISOString();

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      title, description, event_id, employee_id, supervisor_id,
      target_value, done_value, priority, start_date, due_date, status,
      progress_mode,
      created_by, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const info = insertTask.run(
    title,
    description || null,
    event_id || null,
    employee_id || null,
    supervisor_id || null,
    useStages ? 100 : Number(target_value || 0),
    useStages ? 0 : Number(done_value || 0),
    priority || 'medium',
    start_date || null,
    due_date || null,
    useStages ? 'new' : (status || 'new'),
    useStages ? 'stages' : 'simple',
    me.id,
    now,
    now
  );

  const newTaskId = info.lastInsertRowid;

  // Insert stages with equal weights
  if (useStages) {
    const cnt = stageItems.length;
    const w = cnt ? (100 / cnt) : 0;
    const insertStage = db.prepare(`
      INSERT INTO task_stages (task_id, stage_key, stage_name, weight, assigned_to, progress, status, sort_order, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    let idx = 0;
    for (const s of stageItems) {
      insertStage.run(newTaskId, s.stage_key, s.stage_name, w, s.assigned_to || null, 0, 'new', idx, now, now);
      idx += 1;
    }
    recalcTaskFromStages(newTaskId);
  }


  // Email notifications + in-app notifications: new task assignment (all participants)
  sendTaskAssignmentEmailsAll(req, newTaskId, { reason: 'new_task' });

    res.redirect('/tasks');
});


// --------- Manual Email Reminder (per task) ---------
app.post('/tasks/:id/remind-email', requireAuth, requireRole('admin','supervisor'), async (req, res) => {
  const me = res.locals.me;
  try {
    const task = db.prepare(`
      SELECT t.*, 
        u1.email AS employee_email, u1.display_name AS employee_name,
        u2.display_name AS supervisor_name
      FROM tasks t
      LEFT JOIN users u1 ON u1.id=t.employee_id
      LEFT JOIN users u2 ON u2.id=t.supervisor_id
      WHERE t.id=?
    `).get(req.params.id);

    if (!task) return res.status(404).send('غير موجود');
    if (String(task.status || '') === 'cancelled') return res.status(404).send('غير موجود');

    // مشرف: لازم تكون المهمة تابعة له
    if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

    const settings = getSettings();
    const enabled = settings && (settings.email_enabled === 1 || settings.email_enabled === true || settings.email_enabled === '1');
    if (!enabled) {
      return res.redirect(`/tasks/${task.id}?email_err=${encodeURIComponent('البريد غير مفعّل من الإعدادات')}`);
    }

    if (!task.employee_email) {
      return res.redirect(`/tasks/${task.id}?email_err=${encodeURIComponent('لا يوجد بريد للموظف (عدّل المستخدم وأضف email)')}`);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const taskLink = `${baseUrl}/tasks/${task.id}`;

    const extraMsg = String(req.body.message || '').trim();
    const subject = `تذكير بخصوص المهمة: ${task.title}`;

    const html = `
      <div style="font-family:Tahoma,Arial;direction:rtl;text-align:right">
        <h3 style="margin:0 0 8px 0">تذكير بالمهمة</h3>
        <div><b>المهمة:</b> ${task.title}</div>
        ${task.due_date ? `<div><b>تاريخ الاستحقاق:</b> ${task.due_date}</div>` : ``}
        ${extraMsg ? `<div style="margin-top:8px"><b>ملاحظة:</b> ${extraMsg}</div>` : ``}
        <div style="margin-top:12px"><a href="${taskLink}">فتح المهمة</a></div>
      </div>
    `;

    await sendMail(settings, { to: task.employee_email, subject, html });

    // log
    try {
      db.prepare("INSERT OR IGNORE INTO email_logs(type, task_id, stage_id, to_email, ref, meta_json, sent_at) VALUES (?,?,?,?,?,?,?)")
        .run('manual_task_reminder', task.id, null, task.employee_email, new Date().toISOString(), extraMsg ? JSON.stringify({ message: extraMsg }) : null, new Date().toISOString());
    } catch (e) {}

    return res.redirect(`/tasks/${task.id}?email_sent=1`);
  } catch (e) {
    return res.redirect(`/tasks/${req.params.id}?email_err=${encodeURIComponent('تعذر إرسال التذكير (تحقق من إعدادات SMTP)')}`);
  }
});

app.get('/tasks/:id', requireAuth, (req, res) => {
  const me = res.locals.me;
  const task = db.prepare(`
    SELECT t.*, e.title AS event_title,
      u1.display_name AS employee_name,
      u2.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u1 ON u1.id=t.employee_id
    LEFT JOIN users u2 ON u2.id=t.supervisor_id
    WHERE t.id=?
  `).get(req.params.id);

  if (!task) return res.status(404).send('غير موجود');

  
  if (String(task.status || '') === 'cancelled') return res.status(404).send('غير موجود');
// Scope enforcement
  if (me.role === 'employee' && !isTaskVisibleToEmployee(task.id, me.id)) return res.status(403).send('غير مصرح');
  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  const updates = db.prepare(`
    SELECT tu.*, u.display_name AS created_by_name
    FROM task_updates tu
    LEFT JOIN users u ON u.id=tu.created_by
    WHERE tu.task_id=?
    ORDER BY datetime(tu.created_at) DESC
  `).all(req.params.id);

  const approvals = db.prepare(`
    SELECT a.*, u.display_name AS approved_by_name
    FROM approvals a
    LEFT JOIN users u ON u.id=a.approved_by
    WHERE a.task_id=?
    ORDER BY datetime(a.approved_at) DESC
  `).all(req.params.id);

  const attachments = db.prepare(`
    SELECT at.*, u.display_name AS uploaded_by_name
    FROM attachments at
    LEFT JOIN users u ON u.id=at.uploaded_by
    WHERE at.task_id=?
    ORDER BY datetime(at.uploaded_at) DESC
  `).all(req.params.id);

  // Stages (if task is stage-based)
  let stages = [];
  if (String(task.progress_mode || 'simple') === 'stages') {
    stages = db.prepare(`
      SELECT s.*, u.display_name AS assigned_to_name
      FROM task_stages s
      LEFT JOIN users u ON u.id=s.assigned_to
      WHERE s.task_id=? AND (s.status IS NULL OR s.status <> 'cancelled')
      ORDER BY s.sort_order ASC
    `).all(task.id);

    stages = stages.map(s => {
      if (s && s.stage_key) {
        const sk = String(s.stage_key || '').trim();
        const sn = String(s.stage_name || '').trim();
        if (!sn || sn === sk || sn.startsWith('tpl_')) {
          return { ...s, stage_name: stageNameFromKey(sk) };
        }
      }
      return s;
    });
  }

  const computed = {
    ...task,
    status: computeTaskStatus(task),
    progress: calcProgress(task.done_value, task.target_value),
  };

  const settings = getSettings();
  const stageTemplates = getStageTemplatesFromSettings(settings);

  const errKey = String(req.query.err || '');
  const error = errKey === 'filetype' ? 'نوع الملف غير مسموح. المسموح فقط: PDF أو صور.' : null;

  const emailSent = req.query.email_sent === '1';
  const emailErr = req.query.email_err ? String(req.query.email_err) : null;

  res.render('task_detail', { task: computed, updates, approvals, attachments, stages, stageTemplates, error, ok: req.query.ok === '1', emailSent, emailErr });
});

app.get('/tasks/:id/edit', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).send('غير موجود');

  if (String(task.status || '') === 'cancelled') return res.status(404).send('غير موجود');

  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  const events = db.prepare('SELECT id, title FROM events ORDER BY datetime(created_at) DESC').all();
  const employees = db.prepare("SELECT id, display_name, user_kind, specialty FROM users WHERE role='employee' AND is_active=1 ORDER BY display_name").all();
  const supervisors = db.prepare("SELECT id, display_name FROM users WHERE role IN ('admin','supervisor') AND is_active=1 ORDER BY display_name").all();
  const assignees = db.prepare("SELECT id, display_name, role, user_kind, specialty FROM users WHERE is_active=1 ORDER BY display_name").all();
  const settings = getSettings();
  const stageTemplates = getStageTemplatesFromSettings(settings);

  let stages = db.prepare(`
    SELECT s.*, u.display_name AS assigned_to_name
    FROM task_stages s
    LEFT JOIN users u ON u.id=s.assigned_to
    WHERE s.task_id=? AND (s.status IS NULL OR s.status <> 'cancelled')
    ORDER BY s.sort_order ASC
  `).all(task.id);

  stages = stages.map(s => {
    if (s && s.stage_key) {
      const sk = String(s.stage_key || '').trim();
      const sn = String(s.stage_name || '').trim();
      if (!sn || sn === sk || sn.startsWith('tpl_')) {
        return { ...s, stage_name: stageNameFromKey(sk) };
      }
    }
    return s;
  });

  res.render('task_form', { task, stages, events, employees, supervisors, assignees, stageTemplates, error: null });
});

// Hard delete task + related data (stages/updates/attachments)
function hardDeleteTask(taskId){
  // node:sqlite DatabaseSync does not support db.transaction()
  // Use explicit BEGIN/COMMIT/ROLLBACK to ensure atomic delete
  db.exec('BEGIN;');
  try {
    // Remove attachment files first (support older/newer column names)
    const attCols = db.prepare('PRAGMA table_info(attachments)').all().map(c => c.name);
    const storedCol = attCols.includes('stored_filename')
      ? 'stored_filename'
      : (attCols.includes('stored_name') ? 'stored_name' : null);

    if (storedCol) {
      const atts = db.prepare(`SELECT ${storedCol} AS stored_file FROM attachments WHERE task_id=?`).all(taskId);
      for (const a of atts) {
        if (a && a.stored_file) {
          try { fs.unlinkSync(path.join(UPLOADS_DIR, a.stored_file)); } catch(e){}
        }
      }
    }

    // Collect stage ids to clean stage_updates
    const stageIds = db.prepare('SELECT id FROM task_stages WHERE task_id=?').all(taskId).map(r => r.id);
    if (stageIds.length) {
      const qs = stageIds.map(()=>'?').join(',');
      db.prepare(`DELETE FROM stage_updates WHERE stage_id IN (${qs})`).run(...stageIds);
    }

    db.prepare('DELETE FROM task_stages WHERE task_id=?').run(taskId);
    db.prepare('DELETE FROM task_updates WHERE task_id=?').run(taskId);
    db.prepare('DELETE FROM approvals WHERE task_id=?').run(taskId);
    db.prepare('DELETE FROM attachments WHERE task_id=?').run(taskId);
    db.prepare('DELETE FROM tasks WHERE id=?').run(taskId);

    db.exec('COMMIT;');
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch(e){}
    throw err;
  }
}


// Delete task (hard delete)
app.delete('/tasks/:id', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const id = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  if (!task) return res.status(404).send('غير موجود');
  if (String(task.status || '') === 'cancelled') return res.status(404).send('غير موجود');

  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  hardDeleteTask(id);
  res.redirect('/tasks?deleted=1');
});

app.put('/tasks/:id', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).send('غير موجود');
  if (String(task.status || '') === 'cancelled') return res.status(404).send('غير موجود');

  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  const {
    title, description, event_id, employee_id, supervisor_id,
    target_value, done_value, priority, start_date, due_date, status
  } = req.body;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE tasks SET
      title=?, description=?, event_id=?, employee_id=?, supervisor_id=?,
      target_value=?, done_value=?, priority=?, start_date=?, due_date=?, status=?,
      updated_at=?
    WHERE id=?
  `).run(
    title,
    description || null,
    event_id || null,
    employee_id || null,
    supervisor_id || null,
    Number(target_value || 0),
    Number(done_value || 0),
    priority || 'medium',
    start_date || null,
    due_date || null,
    status || 'new',
    now,
    req.params.id
  );



  // Email notifications + in-app notifications: task reassigned
  try {
    const oldEmployee = task.employee_id ? Number(task.employee_id) : null;
    const newEmployee = employee_id ? Number(employee_id) : null;
    if (newEmployee && newEmployee !== oldEmployee) {
      sendTaskAssignmentEmailsAll(req, Number(req.params.id), { reason: 'task_reassigned' });
    }
  } catch (e) {}

    res.redirect(`/tasks/${req.params.id}?ok=1`);
});

// Employee/Supervisor update progress
app.post('/tasks/:id/update', requireAuth, (req, res) => {
  const me = res.locals.me;
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).send('غير موجود');
  if (String(task.status || '') === 'cancelled') return res.status(404).send('غير موجود');

  if (me.role === 'employee' && !isTaskVisibleToEmployee(task.id, me.id)) return res.status(403).send('غير مصرح');
  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  // Stage-based tasks: progress is updated per stage
  if (String(task.progress_mode || 'simple') === 'stages') {
    return res.redirect(`/tasks/${task.id}`);
  }

  const done_value = Number(req.body.done_value || task.done_value);
  const note = (req.body.note || '').trim();

  const now = new Date().toISOString();

  db.prepare('INSERT INTO task_updates (task_id, done_value, note, created_by, created_at) VALUES (?,?,?,?,?)')
    .run(task.id, done_value, note || null, me.id, now);

  // Professional flow:
  // - reaching 100% -> pending_approval (regardless of who updated)
  // - only the approval action moves it to completed
  let newStatus = String(task.status || 'new');
  if (!['completed','cancelled'].includes(newStatus)) {
    const target = Number(task.target_value || 0);
    if (target > 0 && done_value >= target) newStatus = 'pending_approval';
    else if (done_value > 0) newStatus = 'in_progress';
    else newStatus = 'new';
  }

  db.prepare('UPDATE tasks SET done_value=?, status=?, updated_at=? WHERE id=?')
    .run(done_value, newStatus, now, task.id);

  res.redirect(`/tasks/${task.id}?ok=1`);
});



// --------- Stage progress update (for stage-based tasks) ---------
app.post('/stages/:id/update', requireAuth, (req, res) => {
  const me = res.locals.me;
  const stageId = Number(req.params.id);
  const stage = db.prepare('SELECT * FROM task_stages WHERE id=?').get(stageId);
  if (!stage) return res.status(404).send('غير موجود');

  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(stage.task_id);
  if (!task) return res.status(404).send('غير موجود');

  // Permission:
  // - Admin: allowed
  // - Supervisor: only if supervisor owns the task
  // - Employee: only if assigned to stage
  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');
  if (me.role === 'employee' && stage.assigned_to !== me.id) return res.status(403).send('غير مصرح');

  let progress = req.body.done === '1' ? 100 : Number(req.body.progress ?? stage.progress ?? 0);
  if (progress != progress) progress = 0
  progress = max0min100(progress)

  const note = String(req.body.note || '').trim();
  const now = new Date().toISOString();

  const newStatus = progress >= 100 ? 'completed' : (progress > 0 ? 'in_progress' : 'new');

  db.prepare('UPDATE task_stages SET progress=?, status=?, updated_at=? WHERE id=?')
    .run(progress, newStatus, now, stageId);

  db.prepare('INSERT INTO stage_updates (stage_id, progress, note, updated_by, created_at) VALUES (?,?,?,?,?)')
    .run(stageId, progress, note || null, me.id, now);

  // Recalculate parent task based on stages
  // Always move the parent to "pending_approval" when all stages reach 100%.
  // Approval is a separate step handled by the supervisor/manager.
  recalcTaskFromStages(task.id, { completeIfSupervisor: false });

  const back = req.get('referer') || `/tasks/${task.id}`;
  res.redirect(back);
});

// --------- Stage metadata management (name / assignment / sort order) ---------
app.put('/stages/:id/meta', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const stageId = Number(req.params.id);
  const stage = db.prepare('SELECT * FROM task_stages WHERE id=?').get(stageId);
  if (!stage) return res.status(404).send('غير موجود');

  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(stage.task_id);
  if (!task) return res.status(404).send('غير موجود');
  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  const stage_name = String(req.body.stage_name || '').trim();
  const assigned_to = req.body.assigned_to ? Number(req.body.assigned_to) : null;
  const sort_order = req.body.sort_order ? Number(req.body.sort_order) : stage.sort_order;

  if (!stage_name) return res.redirect(`/tasks/${task.id}/edit`);

  const now = new Date().toISOString();
  db.prepare('UPDATE task_stages SET stage_name=?, assigned_to=?, sort_order=?, updated_at=? WHERE id=?')
    .run(stage_name, assigned_to, sort_order, now, stageId);

  // Email notifications + in-app notifications: stage assigned
  try {
    const oldAssignee = stage.assigned_to ? Number(stage.assigned_to) : null;
    const newAssignee = assigned_to ? Number(assigned_to) : null;
    if (newAssignee && newAssignee !== oldAssignee) {
      sendStageAssignedEmailAndNotify(req, { taskId: task.id, stageName: stage_name, userId: newAssignee });
    }
  } catch (e) {}

  recalcTaskFromStages(task.id);
  res.redirect(`/tasks/${task.id}/edit?ok=1`);
});

app.post('/stages/:id/cancel', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const stageId = Number(req.params.id);
  const stage = db.prepare('SELECT * FROM task_stages WHERE id=?').get(stageId);
  if (!stage) return res.status(404).send('غير موجود');

  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(stage.task_id);
  if (!task) return res.status(404).send('غير موجود');
  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  const now = new Date().toISOString();
  db.prepare("UPDATE task_stages SET status='cancelled', updated_at=? WHERE id=?")
    .run(now, stageId);

  // Email notifications: stage assigned
  try {
    const oldAssignee = stage.assigned_to ? Number(stage.assigned_to) : null;
    const newAssignee = assigned_to ? Number(assigned_to) : null;
    if (newAssignee && newAssignee !== oldAssignee) {
      const settings = getSettings();
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const taskLink = `${baseUrl}/tasks/${task.id}`;
      const user = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(newAssignee);
      if (user && user.email) {
        const subject = `تم إسناد مرحلة لك ضمن مهمة: ${task.title}`;
        const html = `
          <div style="font-family:Tahoma,Arial;direction:rtl;text-align:right">
            <h3 style="margin:0 0 8px 0">تم إسناد مرحلة لك</h3>
            <div><b>المهمة:</b> ${task.title}</div>
            <div><b>المرحلة:</b> ${stage_name}</div>
            <div style="margin-top:10px"><a href="${taskLink}">فتح المهمة</a></div>
          </div>
        `;
        sendMail(settings, { to: user.email, subject, html }).catch(() => {});
      }
    }
  } catch (e) {}

  recalcTaskFromStages(task.id);
  res.redirect(`/tasks/${task.id}/edit?ok=1`);
});

app.post('/tasks/:id/stages/add', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const taskId = Number(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId);
  if (!task) return res.status(404).send('غير موجود');
  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  const stage_key = String(req.body.stage_key || '').trim();
  const custom_name = String(req.body.custom_stage_name || '').trim();
  const assigned_to = req.body.assigned_to ? Number(req.body.assigned_to) : null;

  let stage_name = custom_name;
  if (!stage_name && stage_key) {
    stage_name = stageNameFromKey(stage_key);
  }
  if (!stage_name) return res.redirect(`/tasks/${taskId}/edit`);

  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM task_stages WHERE task_id=?').get(taskId).m || 0;
  const sort_order = Number(maxSort) + 1;
  const now = new Date().toISOString();

  // If task was simple, convert to stages mode
  if (String(task.progress_mode || 'simple') !== 'stages') {
    db.prepare("UPDATE tasks SET progress_mode='stages', target_value=100, done_value=0, status='new', updated_at=? WHERE id=?")
      .run(now, taskId);
  }

  db.prepare(`
    INSERT INTO task_stages (task_id, stage_key, stage_name, assigned_to, weight, progress, status, sort_order, created_at, updated_at)
    VALUES (?,?,?,?,0,0,'new',?,?,?)
  `).run(taskId, stage_key || null, stage_name, assigned_to, sort_order, now, now);

  recalcTaskFromStages(taskId);
  // Notify stage assignee (if provided)
  if (assigned_to) {
    sendStageAssignedEmailAndNotify(req, { taskId, stageName: stage_name, userId: assigned_to });
  }

  res.redirect(`/tasks/${taskId}/edit?ok=1`);
});

// Soft-cancel a task (keeps history)
app.post('/tasks/:id/cancel', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  // Legacy endpoint used by "حذف المهمة" button in edit page.
  // Hard-delete the task so it disappears entirely for everyone.
  const me = res.locals.me;
  const id = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  if (!task) return res.status(404).send('غير موجود');

  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  hardDeleteTask(id);
  res.redirect('/tasks?deleted=1');
});

// Attachments
app.post('/tasks/:id/attach', requireAuth, upload.single('file'), (req, res) => {
  const me = res.locals.me;
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).send('غير موجود');
  if (String(task.status || '') === 'cancelled') return res.status(404).send('غير موجود');

  if (me.role === 'employee' && !isTaskVisibleToEmployee(task.id, me.id)) return res.status(403).send('غير مصرح');
  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  if (!req.file) return res.redirect(`/tasks/${task.id}`);

  const mt = String(req.file.mimetype || '');
  const okType = mt.startsWith('image/') || mt === 'application/pdf';
  if (!okType) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename));
    } catch (e) {}
    return res.redirect(`/tasks/${task.id}?err=filetype`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO attachments (task_id, stored_filename, original_name, mime_type, size_bytes, uploaded_by, uploaded_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(task.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, me.id, now);

  res.redirect(`/tasks/${task.id}?ok=1`);
});

// Supervisor approval
app.post('/tasks/:id/approve', requireAuth, requireApprovePermission, (req, res) => {
  const me = res.locals.me;
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).send('غير موجود');

    if (String(task.status || '') === 'cancelled') return res.status(404).send('غير موجود');

  if (me.role === 'supervisor' && task.supervisor_id !== me.id) return res.status(403).send('غير مصرح');

  const decision = req.body.decision;
  const comment = (req.body.comment || '').trim();
  if (!['approved','rejected'].includes(decision)) return res.status(400).send('قرار غير صحيح');

  const now = new Date().toISOString();
  db.prepare('INSERT INTO approvals (task_id, decision, comment, approved_by, approved_at) VALUES (?,?,?,?,?)')
    .run(task.id, decision, comment || null, me.id, now);

  let newStatus = task.status;
  if (decision === 'approved') {
    const target = Number(task.target_value || 0);
    const done = Number(task.done_value || 0);
    newStatus = target > 0 && done >= target ? 'completed' : 'in_progress';
  } else {
    newStatus = 'in_progress';
  }

  db.prepare('UPDATE tasks SET status=?, updated_at=? WHERE id=?').run(newStatus, now, task.id);
  res.redirect(`/tasks/${task.id}?ok=1`);
});

// --------- Reports (Print/PDF via browser print) ---------
app.get('/reports', requireAuth, (req, res) => {
  const me = res.locals.me;
  const events = db.prepare('SELECT id, title FROM events ORDER BY datetime(created_at) DESC').all();
  const employees = db.prepare("SELECT id, display_name FROM users WHERE role='employee' AND is_active=1 ORDER BY display_name").all();
  const supervisors = db.prepare("SELECT id, display_name FROM users WHERE role IN ('admin','supervisor') AND is_active=1 ORDER BY display_name").all();
  res.render('reports', { events, employees, supervisors, me });
});

function scopeWhereForReports(me) {
  let where = '1=1';
  const params = [];
  if (me.role === 'employee') {
    where = 't.employee_id=?';
    params.push(me.id);
  } else if (me.role === 'supervisor') {
    where += ' AND t.supervisor_id=?';
    params.push(me.id);
  }
  // Hide cancelled tasks everywhere
  where = `(${where}) AND (t.status IS NULL OR t.status <> 'cancelled')`;
  return { where, params };
}

function isIntString(v) {
  const s = String(v || '').trim();
  if (!s) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function scopeWhereForAssets(me) {
  if (!me) return { where: '1=0', params: [] };
  if (me.role === 'admin') return { where: '1=1', params: [] };

  const accessibleEventIds = getAccessibleEventIds(me);
  const supOwnedEventIds = (me.role === 'supervisor') ? getSupervisorOwnedEventIds(me) : [];

  const scopeParts = [];
  const params = [];
  scopeParts.push("a.visibility='public'");
  scopeParts.push('a.created_by=?');
  params.push(me.id);

  if (accessibleEventIds.length) {
    const ph = accessibleEventIds.map(() => '?').join(',');
    scopeParts.push(`(a.visibility='team' AND a.event_id IN (${ph}))`);
    params.push(...accessibleEventIds);
  }

  if (me.role === 'supervisor' && supOwnedEventIds.length) {
    const ph2 = supOwnedEventIds.map(() => '?').join(',');
    scopeParts.push(`(a.visibility='private' AND a.event_id IN (${ph2}))`);
    params.push(...supOwnedEventIds);
  }

  return { where: `(${scopeParts.join(' OR ')})`, params };
}

function splitTagsLoose(v) {
  const s = String(v || '').trim();
  if (!s) return [];
  // Normalize Arabic comma to English comma
  const norm = s.split('،').join(',');
  return norm.split(',').map(x => String(x || '').trim()).filter(Boolean);
}

function buildAssetReportStats(rows) {
  const typeCounts = { video: 0, photo: 0, audio: 0, project: 0, doc: 0, other: 0 };
  const visCounts = { public: 0, team: 0, private: 0 };
  let missingDrive = 0;
  let missingEvent = 0;
  const tagMap = new Map();

  for (const r of (rows || [])) {
    const t = String(r.asset_type || 'other');
    if (typeCounts[t] != null) typeCounts[t] += 1;
    else typeCounts.other += 1;

    const v = String(r.visibility || 'team');
    if (visCounts[v] != null) visCounts[v] += 1;
    else visCounts.team += 1;

    if (!r.drive_id) missingDrive += 1;
    if (!r.event_id) missingEvent += 1;

    for (const tag of splitTagsLoose(r.tags)) {
      const k = tag.toLowerCase();
      tagMap.set(k, (tagMap.get(k) || 0) + 1);
    }
  }

  const topTags = [...tagMap.entries()]
    .map(([k, count]) => ({ tag: k, count }))
    .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag))
    .slice(0, 12);

  return {
    total: (rows || []).length,
    typeCounts,
    visCounts,
    missingDrive,
    missingEvent,
    topTags,
  };
}

// --------- Archive Reports ---------
app.get('/reports/archive', requireAuth, (req, res) => {
  const me = res.locals.me;
  const q = String(req.query.q || '').trim();
  const eventId = String(req.query.event || '').trim();
  const driveId = String(req.query.drive || '').trim();
  const type = String(req.query.type || '').trim();
  const vis = String(req.query.vis || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();

  const events = fetchEventsForAssets(me);
  const drives = db.prepare('SELECT * FROM asset_drives ORDER BY name').all();

  const { where: scopeWhere, params: scopeParams } = scopeWhereForAssets(me);
  const whereParts = [scopeWhere];
  const params = [...scopeParams];

  if (q) {
    const like = `%${q}%`;
    whereParts.push(`(
      a.title LIKE ? OR a.description LIKE ? OR a.file_path LIKE ? OR a.file_name LIKE ? OR a.tags LIKE ?
      OR e.title LIKE ? OR d.name LIKE ? OR u.display_name LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }
  if (isIntString(eventId)) {
    whereParts.push('a.event_id=?');
    params.push(Number(eventId));
  }
  if (isIntString(driveId)) {
    whereParts.push('a.drive_id=?');
    params.push(Number(driveId));
  }
  if (type) {
    whereParts.push('a.asset_type=?');
    params.push(type);
  }
  if (vis) {
    whereParts.push('a.visibility=?');
    params.push(vis);
  }
  if (from) {
    whereParts.push('date(a.created_at) >= date(?)');
    params.push(from);
  }
  if (to) {
    whereParts.push('date(a.created_at) <= date(?)');
    params.push(to);
  }

  const where = whereParts.length ? whereParts.join(' AND ') : '1=1';
  const rows = db.prepare(`
    SELECT a.*, e.title AS event_title, d.name AS drive_name, u.display_name AS created_by_name
    FROM assets a
    LEFT JOIN events e ON e.id=a.event_id
    LEFT JOIN asset_drives d ON d.id=a.drive_id
    LEFT JOIN users u ON u.id=a.created_by
    WHERE ${where}
    ORDER BY datetime(a.created_at) DESC
    LIMIT 1500
  `).all(...params);

  const stats = buildAssetReportStats(rows);
  const title = 'تقرير الأرشيف';
  const meta = {
    line1: `عدد الأصول: ${stats.total}`,
    line2: `الفترة: ${from || '—'} إلى ${to || '—'}`,
  };

  res.render('report_archive', {
    title,
    meta,
    rows,
    stats,
    q,
    filters: { eventId, driveId, type, vis, from, to },
    events,
    drives,
    assetTypeLabelAr,
    assetVisLabelAr,
  });
});

app.get('/reports/archive.xlsx', requireAuth, (req, res) => {
  const me = res.locals.me;
  const q = String(req.query.q || '').trim();
  const eventId = String(req.query.event || '').trim();
  const driveId = String(req.query.drive || '').trim();
  const type = String(req.query.type || '').trim();
  const vis = String(req.query.vis || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();

  const { where: scopeWhere, params: scopeParams } = scopeWhereForAssets(me);
  const whereParts = [scopeWhere];
  const params = [...scopeParams];

  if (q) {
    const like = `%${q}%`;
    whereParts.push(`(
      a.title LIKE ? OR a.description LIKE ? OR a.file_path LIKE ? OR a.file_name LIKE ? OR a.tags LIKE ?
      OR e.title LIKE ? OR d.name LIKE ? OR u.display_name LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }
  if (isIntString(eventId)) {
    whereParts.push('a.event_id=?');
    params.push(Number(eventId));
  }
  if (isIntString(driveId)) {
    whereParts.push('a.drive_id=?');
    params.push(Number(driveId));
  }
  if (type) {
    whereParts.push('a.asset_type=?');
    params.push(type);
  }
  if (vis) {
    whereParts.push('a.visibility=?');
    params.push(vis);
  }
  if (from) {
    whereParts.push('date(a.created_at) >= date(?)');
    params.push(from);
  }
  if (to) {
    whereParts.push('date(a.created_at) <= date(?)');
    params.push(to);
  }

  const where = whereParts.length ? whereParts.join(' AND ') : '1=1';
  const rows = db.prepare(`
    SELECT a.*, e.title AS event_title, d.name AS drive_name, u.display_name AS created_by_name
    FROM assets a
    LEFT JOIN events e ON e.id=a.event_id
    LEFT JOIN asset_drives d ON d.id=a.drive_id
    LEFT JOIN users u ON u.id=a.created_by
    WHERE ${where}
    ORDER BY datetime(a.created_at) DESC
    LIMIT 5000
  `).all(...params);

  const title = 'تقرير الأرشيف';
  return sendArchiveExcelReport(res, title, rows);
});

app.get('/reports/archive/drives', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const rows = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(1) FROM assets a WHERE a.drive_id=d.id) AS asset_count,
      (SELECT COUNT(DISTINCT a.event_id) FROM assets a WHERE a.drive_id=d.id AND a.event_id IS NOT NULL) AS event_count
    FROM asset_drives d
    ORDER BY d.name
  `).all();

  const title = 'تقرير الهاردسكات';
  const meta = {
    line1: `عدد الهاردسكات: ${rows.length}`,
    line2: `تاريخ التقرير: ${dayjs().format('YYYY-MM-DD')}`,
  };
  res.render('report_archive_drives', { title, meta, rows });
});

app.get('/reports/archive/drives.xlsx', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const rows = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(1) FROM assets a WHERE a.drive_id=d.id) AS asset_count,
      (SELECT COUNT(DISTINCT a.event_id) FROM assets a WHERE a.drive_id=d.id AND a.event_id IS NOT NULL) AS event_count
    FROM asset_drives d
    ORDER BY d.name
  `).all();
  return sendArchiveDrivesExcelReport(res, 'تقرير الهاردسكات', rows);
});

app.get('/reports/archive/gaps', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const { where: scopeWhere, params: scopeParams } = scopeWhereForAssets(me);
  const where = `${scopeWhere} AND (
    a.event_id IS NULL OR a.drive_id IS NULL OR a.tags IS NULL OR trim(a.tags)='' OR a.file_name IS NULL OR trim(a.file_name)=''
  )`;
  const rows0 = db.prepare(`
    SELECT a.*, e.title AS event_title, d.name AS drive_name, u.display_name AS created_by_name
    FROM assets a
    LEFT JOIN events e ON e.id=a.event_id
    LEFT JOIN asset_drives d ON d.id=a.drive_id
    LEFT JOIN users u ON u.id=a.created_by
    WHERE ${where}
    ORDER BY datetime(a.created_at) DESC
    LIMIT 1500
  `).all(...scopeParams);

  const rows = rows0.map(r => {
    const gaps = [];
    if (!r.event_id) gaps.push('بدون مناسبة');
    if (!r.drive_id) gaps.push('بدون هارد');
    if (!String(r.tags || '').trim()) gaps.push('بدون وسوم');
    if (!String(r.file_name || '').trim()) gaps.push('بدون اسم ملف');
    return { ...r, gap: gaps.join(' + ') };
  });

  const title = 'تقرير نواقص الأرشفة';
  const meta = {
    line1: `عدد السجلات: ${rows.length}`,
    line2: `تاريخ التقرير: ${dayjs().format('YYYY-MM-DD')}`,
  };
  res.render('report_archive_gaps', { title, meta, rows });
});

app.get('/reports/archive/gaps.xlsx', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me;
  const { where: scopeWhere, params: scopeParams } = scopeWhereForAssets(me);
  const where = `${scopeWhere} AND (
    a.event_id IS NULL OR a.drive_id IS NULL OR a.tags IS NULL OR trim(a.tags)='' OR a.file_name IS NULL OR trim(a.file_name)=''
  )`;
  const rows0 = db.prepare(`
    SELECT a.*, e.title AS event_title, d.name AS drive_name, u.display_name AS created_by_name
    FROM assets a
    LEFT JOIN events e ON e.id=a.event_id
    LEFT JOIN asset_drives d ON d.id=a.drive_id
    LEFT JOIN users u ON u.id=a.created_by
    WHERE ${where}
    ORDER BY datetime(a.created_at) DESC
    LIMIT 5000
  `).all(...scopeParams);
  const rows = rows0.map(r => {
    const gaps = [];
    if (!r.event_id) gaps.push('بدون مناسبة');
    if (!r.drive_id) gaps.push('بدون هارد');
    if (!String(r.tags || '').trim()) gaps.push('بدون وسوم');
    if (!String(r.file_name || '').trim()) gaps.push('بدون اسم ملف');
    return { ...r, gap: gaps.join(' + ') };
  });
  return sendArchiveGapsExcelReport(res, 'تقرير نواقص الأرشفة', rows);
});
app.get('/reports/general', requireAuth, async (req, res) => {
  const me = res.locals.me;
  const from = req.query.from || '';
  const to = req.query.to || '';

  const { where, params } = scopeWhereForReports(me);
  let dateFilter = '';
  const dateParams = [];
  if (from) {
    dateFilter += ' AND date(t.created_at) >= date(?)';
    dateParams.push(from);
  }
  if (to) {
    dateFilter += ' AND date(t.created_at) <= date(?)';
    dateParams.push(to);
  }

  const tasks = db.prepare(`
    SELECT t.*, e.title AS event_title,
      u1.display_name AS employee_name,
      u2.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u1 ON u1.id=t.employee_id
    LEFT JOIN users u2 ON u2.id=t.supervisor_id
    WHERE ${where} ${dateFilter}
    ORDER BY datetime(t.updated_at) DESC
  `).all(...params, ...dateParams);

  const rows = tasks.map(t => ({
    ...t,
    status: computeTaskStatus(t),
    progress: calcProgress(t.done_value, t.target_value),
  }));

  const title = 'تقرير عام للمهام';
  const meta = await buildReportMeta(req, title, rows);
  const stats = calcReportStats(rows);
  const top = buildTop(rows, 'employee_name');

  res.render('report_general', { rows, from, to, title, meta, stats, top, topTitle: 'أعلى الموظفين إنجازًا' });
});


app.get('/reports/general.xlsx', requireAuth, async (req, res) => {
  const me = res.locals.me;
  const from = req.query.from || '';
  const to = req.query.to || '';

  const { where, params } = scopeWhereForReports(me);
  let dateFilter = '';
  const dateParams = [];
  if (from) {
    dateFilter += ' AND date(t.created_at) >= date(?)';
    dateParams.push(from);
  }
  if (to) {
    dateFilter += ' AND date(t.created_at) <= date(?)';
    dateParams.push(to);
  }

  const tasks = db.prepare(`
    SELECT t.*, e.title AS event_title,
      u1.display_name AS employee_name,
      u2.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u1 ON u1.id=t.employee_id
    LEFT JOIN users u2 ON u2.id=t.supervisor_id
    WHERE ${where} ${dateFilter}
    ORDER BY datetime(t.updated_at) DESC
  `).all(...params, ...dateParams);

  const rows = tasks.map(t => ({
    ...t,
    status: computeTaskStatus(t),
    progress: calcProgress(t.done_value, t.target_value),
  }));

  const title = 'تقرير عام للمهام';
  await sendExcelReport(res, title, rows);
});

// مهم: في Express 5 (path-to-regexp v6) لم يعد نمط ":id(\\d+)" مدعومًا داخل المسار.
// لحل تعارض "/reports/event/5.xlsx" مع "/reports/event/:id" نخلي مسار .xlsx يسبق مسار العرض.
app.get('/reports/event/:id.xlsx', requireAuth, async (req, res) => {
  const me = res.locals.me;
  // Defensive: some setups may include ".xlsx" in the param
  const eventId = String(req.params.id || '').replace(/\.xlsx$/i, '');
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eventId);
  if (!event) return res.status(404).send('غير موجود');

  const tasks = db.prepare(`
    SELECT t.*, u1.display_name AS employee_name, u2.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN users u1 ON u1.id=t.employee_id
    LEFT JOIN users u2 ON u2.id=t.supervisor_id
    WHERE t.event_id=?
    ORDER BY datetime(t.updated_at) DESC
  `).all(eventId);

  let rows = tasks.map(t => ({ ...t, status: computeTaskStatus(t), progress: calcProgress(t.done_value, t.target_value) }));

  if (me.role === 'employee') rows = rows.filter(t => t.employee_id === me.id);
  else if (me.role === 'supervisor') rows = rows.filter(t => t.supervisor_id === me.id);

  const title = `تقرير مناسبة: ${event.title || ''}`;
  await sendExcelReport(res, title, rows);
});

app.get('/reports/event/:id', requireAuth, async (req, res) => {
  const me = res.locals.me;
  const eventId = String(req.params.id || '').trim();

  // Accept only numeric ids (avoid accidental matches)
  if (!/^\d+$/.test(eventId)) return res.status(404).send('غير موجود');

  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eventId);
  if (!event) return res.status(404).send('غير موجود');

  const tasks = db.prepare(`
    SELECT t.*, u1.display_name AS employee_name, u2.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN users u1 ON u1.id=t.employee_id
    LEFT JOIN users u2 ON u2.id=t.supervisor_id
    WHERE t.event_id=?
    ORDER BY datetime(t.updated_at) DESC
  `).all(eventId);

  let rows = tasks.map(t => ({ ...t, status: computeTaskStatus(t), progress: calcProgress(t.done_value, t.target_value) }));

  // Scope check
  if (me.role === 'employee') {
    rows = rows.filter(t => t.employee_id === me.id);
  } else if (me.role === 'supervisor') {
    rows = rows.filter(t => t.supervisor_id === me.id);
  }

  const title = `تقرير مناسبة: ${event.title || ''}`;
  const meta = await buildReportMeta(req, title, rows);
  const stats = calcReportStats(rows);
  const top = buildTop(rows, 'employee_name');

  res.render('report_event', { event, rows, meta, stats, top, topTitle: 'أعلى الموظفين إنجازًا' });
});

// نفس الفكرة: مسار .xlsx أولاً ثم مسار العرض.
app.get('/reports/employee/:id.xlsx', requireAuth, async (req, res) => {
  const me = res.locals.me;
  const empId = String(req.params.id || '').replace(/\.xlsx$/i, '');
  const employee = db.prepare("SELECT id, display_name FROM users WHERE id=? AND role='employee'").get(empId);
  if (!employee) return res.status(404).send('غير موجود');

  if (me.role === 'employee' && me.id !== employee.id) return res.status(403).send('غير مصرح');

  const tasks = db.prepare(`
    SELECT t.*, e.title AS event_title, u2.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u2 ON u2.id=t.supervisor_id
    WHERE t.employee_id=?
    ORDER BY datetime(t.updated_at) DESC
  `).all(employee.id);

  const rows = tasks.map(t => ({ ...t, status: computeTaskStatus(t), progress: calcProgress(t.done_value, t.target_value) }));

  const title = `تقرير موظف: ${employee.display_name || ''}`;
  await sendExcelReport(res, title, rows);
});

app.get('/reports/employee/:id', requireAuth, async (req, res) => {
  const me = res.locals.me;
  const empId = String(req.params.id || '').trim();
  if (!/^\d+$/.test(empId)) return res.status(404).send('غير موجود');

  const employee = db.prepare("SELECT id, display_name FROM users WHERE id=? AND role='employee'").get(empId);
  if (!employee) return res.status(404).send('غير موجود');

  if (me.role === 'employee' && me.id !== employee.id) return res.status(403).send('غير مصرح');

  const tasks = db.prepare(`
    SELECT t.*, e.title AS event_title, u2.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u2 ON u2.id=t.supervisor_id
    WHERE t.employee_id=?
    ORDER BY datetime(t.updated_at) DESC
  `).all(employee.id);

  const rows = tasks.map(t => ({ ...t, status: computeTaskStatus(t), progress: calcProgress(t.done_value, t.target_value) }));

  const title = `تقرير موظف: ${employee.display_name || ''}`;
  const meta = await buildReportMeta(req, title, rows);
  const stats = calcReportStats(rows);
  const top = buildTop(rows, 'event_title');

  res.render('report_employee', { employee, rows, meta, stats, top, topTitle: 'أعلى المناسبات إنجازًا' });
});

app.get('/reports/supervisor/:id.xlsx', requireAuth, async (req, res) => {
  const me = res.locals.me;
  const supId = String(req.params.id || '').replace(/\.xlsx$/i, '');
  const supervisor = db.prepare("SELECT id, display_name FROM users WHERE id=? AND role IN ('admin','supervisor')").get(supId);
  if (!supervisor) return res.status(404).send('غير موجود');

  if (me.role === 'supervisor' && me.id !== supervisor.id) return res.status(403).send('غير مصرح');

  const tasks = db.prepare(`
    SELECT t.*, e.title AS event_title, u1.display_name AS employee_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u1 ON u1.id=t.employee_id
    WHERE t.supervisor_id=?
    ORDER BY datetime(t.updated_at) DESC
  `).all(supervisor.id);

  const rows = tasks.map(t => ({ ...t, status: computeTaskStatus(t), progress: calcProgress(t.done_value, t.target_value) }));

  const title = `تقرير مشرف: ${supervisor.display_name || ''}`;
  await sendExcelReport(res, title, rows);
});

app.get('/reports/supervisor/:id', requireAuth, async (req, res) => {
  const me = res.locals.me;
  const supId = String(req.params.id || '').trim();
  if (!/^\d+$/.test(supId)) return res.status(404).send('غير موجود');

  const supervisor = db.prepare("SELECT id, display_name FROM users WHERE id=? AND role IN ('admin','supervisor')").get(supId);
  if (!supervisor) return res.status(404).send('غير موجود');

  if (me.role === 'supervisor' && me.id !== supervisor.id) return res.status(403).send('غير مصرح');

  const tasks = db.prepare(`
    SELECT t.*, e.title AS event_title, u1.display_name AS employee_name
    FROM tasks t
    LEFT JOIN events e ON e.id=t.event_id
    LEFT JOIN users u1 ON u1.id=t.employee_id
    WHERE t.supervisor_id=?
    ORDER BY datetime(t.updated_at) DESC
  `).all(supervisor.id);

  const rows = tasks.map(t => ({ ...t, status: computeTaskStatus(t), progress: calcProgress(t.done_value, t.target_value) }));

  const title = `تقرير مشرف: ${supervisor.display_name || ''}`;
  const meta = await buildReportMeta(req, title, rows);
  const stats = calcReportStats(rows);
  const top = buildTop(rows, 'employee_name');

  res.render('report_supervisor', { supervisor, rows, meta, stats, top, topTitle: 'أعلى الموظفين إنجازًا' });
});

// --------- Kiosk ---------
app.get('/kiosk', requireAuth, (req, res) => {
  const s = getSettings();
  const themeKey = (s.kiosk_color_scheme && KIOSK_THEME_KEYS.has(String(s.kiosk_color_scheme))) ? String(s.kiosk_color_scheme) : KIOSK_THEME_DEFAULT;

  const view = String(req.query.view || req.query.mode || '').trim();
  const viewMode = (['tasks','days','both'].includes(view)) ? view : 'both';
  const kioskSettings = {
    display_mode: s.kiosk_display_mode || 'both',
    chart_variant: s.kiosk_chart_variant || 'ring',
    interval_sec: Number(s.kiosk_interval_sec || 5),
    show_event: Number(s.kiosk_show_event ?? 1),
    show_due: Number(s.kiosk_show_due ?? 1),
    show_status: Number(s.kiosk_show_status ?? 1),
    chart_size: s.kiosk_chart_size || 'xl',
    color_scheme: themeKey,
    scheme_class: 'kioskTheme-' + themeKey,
    available_themes: [
      'dark_moe_01',
      'dark_moe_02',
      'dark_moe_03',
      'dark_moe_04',
      'dark_moe_05',
      'dark_moe_06',
      'dark_moe_07',
      'dark_moe_08',
      'dark_moe_09',
      'dark_moe_10',
      'dark_moe_11',
      'dark_moe_12',
      'dark_moe_13',
      'dark_moe_14',
      'dark_moe_15',
      'dark_moe_16',
      'dark_moe_17',
      'dark_moe_18',
      'dark_moe_19',
      'dark_moe_20',
      'dark_moe_21',
      'dark_moe_22',
      'dark_moe_23',
      'dark_moe_24',
      'dark_moe_25',
      'light_moe_01',
      'light_moe_02',
      'light_moe_03',
      'light_moe_04',
      'light_moe_05',
      'light_moe_06',
      'light_moe_07',
      'light_moe_08',
      'light_moe_09',
      'light_moe_10',
      'light_moe_11',
      'light_moe_12',
      'light_moe_13',
      'light_moe_14',
      'light_moe_15',
      'light_moe_16',
      'light_moe_17',
      'light_moe_18',
      'light_moe_19',
      'light_moe_20',
      'light_moe_21',
      'light_moe_22',
      'light_moe_23',
      'light_moe_24',
      'light_moe_25',
    ],
    theme_auto_cycle: Number(s.kiosk_theme_auto_cycle ?? 0),
    transition: s.kiosk_transition || 'fade',
    other_interval_sec: Number(s.kiosk_other_interval_sec || 10),
    task_order: s.kiosk_task_order || 'due',
    pages_default: s.kiosk_pages_default || 'home,tasks,days,calendar',
    logo_filename: s.logo_filename || '',

    // Welcome screen
    welcome_enabled: Number(s.kiosk_welcome_enabled ?? 1),
    welcome_text: s.kiosk_welcome_text || '',
    org_name: s.org_name || '',

    ticker_mode: s.kiosk_ticker_mode || 'manual',
    ticker_rss_urls: s.kiosk_ticker_rss_urls || '',
    ticker_speed: (function(){
      let v = Number(s.kiosk_ticker_speed || 60);
      // Backward compatibility: older builds stored ticker speed as a multiplier (≈0.3–3)
      if (v > 0 && v <= 3.5) v = Math.round(60 / v);
      v = Math.max(5, Math.min(300, v));
      return v;
    })(),
      ticker_font_size: Number(s.kiosk_ticker_font_size || 18),
    ticker_refresh_min: Number(s.kiosk_ticker_refresh_min || 15),
    ticker_max_items: Number(s.kiosk_ticker_max_items || 20),

    weather_enabled: Number((s.kiosk_weather_enabled ?? 1)),
    weather_city: s.kiosk_weather_city || 'Riyadh',

    calendar_days_ahead: Number(s.kiosk_calendar_days_ahead || 60),
    calendar_max_items: Number(s.kiosk_calendar_max_items || 12),
    view_mode: viewMode,
    pages_default: String(s.kiosk_pages_default || 'home,tasks,days,calendar'),
  };
  res.render('kiosk', { kioskSettings });
});



app.get('/api/kiosk/tasks', requireAuth, (req, res) => {
  try {
    const me = res.locals.me || req.user;
    const settings = getSettings();
    const filter = String(req.query.filter || '').trim();

    let where = '1=1';
    const params = [];

    // Role-based visibility
    if (me && me.role === 'employee') {
      where += ' AND t.employee_id = ?';
      params.push(me.id);
    } else if (me && me.role === 'supervisor') {
      where += ' AND t.supervisor_id = ?';
      params.push(me.id);
    }

    // Hide cancelled by default
    where += " AND (t.status IS NULL OR t.status <> 'cancelled')";


    // Kiosk visibility flag (default ON)
    where += " AND (t.kiosk_visible IS NULL OR t.kiosk_visible=1)";
    // Optional kiosk filter
    if (filter === 'overdue') {
      where += " AND (t.status IS NULL OR t.status <> 'completed')";
      where += " AND date(coalesce(t.due_date, t.start_date, t.created_at)) < date('now')";
    }

    // Optional date range from settings (applies to due_date, fallback start_date)
    const dFrom = String(settings.kiosk_date_from || '').trim();
    const dTo = String(settings.kiosk_date_to || '').trim();
    if (dFrom) {
      where += ' AND date(coalesce(t.due_date, t.start_date, t.created_at)) >= date(?)';
      params.push(dFrom);
    }
    if (dTo) {
      where += ' AND date(coalesce(t.due_date, t.start_date, t.created_at)) <= date(?)';
      params.push(dTo);
    }

    // Ordering
    const order = String(settings.kiosk_task_order || 'due');
    let orderSql = "datetime(t.updated_at) DESC";
    if (order === 'due') {
      orderSql = "CASE WHEN t.due_date IS NULL OR t.due_date='' THEN 1 ELSE 0 END, date(t.due_date) ASC, datetime(t.updated_at) DESC";
    } else if (order === 'priority') {
      orderSql = "CASE WHEN t.priority IS NULL THEN 1 ELSE 0 END, t.priority DESC, CASE WHEN t.due_date IS NULL OR t.due_date='' THEN 1 ELSE 0 END, date(t.due_date) ASC, datetime(t.updated_at) DESC";
    } else if (order === 'updated') {
      orderSql = "datetime(t.updated_at) DESC";
    }

    const tasks = db.prepare(`
      SELECT
        t.*,
        e.title AS event_title,
        uemp.display_name AS employee_name,
        usup.display_name AS supervisor_name
      FROM tasks t
      LEFT JOIN events e ON e.id = t.event_id
      LEFT JOIN users uemp ON uemp.id = t.employee_id
      LEFT JOIN users usup ON usup.id = t.supervisor_id
      WHERE ${where}
      ORDER BY ${orderSql}
      LIMIT 200
    `).all(...params);

    const rows = tasks.map(t => ({
      ...t,
      status: computeTaskStatus(t),
      progress: calcProgress(t.done_value, t.target_value)
    }));

    res.json({ ok: true, items: rows, ts: Date.now() });
  } catch (e) {
    res.json({ ok: false, error: 'failed' });
  }
});

app.get('/api/kiosk/world-days', requireAuth, (req, res) => {
  try {
    const today = dayjs().startOf('day');
    const todayStr = today.format('YYYY-MM-DD');
    const limitStr = today.add(30, 'day').format('YYYY-MM-DD');

    const next = db.prepare(`
      SELECT id, title, effective_day_date AS day_date, category
      FROM (
        SELECT wd.id, wd.title, wd.category,
          CASE
            WHEN wd.recurrence='annual' AND wd.month_day IS NOT NULL AND length(wd.month_day)=5 THEN
              CASE WHEN date(strftime('%Y','now') || '-' || wd.month_day) < date('now')
                   THEN date(strftime('%Y','now') || '-' || wd.month_day, '+1 year')
                   ELSE date(strftime('%Y','now') || '-' || wd.month_day)
              END
            ELSE date(wd.day_date)
          END AS effective_day_date,
          wd.is_active
        FROM world_days wd
        WHERE wd.is_active=1
      ) x
      WHERE date(x.effective_day_date) >= date(?)
      ORDER BY date(x.effective_day_date) ASC
      LIMIT 1
    `).get(todayStr);

    const within30 = db.prepare(`
      SELECT id, title, effective_day_date AS day_date, category
      FROM (
        SELECT wd.id, wd.title, wd.category,
          CASE
            WHEN wd.recurrence='annual' AND wd.month_day IS NOT NULL AND length(wd.month_day)=5 THEN
              CASE WHEN date(strftime('%Y','now') || '-' || wd.month_day) < date('now')
                   THEN date(strftime('%Y','now') || '-' || wd.month_day, '+1 year')
                   ELSE date(strftime('%Y','now') || '-' || wd.month_day)
              END
            ELSE date(wd.day_date)
          END AS effective_day_date,
          wd.is_active
        FROM world_days wd
        WHERE wd.is_active=1
      ) x
      WHERE date(x.effective_day_date) BETWEEN date(?) AND date(?)
      ORDER BY date(x.effective_day_date) ASC
    `).all(todayStr, limitStr);

    res.json({ ok: true, today: todayStr, limit: limitStr, next: next || null, within30, ts: Date.now() });
  } catch (e) {
    res.json({ ok: false, error: 'failed' });
  }
});

// --------- Kiosk: HUD / Ticker / Calendar APIs ---------
let _weatherCache = { ts: 0, data: null };

function _stripTags(s){
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function _decodeCdata(s){
  return String(s || '').replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function _normalizeDigitsToLatin(s){
  return String(s || '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function _parseRssTitles(xml){
  const text = String(xml || '');
  const out = [];
  const itemTitles = text.match(/<item[\s\S]*?<\/item>/gi) || [];
  itemTitles.forEach(it => {
    const m = it.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m && m[1]){
      const t = _stripTags(_decodeCdata(m[1]));
      if (t) out.push(t);
    }
  });
  if (!out.length){
    const entries = text.match(/<entry[\s\S]*?<\/entry>/gi) || [];
    entries.forEach(en => {
      const m = en.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (m && m[1]){
        const t = _stripTags(_decodeCdata(m[1]));
        if (t) out.push(t);
      }
    });
  }
  return out;
}

async function _fetchRssItems(url, refreshMin, maxItems){
  try{
    const now = Date.now();
    const cache = db.prepare(`SELECT url, items_json, fetched_at FROM kiosk_rss_cache WHERE url=?`).get(url);
    if (cache && cache.fetched_at){
      const ageMin = (now - Date.parse(cache.fetched_at)) / 60000;
      if (ageMin >= 0 && ageMin < refreshMin){
        try{
          const items = JSON.parse(cache.items_json || '[]');
          if (Array.isArray(items)) return items.slice(0, maxItems);
        }catch(_){}
      }
    }

    const resp = await fetch(url, { headers: { 'user-agent': 'kpi-kiosk/1.0' } });
    if (!resp.ok) throw new Error('bad');
    const xml = await resp.text();
    const items = _parseRssTitles(xml).slice(0, maxItems);

    db.prepare(`
      INSERT INTO kiosk_rss_cache(url, items_json, fetched_at)
      VALUES(?,?,?)
      ON CONFLICT(url) DO UPDATE SET items_json=excluded.items_json, fetched_at=excluded.fetched_at
    `).run(url, JSON.stringify(items), new Date().toISOString());

    return items;
  }catch(e){
    return [];
  }
}

function _getManualTickerItems(limit){
  try{
    const rows = db.prepare(`
      SELECT item_text FROM kiosk_ticker_items
      WHERE is_active=1
      ORDER BY sort_order ASC, id DESC
      LIMIT ?
    `).all(limit);
    return rows.map(r => String(r.item_text || '').trim()).filter(Boolean);
  }catch(e){
    return [];
  }
}

async function _getTickerItems(settings){
  const mode = String(settings.kiosk_ticker_mode || 'manual');
  const maxItems = Math.max(5, Math.min(100, Number(settings.kiosk_ticker_max_items || 20)));
  const refreshMin = Math.max(1, Math.min(240, Number(settings.kiosk_ticker_refresh_min || 15)));

  const manual = _getManualTickerItems(maxItems);
  let rss = [];
  if (mode === 'rss' || mode === 'mixed'){
    const raw = String(settings.kiosk_ticker_rss_urls || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const urls = raw.filter(u => /^https?:\/\//i.test(u)).slice(0, 6);
    for (const u of urls){
      const items = await _fetchRssItems(u, refreshMin, maxItems);
      rss = rss.concat(items);
      if (rss.length >= maxItems) break;
    }
  }

  const merged = (mode === 'manual') ? manual
               : (mode === 'rss') ? rss
               : manual.concat(rss);

  // de-dupe
  const seen = new Set();
  const uniq = [];
  for (const t of merged){
    const k = t.trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(k);
    if (uniq.length >= maxItems) break;
  }
  return uniq.map(t => ({ title: t }));
}

function _getRandomQuote(){
  try{
    const r = db.prepare(`SELECT quote_text FROM kiosk_quotes WHERE is_active=1 ORDER BY RANDOM() LIMIT 1`).get();
    return r ? String(r.quote_text || '').trim() : '';
  }catch(e){
    return '';
  }
}

async function _getWeatherRiyadh(){
  try{
    const now = Date.now();
    if (_weatherCache.data && (now - _weatherCache.ts) < 10*60*1000) return _weatherCache.data;

    // Riyadh (fixed)
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=24.7136&longitude=46.6753&current=temperature_2m&timezone=Asia%2FRiyadh';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('weather');
    const j = await resp.json();
    const temp = j && j.current && typeof j.current.temperature_2m === 'number' ? j.current.temperature_2m : null;
    const data = (temp == null) ? null : { city: 'الرياض', temp_c: temp };
    _weatherCache = { ts: now, data };
    return data;
  }catch(e){
    return null;
  }
}


let _moeCalendarCache = { ts: 0, key: '', items: [] };

function _decodeHtmlEntities(s){
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function _hijriKeyFromDMY(dmy){
  const m = String(dmy || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!y || !mo || !d) return null;
  return (y * 10000) + (mo * 100) + d;
}

function _todayHijriKey(){
  try{
    const fmt = new Intl.DateTimeFormat('en-SA-u-ca-islamic', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(new Date());
    const day = Number((parts.find(p => p.type === 'day') || {}).value);
    const month = Number((parts.find(p => p.type === 'month') || {}).value);
    const year = Number((parts.find(p => p.type === 'year') || {}).value);
    if (!year || !month || !day) return null;
    return (year * 10000) + (month * 100) + day;
  }catch(e){
    return null;
  }
}


function _parseMoeCalendarHtml(html){
  const out = [];
  const text = _normalizeDigitsToLatin(String(html || ''));
  const re = /<a[^>]*>([^<]+)<\/a>[\s\S]{0,1200}?(\d{2}\/\d{2}\/\d{4})/gi;
  let m;
  while ((m = re.exec(text)) !== null){
    const title = _decodeHtmlEntities(m[1]).replace(/\s+/g, ' ').trim();
    const hijri = m[2];
    if (!title || !hijri) continue;
    out.push({ title, date_hijri: hijri, date_greg: '' });
    if (out.length > 500) break;
  }
  const seen = new Set();
  const uniq = [];
  for (const it of out){
    const k = `${it.title}|${it.date_hijri}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(it);
  }
  return uniq;
}

function _parseAcademicCalendarHtml(html){
  const out = [];
  const text = _normalizeDigitsToLatin(String(html || ''));

  // Prefer table rows if available
  const trs = text.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs){
    const cellsRaw = tr.match(/<(?:td|th)[^>]*>[\s\S]*?<\/(?:td|th)>/gi) || [];
    if (cellsRaw.length < 2) continue;
    const cells = cellsRaw
      .map(x => _stripTags(_decodeHtmlEntities(x)))
      .map(x => String(x || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (cells.length < 2) continue;

    let title = '';
    let hijri = '';
    let greg = '';

    for (const c of cells){
      const m = c.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (m){
        const y = Number(m[3]);
        const mm = String(m[2]).padStart(2,'0');
        const dd = String(m[1]).padStart(2,'0');
        const dmy = `${dd}/${mm}/${y}`;
        if (y >= 1900) greg = greg || dmy;
        else if (y >= 1300 && y < 1900) hijri = hijri || dmy;
      } else {
        if (!title && /[؀-ۿa-zA-Z]/.test(c) && c.length >= 3){
          title = c;
        }
      }
    }

    if (!title) title = cells[0] || '';
    if (!title) continue;
    if (!hijri && !greg) continue;

    out.push({ title, date_hijri: hijri || '', date_greg: greg || '' });
    if (out.length > 800) break;
  }

  // Fallback: loose regex over the page
  if (!out.length){
    const re = /([^<>]{3,120})\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s*(?:[^\d]{0,20})\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/g;
    let m;
    while ((m = re.exec(text)) !== null){
      const title = String(m[1] || '').replace(/\s+/g,' ').trim();
      const d1 = String(m[2] || '').trim();
      const d2 = String(m[3] || '').trim();
      if (!title) continue;
      const y1 = Number((d1.match(/(\d{4})$/) || [])[1]);
      const y2 = Number((d2.match(/(\d{4})$/) || [])[1]);
      let hijri = '';
      let greg = '';
      if (y1 >= 1900) greg = d1; else hijri = d1;
      if (y2 >= 1900) greg = greg || d2; else hijri = hijri || d2;
      out.push({ title, date_hijri: hijri || '', date_greg: greg || '' });
      if (out.length > 800) break;
    }
  }

  // Dedupe
  const seen = new Set();
  const uniq = [];
  for (const it of out){
    const k = `${it.title}|${it.date_hijri}|${it.date_greg}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(it);
  }
  return uniq;
}

async function _fetchMoeCalendarItems(settings){
  const defaultUrl = 'https://www.moe.gov.sa/ar/education/generaleducation/Pages/rss.aspx';
  const url = String(settings.kiosk_calendar_moe_url || defaultUrl).trim();
  const refreshMin = Math.max(5, Math.min(1440, Number(settings.kiosk_calendar_moe_refresh_min || 240)));
  const maxItems = Math.max(5, Math.min(200, Number(settings.kiosk_calendar_max_items || 12)));
  const now = Date.now();

  if (_moeCalendarCache.key === url && _moeCalendarCache.items && _moeCalendarCache.items.length && (now - _moeCalendarCache.ts) < refreshMin * 60 * 1000){
    return _moeCalendarCache.items.slice(0, maxItems);
  }

  function gregKey(dmy){
    const m = String(dmy || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    if (!yy || !mm || !dd) return null;
    return (yy * 10000) + (mm * 100) + dd;
  }

  const today = new Date();
  const todayKey = (today.getFullYear() * 10000) + ((today.getMonth()+1) * 100) + today.getDate();
  const todayHijri = _todayHijriKey();

  try{
    const resp = await fetch(url, { headers: { 'user-agent': 'kpi-kiosk/1.0' } });
    if (!resp.ok) throw new Error('moe');
    const html = await resp.text();

    const parsed = /academiccalendar/i.test(url) ? _parseAcademicCalendarHtml(html) : _parseMoeCalendarHtml(html);

    const normalized = parsed.map(it => {
      const gkey = gregKey(it.date_greg) || null;
      const hkey = _hijriKeyFromDMY(it.date_hijri) || null;
      return { title: it.title, date_hijri: it.date_hijri || '', date_greg: it.date_greg || '', gkey, hkey };
    });

    const filtered = normalized.filter(it => {
      if (it.gkey != null) return it.gkey >= todayKey;
      if (todayHijri != null && it.hkey != null) return it.hkey >= todayHijri;
      return true;
    });

    filtered.sort((a, b) => {
      const ag = (a.gkey != null) ? a.gkey : 99999999;
      const bg = (b.gkey != null) ? b.gkey : 99999999;
      if (ag !== bg) return ag - bg;
      const ah = (a.hkey != null) ? a.hkey : 99999999;
      const bh = (b.hkey != null) ? b.hkey : 99999999;
      if (ah !== bh) return ah - bh;
      return String(a.title).localeCompare(String(b.title));
    });

    const finalItems = filtered.map(it => ({ title: it.title, date_hijri: it.date_hijri, date_greg: it.date_greg })).slice(0, maxItems);
    _moeCalendarCache = { ts: now, key: url, items: finalItems };
    return finalItems;
  }catch(e){
    return [];
  }
}


// Kiosk: HUD (quote + weather)
app.get('/api/kiosk/hud', requireAuth, async (req, res) => {
  try{
    const settings = getSettings();
    const quote = _getRandomQuote();
    let weather = null;
    if (Number(settings.kiosk_weather_enabled ?? 1) === 1){
      weather = await _getWeatherRiyadh();
    }
    res.json({ ok:true, quote, weather, ts: Date.now() });
  }catch(e){
    res.json({ ok:false, quote: null, weather: null, ts: Date.now() });
  }
});

// Kiosk: Ticker (manual / RSS / mixed)
app.get('/api/kiosk/ticker', requireAuth, async (req, res) => {
  try{
    const settings = getSettings();
    const items = await _getTickerItems(settings);
    res.json({ ok:true, items, ts: Date.now() });
  }catch(e){
    res.json({ ok:false, items: [], ts: Date.now() });
  }
});

app.get('/api/kiosk/calendar', requireAuth, async (req, res) => {
  try{
    const settings = getSettings();
    const source = String(settings.kiosk_calendar_source || 'moe').trim();

    if (source === 'moe') {
      const items = await _fetchMoeCalendarItems(settings);
      return res.json({ ok:true, source:'moe', items, ts: Date.now() });
    }

    const daysAhead = Math.max(7, Math.min(365, Number(settings.kiosk_calendar_days_ahead || 60)));
    const limit = Math.max(5, Math.min(50, Number(settings.kiosk_calendar_max_items || 12)));

    const rows = db.prepare(`
      SELECT id, title, event_date, end_date, category, notes
      FROM kiosk_calendar_events
      WHERE is_active=1
        AND date(event_date) BETWEEN date('now') AND date('now', '+' || ? || ' day')
      ORDER BY date(event_date) ASC
      LIMIT ?
    `).all(daysAhead, limit);

    res.json({ ok:true, source:'manual', items: rows, ts: Date.now() });
  }catch(e){
    res.json({ ok:false, items: [] });
  }
});

// --------- Kiosk Content Management (Admin/Supervisor) ---------
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

app.get('/kiosk-content', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  res.render('kiosk_content', {});
});


// Welcome Screen
app.get('/kiosk-content/welcome', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const msg = req.query.ok ? String(req.query.ok) : null;
  const settings = getSettings();
  res.render('kiosk_welcome', { settings, msg });
});

app.post('/kiosk-content/welcome/settings', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const enabled = String(req.body.kiosk_welcome_enabled || '0') === '1' ? 1 : 0;
  const text = String(req.body.kiosk_welcome_text || '').trim();
  try {
    db.prepare('UPDATE settings SET kiosk_welcome_enabled=?, kiosk_welcome_text=? WHERE id=1').run(enabled, text);
  } catch (e) {
    // ignore (columns may be added after restart)
  }
  res.redirect('/kiosk-content/welcome?ok=تم%20حفظ%20الإعدادات');
});

// Quotes
app.get('/kiosk-content/quotes', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const msg = req.query.ok ? String(req.query.ok) : null;
  const items = db.prepare(`SELECT id, quote_text, is_active FROM kiosk_quotes ORDER BY id DESC`).all();
  res.render('kiosk_quotes', { items, msg });
});

app.post('/kiosk-content/quotes/add', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const text = String(req.body.quote_text || '').trim();
  const isActive = String(req.body.is_active || '1') === '1' ? 1 : 0;
  if (!text) return res.redirect('/kiosk-content/quotes?ok=لم%20يتم%20الحفظ');
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO kiosk_quotes(quote_text, is_active, created_at, updated_at) VALUES(?,?,?,?)`).run(text, isActive, now, now);
  res.redirect('/kiosk-content/quotes?ok=تم%20حفظ%20العبارة');
});

app.post('/kiosk-content/quotes/:id/toggle', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE kiosk_quotes SET is_active=CASE WHEN is_active=1 THEN 0 ELSE 1 END, updated_at=? WHERE id=?`).run(new Date().toISOString(), id);
  res.redirect('/kiosk-content/quotes?ok=تم%20التحديث');
});

app.post('/kiosk-content/quotes/:id/delete', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM kiosk_quotes WHERE id=?`).run(id);
  res.redirect('/kiosk-content/quotes?ok=تم%20الحذف');
});

// Ticker manual items
app.get('/kiosk-content/ticker', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const msg = req.query.ok ? String(req.query.ok) : null;
  const items = db.prepare(`SELECT id, item_text, sort_order, is_active FROM kiosk_ticker_items ORDER BY sort_order ASC, id DESC`).all();
  const settings = getSettings();
  res.render('kiosk_ticker', { items, msg, settings });
});

app.post('/kiosk-content/ticker/add', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const text = String(req.body.item_text || '').trim();
  const sortOrder = Number(req.body.sort_order || 0);
  const isActive = String(req.body.is_active || '1') === '1' ? 1 : 0;
  if (!text) return res.redirect('/kiosk-content/ticker?ok=لم%20يتم%20الحفظ');
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO kiosk_ticker_items(item_text, sort_order, is_active, created_at, updated_at) VALUES(?,?,?,?,?)`).run(text, sortOrder, isActive, now, now);
  res.redirect('/kiosk-content/ticker?ok=تم%20حفظ%20العنصر');
});

app.post('/kiosk-content/ticker/:id/toggle', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE kiosk_ticker_items SET is_active=CASE WHEN is_active=1 THEN 0 ELSE 1 END, updated_at=? WHERE id=?`).run(new Date().toISOString(), id);
  res.redirect('/kiosk-content/ticker?ok=تم%20التحديث');
});

app.post('/kiosk-content/ticker/:id/delete', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM kiosk_ticker_items WHERE id=?`).run(id);
  res.redirect('/kiosk-content/ticker?ok=تم%20الحذف');
});

// Ticker settings (moved from admin settings)
app.post('/kiosk-content/ticker/settings', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const settings = getSettings();
  const kiosk_ticker_mode = String(req.body.kiosk_ticker_mode || '').trim();
  const kiosk_ticker_rss_urls = String(req.body.kiosk_ticker_rss_urls || '').trim();
  const kiosk_ticker_speed = Number(req.body.kiosk_ticker_speed || settings.kiosk_ticker_speed || 60);
  const kiosk_ticker_font_size = Number(req.body.kiosk_ticker_font_size || settings.kiosk_ticker_font_size || 18);
  const kiosk_ticker_refresh_min = Number(req.body.kiosk_ticker_refresh_min || settings.kiosk_ticker_refresh_min || 15);
  const kiosk_ticker_max_items = Number(req.body.kiosk_ticker_max_items || settings.kiosk_ticker_max_items || 20);

  const _mode = (['manual','rss','mixed'].includes(kiosk_ticker_mode)) ? kiosk_ticker_mode : (settings.kiosk_ticker_mode || 'manual');
  const _rss = kiosk_ticker_rss_urls ? kiosk_ticker_rss_urls.slice(0, 4000) : null;
  const _speed = Math.max(5, Math.min(300, kiosk_ticker_speed));
  const _font = Math.max(12, Math.min(64, kiosk_ticker_font_size));
  const _refresh = Math.max(1, Math.min(240, kiosk_ticker_refresh_min));
  const _max = Math.max(5, Math.min(100, kiosk_ticker_max_items));

  db.prepare(`UPDATE settings SET kiosk_ticker_mode=?, kiosk_ticker_rss_urls=?, kiosk_ticker_speed=?, kiosk_ticker_font_size=?, kiosk_ticker_refresh_min=?, kiosk_ticker_max_items=? WHERE id=1`)
    .run(_mode, _rss, _speed, _font, _refresh, _max);

  res.redirect('/kiosk-content/ticker?ok=تم%20حفظ%20إعدادات%20الشريط');
});

// Calendar
app.get('/kiosk-content/calendar', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const msg = req.query.ok ? String(req.query.ok) : null;
  const items = db.prepare(`
    SELECT id, title, event_date, end_date, category, notes, is_active
    FROM kiosk_calendar_events
    ORDER BY date(event_date) DESC, id DESC
    LIMIT 400
  `).all();
  const settings = getSettings();
  res.render('kiosk_calendar', { items, msg, settings });
});

// Academic calendar settings (moved from admin settings)
app.post('/kiosk-content/calendar/settings', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const settings = getSettings();
  const kiosk_calendar_days_ahead = Number(req.body.kiosk_calendar_days_ahead || settings.kiosk_calendar_days_ahead || 60);
  const kiosk_calendar_max_items = Number(req.body.kiosk_calendar_max_items || settings.kiosk_calendar_max_items || 12);
  const kiosk_calendar_source = String(req.body.kiosk_calendar_source || settings.kiosk_calendar_source || 'moe').trim();
  const kiosk_calendar_moe_url = String(req.body.kiosk_calendar_moe_url || settings.kiosk_calendar_moe_url || 'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx').trim();
  const kiosk_calendar_moe_refresh_min = Number(req.body.kiosk_calendar_moe_refresh_min || settings.kiosk_calendar_moe_refresh_min || 120);

  const _days = Math.max(7, Math.min(365, kiosk_calendar_days_ahead));
  const _max = Math.max(5, Math.min(50, kiosk_calendar_max_items));
  const _src = (kiosk_calendar_source === 'moe') ? 'moe' : 'manual';
  const _url = kiosk_calendar_moe_url.slice(0, 4000);
  const _refresh = Math.max(5, Math.min(1440, kiosk_calendar_moe_refresh_min));

  db.prepare(`UPDATE settings SET kiosk_calendar_days_ahead=?, kiosk_calendar_max_items=?, kiosk_calendar_source=?, kiosk_calendar_moe_url=?, kiosk_calendar_moe_refresh_min=? WHERE id=1`)
    .run(_days, _max, _src, _url, _refresh);

  res.redirect('/kiosk-content/calendar?ok=تم%20حفظ%20إعدادات%20التقويم');
});

app.post('/kiosk-content/calendar/add', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const title = String(req.body.title || '').trim();
  const eventDate = String(req.body.event_date || '').trim();
  const endDate = String(req.body.end_date || '').trim() || null;
  const category = String(req.body.category || '').trim() || null;
  const notes = String(req.body.notes || '').trim() || null;
  const isActive = String(req.body.is_active || '1') === '1' ? 1 : 0;
  if (!title || !eventDate) return res.redirect('/kiosk-content/calendar?ok=لم%20يتم%20الحفظ');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO kiosk_calendar_events(title, event_date, end_date, category, notes, is_active, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(title, eventDate, endDate, category, notes, isActive, now, now);
  res.redirect('/kiosk-content/calendar?ok=تم%20حفظ%20الموعد');
});

app.post('/kiosk-content/calendar/:id/toggle', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE kiosk_calendar_events SET is_active=CASE WHEN is_active=1 THEN 0 ELSE 1 END, updated_at=? WHERE id=?`).run(new Date().toISOString(), id);
  res.redirect('/kiosk-content/calendar?ok=تم%20التحديث');
});

app.post('/kiosk-content/calendar/:id/delete', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM kiosk_calendar_events WHERE id=?`).run(id);
  res.redirect('/kiosk-content/calendar?ok=تم%20الحذف');
});


// --------- Kiosk Content: Tasks (visibility + display options) ---------
app.get('/kiosk-content/tasks', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me || req.user;
  const settings = getSettings();

  let where = '1=1';
  const params = [];

  if (me && me.role === 'supervisor') {
    where += ' AND t.supervisor_id = ?';
    params.push(me.id);
  }

  const tasks = db.prepare(`
    SELECT
      t.id, t.title, t.status, t.due_date, t.updated_at,
      t.kiosk_visible,
      e.title AS event_title,
      uemp.display_name AS employee_name,
      usup.display_name AS supervisor_name
    FROM tasks t
    LEFT JOIN events e ON e.id = t.event_id
    LEFT JOIN users uemp ON uemp.id = t.employee_id
    LEFT JOIN users usup ON usup.id = t.supervisor_id
    WHERE ${where}
    ORDER BY datetime(t.updated_at) DESC
    LIMIT 500
  `).all(...params);

  res.render('kiosk_tasks', {
    settings,
    tasks,
    okMsg: String(req.query.ok || '').trim(),
    errMsg: String(req.query.err || '').trim(),
  });
});

app.post('/kiosk-content/tasks/settings', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  try {
    const s = getSettings();

    const allowedDisplay = ['both','assignee','supervisor','chart_only'];
    const _display = allowedDisplay.includes(String(req.body.kiosk_display_mode || '').trim())
      ? String(req.body.kiosk_display_mode || '').trim()
      : (s.kiosk_display_mode || 'both');

    const allowedChart = ['ring','bar','ring_bar'];
    const _chartVariant = allowedChart.includes(String(req.body.kiosk_chart_variant || '').trim())
      ? String(req.body.kiosk_chart_variant || '').trim()
      : (s.kiosk_chart_variant || 'ring');

    const _interval = Math.max(2, Math.min(60, Number(req.body.kiosk_interval_sec || s.kiosk_interval_sec || 5)));

    const _showEvent = req.body.kiosk_show_event ? 1 : 0;
    const _showDue = req.body.kiosk_show_due ? 1 : 0;
    const _showStatus = req.body.kiosk_show_status ? 1 : 0;

    db.prepare(`
      UPDATE settings
      SET kiosk_display_mode=?, kiosk_chart_variant=?, kiosk_interval_sec=?,
          kiosk_show_event=?, kiosk_show_due=?, kiosk_show_status=?
      WHERE id=1
    `).run(_display, _chartVariant, _interval, _showEvent, _showDue, _showStatus);

    res.redirect('/kiosk-content/tasks?ok=' + encodeURIComponent('تم حفظ إعدادات عرض المهام ✅'));
  } catch (e) {
    res.redirect('/kiosk-content/tasks?err=' + encodeURIComponent('تعذر الحفظ: ' + (e && e.message ? e.message : e)));
  }
});

function _parseVisibleValue(v){
  if (Array.isArray(v)) v = v[v.length - 1];
  const s = String(v || '').trim();
  return (s === '1' || s.toLowerCase() === 'true' || s === 'on') ? 1 : 0;
}

app.post('/kiosk-content/tasks/:id/visible', requireAuth, requireRole('admin','supervisor'), (req, res) => {
  const me = res.locals.me || req.user;
  try {
    const id = String(req.params.id || '').trim();
    if (!/^\d+$/.test(id)) return res.redirect('/kiosk-content/tasks?err=' + encodeURIComponent('معرّف المهمة غير صحيح'));

    const visible = _parseVisibleValue(req.body.visible);

    if (me && me.role === 'supervisor') {
      const own = db.prepare(`SELECT id FROM tasks WHERE id=? AND supervisor_id=?`).get(id, me.id);
      if (!own) return res.redirect('/kiosk-content/tasks?err=' + encodeURIComponent('غير مصرح بتعديل هذه المهمة'));
    }

    db.prepare(`UPDATE tasks SET kiosk_visible=? WHERE id=?`).run(visible, id);

    res.redirect('/kiosk-content/tasks?ok=' + encodeURIComponent('تم تحديث ظهور المهمة في شاشة العرض ✅'));
  } catch (e) {
    res.redirect('/kiosk-content/tasks?err=' + encodeURIComponent('تعذر تحديث المهمة: ' + (e && e.message ? e.message : e)));
  }
});


app.get('/kiosk-content/calendar/template.xlsx', requireAuth, requireRole('admin','supervisor'), async (req, res) => {
  try{
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('calendar');
    ws.columns = [
      { header:'title', key:'title', width: 45 },
      { header:'event_date', key:'event_date', width: 14 },
      { header:'end_date', key:'end_date', width: 14 },
      { header:'category', key:'category', width: 18 },
      { header:'notes', key:'notes', width: 28 },
      { header:'is_active', key:'is_active', width: 10 },
    ];
    ws.addRow({ title:'بداية الاختبارات', event_date: dayjs().format('YYYY-MM-DD'), end_date:'', category:'اختبارات', notes:'', is_active:1 });
    ws.getRow(1).font = { bold:true };

    const buf = await wb.xlsx.writeBuffer();
    const fileName = `kiosk-calendar-template-${dayjs().format('YYYYMMDD')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buf));
  }catch(e){
    res.redirect('/kiosk-content/calendar?ok=تعذر%20تحميل%20القالب');
  }
});

app.post('/kiosk-content/calendar/import', requireAuth, requireRole('admin','supervisor'), importUpload.single('excel'), async (req, res) => {
  try{
    if (!req.file || !req.file.buffer) return res.redirect('/kiosk-content/calendar?ok=الملف%20مطلوب');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.redirect('/kiosk-content/calendar?ok=تعذر%20قراءة%20الملف');

    const headerRow = ws.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, col) => {
      const key = String(cell.value || '').trim().toLowerCase();
      if (key) headerMap[key] = col;
    });

    const colTitle = headerMap['title'] || headerMap['عنوان'] || headerMap['العنوان'];
    const colDate = headerMap['event_date'] || headerMap['date'] || headerMap['التاريخ'];
    const colEnd = headerMap['end_date'] || headerMap['end'] || headerMap['حتى'];
    const colCat = headerMap['category'] || headerMap['تصنيف'];
    const colNotes = headerMap['notes'] || headerMap['ملاحظات'] || headerMap['ملاحظة'];
    const colActive = headerMap['is_active'] || headerMap['active'] || headerMap['مفعل'];

    if (!colTitle || !colDate) return res.redirect('/kiosk-content/calendar?ok=الأعمدة%20غير%20مكتملة');

    let upserted = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (let r = 2; r <= ws.rowCount; r++){
      const row = ws.getRow(r);
      const title = String((row.getCell(colTitle).value ?? '')).trim();
      if (!title) { skipped++; continue; }

      const rawDate = row.getCell(colDate).value;
      let eventDate = '';
      if (rawDate instanceof Date){
        eventDate = dayjs(rawDate).format('YYYY-MM-DD');
      } else {
        eventDate = String(rawDate || '').trim();
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)){ skipped++; continue; }

      const rawEnd = colEnd ? row.getCell(colEnd).value : null;
      let endDate = null;
      if (rawEnd instanceof Date) endDate = dayjs(rawEnd).format('YYYY-MM-DD');
      else if (rawEnd) {
        const s = String(rawEnd).trim();
        endDate = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
      }

      const category = colCat ? String(row.getCell(colCat).value || '').trim() || null : null;
      const notes = colNotes ? String(row.getCell(colNotes).value || '').trim() || null : null;
      const isActive = colActive ? (String(row.getCell(colActive).value || '1').trim() === '0' ? 0 : 1) : 1;

      const existing = db.prepare(`SELECT id FROM kiosk_calendar_events WHERE title=? AND event_date=? LIMIT 1`).get(title, eventDate);
      if (existing && existing.id){
        db.prepare(`
          UPDATE kiosk_calendar_events
          SET end_date=?, category=?, notes=?, is_active=?, updated_at=?
          WHERE id=?
        `).run(endDate, category, notes, isActive, now, existing.id);
      } else {
        db.prepare(`
          INSERT INTO kiosk_calendar_events(title, event_date, end_date, category, notes, is_active, created_at, updated_at)
          VALUES(?,?,?,?,?,?,?,?)
        `).run(title, eventDate, endDate, category, notes, isActive, now, now);
      }
      upserted++;
    }

    res.redirect(`/kiosk-content/calendar?ok=تم%20استيراد%20${upserted}%20صف%20(تم%20تجاهل%20${skipped})`);
  }catch(e){
    res.redirect('/kiosk-content/calendar?ok=تعذر%20استيراد%20الملف');
  }
});



// --------- Email Reminders (Due Soon) ---------
function pad2(n){ return String(n).padStart(2,'0'); }
function formatLocalDate(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function addDays(d, days){
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function runDueSoonEmailReminders(){
  try{
    const settings = getSettings();
    if (!(settings && (settings.email_enabled === 1 || settings.email_enabled === true || settings.email_enabled === '1'))) return;

    const days = Number(settings.email_due_days != null ? settings.email_due_days : 2);
    if (!Number.isFinite(days) || days <= 0) return;

    const today = new Date();
    const todayStr = formatLocalDate(today);
    const limitStr = formatLocalDate(addDays(today, days));

    const items = db.prepare(`
      SELECT t.id, t.title, t.due_date, t.employee_id, u.email, u.display_name
      FROM tasks t
      LEFT JOIN users u ON u.id=t.employee_id
      WHERE t.due_date IS NOT NULL
        AND t.completed_at IS NULL
        AND (t.status IS NULL OR t.status <> 'cancelled')
        AND date(t.due_date) BETWEEN date(?) AND date(?)
        AND u.email IS NOT NULL
    `).all(todayStr, limitStr);

    const baseUrl = 'http://localhost:' + PORT;
    for (const it of items){
      const exists = db.prepare("SELECT 1 FROM email_logs WHERE type='due_soon' AND task_id=? AND to_email=? AND ref=? LIMIT 1")
        .get(it.id, it.email, todayStr);
      if (exists) continue;

      const subject = `تنبيه: قرب موعد الاستحقاق (${it.title})`;
      const html = `
        <div style="font-family:Tahoma,Arial;direction:rtl;text-align:right">
          <h3 style="margin:0 0 8px 0">تنبيه قرب موعد الاستحقاق</h3>
          <div><b>المهمة:</b> ${it.title}</div>
          <div><b>تاريخ الاستحقاق:</b> ${it.due_date}</div>
          <div style="margin-top:10px"><a href="${baseUrl}/tasks/${it.id}">فتح المهمة</a></div>
        </div>
      `;
      sendMail(settings, { to: it.email, subject, html })
        .then(()=> {
          db.prepare("INSERT OR IGNORE INTO email_logs(type, task_id, stage_id, to_email, ref, meta_json, sent_at) VALUES (?,?,?,?,?,?,?)")
            .run('due_soon', it.id, null, it.email, todayStr, null, new Date().toISOString());
        })
        .catch(()=>{});
    }
  } catch(e){
    // ignore
  }
}


// --------- Start ---------
app.listen(PORT, () => {
  console.log(`KPI Team System running on http://localhost:${PORT}`);

  // Run once at startup + every hour
  runDueSoonEmailReminders();
  setInterval(runDueSoonEmailReminders, 60 * 60 * 1000);

  // World Days daily auto update (scheduled)
  try { rescheduleWorldDaysAutoUpdate(); } catch(e) {}
});
