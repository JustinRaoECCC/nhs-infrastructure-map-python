# backend/lookups_manager.py
# Manages the lookups.xlsx file, ensuring the Locations and AssetTypes sheets exist and providing Excel CRUD for lookups.

import os
import glob
import threading
import random

import pandas as pd
from openpyxl import load_workbook, Workbook
from openpyxl.styles import Alignment, Font

# ─── Paths & constants ──────────────────────────────────────────────────────
HERE = os.path.dirname(__file__)
DATA_DIR = os.path.abspath(os.path.join(HERE, '..', 'data'))
ASSET_TYPES_DIR = os.path.join(DATA_DIR, 'asset_types')
LOOKUPS_PATH = os.path.join(DATA_DIR, 'lookups.xlsx')
LOCATIONS_DIR   = os.path.join(DATA_DIR, 'locations')

# Random color generator
def _get_random_color() -> str:
    """Return a random hex colour string, e.g. '#3fa4c2'."""
    return '#{:06x}'.format(random.randint(0, 0xFFFFFF))


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
    os.makedirs(LOCATIONS_DIR,   exist_ok=True)

def ensure_lookups_file():
    """
    Guarantee lookups.xlsx exists with both
    'Locations' and 'AssetTypes' sheets (correct headers).
    """
    ensure_data_folder()

    if not os.path.exists(LOOKUPS_PATH):
        # fresh file: create Companies (with active flag), Locations, and AssetTypes
        with pd.ExcelWriter(LOOKUPS_PATH, engine='openpyxl') as writer:
            # Companies: “company” + “active”
            pd.DataFrame(columns=['company','active']) \
              .to_excel(writer, sheet_name='Companies', index=False)
            # Locations: “location” + parent “company”
            pd.DataFrame(columns=['location','company']) \
              .to_excel(writer, sheet_name='Locations', index=False)
            # AssetTypes: “asset_type” + parent “location”
            pd.DataFrame(columns=['asset_type','location']) \
              .to_excel(writer, sheet_name='AssetTypes', index=False)
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
        # second_value now is the exact string we want in column B ("" or "TRUE")
        ws.append([val, second_value])
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
    added = append_to_lookup('Locations', new_loc)
    if not added:
        return False
    # create a workbook for this location with one sheet per existing asset-type
    path = os.path.join(LOCATIONS_DIR, f'{new_loc}.xlsx')
    wb = Workbook()
    # leave the default sheet in place (blank) for now;
    # asset-type sheets will be added when Confirm Asset Type is clicked
    wb.save(path)
    return True

def get_asset_types() -> list[str]:
    return read_lookup_list('AssetTypes')

def add_new_asset_type_internal(new_asset_type: str) -> dict:
    """
    In LOOKUPS_PATH[sheet_name], ensure row where Col A == asset_type.
    If missing, append [asset_type, <whatever B was>, <random color>] and save.
    Return the hex color string in Col C.
    """
    lock = _get_lock(new_asset_type)
    with lock:
        name = (new_asset_type or '').strip()
        if not name:
            return {'success': False, 'message': 'Invalid asset type.'}

        # 1) append to the global lookup sheet (col A)
        added = append_to_lookup('AssetTypes', name)
        if not added:
            return {'success': True, 'added': False, 'message': 'Asset type already exists.'}

        # 2) for each location workbook, safely load (or rebuild & retry) then add the sheet
        core_cols = [
            'Station ID','Asset Type','Site Name',
            'Province','Latitude','Longitude',
            'Status'
        ]
        for loc_file in glob.glob(os.path.join(LOCATIONS_DIR, '*.xlsx')):
            wb = None
            # try loading; on any failure, delete & recreate, then reload
            try:
                wb = load_workbook(loc_file)
            except Exception:
                try:
                    os.remove(loc_file)
                except OSError:
                    pass
                basename = os.path.splitext(os.path.basename(loc_file))[0]
                add_new_location(basename)
                try:
                    wb = load_workbook(loc_file)
                except Exception:
                    # still bad? give up on this file
                    continue

            # if the sheet already exists, skip it
            if name in wb.sheetnames:
                continue

            # otherwise, create the new asset‑type sheet
            ws = wb.create_sheet(title=name)
            # if the default 'Sheet' placeholder still exists (and there's >1 sheet), drop it
            if 'Sheet' in wb.sheetnames and len(wb.sheetnames) > 1:
                wb.remove(wb['Sheet'])

            # write the header row
            for idx, col in enumerate(core_cols, start=1):
                ws.cell(row=2, column=idx, value=col)
            wb.save(loc_file)

        # 3) done all locations—return success immediately (no exception)
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

def add_new_company(name: str, active: bool = False) -> bool:
    # active=False → blank; active=True → "TRUE"
    flag = "TRUE" if active else ""
    return append_to_lookup('Companies', name, flag)

def update_lookup_parent(sheet_name: str, entry_value: str, parent_value: str) -> bool:
    """
    In LOOKUPS_PATH[sheet_name], find the row where col A == entry_value
    (case‑insensitive), set col B = parent_value, save, return True.
    If not found, append [entry_value, parent_value].
    """
    wb = load_workbook(LOOKUPS_PATH)
    if sheet_name not in wb.sheetnames:
        return False
    ws = wb[sheet_name]
    target = entry_value.strip().lower()
    # search rows 2+ in columns A–C (if present)
    for row in ws.iter_rows(min_row=2, max_col=3):
        val = row[0].value
        if isinstance(val, str) and val.strip().lower() == entry_value.strip().lower():
            # existing entry: update parent in Col B
            row[1].value = parent_value
            wb.save(LOOKUPS_PATH)
            return True

    # not found → build new row: [entry, parent, (color if sheet has 3 cols)]
    new_row = [entry_value.strip(), parent_value]
    # if this sheet already has 3 columns (i.e. a color column), generate one
    if ws.max_column >= 3:
        new_row.append(_get_random_color())
    ws.append(new_row)
    wb.save(LOOKUPS_PATH)
    return True


def get_asset_type_color(sheet_name: str, asset_type: str) -> str | None:
    """
    Read LOOKUPS_PATH[sheet_name] for asset_type in Col A,
    return the hex color in Col C (or None if missing sheet/row).
    """
    wb = load_workbook(LOOKUPS_PATH, data_only=True)
    if sheet_name not in wb.sheetnames:
        return None
    ws = wb[sheet_name]
    for row in ws.iter_rows(min_row=2, max_col=3):
        val = row[0].value
        if isinstance(val, str) and val.strip().lower() == asset_type.strip().lower():
            return row[2].value
    return None
