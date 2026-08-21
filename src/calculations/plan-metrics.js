const DEFAULT_TOLERANCE = 0.04;

const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const roomPoints = (room = {}) =>
  Array.isArray(room.points) && room.points.length >= 3
    ? room.points
    : [
        { x: room.x, y: room.y },
        { x: (room.x || 0) + (room.w || 0), y: room.y },
        { x: (room.x || 0) + (room.w || 0), y: (room.y || 0) + (room.h || 0) },
        { x: room.x, y: (room.y || 0) + (room.h || 0) },
      ];

export const polygonArea = (points = []) => {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
};

const mergeIntervals = (intervals, tolerance) => {
  const sorted = intervals
    .map(([start, end]) => [Math.min(start, end), Math.max(start, end)])
    .sort((left, right) => left[0] - right[0]);
  const merged = [];
  sorted.forEach((interval) => {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1] + tolerance)
      merged.push(interval.slice());
    else last[1] = Math.max(last[1], interval[1]);
  });
  return merged.reduce(
    (sum, [start, end]) => sum + Math.max(0, end - start),
    0,
  );
};

const openingArea = (opening) =>
  Math.max(0, Number(opening.width) || 0) *
  Math.max(0, Number(opening.height) || 0);

const houseContourPoints = (plan) =>
  Array.isArray(plan?.house?.points) && plan.house.points.length >= 3
    ? plan.house.points
    : [
        { x: 0, y: 0 },
        { x: Number(plan?.house?.w) || 0, y: 0 },
        { x: Number(plan?.house?.w) || 0, y: Number(plan?.house?.h) || 0 },
        { x: 0, y: Number(plan?.house?.h) || 0 },
      ];

const polygonPerimeter = (points) =>
  points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);

const pointSegmentDistance = (point, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared
    ? Math.max(
        0,
        Math.min(
          1,
          ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
        ),
      )
    : 0;
  return Math.hypot(point.x - (a.x + ratio * dx), point.y - (a.y + ratio * dy));
};

const isOuterEdge = (a, b, plan, tolerance) => {
  const wall = Number(plan.wallThickness) || 0.174;
  const contour = houseContourPoints(plan);
  return contour.some((edgeStart, index) => {
    const edgeEnd = contour[(index + 1) % contour.length];
    return (
      pointSegmentDistance(a, edgeStart, edgeEnd) <= wall + tolerance &&
      pointSegmentDistance(b, edgeStart, edgeEnd) <= wall + tolerance
    );
  });
};

const inferOuterOpening = (opening, plan, tolerance) => {
  if (typeof opening.outer === "boolean") return opening.outer;
  const wall = Number(plan.wallThickness) || 0.174;
  const axes = [
    wall / 2,
    plan.house.w - wall / 2,
    wall / 2,
    plan.house.h - wall / 2,
  ];
  const coordinate = opening.orientation === "v" ? opening.x : opening.y;
  const relevant =
    opening.orientation === "v" ? axes.slice(0, 2) : axes.slice(2);
  return relevant.some((axis) => Math.abs(coordinate - axis) <= tolerance * 3);
};

