import sharp from 'sharp';
import { getErrorMessage } from './utils';

export interface PreprocessResult {
  success: boolean;
  image?: string;
  width?: number;
  height?: number;
  originalSize?: number;
  compressedSize?: number;
  originalFormat?: string;
  error?: string;
}

const MAX_WIDTH = 2000;
const MAX_HEIGHT = 2000;
const WEBP_QUALITY = 80;
const MAX_INPUT_BYTES = 50 * 1024 * 1024;

function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

function formatDataUrl(data: Buffer, mime: string): string {
  return `data:${mime};base64,${data.toString('base64')}`;
}

export async function preprocessImage(dataUrl: string): Promise<PreprocessResult> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { success: false, error: 'Invalid data URL format' };
  }

  const originalBuffer = Buffer.from(parsed.base64, 'base64');
  if (originalBuffer.length === 0) {
    return { success: false, error: 'Empty image data' };
  }
  if (originalBuffer.length > MAX_INPUT_BYTES) {
    return { success: false, error: 'Image exceeds maximum size of 50MB' };
  }

  try {
    const metadata = await sharp(originalBuffer).metadata();
    const originalFormat = metadata.format || 'unknown';

    const processed = await sharp(originalBuffer)
      .rotate()
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    return {
      success: true,
      image: formatDataUrl(processed, 'image/webp'),
      width: metadata.width,
      height: metadata.height,
      originalSize: originalBuffer.length,
      compressedSize: processed.length,
      originalFormat,
    };
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    return { success: false, error: msg };
  }
}
