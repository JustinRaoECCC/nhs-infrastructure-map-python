# backend/excel_repo.py
# A BaseRepo subclass that wraps all existing Excel‑based logic (lookups, stations, repairs, sections) so it conforms to the common interface.

from .lookups_manager import (
    get_locations as lm_get_locations,
    add_new_location as lm_add_location,
    get_asset_types as lm_get_asset_types,
    add_new_asset_type_internal as lm_add_asset_type,
)
from .repairs_manager import save_repair as lm_save_repair
from .persistence       import BaseRepo
import os, glob, openpyxl
from .lookups_manager import LOCATIONS_DIR

class ExcelRepo(BaseRepo):
    # ─── Lookups ─────────────────────────────────────────
    def get_locations(self):
        return lm_get_locations()

    def add_location(self, name: str):
        return lm_add_location(name)

    def get_asset_types(self):
        return lm_get_asset_types()

    def add_asset_type(self, name: str):
        # returns {success, added?, message?}
        return lm_add_asset_type(name)

    # ─── Stations ────────────────────────────────────────
    def list_stations(self):
        stations = []
        for loc_file in glob.glob(os.path.join(LOCATIONS_DIR, '*.xlsx')):
            location = os.path.splitext(os.path.basename(loc_file))[0]
            wb = openpyxl.load_workbook(loc_file, data_only=True)
            for asset_type in wb.sheetnames:
                ws = wb[asset_type]
                headers = [c.value for c in ws[2]]
                for row in ws.iter_rows(min_row=3, values_only=True):
                    rec = dict(zip(headers, row))
                    try:
                        lat = float(rec.get('Latitude'))
                        lon = float(rec.get('Longitude'))
                    except (TypeError, ValueError):
                        continue
                    station = {
                        'station_id': rec.get('Station ID'),
                        'name':       rec.get('Site Name'),
                        'province':   location,
                        'lat':        lat,
                        'lon':        lon,
                        'status':     rec.get('Status'),
                        'asset_type': asset_type,
                        **{k: v for k, v in rec.items() if k not in (
                            'Station ID','Site Name','Province',
                            'Latitude','Longitude','Status',
                            'Asset Type'
                        )}
                    }
                    stations.append(station)
        return stations

    def create_station(self, station_obj: dict):
        sid      = str(station_obj['generalInfo']['stationId']).strip()
        asset    = station_obj['assetType'].strip()
        location = station_obj['generalInfo']['province'].strip()
        path     = os.path.join(LOCATIONS_DIR, f'{location}.xlsx')
        if not os.path.exists(path):
            return {'success': False, 'message': f'No workbook for location \"{location}\"'}

        wb = openpyxl.load_workbook(path)
        if asset not in wb.sheetnames:
            # auto‑create sheet for this asset type
            ws = wb.create_sheet(title=asset)
            headers = [
                'Station ID','Asset Type','Site Name',
                'Province','Latitude','Longitude',
                'Status'
            ]
            for idx, col in enumerate(headers, start=1):
                c = ws.cell(row=2, column=idx)
                c.value = col
        else:
            ws = wb[asset]

        headers = [c.value for c in ws[2]]
        base = {
            'Station ID':  sid,
            'Asset Type':  asset,
            'Site Name':   station_obj['generalInfo']['siteName'].strip(),
            'Province':    location,
            'Latitude':    station_obj['generalInfo']['latitude'],
            'Longitude':   station_obj['generalInfo']['longitude'],
            'Status':      station_obj['generalInfo']['status'].strip(),
        }
        extra      = station_obj.get('extraSections', {})
        extra_flat = {}
        for section, fields in extra.items():
            for fld, val in fields.items():
                col = f"{section} – {fld}"
                extra_flat[col] = val
                if col not in headers:
                    headers.append(col)
                    ws.cell(row=2, column=len(headers), value=col)

        row = []
        for h in headers:
            if h in base:
                row.append(base[h])
            elif h in extra_flat:
                row.append(extra_flat[h])
            else:
                row.append(None)
        ws.append(row)
        wb.save(path)
        return {'success': True}


    # ─── Repairs ─────────────────────────────────────────
    def save_repair(self, station_id: str, repair_obj: dict):
        return lm_save_repair(station_id, repair_obj)

    # ─── Sections ────────────────────────────────────────
    def save_sections(self, station_id: str, sections: dict):
        # No-op: extraSections get flattened in create_station
        return {"success": True}
    
    def get_sections_for_station(self, station_id: str):
        """
        Excel flattens extraSections into the station rows,
        so we don’t need a separate lookup here.
        """
        return []
    
    def get_companies(self):
        from .lookups_manager import get_companies as lm_get_companies
        return lm_get_companies()

    def add_company(self, name: str, active: bool = False):
        from .lookups_manager import add_new_company as lm_add_company
        # active=False → blank cell; active=True → "TRUE" in column B
        added = lm_add_company(name, active)
        return {
            "success": True,
            "added": added
        }
    
    def update_station(self, station_obj: dict):
        sid    = station_obj["generalInfo"]["stationId"]
        loc    = station_obj["generalInfo"]["province"]
        asset  = station_obj["assetType"]
        path   = os.path.join(LOCATIONS_DIR, f"{loc}.xlsx")
        if not os.path.exists(path):
            return {"success": False, "message": f"No workbook for '{loc}'"}

        wb = openpyxl.load_workbook(path)
        if asset not in wb.sheetnames:
            return {"success": False, "message": f"No sheet '{asset}' in '{loc}.xlsx'"}
        ws = wb[asset]

        # grab headers from row 2
        headers = [c.value for c in ws[2]]
        try:
            idx_sid = headers.index("Station ID") + 1
        except ValueError:
            return {"success": False, "message": "Missing 'Station ID' column"}

        # find the row for this station
        row_num = None
        for r in range(3, ws.max_row + 1):
            if str(ws.cell(row=r, column=idx_sid).value).strip() == sid:
                row_num = r
                break
        if row_num is None:
            return {"success": False, "message": f"Station '{sid}' not found"}

        # update core fields
        gen = station_obj["generalInfo"]
        mapping = {
            "Site Name":  gen["siteName"],
            "Province":   gen["province"],
            "Latitude":   gen["latitude"],
            "Longitude":  gen["longitude"],
            "Status":     gen["status"],
        }
        for col_name, val in mapping.items():
            if col_name in headers:
                col_idx = headers.index(col_name) + 1
            else:
                headers.append(col_name)
                col_idx = len(headers)
                ws.cell(row=2, column=col_idx, value=col_name)
            ws.cell(row=row_num, column=col_idx, value=val)

        # update extraSections
        for sec, fields in station_obj.get("extraSections", {}).items():
            for fld, val in fields.items():
                col_name = f"{sec} – {fld}"
                if col_name in headers:
                    col_idx = headers.index(col_name) + 1
                else:
                    headers.append(col_name)
                    col_idx = len(headers)
                    ws.cell(row=2, column=col_idx, value=col_name)
                ws.cell(row=row_num, column=col_idx, value=val)

        wb.save(path)
        return {"success": True}


    def delete_station(self, station_obj: dict):
        sid    = station_obj["station_id"]
        loc    = station_obj["province"]
        asset  = station_obj["asset_type"]
        path   = os.path.join(LOCATIONS_DIR, f"{loc}.xlsx")
        if not os.path.exists(path):
            return {"success": False, "message": f"No workbook for '{loc}'"}

        wb = openpyxl.load_workbook(path)
        if asset not in wb.sheetnames:
            return {"success": False, "message": f"No sheet '{asset}' in '{loc}.xlsx'"}
        ws = wb[asset]

        headers = [c.value for c in ws[2]]
        try:
            idx_sid = headers.index("Station ID") + 1
        except ValueError:
            return {"success": False, "message": "Missing 'Station ID' column"}

        # find and delete the row
        row_to_del = None
        for r in range(3, ws.max_row + 1):
            if str(ws.cell(row=r, column=idx_sid).value).strip() == sid:
                row_to_del = r
                break
        if row_to_del is None:
            return {"success": False, "message": f"Station '{sid}' not found"}
        ws.delete_rows(row_to_del)
        wb.save(path)
        return {"success": True}
