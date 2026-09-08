export function roofControlVisibility(roof = {}) {
  const shape = roof.shape || "gable";
  const type = roof.type || "cold";
  const isFlat = shape === "flat";
  const isGable = shape === "gable";
  const hasTimberStructure = type !== "sip";

  return {
    isFlat,
    isGable,
    showRafterStructure: hasTimberStructure,
    showRafterSystem: hasTimberStructure && !isFlat,
    showRafterDimensions: hasTimberStructure,
    showMauerlat: !isFlat,
    showRafterSupport: hasTimberStructure && !isFlat,
    showGableOverhang: shape !== "hip",
    showMainAccessories: !isFlat,
    showVergeTrim: isGable,
  };
}
