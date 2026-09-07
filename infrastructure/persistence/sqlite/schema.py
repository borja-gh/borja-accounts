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

-- Una fila por aportación real (una fila de un CSV de carteras/), no por
-- cartera -- una cartera puede recibir varias aportaciones sucesivas al
-- mismo ticker sin cerrarse (ver docs/ARCHITECTURE.md sobre por qué
-- "Cartera 3 - META"/"Cartera 3 - META'" se fusionaron en una sola fila
-- de `portfolio` con dos holdings). No hay seguimiento de valor de mercado
-- en vivo (decisión explícita, ver docs/ARCHITECTURE.md §0): close_price_usd
-- se rellena a mano cuando se vende esa aportación concreta, y solo
-- entonces se calcula el PnL -- hasta entonces es un simple check de
-- compra, no un tracker.
CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id INTEGER PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    portfolio TEXT NOT NULL,
    ticker TEXT NOT NULL,
    company TEXT NOT NULL,
    shares REAL NOT NULL,
    price_usd REAL NOT NULL,
    capital_usd REAL NOT NULL,
    fee_usd REAL,
    contributed_at TEXT NOT NULL,
    source_file TEXT NOT NULL,
    close_price_usd REAL,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_account ON portfolio_holdings(account_id);
"""

def ensure_schema(conn):
    conn.executescript(SCHEMA)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(accounts)")}
    if "cash_override" not in columns:
        conn.execute("ALTER TABLE accounts ADD COLUMN cash_override REAL")
    if "theme" not in columns:
        conn.execute("ALTER TABLE accounts ADD COLUMN theme TEXT")
    movement_columns = {row[1] for row in conn.execute("PRAGMA table_info(movements)")}
    if "exchange_rate" not in movement_columns:
        conn.execute("ALTER TABLE movements ADD COLUMN exchange_rate REAL")
    holding_columns = {row[1] for row in conn.execute("PRAGMA table_info(portfolio_holdings)")}
    if "close_price_usd" not in holding_columns:
        conn.execute("ALTER TABLE portfolio_holdings ADD COLUMN close_price_usd REAL")
    if "note" not in holding_columns:
        conn.execute("ALTER TABLE portfolio_holdings ADD COLUMN note TEXT")
    conn.commit()
