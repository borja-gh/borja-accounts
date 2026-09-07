from enum import Enum


class AccountKind(str, Enum):
    CASH = "CASH"
    INVESTMENT = "INVESTMENT"


# Tipos de movimiento válidos por kind de cuenta. Vive en el dominio porque
# es una regla de negocio (qué tipos tiene sentido registrar en cada clase
# de cuenta), no un detalle de presentación. Indexado por AccountKind, no
# por cuenta individual: con N cuentas CASH y M cuentas INVESTMENT
# (generalización N/M), cualquier cuenta de un mismo kind admite los mismos
# tipos. "Transferencia" está en ambos kinds porque cualquier cuenta puede
# ser origen de una transferencia hacia cualquier otra.
TIPOS_POR_KIND = {
    AccountKind.CASH: ["Gasto", "Devolución", "Ingreso", "Nómina", "Apuestas", "Apuestas_r", "Transferencia"],
    AccountKind.INVESTMENT: ["Gasto", "Ingreso", "Inversión", "Inversión_r", "Transferencia"],
}

TIPOS_POSITIVOS = {"Ingreso", "Saldo Inicial", "Nómina", "Devolución", "Apuestas_r"}

# Igual a TIPOS_INGRESO/TIPOS_NEGATIVOS en index.html: TIPOS_POSITIVOS es
# idéntico a TIPOS_INGRESO; TIPOS_NEGATIVOS es un conjunto explícito, no el
# complemento genérico de TIPOS_POSITIVOS.
#
# "Inversión"/"Inversión_r" NO están en ninguno de los dos conjuntos --
# recalculate_balances (ledger.py) las trata como un par especial: abrir
# una posición no cambia el saldo (el dinero invertido sigue siendo del
# usuario, solo pasa de líquido a "en cartera" -- ver en_carteras en
# investment_kpi.py, que ya lo reporta como vista separada del saldo), cerrarla
# solo mueve el saldo por la ganancia/pérdida neta, nunca por el importe
# devuelto bruto (que ya "estaba" en el saldo desde que se abrió).
# Apuestas/Apuestas_r NO sigue este tratamiento -- decisión explícita del
# usuario de dejarlas con la aritmética anterior por ahora.
TIPOS_NEGATIVOS = {"Gasto", "Apuestas", "Transferencia"}

# Símbolo de presentación por divisa de cuenta -- igual a CURRENCY_SUFFIX en
# frontend/src/lib/format.ts, duplicado deliberado (backend/frontend son
# lenguajes distintos, no hay forma de compartir esta constante sin un
# tercer artefacto).
CURRENCY_SYMBOLS = {"EUR": "€", "USD": "$"}
