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

const lineInsidePolygonLength = (points, coordinate, vertical) => {
  const crossings = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const startAxis = vertical ? point.x : point.y;
    const endAxis = vertical ? next.x : next.y;
    if (
      !(
        (startAxis <= coordinate && endAxis > coordinate) ||
        (endAxis <= coordinate && startAxis > coordinate)
      )
    )
      return;
    const ratio = (coordinate - startAxis) / (endAxis - startAxis);
    crossings.push(
      (vertical ? point.y : point.x) +
        ratio * ((vertical ? next.y : next.x) - (vertical ? point.y : point.x)),
    );
  });
  crossings.sort((a, b) => a - b);
  let length = 0;
  for (let index = 0; index + 1 < crossings.length; index += 2)
    length += Math.max(0, crossings[index + 1] - crossings[index]);
  return length;
};

const polygonSeamLength = (points, xModule, yModule) => {
  const xs = points.map((point) => Number(point.x) || 0);
  const ys = points.map((point) => Number(point.y) || 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let length = 0;
  for (let x = minX + xModule; x < maxX - 1e-8; x += xModule)
    length += lineInsidePolygonLength(points, x, true);
  for (let y = minY + yModule; y < maxY - 1e-8; y += yModule)
    length += lineInsidePolygonLength(points, y, false);
  return length;
};

export function gridPolygonJointLength(points, panelWidth, panelLength) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  return Math.min(
    polygonSeamLength(points, panelWidth, panelLength),
    polygonSeamLength(points, panelLength, panelWidth),
  );
}

const positive = (value, fallback) =>
  Math.max(0.0001, Number(value) || fallback);
const nonnegative = (value, fallback) =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;

