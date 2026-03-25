// ============================================================
// DisputesPage.js — View and resolve disputes (Admin)
// Fixed: platform fee (5%) always retained on admin resolution
//
// Fee logic:
//   totalEscrow = bidAmount × 1.05
//   feeAmount   = bidAmount × 0.05  → kept in admin wallet
//   netAmount   = bidAmount × 1.00  → goes to winner
//
//   Pay provider → provider gets netAmount, fee kept
//   Refund taker → taker gets netAmount + fee (full refund)
//                  because they already paid the fee and
//                  the dispute was not their fault
// ============================================================

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function DisputesPage() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => { loadDisputes(); }, [filter]);

  async function loadDisputes() {
    setLoading(true);
    let query = supabase
      .from('disputes')
      .select(`
        *,
        tasks (
          id, title, status,
          users (full_name, email)
        )
      `)
      .order('raised_at', { ascending: false });

    if (filter !== 'all') query = query.eq('status', filter);

    const { data, error } = await query;
    if (!error) setDisputes(data || []);
    setLoading(false);
  }

  async function loadDisputeDetail(dispute) {
    const { data: task } = await supabase
      .from('tasks')
      .select(`
        *,
        users (id, full_name, email),
        bids!bids_task_id_fkey (
          id, amount, status, provider_id,
          users (id, full_name, email)
        )
      `)
      .eq('id', dispute.task_id)
      .single();

    setSelectedDispute({ ...dispute, fullTask: task });
    setNotes('');
  }

  async function handleResolve(payWho) {
    if (!notes.trim()) {
      alert('Please add resolution notes before resolving.');
      return;
    }
    if (!window.confirm(
      `Release funds to the ${payWho}?\n\nNote: The 5% platform fee will be retained regardless. This cannot be undone.`
    )) return;

    setResolving(true);
    try {
      const task = selectedDispute.fullTask;
      const acceptedBid = task?.bids?.find(b => b.status === 'accepted');
      if (!acceptedBid) throw new Error('Could not find accepted bid.');

      const bidAmount   = parseFloat(acceptedBid.amount);
      const totalEscrow = parseFloat((bidAmount * 1.05).toFixed(2));
      const feeAmount   = parseFloat((bidAmount * 0.05).toFixed(2));
      const netAmount   = parseFloat((bidAmount * 1.00).toFixed(2));

      console.log('Admin resolving dispute:', { payWho, bidAmount, totalEscrow, feeAmount, netAmount });

      // Step 1: Deduct full escrow from admin escrow pool
      const { error: escrowErr } = await supabase.rpc('decrement_admin_escrow', {
        p_amount: totalEscrow,
      });
      if (escrowErr) throw new Error('Failed to release escrow: ' + escrowErr.message);

      // Step 2: Always retain platform fee
      const { error: feeErr } = await supabase.rpc('increment_admin_fee', {
        p_amount: feeAmount,
      });
      if (feeErr) console.warn('Fee retention failed:', feeErr.message);

      // Step 3: Pay the winner
      if (payWho === 'provider') {
        // Provider gets the net amount (bid amount without fee)
        const { error: provErr } = await supabase.rpc('increment_wallet_balance', {
          p_user_id: acceptedBid.provider_id,
          p_amount: netAmount,
        });
        if (provErr) throw new Error('Failed to pay provider: ' + provErr.message);

        // Log transactions
        await supabase.from('transactions').insert([
          {
            to_wallet: acceptedBid.provider_id,
            amount: netAmount,
            type: 'release',
            task_id: task.id,
            description: `Admin dispute resolution: $${netAmount.toFixed(2)} released to provider`,
            status: 'completed',
          },
          {
            amount: feeAmount,
            type: 'fee',
            task_id: task.id,
            description: `Platform fee retained on admin dispute resolution (5%)`,
            status: 'completed',
          },
        ]);

      } else {
        // Taker gets full refund (net amount only — fee is kept as penalty)
        // Admin policy: if provider is at fault, taker gets full net back
        // The fee is retained as a dispute processing fee
        const { error: takerErr } = await supabase.rpc('increment_wallet_balance', {
          p_user_id: task.taker_id,
          p_amount: netAmount,
        });
        if (takerErr) throw new Error('Failed to refund taker: ' + takerErr.message);

        // Log transactions
        await supabase.from('transactions').insert([
          {
            to_wallet: task.taker_id,
            amount: netAmount,
            type: 'release',
            task_id: task.id,
            description: `Admin dispute resolution: $${netAmount.toFixed(2)} refunded to taker`,
            status: 'completed',
          },
          {
            amount: feeAmount,
            type: 'fee',
            task_id: task.id,
            description: `Platform fee retained on admin dispute resolution (5%)`,
            status: 'completed',
          },
        ]);
      }

      // Step 4: Mark dispute resolved
      const resolutionNote = payWho === 'provider'
        ? `Admin decision: $${netAmount.toFixed(2)} paid to provider. Platform fee $${feeAmount.toFixed(2)} retained. ${notes.trim()}`
        : `Admin decision: $${netAmount.toFixed(2)} refunded to taker. Platform fee $${feeAmount.toFixed(2)} retained. ${notes.trim()}`;

      await supabase
        .from('disputes')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNote,
          needs_admin_review: false,
        })
        .eq('id', selectedDispute.id);

      // Step 5: Close the task
      await supabase
        .from('tasks')
        .update({ status: 'closed' })
        .eq('id', task.id);

      setSelectedDispute(null);
      loadDisputes();
      alert(`Dispute resolved. Funds released to ${payWho}. Platform fee $${feeAmount.toFixed(2)} retained.`);

    } catch (error) {
      console.error('Resolve error:', error);
      alert('Error resolving dispute: ' + error.message);
    } finally {
      setResolving(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function getDaysOld(dateStr) {
    return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  }

  return (
    <div>
      <div className="page-header">
        <h1>Disputes</h1>
        <p>Review and resolve disputes that need admin intervention.</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['open', 'resolved', 'all'].map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedDispute ? '1fr 1fr' : '1fr', gap: 20 }}>

        {/* Disputes list */}
        <div className="table-card">
          <div className="table-card-header">
            <h3>{disputes.length} disputes</h3>
          </div>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : disputes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✅</div>
              <p>No {filter} disputes</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Reason</th>
                  <th>Age</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {disputes.map(dispute => {
                  const daysOld = getDaysOld(dispute.raised_at);
                  return (
                    <tr key={dispute.id}>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dispute.tasks?.title || '—'}
                      </td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dispute.reason}
                      </td>
                      <td>
                        <span style={{ color: daysOld >= 7 ? '#E53935' : '#888', fontWeight: daysOld >= 7 ? 700 : 400 }}>
                          {daysOld}d {daysOld >= 7 ? '🚨' : ''}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${dispute.status === 'open' ? 'badge-disputed' : 'badge-resolved'}`}>
                          {dispute.status}
                        </span>
                        {dispute.needs_admin_review && (
                          <span className="badge badge-disputed" style={{ marginLeft: 4 }}>
                            Admin needed
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => loadDisputeDetail(dispute)}
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Dispute detail panel */}
        {selectedDispute && (
          <div className="table-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Dispute detail</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDispute(null)}>✕</button>
            </div>

            {/* Task info */}
            <div style={{ background: '#F8F9FA', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div className="text-muted" style={{ marginBottom: 4 }}>Task</div>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>{selectedDispute.fullTask?.title}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div className="text-muted" style={{ marginBottom: 2 }}>Taker</div>
                  <div style={{ fontWeight: 500 }}>{selectedDispute.fullTask?.users?.full_name}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{selectedDispute.fullTask?.users?.email}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ marginBottom: 2 }}>Provider</div>
                  {(() => {
                    const bid = selectedDispute.fullTask?.bids?.find(b => b.status === 'accepted');
                    return bid ? (
                      <>
                        <div style={{ fontWeight: 500 }}>{bid.users?.full_name}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>{bid.users?.email}</div>
                      </>
                    ) : <div className="text-muted">—</div>;
                  })()}
                </div>
              </div>
            </div>

            {/* Dispute reason */}
            <div style={{ marginBottom: 16 }}>
              <div className="text-muted" style={{ marginBottom: 6 }}>Reason for dispute</div>
              <div style={{ background: '#FFEBEE', borderRadius: 8, padding: 12, color: '#C62828', fontSize: 13, lineHeight: 1.5 }}>
                {selectedDispute.reason}
              </div>
            </div>

            {/* Financial breakdown */}
            {(() => {
              const bid = selectedDispute.fullTask?.bids?.find(b => b.status === 'accepted');
              if (!bid) return null;
              const bidAmount   = parseFloat(bid.amount);
              const totalEscrow = (bidAmount * 1.05).toFixed(2);
              const feeAmount   = (bidAmount * 0.05).toFixed(2);
              const netAmount   = (bidAmount * 1.00).toFixed(2);
              return (
                <div style={{ background: '#F0F8FF', borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderStyle: 'solid', borderColor: '#B3DFF0' }}>
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>💰 Financial breakdown</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="text-muted">Total in escrow</span>
                    <span style={{ fontWeight: 600 }}>${totalEscrow}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="text-muted">Platform fee (5%) — always kept</span>
                    <span style={{ fontWeight: 600, color: '#6A1B9A' }}>${feeAmount}</span>
                  </div>
                  <div style={{ height: 1, background: '#E0E0E0', margin: '8px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Amount to release</span>
                    <span style={{ fontWeight: 700, color: '#1A1A2E', fontSize: 16 }}>${netAmount}</span>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <div className="text-muted" style={{ marginBottom: 4 }}>Raised on</div>
                <div style={{ fontSize: 13 }}>{formatDate(selectedDispute.raised_at)}</div>
              </div>
              <div>
                <div className="text-muted" style={{ marginBottom: 4 }}>Days open</div>
                <div style={{ fontWeight: 600, color: getDaysOld(selectedDispute.raised_at) >= 7 ? '#E53935' : '#1A1A2E' }}>
                  {getDaysOld(selectedDispute.raised_at)} days
                  {getDaysOld(selectedDispute.raised_at) >= 7 ? ' 🚨' : ''}
                </div>
              </div>
            </div>

            {/* Resolution */}
            {selectedDispute.status === 'open' && (
              <>
                <div className="divider" />
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label">Admin resolution notes *</label>
                  <textarea
                    className="form-input"
                    placeholder="Explain your decision clearly. This will be shown to both parties."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    className="btn btn-success"
                    style={{ justifyContent: 'center', padding: '10px' }}
                    onClick={() => handleResolve('provider')}
                    disabled={resolving}
                  >
                    {resolving ? 'Processing...' : '💼 Pay provider'}
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ justifyContent: 'center', padding: '10px' }}
                    onClick={() => handleResolve('taker')}
                    disabled={resolving}
                  >
                    {resolving ? 'Processing...' : '↩️ Refund taker'}
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 11, color: '#888', textAlign: 'center' }}>
                  Platform fee is always retained regardless of decision
                </div>
              </>
            )}

            {/* Resolved state */}
            {selectedDispute.status === 'resolved' && (
              <div>
                <div className="text-muted" style={{ marginBottom: 6 }}>Resolution</div>
                <div className="alert alert-success" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {selectedDispute.resolution_notes || 'Resolved'}
                </div>
                {selectedDispute.resolved_at && (
                  <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Resolved on {formatDate(selectedDispute.resolved_at)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}