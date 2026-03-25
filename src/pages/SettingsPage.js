// ============================================================
// SettingsPage.js — Admin configurable app settings
// Controls announcements, feature flags, and app content
// that appear in the mobile app
// ============================================================

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Default settings structure
const DEFAULT_SETTINGS = {
  announcement_enabled: false,
  announcement_text: '',
  announcement_type: 'info', // info | warning | success
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

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        // Merge with defaults to handle any missing keys
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      // Use defaults if table doesn't exist yet
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      // Upsert — create or update the single settings row
      const { error } = await supabase
        .from('app_settings')
        .upsert({ id: 1, settings, updated_at: new Date().toISOString() });

      if (error) throw error;

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function update(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  if (loading) return <div className="loading">Loading settings...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>App Settings</h1>
        <p>Configure what users see in the mobile app. Changes take effect immediately.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">✅ Settings saved successfully!</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Announcement banner */}
        <div className="table-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 16 }}>📢 In-app announcement banner</h3>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
            Shows a banner at the top of the app home screen for all users.
          </p>

          <div className="form-group">
            <label className="form-label">Enable announcement</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={settings.announcement_enabled}
                onChange={e => update('announcement_enabled', e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: '#555' }}>
                {settings.announcement_enabled ? 'Banner is visible to users' : 'Banner is hidden'}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Announcement type</label>
            <select
              className="form-input form-select"
              value={settings.announcement_type}
              onChange={e => update('announcement_type', e.target.value)}
            >
              <option value="info">ℹ️ Info (blue)</option>
              <option value="warning">⚠️ Warning (orange)</option>
              <option value="success">✅ Success (green)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Announcement message</label>
            <textarea
              className="form-input"
              placeholder="e.g. We're running scheduled maintenance on Sunday 2-4am AEST."
              value={settings.announcement_text}
              onChange={e => update('announcement_text', e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {/* Maintenance mode */}
        <div className="table-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 16 }}>🔧 Maintenance mode</h3>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
            When enabled, all users see a maintenance screen and cannot use the app.
          </p>

          <div className="form-group">
            <label className="form-label">Enable maintenance mode</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={settings.maintenance_mode}
                onChange={e => update('maintenance_mode', e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{
                fontSize: 13,
                color: settings.maintenance_mode ? '#E53935' : '#888',
                fontWeight: settings.maintenance_mode ? 700 : 400,
              }}>
                {settings.maintenance_mode ? '⚠️ App is in maintenance mode!' : 'App is live'}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Maintenance message</label>
            <textarea
              className="form-input"
              value={settings.maintenance_message}
              onChange={e => update('maintenance_message', e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {/* Platform settings */}
        <div className="table-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 16 }}>💰 Platform settings</h3>

          <div className="form-group">
            <label className="form-label">Platform fee (%)</label>
            <input
              type="number"
              className="form-input"
              value={settings.platform_fee_percent}
              onChange={e => update('platform_fee_percent', parseFloat(e.target.value))}
              min="0"
              max="50"
              step="0.5"
            />
            <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              Currently charging {settings.platform_fee_percent}% on each transaction
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Min bid amount ($)</label>
              <input
                type="number"
                className="form-input"
                value={settings.min_bid_amount}
                onChange={e => update('min_bid_amount', parseFloat(e.target.value))}
                min="1"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Max bid amount ($)</label>
              <input
                type="number"
                className="form-input"
                value={settings.max_bid_amount}
                onChange={e => update('max_bid_amount', parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Contact & support */}
        <div className="table-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 16 }}>📧 Contact & support</h3>

          <div className="form-group">
            <label className="form-label">Support email</label>
            <input
              type="email"
              className="form-input"
              value={settings.support_email}
              onChange={e => update('support_email', e.target.value)}
              placeholder="support@helpinghandsau.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Support phone (optional)</label>
            <input
              type="tel"
              className="form-input"
              value={settings.contact_phone}
              onChange={e => update('contact_phone', e.target.value)}
              placeholder="+61 4xx xxx xxx"
            />
          </div>
        </div>

        {/* Profile page visibility */}
        <div className="table-card" style={{ padding: 24, gridColumn: '1 / -1' }}>
          <h3 style={{ marginBottom: 16 }}>👤 Profile page — content visibility</h3>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
            Control which sections appear on the user profile page in the app.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { key: 'show_faq', label: '❓ FAQ section' },
              { key: 'show_legal', label: '⚖️ Legal information' },
              { key: 'show_things_to_know', label: '💡 Things You Should Know' },
            ].map(item => (
              <div key={item.key} style={{
                border: '1.5px solid',
                borderColor: settings[item.key] ? '#29ABE2' : '#E0E0E0',
                borderRadius: 10, padding: 16,
                background: settings[item.key] ? '#F0F8FF' : '#FAFAFA',
                cursor: 'pointer',
              }} onClick={() => update(item.key, !settings[item.key])}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={settings[item.key]}
                    onChange={e => update(item.key, e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
                    {item.label}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#888', marginTop: 6, marginLeft: 26 }}>
                  {settings[item.key] ? 'Visible to users' : 'Hidden from users'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Save button */}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button
          className="btn btn-ghost"
          onClick={loadSettings}
          disabled={saving}
        >
          Reset
        </button>
        <button
          className="btn btn-primary"
          style={{ padding: '10px 32px', fontSize: 15 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : '💾 Save settings'}
        </button>
      </div>
    </div>
  );
}
