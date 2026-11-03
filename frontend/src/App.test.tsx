import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { fetchAccounts, fetchAssistantStatus } from './api/client';
import type { AccountSummary } from './api/types';

vi.mock('./api/client', () => ({ fetchAccounts: vi.fn(), fetchAssistantStatus: vi.fn() }));
vi.mock('./features/asistente/AssistantPanel', () => ({
  AssistantPanel: () => <div>Asistente financiero</div>,
}));
vi.mock('./features/kpis/useAccountKpis', () => ({
  useAccountKpis: () => ({ kpi: null, reload: vi.fn() }),
}));
vi.mock('./features/kpis/useInvestmentKpis', () => ({
  useInvestmentKpis: () => ({ kpi: null, reload: vi.fn() }),
}));
vi.mock('./features/movimientos/useAccountData', () => ({
  useAccountData: () => ({ data: null, reload: vi.fn() }),
}));
vi.mock('./features/filters/useRangeReport', () => ({
  useRangeReport: () => ({ report: null, reload: vi.fn() }),
}));
vi.mock('./features/gastos/useGastosMesActual', () => ({
  useGastosMesActual: () => ({ report: null, reload: vi.fn() }),
}));

const ACCOUNT: AccountSummary = {
  id: 'cash1', name: 'Cuenta 1', kind: 'CASH', currency: 'EUR', saldo: 100, visiblePanels: ['assistant'],
};

describe('App', () => {
  it('con la BD vacía muestra el onboarding y el CTA abre el modal de alta', async () => {
    vi.mocked(fetchAccounts).mockResolvedValue([]);
    vi.mocked(fetchAssistantStatus).mockResolvedValue(true);
    render(<App />);

    expect(await screen.findByText('Aún no tienes ninguna cuenta')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+ Crear tu primera cuenta'));
    expect(screen.getByText('+ Nueva cuenta')).toBeInTheDocument();
  });

  it('con cuentas existentes no muestra el onboarding', async () => {
    vi.mocked(fetchAccounts).mockResolvedValue([ACCOUNT]);
    vi.mocked(fetchAssistantStatus).mockResolvedValue(false);
    render(<App />);

    await screen.findAllByText(ACCOUNT.name);
    expect(screen.queryByText('Aún no tienes ninguna cuenta')).not.toBeInTheDocument();
    expect(screen.queryByText('Asistente financiero')).not.toBeInTheDocument();
  });

  it.each(['CASH', 'INVESTMENT'] as const)('oculta el botón del agente desactivado al arrancar en %s', async (kind) => {
    vi.mocked(fetchAccounts).mockResolvedValue([{ ...ACCOUNT, kind }]);
    vi.mocked(fetchAssistantStatus).mockResolvedValue(false);
    render(<App />);

    await screen.findByRole('heading', { name: ACCOUNT.name });
    expect(screen.queryByRole('button', { name: /(?:Ocultar|Mostrar) agente/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Asistente financiero')).not.toBeInTheDocument();
  });

  it.each([
    ['CASH', true], ['CASH', false], ['INVESTMENT', true], ['INVESTMENT', false],
  ] as const)('con agente habilitado respeta la visibilidad por cuenta en %s (%s)', async (kind, visible) => {
    vi.mocked(fetchAccounts).mockResolvedValue([{ ...ACCOUNT, kind, visiblePanels: visible ? ['assistant'] : [] }]);
    vi.mocked(fetchAssistantStatus).mockResolvedValue(true);
    render(<App />);

    expect(await screen.findByRole('button', { name: `${visible ? 'Ocultar' : 'Mostrar'} agente para esta cuenta` })).toBeInTheDocument();
    expect(screen.queryByText('Asistente financiero') !== null).toBe(visible);
  });

  it('no muestra el botón mientras se consulta la disponibilidad del agente', async () => {
    vi.mocked(fetchAccounts).mockResolvedValue([ACCOUNT]);
    vi.mocked(fetchAssistantStatus).mockReturnValue(new Promise(() => {}));
    render(<App />);

    await screen.findByRole('heading', { name: ACCOUNT.name });
    expect(screen.queryByRole('button', { name: /(?:Ocultar|Mostrar) agente/ })).not.toBeInTheDocument();
  });

  it('no muestra el botón si falla la consulta de disponibilidad del agente', async () => {
    vi.mocked(fetchAccounts).mockResolvedValue([ACCOUNT]);
    vi.mocked(fetchAssistantStatus).mockRejectedValue(new Error('Connection failed'));
    render(<App />);

    await screen.findByRole('heading', { name: ACCOUNT.name });
    expect(screen.queryByRole('button', { name: /(?:Ocultar|Mostrar) agente/ })).not.toBeInTheDocument();
  });
});
