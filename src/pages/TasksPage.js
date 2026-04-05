import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import SlideOver from '../components/SlideOver';
import Modal from '../components/Modal';
import { TaskStatusBadge } from '../components/Badge';
import { formatAud, formatDateAu } from '../utils/format';
import Pagination from '../components/Pagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAdminGlobalRefresh } from '../hooks/useAdminGlobalRefresh';
import { taskAmount } from '../utils/taskAmount';

const PAGE_SIZE = 20;
const STATUSES = ['open', 'bidding', 'bid_accepted', 'pending_review', 'completed', 'disputed', 'closed'];

export default function TasksPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [slideTask, setSlideTask] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [closeModal, setCloseModal] = useState(null);
  const [statusCounts, setStatusCounts] = useState({});
  const [weekStats, setWeekStats] = useState({ thisW: 0, lastW: 0 });
  const [avgValue, setAvgValue] = useState(0);

  const stuck = searchParams.get('stuck') === '1';
  const viewId = searchParams.get('view');

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCategories(data || []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startThis = new Date(now);
      startThis.setDate(startThis.getDate() - 7);
      const startLast = new Date(startThis);
      startLast.setDate(startLast.getDate() - 7);

      const countPromises = STATUSES.map((s) =>
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', s)
      );
      const [allMinRes, thisWRes, lastWRes, ...statusCountRes] = await Promise.all([
        supabase.from('tasks').select('*'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).gte('created_at', startThis.toISOString()),
        supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startLast.toISOString())
          .lt('created_at', startThis.toISOString()),
        ...countPromises,
      ]);

      const counts = {};
      STATUSES.forEach((s, i) => {
        counts[s] = statusCountRes[i]?.count || 0;
      });
      setStatusCounts(counts);
      setWeekStats({ thisW: thisWRes.count || 0, lastW: lastWRes.count || 0 });
      const list = allMinRes.data || [];
      const avg =
        list.length > 0
          ? list.reduce((a, r) => a + taskAmount(r), 0) / list.length
          : 0;
      setAvgValue(parseFloat(avg.toFixed(2)));

      let q = supabase
        .from('tasks')
        .select(
          `*, users (full_name, email),
           categories (name),
           bids (id)`,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false });

      if (stuck) {
        const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        q = q.eq('status', 'pending_review').lt('updated_at', since48h);
      }

      if (statusFilter.length) q = q.in('status', statusFilter);
      if (categoryId) q = q.eq('category_id', categoryId);
      if (dateFrom) q = q.gte('created_at', new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        q = q.lte('created_at', end.toISOString());
      }

      if (debouncedSearch.trim()) {
        const raw = debouncedSearch.trim();
        q = q.ilike('title', `%${raw}%`);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;

      setTasks(data || []);
      setTotal(count ?? 0);
    } catch (e) {
      showToast(e.message || 'Failed to load tasks', 'error');
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, stuck, statusFilter, categoryId, dateFrom, dateTo, debouncedSearch, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  useAdminGlobalRefresh(load, [load]);

  useEffect(() => {
    if (!viewId) return;
    (async () => {
      const { data } = await supabase.from('tasks').select('id, title').eq('id', viewId).maybeSingle();
      if (data) openSlide(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openSlide stable enough for deep-link
  }, [viewId]);

  async function openSlide(task) {
    setSlideTask(task);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          `
          *,
          users (full_name, email),
          categories (name),
          bids (id, amount, status, created_at, users (full_name))
        `
        )
        .eq('id', task.id)
        .single();
      if (error) throw error;

      const { count: convCount } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id);

      const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .eq('task_id', task.id)
        .order('created_at', { ascending: false });

      setDetail({ ...data, _convCount: convCount, _txs: txs || [] });
    } catch (e) {
      showToast(e.message || 'Failed to load task', 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function softDelete(task) {
    try {
      const { error } = await supabase.from('tasks').update({ status: 'closed' }).eq('id', task.id);
      if (error) throw error;
      showToast('Task closed.', 'success');
      setCloseModal(null);
      setSlideTask(null);
      load();
    } catch (e) {
      showToast(e.message || 'Failed', 'error');
    }
  }

  function toggleStatus(s) {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    setPage(1);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Task management</h1>
        <p>Full visibility across the task lifecycle</p>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-card-label">Avg min bid (all tasks)</div>
          <div className="stat-card-value">{formatAud(avgValue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Created this week</div>
          <div className="stat-card-value blue">{weekStats.thisW}</div>
          <div className="stat-card-sub">Last week: {weekStats.lastW}</div>
        </div>
      </div>

      <div className="filter-chip-row">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`filter-chip ${statusFilter.includes(s) ? 'active' : ''}`}
            onClick={() => toggleStatus(s)}
          >
            {s.replace(/_/g, ' ')} ({statusCounts[s] ?? 0})
          </button>
        ))}
        {stuck && <span className="badge badge-pill-warn">Stuck filter on</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <select className="form-input form-select" style={{ width: 200 }} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input type="date" className="form-input" style={{ width: 150 }} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
        <input type="date" className="form-input" style={{ width: 150 }} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <span>🔍</span>
          <input placeholder="Title or taker..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-card table-row-alt">
        <div className="table-card-header">
          <h3>Tasks</h3>
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p>No tasks found</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Taker</th>
                <th>Status</th>
                <th>Min bid</th>
                <th>Bids</th>
                <th>Created</th>
                <th>Deadline</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</td>
                  <td>{t.categories?.name || '—'}</td>
                  <td>{t.users?.full_name || '—'}</td>
                  <td>
                    <TaskStatusBadge status={t.status} />
                  </td>
                  <td>{formatAud(taskAmount(t))}</td>
                  <td>{t.bids?.length ?? 0}</td>
                  <td className="text-muted">{formatDateAu(t.created_at, { withTime: false })}</td>
                  <td className="text-muted">{t.deadline ? formatDateAu(t.deadline, { withTime: false }) : '—'}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSlide(t)}>
                      👁️
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setCloseModal(t)}>
                      🗑️
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
        open={!!slideTask}
        onClose={() => {
          setSlideTask(null);
          setDetail(null);
          setSearchParams({});
        }}
        title={slideTask?.title || 'Task'}
        width={480}
      >
        {detailLoading && <div className="loading">Loading...</div>}
        {detail && !detailLoading && (
          <div style={{ fontSize: 14 }}>
            <p className="text-muted">{detail.categories?.name}</p>
            <p style={{ lineHeight: 1.5 }}>{detail.description || '—'}</p>
            <div style={{ marginTop: 12 }}>
              <strong>Location:</strong> {detail.location || '—'}
            </div>
            <div style={{ marginTop: 8 }}>
              <strong>Deadline:</strong> {detail.deadline ? formatDateAu(detail.deadline) : '—'}
            </div>
            <div style={{ marginTop: 8 }}>
              <strong>Budget / guide:</strong> {formatAud(taskAmount(detail))}
            </div>
            {Array.isArray(detail.photos) && detail.photos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {detail.photos.map((url, i) => (
                  <img key={i} src={url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
                ))}
              </div>
            )}
            <h4 style={{ marginTop: 20 }}>Bids</h4>
            {(detail.bids || []).map((b) => (
              <div key={b.id} style={{ padding: 8, background: '#F8F9FA', borderRadius: 8, marginBottom: 6 }}>
                {formatAud(b.amount)} · {b.status} · {b.users?.full_name}
              </div>
            ))}
            <div className="text-muted" style={{ marginTop: 12 }}>
              Conversations: {detail._convCount ?? 0}
            </div>
            <h4 style={{ marginTop: 16 }}>Payment history</h4>
            {(detail._txs || []).length === 0 ? (
              <p className="text-muted">None</p>
            ) : (
              detail._txs.map((tx) => (
                <div key={tx.id} className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  {tx.type} {formatAud(tx.amount)} · {formatDateAu(tx.created_at)}
                </div>
              ))
            )}
          </div>
        )}
      </SlideOver>

      <Modal
        open={!!closeModal}
        onClose={() => setCloseModal(null)}
        title="Close task?"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCloseModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={() => closeModal && softDelete(closeModal)}>
              Set status to closed
            </button>
          </>
        }
      >
        This soft-closes the task (status = closed). Confirm for “{closeModal?.title}”.
      </Modal>
    </div>
  );
}
