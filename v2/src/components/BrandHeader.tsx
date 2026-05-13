'use client';

import React from 'react';

interface Props {
  title?: string;
  subtitle?: string;
}

export function BrandHeader({ 
  title = "Synculariti Identity", 
  subtitle = "Secure enterprise access gatekeeper" 
}: Props) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ 
        width: 64, 
        height: 64, 
        borderRadius: 16, 
        background: 'var(--bg-hover)', 
        margin: '0 auto 24px', 
        overflow: 'hidden', 
        border: '1px solid var(--border-color)' 
      }}>
        <img 
          src="/brand/identity.png" 
          alt="Identity" 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      </div>
      
      <h1 className="text-gradient" style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
        {title}
      </h1>
      <p className="card-subtitle">{subtitle}</p>
    </div>
  );
}
