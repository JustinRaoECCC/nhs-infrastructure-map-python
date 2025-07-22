# backend/excel_handler.py
# A legacy helper for loading station data from a single Excel workbook via pandas, used where fine‑grained control is needed.

import pandas as pd

class ExcelHandler:
    def __init__(self, filepath):
        self.filepath = filepath

    def load_stations(self):
        """
        Read station list from an Excel file at self.filepath.
        Keeps only key columns and renames them to simple keys.
        Dates are ISO‑formatted as strings.
        """
        df = pd.read_excel(self.filepath)

        # Rename to simple keys
        df = df.rename(columns={
            'Station ID': 'station_id',
            'Station Name': 'name',
            'Latitude': 'lat',
            'Longitude': 'lon',
            'General Information - Province': 'province',
            'General Information - Inspection Frequency': 'inspection_frequency',
            'General Information - Next Inspection': 'next_inspection',
            'General Information - Structure Type': 'structure_type',
            'Status': 'status',
            'Site Information - Operating Office': 'operating_office',
            'Site Information - Technician': 'technician',
            'Site Information - Year Built': 'year_built',
        })

        # Convert dates to ISO strings (so Eel/JS can handle them)
        if pd.api.types.is_datetime64_any_dtype(df['next_inspection']):
            df['next_inspection'] = df['next_inspection'].dt.strftime('%Y-%m-%d')

        # Ensure lat/lon are numeric
        df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
        df['lon'] = pd.to_numeric(df['lon'], errors='coerce')

        # Select only the columns we want
        cols = [
            'station_id', 'name', 'lat', 'lon',
            'province', 'status', 'inspection_frequency',
            'next_inspection', 'structure_type',
            'operating_office', 'technician', 'year_built'
        ]
        # Drop rows missing coordinates
        df = df.dropna(subset=['lat', 'lon'])

        return df[cols].to_dict(orient='records')
