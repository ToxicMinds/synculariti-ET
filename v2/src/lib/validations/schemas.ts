import { z } from 'zod';

/**
 * Standard Category Schema
 * Trims input and rejects empty strings.
 */
export const CategorySchema = z.array(
  z.string().trim().min(1, { message: "Category name cannot be empty" })
);

/**
 * eKasa-Resilient Date Schema
 * Normalizes Slovak and other localized formats into ISO before validation.
 */
export const EkasaDateSchema = z.preprocess((arg) => {
  if (typeof arg !== 'string') return arg;
  
  let normalized = arg;
  // Handle Slovak/Central European dd.mm.yyyy format
  const ddmm = arg.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/);
  if (ddmm) {
    const [, d, m, y, rest] = ddmm;
    normalized = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${rest.replace(/ /g, 'T')}`;
  }

  const date = new Date(normalized);
  if (isNaN(date.getTime())) {
    return arg; // Pass through to let z.string().datetime() handle the failure
  }
  // Standardize to ISO but remove milliseconds if the test expects it (e.g., Z vs .000Z)
  return date.toISOString().replace(/\.000Z$/, 'Z');
}, z.string().datetime({ message: "Invalid eKasa date format" }));

/**
 * Shared Receipt Meta Schema
 * Composes categories and dates into a robust financial record.
 */
export const ReceiptMetaSchema = z.object({
  total: z.number().positive(),
  date: EkasaDateSchema,
  merchant: z.string().trim().min(1),
  categories: CategorySchema
});

/**
 * eKasa Proxy Request Schema
 * Supports both QR ID and manual OKP data protocols.
 */
export const EkasaRequestSchema = z.object({
  receiptId: z.string().optional(),
  okpData: z.object({
    okp: z.string(),
    cashRegisterCode: z.string(),
    date: z.string(),
    number: z.string(),
    total: z.number()
  }).optional()
}).refine(data => data.receiptId || data.okpData, {
  message: "Either receiptId or okpData must be provided"
});

/**
 * AI Forecast Request Schema
 */
export const ForecastRequestSchema = z.object({
  spent: z.number().min(0),
  budget: z.number().min(0),
  daysElapsed: z.number().min(0),
  daysInMonth: z.number().positive(),
  history: z.array(z.any()).optional()
});

/**
 * AI Statement (Natural Language) Request Schema
 */
export const StatementRequestSchema = z.object({
  text: z.string().trim().min(5),
  categories: CategorySchema
});

/**
 * AI Document Parse (Vision) Request Schema
 */
export const DocumentParseRequestSchema = z.object({
  image: z.string().url().or(z.string().regex(/^data:image\/[a-z]+;base64,/, "Must be valid base64 image data")),
  categories: CategorySchema
});

/**
 * AI eKasa Receipt Parse Request Schema
 */
export const ReceiptParseRequestSchema = z.object({
  ekasaData: z.any(), // Structure from Slovak Gov API (complex/dynamic)
  categories: CategorySchema
});
