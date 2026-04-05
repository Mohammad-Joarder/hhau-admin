/**
 * Map admin UI fields to your Supabase column names.
 */

/**
 * If your `tasks` table uses a specific money column name, set it here (exact DB column).
 * Leave empty ('') to auto-detect from common names (min_bid, budget, price, amount, …).
 */
export const TASKS_AMOUNT_COLUMN = '';

/**
 * Stripe-related column on `public.provider_profiles` (optional).
 * Leave empty to omit from queries.
 */
export const PROVIDER_STRIPE_COLUMN = '';
