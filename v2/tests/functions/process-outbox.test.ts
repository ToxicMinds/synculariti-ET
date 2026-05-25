import { processOutboxEvent } from '../../../supabase/functions/process-outbox/handler';
import { OpenWAClient } from '@synculariti/whatsapp-client';

// Mock Supabase client
const mockEq = jest.fn();
const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
const mockSupabase = {
  from: jest.fn().mockReturnValue({ update: mockUpdate })
};

// Mock OpenWAClient
jest.mock('@synculariti/whatsapp-client', () => {
  return {
    OpenWAClient: jest.fn().mockImplementation(() => ({
      sendText: jest.fn().mockResolvedValue(true),
      sendPoll: jest.fn().mockResolvedValue(true),
    }))
  };
});

describe('Edge Function: process-outbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a TEXT message successfully and update status to SENT', async () => {
    const payload = {
      type: 'INSERT',
      table: 'whatsapp_outbox',
      schema: 'public',
      record: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        recipient_phone: '421951153761',
        status: 'PENDING',
        payload: {
          type: 'text',
          text: 'Hello World'
        }
      },
      old_record: null
    };

    await processOutboxEvent(payload as any, mockSupabase as any, 'http://test-sidecar', 'test-key');

    // Ensure it called OpenWAClient correctly
    const clientInstance = (OpenWAClient as jest.Mock).mock.results[0].value;
    expect(clientInstance.sendText).toHaveBeenCalledWith('421951153761@c.us', 'Hello World');

    // Ensure it updated the database outbox status to SENT
    expect(mockSupabase.from).toHaveBeenCalledWith('whatsapp_outbox');
    expect(mockEq).toHaveBeenCalledWith('id', 'outbox-123');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'SENT' }));
  });

  it('should process a POLL message successfully and map webhookUrl', async () => {
    const payload = {
      type: 'INSERT',
      table: 'whatsapp_outbox',
      schema: 'public',
      record: {
        id: 'outbox-456',
        tenant_id: 'tenant-123',
        recipient_phone: '421951153761',
        status: 'PENDING',
        payload: {
          type: 'poll',
          name: 'Approve Invoice?',
          options: ['Yes', 'No']
        }
      },
      old_record: null
    };

    await processOutboxEvent(payload as any, mockSupabase as any, 'http://test-sidecar', 'test-key');

    const clientInstance = (OpenWAClient as jest.Mock).mock.results[0].value;
    expect(clientInstance.sendPoll).toHaveBeenCalledWith(
      '421951153761@c.us', 
      'Approve Invoice?', 
      ['Yes', 'No'], 
      expect.stringContaining('/api/whatsapp/webhook')
    );
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'SENT' }));
  });

  it('should update status to FAILED if the OpenWA client throws an error', async () => {
    const payload = {
      type: 'INSERT',
      table: 'whatsapp_outbox',
      schema: 'public',
      record: {
        id: 'outbox-789',
        tenant_id: 'tenant-123',
        recipient_phone: '421951153761',
        status: 'PENDING',
        payload: {
          type: 'text',
          text: 'Fail me'
        }
      },
      old_record: null
    };

    // Force OpenWAClient to fail
    (OpenWAClient as jest.Mock).mockImplementationOnce(() => ({
      sendText: jest.fn().mockRejectedValue(new Error('Network error'))
    }));

    await processOutboxEvent(payload as any, mockSupabase as any, 'http://test-sidecar', 'test-key');

    // Verify it updated the database outbox status to FAILED
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
  });
});
