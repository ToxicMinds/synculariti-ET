export interface InventoryItem {
  id: string;
  tenant_id: string;
  category_id: string;
  sku: string;
  name: string;
  type: 'RAW' | 'PREP' | 'SERVICE';
  purchasing_uom: string;
  inventory_uom: string;
  conversion_factor: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryCategory {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  location_id: string | null;
  vendor_id: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'RECEIVED' | 'CANCELLED';
  order_date: string;
  total_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface POLineItem {
  id: string;
  po_id: string;
  item_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number;
  created_at: string;
}

export interface CurrentInventory {
  tenant_id: string;
  location_id: string;
  item_id: string;
  stock_level: number;
  last_movement: string;
}
