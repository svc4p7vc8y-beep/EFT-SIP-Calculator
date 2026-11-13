const equipment={plumbing:['hydro-tank','water-heater','water-filter','pump'],heating:['boiler','heat-pump','expansion-tank','pump','water-heater'],sewer:[]};
export function engineeringCatalogIncludes(preset,system){return preset.layer===system||preset.layer==='equipment'&&(equipment[system]||[]).includes(preset.id);}
export function engineeringDrawingPreset(preset,system){return preset&&preset.layer==='equipment'&&engineeringCatalogIncludes(preset,system)?{...preset,layer:system}:preset;}
