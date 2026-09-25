export function roofControlVisibility(roof = {}) {
  const shape = roof.shape || "gable";
  const type = roof.type || "cold";
  const isFlat = shape === "flat";
  const isGable = shape === "gable";
  const hasTimberStructure = type !== "sip";
  const hasSipStructure = type !== "cold";
  const includeCovering = roof.includeCovering !== false;

  return {
    isFlat,
    isGable,
    showRafterStructure: hasTimberStructure,
    showRafterSystem: hasTimberStructure && !isFlat,
    showRafterDimensions: hasTimberStructure,
    showSipFrame: hasSipStructure,
    showMauerlat: !isFlat,
    showRafterSupport: hasTimberStructure && !isFlat,
    showGableOverhang: shape !== "hip",
    showMainAccessories: !isFlat && includeCovering,
    showVergeTrim: isGable,
  };
}
