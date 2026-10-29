const PROJECT_CATEGORIES = [
  { value: 'GITHUB', label: 'GitHub Projects' },
  { value: 'TELEGRAM_BOT', label: 'Telegram Bots' },
  { value: 'DJANGO', label: 'Django Projects' },
  { value: 'WEB_APP', label: 'Web Applications' },
  { value: 'OTHER', label: 'Other Projects' },
];
const EXPERIENCE_TYPES = [
  { value: 'EXPERIENCE', label: 'Experience' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'CERTIFICATION', label: 'Certification' },
  { value: 'ACHIEVEMENT', label: 'Achievement' },
];

const labelOf = (list, value) => (list.find((i) => i.value === value) || {}).label || value;

function formatDate(d, withTime = false) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const opts = withTime
    ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleString('en-GB', { ...opts, timeZone: 'UTC' }) + (withTime ? ' UTC' : '');
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function initials(user) {
  const src = (user && (user.displayName || user.username)) || '?';
  const parts = src.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
}

/** Only same-site relative paths are allowed as post-login redirect targets. */
function safeNext(next) {
  if (typeof next !== 'string') return '/admin';
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/admin';
  return next;
}

const mediaUrl = (id) => (id ? `/media/${Number(id)}` : '');

module.exports = { PROJECT_CATEGORIES, EXPERIENCE_TYPES, labelOf, formatDate, formatBytes, initials, safeNext, mediaUrl };
