/** Australian formatting helpers — AUD and en-AU dates */

export function formatAud(amount) {
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return 'A$0.00';
  return `A$${n.toFixed(2)}`;
}

export function formatDateAu(dateStr, { withTime = true } = {}) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const opts = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  };
  if (withTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
    opts.hour12 = true;
  }
  const base = d.toLocaleDateString('en-AU', opts);
  return withTime ? `${base} AEST` : base;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export function startOfTodayUtc() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function startOfYesterdayUtc() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfYesterdayUtc() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function hoursSince(dateStr) {
  if (!dateStr) return 0;
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
}

export function daysOpen(raisedAt) {
  if (!raisedAt) return 0;
  return Math.floor((Date.now() - new Date(raisedAt).getTime()) / (1000 * 60 * 60 * 24));
}
