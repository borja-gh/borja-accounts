from typing import Protocol

from domain.entities import Account, CashBudget, Movement, PortfolioHolding


class MovementRepository(Protocol):
    def load(self, account_id: str) -> list[Movement]:
        """Devuelve los movimientos de la cuenta, ordenados por fecha
        (mergesort estable). Lanza una excepción de infraestructura si la
        cuenta no tiene datos o no se pueden leer."""
        ...

    def save(self, account_id: str, movements: list[Movement]) -> None:
        """Persiste la lista completa de movimientos en el orden dado."""
        ...

    def list_accounts(self) -> list[Account]:
        """Todas las cuentas existentes (N cuentas CASH + M cuentas
        INVESTMENT), en el orden en que se dieron de alta."""
        ...

    def get_account(self, account_id: str) -> Account:
        """La cuenta con ese id. Lanza una excepción de infraestructura si
        no existe."""
        ...

    def create_account(self, account: Account, initial_movement: Movement | None = None) -> None:
        """Da de alta una cuenta nueva (id único) y, si se pasa, su
        movimiento de saldo inicial -- ambos en una única transacción."""
        ...

    def delete_account(self, account_id: str) -> None:
        """Borra la cuenta y todo su histórico (movements, portfolio_holdings)
        en una única transacción."""
        ...

    def list_portfolio_holdings(self, account_id: str) -> list[PortfolioHolding]:
        """Aportaciones reales (una fila por fila de un CSV de carteras/)
        de las carteras de tipo INVESTMENT que se gestionan por holdings
        en vez de por movements, ordenadas por fecha de aportación."""
        ...

    def replace_portfolio_holdings(self, account_id: str, holdings: list[PortfolioHolding]) -> None:
        """Sustituye todas las holdings de la cuenta -- se reimporta el
        conjunto completo cada vez que cambian los CSV de origen, no se
        actualiza fila a fila."""
        ...

    def add_portfolio_holding(self, holding: PortfolioHolding) -> int:
        """Inserta un lote nuevo (alta desde la UI) y devuelve su id."""
        ...

    def update_portfolio_holding(self, holding_id: int, close_price_usd: float | None, note: str | None,
                                  current_price_usd: float | None) -> None:
        """Actualiza close_price_usd/note/current_price_usd de una holding
        existente (edición desde la UI: precio de cierre al vender, precio
        de mercado actual, o anotación libre)."""
        ...

    def update_holdings_current_prices(self, updates: dict[int, float]) -> None:
        """Upsert en batch de current_price_usd (id de holding -> precio),
        usado por el refresco masivo vía yfinance."""
        ...

    def update_account(self, account: Account) -> None:
        """Actualiza currency/theme de una cuenta existente (id/kind son
        inmutables tras el alta)."""
        ...

    def list_cash_budgets(self, account_id: str) -> list[CashBudget]:
        ...

    def get_cash_budget(self, account_id: str, period_type: str, year: int, month: int) -> CashBudget | None:
        ...

    def upsert_cash_budget(self, account_id: str, period_type: str, year: int, month: int, amount: float) -> CashBudget:
        ...

    def delete_cash_budget(self, account_id: str, budget_id: int) -> None:
        ...

    def list_saved_assistant_queries(self) -> list[dict]:
        ...

    def get_saved_assistant_query(self, query_id: str) -> dict | None:
        ...

    def save_assistant_query(self, title: str, prompt: str, sql: str, scope: dict) -> dict:
        ...

    def rename_saved_assistant_query(self, query_id: str, title: str) -> dict:
        ...

    def delete_saved_assistant_query(self, query_id: str) -> None:
        ...
