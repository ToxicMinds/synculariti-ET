import { preprocessImage } from './image-preprocessor';

// Minimal valid 1x1 pixel red PNG
const VALID_1X1_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('preprocessImage: data URL parsing', () => {
  it('rejects invalid data URL format', async () => {
    const result = await preprocessImage('not-a-data-url');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid data URL');
  });

  it('rejects empty base64 data', async () => {
    const result = await preprocessImage('data:image/png;base64,');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Empty image data');
  });

  it('rejects data without base64 prefix', async () => {
    const result = await preprocessImage('data:image/png,');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid data URL');
  });
});

describe('preprocessImage: success with real PNG', () => {
  it('processes a valid PNG and returns WebP data URL', async () => {
    const dataUrl = `data:image/png;base64,${VALID_1X1_PNG}`;
    const result = await preprocessImage(dataUrl);

    expect(result.success).toBe(true);
    expect(result.image).toBeDefined();
    expect(result.image).toMatch(/^data:image\/webp;base64,/);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.originalSize).toBeGreaterThan(0);
    expect(result.compressedSize).toBeGreaterThan(0);
    expect(result.originalFormat).toBe('png');
  });
});

describe('preprocessImage: graceful error handling', () => {
  it('returns error for corrupt image data', async () => {
    const dataUrl = `data:image/png;base64,${Buffer.from('not-a-real-image').toString('base64')}`;
    const result = await preprocessImage(dataUrl);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('preprocessImage: large image rejection', () => {
  it('rejects images over 50MB', async () => {
    const fakeLarge = Buffer.alloc(51 * 1024 * 1024 + 1).toString('base64');
    const dataUrl = `data:image/png;base64,${fakeLarge}`;
    const result = await preprocessImage(dataUrl);

    expect(result.success).toBe(false);
    expect(result.error).toContain('50MB');
  });
});
