import {
  DEFAULT_APP_SETTINGS,
  APP_SETTINGS_KEYS,
  mergeAppSettingsFromDbRow,
  computeFeePreview,
  buildAppSettingsUpsertPayload,
  assertCompleteSettingsShape,
} from './appSettingsModel';

describe('appSettingsModel — mobile contract', () => {
  test('DEFAULT_APP_SETTINGS includes every key the admin UI persists', () => {
    expect(APP_SETTINGS_KEYS.length).toBeGreaterThan(0);
    expect(APP_SETTINGS_KEYS).toContain('platform_fee_percent');
    expect(APP_SETTINGS_KEYS).toContain('announcement_enabled');
    expect(APP_SETTINGS_KEYS).toContain('maintenance_mode');
    expect(APP_SETTINGS_KEYS).toContain('show_faq');
    expect(APP_SETTINGS_KEYS).toContain('support_email');
  });

  test('mergeAppSettingsFromDbRow returns full defaults when no row', () => {
    expect(mergeAppSettingsFromDbRow(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(mergeAppSettingsFromDbRow(undefined)).toEqual(DEFAULT_APP_SETTINGS);
    expect(mergeAppSettingsFromDbRow({})).toEqual(DEFAULT_APP_SETTINGS);
    expect(mergeAppSettingsFromDbRow({ settings: null })).toEqual(DEFAULT_APP_SETTINGS);
  });

  test('mergeAppSettingsFromDbRow fills missing keys from partial API settings', () => {
    const merged = mergeAppSettingsFromDbRow({
      settings: { platform_fee_percent: 7.5, announcement_text: 'Hello' },
    });
    expect(merged.platform_fee_percent).toBe(7.5);
    expect(merged.announcement_text).toBe('Hello');
    expect(merged.show_faq).toBe(DEFAULT_APP_SETTINGS.show_faq);
    expect(merged.support_email).toBe(DEFAULT_APP_SETTINGS.support_email);
    assertCompleteSettingsShape(merged);
  });

  test('computeFeePreview matches 5% on A$100 nominal task', () => {
    const p = computeFeePreview(5);
    expect(p.pct).toBe(5);
    expect(p.fee).toBe(5);
    expect(p.takerPays).toBe(105);
    expect(p.providerGets).toBe(100);
  });

  test('computeFeePreview handles 10% and zero', () => {
    expect(computeFeePreview(10).fee).toBe(10);
    expect(computeFeePreview(10).takerPays).toBe(110);
    expect(computeFeePreview(0).fee).toBe(0);
    expect(computeFeePreview(NaN).fee).toBe(0);
  });

  test('buildAppSettingsUpsertPayload uses singleton id and echoes settings', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const payload = buildAppSettingsUpsertPayload(DEFAULT_APP_SETTINGS, at);
    expect(payload).toEqual({
      id: 1,
      settings: DEFAULT_APP_SETTINGS,
      updated_at: at,
    });
  });

  test('assertCompleteSettingsShape throws if a key is missing', () => {
    const bad = { ...DEFAULT_APP_SETTINGS };
    delete bad.show_faq;
    expect(() => assertCompleteSettingsShape(bad)).toThrow(/show_faq/);
  });
});
