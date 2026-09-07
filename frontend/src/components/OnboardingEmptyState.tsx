interface Props {
  onCreateAccount: () => void;
}

export function OnboardingEmptyState({ onCreateAccount }: Props) {
  return (
    <div className="empty onboarding-empty">
      <h2>Aún no tienes ninguna cuenta</h2>
      <p>Crea tu primera cuenta para empezar a llevar el seguimiento de tus finanzas.</p>
      <button className="btn btn-primary" onClick={onCreateAccount}>
        + Crear tu primera cuenta
      </button>
    </div>
  );
}
