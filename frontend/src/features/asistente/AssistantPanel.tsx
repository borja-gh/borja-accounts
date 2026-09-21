import { useEffect, useMemo, useState } from 'react';
import { askAssistant } from '../../api/client';
import type { AccountSummary, AssistantMode, AssistantRequest, AssistantResult } from '../../api/types';

interface Props {
  accounts: AccountSummary[];
  selectedAccount: string | null;
}

interface Proposal {
  prompt: string;
  scope: AssistantRequest['scope'];
  sql: string;
}

export function AssistantPanel({ accounts, selectedAccount }: Props) {
  const [mode, setMode] = useState<AssistantMode>('read');
  const [prompt, setPrompt] = useState('');
  const [accountId, setAccountId] = useState(selectedAccount ?? '*');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (selectedAccount) setAccountId(selectedAccount);
  }, [selectedAccount]);

  const scope = useMemo(() => ({
    accountIds: accountId === '*' ? ['*'] : [accountId],
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }), [accountId, from, to]);

  async function submit(request: AssistantRequest) {
    setPending(true);
    setError('');
    try {
      const response = await askAssistant(request);
      setResult(response);
      if (!response.ok) {
        setError(response.error || 'No se pudo resolver la consulta');
        return;
      }
      if (response.requiresConfirmation && response.sql) {
        setProposal({ prompt: request.prompt, scope: request.scope, sql: response.sql });
      } else {
        setProposal(null);
      }
    } catch {
      setError('No se pudo conectar con el asistente');
    } finally {
      setPending(false);
    }
  }

  function ask() {
    if (!prompt.trim()) {
      setError('Escribe una petición para el asistente');
      return;
    }
    void submit({ mode, prompt: prompt.trim(), scope });
  }

  function confirmWrite() {
    if (!proposal) return;
    void submit({
      mode: 'write',
      prompt: proposal.prompt,
      scope: proposal.scope,
      sql: proposal.sql,
      confirmed: true,
    });
  }

  return (
    <section className="assistant-panel" aria-label="Asistente SQL">
      <div className="assistant-head">
        <div>
          <span className="eyebrow">Asistente SQL</span>
          <h2>Consulta tu base de datos</h2>
          <p>La petición se convierte en SQL y se ejecuta dentro del scope seleccionado.</p>
        </div>
        <div className="assistant-mode" role="group" aria-label="Modo de base de datos">
          <button
            type="button"
            className={mode === 'read' ? 'assistant-mode-btn active' : 'assistant-mode-btn'}
            aria-pressed={mode === 'read'}
            onClick={() => setMode('read')}
          >
            Lectura
          </button>
          <button
            type="button"
            className={mode === 'write' ? 'assistant-mode-btn write active' : 'assistant-mode-btn write'}
            aria-pressed={mode === 'write'}
            onClick={() => setMode('write')}
          >
            Escritura
          </button>
        </div>
      </div>
      <div className="assistant-controls">
        <div className="fg assistant-account-field">
          <label htmlFor="assistant-account">Cuenta</label>
          <select id="assistant-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="*">Todas</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </div>
        <div className="fg">
          <label htmlFor="assistant-from">Desde</label>
          <input id="assistant-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="fg">
          <label htmlFor="assistant-to">Hasta</label>
          <input id="assistant-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
      </div>
      <div className="assistant-input-row">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ej.: ¿Cuánto he gastado este mes?"
          aria-label="Petición para el asistente"
          rows={2}
        />
        <button type="button" className="btn btn-primary" disabled={pending} onClick={ask}>
          {pending ? 'Consultando…' : mode === 'read' ? 'Consultar' : 'Proponer escritura'}
        </button>
      </div>
      {error && <div className="assistant-error">{error}</div>}
      {proposal && (
        <div className="assistant-confirmation">
          <div>
            <strong>Revisa la operación antes de ejecutarla</strong>
            <code>{proposal.sql}</code>
          </div>
          <button type="button" className="btn btn-danger" disabled={pending} onClick={confirmWrite}>
            Confirmar escritura
          </button>
        </div>
      )}
      {result?.answer && (
        <div className="assistant-answer">
          <div className="assistant-answer-label">Respuesta</div>
          <p>{result.answer}</p>
          {result.sql && (
            <details>
              <summary>Ver SQL ejecutado ({result.attempts ?? 1} intento{result.attempts === 1 ? '' : 's'})</summary>
              <code>{result.sql}</code>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
