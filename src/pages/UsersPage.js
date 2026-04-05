import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import SlideOver from '../components/SlideOver';
import Modal from '../components/Modal';
import { RoleBadge, UserStatusBadge, TaskStatusBadge } from '../components/Badge';
import { formatAud, formatDateAu } from '../utils/format';
import Pagination from '../components/Pagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAdminGlobalRefresh } from '../hooks/useAdminGlobalRefresh';
import { PROVIDER_STRIPE_COLUMN } from '../config/schema';
import { taskAmount } from '../utils/taskAmount';

const PAGE_SIZE = 20;

const PROVIDER_PROFILE_SELECT = (() => {
  const cols = ['rating', 'review_count', 'skills', 'completion_rate'];
  if (PROVIDER_STRIPE_COLUMN) cols.push(PROVIDER_STRIPE_COLUMN);
  return cols.join(', ');
})();

export default function UsersPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [slideUser, setSlideUser] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('tasks');
  const [statusModal, setStatusModal] = useState(null);
  const [reason, setReason] = useState('');
  const [walletModal, setWalletModal] = useState(null);
  const [walletDelta, setWalletDelta] = useState('');
  const [walletReason, setWalletReason] = useState('');
  const [summary, setSummary] = useState(null);

  const recentMod = searchParams.get('recentModeration') === '1';

  const loadSummary = useCallback(async () => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ count: totalU }, { count: takers }, { count: providers }, { count: activeToday }, { count: newWeek }] =
      await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'taker'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'provider'),
        supabase.from('users').select('*', { count: 'exact', head: true }).gte('updated_at', since24h).eq('status', 'active'),
        supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      ]);
    setSummary({
      total: totalU || 0,
      takers: takers || 0,
      providers: providers || 0,
      activeToday: activeToday || 0,
      newWeek: newWeek || 0,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('users')
        .select(
          `id, full_name, email, role, status, created_at,
           wallets (balance),
           provider_profiles (${PROVIDER_PROFILE_SELECT})`,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false });

      if (roleFilter !== 'all') q = q.eq('role', roleFilter);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (recentMod) {
        q = q.in('status', ['banned', 'suspended']).gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      }

      if (debouncedSearch.trim()) {
        const raw = debouncedSearch.trim();
        q = q.or(`full_name.ilike.%${raw}%,email.ilike.%${raw}%`);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (u) => {
          const { count: tc } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('taker_id', u.id);
          const { count: bc } = await supabase
            .from('bids')
            .select('*', { count: 'exact', head: true })
            .eq('provider_id', u.id);
          return { ...u, _taskCount: u.role === 'taker' ? tc || 0 : undefined, _bidCount: u.role === 'provider' ? bc || 0 : undefined };
        })
      );

      setUsers(enriched);
      setTotal(count ?? 0);
    } catch (e) {
      showToast(e.message || 'Failed to load users', 'error');
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter, debouncedSearch, page, recentMod, showToast]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      load();
      loadSummary();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load, loadSummary]);

  useAdminGlobalRefresh(() => {
    load();
    loadSummary();
  }, [load, loadSummary]);

  async function openSlide(u) {
    setSlideUser(u);
    setDetail(null);
    setTab(u.role === 'taker' ? 'tasks' : u.role === 'provider' ? 'bids' : 'transactions');
    const [tasksRes, bidsRes, txRes, takerTasks, provBids] = await Promise.all([
      supabase.from('tasks').select('*').eq('taker_id', u.id).order('created_at', { ascending: false }).limit(30),
      supabase
        .from('bids')
        .select('id, amount, status, created_at, tasks!bids_task_id_fkey(title)')
        .eq('provider_id', u.id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('transactions').select('*').or(`to_wallet.eq.${u.id},from_wallet.eq.${u.id}`).order('created_at', { ascending: false }).limit(20),
      supabase.from('tasks').select('id').eq('taker_id', u.id),
      supabase.from('bids').select('task_id').eq('provider_id', u.id).eq('status', 'accepted'),
    ]);

    const taskIdSet = new Set();
    (takerTasks.data || []).forEach((t) => taskIdSet.add(t.id));
    (provBids.data || []).forEach((b) => taskIdSet.add(b.task_id));
    const taskIds = [...taskIdSet];
    let disputesList = [];
    if (taskIds.length) {
      const { data: drows } = await supabase.from('disputes').select('id, status, reason, raised_at, task_id').in('task_id', taskIds).limit(30);
      disputesList = drows || [];
    }

    let spent = 0;
    let earned = 0;
    (txRes.data || []).forEach((t) => {
      const amt = parseFloat(t.amount || 0);
      if (t.to_wallet === u.id && t.type === 'release') earned += amt;
      if (t.type === 'escrow' && t.from_wallet === u.id) spent += amt;
    });

    setDetail({
      tasks: tasksRes.data || [],
      bids: bidsRes.data || [],
      txs: txRes.data || [],
      disputes: disputesList,
      spent: parseFloat(spent.toFixed(2)),
      earned: parseFloat(earned.toFixed(2)),
    });
  }

  async function applyStatus(next) {
    if (!statusModal) return;
    if ((next === 'suspended' || next === 'banned') && !reason.trim()) {
      showToast('Reason is required', 'error');
      return;
    }
    try {
      const { error } = await supabase
        .from('users')
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq('id', statusModal.id);
      if (error) throw error;
      showToast('User updated', 'success');
      setStatusModal(null);
      setReason('');
      load();
      if (slideUser?.id === statusModal.id) openSlide({ ...slideUser, status: next });
    } catch (e) {
      showToast(e.message || 'Failed', 'error');
    }
  }

  async function applyWallet() {
    if (!walletModal) return;
    const delta = parseFloat(walletDelta);
    if (Number.isNaN(delta) || delta === 0) {
      showToast('Enter a non-zero amount', 'error');
      return;
    }
    if (!walletReason.trim()) {
      showToast('Reason required', 'error');
      return;
    }
    try {
      const rpc = delta > 0 ? 'increment_wallet_balance' : 'decrement_wallet_balance';
      const { error } = await supabase.rpc(rpc, {
        p_user_id: walletModal.id,
        p_amount: Math.abs(parseFloat(delta.toFixed(2))),
      });
      if (error) throw error;
      showToast('Wallet adjusted', 'success');
      setWalletModal(null);
      setWalletDelta('');
      setWalletReason('');
      load();
      if (slideUser?.id === walletModal.id) openSlide(slideUser);
    } catch (e) {
      showToast(e.message || 'Wallet RPC failed', 'error');
    }
  }

  const stripeLabel = (p) => {
    if (!p) return 'Not linked';
    if (PROVIDER_STRIPE_COLUMN) {
      return p[PROVIDER_STRIPE_COLUMN] ? 'Linked' : 'Not linked';
    }
    return '—';
  };

  return (
    <div>
      <div className="page-header">
        <h1>User management</h1>
        <p>Accounts, wallets, and moderation</p>
      </div>

      {summary && (
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-card-label">Total users</div>
            <div className="stat-card-value">{summary.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Takers</div>
            <div className="stat-card-value blue">{summary.takers}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Providers</div>
            <div className="stat-card-value">{summary.providers}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Active (updated 24h)</div>
            <div className="stat-card-value green">{summary.activeToday}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">New (7 days)</div>
            <div className="stat-card-value">{summary.newWeek}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        {['all', 'taker', 'provider'].map((r) => (
          <button
            key={r}
            type="button"
            className={`filter-chip ${roleFilter === r ? 'active' : ''}`}
            onClick={() => {
              setRoleFilter(r);
              setPage(1);
            }}
          >
            {r}
          </button>
        ))}
        {['all', 'active', 'suspended', 'banned'].map((s) => (
          <button
            key={s}
            type="button"
            className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
          >
            {s}
          </button>
        ))}
        <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
          <span>🔍</span>
          <input
            placeholder="Name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="table-card table-row-alt">
        <div className="table-card-header">
          <h3>Users</h3>
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <p>No users</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Avatar</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Balance</th>
                <th>Tasks/Bids</th>
                <th>Rating</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: '#29ABE2',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {u.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  </td>
                  <td>
                    <strong>{u.full_name}</strong>
                  </td>
                  <td className="text-muted">{u.email}</td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td>
                    <UserStatusBadge status={u.status} />
                  </td>
                  <td>{formatAud(u.wallets?.balance ?? 0)}</td>
                  <td>
                    {u.role === 'taker' && `${u._taskCount ?? 0} tasks`}
                    {u.role === 'provider' && `${u._bidCount ?? 0} bids`}
                    {u.role === 'admin' && '—'}
                  </td>
                  <td>
                    {u.role === 'provider' ? `⭐ ${parseFloat(u.provider_profiles?.rating || 0).toFixed(1)}` : '—'}
                  </td>
                  <td className="text-muted">{formatDateAu(u.created_at, { withTime: false })}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSlide(u)}>
                      👁️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>

      <SlideOver
        open={!!slideUser}
        onClose={() => {
          setSlideUser(null);
          setDetail(null);
        }}
        title={slideUser?.full_name || 'User'}
        width={520}
      >
        {slideUser && (
          <div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: '#29ABE2',
                  color: '#fff',
                  fontSize: 22,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {slideUser.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{slideUser.full_name}</div>
                <div className="text-muted">{slideUser.email}</div>
                <div style={{ marginTop: 6 }}>
                  <RoleBadge role={slideUser.role} /> <UserStatusBadge status={slideUser.status} />
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Joined {formatDateAu(slideUser.created_at)}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div className="stat-card" style={{ padding: 12 }}>
                <div className="stat-card-label">Wallet</div>
                <div className="stat-card-value">{formatAud(slideUser.wallets?.balance ?? 0)}</div>
              </div>
              <div className="stat-card" style={{ padding: 12 }}>
                <div className="stat-card-label">{slideUser.role === 'provider' ? 'Earned (approx)' : 'Spent (approx)'}</div>
                <div className="stat-card-value">
                  {formatAud(slideUser.role === 'provider' ? detail?.earned ?? 0 : detail?.spent ?? 0)}
                </div>
              </div>
            </div>

            {slideUser.role === 'provider' && (
              <div style={{ background: '#F8F9FA', padding: 12, borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Provider</div>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  Stripe Connect: {stripeLabel(slideUser.provider_profiles)}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Completion: {slideUser.provider_profiles?.completion_rate ?? '—'}% · Skills:{' '}
                  {Array.isArray(slideUser.provider_profiles?.skills)
                    ? slideUser.provider_profiles.skills.join(', ')
                    : slideUser.provider_profiles?.skills || '—'}
                </div>
              </div>
            )}

            <div className="filter-chip-row" style={{ marginBottom: 12 }}>
              {slideUser.role === 'taker' && (
                <button type="button" className={`filter-chip ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
                  Tasks
                </button>
              )}
              {slideUser.role === 'provider' && (
                <button type="button" className={`filter-chip ${tab === 'bids' ? 'active' : ''}`} onClick={() => setTab('bids')}>
                  Bids
                </button>
              )}
              <button type="button" className={`filter-chip ${tab === 'transactions' ? 'active' : ''}`} onClick={() => setTab('transactions')}>
                Transactions
              </button>
              <button type="button" className={`filter-chip ${tab === 'disputes' ? 'active' : ''}`} onClick={() => setTab('disputes')}>
                Disputes
              </button>
            </div>

            {!detail ? (
              <div className="loading">Loading activity...</div>
            ) : (
              <div style={{ fontSize: 13 }}>
                {tab === 'tasks' &&
                  detail.tasks.map((t) => (
                    <div key={t.id} style={{ padding: 8, background: '#FAFAFA', borderRadius: 8, marginBottom: 6 }}>
                      {t.title} · <TaskStatusBadge status={t.status} /> · {formatAud(taskAmount(t))}
                    </div>
                  ))}
                {tab === 'bids' &&
                  detail.bids.map((b) => (
                    <div key={b.id} style={{ padding: 8, background: '#FAFAFA', borderRadius: 8, marginBottom: 6 }}>
                      {b.tasks?.title} · {formatAud(b.amount)} · {b.status}
                    </div>
                  ))}
                {tab === 'transactions' &&
                  detail.txs.map((t) => (
                    <div key={t.id} className="text-muted" style={{ marginBottom: 6 }}>
                      {t.type} {formatAud(t.amount)} · {formatDateAu(t.created_at)}
                    </div>
                  ))}
                {tab === 'disputes' &&
                  (detail.disputes.length === 0 ? (
                    <p className="text-muted">No disputes</p>
                  ) : (
                    detail.disputes.map((d) => (
                      <div key={d.id} style={{ marginBottom: 8 }}>
                        {d.status} · {d.reason?.slice(0, 80)}
                      </div>
                    ))
                  ))}
              </div>
            )}

            {slideUser.role !== 'admin' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                <button type="button" className="btn btn-success" onClick={() => setStatusModal({ ...slideUser, next: 'active' })}>
                  ✅ Activate
                </button>
                <button type="button" className="btn btn-warning" onClick={() => setStatusModal({ ...slideUser, next: 'suspended' })}>
                  ⏸️ Suspend
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setStatusModal({ ...slideUser, next: 'banned' })}>
                  🚫 Ban
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setWalletModal(slideUser)}>
                  Adjust wallet balance
                </button>
                <button type="button" className="btn btn-ghost" disabled title="Coming soon">
                  Send notification (soon)
                </button>
              </div>
            )}
          </div>
        )}
      </SlideOver>

      <Modal
        open={!!statusModal}
        onClose={() => {
          setStatusModal(null);
          setReason('');
        }}
        title="Update user status"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setStatusModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => applyStatus(statusModal.next)}>
              Confirm
            </button>
          </>
        }
      >
        <p>
          Set <strong>{statusModal?.full_name}</strong> to <strong>{statusModal?.next}</strong>
        </p>
        {(statusModal?.next === 'suspended' || statusModal?.next === 'banned') && (
          <div className="form-group">
            <label className="form-label">Reason</label>
            <textarea className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!walletModal}
        onClose={() => setWalletModal(null)}
        title="Adjust wallet (RPC)"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setWalletModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={applyWallet}>
              Apply
            </button>
          </>
        }
      >
        <p className="text-muted" style={{ fontSize: 12 }}>
          Positive = credit, negative = debit. Uses increment/decrement_wallet_balance.
        </p>
        <div className="form-group">
          <label className="form-label">Amount (AUD)</label>
          <input className="form-input" type="number" step="0.01" value={walletDelta} onChange={(e) => setWalletDelta(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Reason</label>
          <textarea className="form-input" value={walletReason} onChange={(e) => setWalletReason(e.target.value)} rows={2} />
        </div>
      </Modal>
    </div>
  );
}
