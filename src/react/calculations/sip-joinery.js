const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export const SIP_JOINERY_TYPES = [
  { value: "thermal", label: "Термобрус · дорогой" },
  { value: "board-pack", label: "Клеёный пакет · средний" },
  { value: "solid", label: "Брус ест. влажности · эконом" },
];

export function sipTimberProfile(panelThickness) {
  const thickness = Number(panelThickness) || 174;
  const core = thickness <= 124 ? 100 : thickness <= 174 ? 150 : 200;
  return {
    panelThickness: thickness,
    core,
    endBoardDepth: core - 5,
    thermalDepth: core - 5,
  };
}

export function gridJointLength(width, height, panelWidth, panelLength) {
  const seams = (across, along, unitAcross, unitAlong) =>
    Math.max(0, Math.ceil(across / unitAcross) - 1) * along +
    Math.max(0, Math.ceil(along / unitAlong) - 1) * across;
  return Math.min(
    seams(width, height, panelWidth, panelLength),
    seams(width, height, panelLength, panelWidth),
  );
}

const positive = (value, fallback) =>
  Math.max(0.0001, Number(value) || fallback);
const nonnegative = (value, fallback) =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;

function structuralScrew(panelThickness, formulas) {
  const thickness = Number(panelThickness) || 174;
  if (thickness <= 124)
    return {
      size: "8×180",
      kgEach: positive(formulas.sipStructuralScrewKg124, 0.055),
    };
  if (thickness <= 174)
    return {
      size: "8×220",
      kgEach: positive(formulas.sipStructuralScrewKg174, 0.068),
    };
  return {
    size: "8×280",
    kgEach: positive(formulas.sipStructuralScrewKg224, 0.086),
  };
}

export function calculateSipConsumables(
  cuttingRows,
  joinery,
  sipSettings,
  formulas = {},
) {
  const cuttingByKey = new Map(
    (cuttingRows || []).map((row) => [row.key, row]),
  );
  const mode = sipSettings.consumablesMode === "quick" ? "quick" : "node";
  const includeEdges = sipSettings.foamScope !== "joints";
  const seamSpacing = positive(formulas.sipSeamScrewSpacingM, 0.15);
  const edgeSpacing = positive(formulas.sipEdgeScrewSpacingM, 0.4);
  const structuralSpacing = positive(formulas.sipStructuralScrewSpacingM, 0.6);
  const foamPerMeter = nonnegative(formulas.foamUnitsPerJointMeter, 0.035);
  const supportPerPanel = Math.round(
    nonnegative(formulas.sipPanelSupportScrews, 8),
  );
  const seamKgEach = nonnegative(formulas.sipSeamScrewKgEach, 0.003);
  const edgeKgEach = nonnegative(formulas.sipEdgeScrewKgEach, 0.006);

  const rows = (joinery.rows || []).map((joineryRow) => {
    const cutting = cuttingByKey.get(joineryRow.key) || { panels: 0, area: 0 };
    if (mode === "quick") {
      return {
        key: joineryRow.key,
        label: joineryRow.label,
        mode,
        foamLength: 0,
        foamUnits: Math.ceil(
          cutting.panels * nonnegative(formulas.foamUnitsPerPanel, 0.5),
        ),
        structuralKg: round(
          cutting.area * nonnegative(formulas.structuralFastenerKgPerM2, 0.045),
        ),
        seamKg: round(
          cutting.area * nonnegative(formulas.seamScrewKgPerM2, 0.012),
        ),
        spiralPacks: Math.ceil(
          cutting.panels / positive(formulas.spiralPackPerPanels, 35),
        ),
      };
    }
    const foamLength =
      joineryRow.jointLength + (includeEdges ? joineryRow.endBoardLength : 0);
    const seamCount =
      Math.ceil((joineryRow.jointLength * 2) / seamSpacing) +
      cutting.panels * supportPerPanel;
    const edgeCount = Math.ceil(joineryRow.endBoardLength / edgeSpacing);
    const structuralCount = Math.ceil(
      joineryRow.endBoardLength / structuralSpacing,
    );
    const structural = structuralScrew(joineryRow.panelThickness, formulas);
    return {
      key: joineryRow.key,
      label: joineryRow.label,
      mode,
      foamLength: round(foamLength),
      foamUnits: Math.ceil(foamLength * foamPerMeter),
      seamCount,
      seamKg: round(seamCount * seamKgEach),
      edgeCount,
      edgeKg: round(edgeCount * edgeKgEach),
      structuralCount,
      structuralSize: structural.size,
      structuralKg: round(structuralCount * structural.kgEach),
      spiralPacks: 0,
    };
  });
  return {
    mode,
    foamScope: includeEdges ? "joints-and-edges" : "joints",
    rows,
    totals: rows.reduce(
      (total, row) => ({
        foamLength: round(total.foamLength + (row.foamLength || 0)),
        foamUnits: total.foamUnits + row.foamUnits,
        seamCount: total.seamCount + (row.seamCount || 0),
        edgeCount: total.edgeCount + (row.edgeCount || 0),
        structuralCount: total.structuralCount + (row.structuralCount || 0),
      }),
      {
        foamLength: 0,
        foamUnits: 0,
        seamCount: 0,
        edgeCount: 0,
        structuralCount: 0,
      },
    ),
  };
}

