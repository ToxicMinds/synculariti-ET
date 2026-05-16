import { LogComponent } from './logging';

describe('Logging Type Contract', () => {
  it('should include Security in LogComponent', () => {
    // Red Phase: This will fail to compile/import until v2/src/lib/types/logging.ts is created
    const comp: LogComponent = 'Security';
    expect(comp).toBe('Security');
  });

  it('should include all required platform components', () => {
    const components: LogComponent[] = [
      'API', 'Neo4j', 'Scanner', 'Auth', 'Security', 
      'Sync', 'AI', 'Finance', 'Logistics', 
      'eKasa', 'OfflineQueue', 'Utils', 'Banking', 'Export',
      'Debug', 'Usage', 'Camera' // [NEW]
    ];
    expect(components.length).toBeGreaterThan(12);
  });
});
