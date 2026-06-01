'use client';

import { useState } from 'react';
import { dispatchDecision } from '@/modules/whatsapp/actions/dispatchDecision';
import { resolvePurchaseAction } from '@/modules/finance/actions/resolvePurchaseAction';
import { Logger } from '@/lib/logger';

interface ActionClientProps {
  actionId: string;
  tenantName: string;
  payload: {
    title: string;
    description: string;
    options: string[];
    metadata?: Record<string, any>;
  };
}

export function ActionClient({ actionId, tenantName, payload }: ActionClientProps) {
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedOption, setSelectedOption] = useState('');

  const isPurchaseQuarantine = payload.metadata?.purchase_id != null;
  const purchaseId = payload.metadata?.purchase_id as string | undefined;

  const handleOptionClick = async (option: string, directResolve: boolean = false) => {
    if (submitting) return;
    setSubmitting(true);
    setSelectedOption(option + (directResolve ? '_direct' : ''));
    setStatus('idle');

    try {
      if (directResolve && purchaseId) {
        // Direct resolve using UI dashboard action
        const decision = option === 'Approve' ? 'RELEASED' : 'REJECTED';
        const result = await resolvePurchaseAction(purchaseId, decision);
        
        if (result.success) {
          // Best effort mark the outbox as completed
          await dispatchDecision(actionId, option).catch(() => {});
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMsg(result.error || 'Failed to submit decision.');
        }
      } else {
        // Default WhatsApp workflow
        const result = await dispatchDecision(actionId, option);
        if (result.success) {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMsg(result.error || 'Failed to submit decision.');
        }
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
          Thank you. Your selection has been securely logged and processed by {tenantName}.
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
          <div key={option} className="flex-col gap-2">
            {isPurchaseQuarantine && option === 'Approve' ? (
              <>
                <button
                  disabled={submitting}
                  onClick={() => handleOptionClick(option, true)}
                  className={`btn ${selectedOption === option + '_direct' && submitting ? 'btn-primary' : 'btn-primary'}`}
                  style={{
                    width: '100%',
                    justifyContent: 'space-between',
                    padding: '14px 20px',
                    borderRadius: '14px',
                    opacity: submitting && selectedOption !== option + '_direct' ? 0.6 : 1,
                    position: 'relative'
                  }}
                >
                  <span>{option} (Direct)</span>
                  {submitting && selectedOption === option + '_direct' ? (
                    <span className="spinner-small" />
                  ) : (
                    <span style={{ fontSize: '18px' }}>→</span>
                  )}
                </button>
                <button
                  disabled={submitting}
                  onClick={() => handleOptionClick(option, false)}
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
                  <span>{option} via WhatsApp</span>
                  {submitting && selectedOption === option ? (
                    <span className="spinner-small" />
                  ) : (
                    <span style={{ fontSize: '18px' }}>→</span>
                  )}
                </button>
              </>
            ) : (
              <button
                disabled={submitting}
                onClick={() => handleOptionClick(option, false)}
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
            )}
          </div>
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
