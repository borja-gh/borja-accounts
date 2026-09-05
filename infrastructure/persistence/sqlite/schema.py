SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('CASH', 'INVESTMENT')),
    currency TEXT NOT NULL DEFAULT 'EUR'
);

-- SQLite: "PRIMARY KEY" en una columna no-INTEGER NO implica NOT NULL (solo
-- INTEGER PRIMARY KEY, alias del rowid, lo hace). Se declara explícito para
-- que un id NULL viole la restricción en vez de insertarse silenciosamente.
CREATE TABLE IF NOT EXISTS movements (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    occurred_at TEXT NOT NULL,
    type TEXT NOT NULL,
    concept TEXT NOT NULL,
    amount REAL NOT NULL,
    balance REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movements_account ON movements(account_id);
"""

def ensure_schema(conn):
    conn.executescript(SCHEMA)
    conn.commit()
