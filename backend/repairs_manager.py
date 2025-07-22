# backend/repairs_manager.py
# Handles reading/writing per‑station repair logs into individual Excel files under data/repairs/.

import os
import pandas as pd
from threading import Lock

# Where to store repair files
HERE        = os.path.dirname(__file__)
DATA_DIR    = os.path.abspath(os.path.join(HERE, '..', 'data'))
REPAIRS_DIR = os.path.join(DATA_DIR, 'repairs')

# Ensure directory exists
os.makedirs(REPAIRS_DIR, exist_ok=True)
_lock = Lock()

def _ensure_repair_file(station_id: str) -> str:
    """Create the repairs file with headers if missing, return its path."""
    path = os.path.join(REPAIRS_DIR, f'{station_id}_repairs.xlsx')
    if not os.path.exists(path):
        df = pd.DataFrame(columns=['ranking', 'cost', 'frequency'])
        df.to_excel(path, index=False)
    return path

def save_repair(station_id: str, repair: dict):
    """
    Append a repair row to data/repairs/{station_id}_repairs.xlsx.
    repair = { ranking: int, cost: float, freq: string }
    """
    path = _ensure_repair_file(station_id)
    with _lock:
        df = pd.read_excel(path)
        df.loc[len(df)] = {
            'ranking':  repair.get('ranking', 0),
            'cost':      repair.get('cost', 0),
            'frequency': repair.get('freq', '')
        }
        df.to_excel(path, index=False)