export function calculatePlanMetrics(plan, tolerance = DEFAULT_TOLERANCE) {
  if (!plan?.house)
    throw new TypeError("Для расчёта нужен план с габаритами дома");
  const horizontal = new Map();
  const vertical = new Map();
  const diagonal = new Map();

  const addSegment = (a, b, allowOuter = false) => {
    if (!allowOuter && isOuterEdge(a, b, plan, tolerance)) return;
    if (Math.abs(a.y - b.y) <= tolerance) {
      const key = round((a.y + b.y) / 2, 2);
      if (!horizontal.has(key)) horizontal.set(key, []);
      horizontal.get(key).push([a.x, b.x]);
      return;
    }
    if (Math.abs(a.x - b.x) <= tolerance) {
      const key = round((a.x + b.x) / 2, 2);
      if (!vertical.has(key)) vertical.set(key, []);
      vertical.get(key).push([a.y, b.y]);
      return;
    }
    const first = `${round(a.x, 2)}:${round(a.y, 2)}`;
    const second = `${round(b.x, 2)}:${round(b.y, 2)}`;
    const key = first < second ? `${first}|${second}` : `${second}|${first}`;
    diagonal.set(key, Math.hypot(b.x - a.x, b.y - a.y));
  };

  let roomArea = 0;
  let openCeilingArea = 0;
  let extensionArea = 0;
  let extensionPerimeterDelta = 0;
  (plan.rooms || []).forEach((room) => {
    const points = roomPoints(room);
    if (room.include !== false) {
      const area = polygonArea(points);
      roomArea += area;
      if (room.extension) extensionArea += area;
      if (room.ceilingMode === "open-rafter") {
        const configured =
          room.openCeilingArea == null
            ? area
            : Math.max(0, Number(room.openCeilingArea) || 0);
        openCeilingArea += Math.min(area, configured);
      }
    }
    if (room.extension) {
      let perimeter = 0;
      let attached = 0;
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        perimeter += length;
        if (isOuterEdge(a, b, plan, tolerance)) attached += length;
      }
      extensionPerimeterDelta += perimeter - attached * 2;
      return;
    }
    for (let index = 0; index < points.length; index += 1) {
      addSegment(points[index], points[(index + 1) % points.length]);
    }
  });
  (plan.walls || []).forEach((wall) =>
    addSegment({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }),
  );

  let partitionLength = 0;
  horizontal.forEach((intervals) => {
    partitionLength += mergeIntervals(intervals, tolerance);
  });
  vertical.forEach((intervals) => {
    partitionLength += mergeIntervals(intervals, tolerance);
  });
  diagonal.forEach((length) => {
    partitionLength += length;
  });

  let exteriorOpeningsArea = 0;
  let interiorOpeningsArea = 0;
  let windowArea = 0;
  let doorArea = 0;
  (plan.openings || []).forEach((opening) => {
    const area = openingArea(opening);
    if (opening.includeInEstimate !== false) {
      if (opening.type === "window") windowArea += area;
      if (opening.type === "door") doorArea += area;
    }
    if (opening.subtractFromSip !== false) {
      if (inferOuterOpening(opening, plan, tolerance))
        exteriorOpeningsArea += area;
      else if (opening.type === "door") interiorOpeningsArea += area;
    }
  });

  const wallHeight = Math.max(0, Number(plan.wallHeight) || 2.5);
  let exteriorGapLength = 0;
  let interiorGapLength = 0;
  (plan.wallGaps || []).forEach((gap) => {
    const width = Math.max(0, Number(gap.width) || 0);
    if (inferOuterOpening(gap, plan, tolerance)) exteriorGapLength += width;
    else interiorGapLength += width;
  });
  partitionLength = Math.max(0, partitionLength - interiorGapLength);
  const houseContour = houseContourPoints(plan);
  const contourDefined = plan.house.contourDefined !== false;
  const perimeter = contourDefined
    ? Math.max(0, polygonPerimeter(houseContour) + extensionPerimeterDelta)
    : 0;
  const floorArea = contourDefined ? polygonArea(houseContour) + extensionArea : 0;
  openCeilingArea = Math.min(floorArea, openCeilingArea);
  const ceilingArea = Math.max(0, floorArea - openCeilingArea);
  const partitionGrossArea = partitionLength * wallHeight;
  const platformArea = (plan.platforms || []).reduce(
    (sum, platform) =>
      platform.include === false
        ? sum
        : sum + Math.max(0, platform.w || 0) * Math.max(0, platform.h || 0),
    0,
  );

  return {
    roomArea: round(roomArea, 2),
    floorArea: round(floorArea, 2),
    ceilingArea: round(ceilingArea, 2),
    openCeilingArea: round(openCeilingArea, 2),
    unassignedArea: round(Math.max(0, floorArea - roomArea), 2),
    perimeter: round(perimeter, 2),
    exteriorWallGrossArea: round(perimeter * wallHeight, 2),
    exteriorOpeningsArea: round(exteriorOpeningsArea, 2),
    exteriorWallNetArea: round(
      Math.max(
        0,
        perimeter * wallHeight -
          exteriorOpeningsArea -
          exteriorGapLength * wallHeight,
      ),
      2,
    ),
    partitionLength: round(partitionLength, 2),
    partitionGrossArea: round(partitionGrossArea, 2),
    interiorOpeningsArea: round(interiorOpeningsArea, 2),
    partitionNetArea: round(
      Math.max(0, partitionGrossArea - interiorOpeningsArea),
      2,
    ),
    wallGapLength: round(exteriorGapLength + interiorGapLength, 2),
    windowArea: round(windowArea, 2),
    doorArea: round(doorArea, 2),
    totalOpeningsArea: round(windowArea + doorArea, 2),
    platformArea: round(platformArea, 2),
  };
}