export function resolveSipStructuralScrew(panelThickness, formulas = {}) {
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
    const structural = resolveSipStructuralScrew(joineryRow.panelThickness, formulas);
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
  const stockLength = positive(formulas.sipTimberStockLength, 6);
  const contourPointsFor = (currentPlan) => {
    const points = Array.isArray(currentPlan?.house?.points)
      ? currentPlan.house.points
      : [];
    if (points.length >= 3) return points;
    const currentWidth = Math.max(0, Number(currentPlan?.house?.w) || 0);
    const currentHeight = Math.max(0, Number(currentPlan?.house?.h) || 0);
    return [
      { x: 0, y: 0 },
      { x: currentWidth, y: 0 },
      { x: currentWidth, y: currentHeight },
      { x: 0, y: currentHeight },
    ];
  };
  const perimeterFor = (currentPlan) => {
    const points = contourPointsFor(currentPlan);
    return points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + Math.hypot(next.x - point.x, next.y - point.y);
    }, 0);
  };
  const perimeter = perimeterFor(plan);
  const floorPlans = metrics.floorPlans?.length
    ? metrics.floorPlans
    : [{ plan, metrics }];
  const wallAssemblyFor = (item) => {
      const currentPlan = item?.plan || plan;
      const currentWidth = Math.max(0, Number(currentPlan.house?.w) || 0);
      const currentHeight = Math.max(0, Number(currentPlan.house?.h) || 0);
      const currentWallHeight = Math.max(0, Number(currentPlan.wallHeight) || 2.5);
      const currentPerimeter = perimeterFor(currentPlan);
      const wallSeams = (wallLength) =>
        Math.max(0, Math.ceil(wallLength / panelWidth) - 1) * currentWallHeight +
        Math.max(0, Math.ceil(currentWallHeight / panelLength) - 1) * wallLength;
      const openingEdges = (currentPlan.openings || []).reduce(
        (sum, opening) =>
          opening.outer === false || opening.subtractFromSip === false
            ? sum
            : sum +
              2 *
                (Math.max(0, Number(opening.width) || 0) +
                  Math.max(0, Number(opening.height) || 0)),
        0,
      );
      return {
        joints: contourPointsFor(currentPlan).reduce((sum, point, index) => {
          const next = contourPointsFor(currentPlan)[
            (index + 1) % contourPointsFor(currentPlan).length
          ];
          return sum + wallSeams(Math.hypot(next.x - point.x, next.y - point.y));
        }, 0),
        edges: 2 * currentPerimeter + 4 * currentWallHeight + openingEdges,
      };
    };
  const firstWallAssembly = wallAssemblyFor(floorPlans[0]);
  const secondWallAssembly = floorPlans[1]
    ? wallAssemblyFor(floorPlans[1])
    : { joints: 0, edges: 0 };
  const topPlan = floorPlans.at(-1)?.plan || plan;
  const topWidth = Math.max(0, Number(topPlan.house?.w) || width);
  const topHeight = Math.max(0, Number(topPlan.house?.h) || height);
  const topPerimeter = perimeterFor(topPlan);
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
          jointLength: gridPolygonJointLength(
            contourPointsFor(plan),
            floorLayoutWidth,
            panelLength,
          ),
          endBoardLength: perimeter,
        }
      : null,
    services.sipWalls
      ? {
          key: "walls",
          label: "Наружные стены 1 этажа",
          thickness: sipSettings.wallThickness,
          jointLength: firstWallAssembly.joints,
          endBoardLength: firstWallAssembly.edges,
        }
      : null,
    services.sipWalls && floorPlans.length > 1
      ? {
          key: "wallsSecondFloor",
          label: "Наружные стены 2 этажа",
          thickness: sipSettings.wallThickness,
          jointLength: secondWallAssembly.joints,
          endBoardLength: secondWallAssembly.edges,
        }
      : null,
    services.sipSecondFloor && Number(metrics.secondFloorArea) > 0
      ? {
          key: "secondFloor",
          label: "Межэтажное перекрытие / пол 2 этажа",
          thickness: sipSettings.secondFloorThickness,
          layoutWidth: secondFloorLayoutWidth,
          jointLength: gridPolygonJointLength(
            contourPointsFor(secondPlan),
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
          jointLength: gridPolygonJointLength(
            contourPointsFor(topPlan),
            ceilingLayoutWidth,
            panelLength,
          ),
          endBoardLength: topPerimeter,
        }
      : null,
    services.partitions &&
    sipSettings.partitionType === "sip" &&
    Number(metrics.firstFloorPartitionNetArea ?? metrics.partitionNetArea) > 0
      ? {
          key: "partitions",
          label: "Перегородки 1 этажа",
          thickness: sipSettings.partitionThickness,
          jointLength:
            Math.max(
              0,
              Math.ceil(
                (Number(metrics.firstFloorPartitionLength ?? metrics.partitionLength) || 0) /
                  panelWidth,
              ) -
                1,
            ) * wallHeight,
          endBoardLength:
            (Number(metrics.firstFloorPartitionLength ?? metrics.partitionLength) || 0) * 2 +
            wallHeight * 2,
        }
      : null,
    services.partitions &&
    sipSettings.partitionType === "sip" &&
    Number(metrics.secondFloorPartitionNetArea) > 0
      ? {
          key: "partitionsSecondFloor",
          label: "Перегородки 2 этажа",
          thickness: sipSettings.partitionThickness,
          jointLength:
            Math.max(
              0,
              Math.ceil(
                (Number(metrics.secondFloorPartitionLength) || 0) / panelWidth,
              ) - 1,
            ) * Math.max(0, Number(secondPlan?.wallHeight) || wallHeight),
          endBoardLength:
            (Number(metrics.secondFloorPartitionLength) || 0) * 2 +
            Math.max(0, Number(secondPlan?.wallHeight) || wallHeight) * 2,
        }
      : null,
  ]
    .filter(Boolean)
    .map((row) => ({
      ...row,
      ...sipTimberProfile(row.thickness),
      jointLength: round(row.jointLength * reserve),
      endBoardLength: round(row.endBoardLength * reserve),
    }))
    .map((row) => {
      const jointStockPieces = Math.ceil(row.jointLength / stockLength);
      const endBoardStockPieces = Math.ceil(row.endBoardLength / stockLength);
      return {
        ...row,
        stockLength,
        jointStockPieces,
        jointPurchaseLength: round(jointStockPieces * stockLength),
        endBoardStockPieces,
        endBoardPurchaseLength: round(endBoardStockPieces * stockLength),
      };
    });
  return {
    type: sipSettings.connectorType || "thermal",
    rows,
    totalJointLength: round(
      rows.reduce((sum, row) => sum + row.jointLength, 0),
    ),
    totalEndBoardLength: round(
      rows.reduce((sum, row) => sum + row.endBoardLength, 0),
    ),
    totalJointPurchaseLength: round(
      rows.reduce((sum, row) => sum + row.jointPurchaseLength, 0),
    ),
    totalEndBoardPurchaseLength: round(
      rows.reduce((sum, row) => sum + row.endBoardPurchaseLength, 0),
    ),
  };
}
