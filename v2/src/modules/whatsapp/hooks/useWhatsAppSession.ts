import { useState, useEffect } from 'react';
import {
  WhatsAppSession,
  WhatsAppQRCode,
  UseWhatsAppSessionState
} from '@synculariti/whatsapp-client';

export function useWhatsAppSession(): UseWhatsAppSessionState {
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [qrCode, setQrCode] = useState<WhatsAppQRCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/session');
      if (!res.ok) throw new Error('Failed to fetch session');
      const data = await res.json();
      setSession(data.session);
      setQrCode(data.qrCode || null);
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/whatsapp/session', { method: 'DELETE' });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return { session, qrCode, isLoading, error, actions: { refresh, logout } };
}
