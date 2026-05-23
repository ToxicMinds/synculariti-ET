import { Templates, parseInboundCommand } from './templates';

describe('Templates', () => {
  it('should render a PROCUREMENT_RECEIVED template correctly', () => {
    const result = Templates.PROCUREMENT_RECEIVED({ poNumber: 'PO-123', supplier: 'Sysco' });
    expect(result).toContain('PO-123');
    expect(result).toContain('Sysco');
  });

  describe('parseInboundCommand', () => {
    it('should map CONFIRM keyword to CONFIRM command', () => {
      const command = parseInboundCommand('I want to CONFIRM this');
      expect(command).toBe('CONFIRM');
    });

    it('should handle case insensitivity', () => {
      const command = parseInboundCommand('stop');
      expect(command).toBe('STOP');
    });

    it('should return UNKNOWN for unrecognized text', () => {
      const command = parseInboundCommand('Hello how are you?');
      expect(command).toBe('UNKNOWN');
    });
  });
});
