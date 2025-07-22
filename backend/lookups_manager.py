# backend/lookups_manager.py
# Manages the lookups.xlsx file, ensuring the Locations and AssetTypes sheets exist and providing Excel CRUD for lookups.

import os
import glob
import threading

import pandas as pd
from openpyxl import load_workbook, Workbook
from openpyxl.styles import Alignment, Font

# ─── Paths & constants ──────────────────────────────────────────────────────
HERE = os.path.dirname(__file__)
DATA_DIR = os.path.abspath(os.path.join(HERE, '..', 'data'))
ASSET_TYPES_DIR = os.path.join(DATA_DIR, 'asset_types')
LOOKUPS_PATH = os.path.join(DATA_DIR, 'lookups.xlsx')

# ─── Per‑asset‑type locks ────────────────────────────────────────────────────
_lock_dict = {}
def _get_lock(key: str):
    if key not in _lock_dict:
        _lock_dict[key] = threading.Lock()
    return _lock_dict[key]

# ─── Ensure data folder & lookups.xlsx exist and are well‑formed ────────────
def ensure_data_folder():
    os.makedirs(DATA_DIR,        exist_ok=True)
    os.makedirs(ASSET_TYPES_DIR, exist_ok=True)

def ensure_lookups_file():
    """
    Guarantee lookups.xlsx exists with both
    'Locations' and 'AssetTypes' sheets (correct headers).
    """
    ensure_data_folder()

    if not os.path.exists(LOOKUPS_PATH):
        # fresh file: create Companies first, then Locations and AssetTypes
        with pd.ExcelWriter(LOOKUPS_PATH, engine='openpyxl') as writer:
            pd.DataFrame(columns=['company']) .to_excel(writer, sheet_name='Companies', index=False)
            pd.DataFrame(columns=['location']) .to_excel(writer, sheet_name='Locations', index=False)
            pd.DataFrame(columns=['asset_type']) .to_excel(writer, sheet_name='AssetTypes', index=False)
        return

    # patch missing sheets if needed
    wb = load_workbook(LOOKUPS_PATH)

    # — create Companies via pandas so header is bold —
    if 'Companies' not in wb.sheetnames:
        with pd.ExcelWriter(LOOKUPS_PATH, engine='openpyxl', mode='a') as writer:
            pd.DataFrame(columns=['company', 'active']) \
              .to_excel(writer, sheet_name='Companies', index=False)
        # reload so we can patch the other sheets below
        wb = load_workbook(LOOKUPS_PATH)

    # — ensure Locations & AssetTypes exist as before —
    changed = False
    if 'Locations' not in wb.sheetnames:
        ws = wb.create_sheet('Locations')
        ws['A1'] = 'location'
        ws['B1'] = 'company'
        changed = True
    if 'AssetTypes' not in wb.sheetnames:
        ws = wb.create_sheet('AssetTypes')
        ws['A1'] = 'asset_type'
        ws['B1'] = 'location'
        changed = True
    if changed:
        wb.save(LOOKUPS_PATH)


# ─── Core lookup routines ───────────────────────────────────────────────────
def read_lookup_list(sheet_name: str) -> list[str]:
    """
    Read all non‑empty values from column A, rows 2+ of LOOKUPS_PATH[sheet_name].
    If the sheet doesn't exist, create it (with header) and return [].
    """
    wb = load_workbook(LOOKUPS_PATH)
    if sheet_name not in wb.sheetnames:
        ws = wb.create_sheet(sheet_name)
        ws['A1'] = 'LocationName' if sheet_name == 'Locations' else 'AssetTypeName'
        wb.save(LOOKUPS_PATH)
        return []

    ws = wb[sheet_name]
    result = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = row[0]
        if isinstance(v, str) and v.strip():
            result.append(v.strip())
    return result

def append_to_lookup(sheet_name: str, entry_value: str, second_value: str = None) -> bool:
    """
    Append entry_value (trimmed) to LOOKUPS_PATH[sheet_name], if not already present
    (case‐insensitive). Returns True if added, False if duplicate/empty.
    """
    wb = load_workbook(LOOKUPS_PATH)
    if sheet_name not in wb.sheetnames:
        ws = wb.create_sheet(sheet_name)
        ws['A1'] = 'LocationName' if sheet_name == 'Locations' else 'AssetTypeName'
    else:
        ws = wb[sheet_name]

    val = (entry_value or '').strip()
    if not val:
        return False

    # check dupes in rows 2+
    for cell in ws['A'][1:]:
        if isinstance(cell.value, str) and cell.value.strip().lower() == val.lower():
            return False

    if sheet_name == 'Companies':
        ws.append([val, 'TRUE' if second_value else 'FALSE'])
    elif sheet_name == 'Locations' or sheet_name == 'AssetTypes':
        ws.append([val, second_value or ''])
    else:
        ws.append([val])
        
    wb.save(LOOKUPS_PATH)
    return True

# ─── Public lookup APIs ─────────────────────────────────────────────────────
def get_locations() -> list[str]:
    return read_lookup_list('Locations')

def add_new_location(new_loc: str) -> bool:
    return append_to_lookup('Locations', new_loc)

def get_asset_types() -> list[str]:
    return read_lookup_list('AssetTypes')

def add_new_asset_type_internal(new_asset_type: str) -> dict:
    """
    Append to 'AssetTypes' (skipping if exists), then
    build {DATA_DIR}/{asset_type}.xlsx with one sheet per province,
    merged header row + core columns.
    Returns dict(success:bool, added:bool, message:str?).
    """
    lock = _get_lock(new_asset_type)
    with lock:
        name = (new_asset_type or '').strip()
        if not name:
            return {'success': False, 'message': 'Invalid asset type.'}

        # 1) append to lookup
        added = append_to_lookup('AssetTypes', name)
        if not added:
            return {'success': True, 'added': False, 'message': 'Asset type already exists.'}

        # 2) create per‑province workbook
        data_path = os.path.join(ASSET_TYPES_DIR, f'{name}.xlsx')
        wb = Workbook()
        wb.remove(wb.active)

        provinces = read_lookup_list('Locations')
        core_cols = [
            'Station ID','Asset Type','Site Name',
            'Province','Latitude','Longitude',
            'Status','Repair Ranking'
        ]

        for prov in provinces:
            ws = wb.create_sheet(title=prov)
            ws.merge_cells('A1:H1')
            hdr = ws['A1']
            hdr.value = 'General Information'
            hdr.alignment = Alignment(horizontal='center', vertical='center')
            hdr.font = Font(bold=True)

            for idx, col in enumerate(core_cols, start=1):
                c = ws.cell(row=2, column=idx)
                c.value = col
                c.font = Font(bold=True)
                c.alignment = Alignment(horizontal='left', vertical='center')

        wb.save(data_path)
        return {'success': True, 'added': True}

def delete_all_data_files() -> dict:
    # remove lookup file
    for p in glob.glob(os.path.join(DATA_DIR,   '*.xlsx')):
        if os.path.basename(p) == 'lookups.xlsx':
            try: os.remove(p)
            except: pass
    # remove all asset‑type workbooks
    for p in glob.glob(os.path.join(ASSET_TYPES_DIR, '*.xlsx')):
        try: os.remove(p)
        except: pass
    # recreate lookups (but asset_types dir stays)
    ensure_lookups_file()
    return {'success': True}

def get_companies() -> list[str]:
    return read_lookup_list('Companies')

def add_new_company(new_company: str) -> bool:
    return append_to_lookup('Companies', new_company)
