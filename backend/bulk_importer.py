# backend/bulk_importer.py

import base64
import io
import re

import openpyxl
import eel

def get_sheet_names(base64_data: str):
    """
    Decode a base64‑encoded Excel buffer and return its sheet names.
    """
    raw = base64.b64decode(base64_data)
    wb  = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    return wb.sheetnames

def import_sheet_data(
    base64_data: str,
    sheet_name: str,
    location_filter: str,
    asset_type_filter: str
) -> dict:
    """
    Decode + load the specified sheet from a base64‑encoded Excel file,
    emit progress events to the front end, and create stations via dm,
    always using the provided location_filter and asset_type_filter.

    Returns:
      { success: bool, added: int, message?: str }
    """
    raw = base64.b64decode(base64_data)
    wb  = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)

    if sheet_name not in wb.sheetnames:
        return {"success": False, "message": f"Sheet '{sheet_name}' not found"}

    ws = wb[sheet_name]

    # 1) Find the header row by matching just the core 4 columns
    core_headers = {"Station ID", "Station Name", "Latitude", "Longitude"}
    headers = None
    hdr_row = None
    for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
        texts = {c for c in row if isinstance(c, str)}
        if core_headers.issubset(texts):
            headers = list(row)
            hdr_row = i
            break

    if headers is None:
        return {"success": False, "message": "Header row not found."}

    # 2) Gather all non‑empty rows for progress tracking
    data_rows = [
        row for row in ws.iter_rows(min_row=hdr_row+1, values_only=True)
        if row and row[0] is not None
    ]
    total = len(data_rows)
    eel.initImportProgress(total)

    added = 0
    from .app import dm   # avoid circular import
    for idx, row in enumerate(data_rows, start=1):
        rec = dict(zip(headers, row))

        # — always present —
        station_id = str(rec.get("Station ID") or "").strip()
        site_name  = str(rec.get("Station Name") or "").strip()
        latitude   = rec.get("Latitude") or 0
        longitude  = rec.get("Longitude") or 0

        # — status fallback —
        status = str(rec.get("Status") or "UNKNOWN").strip()

        # — override province with the filter —
        province = str(location_filter or "").strip()

        # — override asset type with the filter —
        asset_type = str(asset_type_filter or "").strip()

        # make sure the province workbook exists
        if province:
            dm.add_location(province)

        # build the station object
        station_obj = {
            "assetType": asset_type,
            "generalInfo": {
                "stationId": station_id,
                "siteName":  site_name,
                "province":  province,
                "latitude":  latitude,
                "longitude": longitude,
                "status":    status
            },
            "extraSections": {}
        }

        # collect any extra columns (Section – Field)
        extras = {}
        skip_cols = core_headers | {"Asset Type", "Status"}
        for col, val in rec.items():
            if not col or col in skip_cols:
                continue
            parts = re.split(r"\s*[-–]\s*", col, maxsplit=1)
            if len(parts) == 2:
                sec, fld = parts
                extras.setdefault(sec.strip(), {})[fld.strip()] = val
            else:
                extras.setdefault("Extra Data", {})[col] = val
        station_obj["extraSections"] = extras

        # delegate to DataManager (which will append into <province>.xlsx → asset_type sheet)
        res = dm.create_station(station_obj)
        if res.get("success"):
            added += 1

        eel.updateImportProgress(idx, total)

    return {"success": True, "added": added}
