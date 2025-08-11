# backend/excel_import.py
import base64
import io
from typing import Any, Dict, List

import eel
import openpyxl

# We’ll inject dm from app.py at startup to avoid circular imports.
_dm = None
def set_dm(dm_obj):
    global _dm
    _dm = dm_obj

ID_HEADERS = ['Station ID', 'Station Number', 'StationID', 'Station_Id', 'Station Number']

@eel.expose
def import_fields_for_station(station_id: str, file_b64: str):
    """
    Read the first worksheet of the uploaded Excel, locate the row matching station_id
    (by any common ID header), and merge only empty cells for headers that already
    exist in the station's sheet. Never creates columns.
    """
    dbg: Dict[str, Any] = {"stage": "start"}
    try:
        data = base64.b64decode(file_b64)
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
        ws = wb.worksheets[0]
        dbg["workbook_sheets"] = [s.title for s in wb.worksheets]
        dbg["active_sheet"] = ws.title
    except Exception as e:
        return {"success": False, "message": f"Could not read Excel: {e}", "debug": dbg}

    # Helper: normalize station IDs -> uppercase, strip whitespace, drop trailing X's
    def _norm_sid(s) -> str:
        if s is None:
            return ""
        t = str(s).strip().upper()
        t = "".join(t.split())           # remove all internal whitespace
        t = t.rstrip("X")                # drop any trailing X (one or many)
        return t

    # Read header row: assume first non-empty row is headers

    headers: List[str] = []
    header_row_idx = None
    dbg["header_probe"] = []
    max_probe = min(10, ws.max_row or 0)
    for r in range(1, max_probe + 1):
        row_vals = [c.value for c in ws[r]]
        dbg["header_probe"].append([None if v is None else str(v) for v in row_vals])
        if any(v is not None and str(v).strip() for v in row_vals):
            headers = [str(v).strip() if v is not None else '' for v in row_vals]
            header_row_idx = r
            break
    if not headers:
        dbg["reason"] = "no_headers"
        return {"success": False, "message": "No header row found in Excel.", "debug": dbg}
    dbg["header_row_idx"] = header_row_idx
    dbg["headers"] = headers

    # Find ID column
    id_cols = [i for i, h in enumerate(headers) if h and h.strip() in ID_HEADERS]
    dbg["id_header_candidates"] = ID_HEADERS
    dbg["id_cols_found"] = id_cols
    if not id_cols:
        dbg["reason"] = "no_id_col"
        return {"success": False, "message": "No Station ID column found in Excel.", "debug": dbg}
    id_col = id_cols[0] + 1  # 1-based
    dbg["id_col_index_1based"] = id_col
    dbg["id_col_header"] = headers[id_cols[0]] if id_cols else None

    sid_raw = str(station_id or '').strip()
    sid = _norm_sid(sid_raw)
    dbg["station_id_in"] = station_id
    dbg["station_id_norm"] = sid
    if not sid:
        return {"success": False, "message": "Missing station_id"}

    # Find row for this station
    target_row = None
    sample_ids = []
    sample_ids_norm = []
    scan_start = (header_row_idx or 1) + 1
    for r in range(scan_start, ws.max_row + 1):
        val = ws.cell(row=r, column=id_col).value
        raw = None if val is None else str(val).strip()
        norm = _norm_sid(val)
        if len(sample_ids) < 15:
            sample_ids.append(raw)
            sample_ids_norm.append(norm)
        if norm == sid:
            target_row = r
            break
    dbg["scanned_rows"] = ws.max_row - scan_start + 1
    dbg["sample_first_ids"] = sample_ids
    dbg["sample_first_ids_norm"] = sample_ids_norm
    if not target_row:
        dbg["reason"] = "no_row_match"
        return {"success": False, "message": f"Station '{sid}' not found in uploaded Excel.", "debug": dbg}

    # Build mapping header -> value for that row
    mapping: Dict[str, Any] = {}
    for c, h in enumerate(headers, start=1):
        if not h:
            continue
        if h in ID_HEADERS:
            continue  # never overwrite Station ID
        mapping[h] = ws.cell(row=target_row, column=c).value
    dbg["mapping_keys"] = list(mapping.keys())

    # Delegate to ExcelRepo merge (safe write, no new columns)
    try:
        if _dm is None:
            dbg["reason"] = "dm_not_injected"
            return {"success": False, "message": "DataManager not initialized", "debug": dbg}
        repo = _dm.excel  # ExcelRepo instance
        res = repo.merge_fields_for_station(sid, mapping)
        if isinstance(res, dict):
            res.setdefault("debug", {}).update({"importer": dbg})
        return res
    except Exception as e:
        dbg["exception"] = str(e)
        return {"success": False, "message": f"Merge failed: {e}", "debug": dbg}
