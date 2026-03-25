// ============================================================
// WalletPage.js — Platform revenue and transaction overview
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { supabase } from '../supabaseClient';

export default function WalletPage() {
  const [adminWallet, setAdminWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [feeChartData, setFeeChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txFilter, setTxFilter] = useState('all');

  useEffect(() => { loadWalletData(); }, []);

  async function loadWalletData() {
    setLoading(true);
    try {
      const [
        { data: wallet },
        { data: txs },
      ] = await Promise.all([
        supabase.from('admin_wallet').select('*').single(),
        supabase
          .from('transactions')
          .select('*, tasks(title)')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      setAdminWallet(wallet);
      setTransactions(txs || []);
      setFeeChartData(buildFeeChartData(txs || []));
    } catch (error) {
      console.error('Wallet load error:', error);
    } finally {
      setLoading(false);
    }
  }

  function buildFeeChartData(txs) {
    const weeks = {};
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const key = `Week ${8 - i}`;
      weeks[key] = { week: key, fees: 0, volume: 0 };
    }
    txs.forEach(tx => {
      const d = new Date(tx.created_at);
      const weekDiff = Math.floor((now - d) / (1000 * 60 * 60 * 24 * 7));
      if (weekDiff <= 7) {
        const key = `Week ${8 - weekDiff}`;
        if (weeks[key]) {
          if (tx.type === 'fee') weeks[key].fees += parseFloat(tx.amount || 0);
          if (tx.type === 'escrow') weeks[key].volume += parseFloat(tx.amount || 0);
        }
      }
    });
    return Object.values(weeks);
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const TX_LABELS = {
    topup: { label: 'Top up', color: '#2E7D32', icon: '💳' },
    escrow: { label: 'Into escrow', color: '#E65100', icon: '🔒' },
    release: { label: 'Payment release', color: '#29ABE2', icon: '✅' },
    fee: { label: 'Platform fee', color: '#6A1B9A', icon: '💰' },
    withdrawal: { label: 'Withdrawal', color: '#1565C0', icon: '🏦' },
  };

  const filteredTxs = txFilter === 'all'
    ? transactions
    : transactions.filter(tx => tx.type === txFilter);

  if (loading) return <div className="loading">Loading wallet data...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Platform Wallet</h1>
        <p>Revenue, fees, and transaction history.</p>
      </div>

      {/* Wallet stat cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon">💰</div>
          <div className="stat-card-label">Total fees collected</div>
          <div className="stat-card-value green">
            ${adminWallet?.total_fees_collected?.toFixed(2) || '0.00'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">🔒</div>
          <div className="stat-card-label">Current escrow</div>
          <div className="stat-card-value orange">
            ${adminWallet?.escrow_balance?.toFixed(2) || '0.00'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">🏦</div>
          <div className="stat-card-label">Admin balance</div>
          <div className="stat-card-value blue">
            ${adminWallet?.balance?.toFixed(2) || '0.00'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">📊</div>
          <div className="stat-card-label">Total transactions</div>
          <div className="stat-card-value">{transactions.length}</div>
        </div>
      </div>

      {/* Fee + volume chart */}
      <div className="table-card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="table-card-header" style={{ paddingLeft: 0, paddingTop: 0 }}>
          <h3>Weekly fees & volume</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={feeChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
            <Bar dataKey="fees" fill="#29ABE2" name="Fees" radius={[4, 4, 0, 0]} />
            <Bar dataKey="volume" fill="#E8F6FD" name="Volume" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Transaction history */}
      <div className="table-card">
        <div className="table-card-header">
          <h3>Transaction history</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'fee', 'escrow', 'release', 'topup', 'withdrawal'].map(f => (
              <button
                key={f}
                className={`btn btn-sm ${txFilter === f ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTxFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>Task</th>
              <th>Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredTxs.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <div className="empty-icon">💳</div>
                    <p>No transactions yet</p>
                  </div>
                </td>
              </tr>
            ) : filteredTxs.map(tx => {
              const style = TX_LABELS[tx.type] || TX_LABELS.topup;
              return (
                <tr key={tx.id}>
                  <td>
                    <span style={{ fontSize: 16, marginRight: 6 }}>{style.icon}</span>
                    <span style={{ color: style.color, fontWeight: 600, fontSize: 12 }}>
                      {style.label}
                    </span>
                  </td>
                  <td className="text-muted">{tx.description || '—'}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>
                    {tx.tasks?.title
                      ? tx.tasks.title.length > 30
                        ? tx.tasks.title.substring(0, 30) + '...'
                        : tx.tasks.title
                      : '—'}
                  </td>
                  <td style={{ fontWeight: 700, color: style.color }}>
                    ${parseFloat(tx.amount || 0).toFixed(2)}
                  </td>
                  <td className="text-muted">{formatDate(tx.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
