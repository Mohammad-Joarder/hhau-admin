import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import { TaskStatusBadge, UserStatusBadge } from '../components/Badge';
import { formatAud, formatDateAu, daysOpen } from '../utils/format';
import Pagination from '../components/Pagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 20;

function escrowFromBid(bidAmount) {
  const b = parseFloat(bidAmount);
  return parseFloat((b * 1.05).toFixed(2));
}

export default function DisputesPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fullTask, setFullTask] = useState(null);
  const [messages, setMessages] = useState([]);
  const [notes, setNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [sort, setSort] = useState('oldest');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);

  const chip = searchParams.get('filter') || 'all';
  const needsActionUrl = searchParams.get('needsAction') === '1';

  useEffect(() => {
    if (needsActionUrl) {
      setSearchParams({ filter: 'needs_action' }, { replace: true });
    }
  }, [needsActionUrl, setSearchParams]);

  const effectiveFilter = needsActionUrl ? 'needs_action' : chip;

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('disputes').select(
        `
          *,
          tasks (
            id, title, status, category_id, taker_id,
            categories (name),
            users (id, full_name, email, status)
          )
        `
      );

      if (effectiveFilter === 'open') q = q.eq('status', 'open');
      else if (effectiveFilter === 'resolved') q = q.eq('status', 'resolved');
      else if (effectiveFilter === 'needs_action') q = q.eq('needs_admin_review', true).eq('status', 'open');
      else if (effectiveFilter === 'overdue') {
        const seven = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        q = q.eq('status', 'open').lt('raised_at', seven);
      }

      if (sort === 'oldest') q = q.order('raised_at', { ascending: true });
      else if (sort === 'newest') q = q.order('raised_at', { ascending: false });
      else q = q.order('raised_at', { ascending: false });

      const { data, error } = await q;
      if (error) throw error;

      let rows = data || [];

      if (debouncedSearch.trim()) {
        const s = debouncedSearch.toLowerCase();
        rows = rows.filter((d) => {
          const t = d.tasks?.title?.toLowerCase() || '';
          const tn = d.tasks?.users?.full_name?.toLowerCase() || '';
          return t.includes(s) || tn.includes(s);
        });
      }

      if (sort === 'value') {
        const withBid = await Promise.all(
          rows.map(async (d) => {
            const { data: bids } = await supabase
              .from('bids')
              .select('amount')
              .eq('task_id', d.task_id)
              .eq('status', 'accepted')
              .maybeSingle();
            return { d, amt: parseFloat(bids?.amount || 0) };
          })
        );
        withBid.sort((a, b) => b.amt - a.amt);
        rows = withBid.map((x) => x.d);
      }

      const from = (page - 1) * PAGE_SIZE;
      const slice = rows.slice(from, from + PAGE_SIZE);
      const enriched = await Promise.all(
        slice.map(async (d) => {
          const { data: b } = await supabase
            .from('bids')
            .select('amount, users (full_name)')
            .eq('task_id', d.task_id)
            .eq('status', 'accepted')
            .maybeSingle();
          return {
            ...d,
            _bidAmt: b?.amount ?? 0,
            _providerName: b?.users?.full_name,
          };
        })
      );
      setDisputes({ rows: enriched, total: rows.length });
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Failed to load disputes', 'error');
      setDisputes({ rows: [], total: 0, fullRows: [] });
    } finally {
      setLoading(false);
    }
  }, [effectiveFilter, sort, debouncedSearch, page, showToast]);

  useEffect(() => {
    loadDisputes();
  }, [loadDisputes]);

  useEffect(() => {
    const id = setInterval(loadDisputes, 60000);
    return () => clearInterval(id);
  }, [loadDisputes]);

  useEffect(() => {
    const ch = supabase
      .channel('disputes-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes' }, () => loadDisputes())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadDisputes]);

  async function openDetail(dispute) {
    setSelected(dispute);
    setDetailLoading(true);
    setNotes('');
    setMessages([]);
    setFullTask(null);
    try {
      const { data: task, error } = await supabase
        .from('tasks')
        .select(
          `
          *,
          users (id, full_name, email, status),
          categories (name),
          bids!bids_task_id_fkey (
            id, amount, status, provider_id,
            users (id, full_name, email, status)
          )
        `
        )
        .eq('id', dispute.task_id)
        .single();

      if (error) throw error;
      setFullTask(task);

      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('task_id', task.id)
        .limit(1);

      if (convs?.[0]?.id) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('body, created_at, sender_id')
          .eq('conversation_id', convs[0].id)
          .order('created_at', { ascending: false })
          .limit(5);
        setMessages((msgs || []).reverse());
      }

      const takerId = task.taker_id;
      const accepted = task.bids?.find((b) => b.status === 'accepted');
      const providerId = accepted?.provider_id;

      const [walletTaker, walletProv, tasksCount, bidsCount, provProfile] = await Promise.all([
        supabase.from('wallets').select('balance').eq('user_id', takerId).maybeSingle(),
        providerId
          ? supabase.from('wallets').select('balance').eq('user_id', providerId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('taker_id', takerId),
        providerId
          ? supabase.from('bids').select('*', { count: 'exact', head: true }).eq('provider_id', providerId)
          : Promise.resolve({ count: 0 }),
        providerId
          ? supabase.from('provider_profiles').select('*').eq('user_id', providerId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setFullTask({
        ...task,
        _walletTaker: walletTaker.data?.balance,
        _walletProv: walletProv.data?.balance,
        _tasksPosted: tasksCount.count,
        _bidsCount: bidsCount.count,
        _provProfile: provProfile.data,
      });
    } catch (e) {
      showToast(e.message || 'Failed to load dispute', 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  const acceptedBid = fullTask?.bids?.find((b) => b.status === 'accepted');
  const bidAmount = acceptedBid ? parseFloat(acceptedBid.amount) : 0;
  const totalEscrow = parseFloat((bidAmount * 1.05).toFixed(2));
  const feeAmount = parseFloat((bidAmount * 0.05).toFixed(2));
  const netAmount = parseFloat((bidAmount * 1.0).toFixed(2));

  async function executeResolve(payWho) {
    if (!selected || !fullTask || !acceptedBid) return;
    if (notes.trim().length < 20) {
      showToast('Resolution notes must be at least 20 characters.', 'error');
      return;
    }

    setResolving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: escrowErr } = await supabase.rpc('decrement_admin_escrow', {
        p_amount: totalEscrow,
      });
      if (escrowErr) throw new Error(escrowErr.message);

      const { error: feeErr } = await supabase.rpc('increment_admin_fee', {
        p_amount: feeAmount,
      });
      if (feeErr) throw new Error(feeErr.message);

      if (payWho === 'provider') {
        const { error: provErr } = await supabase.rpc('increment_wallet_balance', {
          p_user_id: acceptedBid.provider_id,
          p_amount: netAmount,
        });
        if (provErr) throw new Error(provErr.message);
      } else {
        const { error: takerErr } = await supabase.rpc('increment_wallet_balance', {
          p_user_id: fullTask.taker_id,
          p_amount: netAmount,
        });
        if (takerErr) throw new Error(takerErr.message);
      }

      await supabase.from('transactions').insert([
        {
          to_wallet: payWho === 'provider' ? acceptedBid.provider_id : fullTask.taker_id,
          amount: netAmount,
          type: 'release',
          task_id: fullTask.id,
          description: `Admin dispute resolution: ${formatAud(netAmount)} to ${payWho}`,
          status: 'completed',
        },
        {
          amount: feeAmount,
          type: 'fee',
          task_id: fullTask.id,
          description: 'Platform fee retained (5%)',
          status: 'completed',
        },
      ]);

      const resolutionNote = `${payWho === 'provider' ? 'Paid provider' : 'Refunded taker'} ${formatAud(netAmount)}. Fee retained ${formatAud(feeAmount)}. ${notes.trim()}`;

      const updatePayload = {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: resolutionNote,
        needs_admin_review: false,
      };
      if (user?.id) updatePayload.resolved_by = user.id;

      let up = await supabase.from('disputes').update(updatePayload).eq('id', selected.id);
      if (up.error?.message?.includes('resolved_by')) {
        delete updatePayload.resolved_by;
        up = await supabase.from('disputes').update(updatePayload).eq('id', selected.id);
      }
      if (up.error) throw new Error(up.error.message);

      await supabase.from('tasks').update({ status: 'closed' }).eq('id', fullTask.id);

      showToast('Dispute resolved successfully.', 'success');
      setConfirmModal(null);
      setSelected(null);
      setFullTask(null);
      loadDisputes();
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Resolution failed', 'error');
    } finally {
      setResolving(false);
    }
  }

  function setChip(next) {
    setPage(1);
    if (next === 'all') setSearchParams({});
    else setSearchParams({ filter: next });
  }

  const rows = disputes.rows || [];
  const total = disputes.total ?? 0;

  const urgencyClass = (d) => {
    if (d.needs_admin_review) return 'red';
    const days = daysOpen(d.raised_at);
    if (days > 5) return 'yellow';
    return 'green';
  };

  return (
    <div>
      <div className="page-header">
        <h1>Dispute management</h1>
        <p>Resolve escrow disputes quickly. Platform fee is always retained (5% of bid).</p>
      </div>

      <div className="filter-chip-row">
        {[
          ['all', 'All'],
          ['needs_action', 'Needs action'],
          ['open', 'Open'],
          ['resolved', 'Resolved'],
          ['overdue', 'Overdue (&gt;7 days)'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`filter-chip ${effectiveFilter === key ? 'active' : ''}`}
            onClick={() => setChip(key)}
          >
            {label}
          </button>
        ))}
        <span style={{ marginLeft: 12, fontSize: 12, color: '#888', alignSelf: 'center' }}>Sort</span>
        <select className="form-input form-select" style={{ width: 160 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
          <option value="value">Highest value</option>
        </select>
        <div className="search-bar" style={{ marginLeft: 'auto', width: 260 }}>
          <span>🔍</span>
          <input placeholder="Task or taker name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="split-40-60">
        <div className="table-card table-row-alt" style={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}>
          <div className="table-card-header">
            <h3>{total} disputes</h3>
          </div>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✅</div>
              <p>No disputes match filters</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Task</th>
                  <th>Parties</th>
                  <th>Days</th>
                  <th>Escrow</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const days = daysOpen(d.raised_at);
                  return (
                    <tr
                      key={d.id}
                      onClick={() => openDetail(d)}
                      style={{
                        cursor: 'pointer',
                        background: selected?.id === d.id ? '#E3F2FD' : undefined,
                      }}
                    >
                      <td style={{ width: 24 }}>
                        <span className={`urgency-dot ${urgencyClass(d)}`} title="Urgency" />
                      </td>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.tasks?.title || '—'}
                        {d.needs_admin_review && (
                          <div>
                            <span className="badge badge-pill-danger" style={{ marginTop: 4 }}>
                              NEEDS ACTION
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div>
                          {d.tasks?.users?.full_name || 'Taker'} vs {d._providerName || '—'}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: 18, color: days > 7 ? '#C62828' : '#1A1A2E' }}>{days}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatAud(escrowFromBid(parseFloat(d._bidAmt || 0)))}</td>
                      <td>
                        <span className={`badge ${d.status === 'open' ? 'badge-disputed' : 'badge-resolved'}`}>{d.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>

        <div className="table-card" style={{ minHeight: 400, padding: 20 }}>
          {!selected && <div className="empty-state">Select a dispute to view details</div>}

          {selected && detailLoading && <div className="loading">Loading detail...</div>}

          {selected && !detailLoading && fullTask && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, marginBottom: 6 }}>{fullTask.title}</h2>
                  <div className="text-muted">
                    {fullTask.categories?.name || '—'} · Raised {formatDateAu(selected.raised_at)}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <TaskStatusBadge status={fullTask.status} />{' '}
                    <span className="badge badge-pill-warn">{daysOpen(selected.raised_at)} days open</span>
                    {selected.needs_admin_review && <span className="badge badge-pill-danger">Needs admin</span>}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setFullTask(null); }}>
                  ✕
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <PartyCard
                  label="Taker"
                  user={fullTask.users}
                  wallet={fullTask._walletTaker}
                  extra={`Tasks posted: ${fullTask._tasksPosted ?? '—'}`}
                  onView={() => navigate(`/users?q=${encodeURIComponent(fullTask.users?.email || '')}`)}
                />
                <PartyCard
                  label="Provider"
                  user={acceptedBid?.users}
                  wallet={fullTask._walletProv}
                  extra={
                    fullTask._provProfile
                      ? `⭐ ${parseFloat(fullTask._provProfile.rating || 0).toFixed(1)} (${fullTask._provProfile.review_count || 0} reviews)`
                      : '—'
                  }
                  onView={() =>
                    acceptedBid?.users?.id && navigate(`/users?q=${encodeURIComponent(acceptedBid.users.email || '')}`)
                  }
                />
              </div>

              <div className="financial-highlight" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Financial breakdown</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>Total in escrow (bid × 1.05)</span>
                  <strong>{formatAud(totalEscrow)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>Platform fee (5%) — retained</span>
                  <strong style={{ color: '#6A1B9A' }}>{formatAud(feeAmount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span>Net distributable (bid × 1.00)</span>
                  <strong style={{ fontSize: 18 }}>{formatAud(netAmount)}</strong>
                </div>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>Split preview</div>
                <div className="split-bar">
                  <div className="split-bar-seg-fee" style={{ width: '5%' }} title="Fee" />
                  <div className="split-bar-seg-net" style={{ width: '95%' }} title="Winner" />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div className="form-label">Reason</div>
                <div style={{ background: '#FFEBEE', padding: 12, borderRadius: 8, color: '#C62828', lineHeight: 1.5 }}>{selected.reason}</div>
              </div>

              {(selected.proposed_resolution || selected.taker_split_percent != null) && (
                <div style={{ marginBottom: 12, fontSize: 13 }}>
                  <strong>Proposal:</strong> {selected.proposed_resolution || '—'}{' '}
                  {selected.taker_split_percent != null && <span>(taker split {selected.taker_split_percent}%)</span>}
                </div>
              )}

              <details style={{ marginBottom: 16 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Task conversation (last 5)</summary>
                <div style={{ marginTop: 10, maxHeight: 200, overflow: 'auto', fontSize: 13 }}>
                  {messages.length === 0 ? (
                    <p className="text-muted">No messages</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.created_at + m.sender_id} style={{ padding: 8, background: '#F8F9FA', borderRadius: 8, marginBottom: 6 }}>
                        {m.body}
                      </div>
                    ))
                  )}
                  <button type="button" className="text-link" onClick={() => navigate(`/tasks?view=${fullTask.id}`)}>
                    View full conversation →
                  </button>
                </div>
              </details>

              {selected.status === 'open' ? (
                <>
                  <label className="form-label">Resolution notes (min 20 chars)</label>
                  <textarea
                    className="form-input"
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Explain your decision for both parties..."
                  />
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {notes.trim().length}/20+ characters
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '14px', justifyContent: 'center', fontSize: 15 }}
                      disabled={resolving || !acceptedBid}
                      onClick={() => setConfirmModal({ payWho: 'provider' })}
                    >
                      💼 Pay provider ({formatAud(netAmount)})
                    </button>
                    <button
                      type="button"
                      className="btn btn-warning"
                      style={{ padding: '14px', justifyContent: 'center', fontSize: 15 }}
                      disabled={resolving || !acceptedBid}
                      onClick={() => setConfirmModal({ payWho: 'taker' })}
                    >
                      ↩️ Refund taker ({formatAud(netAmount)})
                    </button>
                  </div>
                </>
              ) : (
                <div className="alert alert-success">
                  ✅ Resolved
                  <div style={{ marginTop: 8, fontSize: 13 }}>{selected.resolution_notes}</div>
                  <div className="text-muted" style={{ marginTop: 8 }}>{formatDateAu(selected.resolved_at)}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        open={!!confirmModal}
        onClose={() => !resolving && setConfirmModal(null)}
        title={confirmModal?.payWho === 'provider' ? 'Confirm pay provider' : 'Confirm refund taker'}
        footer={
          <>
            <button type="button" className="btn btn-ghost" disabled={resolving} onClick={() => setConfirmModal(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={resolving}
              onClick={() => {
                if (notes.trim().length < 20) {
                  showToast('Resolution notes must be at least 20 characters.', 'error');
                  return;
                }
                executeResolve(confirmModal.payWho);
              }}
            >
              {resolving ? 'Processing...' : 'Confirm'}
            </button>
          </>
        }
      >
        {confirmModal && (
          <div style={{ lineHeight: 1.6 }}>
            <p>
              Release <strong>{formatAud(netAmount)}</strong> to the {confirmModal.payWho}. Platform retains{' '}
              <strong>{formatAud(feeAmount)}</strong>. Escrow release <strong>{formatAud(totalEscrow)}</strong>.
            </p>
            <p className="text-muted" style={{ fontSize: 12 }}>
              This cannot be undone.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PartyCard({ label, user, wallet, extra, onView }) {
  if (!user) return null;
  return (
    <div style={{ border: '1px solid #F0F0F0', borderRadius: 12, padding: 14, background: '#FAFAFA' }}>
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: '#29ABE2',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
          }}
        >
          {user.full_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>{user.full_name}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {user.email}
          </div>
        </div>
      </div>
      <UserStatusBadge status={user.status || 'active'} />
      <div style={{ marginTop: 8, fontSize: 13 }}>
        Wallet: <strong>{formatAud(wallet ?? 0)}</strong>
      </div>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
        {extra}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={onView}>
        View user
      </button>
    </div>
  );
}
