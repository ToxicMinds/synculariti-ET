'use client';

import { useEffect, useState } from 'react';
import { InfoTooltip } from './InfoTooltip';

export function BentoCard({ 
  children, 
  title, 
  className = '', 
  colSpan = 12,
  rowSpan = 1,
  tooltip
}: { 
  children: React.ReactNode; 
  title?: string;
  className?: string;
  colSpan?: number;
  rowSpan?: number;
  tooltip?: { title: string; explanation: string; formula?: string };
}) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div 
      className={`bento-card ${className}`}
      style={{ 
        gridColumn: isMobile ? 'span 1' : `span ${colSpan} / span ${colSpan}`,
        gridRow: isMobile ? 'auto' : `span ${rowSpan} / span ${rowSpan}`
      }}
    >
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {title}
          </h3>
          {tooltip && <InfoTooltip {...tooltip} />}
        </div>
      )}
      {children}
    </div>
  );
}
