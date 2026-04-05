import { TASKS_AMOUNT_COLUMN } from '../config/schema';

/** Try these property names on a task row (first non-empty numeric wins). */
const AMOUNT_KEYS = [
  'min_bid',
  'budget',
  'min_budget',
  'minimum_budget',
  'estimated_budget',
  'guide_price',
  'starting_price',
  'price',
  'amount',
  'task_amount',
  'bid_minimum',
  'minimum_price',
];

/**
 * Numeric amount shown as “min bid” / task value in the admin UI.
 * Uses TASKS_AMOUNT_COLUMN from schema first (if set), then scans AMOUNT_KEYS.
 */
export function taskAmount(task) {
  if (!task) return 0;
  const order = [];
  if (TASKS_AMOUNT_COLUMN && String(TASKS_AMOUNT_COLUMN).trim()) {
    order.push(TASKS_AMOUNT_COLUMN.trim());
  }
  AMOUNT_KEYS.forEach((k) => {
    if (!order.includes(k)) order.push(k);
  });
  for (const k of order) {
    const raw = task[k];
    if (raw == null || raw === '') continue;
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
