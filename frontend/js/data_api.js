// data_api.js
// Exposes a thin wrapper (window.electronAPI) that maps front‑end calls to your Python/Eel functions.

// Wrapper for calling Python functions
function fetchInfrastructureData() {
  return eel.get_infrastructure_data()();
}

// map Electron‑style calls to Eel
window.electronAPI = {
  getLocations:     () => eel.get_locations()(),
  addNewLocation:   loc => eel.add_new_location(loc)(),
  getAssetTypes:    () => eel.get_asset_types()(),
  addNewAssetType:  at  => eel.add_new_asset_type(at)(),
  getStationData:   () => eel.get_infrastructure_data()(),
  createNewStation: obj => eel.create_new_station(obj)(),

  getCompanies:     () => eel.get_companies()(),
addNewCompany: (name, active=false) => eel.add_new_company(name, active)(),

  getLocationsForCompany: (company) => eel.get_locations_for_company(company)(),
  getAssetTypesForLocation: (company, location) => eel.get_asset_types_for_location(company, location)(),
  addAssetTypeUnderLocation: (assetType, company, location) => eel.add_asset_type_under_location(assetType, company, location)(),
  getActiveFilters: () => eel.get_active_filters()(),
  addLocationUnderCompany: (company, location) => eel.add_location_under_company(location, company)(),
  dataNuke:            () => eel.data_nuke()(),
  getExcelSheetNames: b64 => eel.get_excel_sheet_names(b64)(),
  importExcelSheet:   (b64, sheet, location, assetType) => eel.import_excel_sheet(b64, sheet, location, assetType)(),

};

