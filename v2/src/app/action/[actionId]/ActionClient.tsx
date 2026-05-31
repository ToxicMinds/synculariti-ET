'use client';

import { useState } from 'react';
import { dispatchDecision } from '@/modules/whatsapp/actions/dispatchDecision';
import { Logger } from '@/lib/logger';

interface ActionClientProps {
  actionId: string;
  tenantName: string;
  payload: {
    title: string;
    description: string;
    options: string[];
  };
}

export function ActionClient({ actionId, tenantName, payload }: ActionClientProps) {
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedOption, setSelectedOption] = useState('');

  const handleOptionClick = async (option: string) => {
    if (submitting) return;
    setSubmitting(true);
    setSelectedOption(option);
    setStatus('idle');

    try {
      const result = await dispatchDecision(actionId, option);
      if (result.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(result.error || 'Failed to submit decision.');
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      Logger.system('ERROR', 'WhatsApp', 'dispatchDecision failed', { error: errMsg });
      setStatus('error');
      setErrorMsg('A network error occurred while submitting.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'success') {
    return (
      <div className="bento-card glass-card flex-col flex-center gap-4" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', animation: 'scaleUp 0.3s ease' }}>✅</div>
        <h2 className="card-title text-gradient">Response Submitted</h2>
        <p className="card-subtitle" style={{ maxWidth: '320px' }}>
          Thank you. Your selection of <strong>"{selectedOption}"</strong> has been securely logged and processed by {tenantName}.
        </p>
        <a href="/" className="btn btn-primary" style={{ marginTop: 16, padding: '12px 24px', textDecoration: 'none' }}>
          ← Back to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="bento-card glass-card flex-col gap-4" style={{ padding: '28px 24px' }}>
      <div className="flex-col gap-1">
        <span className="status-badge status-info" style={{ width: 'fit-content' }}>
          {tenantName} Action Request
        </span>
        <h1 className="card-title text-gradient" style={{ fontSize: '22px', marginTop: '8px' }}>
          {payload.title}
        </h1>
        <p className="card-subtitle" style={{ marginTop: '4px' }}>
          {payload.description}
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--border-color)', margin: '8px 0' }} />

      <div className="flex-col gap-3">
        {payload.options.map((option) => (
          <button
            key={option}
            disabled={submitting}
            onClick={() => handleOptionClick(option)}
            className={`btn ${selectedOption === option && submitting ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              width: '100%',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderRadius: '14px',
              opacity: submitting && selectedOption !== option ? 0.6 : 1,
              position: 'relative'
            }}
          >
            <span>{option}</span>
            {submitting && selectedOption === option ? (
              <span className="spinner-small" />
            ) : (
              <span style={{ fontSize: '18px' }}>→</span>
            )}
          </button>
        ))}
      </div>

      {status === 'error' && (
        <div 
          className="status-badge status-danger flex-center gap-2" 
          style={{ 
            padding: '12px', 
            borderRadius: '12px', 
            marginTop: '8px', 
            textTransform: 'none', 
            letterSpacing: 'normal' 
          }}
        >
          <span>⚠️ {errorMsg}</span>
        </div>
      )}
    </div>
  );
}
