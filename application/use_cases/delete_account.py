class DeleteAccountUseCase:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, account_id: str) -> None:
        self.repository.get_account(account_id)
        self.repository.delete_account(account_id)
