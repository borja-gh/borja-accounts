from datetime import datetime
from zoneinfo import ZoneInfo

from domain.exceptions import FxRateUnavailableError, InvalidAmountError
from domain.services.consolidated_kpi import Flows, account_flows, build_consolidated, period_predicates

TZ = ZoneInfo("Europe/Madrid")
SUPPORTED_CURRENCIES = ("EUR", "USD")


class GetConsolidatedKPIsUseCase:
    """Suma los flujos de todas las cuentas en una divisa. Cada divisa de
    cuenta se convierte con un único tipo de cambio al contado (el mismo que
    usa el capital estimado de la cabecera), no al del día de cada movimiento."""

    def __init__(self, repository, market_data):
        self.repository = repository
        self.market_data = market_data

    def execute(self, currency: str, kpi_type: str, reference: datetime, custom_range: str | None = None):
        target = (currency or "").upper()
        if target not in SUPPORTED_CURRENCIES:
            raise InvalidAmountError("Solo se consolida en EUR o USD")

        curr_in, prev_in = period_predicates(kpi_type, reference.astimezone(TZ), custom_range)
        rates: dict[str, float] = {}

        def rate_to_target(source: str) -> float:
            if source == target:
                return 1.0
            if source not in rates:
                value = self.market_data.get_fx_rate(source, target)
                if value is None:
                    raise FxRateUnavailableError(f"No se pudo consultar {source}→{target}")
                rates[source] = value
            return rates[source]

        curr_total = Flows()
        prev_total = Flows()
        for account in self.repository.list_accounts():
            movements = list(self.repository.load(account.id))
            rate = rate_to_target(account.currency)
            curr_total = curr_total + account_flows(account.kind, movements, curr_in).scaled(rate)
            prev_total = prev_total + account_flows(account.kind, movements, prev_in).scaled(rate)

        return build_consolidated(target, curr_total, prev_total)
