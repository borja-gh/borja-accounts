"""Empareja transferencias históricas que aún no tienen transfer_link_id.

Las patas nuevas (TransferBetweenAccountsUseCase) ya nacen enlazadas.
El CSV de import y el fixture sintético no traen el id: se reconstruye
emparejando Transferencia «A <cuenta>» con Ingreso «Desde <cuenta>» del
mismo día, resolviendo <cuenta> contra id o name (el fixture dice
«A IBKR» / «Desde OPENBANK», las altas nuevas dicen el id).
"""
import uuid


def backfill_transfer_links(conn) -> int:
    accounts = list(conn.execute("SELECT id, name FROM accounts"))
    aliases: dict[str, str] = {}
    names_by_id: dict[str, str] = {}
    for account_id, name in accounts:
        aliases[account_id.upper()] = account_id
        names_by_id[account_id] = name or ""
        if name:
            aliases[name.upper()] = account_id

    movs = conn.execute(
        "SELECT id, account_id, occurred_at, type, concept, transfer_link_id "
        "FROM movements"
    ).fetchall()

    unpaired_out = [
        m for m in movs
        if m[3] == "Transferencia" and not m[5]
        and (m[4] or "").upper().startswith("A ")
    ]
    unpaired_in = [
        m for m in movs
        if m[3] == "Ingreso" and not m[5]
        and (m[4] or "").upper().startswith("DESDE ")
    ]

    used_in: set[str] = set()
    paired = 0
    for out in unpaired_out:
        dest_id = aliases.get((out[4] or "")[2:].strip().upper())
        if dest_id is None:
            continue
        origin_id = out[1]
        origin_aliases = {origin_id.upper()}
        origin_name = names_by_id.get(origin_id, "")
        if origin_name:
            origin_aliases.add(origin_name.upper())
        out_day = (out[2] or "")[:10]

        candidates = []
        for inn in unpaired_in:
            if inn[0] in used_in or inn[1] != dest_id:
                continue
            src_label = (inn[4] or "")[6:].strip().upper()
            if src_label not in origin_aliases:
                continue
            if (inn[2] or "")[:10] != out_day:
                continue
            candidates.append(inn)
        if not candidates:
            continue
        chosen = min(candidates, key=lambda row: row[2] or "")
        link = str(uuid.uuid4())
        conn.execute(
            "UPDATE movements SET transfer_link_id = ? WHERE id IN (?, ?)",
            (link, out[0], chosen[0]),
        )
        used_in.add(chosen[0])
        paired += 1
    return paired
