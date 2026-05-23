import { useState } from 'react';
import {
  WhatsAppNotificationPayload,
  WhatsAppNotificationResult,
  UseWhatsAppNotifierState,
  getErrorMessage
} from '@synculariti/whatsapp-client';

export function useWhatsAppNotifier(): UseWhatsAppNotifierState {
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<WhatsAppNotificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (payload: WhatsAppNotificationPayload) => {
    setIsSending(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to send notification');
      const data = await res.json();
      
      const result: WhatsAppNotificationResult = {
        success: true,
        jobId: data.jobId
      };
      
      setLastResult(result);
      return result;
    } catch (e: unknown) {
      const err = getErrorMessage(e);
      setError(err);
      return { success: false, error: err };
    } finally {
      setIsSending(false);
    }
  };

  return { isSending, lastResult, error, actions: { send } };
}
