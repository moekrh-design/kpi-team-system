
const nodemailer = require('nodemailer');

function normalizeBool(v) {
  return v === 1 || v === true || v === '1' || v === 'true' || v === 'on';
}

function buildTransport(settings) {
  const host = settings.email_smtp_host || 'smtp.office365.com';
  const port = Number(settings.email_smtp_port || 587);
  const secure = normalizeBool(settings.email_smtp_secure); // false for STARTTLS on 587
  const user = settings.email_smtp_user || settings.email_from_email || '';
  const pass = settings.email_smtp_pass || '';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    tls: {
      // Office365 uses STARTTLS; leave defaults
    }
  });
}

function buildFrom(settings) {
  const fromEmail = (settings.email_from_email || (settings.email_smtp_user || '')).trim();
  const fromName = (settings.email_from_name || '').trim();
  if (!fromEmail) return fromName || 'KPI System';
  if (!fromName) return fromEmail;
  return `"${fromName}" <${fromEmail}>`;
}

async function sendMail(settings, { to, subject, html, text }) {
  if (!normalizeBool(settings.email_enabled)) return { skipped: true, reason: 'disabled' };
  if (!to) return { skipped: true, reason: 'missing_to' };

  const transporter = buildTransport(settings);
  const from = buildFrom(settings);
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html
  });
  return { ok: true, info };
}

module.exports = { sendMail };
