# backend/data_nuke.py

import os
import glob
import sys
import eel
from .lookups_manager import DATA_DIR, LOCATIONS_DIR, REPAIRS_DIR
from .config import DB_URL

@eel.expose
def data_nuke():
    """
    Delete every .xlsx and .db under data/, then restart Python.
    """
    try:
        from .app import dm
        if hasattr(dm, 'db') and hasattr(dm.db, 'engine'):
            dm.db.engine.dispose()
    except Exception:
        pass

    patterns = [
        os.path.join(DATA_DIR, '*.xlsx'),
        os.path.join(DATA_DIR, '*.db'),
        os.path.join(REPAIRS_DIR, '*.xlsx'),
        os.path.join(LOCATIONS_DIR, '*.xlsx'),
        os.path.join(DATA_DIR, 'repairs', '*.xlsx'),
    ]

    # Also delete the SQLite file(s) created by SQLAlchemy in the project root’s data/ folder
    # DB_URL is like "sqlite:///data/app.db"
    db_rel = DB_URL.split(":///")[-1]                       # e.g. "data/app.db"
    db_dir = os.path.dirname(os.path.abspath(db_rel))      # absolute path to that folder

    patterns.append(os.path.join(db_dir, '*.db'))
    for pattern in patterns:
        for fpath in glob.glob(pattern):
            try:
                os.remove(fpath)
            except OSError:
                pass

    # restart the Python/Eel process
    python = sys.executable
    os.execv(python, [python] + sys.argv)