export function calculateSipJoinery(
  plan,
  services,
  sipSettings,
  formulas = {},
  metrics = {},
) {
  const width = Math.max(0, Number(plan.house?.w) || 0);
  const height = Math.max(0, Number(plan.house?.h) || 0);
  const wallHeight = Math.max(0, Number(plan.wallHeight) || 2.5);
  const panelWidth = Math.max(0.2, Number(formulas.panelWidth) || 1.25);
  const panelLength = Math.max(0.5, Number(formulas.panelLength) || 2.5);
  const floorLayoutWidth = Math.min(
    panelWidth,
    Math.max(0.2, Number(sipSettings.floorPanelWidth) || panelWidth),
  );
  const ceilingLayoutWidth = Math.min(
    panelWidth,
    Math.max(0.2, Number(sipSettings.ceilingPanelWidth) || panelWidth),
  );
  const secondFloorLayoutWidth = Math.min(
    panelWidth,
    Math.max(0.2, Number(sipSettings.secondFloorPanelWidth) || panelWidth),
  );
  const reserve =
    1 + Math.max(0, Number(formulas.sipTimberReservePercent) || 5) / 100;
  const perimeter = 2 * (width + height);
  const floorPlans = metrics.floorPlans?.length
    ? metrics.floorPlans
    : [{ plan, metrics }];
  const wallAssembly = floorPlans.reduce(
    (total, item) => {
      const currentPlan = item.plan;
      const currentWidth = Math.max(0, Number(currentPlan.house?.w) || 0);
      const currentHeight = Math.max(0, Number(currentPlan.house?.h) || 0);
      const currentWallHeight = Math.max(0, Number(currentPlan.wallHeight) || 2.5);
      const currentPerimeter = 2 * (currentWidth + currentHeight);
      const wallSeams = (wallLength) =>
        Math.max(0, Math.ceil(wallLength / panelWidth) - 1) * currentWallHeight +
        Math.max(0, Math.ceil(currentWallHeight / panelLength) - 1) * wallLength;
      const openingEdges = (currentPlan.openings || []).reduce(
        (sum, opening) =>
          opening.outer === false
            ? sum
            : sum +
              2 *
                (Math.max(0, Number(opening.width) || 0) +
                  Math.max(0, Number(opening.height) || 0)),
        0,
      );
      return {
        joints: total.joints + 2 * wallSeams(currentWidth) + 2 * wallSeams(currentHeight),
        edges:
          total.edges +
          2 * currentPerimeter +
          4 * currentWallHeight +
          openingEdges,
      };
    },
    { joints: 0, edges: 0 },
  );
  const topPlan = floorPlans.at(-1)?.plan || plan;
  const topWidth = Math.max(0, Number(topPlan.house?.w) || width);
  const topHeight = Math.max(0, Number(topPlan.house?.h) || height);
  const topPerimeter = 2 * (topWidth + topHeight);
  const secondPlan = floorPlans[1]?.plan;
  const secondWidth = Math.max(0, Number(secondPlan?.house?.w) || 0);
  const secondHeight = Math.max(0, Number(secondPlan?.house?.h) || 0);
  const openingWidth = Math.max(0, Number(secondPlan?.floorOpening?.width) || 0);
  const openingLength = Math.max(0, Number(secondPlan?.floorOpening?.length) || 0);
  const rows = [
    services.sipFloor
      ? {
          key: "floor",
          label: "Пол",
          thickness: sipSettings.floorThickness,
          layoutWidth: floorLayoutWidth,
          jointLength: gridJointLength(
            width,
            height,
            floorLayoutWidth,
            panelLength,
          ),
          endBoardLength: perimeter,
        }
      : null,
    services.sipWalls
      ? {
          key: "walls",
          label: "Наружные стены",
          thickness: sipSettings.wallThickness,
          jointLength: wallAssembly.joints,
          endBoardLength: wallAssembly.edges,
        }
      : null,
    services.sipSecondFloor && Number(metrics.secondFloorArea) > 0
      ? {
          key: "secondFloor",
          label: "Межэтажное перекрытие / пол 2 этажа",
          thickness: sipSettings.secondFloorThickness,
          layoutWidth: secondFloorLayoutWidth,
          jointLength: gridJointLength(
            secondWidth,
            secondHeight,
            secondFloorLayoutWidth,
            panelLength,
          ),
          endBoardLength:
            2 * (secondWidth + secondHeight) +
            (openingWidth > 0 && openingLength > 0
              ? 2 * (openingWidth + openingLength)
              : 0),
        }
      : null,
    services.sipCeiling
      ? {
          key: "ceiling",
          label: "Потолок",
          thickness: sipSettings.ceilingThickness,
          layoutWidth: ceilingLayoutWidth,
          jointLength: gridJointLength(
            topWidth,
            topHeight,
            ceilingLayoutWidth,
            panelLength,
          ),
          endBoardLength: topPerimeter,
        }
      : null,
    services.partitions &&
    sipSettings.partitionType === "sip" &&
    Number(metrics.partitionNetArea) > 0
      ? {
          key: "partitions",
          label: "Перегородки",
          thickness: sipSettings.partitionThickness,
          jointLength:
            Math.max(
              0,
              Math.ceil((Number(metrics.partitionLength) || 0) / panelWidth) -
                1,
            ) * wallHeight,
          endBoardLength:
            (Number(metrics.partitionLength) || 0) * 2 + wallHeight * 2,
        }
      : null,
  ]
    .filter(Boolean)
    .map((row) => ({
      ...row,
      ...sipTimberProfile(row.thickness),
      jointLength: round(row.jointLength * reserve),
      endBoardLength: round(row.endBoardLength * reserve),
    }));
  return {
    type: sipSettings.connectorType || "thermal",
    rows,
    totalJointLength: round(
      rows.reduce((sum, row) => sum + row.jointLength, 0),
    ),
    totalEndBoardLength: round(
      rows.reduce((sum, row) => sum + row.endBoardLength, 0),
    ),
  };
}
