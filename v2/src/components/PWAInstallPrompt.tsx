'use client';

import { useState, useEffect } from 'react';

export function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // 1. Detect if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      return;
    }

    // 2. Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // 3. Show after a delay to avoid annoying immediate popups
    const timer = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="install-prompt-wrapper">
      <div className="install-prompt-card">
        <div className="install-prompt-content">
          <div className="install-app-icon">
            <img src="/icon.png" alt="App Icon" />
          </div>
          <div className="install-text">
            <h4>Install Synculariti</h4>
            <p>
              {isIOS 
                ? "Tap 'Share' then 'Add to Home Screen'" 
                : "Add to home screen for faster access & offline mode"}
            </p>
          </div>
          <div className="install-actions">
            <button className="install-btn-close" onClick={() => setShow(false)}>✕</button>
          </div>
        </div>
      </div>
    </div>
  );
}
