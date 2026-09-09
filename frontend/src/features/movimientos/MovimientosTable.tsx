import type { Movement } from '../../api/types';
import { badgeClass, displayTipo, TIPOS_NEGATIVOS } from '../../domain/tipos';
import { CURRENCY_SUFFIX, fd } from '../../lib/format';

interface Props {
  rows: Movement[];
  currency: string;
  onFilterByConcept: (concepto: string) => void;
  onDuplicate: (idx: number) => void;
  onEdit: (idx: number) => void;
}

// `rows` llega ya ordenado por searchedMovs() -- a diferencia del vanilla
// (que reordenaba también aquí), no se repite el sort porque el resultado
// observable es idéntico.
//
// Muestra el importe en la divisa nativa de la cuenta (money()). Una
// transferencia entrante entre cuentas de distinta divisa ya llega con el
// amount convertido al tipo de cambio introducido al registrarla (ver
// TransferBetweenAccountsUseCase) -- ya no hace falta forzar € en una
// cuenta USD como antes de que existiera esa conversión.
export function MovimientosTable({ rows, currency, onFilterByConcept, onDuplicate, onEdit }: Props) {
  if (!rows.length) return <div className="empty">Sin movimientos.</div>;
  const symbol = CURRENCY_SUFFIX[currency] ?? currency;
  return (
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Concepto</th>
          <th className="r">Importe</th>
          <th className="r">Saldo</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const canAct = r.Tipo !== 'Saldo Inicial' && r._idx != null;
          // Inversión no mueve el saldo al abrir (ver ledger.py) -- ni
          // resta ni suma, así que no lleva signo.
          const isNeutral = r.Tipo === 'Inversión';
          const isNeg = !isNeutral && TIPOS_NEGATIVOS.has(r.Tipo);
          return (
            <tr key={r._idx ?? `${r.Fecha}-${r.Concepto}`}>
              <td className="nowrap date-cell">
                {fd(r.Fecha)}
              </td>
              <td>
                <span className={`badge ${badgeClass(r.Tipo)}`}>{displayTipo(r.Tipo)}</span>
              </td>
              <td>
                <span className="concepto-click" title="Filtrar por este concepto" onClick={() => onFilterByConcept(r.Concepto)}>
                  {r.Concepto}
                </span>
              </td>
              <td className={`r nowrap ${isNeutral ? '' : isNeg ? 'num-neg' : 'num-pos'}`}>{`${isNeutral ? '' : isNeg ? '-' : '+'}${r.Total.toFixed(2)}${symbol}`}</td>
              <td className="r nowrap saldo-cell">{`${r.Saldo.toFixed(2)}${symbol}`}</td>
              <td className="r">
                {canAct && (
                  <div className="row-actions">
                    <button className="btn btn-ghost btn-tiny" onClick={() => onDuplicate(r._idx!)}>
                      Duplicar
                    </button>
                    <button className="btn btn-ghost btn-tiny" onClick={() => onEdit(r._idx!)}>
                      Editar
                    </button>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
