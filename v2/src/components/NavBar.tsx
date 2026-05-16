'use client';

import { Suspense } from 'react';
import { NavBarContent } from './navbar/NavBarContent';
import styles from './NavBar.module.css';

/**
 * NavBar: The "Hollow Shell" orchestrator.
 * It contains ZERO logic and calls ZERO URL-dependent hooks.
 * This allows layouts and 404 pages to remain static-safe.
 */
export function NavBar() {
  return (
    <nav className="navbar">
      <Suspense fallback={<NavBarSkeleton />}>
        <NavBarContent />
      </Suspense>
    </nav>
  );
}

/**
 * NavBarSkeleton: Prevents layout shift during Suspense handshake.
 */
function NavBarSkeleton() {
  return (
    <div className={styles.skeletonWrapper}>
      <div className={styles.skeletonCircle} />
      <div className={styles.skeletonBox} />
      <div className={styles.skeletonCircle} />
    </div>
  );
}
