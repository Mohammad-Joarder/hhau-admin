// ============================================================
// Sidebar.js — Admin panel navigation sidebar
// Updated: Added Settings nav item
// ============================================================

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const NAV_ITEMS = [
  { path: '/',           icon: '📊', label: 'Dashboard'  },
  { path: '/categories', icon: '🏷️', label: 'Categories' },
  { path: '/disputes',   icon: '⚠️', label: 'Disputes'   },
  { path: '/users',      icon: '👥', label: 'Users'      },
  { path: '/wallet',     icon: '💰', label: 'Wallet'     },
  { path: '/settings',   icon: '⚙️', label: 'Settings'   },
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
        {NAV_ITEMS.map(item => (
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
        <button className="logout-btn" onClick={handleLogout}>
          🚪 Log out
        </button>
      </div>
    </div>
  );
}
