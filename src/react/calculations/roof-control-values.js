// Display fallbacks only. A missing roof calculation must not invent a structural result.
export function roofRafterControlValues(settings = {}, calculatedRoof = null) {
  const calculated = settings.structureMode === 'auto' ? calculatedRoof?.rafterStructure : null;
  return {
    system: calculated?.system ?? settings.rafterSystem ?? '',
    step: calculated?.step ?? settings.rafterStep ?? '',
    section: calculated?.section ?? settings.rafterSection ?? '',
  };
}
