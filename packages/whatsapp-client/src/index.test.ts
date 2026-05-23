// @ts-ignore - index.ts doesn't exist yet, so this will fail compilation/import in tests
import * as exportsMap from './index';

describe('Barrel entrypoint exports', () => {
  it('should export all required client and helper functions', () => {
    expect(exportsMap.OpenWAClient).toBeDefined();
    expect(exportsMap.verifyWebhookSignature).toBeDefined();
    expect(exportsMap.Templates).toBeDefined();
    expect(exportsMap.parseInboundCommand).toBeDefined();
  });
});
