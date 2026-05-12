'use client';

import React, { Component, ReactNode } from 'react';
import { Logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  /** Which module this boundary wraps — used for telemetry */
  module: 'Identity' | 'Finance' | 'Logistics' | 'App';
  /** Optional custom fallback UI */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * ErrorBoundary: Catches React render crashes and routes them to the telemetry trail.
 *
 * Without this, a render crash shows a blank white screen with zero trace in
 * the activity log or system_telemetry — a complete telemetry blackspot.
 *
 * USAGE: Wrap each module page and the root layout.
 *   <ErrorBoundary module="Finance">
 *     <FinancePage />
 *   </ErrorBoundary>
 *
 * Fixes V-09: Zero ErrorBoundary components in the app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Route to telemetry — this is the only way these crashes surface
    Logger.system('ERROR', 'AI', `React render crash in ${this.props.module} module`, {
      error: error.message,
      stack: error.stack?.slice(0, 500),
      componentStack: info.componentStack?.slice(0, 300),
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          gap: 16,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {this.props.module} module encountered an error
          </div>
          <div style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            maxWidth: 400,
            fontFamily: 'monospace',
            background: 'rgba(255,0,0,0.06)',
            padding: '8px 12px',
            borderRadius: 6,
          }}>
            {this.state.errorMessage}
          </div>
          <button
            className="btn btn-secondary"
            onClick={this.handleReset}
            style={{ marginTop: 8 }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
