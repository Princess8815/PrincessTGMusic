-- Reservations count attempts, even if the upstream email provider fails.
CREATE TABLE IF NOT EXISTS verification_sends (
 id TEXT PRIMARY KEY, uid TEXT NOT NULL, email_hash TEXT NOT NULL,
 ip_hash TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_sends_created ON verification_sends(created);
CREATE INDEX IF NOT EXISTS verification_sends_uid ON verification_sends(uid,created);
CREATE INDEX IF NOT EXISTS verification_sends_email ON verification_sends(email_hash,created);
CREATE INDEX IF NOT EXISTS verification_sends_ip ON verification_sends(ip_hash,created);
