/**
 * One-time script: set admin password + ensure public.users row (role=admin).
 *
 * Requires your Supabase SERVICE ROLE key (never put this in REACT_APP_* or commit it).
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-secret"
 *   node scripts/set-admin-password.cjs
 *
 * Optional env:
 *   ADMIN_EMAIL=admin@helpinghandsau.com
 *   ADMIN_PASSWORD=Admin123
 *   ADMIN_FULL_NAME=Admin
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(path.join(__dirname, '..', '.env'));
loadDotEnv(path.join(__dirname, '..', '.env.local'));

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.ADMIN_EMAIL || 'admin@helpinghandsau.com').trim().toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123';
const FULL_NAME = process.env.ADMIN_FULL_NAME || 'Admin';

async function main() {
  if (!SUPABASE_URL) {
    console.error('Missing SUPABASE_URL or REACT_APP_SUPABASE_URL');
    process.exit(1);
  }
  if (!SERVICE_ROLE) {
    console.error(
      'Missing SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Get it from: Supabase Dashboard → Project Settings → API → service_role (secret).\n' +
        'Then run: $env:SUPABASE_SERVICE_ROLE_KEY="..." ; node scripts/set-admin-password.cjs'
    );
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId = null;

  let existing = null;
  for (let page = 1; page <= 50; page += 1) {
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (listErr) {
      console.error('listUsers failed:', listErr.message);
      process.exit(1);
    }
    const users = listData?.users || [];
    existing = users.find((u) => (u.email || '').toLowerCase() === EMAIL);
    if (existing || users.length < 200) break;
  }

  if (existing) {
    userId = existing.id;
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (updErr) {
      console.error('updateUserById failed:', updErr.message);
      process.exit(1);
    }
    console.log('Updated password for existing auth user:', EMAIL);
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    if (createErr) {
      console.error('createUser failed:', createErr.message);
      process.exit(1);
    }
    userId = created.user.id;
    console.log('Created auth user:', EMAIL);
  }

  const { data: row, error: rowErr } = await admin
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();

  if (rowErr) {
    console.error('public.users select failed:', rowErr.message);
    process.exit(1);
  }

  if (!row) {
    const { error: insErr } = await admin.from('users').insert({
      id: userId,
      email: EMAIL,
      full_name: FULL_NAME,
      role: 'admin',
      status: 'active',
    });
    if (insErr) {
      console.error('public.users insert failed:', insErr.message);
      console.error(
        'If columns differ, add/adjust the insert in scripts/set-admin-password.cjs to match your schema.'
      );
      process.exit(1);
    }
    console.log('Inserted public.users row with role=admin');
  } else if (row.role !== 'admin') {
    const { error: upErr } = await admin.from('users').update({ role: 'admin' }).eq('id', userId);
    if (upErr) {
      console.error('public.users role update failed:', upErr.message);
      process.exit(1);
    }
    console.log('Updated public.users role to admin');
  } else {
    console.log('public.users already has role=admin');
  }

  console.log('\nDone. Log in at the admin panel with:');
  console.log('  Email:', EMAIL);
  console.log('  Password:', PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
