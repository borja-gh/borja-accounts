interface Props {
  onCreateAccount: () => void;
}

export function OnboardingEmptyState({ onCreateAccount }: Props) {
  return (
    <div className="empty onboarding-empty">
      <h2>Aún no tienes ninguna cuenta</h2>
      <p>
        Esta aplicación funciona en local: tus datos se guardan en una base SQLite en este equipo y no necesitas
        ninguna cuenta ni credencial para usarla.
      </p>
      <p>Crea una cuenta de ahorro o de inversión, elige su divisa y registra tu primer movimiento.</p>
      <button className="btn btn-primary" onClick={onCreateAccount}>
        + Crear tu primera cuenta
      </button>
    </div>
  );
}
