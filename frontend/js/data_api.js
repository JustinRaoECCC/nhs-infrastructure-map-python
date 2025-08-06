// data_api.js
// Exposes a thin wrapper (window.electronAPI) that maps front-end calls to your Python/Eel functions.

// ─── Cache infra data so we only hit Eel once ───────────────────────────────
let stationDataCache = null;

/**
 * Fetch all station data, caching the result.
 */
async function fetchInfrastructureData() {
  if (!stationDataCache) {
    stationDataCache = await eel.get_infrastructure_data()();
  }
  return stationDataCache;
}

// ─── Exposed API ─────────────────────────────────────────────────────────────
window.electronAPI = {
  // — Lookups —
  getLocations:           ()            => eel.get_locations()(),
  addNewLocation:         loc           => eel.add_new_location(loc)(),
  getAssetTypes:          ()            => eel.get_asset_types()(),
  addNewAssetType:        at            => eel.add_new_asset_type(at)(),
  getAssetTypeColor:      at            => eel.get_asset_type_color_lookup(at)(),
  setAssetTypeColor:      (at, color)   => eel.set_asset_type_color(at, color)(),

  // — Location-specific color —
  getAssetTypeColorForLocation: (at, loc)          => eel.get_asset_type_color_for_location(at, loc)(),
  setAssetTypeColorForLocation: async (at, loc, color) => {
    const res = await eel.set_asset_type_color_for_location(at, loc, color)();
    if (res.success) stationDataCache = null;
    return res;
  },

  // — Station data —
  getStationData:         ()            => fetchInfrastructureData(),
  createNewStation:       async obj      => {
    const res = await eel.create_new_station(obj)();
    if (res.success) stationDataCache = null;
    return res;
  },

  // — Company & filters —
  getCompanies:                ()                      => eel.get_companies()(),
  addNewCompany:               (name, active = false) => eel.add_new_company(name, active)(),
  getActiveCompanies:          ()                      => eel.get_active_companies()(),
  getLocationsForCompany:      company                 => eel.get_locations_for_company(company)(),
  getAssetTypesForLocation:    (company, location)     => eel.get_asset_types_for_location(company, location)(),
  addAssetTypeUnderLocation:   (assetType, company, location) =>
                                eel.add_asset_type_under_location(assetType, company, location)(),
  getActiveFilters:            ()                      => eel.get_active_filters()(),
  addLocationUnderCompany:     (company, location)     => eel.add_location_under_company(location, company)(),

  // — Excel import —
  getExcelSheetNames:          b64                     => eel.get_excel_sheet_names(b64)(),
  importExcelSheet:            async (b64, sheet, location, assetType) => {
    const res = await eel.import_excel_sheet(b64, sheet, location, assetType)();
    if (res.success) stationDataCache = null;
    return res;
  },

  // — Edit station details —
  saveStationDetails:         async obj   => {
    const res = await eel.save_station_details(obj)();
    if (res.success) stationDataCache = null;
    return res;
  },
  deleteStation:              async id    => {
    const res = await eel.delete_station(id)();
    if (res.success) stationDataCache = null;
    return res;
  },

  // — Nuke everything —
  dataNuke:                   ()            => eel.data_nuke()(),

  getCustomWeights:       ()            => eel.get_custom_weights()(),
  addCustomWeight:        (wt,act=false) => eel.add_custom_weight(wt,act)(),
  saveWorkplanDetails:        (entries)     => eel.save_workplan_details(entries)(),
  saveWorkplanConstants:      (entries)     => eel.save_workplan_constants(entries)(),
  getWorkplanDetails:         ()            => eel.get_workplan_details()(),
  getWorkplanConstants:       ()            => eel.get_workplan_constants()(),
  optimizeWorkplan:           ()            => eel.optimize_workplan()(),

};
