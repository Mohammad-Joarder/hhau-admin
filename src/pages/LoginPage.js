// ============================================================
// LoginPage.js — Admin login with role check
// Fixed: better error handling, detailed console logging
// to diagnose role check failures
// ============================================================

import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Step 1: Sign in with Supabase auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) throw new Error(authError.message);
      if (!data?.user) throw new Error('Login failed — no user returned.');

      console.log('Auth success — user ID:', data.user.id);

      // Step 2: Check admin role in the users table
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, email, role, full_name')
        .eq('id', data.user.id)
        .single();

      console.log('Profile fetch result:', profile, 'Error:', profileError);

      if (profileError) {
        // Profile row doesn't exist yet — sign out and show error
        await supabase.auth.signOut();
        throw new Error(
          `Could not load user profile. Make sure the admin user was created correctly in the database. (${profileError.message})`
        );
      }

      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('User profile not found in the database.');
      }

      console.log('User role:', profile.role);

      if (profile.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error(
          `Access denied. Your account role is "${profile.role}" but admin access is required.`
        );
      }

      // Role is admin — App.js will detect the session change and redirect
      console.log('Admin login successful!');

    } catch (err) {
      console.error('Login error:', err.message);
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#3D1F2D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              fontSize: 24,
            }}
          >
            🛡️
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Admin Login</h1>
          <p style={{ color: '#888', fontSize: 14 }}>HelpingHandsAu admin portal</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              type="email"
              className="form-input"
              placeholder="admin@helpinghandsau.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '12px',
              fontSize: 15,
              marginTop: 8,
            }}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
}