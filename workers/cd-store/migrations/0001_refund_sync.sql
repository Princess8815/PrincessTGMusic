CREATE TABLE IF NOT EXISTS order_refunds (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 refunded_cents INTEGER NOT NULL DEFAULT 0,
 pending_cents INTEGER NOT NULL DEFAULT 0,
 tax_state TEXT NOT NULL DEFAULT 'none',
 tax_reversal TEXT,
 lock_until INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS order_refunds_retry ON order_refunds(tax_state,lock_until);
