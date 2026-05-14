import React, { useState } from 'react';
import { ManualEntryPayload } from '../components/ManualEntryModal';

export interface UseManualEntryFormProps {
  prefill?: Partial<ManualEntryPayload>;
  names: Record<string, string>;
  onSave: (entry: ManualEntryPayload) => Promise<void>;
  onClose: () => void;
}

export interface FieldErrors {
  amount?: string;
  category?: string;
  description?: string;
}

export interface UseManualEntryFormReturn {
  // Field state
  description: string;
  merchant: string;
  amount: string;
  category: string;
  whoId: string;
  date: string;

  // Lifecycle state
  isSaving: boolean;
  error: string;
  isEdit: boolean;
  fieldErrors: FieldErrors;

  // Actions
  setDescription: (v: string) => void;
  setMerchant: (v: string) => void;
  setAmount: (v: string) => void;
  setCategory: (v: string) => void;
  setWhoId: (v: string) => void;
  setDate: (v: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

export function useManualEntryForm({
  prefill,
  names,
  onSave,
  onClose,
}: UseManualEntryFormProps): UseManualEntryFormReturn {
  const isEdit = !!prefill?.id;
  const firstUserId = Object.keys(names)[0] ?? '';

  const [description, setDescription] = useState(prefill?.description ?? '');
  const [merchant, setMerchant] = useState(prefill?.merchant ?? '');
  const [amount, setAmount] = useState(
    prefill?.amount != null ? String(prefill.amount) : ''
  );
  const [category, setCategory] = useState(prefill?.category ?? '');
  const [whoId, setWhoId] = useState(prefill?.who_id ?? firstUserId);
  const [date, setDate] = useState(
    prefill?.date ?? new Date().toISOString().slice(0, 10)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    // Validate — clear stale errors first
    const nextErrors: FieldErrors = {};

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      nextErrors.amount = 'Please enter a valid amount greater than zero.';
    }

    if (!category.trim()) {
      nextErrors.category = 'Please select a category.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    // Clear any previous errors
    setFieldErrors({});
    setError('');

    // Resolve who from names map with graceful fallback
    const resolvedWho = names[whoId] ?? '';

    const payload: ManualEntryPayload = {
      id: prefill?.id,
      description: description.trim(),
      merchant: merchant.trim() || description.trim() || 'Unknown Merchant',
      amount: parsedAmount,
      category: category.trim(),
      who_id: whoId,
      who: resolvedWho,
      date,
    };

    setIsSaving(true);
    try {
      await onSave(payload);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    description,
    merchant,
    amount,
    category,
    whoId,
    date,
    isSaving,
    error,
    isEdit,
    fieldErrors,
    setDescription,
    setMerchant,
    setAmount,
    setCategory,
    setWhoId,
    setDate,
    handleSubmit,
  };
}
