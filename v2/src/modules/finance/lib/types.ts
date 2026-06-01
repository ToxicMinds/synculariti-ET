export interface Transaction {
  id?: string;
  tenant_id?: string;
  amount: number | string;
  category: string;      // The display text (Snapshot/Legacy)
  category_id?: string;  // The stable ID (Modern)
  account_id?: string;   // CoA ID (Synculariti Finance)
  date: string;
  who?: string;
  who_id?: string;
  description?: string;
  recurring_id?: string;
  is_deleted?: boolean;
  transaction_type?: 'DEBIT' | 'CREDIT';
  currency?: string;
  location_id?: string;
  invoice_id?: string;
  created_at?: string;
  updated_at?: string;
}

export type Expense = Transaction;
