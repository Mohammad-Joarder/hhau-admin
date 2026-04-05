import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import { formatAud } from '../utils/format';
import { taskAmount } from '../utils/taskAmount';

const EMOJI_PICK = ['🔧', '🧹', '🚗', '💻', '🌿', '🐕', '📦', '⚡', '🔑', '🎨', '🍳', '✂️', '🏠', '🪜', '💡', '🧰'];

export default function CategoriesPage() {
  const { showToast } = useToast();
  const [categories, setCategories] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', icon_url: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState(null);
  const [hasDisplayOrder, setHasDisplayOrder] = useState(true);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      let { data, error: err } = await supabase.from('categories').select('*').order('display_order', { ascending: true });
      if (err?.message?.includes('display_order')) {
        setHasDisplayOrder(false);
        const r = await supabase.from('categories').select('*').order('name');
        data = r.data;
        err = r.error;
      }
      if (err) throw err;
      const cats = data || [];
      setCategories(cats);

      const { data: tasks } = await supabase
        .from('tasks')
        .select('*, bids(amount, status)');

      const m = {};
      cats.forEach((c) => {
        m[c.id] = { tasks: 0, revenue: 0 };
      });
      (tasks || []).forEach((t) => {
        if (!m[t.category_id]) return;
        m[t.category_id].tasks += 1;
        if (t.status === 'completed') {
          const acc = t.bids?.find((b) => b.status === 'accepted');
          m[t.category_id].revenue += parseFloat(acc?.amount || taskAmount(t) || 0);
        }
      });
      Object.keys(m).forEach((k) => {
        m[k].revenue = parseFloat(m[k].revenue.toFixed(2));
      });
      setMeta(m);
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const s = search.toLowerCase();
    return categories.filter((c) => c.name?.toLowerCase().includes(s));
  }, [categories, search]);

  function openAddModal() {
    setEditingCategory(null);
    setForm({ name: '', description: '', icon_url: '' });
    setError('');
    setShowModal(true);
  }

  function openEditModal(category) {
    setEditingCategory(category);
    setForm({
      name: category.name || '',
      description: category.description || '',
      icon_url: category.icon_url || '',
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Category name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        icon_url: form.icon_url.trim(),
      };
      if (hasDisplayOrder && !editingCategory) {
        const max = categories.reduce((a, c) => Math.max(a, c.display_order ?? 0), 0);
        payload.display_order = max + 1;
      }
      if (editingCategory) {
        const { error: uerr } = await supabase.from('categories').update(payload).eq('id', editingCategory.id);
        if (uerr) throw uerr;
      } else {
        const { error: ierr } = await supabase.from('categories').insert({ ...payload, is_active: true });
        if (ierr) throw ierr;
      }
      setShowModal(false);
      loadCategories();
      showToast('Saved', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(category) {
    if (!window.confirm(`Toggle active state for "${category.name}"?`)) return;
    const { error } = await supabase.from('categories').update({ is_active: !category.is_active }).eq('id', category.id);
    if (error) showToast(error.message, 'error');
    else loadCategories();
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', category.id);
    if (error) showToast('Cannot delete — tasks may reference this category.', 'error');
    else loadCategories();
  }

  async function persistOrder(nextList) {
    if (!hasDisplayOrder) {
      showToast('Add display_order column in Supabase to enable reorder.', 'error');
      return;
    }
    setCategories(nextList);
    for (let i = 0; i < nextList.length; i++) {
      await supabase.from('categories').update({ display_order: i }).eq('id', nextList[i].id);
    }
    showToast('Order saved', 'success');
  }

  function onDrop(e, targetId) {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const list = [...categories];
    const from = list.findIndex((c) => c.id === dragId);
    const to = list.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const [row] = list.splice(from, 1);
    list.splice(to, 0, row);
    persistOrder(list);
    setDragId(null);
  }

  if (loading) return <div className="loading">Loading categories...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Categories</h1>
        <p>Organise categories, counts, and revenue</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ width: 280 }}>
          <span>🔍</span>
          <input placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary" onClick={openAddModal}>
          + Add category
        </button>
        {!hasDisplayOrder && <span className="text-muted">Tip: add numeric column display_order for drag-sort</span>}
      </div>

      <div className="table-card table-row-alt">
        <div className="table-card-header">
          <h3>{filtered.length} categories</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }} />
              <th>Icon</th>
              <th>Name</th>
              <th>Tasks</th>
              <th>Revenue (completed)</th>
              <th>Order</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-icon">🏷️</div>
                    <p>No categories</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((cat) => (
                <tr
                  key={cat.id}
                  draggable={hasDisplayOrder}
                  onDragStart={() => setDragId(cat.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, cat.id)}
                  style={{ cursor: hasDisplayOrder ? 'grab' : 'default' }}
                >
                  <td className="text-muted">⋮⋮</td>
                  <td style={{ fontSize: 22 }}>{cat.icon_url || '—'}</td>
                  <td>
                    <strong>{cat.name}</strong>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {cat.description}
                    </div>
                  </td>
                  <td>{meta[cat.id]?.tasks ?? 0}</td>
                  <td>{formatAud(meta[cat.id]?.revenue ?? 0)}</td>
                  <td>{cat.display_order ?? '—'}</td>
                  <td>
                    <span className={`badge ${cat.is_active ? 'badge-active' : 'badge-banned'}`}>{cat.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEditModal(cat)}>
                        ✏️
                      </button>
                      <button type="button" className={`btn btn-sm ${cat.is_active ? 'btn-warning' : 'btn-success'}`} onClick={() => toggleActive(cat)}>
                        {cat.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteCategory(cat)}>
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} title={editingCategory ? 'Edit category' : 'Add category'} onClose={() => setShowModal(false)}>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Icon (emoji)</label>
            <input className="form-input" value={form.icon_url} onChange={(e) => setForm({ ...form, icon_url: e.target.value })} placeholder="Pick below or type" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {EMOJI_PICK.map((em) => (
                <button key={em} type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, icon_url: em })}>
                  {em}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
