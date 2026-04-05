import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { formatAud } from '../utils/format';
import { taskAmount } from '../utils/taskAmount';
import { useAdminGlobalRefresh } from '../hooks/useAdminGlobalRefresh';

const PRESETS = [
  { id: '7d', days: 7, label: 'Last 7 days' },
  { id: '30d', days: 30, label: 'Last 30 days' },
  { id: '90d', days: 90, label: 'Last 90 days' },
  { id: 'ytd', days: null, label: 'This year' },
];

function startOfYear() {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString();
}

export default function AnalyticsPage() {
  const { showToast } = useToast();
  const [preset, setPreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [userSeries, setUserSeries] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [categories, setCategories] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [geo, setGeo] = useState([]);
  const [growth, setGrowth] = useState({ u: 0, t: 0, r: 0, avg: 0 });

  const range = useMemo(() => {
    const now = new Date();
    const end = now.toISOString();
    if (preset === 'custom' && customFrom && customTo) {
      return { start: new Date(customFrom).toISOString(), end: new Date(customTo).toISOString() };
    }
    if (preset === 'ytd') return { start: startOfYear(), end };
    const p = PRESETS.find((x) => x.id === preset);
    const days = p?.days ?? 30;
    const s = new Date(now);
    s.setDate(s.getDate() - days);
    return { start: s.toISOString(), end };
  }, [preset, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = range;
      const prevLen = new Date(end) - new Date(start);
      const prevStart = new Date(new Date(start).getTime() - prevLen).toISOString();

      const [
        { data: usersCur },
        { data: usersPrev },
        { data: tasksCur },
        { data: tasksPrev },
        { data: tasksAll },
        { data: catRows },
      ] = await Promise.all([
        supabase.from('users').select('created_at, role').gte('created_at', start).lte('created_at', end),
        supabase.from('users').select('id').gte('created_at', prevStart).lt('created_at', start),
        supabase.from('tasks').select('id, created_at, status').gte('created_at', start).lte('created_at', end),
        supabase.from('tasks').select('id').gte('created_at', prevStart).lt('created_at', start),
        supabase.from('tasks').select('*').gte('created_at', start),
        supabase.from('categories').select('id, name'),
      ]);

      const uc = (usersCur || []).length;
      const up = (usersPrev || []).length;
      const tc = (tasksCur || []).length;
      const tp = (tasksPrev || []).length;

      const feeRows = await supabase
        .from('transactions')
        .select('amount, created_at')
        .eq('type', 'fee')
        .gte('created_at', start)
        .lte('created_at', end);
      const revCur = (feeRows.data || []).reduce((a, x) => a + parseFloat(x.amount || 0), 0);
      const feePrev = await supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'fee')
        .gte('created_at', prevStart)
        .lt('created_at', start);
      const revPrev = (feePrev.data || []).reduce((a, x) => a + parseFloat(x.amount || 0), 0);

      const pct = (c, p) => (p === 0 ? (c > 0 ? 100 : 0) : parseFloat((((c - p) / p) * 100).toFixed(1)));
      const tasksForAvg = tasksCur || [];
      const avgBid =
        tasksForAvg.length > 0
          ? tasksForAvg.reduce((a, x) => a + taskAmount(x), 0) / tasksForAvg.length
          : 0;
      setGrowth({
        u: pct(uc, up),
        t: pct(tc, tp),
        r: pct(revCur, revPrev),
        avg: parseFloat(avgBid.toFixed(2)),
      });

      const byDay = {};
      const addDay = (iso, key) => {
        const d = new Date(iso);
        d.setHours(0, 0, 0, 0);
        const k = d.toISOString().slice(0, 10);
        if (!byDay[k]) byDay[k] = { date: k, takers: 0, providers: 0 };
        byDay[k][key] += 1;
      };
      (usersCur || []).forEach((u) => {
        if (u.role === 'taker') addDay(u.created_at, 'takers');
        if (u.role === 'provider') addDay(u.created_at, 'providers');
      });
      setUserSeries(Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)));

      const T = tasksAll || [];
      const posted = T.length;
      const withBid = T.filter((x) => x.status !== 'open').length;
      const accepted = T.filter((x) => ['bid_accepted', 'pending_review', 'completed', 'disputed', 'closed'].includes(x.status)).length;
      const completed = T.filter((x) => x.status === 'completed').length;
      const disputed = T.filter((x) => x.status === 'disputed').length;
      const rate = (a, b) => (b === 0 ? 0 : ((a / b) * 100).toFixed(1));
      setFunnel([
        { stage: 'Posted', count: posted, rate: '100' },
        { stage: 'Bid received', count: withBid, rate: rate(withBid, posted) },
        { stage: 'Accepted', count: accepted, rate: rate(accepted, withBid) },
        { stage: 'Completed', count: completed, rate: rate(completed, accepted) },
        { stage: 'Disputed', count: disputed, rate: rate(disputed, posted) },
      ]);

      const catMap = {};
      (catRows || []).forEach((c) => {
        catMap[c.id] = { name: c.name, tasks: 0, sumBid: 0, completed: 0, disputed: 0, revenue: 0 };
      });
      T.forEach((t) => {
        const c = catMap[t.category_id];
        if (!c) return;
        c.tasks += 1;
        c.sumBid += taskAmount(t);
        if (t.status === 'completed') c.completed += 1;
        if (t.status === 'disputed') c.disputed += 1;
      });
      const feeByTask = await supabase
        .from('transactions')
        .select('amount, task_id')
        .eq('type', 'fee')
        .gte('created_at', start)
        .lte('created_at', end);
      (feeByTask.data || []).forEach((f) => {
        const task = T.find((x) => x.id === f.task_id);
        if (task && catMap[task.category_id]) {
          catMap[task.category_id].revenue += parseFloat(f.amount || 0);
        }
      });
      const catTable = Object.entries(catMap).map(([id, v]) => ({
        id,
        ...v,
        avgBid: v.tasks ? parseFloat((v.sumBid / v.tasks).toFixed(2)) : 0,
        completionRate: v.tasks ? ((v.completed / v.tasks) * 100).toFixed(1) : '0',
        disputeRate: v.tasks ? ((v.disputed / v.tasks) * 100).toFixed(1) : '0',
      }));
      catTable.sort((a, b) => b.revenue - a.revenue);
      setCategories(catTable);

      const { data: releases } = await supabase
        .from('transactions')
        .select('amount, to_wallet')
        .eq('type', 'release')
        .gte('created_at', start)
        .lte('created_at', end);
      const earnBy = {};
      (releases || []).forEach((tx) => {
        const id = tx.to_wallet;
        if (!id) return;
        earnBy[id] = (earnBy[id] || 0) + parseFloat(tx.amount || 0);
      });
      const topIds = Object.entries(earnBy)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([uid]) => uid);
      const provStats = await Promise.all(
        topIds.map(async (uid) => {
          const { data: u } = await supabase
            .from('users')
            .select('id, full_name, provider_profiles (rating, review_count)')
            .eq('id', uid)
            .maybeSingle();
          const { count: done } = await supabase
            .from('bids')
            .select('*', { count: 'exact', head: true })
            .eq('provider_id', uid)
            .eq('status', 'accepted');
          return {
            id: uid,
            name: u?.full_name || '—',
            rating: parseFloat(u?.provider_profiles?.rating || 0),
            reviews: u?.provider_profiles?.review_count || 0,
            tasks: done || 0,
            earnings: parseFloat((earnBy[uid] || 0).toFixed(2)),
          };
        })
      );
      setLeaders(provStats);

      const locMap = {};
      T.forEach((t) => {
        const L = (t.location || 'Unknown').slice(0, 80);
        if (!locMap[L]) locMap[L] = { location: L, count: 0, sum: 0 };
        locMap[L].count += 1;
        locMap[L].sum += taskAmount(t);
      });
      const geoRows = Object.values(locMap)
        .map((x) => ({ ...x, avg: x.count ? parseFloat((x.sum / x.count).toFixed(2)) : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setGeo(geoRows);
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Analytics failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [range, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  useAdminGlobalRefresh(load, [load]);

  return (
    <div>
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Growth, funnel, categories, and providers</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`filter-chip ${preset === p.id ? 'active' : ''}`}
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`filter-chip ${preset === 'custom' ? 'active' : ''}`}
          onClick={() => setPreset('custom')}
        >
          Custom
        </button>
        {preset === 'custom' && (
          <>
            <input type="date" className="form-input" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" className="form-input" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading analytics...</div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label">User growth</div>
              <div className="stat-card-value">{growth.u}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Task volume growth</div>
              <div className="stat-card-value blue">{growth.t}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Revenue growth (fees)</div>
              <div className="stat-card-value green">{growth.r}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Avg min bid (period)</div>
              <div className="stat-card-value">{formatAud(growth.avg)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            <div className="table-card" style={{ padding: 16 }}>
              <h3 style={{ marginBottom: 12 }}>User signups (takers vs providers)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={userSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="takers" stroke="#6A1B9A" name="Takers" dot={false} />
                  <Line type="monotone" dataKey="providers" stroke="#29ABE2" name="Providers" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="table-card" style={{ padding: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Task funnel (period)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={funnel}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3D1F2D" radius={[4, 4, 0, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="table-card table-row-alt" style={{ marginBottom: 24 }}>
            <div className="table-card-header">
              <h3>Category performance</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Tasks</th>
                  <th>Avg min bid</th>
                  <th>Completion %</th>
                  <th>Dispute %</th>
                  <th>Revenue (fees)</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.tasks}</td>
                    <td>{formatAud(c.avgBid)}</td>
                    <td>{c.completionRate}%</td>
                    <td>{c.disputeRate}%</td>
                    <td>{formatAud(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-card table-row-alt" style={{ marginBottom: 24 }}>
            <div className="table-card-header">
              <h3>Top providers (by earnings in range)</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Accepted tasks</th>
                  <th>Earnings</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>{p.tasks}</td>
                    <td>{formatAud(p.earnings)}</td>
                    <td>
                      ⭐ {p.rating.toFixed(1)} ({p.reviews})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-card table-row-alt">
            <div className="table-card-header">
              <h3>Geographic insights (task.location)</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Tasks</th>
                  <th>Avg min bid</th>
                </tr>
              </thead>
              <tbody>
                {geo.map((g) => (
                  <tr key={g.location}>
                    <td>{g.location}</td>
                    <td>{g.count}</td>
                    <td>{formatAud(g.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