const CUTTING_RULES = {
  floor: { label: "Пол", waste: 1, cutNorm: 0.701 },
  walls: { label: "Стены", waste: 1.05, cutNorm: 0.324 },
  ceiling: { label: "Потолок", waste: 1.03, cutNorm: 0.165 },
  partitions: { label: "Перегородки", waste: 1.05, cutNorm: 0.324 },
  roof: { label: "Крыша", waste: 1.1, cutNorm: 0.324 },
};

function calculateCuttingRows(keys, surfaces, options = {}) {
  const panelArea = Math.max(0.1, Number(options.panelArea) || 3.125);
  const stockPanelWidth = Math.max(0.2, Number(options.panelWidth) || 1.25);
  const panelLength = Math.max(0.5, Number(options.panelLength) || 2.5);
  const extraWaste =
    1 + Math.max(0, Number(options.extraWastePercent) || 0) / 100;
  return keys.map((key) => {
    const rule = CUTTING_RULES[key];
    const area = Math.max(0, Number(surfaces?.[key]) || 0);
    const panels =
      area > 0 ? Math.ceil((area / panelArea) * rule.waste * extraWaste) : 0;
    const purchasedArea = panels * panelArea;
    const requestedLayoutWidth = Number(options.layoutWidths?.[key]);
    const layoutWidth =
      ["floor", "ceiling"].includes(key) && requestedLayoutWidth > 0
        ? Math.min(stockPanelWidth, requestedLayoutWidth)
        : stockPanelWidth;
    const stripsPerPanel = Math.max(
      1,
      Math.ceil(stockPanelWidth / layoutWidth - 1e-9),
    );
    const splitCutMeters =
      panels * Math.max(0, stripsPerPanel - 1) * panelLength;
    return {
      key,
      label: rule.label,
      area: round(area, 2),
      panels,
      purchasedArea: round(purchasedArea, 2),
      offcutArea: round(Math.max(0, purchasedArea - area), 2),
      layoutWidth: round(layoutWidth, 3),
      stripsPerPanel,
      splitCutMeters: round(splitCutMeters, 1),
      cutMeters: round(area * rule.cutNorm + splitCutMeters, 1),
    };
  });
}

export function calculateSipCutting(surfaces, options = {}) {
  const keys = ["floor", "walls", "ceiling"];
  if (options.includePartitions === true) keys.push("partitions");
  return calculateCuttingRows(keys, surfaces, options);
}

export function calculateSipRoofCutting(area, options = {}) {
  return calculateCuttingRows(["roof"], { roof: area }, options)[0];
}

