'use client';

import { useEffect } from 'react';

/**
 * PWA Service Worker Registration
 * Ensures that the sw.js is active for standalone mode support.
 */
export function SWRegistration() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      window.location.protocol === 'https:' || window.location.hostname === 'localhost'
    ) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration);
          })
          .catch((registrationError) => {
            console.error('SW registration failed: ', registrationError);
          });
      });
    }
  }, []);

  return null;
}
