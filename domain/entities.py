import uuid
from dataclasses import dataclass, field
from datetime import datetime

from domain.value_objects import AccountKind


@dataclass
class Movement:
    account_id: str
    occurred_at: datetime
    type: str
    concept: str
    amount: float
    balance: float = 0.0
    id: uuid.UUID = field(default_factory=uuid.uuid4)


@dataclass
class Account:
    id: str
    name: str
    kind: AccountKind
    currency: str = "EUR"
    cash_override: float | None = None
    theme: str | None = None


@dataclass
class PortfolioHolding:
    """Una fila de un CSV de carteras/ -- una aportación real a un ticker
    dentro de una cartera, en la fecha en que se hizo (no la fecha del
    nombre de fichero, que puede ser la de la última aportación).
    close_price_usd/note son editables desde la UI: sin seguimiento de
    valor de mercado en vivo (decisión explícita), el PnL solo se calcula
    cuando se rellena close_price_usd al vender esa aportación."""
    id: int
    account_id: str
    portfolio: str
    ticker: str
    company: str
    shares: float
    price_usd: float
    capital_usd: float
    contributed_at: str
    source_file: str
    fee_usd: float | None = None
    close_price_usd: float | None = None
    note: str | None = None
