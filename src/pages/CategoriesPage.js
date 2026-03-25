// ============================================================
// CategoriesPage.js — Manage task categories
// Add, edit, enable/disable categories
// ============================================================

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', icon_url: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');
    if (!error) setCategories(data || []);
    setLoading(false);
  }

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
    if (!form.name.trim()) { setError('Category name is required.'); return; }
    setSaving(true);
    setError('');

    try {
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update({ name: form.name.trim(), description: form.description.trim(), icon_url: form.icon_url.trim() })
          .eq('id', editingCategory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({ name: form.name.trim(), description: form.description.trim(), icon_url: form.icon_url.trim(), is_active: true });
        if (error) throw error;
      }
      setShowModal(false);
      loadCategories();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(category) {
    await supabase
      .from('categories')
      .update({ is_active: !category.is_active })
      .eq('id', category.id);
    loadCategories();
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Delete category "${category.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', category.id);
    if (error) alert('Cannot delete — tasks are using this category.');
    else loadCategories();
  }

  if (loading) return <div className="loading">Loading categories...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Categories</h1>
        <p>Manage task categories shown to users in the app.</p>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <h3>{categories.length} categories</h3>
          <button className="btn btn-primary" onClick={openAddModal}>
            + Add category
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <div className="empty-icon">🏷️</div>
                    <p>No categories yet. Add your first one.</p>
                  </div>
                </td>
              </tr>
            ) : categories.map(cat => (
              <tr key={cat.id}>
                <td>
                  <strong>{cat.name}</strong>
                </td>
                <td className="text-muted">{cat.description || '—'}</td>
                <td>
                  <span className={`badge ${cat.is_active ? 'badge-active' : 'badge-banned'}`}>
                    {cat.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEditModal(cat)}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className={`btn btn-sm ${cat.is_active ? 'btn-warning' : 'btn-success'}`}
                      onClick={() => toggleActive(cat)}
                    >
                      {cat.is_active ? '⏸ Disable' : '▶ Enable'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteCategory(cat)}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCategory ? 'Edit category' : 'Add category'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Category name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Plumbing"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  className="form-input"
                  placeholder="Brief description of this category"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Icon (emoji or URL)</label>
                <input
                  className="form-input"
                  placeholder="e.g. 🔧"
                  value={form.icon_url}
                  onChange={e => setForm({ ...form, icon_url: e.target.value })}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingCategory ? 'Save changes' : 'Add category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
