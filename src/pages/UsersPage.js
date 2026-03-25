// ============================================================
// UsersPage.js — View and manage all users
// Admin can ban or suspend users
// ============================================================

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userTasks, setUserTasks] = useState([]);

  useEffect(() => { loadUsers(); }, [roleFilter]);

  async function loadUsers() {
    setLoading(true);
    let query = supabase
      .from('users')
      .select(`
        *,
        wallets (balance),
        provider_profiles (rating, review_count)
      `)
      .order('created_at', { ascending: false });

    if (roleFilter !== 'all') query = query.eq('role', roleFilter);

    const { data, error } = await query;
    if (!error) setUsers(data || []);
    setLoading(false);
  }

  async function loadUserDetail(user) {
    setSelectedUser(user);

    // Load user's tasks or bids based on role
    if (user.role === 'taker') {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, status, created_at')
        .eq('taker_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      setUserTasks(data || []);
    } else {
      const { data } = await supabase
        .from('bids')
        .select('id, amount, status, created_at, tasks!bids_task_id_fkey(title)')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      setUserTasks(data || []);
    }
  }

  async function updateUserStatus(userId, status) {
    const action = status === 'banned' ? 'ban' : status === 'suspended' ? 'suspend' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) return;

    await supabase
      .from('users')
      .update({ status })
      .eq('id', userId);

    loadUsers();
    if (selectedUser?.id === userId) {
      setSelectedUser(prev => ({ ...prev, status }));
    }
  }

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(s) ||
      u.email?.toLowerCase().includes(s)
    );
  });

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  const STATUS_BADGE = {
    active: 'badge-active',
    banned: 'badge-banned',
    suspended: 'badge-suspended',
  };

  const ROLE_BADGE = {
    taker: 'badge-taker',
    provider: 'badge-provider',
    admin: 'badge-admin',
  };

  return (
    <div>
      <div className="page-header">
        <h1>Users</h1>
        <p>Manage all user accounts on the platform.</p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div className="search-bar">
          <span>🔍</span>
          <input
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'taker', 'provider', 'admin'].map(r => (
            <button
              key={r}
              className={`btn btn-sm ${roleFilter === r ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setRoleFilter(r)}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 360px' : '1fr', gap: 20 }}>
        {/* Users table */}
        <div className="table-card">
          <div className="table-card-header">
            <h3>{filteredUsers.length} users</h3>
          </div>
          {loading ? (
            <div className="loading">Loading users...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <div className="empty-icon">👥</div>
                        <p>No users found</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.map(user => (
                  <tr
                    key={user.id}
                    style={{ cursor: 'pointer', background: selectedUser?.id === user.id ? '#F0F8FF' : '' }}
                    onClick={() => loadUserDetail(user)}
                  >
                    <td><strong>{user.full_name || '—'}</strong></td>
                    <td className="text-muted">{user.email}</td>
                    <td>
                      <span className={`badge ${ROLE_BADGE[user.role] || 'badge-active'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td>${user.wallets?.balance?.toFixed(2) || '0.00'}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[user.status || 'active'] || 'badge-active'}`}>
                        {user.status || 'active'}
                      </span>
                    </td>
                    <td className="text-muted">{formatDate(user.created_at)}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={e => { e.stopPropagation(); loadUserDetail(user); }}
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* User detail panel */}
        {selectedUser && (
          <div className="table-card" style={{ padding: 24, height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>User detail</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUser(null)}>✕</button>
            </div>

            {/* Avatar and name */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: '#29ABE2',
                color: '#fff', fontSize: 22, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 10px',
              }}>
                {selectedUser.full_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedUser.full_name}</div>
              <div className="text-muted">{selectedUser.email}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'center' }}>
                <span className={`badge ${ROLE_BADGE[selectedUser.role]}`}>{selectedUser.role}</span>
                <span className={`badge ${STATUS_BADGE[selectedUser.status || 'active']}`}>
                  {selectedUser.status || 'active'}
                </span>
              </div>
            </div>

            <div className="divider" />

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#F8F9FA', borderRadius: 8, padding: 12 }}>
                <div className="text-muted" style={{ marginBottom: 4 }}>Wallet balance</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#2E7D32' }}>
                  ${selectedUser.wallets?.balance?.toFixed(2) || '0.00'}
                </div>
              </div>
              {selectedUser.role === 'provider' && (
                <div style={{ background: '#F8F9FA', borderRadius: 8, padding: 12 }}>
                  <div className="text-muted" style={{ marginBottom: 4 }}>Rating</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>
                    ⭐ {selectedUser.provider_profiles?.rating?.toFixed(1) || 'New'}
                  </div>
                </div>
              )}
            </div>

            {/* Recent activity */}
            {userTasks.length > 0 && (
              <>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                  {selectedUser.role === 'taker' ? 'Recent tasks' : 'Recent bids'}
                </div>
                {userTasks.map(item => (
                  <div key={item.id} style={{
                    padding: '8px 12px', background: '#F8F9FA',
                    borderRadius: 8, marginBottom: 6, fontSize: 12,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>
                      {item.title || item.tasks?.title || '—'}
                    </div>
                    <div className="text-muted">
                      {item.status} · {formatDate(item.created_at)}
                      {item.amount && ` · $${item.amount}`}
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="divider" />

            {/* Actions */}
            {selectedUser.role !== 'admin' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedUser.status !== 'active' && (
                  <button
                    className="btn btn-success"
                    style={{ justifyContent: 'center' }}
                    onClick={() => updateUserStatus(selectedUser.id, 'active')}
                  >
                    ✅ Activate user
                  </button>
                )}
                {selectedUser.status !== 'suspended' && (
                  <button
                    className="btn btn-warning"
                    style={{ justifyContent: 'center' }}
                    onClick={() => updateUserStatus(selectedUser.id, 'suspended')}
                  >
                    ⏸ Suspend user
                  </button>
                )}
                {selectedUser.status !== 'banned' && (
                  <button
                    className="btn btn-danger"
                    style={{ justifyContent: 'center' }}
                    onClick={() => updateUserStatus(selectedUser.id, 'banned')}
                  >
                    🚫 Ban user
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
