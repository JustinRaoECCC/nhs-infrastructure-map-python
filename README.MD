NHS Infrastructure Map
A Python + Eel Desktop Mapping Tool for Infrastructure Management

🗺️ Overview
NHS Infrastructure Map is a cross-platform desktop application for visualizing, managing, and editing NHS infrastructure records stored in Excel workbooks.

It uses:

Python + Eel for backend logic and desktop hosting

Leaflet.js for interactive mapping

Excel workbooks (.xlsx) for structured data storage

Designed for:
Field Engineers

Operations Managers

Maintenance Teams

This tool streamlines data entry, inspection tracking, and prioritization of repairs using a familiar desktop environment.

🚀 Features
Interactive Map (Leaflet.js):
Pan, zoom, view infrastructure markers by category and priority.

Dynamic Filtering & Search:
Filter by region, asset type, or custom categories with color-coded markers.

CRUD Operations on Excel Data:
Add, edit, or remove station records directly via the app interface.

Bulk Import:
Import infrastructure data from Excel sheets with duplicate detection.

Priority Repairs View:
Focus on urgent repairs grouped by priority.

Export to PDF:
Capture map views or list views as PDF snapshots.

Safe Data Wipe (Data Nuke):
Triple-confirmation delete of Excel data files when required.

🗂️ Project Structure
yaml
Copy
Edit
nhs-infrastructure-map-python/
├── backend/                       # Python backend logic
│   ├── app.py                     # Eel startup and routing
│   ├── excel_handler.py           # CRUD on Excel files
│   ├── lookups_manager.py         # Lookup table management
│   ├── bulk_importer.py           # Bulk import logic
│   ├── export_manager.py          # PDF export tools
│   ├── data_nuke.py               # Controlled data deletion logic
│   ├── file_locks.py              # Mutex lock handling
│   └── utils.py                   # Common helper functions
├── frontend/                      # HTML/JS/CSS frontend served by Eel
│   ├── index.html                 # Main Map UI
│   ├── list_view.html             # List of stations view
│   ├── repairs_view.html          # Priority repairs view
│   ├── css/
│   │   └── style.css              # Application styles
│   ├── js/
│   │   ├── main.js                # App init and routing
│   │   ├── map_view.js            # Leaflet logic
│   │   ├── filters.js             # Filtering and search
│   │   ├── data_api.js            # JS ↔ Python (Eel) bridge
│   │   ├── modals.js              # Modal handling (CRUD)
│   │   ├── list_view.js           # List view logic
│   │   ├── repairs_view.js        # Repairs-specific logic
│   │   ├── export.js              # PDF export frontend logic
│   │   ├── nuke.js                # Data nuke logic
│   │   └── utils.js               # Common JS utilities
│   └── assets/
│       ├── icons/                 # Marker icons and graphics
│       └── placeholder.txt
├── data/                          # Generated Excel data files
│   ├── repairs/
│   │   └── <station>_repairs.xlsx
│   ├── lookups.xlsx
│   ├── <asset_type>.xlsx
│   └── placeholder.txt
├── tests/                         # Python unit tests
├── requirements.txt               # Python package list
├── README.md                       # (This file)
├── run.py                         # Main app runner
└── setup.sh                        # (Optional) Setup script
🐍 Dependencies
These Python packages are required and installed inside the virtual environment:

eel — Desktop Python + JS bridge

openpyxl — Excel reading/writing

pandas — Data manipulation and lookups

watchdog — File change monitoring (optional)

reportlab — PDF generation

Installed with:

nginx
Copy
Edit
pip install eel openpyxl pandas watchdog reportlab
🖥️ Your Daily Workflow
Step	Command
1️⃣ Open VS Code on the network project folder	File → Open Folder → (select network path)
2️⃣ Open VS Code terminal	Ctrl + `` (backtick)
3️⃣ Activate your local virtual environment	C:\Users\RaoJ\venvs\nhs-map\venv\Scripts\activate
4️⃣ (Optional) Use pushd in terminal if needed	pushd "\\Network\Path\To\Project"
5️⃣ Run your app	python run.py
6️⃣ Edit code & test	Use VS Code normally
7️⃣ When done	deactivate or close terminal

🛠️ Setting Up Virtual Environment (One-Time)
1️⃣ Create on your local machine (never on network drive):

arduino
Copy
Edit
cd C:\Users\RaoJ\venvs\
mkdir nhs-map
cd nhs-map
python -m venv venv
2️⃣ Install dependencies:

arduino
Copy
Edit
C:\Users\RaoJ\venvs\nhs-map\venv\Scripts\activate
pip install eel openpyxl pandas watchdog reportlab
👥 If Someone Else Wants to Use the App
1️⃣ They must have Python 3.11+ installed
2️⃣ They must create their own virtual environment on their local PC:

nginx
Copy
Edit
python -m venv venv
3️⃣ They must install the dependencies inside their venv:

nginx
Copy
Edit
pip install eel openpyxl pandas watchdog reportlab
4️⃣ They open VS Code, activate their venv in terminal, and navigate to:

arduino
Copy
Edit
\\Ecbcv6cwvfsp001.ncr.int.ec.gc.ca\msc$\401\WSCConstruction\Engineering_Services_West\Cableway and Facilities\Work Plan\BC\2025\Working Folders\Justin\nhs-infrastructure-map-python
5️⃣ Run:

arduino
Copy
Edit
python run.py
✅ They do NOT create the venv on the network folder.
✅ Each person uses their own local venv but works on the shared code.

📢 Important Notes for Collaborators
No admin rights required

Always activate your own venv before running the app

Python venv is not shared — it’s personal per user

Feel free to copy this README and personalize your setup

📝 License & Contributions
Internal project for Government of Canada engineering services.
Contact Justin Rao for questions, issues, or contributions.


C:\Users\RaoJ\venvs\nhs-map\venv\Scripts\activate