import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/disputes', label: 'Disputes', icon: '⚠️' },
  { path: '/notifications', label: 'Notifications', icon: '🔔' },
  { path: '/tasks', label: 'Tasks', icon: '📋' },
  { path: '/users', label: 'Users', icon: '👥' },
  { path: '/financial', label: 'Financial', icon: '💰' },
  { path: '/analytics', label: 'Analytics', icon: '📈' },
  { path: '/categories', label: 'Categories', icon: '🏷️' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <h2>HelpingHandsAu</h2>
        <p>Admin Panel</p>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="logout-btn" onClick={handleLogout}>
          🚪 Log out
        </button>
      </div>
    </div>
  );
}
