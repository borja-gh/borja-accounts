class DomainError(Exception):
    """Base de los errores de dominio. La capa de interfaz los traduce a
    JSON + status_code manteniendo el mismo contrato que hoy expone la API."""
    status_code = 400


class InvalidAmountError(DomainError):
    pass


class InvalidDateError(DomainError):
    pass


class InvalidMovementTypeError(DomainError):
    pass


class EmptyConceptError(DomainError):
    pass


class MissingSourceMovementError(DomainError):
    pass


class AlreadyClosedBetError(DomainError):
    pass


class ProtectedInitialBalanceError(DomainError):
    pass


class MovementNotFoundError(DomainError):
    status_code = 404


class InvalidTransferError(DomainError):
    pass


class InvalidMovementIndexError(DomainError):
    pass


class InvalidAccountError(DomainError):
    pass


class AccountNotFoundError(DomainError):
    status_code = 404


class PortfolioHoldingNotFoundError(DomainError):
    status_code = 404


class InsufficientCashError(DomainError):
    pass


class FxRateUnavailableError(DomainError):
    status_code = 502


class InvalidBudgetError(DomainError):
    pass


class CashBudgetNotFoundError(DomainError):
    status_code = 404


class AssistantQueryError(DomainError):
    status_code = 422

    def __init__(self, message: str, *, attempts: int | None = None, sql: str | None = None):
        super().__init__(message)
        self.attempts = attempts
        self.sql = sql
