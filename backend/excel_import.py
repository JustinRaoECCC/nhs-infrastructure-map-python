# backend/excel_import.py
import base64
import io
from typing import Any, Dict

import eel
import openpyxl

# We’ll inject dm from app.py at startup to avoid circular imports.
_dm = None
def set_dm(dm_obj):
    global _dm
    _dm = dm_obj

@eel.expose
def import_multiple_stations(file_b64: str):
    """
    Import multiple stations from an Excel file.
    Each row must contain at least: Station ID, Asset Type, Site Name, Province, Latitude, Longitude, Status
    Extra columns with "Section – Field" format will be treated as extraSections.
    """
    dbg: Dict[str, Any] = {"stage": "start", "imported": 0, "skipped": 0, "errors": []}
    try:
        data = base64.b64decode(file_b64)
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
        ws = wb.worksheets[0]
        dbg["workbook_sheets"] = [s.title for s in wb.worksheets]
        dbg["active_sheet"] = ws.title
    except Exception as e:
        return {"success": False, "message": f"Could not read Excel: {e}", "debug": dbg}

    # Extract headers from the first row
    headers = [str(c.value).strip() if c.value else '' for c in ws[1]]
    dbg["headers"] = headers

    try:
        id_idx = headers.index("Station ID")
    except ValueError:
        dbg["reason"] = "missing_station_id_col"
        return {"success": False, "message": "Missing 'Station ID' column", "debug": dbg}

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not any(row):
            dbg["skipped"] += 1
            continue

        row_dict = {headers[i]: v for i, v in enumerate(row) if i < len(headers)}
        try:
            station_id = str(row_dict.get("Station ID", "")).strip()
            if not station_id:
                dbg["skipped"] += 1
                continue

            general = {
                "stationId": station_id,
                "siteName":  row_dict.get("Site Name", ""),
                "province":  row_dict.get("Province", ""),
                "latitude":  row_dict.get("Latitude", 0),
                "longitude": row_dict.get("Longitude", 0),
                "status":    row_dict.get("Status", "")
            }

            extras = {}
            for k, v in row_dict.items():
                if k in general or k in ["Station ID", "Asset Type", "Site Name", "Province", "Latitude", "Longitude", "Status"]:
                    continue
                if " – " not in k:
                    continue
                sec, fld = k.split(" – ", 1)
                extras.setdefault(sec, {})[fld] = v

            station_obj = {
                "assetType": row_dict.get("Asset Type", ""),
                "generalInfo": general,
                "extraSections": extras
            }

            if _dm is None:
                dbg["reason"] = "dm_not_injected"
                return {"success": False, "message": "DataManager not initialized", "debug": dbg}

            _dm.create_station(station_obj)
            dbg["imported"] += 1

        except Exception as err:
            dbg["errors"].append({"row": row_dict, "error": str(err)})
            dbg["skipped"] += 1

    return {
        "success": True,
        "message": f"Imported {dbg['imported']} station(s), skipped {dbg['skipped']}",
        "debug": dbg
    }
