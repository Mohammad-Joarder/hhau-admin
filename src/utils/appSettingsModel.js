/**
 * Single source of truth for app_settings JSON shape (admin + mobile contract).
 */

export const DEFAULT_APP_SETTINGS = {
  announcement_enabled: false,
  announcement_text: '',
  announcement_type: 'info',
  maintenance_mode: false,
  maintenance_message: 'The app is currently under maintenance. Please try again later.',
  platform_fee_percent: 5,
  min_bid_amount: 5,
  max_bid_amount: 10000,
  support_email: 'support@helpinghandsau.com',
  contact_phone: '',
  show_faq: true,
  show_legal: true,
  show_things_to_know: true,
};

/** All keys the mobile app should read from app_settings.settings */
export const APP_SETTINGS_KEYS = Object.keys(DEFAULT_APP_SETTINGS);

/**
 * Merge a row from app_settings (data.settings JSON) with defaults so missing keys still work.
 */
export function mergeAppSettingsFromDbRow(data) {
  if (!data?.settings || typeof data.settings !== 'object') {
    return { ...DEFAULT_APP_SETTINGS };
  }
  return { ...DEFAULT_APP_SETTINGS, ...data.settings };
}

/**
 * Fee preview for a nominal A$100 task (matches Settings page copy).
 */
export function computeFeePreview(platformFeePercent) {
  const pct = parseFloat(platformFeePercent) || 0;
  const base = 100;
  const fee = parseFloat(((base * pct) / 100).toFixed(2));
  const takerPays = parseFloat((base + fee).toFixed(2));
  const providerGets = parseFloat(base.toFixed(2));
  return { fee, takerPays, providerGets, pct };
}

/**
 * Payload for upsert into app_settings (id = singleton row).
 */
export function buildAppSettingsUpsertPayload(settings, updatedAtIso) {
  return {
    id: 1,
    settings,
    updated_at: updatedAtIso,
  };
}

/**
 * Assert saved object contains every contract key (for tests / guards).
 */
export function assertCompleteSettingsShape(settings) {
  const missing = APP_SETTINGS_KEYS.filter((k) => !(k in settings));
  if (missing.length) {
    throw new Error(`Incomplete settings object; missing keys: ${missing.join(', ')}`);
  }
  return true;
}
