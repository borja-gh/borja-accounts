Los tipos habituales de movements.type incluyen Saldo Inicial, Gasto, Ingreso,
Nómina, Devolución, Apuestas, Apuestas_r, Transferencia, Inversión e Inversión_r.
Las fechas de movements.occurred_at están almacenadas como texto ISO local.
El análisis de gasto usa SUM(CASE WHEN type = 'Gasto' THEN amount
WHEN type = 'Devolución' THEN -amount ELSE 0 END), conservando negativos.
Cada devolución se imputa en su propia fecha, concepto y subconcepto; no se
reasigna al mes del gasto original. Aplica esta regla a totales, medias y series.
Los ingresos reales son Nómina e Ingreso sin transfer_link_id. Las transferencias
entre cuentas propias no son ingresos ni gastos. Balance = ingresos reales
menos gasto neto. No mezcles divisas distintas al agregar cuentas.