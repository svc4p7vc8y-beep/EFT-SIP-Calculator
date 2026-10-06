// Explicit zero is a project dimension, not a missing value.
export function exteriorHeight(plan) {
  const value = plan?.wallHeight;
  return value == null || value === '' || !Number.isFinite(Number(value))
    ? 2.5 : Math.max(0, Number(value));
}

export function partitionHeight(plan) {
  if (plan?.floorType !== 'attic') return exteriorHeight(plan);
  const value = plan?.partitionHeight;
  return value != null && value !== '' && Number.isFinite(Number(value))
    ? Math.max(0, Number(value)) : 2.5;
}

export function hasHorizontalCeiling(plan) {
  return plan?.floorType !== 'attic' || plan.atticHorizontalCeiling === true;
}
