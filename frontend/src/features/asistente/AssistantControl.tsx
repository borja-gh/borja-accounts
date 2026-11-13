import { useEffect, useId, useState, type FormEvent } from 'react';
import type { AssistantStatus } from '../../api/types';
import { saveAssistantPreferences, setAssistantSession } from '../../api/client';

interface Props {
  status: AssistantStatus;
  onChanged: (status: AssistantStatus) => void;
}

export function AssistantControl({ status, onChanged }: Props) {
  const [expanded, setExpanded] = useState(status.promptOnStart || Boolean(status.error));
  const [startupMode, setStartupMode] = useState(status.startupMode);
  const [project, setProject] = useState(status.project);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const id = useId();

  useEffect(() => {
    if (status.promptOnStart || status.error) setExpanded(true);
  }, [status.promptOnStart, status.error]);

  useEffect(() => {
    setStartupMode(status.startupMode);
    setProject(status.project);
  }, [status.startupMode, status.project]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      onChanged(await saveAssistantPreferences(startupMode, project));
      setFeedback('Preferencia guardada para el próximo arranque.');
    } catch {
      setError('No se pudo guardar la preferencia. Comprueba la conexión con el servidor local.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleSession(enabled: boolean) {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      onChanged(await setAssistantSession(enabled));
    } catch {
      setError('No se pudo cambiar el estado del asistente. Comprueba la conexión con el servidor local.');
      setExpanded(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="assistant-control" aria-label="Configuración del asistente IA">
      <div className="assistant-control-head">
        <div>
          <strong>Asistente IA</strong>
          <span className="assistant-control-status">Vertex AI · {status.enabled ? `Activo en esta sesión · ${status.activeProject}` : 'Desactivado'}</span>
        </div>
        <div className="assistant-control-actions">
          <button className="btn btn-ghost btn-compact" type="button" aria-expanded={expanded} aria-controls={`${id}-settings`} onClick={() => setExpanded((current) => !current)}>
            Configurar asistente
          </button>
          {status.enabled && (
            <button className="btn btn-ghost btn-compact" type="button" disabled={busy} onClick={() => toggleSession(false)}>
              Desactivar esta sesión
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="assistant-control-body" id={`${id}-settings`}>
          {status.promptOnStart && <p className="assistant-start-question">¿Quieres activar el asistente en este arranque?</p>}
          <p className="assistant-control-disclosure">Al usarlo, Google recibe tu pregunta, el alcance seleccionado, el esquema y resultados acotados de consultas. No se envía la base completa. Activarlo comprueba tus credenciales; las consultas solo se envían cuando las solicitas.</p>
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <legend>Al arrancar la aplicación</legend>
              <div className="assistant-start-options">
                {([
                  ['enabled', 'Activar por defecto', 'Comprueba las credenciales de Google al iniciar.'],
                  ['disabled', 'Desactivado', 'Puedes activarlo manualmente en esta sesión.'],
                  ['ask', 'Preguntar siempre', 'Decides al abrir la aplicación tras cada arranque.'],
                ] as const).map(([value, label, description]) => (
                  <label className="assistant-start-option" key={value}>
                    <input type="radio" name={`${id}-startup`} value={value} checked={startupMode === value} onChange={() => setStartupMode(value)} />
                    <span><strong>{label}</strong><span>{description}</span></span>
                  </label>
                ))}
              </div>
              <div className="assistant-project-field">
                <label htmlFor={`${id}-project`}>Proyecto de Google Cloud</label>
                <input id={`${id}-project`} type="text" value={project} placeholder="ID del proyecto con Vertex AI" onChange={(event) => setProject(event.target.value)} />
                <p>Configura las credenciales desde Terminal con <code>gcloud auth application-default login</code>. La aplicación no guarda claves ni contraseñas.</p>
              </div>
              <button className="btn btn-ghost btn-compact" type="submit">Guardar preferencia</button>
            </fieldset>
          </form>
          {(error || status.error) && <p className="form-error" role="alert">{error || status.error}</p>}
          {feedback && <p role="status">{feedback}</p>}
          {!status.enabled && (
            <div className="assistant-session-actions">
              <button className="btn btn-primary btn-compact" type="button" disabled={busy || project !== status.project || !project.trim()} onClick={() => toggleSession(true)}>
                {busy ? 'Comprobando…' : 'Activar en esta sesión'}
              </button>
              {project !== status.project && <span>Guarda el proyecto antes de activar.</span>}
              {status.promptOnStart && (
                <button className="btn btn-ghost btn-compact" type="button" disabled={busy} onClick={() => { setExpanded(false); void toggleSession(false); }}>Continuar sin asistente</button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
