import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { fetchAccounts } from './api/client';
import type { AccountSummary } from './api/types';

// Solo se prueba el enrutado de App (onboarding vs. vista normal) -- el
// contenido de cada vista de cuenta ya tiene sus propios tests, y montarla
// aquí de verdad dispararía fetches reales no relacionados con este test.
vi.mock('./api/client', () => ({ fetchAccounts: vi.fn() }));
vi.mock('./features/cash/CashAccountView', () => ({
  CashAccountView: ({ account }: { account: AccountSummary }) => <div>{account.name}</div>,
}));

const ACCOUNT: AccountSummary = { id: 'cash1', name: 'Cuenta 1', kind: 'CASH', currency: 'EUR', saldo: 100 };

describe('App', () => {
  it('con la BD vacía muestra el onboarding y el CTA abre el modal de alta', async () => {
    vi.mocked(fetchAccounts).mockResolvedValue([]);
    render(<App />);

    expect(await screen.findByText('Aún no tienes ninguna cuenta')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+ Crear tu primera cuenta'));
    expect(screen.getByText('+ Nueva cuenta')).toBeInTheDocument();
  });

  it('con cuentas existentes no muestra el onboarding', async () => {
    vi.mocked(fetchAccounts).mockResolvedValue([ACCOUNT]);
    render(<App />);

    await screen.findAllByText(ACCOUNT.name);
    expect(screen.queryByText('Aún no tienes ninguna cuenta')).not.toBeInTheDocument();
  });
});
