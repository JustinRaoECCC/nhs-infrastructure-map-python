# backend/config.py
# Holds configuration flags (USE_DATABASE) and the SQLAlchemy connection URL

import os

# Toggle to True to start reading/writing from SQL (lazy‑migrates on read)
USE_DATABASE = False   # ← set to True when you want SQL mode


# SQLAlchemy URL; e.g. sqlite for dev, later point at Postgres/MySQL
DB_URL = "sqlite:///data/app.db"
