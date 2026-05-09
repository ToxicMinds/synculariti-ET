'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav" role="navigation" aria-label="Mobile navigation">
      <Link href="/" className={pathname === '/' ? 'active' : ''}>
        <span className="nav-icon">🏠</span>
        Home
      </Link>
      <Link href="/ledger" className={pathname === '/ledger' ? 'active' : ''}>
        <span className="nav-icon">📊</span>
        Ledger
      </Link>
      <Link href="/settings" className={pathname === '/settings' ? 'active' : ''}>
        <span className="nav-icon">⚙️</span>
        Settings
      </Link>
    </nav>
  );
}
