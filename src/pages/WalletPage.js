import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { formatAud, formatDateAu } from '../utils/format';
import Pagination from '../components/Pagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAdminGlobalRefresh } from '../hooks/useAdminGlobalRefresh';

const PAGE_SIZE = 20;

export default function WalletPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [adminWallet, setAdminWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [feeDaily, setFeeDaily] = useState([]);
  const [cumulative, setCumulative] = useState([]);
  const [monthFeeTotal, setMonthFeeTotal] = useState(0);

  const largeOnly = searchParams.get('large') === '1';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: wallet } = await supabase.from('admin_wallet').select('*').single();
      setAdminWallet(wallet);

      const monthStartIso = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data: monthFees } = await supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'fee')
        .gte('created_at', monthStartIso);
      const mtot = (monthFees || []).reduce((a, t) => a + parseFloat(t.amount || 0), 0);
      setMonthFeeTotal(parseFloat(mtot.toFixed(2)));

      const { data: allFees } = await supabase
        .from('transactions')
        .select('amount, created_at')
        .eq('type', 'fee')
        .order('created_at', { ascending: true });

      const byDay = {};
      (allFees || []).forEach((tx) => {
        const d = new Date(tx.created_at);
        d.setHours(0, 0, 0, 0);
        const k = d.toISOString().slice(0, 10);
        byDay[k] = (byDay[k] || 0) + parseFloat(tx.amount || 0);
      });
      const keys = Object.keys(byDay).sort();
      const last30 = keys.slice(-30);
      setFeeDaily(last30.map((k) => ({ name: k.slice(5), fees: parseFloat(byDay[k].toFixed(2)) })));

      let run = 0;
      setCumulative(
        keys.map((k) => {
          run += byDay[k];
          return { name: k.slice(5), revenue: parseFloat(run.toFixed(2)) };
        })
      );

      let q = supabase
        .from('transactions')
        .select(`id, type, amount, description, created_at, task_id, from_wallet, to_wallet, tasks (title)`, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (typeFilter !== 'all') q = q.eq('type', typeFilter);
      if (dateFrom) q = q.gte('created_at', new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        q = q.lte('created_at', end.toISOString());
      }
      if (amountMin !== '') q = q.gte('amount', parseFloat(amountMin));
      if (amountMax !== '') q = q.lte('amount', parseFloat(amountMax));
      if (largeOnly) q = q.gt('amount', 500);

      if (debouncedSearch.trim()) {
        const raw = debouncedSearch.trim();
        q = q.ilike('description', `%${raw}%`);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      setTransactions(data || []);
      setTotal(count ?? 0);
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Failed to load financial data', 'error');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, dateFrom, dateTo, amountMin, amountMax, debouncedSearch, page, largeOnly, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  useAdminGlobalRefresh(load, [load]);

  function exportCsv() {
    const headers = ['Type', 'Task', 'From', 'To', 'Amount', 'Date', 'Stripe ref', 'Description'];
    const lines = [headers.join(',')];
    transactions.forEach((tx) => {
      lines.push(
        [
          tx.type,
          `"${(tx.tasks?.title || '').replace(/"/g, '""')}"`,
          tx.from_wallet || '',
          tx.to_wallet || '',
          tx.amount,
          tx.created_at,
          '',
          `"${(tx.description || '').replace(/"/g, '""')}"`,
        ].join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hhau-transactions-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded (current page)', 'success');
  }

  const totalFees = adminWallet?.total_fees_collected ?? adminWallet?.total_fees ?? 0;

  return (
    <div>
      <div className="page-header">
        <h1>Financial overview</h1>
        <p>Platform wallet, fees, and full transaction history</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">Platform balance</div>
          <div className="stat-card-value blue">{formatAud(adminWallet?.balance ?? 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Escrow held</div>
          <div className="stat-card-value orange">{formatAud(adminWallet?.escrow_balance ?? 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total fees (all time)</div>
          <div className="stat-card-value green">{formatAud(totalFees)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Net fee revenue (this month, loaded page)</div>
          <div className="stat-card-value">{formatAud(monthFeeTotal)}</div>
          <div className="stat-card-sub">All fee-type transactions this calendar month</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="table-card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Daily fees (last 30 days with activity)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={feeDaily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v) => formatAud(v)} />
              <Bar dataKey="fees" fill="#29ABE2" radius={[4, 4, 0, 0]} name="Fees" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="table-card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Cumulative fee revenue</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cumulative}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v) => formatAud(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#3D1F2D" strokeWidth={2} dot={false} name="Cumulative" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="table-card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Stripe payout</h3>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Platform Stripe balance and payouts must be loaded via a Supabase Edge Function (secret key stays server-side). Placeholder
          until the function is deployed.
        </p>
        <button type="button" className="btn btn-ghost" disabled>
          Trigger manual payout (soon)
        </button>
      </div>

      <div className="table-card" style={{ marginBottom: 12 }}>
        <div className="table-card-header">
          <h3>Filters</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={exportCsv}>
            Export CSV (page)
          </button>
        </div>
        <div style={{ padding: '0 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <select className="form-input form-select" style={{ width: 140 }} value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="all">All types</option>
            <option value="topup">topup</option>
            <option value="escrow">escrow</option>
            <option value="release">release</option>
            <option value="fee">fee</option>
            <option value="withdrawal">withdrawal</option>
          </select>
          <input type="date" className="form-input" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          <input type="date" className="form-input" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          <input type="number" className="form-input" placeholder="Min $" value={amountMin} onChange={(e) => { setAmountMin(e.target.value); setPage(1); }} style={{ width: 100 }} />
          <input type="number" className="form-input" placeholder="Max $" value={amountMax} onChange={(e) => { setAmountMax(e.target.value); setPage(1); }} style={{ width: 100 }} />
          <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
            <span>🔍</span>
            <input placeholder="Description or task title" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          {largeOnly && (
            <button type="button" className="btn btn-warning btn-sm" onClick={() => { setSearchParams({}); setPage(1); }}>
              Clear large filter
            </button>
          )}
        </div>
      </div>

      <div className="table-card table-row-alt">
        <div className="table-card-header">
          <h3>Transactions</h3>
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Task</th>
                <th>From</th>
                <th>To</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Stripe</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-icon">💳</div>
                      <p>No transactions</p>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.type}</td>
                    <td className="text-muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.tasks?.title || '—'}
                    </td>
                    <td className="text-muted" style={{ fontSize: 11 }}>
                      {tx.from_wallet?.slice(0, 8) || '—'}
                    </td>
                    <td className="text-muted" style={{ fontSize: 11 }}>
                      {tx.to_wallet?.slice(0, 8) || '—'}
                    </td>
                    <td style={{ fontWeight: 700 }}>{formatAud(tx.amount)}</td>
                    <td className="text-muted">{formatDateAu(tx.created_at)}</td>
                    <td className="text-muted" style={{ fontSize: 11 }}>—</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}
