import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantStatus } from '../../api/types';
import { saveAssistantPreferences, setAssistantSession } from '../../api/client';
import { AssistantControl } from './AssistantControl';

vi.mock('../../api/client', () => ({ saveAssistantPreferences: vi.fn(), setAssistantSession: vi.fn() }));
const STATUS: AssistantStatus = { enabled: false, activeProject: null, startupMode: 'disabled', project: 'synthetic-project', promptOnStart: false, error: null };

describe('AssistantControl', () => {
  it('guarda el modo de arranque sin activar la sesión', async () => {
    const saved = { ...STATUS, startupMode: 'ask' as const };
    vi.mocked(saveAssistantPreferences).mockResolvedValue(saved);
    const onChanged = vi.fn();
    render(<AssistantControl status={STATUS} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configurar asistente' }));
    fireEvent.click(screen.getByRole('radio', { name: /Preguntar siempre/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencia' }));
    await waitFor(() => expect(saveAssistantPreferences).toHaveBeenCalledWith('ask', 'synthetic-project'));
    expect(onChanged).toHaveBeenCalledWith(saved);
    expect(await screen.findByRole('status')).toHaveTextContent('próximo arranque');
  });

  it('pregunta al iniciar y permite continuar sin asistente', async () => {
    vi.mocked(setAssistantSession).mockResolvedValue(STATUS);
    const onChanged = vi.fn();
    render(<AssistantControl status={{ ...STATUS, startupMode: 'ask', promptOnStart: true }} onChanged={onChanged} />);
    expect(screen.getByText(/¿Quieres activar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sin asistente' }));
    await waitFor(() => expect(setAssistantSession).toHaveBeenCalledWith(false));
    expect(onChanged).toHaveBeenCalledWith(STATUS);
  });

  it('explica qué sale a Google antes de activar y muestra los fallos de ADC', async () => {
    const error = 'Ejecuta gcloud auth application-default login';
    const failed = { ...STATUS, error };
    vi.mocked(setAssistantSession).mockResolvedValue(failed);
    const onChanged = vi.fn();
    const { rerender } = render(<AssistantControl status={STATUS} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configurar asistente' }));
    expect(screen.getByText(/Google recibe tu pregunta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activar en esta sesión' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(failed));
    rerender(<AssistantControl status={failed} onChanged={onChanged} />);
    expect(screen.getByRole('alert')).toHaveTextContent(error);
    expect(screen.getByRole('button', { name: 'Activar en esta sesión' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar asistente' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configurar asistente' })).toHaveAttribute('aria-expanded', 'false');
  });
});
