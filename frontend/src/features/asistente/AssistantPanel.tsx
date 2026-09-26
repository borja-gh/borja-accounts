import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  askAssistant,
  deleteSavedAssistantQuery,
  executeSavedAssistantQuery,
  fetchSavedAssistantQueries,
  renameSavedAssistantQuery,
  saveAssistantQuery,
} from '../../api/client';
import type {
  AccountSummary,
  AssistantMode,
  AssistantRequest,
  AssistantResult,
  SavedAssistantQuery,
} from '../../api/types';

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
  const [resultSource, setResultSource] = useState<'llm' | 'saved'>('llm');
  const [resultContext, setResultContext] = useState<{ prompt: string; scope: AssistantRequest['scope'] } | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [queries, setQueries] = useState<SavedAssistantQuery[]>([]);
  const [queryFilter, setQueryFilter] = useState('');
  const [error, setError] = useState('');
  const [savedError, setSavedError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (selectedAccount) setAccountId(selectedAccount);
  }, [selectedAccount]);

  useEffect(() => {
    void refreshSavedQueries();
  }, []);

  const scope = useMemo(() => ({
    accountIds: accountId === '*' ? ['*'] : [accountId],
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }), [accountId, from, to]);

  const filteredQueries = useMemo(() => {
    const normalized = queryFilter.trim().toLocaleLowerCase();
    return normalized
      ? queries.filter((query) => query.title.toLocaleLowerCase().includes(normalized))
      : queries;
  }, [queryFilter, queries]);

  const currentQueryIsSaved = Boolean(result?.sql && resultContext && queries.some((query) =>
    query.sql === result.sql
    && query.prompt === resultContext.prompt
    && JSON.stringify(query.scope) === JSON.stringify(resultContext.scope)));

  async function refreshSavedQueries() {
    try {
      const response = await fetchSavedAssistantQueries();
      setQueries(response.queries);
      setSavedError('');
    } catch {
      setSavedError('No se pudieron cargar las consultas guardadas');
    }
  }

  async function submit(request: AssistantRequest) {
    setPending(true);
    setError('');
    setResult(null);
    setProposal(null);
    setResultSource('llm');
    setResultContext({ prompt: request.prompt, scope: request.scope });
    try {
      const response = await askAssistant(request);
      setResult(response);
      if (!response.ok) {
        setError(response.error || 'No se pudo resolver la consulta');
        return;
      }
      if (response.requiresConfirmation && response.sql) {
        setProposal({ prompt: request.prompt, scope: request.scope, sql: response.sql });
      }
    } catch {
      setError('No se pudo conectar con el asistente');
    } finally {
      setPending(false);
    }
  }

  function ask() {
    const submittedPrompt = prompt.trim();
    if (!submittedPrompt) {
      setError('Escribe una petición para el asistente');
      return;
    }
    setPrompt('');
    void submit({ mode, prompt: submittedPrompt, scope });
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

  async function saveCurrentQuery() {
    if (!result?.sql || !result.title || !resultContext) return;
    setPending(true);
    setSavedError('');
    try {
      const response = await saveAssistantQuery({
        title: result.title,
        prompt: resultContext.prompt,
        sql: result.sql,
        scope: resultContext.scope,
      });
      if (!response.ok || !response.query) {
        setSavedError(response.error || 'No se pudo guardar la consulta');
        return;
      }
      setQueries((current) => [response.query!, ...current]);
    } catch {
      setSavedError('No se pudo guardar la consulta');
    } finally {
      setPending(false);
    }
  }

  async function runSavedQuery(query: SavedAssistantQuery) {
    setMode('read');
    setAccountId(query.scope.accountIds[0] ?? '*');
    setFrom(query.scope.from ?? '');
    setTo(query.scope.to ?? '');
    setPending(true);
    setError('');
    setSavedError('');
    setResult(null);
    setProposal(null);
    setResultSource('saved');
    setResultContext({ prompt: query.prompt, scope: query.scope });
    try {
      const response = await executeSavedAssistantQuery(query);
      if (!response.ok || !response.result) {
        setError(response.error || 'No se pudo ejecutar la consulta guardada');
        return;
      }
      setResult({
        ok: true,
        title: query.title,
        sql: response.sql,
        result: response.result,
      });
    } catch {
      setError('No se pudo ejecutar la consulta guardada');
    } finally {
      setPending(false);
    }
  }

  async function removeSavedQuery(query: SavedAssistantQuery) {
    if (!window.confirm(`¿Eliminar la consulta guardada «${query.title}»?`)) return;
    setSavedError('');
    try {
      const response = await deleteSavedAssistantQuery(query.id);
      if (!response.ok) {
        setSavedError(response.error || 'No se pudo eliminar la consulta');
        return;
      }
      setQueries((current) => current.filter((item) => item.id !== query.id));
    } catch {
      setSavedError('No se pudo eliminar la consulta');
    }
  }

  async function renameSavedQuery(query: SavedAssistantQuery) {
    const title = window.prompt('Nuevo título para la consulta', query.title)?.trim();
    if (!title || title === query.title) return;
    setSavedError('');
    try {
      const response = await renameSavedAssistantQuery(query.id, title);
      if (!response.ok || !response.query) {
        setSavedError(response.error || 'No se pudo cambiar el título');
        return;
      }
      setQueries((current) => current.map((item) => item.id === query.id ? response.query! : item));
      if (resultSource === 'saved' && result?.title === query.title) {
        setResult({ ...result, title: response.query.title });
      }
    } catch {
      setSavedError('No se pudo cambiar el título');
    }
  }

  return (
    <section className="assistant-panel" id="assistant-panel" aria-label="Asistente SQL">
      <div className="assistant-workspace">
        <div className="assistant-main">
          <div className="assistant-head">
            <div>
              <span className="eyebrow">Asistente financiero</span>
              <h2>Consulta tus movimientos</h2>
              <p>Pregunta en lenguaje natural, revisa la SQL y guarda las consultas que quieras repetir.</p>
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
              placeholder={mode === 'write' ? 'Ej.: Cambia el tipo del concepto "Clases" de "Ingreso" a "Nómina"' : 'Ej.: ¿Cuánto gasté en pan entre dos fechas?'}
              aria-label="Petición para el asistente"
              rows={2}
            />
            <button type="button" className="btn btn-primary" disabled={pending} onClick={ask}>
              {pending ? 'Consultando…' : mode === 'read' ? 'Consultar' : 'Proponer escritura'}
            </button>
          </div>
          {error && <div className="assistant-error" role="alert">{error}</div>}
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
          {result?.ok && !result.requiresConfirmation && (
            <div className="assistant-answer">
              <div className="assistant-answer-head">
                <div>
                  <div className="assistant-answer-label">{resultSource === 'saved' ? 'Consulta reejecutada' : 'Resultado'}</div>
                  {result.title && <h3>{result.title}</h3>}
                </div>
                {mode === 'read' && resultSource === 'llm' && result.title && result.sql && resultContext && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    disabled={pending || currentQueryIsSaved}
                    onClick={saveCurrentQuery}
                  >
                    {currentQueryIsSaved ? 'Consulta guardada' : `Guardar «${result.title}»`}
                  </button>
                )}
              </div>
              {resultSource === 'saved' ? (
                <p className="assistant-result-note">SQL guardada ejecutada sin llamar al LLM.</p>
              ) : (result.answerMarkdown || result.answer) ? (
                <div className="assistant-markdown">
                  <Markdown remarkPlugins={[remarkGfm]}>{result.answerMarkdown || result.answer || ''}</Markdown>
                </div>
              ) : null}
              {result.result && (
                <div className="assistant-result-data">
                  <div className="assistant-result-meta">
                    {result.result.rowCount} fila{result.result.rowCount === 1 ? '' : 's'}
                    {result.result.affectedRows != null && ` · ${result.result.affectedRows} afectada${result.result.affectedRows === 1 ? '' : 's'}`}
                  </div>
                  {result.result.columns.length > 0 && (
                    <div className="assistant-result-table-wrap">
                      <table className="assistant-result-table">
                        <thead><tr>{result.result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                        <tbody>
                          {result.result.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {result.result!.columns.map((column) => <td key={column}>{row[column] == null ? '—' : String(row[column])}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {result.sql && (
                <details className="assistant-sql-details">
                  <summary>Ver SQL{result.attempts ? ` · ${result.attempts} intento${result.attempts === 1 ? '' : 's'}` : ''}</summary>
                  <code>{result.sql}</code>
                </details>
              )}
            </div>
          )}
        </div>

        <aside className="assistant-saved" aria-label="Consultas guardadas">
          <div className="assistant-saved-head">
            <div>
              <span className="eyebrow">Biblioteca</span>
              <h3>Consultas guardadas</h3>
            </div>
            <span className="assistant-saved-count">{queries.length}</span>
          </div>
          <label className="assistant-saved-filter">
            <span className="sr-only">Filtrar consultas por título</span>
            <input
              type="search"
              value={queryFilter}
              onChange={(event) => setQueryFilter(event.target.value)}
              placeholder="Filtrar por título"
            />
          </label>
          {savedError && <div className="assistant-error" role="alert">{savedError}</div>}
          <div className="assistant-saved-list">
            {filteredQueries.map((query) => (
              <article className="assistant-saved-item" key={query.id}>
                <div className="assistant-saved-copy">
                  <h4>{query.title}</h4>
                  <p>{query.prompt}</p>
                </div>
                <div className="assistant-saved-actions">
                  <button type="button" className="btn btn-primary btn-compact" disabled={pending} onClick={() => void runSavedQuery(query)}>
                    Ejecutar
                  </button>
                  <button type="button" className="btn btn-ghost btn-compact" disabled={pending} onClick={() => void renameSavedQuery(query)}>
                    Renombrar
                  </button>
                  <button type="button" className="btn btn-ghost btn-compact" disabled={pending} onClick={() => void removeSavedQuery(query)}>
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
            {filteredQueries.length === 0 && (
              <p className="assistant-saved-empty">
                {queries.length ? 'No hay títulos que coincidan.' : 'Guarda una consulta para tenerla aquí.'}
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
