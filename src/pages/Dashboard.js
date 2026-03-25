// ============================================================
// Dashboard.js — Overview stats and recent activity
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { supabase } from '../supabaseClient';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [recentDisputes, setRecentDisputes] = useState([]);
  const [taskChartData, setTaskChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [
        { count: totalUsers },
        { count: totalTasks },
        { count: openDisputes },
        { count: totalProviders },
        { data: adminWallet },
        { data: tasks },
        { data: disputes },
        { data: recentTasksData },
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('tasks').select('*', { count: 'exact', head: true }),
        supabase.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'provider'),
        supabase.from('admin_wallet').select('*').single(),
        supabase.from('tasks').select('created_at, status').order('created_at', { ascending: true }).limit(100),
        supabase.from('disputes').select('id, reason, status, raised_at, task_id').eq('status', 'open').order('raised_at', { ascending: false }).limit(5),
        supabase.from('tasks').select('id, title, status, created_at, categories(name)').order('created_at', { ascending: false }).limit(5),
      ]);

      setStats({
        totalUsers: totalUsers || 0,
        totalTasks: totalTasks || 0,
        openDisputes: openDisputes || 0,
        totalProviders: totalProviders || 0,
        totalFees: adminWallet?.total_fees_collected || 0,
        escrowBalance: adminWallet?.escrow_balance || 0,
      });

      setRecentTasks(recentTasksData || []);
      setRecentDisputes(disputes || []);

      // Build chart data — tasks per day for last 14 days
      const chartData = buildChartData(tasks || []);
      setTaskChartData(chartData);

    } catch (error) {
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  }

  function buildChartData(tasks) {
    const days = {};
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      days[key] = { date: key, tasks: 0 };
    }
    tasks.forEach(task => {
      const d = new Date(task.created_at);
      const key = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      if (days[key]) days[key].tasks += 1;
    });
    return Object.values(days);
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  const STATUS_BADGE = {
    open: 'badge-open',
    bidding: 'badge-pending',
    bid_accepted: 'badge-pending',
    pending_review: 'badge-pending',
    completed: 'badge-resolved',
    disputed: 'badge-disputed',
    closed: 'badge-resolved',
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back. Here's what's happening on HelpingHandsAu.</p>
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon">👥</div>
          <div className="stat-card-label">Total users</div>
          <div className="stat-card-value blue">{stats?.totalUsers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">📋</div>
          <div className="stat-card-label">Total tasks</div>
          <div className="stat-card-value">{stats?.totalTasks}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">⚠️</div>
          <div className="stat-card-label">Open disputes</div>
          <div className="stat-card-value red">{stats?.openDisputes}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">💰</div>
          <div className="stat-card-label">Total fees collected</div>
          <div className="stat-card-value green">
            ${stats?.totalFees?.toFixed(2)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">🔒</div>
          <div className="stat-card-label">Escrow balance</div>
          <div className="stat-card-value orange">
            ${stats?.escrowBalance?.toFixed(2)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">💼</div>
          <div className="stat-card-label">Total providers</div>
          <div className="stat-card-value">{stats?.totalProviders}</div>
        </div>
      </div>

      {/* Task activity chart */}
      <div className="table-card" style={{ padding: '20px', marginBottom: 24 }}>
        <div className="table-card-header" style={{ paddingLeft: 0, paddingTop: 0 }}>
          <h3>Task activity — last 14 days</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={taskChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="tasks"
              stroke="#29ABE2"
              strokeWidth={2}
              dot={{ fill: '#29ABE2', r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Recent tasks */}
        <div className="table-card">
          <div className="table-card-header">
            <h3>Recent tasks</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#888' }}>
                    No tasks yet
                  </td>
                </tr>
              ) : recentTasks.map(task => (
                <tr key={task.id}>
                  <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                  </td>
                  <td>{task.categories?.name || '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[task.status] || 'badge-open'}`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="text-muted">{formatDate(task.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Open disputes */}
        <div className="table-card">
          <div className="table-card-header">
            <h3>Open disputes</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Reason</th>
                <th>Raised</th>
              </tr>
            </thead>
            <tbody>
              {recentDisputes.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: '#888' }}>
                    No open disputes 🎉
                  </td>
                </tr>
              ) : recentDisputes.map(dispute => (
                <tr key={dispute.id}>
                  <td className="text-muted" style={{ fontSize: 11 }}>
                    {dispute.task_id?.slice(0, 8)}...
                  </td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dispute.reason}
                  </td>
                  <td className="text-muted">{formatDate(dispute.raised_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
