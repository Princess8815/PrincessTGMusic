CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, created INTEGER NOT NULL,
 payload TEXT NOT NULL, total INTEGER NOT NULL, calculation TEXT NOT NULL,
 intent TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
 tax_transaction TEXT, notice_sent INTEGER NOT NULL DEFAULT 0,
 notice_lock INTEGER NOT NULL DEFAULT 0,
 reward_uid TEXT, reward_done INTEGER NOT NULL DEFAULT 0, reward_added TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS orders_fulfillment ON orders(status,notice_sent,notice_lock);
CREATE INDEX IF NOT EXISTS orders_reward ON orders(status,reward_done,reward_uid);

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
