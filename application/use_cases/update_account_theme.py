from domain.entities import Account
from domain.exceptions import InvalidAccountError

from application.use_cases.create_account import _SUPPORTED_THEMES


class UpdateAccountThemeUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str, data: dict) -> Account:
        account = self.repository.get_account(account_id)

        theme = data.get("theme")
        if theme is not None and theme not in _SUPPORTED_THEMES:
            raise InvalidAccountError(f"Tema '{theme}' no válido")

        account.theme = theme
        self.repository.update_account(account)
        return account
