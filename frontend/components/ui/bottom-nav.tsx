'use client';

import type { Page } from '@/components/mini-app-shell';

interface BottomNavProps {
  page: Page;
  cartCount: number;
  isAdmin: boolean;
  onNavigate: (page: Page) => void;
}

export default function BottomNav({ page, cartCount, isAdmin, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      <button
        className={`nav-item ${page === 'catalog' ? 'active' : ''}`}
        onClick={() => onNavigate('catalog')}
        aria-label="Каталог"
      >
        <span className="nav-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
        </span>
        <span className="nav-label">Каталог</span>
      </button>

      <button
        className={`nav-item ${page === 'cart' ? 'active' : ''}`}
        onClick={() => onNavigate('cart')}
        aria-label="Кошик"
      >
        <span className="nav-icon" style={{ position: 'relative' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          {cartCount > 0 && (
            <span className="cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>
          )}
        </span>
        <span className="nav-label">Кошик</span>
      </button>

      <button
        className={`nav-item ${page === 'settings' ? 'active' : ''}`}
        onClick={() => onNavigate('settings')}
        aria-label="Профіль"
      >
        <span className="nav-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <span className="nav-label">Профіль</span>
      </button>

      {isAdmin && (
        <button
          className={`nav-item ${page === 'admin' ? 'active' : ''}`}
          onClick={() => onNavigate('admin')}
          aria-label="Адмін"
        >
          <span className="nav-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <span className="nav-label">Адмін</span>
        </button>
      )}
    </nav>
  );
}