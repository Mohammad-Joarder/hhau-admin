import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from './SettingsPage';
import { DEFAULT_APP_SETTINGS, mergeAppSettingsFromDbRow } from '../utils/appSettingsModel';

const showToast = jest.fn();

jest.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

let singleResult = { data: null, error: { code: 'PGRST116' } };
let upsertResult = { error: null };

jest.mock('../supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve(singleResult)),
      })),
      upsert: jest.fn(() => Promise.resolve(upsertResult)),
    })),
  },
}));

import { supabase } from '../supabaseClient';

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    singleResult = { data: null, error: { code: 'PGRST116' } };
    upsertResult = { error: null };
  });

  test('loads defaults when no app_settings row (PGRST116)', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading settings/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /app settings/i })).toBeInTheDocument();
    const feeInput = screen.getByLabelText(/platform fee/i);
    expect(feeInput).toHaveValue(DEFAULT_APP_SETTINGS.platform_fee_percent);
  });

  test('merges server settings into form when row exists', async () => {
    singleResult = {
      data: {
        settings: {
          platform_fee_percent: 12,
          announcement_enabled: true,
          announcement_text: 'Server banner',
          maintenance_mode: true,
        },
      },
      error: null,
    };
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading settings/i)).not.toBeInTheDocument();
    });
    const feeInput = screen.getByLabelText(/platform fee/i);
    expect(feeInput).toHaveValue(12);
    expect(screen.getByRole('checkbox', { name: /enable banner/i })).toBeChecked();
    expect(screen.getByDisplayValue('Server banner')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /enable maintenance/i })).toBeChecked();
  });

  test('Save persists full settings object with id 1 and shows success toast', async () => {
    const user = userEvent.setup();
    singleResult = { data: null, error: { code: 'PGRST116' } };
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading settings/i)).not.toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText(/support email/i));
    await user.type(screen.getByLabelText(/support email/i), 'ops@example.com');

    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Settings saved', 'success');
    });

    expect(supabase.from).toHaveBeenCalledWith('app_settings');
    const fromResults = supabase.from.mock.results;
    const lastFrom = fromResults[fromResults.length - 1].value;
    expect(lastFrom.upsert).toHaveBeenCalledTimes(1);
    const payload = lastFrom.upsert.mock.calls[0][0];
    expect(payload.id).toBe(1);
    expect(payload.settings).toMatchObject({
      platform_fee_percent: DEFAULT_APP_SETTINGS.platform_fee_percent,
      support_email: 'ops@example.com',
    });
    expect(payload.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const merged = mergeAppSettingsFromDbRow({ settings: payload.settings });
    expect(Object.keys(merged).sort()).toEqual(Object.keys(DEFAULT_APP_SETTINGS).sort());
  });

  test('Save shows error toast when upsert fails', async () => {
    const user = userEvent.setup();
    upsertResult = { error: { message: 'RLS blocked' } };
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading settings/i)).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('RLS blocked', 'error');
    });
    expect(screen.getByText(/RLS blocked/i)).toBeInTheDocument();
  });

  test('announcement type drives preview border colour (warning)', async () => {
    singleResult = {
      data: { settings: { announcement_type: 'warning', announcement_text: 'Careful' } },
      error: null,
    };
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading settings/i)).not.toBeInTheDocument();
    });
    const preview = screen.getByText('Careful').closest('div');
    expect(preview).toHaveStyle({ border: '2px solid #E65100' });
  });

  test('content visibility toggles update state (show_faq)', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading settings/i)).not.toBeInTheDocument();
    });
    const faq = screen.getByRole('checkbox', { name: /faq in profile/i });
    expect(faq).toBeChecked();
    await user.click(faq);
    expect(faq).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => {
      const results = supabase.from.mock.results;
      const fromApi = results[results.length - 1].value;
      expect(fromApi.upsert.mock.calls[0][0].settings.show_faq).toBe(false);
    });
  });
});
