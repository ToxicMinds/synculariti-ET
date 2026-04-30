'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav" role="navigation" aria-label="Mobile navigation">
      <Link href="/" className={pathname === '/' ? 'active' : ''}>
        <span className="nav-icon">🏠</span>
        Dashboard
      </Link>
      <Link href="/settings" className={pathname === '/settings' ? 'active' : ''}>
        <span className="nav-icon">⚙️</span>
        Settings
      </Link>
    </nav>
  );
}
