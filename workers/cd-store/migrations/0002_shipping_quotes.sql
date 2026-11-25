CREATE TABLE IF NOT EXISTS shipping_quotes (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, expires INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS shipping_quotes_expiry ON shipping_quotes(expires);
