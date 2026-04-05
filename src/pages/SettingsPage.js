import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { formatAud } from '../utils/format';
import {
  DEFAULT_APP_SETTINGS,
  mergeAppSettingsFromDbRow,
  computeFeePreview,
  buildAppSettingsUpsertPayload,
  assertCompleteSettingsShape,
} from '../utils/appSettingsModel';

const ANNOUNCE_STYLES = {
  info: { bg: '#E3F2FD', border: '#29ABE2', color: '#0D47A1' },
  warning: { bg: '#FFF3E0', border: '#E65100', color: '#E65100' },
  success: { bg: '#E8F5E9', border: '#2E7D32', color: '#1B5E20' },
};

export default function SettingsPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error: err } = await supabase.from('app_settings').select('*').single();
        if (err && err.code !== 'PGRST116') throw err;
        setSettings(mergeAppSettingsFromDbRow(data));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const feePreview = useMemo(
    () => computeFeePreview(settings.platform_fee_percent),
    [settings.platform_fee_percent]
  );

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      assertCompleteSettingsShape(settings);
      const payload = buildAppSettingsUpsertPayload(settings, new Date().toISOString());
      const { error: err } = await supabase.from('app_settings').upsert(payload);
      if (err) throw err;
      showToast('Settings saved', 'success');
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function update(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  const ann = ANNOUNCE_STYLES[settings.announcement_type] || ANNOUNCE_STYLES.info;

  if (loading) return <div className="loading">Loading settings...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>App settings</h1>
        <p>Structured configuration for the mobile app</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        <section className="table-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Section 1 — Platform fees</h3>
          <div className="form-group">
            <label className="form-label" htmlFor="settings-platform-fee-percent">
              Platform fee (%)
            </label>
            <input
              id="settings-platform-fee-percent"
              type="number"
              className="form-input"
              style={{ maxWidth: 200 }}
              value={settings.platform_fee_percent}
              onChange={(e) => update('platform_fee_percent', parseFloat(e.target.value))}
              min={0}
              max={50}
              step={0.5}
            />
          </div>
          <div
            style={{
              marginTop: 12,
              padding: 16,
              borderRadius: 12,
              background: '#F8F9FA',
              border: '1px solid #E0E0E0',
              fontSize: 14,
            }}
          >
            <strong>Live preview</strong> on a {formatAud(100)} nominal task with {feePreview.pct}% fee:
            <ul style={{ margin: '10px 0 0 18px', lineHeight: 1.6 }}>
              <li>Taker pays ≈ {formatAud(feePreview.takerPays)} (task + fee)</li>
              <li>Provider receives ≈ {formatAud(feePreview.providerGets)} (bid amount)</li>
              <li>Platform fee ≈ {formatAud(feePreview.fee)}</li>
            </ul>
            <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
              Admin dispute resolution in this panel always uses 5% of accepted bid unless you align mobile + RPC separately.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="settings-min-bid">
                Min bid ($)
              </label>
              <input id="settings-min-bid" type="number" className="form-input" value={settings.min_bid_amount} onChange={(e) => update('min_bid_amount', parseFloat(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="settings-max-bid">
                Max bid ($)
              </label>
              <input id="settings-max-bid" type="number" className="form-input" value={settings.max_bid_amount} onChange={(e) => update('max_bid_amount', parseFloat(e.target.value))} />
            </div>
          </div>
        </section>

        <section className="table-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Section 2 — App announcements</h3>
          <div className="form-group">
            <label className="form-label" htmlFor="settings-announcement-enabled" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                id="settings-announcement-enabled"
                type="checkbox"
                checked={settings.announcement_enabled}
                onChange={(e) => update('announcement_enabled', e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              Enable banner
            </label>
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-input form-select" style={{ maxWidth: 280 }} value={settings.announcement_type} onChange={(e) => update('announcement_type', e.target.value)}>
              <option value="info">Info (blue)</option>
              <option value="warning">Warning (orange)</option>
              <option value="success">Success (green)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea className="form-input" rows={3} value={settings.announcement_text} onChange={(e) => update('announcement_text', e.target.value)} />
          </div>
          <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>Preview (mobile style)</div>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              border: `2px solid ${ann.border}`,
              background: ann.bg,
              color: ann.color,
              fontWeight: 600,
            }}
          >
            {settings.announcement_text || 'Your announcement will appear here.'}
          </div>
        </section>

        <section className="table-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Section 3 — Maintenance mode</h3>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
            When enabled, this flag should block normal app usage (enforce in mobile app + API).
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="settings-maintenance-enabled" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                id="settings-maintenance-enabled"
                type="checkbox"
                checked={settings.maintenance_mode}
                onChange={(e) => update('maintenance_mode', e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              Enable maintenance
            </label>
            {settings.maintenance_mode && <span className="badge badge-pill-danger" style={{ marginLeft: 12 }}>Live users blocked</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea className="form-input" rows={3} value={settings.maintenance_message} onChange={(e) => update('maintenance_message', e.target.value)} />
          </div>
        </section>

        <section className="table-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Section 4 — Content visibility</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { key: 'show_faq', label: 'FAQ in profile' },
              { key: 'show_legal', label: 'Legal in profile' },
              { key: 'show_things_to_know', label: 'Things You Should Know' },
            ].map((item) => (
              <label
                key={item.key}
                htmlFor={`settings-${item.key}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 12, border: '1px solid #E0E0E0', borderRadius: 10 }}
              >
                <input id={`settings-${item.key}`} type="checkbox" checked={settings[item.key]} onChange={(e) => update(item.key, e.target.checked)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="table-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Section 5 — Contact</h3>
          <div className="form-group">
            <label className="form-label" htmlFor="settings-support-email">
              Support email
            </label>
            <input id="settings-support-email" type="email" className="form-input" value={settings.support_email} onChange={(e) => update('support_email', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Support phone</label>
            <input type="tel" className="form-input" value={settings.contact_phone} onChange={(e) => update('contact_phone', e.target.value)} />
          </div>
        </section>

        <section className="table-card" style={{ padding: 24, border: '1px solid #FFCDD2' }}>
          <h3 style={{ marginBottom: 12, color: '#C62828' }}>Section 6 — Danger zone</h3>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Export all data and destructive actions belong here. Placeholders only in the admin UI.
          </p>
          <button type="button" className="btn btn-ghost" disabled title="Connect to backend export job">
            Export all data (placeholder)
          </button>
          <div style={{ marginTop: 12 }}>
            <a className="text-link" href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noreferrer">
              Open Supabase SQL editor →
            </a>
            <span className="text-muted" style={{ fontSize: 12, marginLeft: 8 }}>Run migrations / rebuild from your repo SQL</span>
          </div>
        </section>
      </div>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button type="button" className="btn btn-primary" style={{ padding: '10px 28px' }} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : '💾 Save settings'}
        </button>
      </div>
    </div>
  );
}
