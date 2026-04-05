import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { supabase } from '../supabaseClient';
import StatsCard from '../components/StatsCard';
import { TaskStatusBadge } from '../components/Badge';
import { formatAud, timeAgo, startOfTodayUtc, startOfYesterdayUtc } from '../utils/format';
import { taskAmount } from '../utils/taskAmount';

function pctChange(cur, prev) {
  if (prev === 0 && cur === 0) return 0;
  if (prev === 0) return 100;
  return parseFloat((((cur - prev) / prev) * 100).toFixed(1));
}

const PIE_COLORS = ['#2E7D32', '#29ABE2', '#E65100', '#F9A825', '#1565C0', '#C62828', '#78909C'];

function acceptedBidAmount(bids) {
  if (!bids?.length) return 0;
  const acc = bids.find((b) => b.status === 'accepted');
  return acc ? parseFloat(acc.amount) : 0;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState({
    disputesAction: 0,
    tasksStuck: 0,
    largeTx: 0,
    bannedRecent: 0,
  });
  const [kpis, setKpis] = useState(null);
  const [chart30, setChart30] = useState([]);
  const [statusDist, setStatusDist] = useState([]);
  const [feedTasks, setFeedTasks] = useState([]);
  const [feedTx, setFeedTx] = useState([]);

  const loadAlerts = useCallback(async () => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    try {
      const [
        { count: disputesAction },
        { data: stuckRows },
        { count: largeTx },
        { count: bannedRecent },
      ] = await Promise.all([
        supabase
          .from('disputes')
          .select('*', { count: 'exact', head: true })
          .eq('needs_admin_review', true)
          .eq('status', 'open'),
        supabase
          .from('tasks')
          .select('id')
          .eq('status', 'pending_review')
          .lt('updated_at', since48h),
        supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', since24h)
          .gt('amount', 500),
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .in('status', ['banned', 'suspended'])
          .gte('updated_at', since24h),
      ]);
      setAlerts({
        disputesAction: disputesAction || 0,
        tasksStuck: stuckRows?.length || 0,
        largeTx: largeTx || 0,
        bannedRecent: bannedRecent || 0,
      });
    } catch (e) {
      console.error('Dashboard alerts', e);
    }
  }, []);

  const loadMain = useCallback(async () => {
    setLoading(true);
    const todayStart = startOfTodayUtc();
    const yStart = startOfYesterdayUtc();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const [
        { count: activeUsers },
        { count: tasksToday },
        { count: tasksYesterday },
        { data: completedTodayRows },
        { data: completedYestRows },
        { count: openDisputes },
        { data: adminWallet },
        { data: allTasksStatus },
        { data: completedMonth },
        { data: recentTasks },
        { data: recentTx },
      ] = await Promise.all([
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .in('role', ['taker', 'provider']),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).gte('created_at', yStart).lt('created_at', todayStart),
        supabase
          .from('tasks')
          .select('id, bids(amount, status)')
          .eq('status', 'completed')
          .gte('updated_at', todayStart),
        supabase
          .from('tasks')
          .select('id, bids(amount, status)')
          .eq('status', 'completed')
          .gte('updated_at', yStart)
          .lt('updated_at', todayStart),
        supabase.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('admin_wallet').select('*').single(),
        supabase.from('tasks').select('status'),
        supabase
          .from('tasks')
          .select('updated_at, bids(amount, status)')
          .eq('status', 'completed')
          .gte('updated_at', thirtyDaysAgo),
        supabase
          .from('tasks')
          .select('*, users(full_name), categories(name)')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('transactions')
          .select('id, type, amount, description, created_at, task_id, to_wallet')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const grossToday = (completedTodayRows || []).reduce((s, t) => s + acceptedBidAmount(t.bids), 0);
      const grossYesterday = (completedYestRows || []).reduce((s, t) => s + acceptedBidAmount(t.bids), 0);
      const feesToday = parseFloat((grossToday * 0.05).toFixed(2));
      const feesYesterday = parseFloat((grossYesterday * 0.05).toFixed(2));

      const escrow = parseFloat(adminWallet?.escrow_balance ?? 0);

      setKpis({
        activeUsers: activeUsers || 0,
        tasksToday: tasksToday || 0,
        tasksYesterday: tasksYesterday || 0,
        grossToday,
        grossYesterday,
        feesToday,
        feesYesterday,
        openDisputes: openDisputes || 0,
        escrow,
      });

      const dayKeys = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        dayKeys.push({
          key: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        });
      }
      const byDay = {};
      dayKeys.forEach(({ key }) => {
        byDay[key] = { date: key, label: dayKeys.find((k) => k.key === key)?.label, gross: 0, fee: 0 };
      });
      (completedMonth || []).forEach((t) => {
        const d = new Date(t.updated_at);
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        if (byDay[key]) {
          const g = acceptedBidAmount(t.bids);
          byDay[key].gross = parseFloat((byDay[key].gross + g).toFixed(2));
          byDay[key].fee = parseFloat((byDay[key].fee + g * 0.05).toFixed(2));
        }
      });
      setChart30(dayKeys.map(({ key }) => ({ ...byDay[key], name: byDay[key].label })));

      const dist = {};
      (allTasksStatus || []).forEach((r) => {
        dist[r.status] = (dist[r.status] || 0) + 1;
      });
      const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
      setStatusDist(
        Object.entries(dist).map(([name, value]) => ({
          name: name.replace(/_/g, ' '),
          value,
          fill: undefined,
          pctLabel: `${((value / total) * 100).toFixed(1)}%`,
        }))
      );

      setFeedTasks(recentTasks || []);
      setFeedTx(recentTx || []);
    } catch (e) {
      console.error('Dashboard load', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    loadMain();
  }, [loadAlerts, loadMain]);

  useEffect(() => {
    const id = setInterval(loadAlerts, 30000);
    return () => clearInterval(id);
  }, [loadAlerts]);

  useEffect(() => {
    const ch = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes' }, () => {
        loadAlerts();
        loadMain();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        loadAlerts();
        loadMain();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        loadAlerts();
        loadMain();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        loadAlerts();
        loadMain();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_wallet' }, () => loadMain())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadAlerts, loadMain]);

  const k = kpis;

  const txLabel = useMemo(
    () => ({
      topup: '💳',
      escrow: '🔒',
      release: '✅',
      fee: '💰',
      withdrawal: '🏦',
    }),
    []
  );

  if (loading && !k) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div>
      <div className="dashboard-maroon-band">
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>Operations overview with live signals</p>
        </div>

        <div className="alert-strip">
          <button
            type="button"
            className="alert-strip-item"
            onClick={() => navigate('/disputes?needsAction=1')}
          >
            🚨 Disputes needing action
            <span className="alert-strip-badge">{alerts.disputesAction}</span>
          </button>
          <button
            type="button"
            className="alert-strip-item"
            onClick={() => navigate('/tasks?stuck=1')}
          >
            ⏰ Tasks pending review &gt; 48h
            <span className="alert-strip-badge warn">{alerts.tasksStuck}</span>
          </button>
          <button
            type="button"
            className="alert-strip-item"
            onClick={() => navigate('/financial?large=1')}
          >
            💸 Large transactions (24h)
            <span className="alert-strip-badge muted">{alerts.largeTx}</span>
          </button>
          <button
            type="button"
            className="alert-strip-item"
            onClick={() => navigate('/users?recentModeration=1')}
          >
            🚫 Banned / suspended (24h)
            <span className="alert-strip-badge muted">{alerts.bannedRecent}</span>
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatsCard icon="👥" label="Active users (takers + providers)" value={k?.activeUsers ?? '—'} />
        <StatsCard
          icon="📋"
          label="Tasks created today"
          value={k?.tasksToday ?? 0}
          changePct={pctChange(k?.tasksToday ?? 0, k?.tasksYesterday ?? 0)}
        />
        <StatsCard
          icon="📈"
          label="Gross volume today"
          value={formatAud(k?.grossToday ?? 0)}
          changePct={pctChange(k?.grossToday ?? 0, k?.grossYesterday ?? 0)}
        />
        <StatsCard
          icon="💰"
          label="Platform fees today (5%)"
          value={formatAud(k?.feesToday ?? 0)}
          changePct={pctChange(k?.feesToday ?? 0, k?.feesYesterday ?? 0)}
        />
        <StatsCard icon="⚠️" label="Open disputes" value={k?.openDisputes ?? 0} />
        <StatsCard
          icon="🔒"
          label="Escrow balance"
          value={formatAud(k?.escrow ?? 0)}
          subValue="Held in admin wallet"
        />
      </div>

      <div className="charts-row">
        <div className="table-card" style={{ padding: '20px' }}>
          <div className="table-card-header" style={{ paddingLeft: 0, paddingTop: 0 }}>
            <h3>30-day gross volume &amp; platform fees</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chart30} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v) => formatAud(v)} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="gross" name="Gross volume" stroke="#29ABE2" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="fee" name="Platform fees" stroke="#6A1B9A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="table-card" style={{ padding: '20px' }}>
          <div className="table-card-header" style={{ paddingLeft: 0, paddingTop: 0 }}>
            <h3>Task status distribution</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusDist}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={2}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}
              >
                {statusDist.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="feed-row">
        <div className="table-card table-row-alt">
          <div className="table-card-header">
            <h3>Latest tasks</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Taker</th>
                <th>Category</th>
                <th>Min bid</th>
                <th>When</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {feedTasks.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-icon">📋</div>
                      <p>No tasks yet</p>
                    </div>
                  </td>
                </tr>
              ) : (
                feedTasks.map((task) => (
                  <tr key={task.id}>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.title}
                    </td>
                    <td>{task.users?.full_name || '—'}</td>
                    <td>{task.categories?.name || '—'}</td>
                    <td>{formatAud(taskAmount(task))}</td>
                    <td className="text-muted">{timeAgo(task.created_at)}</td>
                    <td>
                      <TaskStatusBadge status={task.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="table-card table-row-alt">
          <div className="table-card-header">
            <h3>Latest transactions</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
                <th>User</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {feedTx.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="empty-icon">💳</div>
                      <p>No transactions yet</p>
                    </div>
                  </td>
                </tr>
              ) : (
                feedTx.map((tx) => {
                  const isEscrow = tx.type === 'escrow';
                  const col = isEscrow ? '#E65100' : tx.type === 'fee' ? '#6A1B9A' : '#2E7D32';
                  return (
                    <tr key={tx.id}>
                      <td>
                        <span style={{ marginRight: 6 }}>{txLabel[tx.type] || '💳'}</span>
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{tx.type}</span>
                      </td>
                      <td className="text-muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.description || '—'}
                      </td>
                      <td style={{ fontWeight: 700, color: col }}>{formatAud(tx.amount)}</td>
                      <td className="text-muted">—</td>
                      <td className="text-muted">{timeAgo(tx.created_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
