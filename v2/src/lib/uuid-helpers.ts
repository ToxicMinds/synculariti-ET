/**
 * Safe general-purpose UUID caster (mirrors SQL public.safe_cast_uuid).
 * Returns the UUID as-is if valid, otherwise returns null.
 */
export function safeCastUuid(val: string | null | undefined): string | null {
  if (!val) return null;
  const cleaned = val.trim();
  if (cleaned.length === 36 && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * Safe user-specific UUID caster with deterministic mock mapping (mirrors SQL public.safe_cast_user_uuid).
 */
export function safeCastUserUuid(val: string | null | undefined): string | null {
  if (!val) return null;
  const cleaned = val.trim();
  
  // Case A: Valid UUID
  if (cleaned.length === 36 && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleaned)) {
    return cleaned;
  }

  // Case B: Mock user IDs (e.g. 'u1', 'u25', up to 12 digits)
  if (/^u[0-9]{1,12}$/.test(cleaned)) {
    const digits = cleaned.substring(1);
    const paddedDigits = digits.padStart(12, '0');
    return `00000000-0000-0000-0000-${paddedDigits}`;
  }

  // Case C: Empty string
  if (cleaned === '') {
    return null;
  }

  // Case D: Fallback for unmappable non-empty strings (including mock overflow)
  return '00000000-0000-0000-0000-000000000000';
}
