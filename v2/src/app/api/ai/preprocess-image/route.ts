import { NextResponse } from 'next/server';
import { withTestHandler } from '@/lib/withTestHandler';
import { apiError } from '@/lib/api-error-handler';
import { preprocessImage } from '@/lib/image-preprocessor';
import { ServerLogger } from '@/lib/logger-server';
import { SecureHandler } from '@/lib/types/api';
import { z } from 'zod';

const PreprocessRequestSchema = z.object({
  image: z.string().min(1, 'Image data is required'),
});

const handler: SecureHandler = async (req) => {
  try {
    const body = await req.json();
    const parsed = PreprocessRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Validation failed', 'AI', 'Invalid preprocess request', {
        status: 400,
        details: parsed.error.issues,
      });
    }

    const { image } = parsed.data;
    const result = await preprocessImage(image);

    if (!result.success) {
      return apiError(result.error || 'Preprocessing failed', 'AI', 'Image preprocessing error', {
        status: 422,
      });
    }

    await ServerLogger.system('INFO', 'AI', 'Image preprocessed', {
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      width: result.width,
      height: result.height,
      originalFormat: result.originalFormat,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    return apiError(err, 'AI', 'Image preprocessing error', { retryable: false });
  }
};

export const POST = withTestHandler(handler);
