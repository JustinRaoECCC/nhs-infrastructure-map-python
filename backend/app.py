# backend/app.py
# Defines the Eel‑exposed functions that drive the front‑end, delegating all data operations to the DataManager façade.

import os
import glob
import openpyxl
from openpyxl.utils import get_column_letter

import pandas as pd
import eel

from .lookups_manager import ensure_data_folder, ensure_lookups_file, delete_all_data_files, get_asset_type_color, read_algorithm_parameters, write_algorithm_parameters, read_workplan_details, write_workplan_details
from .data_manager     import DataManager
from .data_nuke import data_nuke
from .bulk_importer import get_sheet_names, import_sheet_data
from .repairs_manager import save_repair

# ─── Station file constants ─────────────────────────────────────────────────
HERE = os.path.dirname(__file__)
DATA_DIR = os.path.abspath(os.path.join(HERE, '..', 'data'))
ASSET_TYPES_DIR = os.path.join(DATA_DIR, 'asset_types')

# ─── Bootstrap folder + lookups on import ──────────────────────────────────
ensure_data_folder()
ensure_lookups_file()
dm = DataManager()

# ─── Exposed Lookup APIs ───────────────────────────────────────────────────
@eel.expose
def get_locations():
    return dm.get_locations()

@eel.expose
def add_new_location(new_loc):
    return dm.add_location(new_loc)

@eel.expose
def get_asset_types():
    return dm.get_asset_types()

@eel.expose
def add_new_asset_type(new_at):
    return dm.add_asset_type(new_at)

@eel.expose
def get_algorithm_parameters():
    """Return saved algorithm parameters from lookups.xlsx"""
    return read_algorithm_parameters()

@eel.expose
def save_algorithm_parameters(params):
    """
    params: list of {parameter: str, weight: int}
    """
    return write_algorithm_parameters(params)


# ─── Station data APIs ──────────────────────────────────────────────────────
@eel.expose
def get_infrastructure_data():
    stations = dm.list_stations()
    # inject the saved color per province→asset_type
    for stn in stations:
        col = get_asset_type_color(stn['province'], stn['asset_type'])
        stn['color'] = col or '#000000'   # fallback if something went wrong
    return stations


@eel.expose
def create_new_station(station_obj: dict):
    return dm.create_station(station_obj)

@eel.expose
def create_new_repair(station_id: str, repair_obj: dict):
    """
    Called by your modal’s createNewRepair:
      window.electronAPI.createNewRepair(stationId, { ranking, cost, freq });
    """
    return dm.save_repair(station_id, repair_obj)

@eel.expose
def get_companies():
    return dm.get_companies()

@eel.expose
def add_new_company(name, active=False):
    # front‑end will pass active=False for “+ Add”,
    # then active=True when the user hits Confirm
    return dm.add_company(name, active)

@eel.expose
def get_locations_for_company(company_name):
    return dm.get_locations_for_company(company_name)

@eel.expose
def get_asset_types_for_location(company_name, location_name):
    return dm.get_asset_types_for_location(company_name, location_name)

@eel.expose
def add_asset_type_under_location(asset_type_name, company_name, location_name):
    return dm.add_asset_type_under_location(asset_type_name, company_name, location_name)

@eel.expose
def get_active_filters():
    return dm.get_active_filters()

@eel.expose
def add_location_under_company(location_name, company_name):
    """
    Called by the “Add / Select Location” modal:
      window.electronAPI.addLocationUnderCompany(company, location) 
    """
    return dm.add_location_under_company(location_name, company_name)


@eel.expose
def get_excel_sheet_names(base64_data: str):
    return get_sheet_names(base64_data)

@eel.expose
def import_excel_sheet(b64, sheet, location, asset_type):
    return import_sheet_data(b64, sheet, location, asset_type)

@eel.expose
def get_workplan_details():
    """Return saved workplan entries from lookups.xlsx."""
    return read_workplan_details()

@eel.expose
def save_workplan_details(entries):
    """
    entries: list of {parameter: str, value: any}
    """
    return write_workplan_details(entries)

@eel.expose
def save_station_details(station_obj):
    # implement/update in DataManager: apply generalInfo & extraSections,
    # then return {"success":True} or {"success":False,"message":...}
    return dm.update_station(station_obj)

@eel.expose
def delete_station(station_id):
    # implement/delete in DataManager: remove the row from Excel (and DB)
    return dm.delete_station(station_id)


# ─── App startup ────────────────────────────────────────────────────────────
def main():
    eel.init('frontend')
    eel.start('index.html', size=(1200, 800))

if __name__ == '__main__':
    main()
