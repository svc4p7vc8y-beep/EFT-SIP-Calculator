export function roofControlVisibility(roof = {}) {
  const shape = roof.shape || "gable";
  const type = roof.type || "cold";
  const isFlat = shape === "flat";
  const isGable = shape === "gable";
  const isTiered = shape === 'tiered';
  const hasTimberStructure = type !== "sip";
  const hasSipStructure = type !== "cold";
  const includeCovering = roof.includeCovering !== false;

  return {
    isFlat,
    isGable,
    showRafterStructure: hasTimberStructure,
    showRafterSystem: hasTimberStructure && !isFlat && !isTiered,
    showRafterDimensions: hasTimberStructure,
    showSipFrame: hasSipStructure,
    showMauerlat: type !== 'sip' && !(type === 'combo' && Number(roof.warmPercent) >= 100),
    showRafterSupport: hasTimberStructure,
    showGableOverhang: shape !== "hip",
    showMainAccessories: !isFlat && includeCovering,
    showEaveTrim: !isFlat && includeCovering,
    showRidgeSeal: (isGable || shape === 'hip') && includeCovering,
    showGutter: !isFlat && includeCovering,
    showVergeTrim: (isGable || isTiered) && includeCovering,
  };
}
