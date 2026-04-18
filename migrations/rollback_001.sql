-- If something goes wrong, run this to revert:
ALTER TABLE expenses DROP COLUMN invoice_id;
DROP TABLE invoices;
-- All existing expenses untouched
