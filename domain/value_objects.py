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

TIPOS_POSITIVOS = {"Ingreso", "Saldo Inicial", "Nómina", "Inversión_r", "Devolución", "Apuestas_r"}

# Igual a TIPOS_INGRESO/TIPOS_NEGATIVOS en index.html: TIPOS_POSITIVOS es
# idéntico a TIPOS_INGRESO; TIPOS_NEGATIVOS es un conjunto explícito, no el
# complemento genérico de TIPOS_POSITIVOS.
TIPOS_NEGATIVOS = {"Gasto", "Apuestas", "Inversión", "Transferencia"}