export function roofGeometry({
  span,
  ridgeLength,
  ridgeHeight,
  shape = "gable",
  eaveOverhang = 0,
  gableOverhang = 0,
}) {
  const safeSpan = Math.max(0, Number(span) || 0);
  const safeLength = Math.max(0, Number(ridgeLength) || 0);
  const safeHeight = Math.max(0, Number(ridgeHeight) || 0);
  const safeEaveOverhang = Math.max(0, Number(eaveOverhang) || 0);
  const safeGableOverhang = Math.max(0, Number(gableOverhang) || 0);
  const roofSpan = safeSpan + safeEaveOverhang * 2;
  const roofLength = safeLength + safeGableOverhang * 2;
  if (shape === "flat") {
    const area = roofLength * roofSpan;
    return {
      shape: "flat",
      slopeLength: round(roofSpan, 3),
      wallSlopeLength: round(safeSpan, 3),
      slopeArea: round(area, 2),
      totalSlopeArea: round(area, 2),
      gableArea: 0,
      slopeCoefficient: 1,
      roofSpan: round(roofSpan, 3),
      roofLength: round(roofLength, 3),
      eaveOverhang: round(safeEaveOverhang, 3),
      gableOverhang: round(safeGableOverhang, 3),
    };
  }
  const halfSpan = safeSpan / 2;
  const wallSlopeLength = Math.hypot(halfSpan, safeHeight);
  const slopeLength = Math.hypot(halfSpan + safeEaveOverhang, safeHeight);
  if (shape === "hip") {
    const shortWall = Math.min(safeSpan, safeLength);
    const longWall = Math.max(safeSpan, safeLength);
    const halfHipSpan = shortWall / 2;
    const hipWallSlope = Math.hypot(halfHipSpan, safeHeight);
    const slopeCoefficient = halfHipSpan > 0 ? hipWallSlope / halfHipSpan : 1;
    const hipRoofSpan = shortWall + safeEaveOverhang * 2;
    const hipRoofLength = longWall + safeEaveOverhang * 2;
    const hipRidgeLength = Math.max(0, hipRoofLength - hipRoofSpan);
    const hipLength = Math.hypot(hipRoofSpan / Math.sqrt(2), safeHeight);
    return {
      shape: "hip",
      slopeLength: round((hipRoofSpan / 2) * slopeCoefficient, 3),
      wallSlopeLength: round(hipWallSlope, 3),
      slopeArea: round((hipRoofSpan * hipRoofLength * slopeCoefficient) / 4, 2),
      totalSlopeArea: round(hipRoofSpan * hipRoofLength * slopeCoefficient, 2),
      gableArea: 0,
      slopeCoefficient: round(slopeCoefficient, 3),
      roofSpan: round(hipRoofSpan, 3),
      roofLength: round(hipRoofLength, 3),
      ridgeLength: round(hipRidgeLength, 3),
      hipLength: round(hipLength * 4, 3),
      eaveOverhang: round(safeEaveOverhang, 3),
      gableOverhang: 0,
    };
  }
  return {
    shape: "gable",
    slopeLength: round(slopeLength, 3),
    wallSlopeLength: round(wallSlopeLength, 3),
    slopeArea: round(roofLength * slopeLength, 2),
    totalSlopeArea: round(roofLength * slopeLength * 2, 2),
    gableArea: round(safeSpan * safeHeight, 2),
    slopeCoefficient: round(halfSpan > 0 ? wallSlopeLength / halfSpan : 1, 3),
    roofSpan: round(roofSpan, 3),
    roofLength: round(roofLength, 3),
    eaveOverhang: round(safeEaveOverhang, 3),
    gableOverhang: round(safeGableOverhang, 3),
  };
}

export function planFootprintBounds(plan) {
  const contour = houseContourPoints(plan);
  const bounds = {
    minX: Math.min(...contour.map((point) => point.x)),
    minY: Math.min(...contour.map((point) => point.y)),
    maxX: Math.max(...contour.map((point) => point.x)),
    maxY: Math.max(...contour.map((point) => point.y)),
  };
  (plan?.platforms || []).forEach((platform) => {
    let minX = Number(platform.x) || 0;
    let minY = Number(platform.y) || 0;
    let maxX = minX + (Number(platform.w) || 0);
    let maxY = minY + (Number(platform.h) || 0);
    const stairDepth =
      Math.max(0, Math.round(Number(platform.steps) || 0)) *
      Math.max(0, Number(platform.tread) || 0.3);
    if (platform.stairSide === "left") minX -= stairDepth;
    if (platform.stairSide === "right") maxX += stairDepth;
    if (platform.stairSide === "top") minY -= stairDepth;
    if (platform.stairSide === "bottom") maxY += stairDepth;
    bounds.minX = Math.min(bounds.minX, minX);
    bounds.minY = Math.min(bounds.minY, minY);
    bounds.maxX = Math.max(bounds.maxX, maxX);
    bounds.maxY = Math.max(bounds.maxY, maxY);
  });
  return bounds;
}

export function chooseDimensionSides(plan) {
  const bounds = planFootprintBounds(plan);
  const width = Number(plan?.house?.w) || 0;
  const height = Number(plan?.house?.h) || 0;
  const leftObstruction = Math.max(0, -bounds.minX);
  const rightObstruction = Math.max(0, bounds.maxX - width);
  const topObstruction = Math.max(0, -bounds.minY);
  const bottomObstruction = Math.max(0, bounds.maxY - height);
  return {
    vertical: leftObstruction <= rightObstruction ? "left" : "right",
    horizontal: topObstruction <= bottomObstruction ? "top" : "bottom",
    bounds,
  };
}
