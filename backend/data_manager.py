# backend/data_manager.py
# Implements the façade that routes reads/writes to whichever BaseRepo implementations are plugged in, handles dual‑writes, and lazy migration.
import openpyxl
from .lookups_manager import LOOKUPS_PATH
from .excel_repo    import ExcelRepo
from .db_repo       import DBRepo
from .persistence   import BaseRepo
from .config         import USE_DATABASE
class DataManager:
    def __init__(
        self,
        excel_provider: BaseRepo = None,
        db_provider:    BaseRepo = None
    ):
        """
        Persistence providers can be injected to support
        Excel, SQL, or any future store without changing logic.
        """
        self.use_db = USE_DATABASE
        self.excel = excel_provider or ExcelRepo()
        self.db    = db_provider    or DBRepo()

    # ─── Helpers ──────────────────────────────────────────────────────────────
    def _migrate_locations(self):
        for name in self.excel.get_locations():
            if not self.db.get_location_by_name(name):
                self.db.add_location(name)

    def _migrate_asset_types(self):
        for name in self.excel.get_asset_types():
            if not self.db.get_asset_type_by_name(name):
                self.db.add_asset_type(name)

    def _migrate_stations(self):
        for rec in self.excel.list_stations():
            if not self.db.get_station_by_id(rec["station_id"]):
                self.db.create_station(rec)

    # ─── Lookups ──────────────────────────────────────────────────────────────
    def get_locations(self):
        # always back‑fill SQL
        self._migrate_locations()
        # return from SQL or Excel
        if self.use_db:
            return [loc.name for loc in self.db.list_locations()]
        return self.excel.get_locations()

    def add_location(self, name: str):
        # ExcelRepo.add_location returns a bool; DBRepo.add_location returns a dict.
        # Wrap the Excel bool in the same dict shape so front‑end always sees {success, message}.
        ok = bool(self.excel.add_location(name))
        res_excel = {
            "success": ok,
            "message": None if ok else "Location was empty or already existed."
        }
        res_db = self.db.add_location(name)
        return res_db if self.use_db else res_excel

    # ─── Asset Types ─────────────────────────────────────────────────────────
    def get_asset_types(self):
        self._migrate_asset_types()
        if self.use_db:
            return [at.name for at in self.db.list_asset_types()]
        return self.excel.get_asset_types()

    def add_asset_type(self, name: str):
        # Both backends return dicts here, so we can just pick one
        res_excel = self.excel.add_asset_type(name)
        res_db    = self.db.add_asset_type(name)
        return res_db if self.use_db else res_excel

    # ─── Stations ─────────────────────────────────────────────────────────────
    def list_stations(self):
        self._migrate_stations()
        if self.use_db:
            out = []
            for s in self.db.list_stations():
                rec = {
                    "station_id": s.station_id,
                    "name":       s.name,
                    "province":   s.province,
                    "lat":        s.lat,
                    "lon":        s.lon,
                    "status":     s.status,
                    "asset_type": s.asset_type.name,
                }
                # flatten JSON extra_data into the same column format
                extra = s.extra_data or {}
                for section_name, fields in extra.items():
                    for field_name, field_value in fields.items():
                        key = f"{section_name} – {field_name}"
                        rec[key] = field_value
                out.append(rec)
            return out
        # ExcelRepo already returns flattened extra‐columns
        return self.excel.list_stations()

    def create_station(self, station_obj: dict):
        x = self.excel.create_station(station_obj)
        d = self.db.create_station(station_obj)
        return d if self.use_db else x

    # ─── Repairs ──────────────────────────────────────────────────────────────
    def save_repair(self, station_id: str, repair_obj: dict):
        x = self.excel.save_repair(station_id, repair_obj)
        d = self.db.save_repair(station_id, repair_obj)
        return d if self.use_db else x

    # ─── Sections ─────────────────────────────────────────────────────────────
    def save_sections(self, station_id: str, sections: dict):
        x = self.excel.save_sections(station_id, sections)
        d = self.db.save_sections(station_id, sections)
        return d if self.use_db else x

    # ─── Company ─────────────────────────────────────────────────────────────
    def get_companies(self):
        if self.use_db:
            return [c.name for c in self.db.list_companies()]
        return self.excel.get_companies()

    def add_company(self, name):
        excel_res = self.excel.add_company(name)
        db_res = self.db.add_company(name)
        return db_res if self.use_db else excel_res
    
    def get_locations_for_company(self, company_name: str):
        if self.use_db:
            return self.db.get_locations_for_company(company_name)
        # Excel mode: read LOOKUPS_PATH → “Locations” sheet, filter by company in column B
        from .lookups_manager import LOOKUPS_PATH
        import openpyxl

        wb = openpyxl.load_workbook(LOOKUPS_PATH, data_only=True)
        if 'Locations' not in wb.sheetnames:
            return []
        ws = wb['Locations']
        result = []
        for loc, comp in ws.iter_rows(min_row=2, values_only=True):
            if isinstance(loc, str) and comp == company_name:
                result.append(loc)
        return result


    def get_asset_types_for_location(self, company_name: str, location_name: str):
        if self.use_db:
            return self.db.get_asset_types_for_location(company_name, location_name)
        return []

    def add_asset_type_under_location(self, asset_type_name: str, company_name: str, location_name: str):
        if self.use_db:
            return self.db.add_asset_type_under_location(asset_type_name, company_name, location_name)
        return {"success": False, "message": "Not supported in Excel mode"}

    def add_location_under_company(self, location_name: str, company_name: str):
        if self.use_db:
            return self.db.add_location_under_company(location_name, company_name)
        # Excel: append to LOOKUPS_PATH sheet 'Locations' with company in col B
        from .lookups_manager import append_to_lookup

        ok = append_to_lookup('Locations', location_name, company_name)
        return {
            "success": ok,
            "message": None if ok else "Location was empty or already existed."
        }


    def get_active_filters(self):
        if self.use_db:
            return self.db.get_active_filters()
        else:
            from .lookups_manager import read_lookup_list
            companies = read_lookup_list('Companies')
            return {
                "companies": companies,
                "locations": read_lookup_list('Locations'),
                "asset_types": read_lookup_list('AssetTypes')
            }