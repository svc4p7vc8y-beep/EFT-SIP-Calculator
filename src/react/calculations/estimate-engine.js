import {
  calculateGridContourCutLength,
  calculatePlanMetrics,
  calculateSipCutting,
  calculateSipRoofCutting,
  calculateWallCutLength,
  roofGeometry,
} from "../../calculations/plan-metrics.js";
import { resolveRoofAxes } from "../../calculations/roof-orientation.js";
import { calculateTerraceRoof } from "../../calculations/terrace-model.js";
import { calculateFoundation } from "./foundation-model.js";
import { deriveLinkedInputs } from "./calculation-links.js";
import { isInteriorDoor } from './opening-types.js';
import { calculateExterior } from './exterior-model.js';
import { calculateInternal } from './internal-model.js';
import { calculateEngineering } from './engineering-model.js';
import {
  calculateSipConsumables,
  calculateSipJoinery,
  resolveSipSupportScrew,
  resolveSipStructuralScrew,
} from "./sip-joinery.js";

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const formatNumberForName = (value) => String(round(value, 2)).replace(".", ",");

function catalogIndex(project) {
  const entries = [...project.priceMat, ...project.priceLab];
  return {
    entries,
    byId: new Map(entries.map((item) => [item.id, item])),
    exact: new Map(
      entries.map((item) => [item.name.toLocaleLowerCase("ru"), item]),
    ),
  };
}

function findCatalog(index, query, kind) {
  const normalized = query.toLocaleLowerCase("ru");
  const exact = index.exact.get(normalized);
  if (exact && (!kind || exact.kind === kind)) return exact;
  return index.entries.find(
    (item) =>
      (!kind || item.kind === kind) &&
      item.name.toLocaleLowerCase("ru").includes(normalized),
  );
}

function makeLine(index, section, query, qty, options = {}) {
  const amount = Math.max(0, Number(qty) || 0);
  if (!amount) return null;
  const item = options.catalogId ? index.byId.get(options.catalogId) : findCatalog(index, query, options.kind);
  return {
    id: `${section}:${options.key || query}`,
    section,
    catalogId: item?.id,
    name: options.name || item?.name || query,
    unit: options.unit || item?.unit || "шт",
    qty: round(amount, options.digits ?? 2),
    price:
      (Number(item?.price) || Number(options.price) || 0) *
      (Number(options.priceMultiplier) || 1),
    kind: item?.kind || options.kind || "material",
    source: options.source || section,
    estimateGroup: options.estimateGroup,
    ...(item?.pricePending === true && !(Number(item?.price) > 0 || Number(options.price) > 0) ? { pricePending: true } : {}),
    ...(options.exactQuantity === true ? { exactQuantity: true } : {}),
  };
}

function compact(lines) {
  return lines.filter(Boolean);
}

function housePerimeterRuns(plan = {}) {
  const points = Array.isArray(plan.house?.points) ? plan.house.points : [];
  if (points.length >= 3) {
    return points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      return Math.hypot(
        (Number(next?.x) || 0) - (Number(point?.x) || 0),
        (Number(next?.y) || 0) - (Number(point?.y) || 0),
      );
    }).filter((length) => length > 0.001);
  }
  const width = Math.max(0, Number(plan.house?.w) || 0);
  const height = Math.max(0, Number(plan.house?.h) || 0);
  return [width, height, width, height].filter(Boolean);
}

function houseContourPoints(plan = {}) {
  const points = Array.isArray(plan.house?.points) ? plan.house.points : [];
  if (points.length >= 3) return points;
  const width = Math.max(0, Number(plan.house?.w) || 0);
  const height = Math.max(0, Number(plan.house?.h) || 0);
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

function openingCutLength(plan = {}, outer) {
  return (plan.openings || []).reduce((sum, opening) => {
    if ((opening.outer !== false) !== outer || opening.subtractFromSip === false)
      return sum;
    return (
      sum +
      2 *
        (Math.max(0, Number(opening.width) || 0) +
          Math.max(0, Number(opening.height) || 0))
    );
  }, 0);
}

function roomPerimeter(room = {}) {
  const points = Array.isArray(room.points) && room.points.length >= 3
    ? room.points
    : [
        { x: room.x, y: room.y },
        { x: (Number(room.x) || 0) + (Number(room.w) || 0), y: room.y },
        {
          x: (Number(room.x) || 0) + (Number(room.w) || 0),
          y: (Number(room.y) || 0) + (Number(room.h) || 0),
        },
        { x: room.x, y: (Number(room.y) || 0) + (Number(room.h) || 0) },
      ];
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(
      (Number(next.x) || 0) - (Number(point.x) || 0),
      (Number(next.y) || 0) - (Number(point.y) || 0),
    );
  }, 0);
}

function resolveRafterStructure(project, geometry, frameLength) {
  const roof = project.settings.roof || {};
  const automatic = (roof.structureMode || "auto") === "auto";
  const floorCount = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const roofSupportPlan =
    floorCount > 1 ? project.upperFloors?.[floorCount - 2] || project.plan : project.plan;
  const hasBearingSupport = (roofSupportPlan.rooms || []).some(
    (room) => room.include !== false && room.bearing,
  );
  const system =
    geometry.shape === "flat"
      ? "flat"
      : automatic
        ? hasBearingSupport
          ? "layered"
          : "hanging"
        : ["hanging", "layered", "truss"].includes(roof.rafterSystem)
          ? roof.rafterSystem
          : "hanging";
  const step = automatic
    ? 0.6
    : Math.min(1.2, Math.max(0.3, Number(roof.rafterStep) || 0.6));
  const section = automatic
    ? (geometry.wallSlopeLength || geometry.slopeLength) <= 7
      ? "50x150"
      : "50x200"
    : roof.rafterSection === "50x200"
      ? "50x200"
      : "50x150";
  const boardWidth = 0.05;
  const module = step + boardWidth;
  const pairCount = frameLength > 0 ? Math.ceil(frameLength / module) + 1 : 0;
  const legCount = geometry.shape === "flat" ? pairCount : pairCount * 2;
  return {
    automatic,
    system,
    step,
    section,
    boardWidth,
    module,
    frameLength,
    pairCount,
    legCount,
  };
}

function applyProjectEstimateEdits(project, sections) {
  const overrides = new Map(
    (project.estimateOverrides || []).map((item) => [item.lineId, item]),
  );
  const customBySection = new Map();
  (project.customEstimateLines || []).forEach((line) => {
    if (!customBySection.has(line.section))
      customBySection.set(line.section, []);
    customBySection.get(line.section).push({
      ...line,
      custom: true,
      qty: Math.max(0, Number(line.qty) || 0),
      price: Math.max(0, Number(line.price) || 0),
      kind: line.kind === "labor" ? "labor" : "material",
    });
  });
  return sections.map((section) => {
    const generated = section.lines.flatMap((line) => {
      const override = overrides.get(line.id);
      if (override?.excluded) return [];
      if (!override) return [line];
      const catalogMatches =
        override.catalogId === undefined ||
        override.catalogId === null ||
        override.catalogId === line.catalogId;
      if (!catalogMatches) return [line];
      return [
        {
          ...line,
          ...Object.fromEntries(
            ["name", "kind", "unit", "qty", "price"]
              .filter((key) => override[key] !== undefined)
              .map((key) => [key, override[key]]),
          ),
          projectOverride: true,
          pricePending: !(Number(override.price ?? line.price) > 0),
        },
      ];
    });
    return {
      ...section,
      lines: [...generated, ...(customBySection.get(section.key) || [])],
    };
  });
}

function sipPanelName(thickness, family = "pps") {
  const familyName =
    family === "mineral-wool"
      ? "минвата"
      : family === "csp-pps"
        ? "CSP PPS"
        : "PPS";
  return `СИП-панель ${familyName} 2500×1250×${thickness} мм`;
}

function roofCoveringSpec(value) {
  if (value === "metal-tile")
    return {
      key: "metal-tile",
      material: "Металлочерепица окрашенный",
      labor: "Монтаж металлочерепицы",
      label: "Металлочерепица",
      screws: true,
      osb: false,
    };
  if (value === "soft")
    return {
      key: "soft",
      material: "Гибкая черепица",
      labor: "Монтаж мягкой кровли",
      label: "Мягкая кровля",
      screws: false,
      osb: true,
    };
  return {
    key: "profile",
    material: "Профлист С-21 окрашенный",
    labor: "Монтаж кровельного покрытия — профлист С-21",
    label: "Профлист С-21",
    screws: true,
    osb: false,
  };
}

function applyMainRoofComplexity(lines, shape) {
  if (shape !== "hip") return lines;
  const discreteUnits = new Set(["шт", "уп", "рулон", "компл"]);
  return lines.map((line) => {
    if (String(line.source || "").startsWith("platform-")) return line;
    if (line.kind === "labor") {
      return {
        ...line,
        basePrice: line.price,
        price: round(line.price * 1.5, 2),
        costCoefficient: 1.5,
        costReason: "Вальмовая кровля: сложность работ +50%",
      };
    }
    if (line.exactQuantity) return line;
    const adjustedQty = discreteUnits.has(line.unit)
      ? Math.ceil(line.qty * 1.25)
      : round(line.qty * 1.25, line.unit === "м³" ? 3 : 2);
    return {
      ...line,
      baseQty: line.qty,
      qty: adjustedQty,
      quantityCoefficient: 1.25,
      costReason: "Вальмовая кровля: запас материалов +25%",
    };
  });
}

function calculateBuildingMetrics(project) {
  const floorCount = Math.max(
    1,
    Math.min(2, Math.round(Number(project.meta?.floors) || 1)),
  );
  const plans = [project.plan, ...(project.upperFloors || []).slice(0, floorCount - 1)];
  const floorPlans = plans.map((plan, index) => ({
    floor: index + 1,
    plan,
    metrics: calculatePlanMetrics(plan),
  }));
  const base = floorPlans[0].metrics;
  const top = floorPlans.at(-1).metrics;
  const secondPlan = floorPlans[1]?.plan;
  const secondMetrics = floorPlans[1]?.metrics;
  const openingWidth = Math.max(0, Number(secondPlan?.floorOpening?.width) || 0);
  const openingLength = Math.max(0, Number(secondPlan?.floorOpening?.length) || 0);
  const secondFloorOpeningArea = Math.min(
    Number(base?.floorArea) || 0,
    Number(secondMetrics?.floorArea) || 0,
    openingWidth * openingLength,
  );
  const sum = (key) =>
    round(
      floorPlans.reduce((total, item) => total + (Number(item.metrics[key]) || 0), 0),
      2,
    );
  return {
    ...base,
    floorCount,
    floorPlans,
    firstFloorExteriorWallNetArea: base.exteriorWallNetArea,
    secondFloorExteriorWallNetArea: secondMetrics?.exteriorWallNetArea || 0,
    firstFloorPartitionLength: base.partitionLength,
    secondFloorPartitionLength: secondMetrics?.partitionLength || 0,
    firstFloorPartitionNetArea: base.partitionNetArea,
    secondFloorPartitionNetArea: secondMetrics?.partitionNetArea || 0,
    roomArea: sum("roomArea"),
    unassignedArea: sum("unassignedArea"),
    exteriorWallGrossArea: sum("exteriorWallGrossArea"),
    exteriorWallNetArea: sum("exteriorWallNetArea"),
    exteriorOpeningsArea: sum("exteriorOpeningsArea"),
    partitionLength: sum("partitionLength"),
    partitionGrossArea: sum("partitionGrossArea"),
    partitionNetArea: sum("partitionNetArea"),
    interiorOpeningsArea: sum("interiorOpeningsArea"),
    windowArea: sum("windowArea"),
    doorArea: sum("doorArea"),
    totalOpeningsArea: sum("totalOpeningsArea"),
    ceilingArea: top.ceilingArea,
    openCeilingArea: top.openCeilingArea,
    secondFloorArea: round(
      Math.max(0, (Number(secondMetrics?.floorArea) || 0) - secondFloorOpeningArea),
      2,
    ),
    secondFloorOpeningArea: round(secondFloorOpeningArea, 2),
    secondFloorOpeningWidth: openingWidth,
    secondFloorOpeningLength: openingLength,
    secondFloorOpeningX: Math.max(0, Number(secondPlan?.floorOpening?.x) || 0),
    secondFloorOpeningY: Math.max(0, Number(secondPlan?.floorOpening?.y) || 0),
    firstFloorUsableArea: round(
      Math.max(0, (Number(base.floorArea) || 0) - secondFloorOpeningArea),
      2,
    ),
    totalFloorArea: round(base.floorArea + (Number(secondMetrics?.floorArea) || 0), 2),
    totalUsableFloorArea: round(
      base.floorArea +
        (Number(secondMetrics?.floorArea) || 0) -
        secondFloorOpeningArea * (secondMetrics ? 2 : 0),
      2,
    ),
  };
}

function sipSection(project, metrics, index, inputs, roofResult) {
  const { sip } = project.settings;
  const surfaces = {
    floor: project.services.sipFloor ? metrics.floorArea : 0,
    secondFloor:
      project.services.sipSecondFloor && metrics.floorCount > 1
        ? metrics.secondFloorArea
        : 0,
    walls: project.services.sipWalls ? metrics.firstFloorExteriorWallNetArea : 0,
    wallsSecondFloor:
      project.services.sipWalls && metrics.floorCount > 1
        ? metrics.secondFloorExteriorWallNetArea
        : 0,
    ceiling: project.services.sipCeiling ? metrics.ceilingArea : 0,
    partitions:
      project.services.partitions && sip.partitionType === "sip"
        ? metrics.firstFloorPartitionNetArea
        : 0,
    partitionsSecondFloor:
      project.services.partitions &&
      sip.partitionType === "sip" &&
      metrics.floorCount > 1
        ? metrics.secondFloorPartitionNetArea
        : 0,
    gables: Math.max(0, Number(roofResult?.warmGableArea) || 0),
  };
  const f = inputs.formulas;
  const firstPlan = metrics.floorPlans?.[0]?.plan || project.plan;
  const secondPlan = metrics.floorPlans?.[1]?.plan;
  const topPlan = metrics.floorPlans?.at(-1)?.plan || project.plan;
  const floorCutLength = calculateGridContourCutLength(
    houseContourPoints(firstPlan),
    Number(sip.floorPanelWidth) || f.panelWidth,
    f.panelLength,
  );
  const stairOpeningCutLength =
    metrics.secondFloorOpeningWidth > 0 && metrics.secondFloorOpeningLength > 0
      ? 2 * (metrics.secondFloorOpeningWidth + metrics.secondFloorOpeningLength)
      : 0;
  const ceilingOpeningCutLength = (topPlan.rooms || [])
    .filter((room) => room.include !== false && room.ceilingMode === "open")
    .reduce((sum, room) => sum + roomPerimeter(room), 0);
  const wallCutLengthFor = (plan) =>
    plan
      ? calculateWallCutLength(
          housePerimeterRuns(plan),
          plan.wallHeight,
          f.panelWidth,
          f.panelLength,
          openingCutLength(plan, true),
        )
      : 0;
  const partitionCutLengthFor = (plan, length) =>
    plan
      ? calculateWallCutLength(
          [length],
          plan.wallHeight,
          f.panelWidth,
          f.panelLength,
          openingCutLength(plan, false),
        )
      : 0;
  const cutting = calculateSipCutting(surfaces, {
    panelArea: f.panelArea,
    panelWidth: f.panelWidth,
    panelLength: f.panelLength,
    extraWastePercent: sip.wastePercent,
    includePartitions: sip.partitionType === "sip",
    includeSecondFloorWalls: surfaces.wallsSecondFloor > 0,
    includeSecondFloorPartitions: surfaces.partitionsSecondFloor > 0,
    includeSecondFloor: surfaces.secondFloor > 0,
    includeGables: surfaces.gables > 0,
    layoutWidths: {
      floor: sip.floorPanelWidth,
      secondFloor: sip.secondFloorPanelWidth,
      ceiling: sip.ceilingPanelWidth,
    },
    cutLengths: {
      floor: floorCutLength,
      secondFloor: secondPlan
        ? calculateGridContourCutLength(
            houseContourPoints(secondPlan),
            Number(sip.secondFloorPanelWidth) || f.panelWidth,
            f.panelLength,
          ) + stairOpeningCutLength
        : 0,
      walls: wallCutLengthFor(firstPlan),
      wallsSecondFloor: wallCutLengthFor(secondPlan),
      ceiling:
        calculateGridContourCutLength(
          houseContourPoints(topPlan),
          Number(sip.ceilingPanelWidth) || f.panelWidth,
          f.panelLength,
        ) + ceilingOpeningCutLength,
      partitions: partitionCutLengthFor(
        firstPlan,
        metrics.firstFloorPartitionLength,
      ),
      partitionsSecondFloor: partitionCutLengthFor(
        secondPlan,
        metrics.secondFloorPartitionLength,
      ),
      gables:
        roofResult?.mainRoofShape === "gable"
          ? 4 * Math.max(0, Number(roofResult.geometry?.wallSlopeLength) || 0)
          : 0,
    },
  });
  const byKey = new Map(cutting.map((row) => [row.key, row]));
  const panelGroups = [
    ["floor", sip.floorThickness, sip.floorPanelFamily],
    [
      "secondFloor",
      sip.secondFloorThickness,
      sip.secondFloorPanelFamily,
    ],
    ["walls", sip.wallThickness, sip.wallPanelFamily],
    ["wallsSecondFloor", sip.wallThickness, sip.wallPanelFamily],
    ["ceiling", sip.ceilingThickness, sip.ceilingPanelFamily],
    ["partitions", sip.partitionThickness, sip.partitionPanelFamily],
    [
      "partitionsSecondFloor",
      sip.partitionThickness,
      sip.partitionPanelFamily,
    ],
  ];
  const groupNames = {
    floor: "Пол",
    secondFloor: "Межэтажное перекрытие / пол 2 этажа",
    walls: "Наружные стены 1 этажа",
    wallsSecondFloor: "Наружные стены 2 этажа",
    ceiling: "Потолок",
    partitions: "Перегородки 1 этажа",
    partitionsSecondFloor: "Перегородки 2 этажа",
  };
  const joinery = calculateSipJoinery(
    project.plan,
    project.plan.house?.contourDefined === false
      ? {
          ...project.services,
          sipFloor: false,
          sipWalls: false,
          sipCeiling: false,
          partitions: false,
        }
      : project.services,
    sip,
    f,
    metrics,
  );
  const consumables = calculateSipConsumables(cutting, joinery, sip, f);
  const consumablesByKey = new Map(
    consumables.rows.map((row) => [row.key, row]),
  );
  const lines = [];
  panelGroups.forEach(([key, thickness, family]) => {
    const row = byKey.get(key);
    if (!row?.area) return;
    const lineOptions = {
      source: `sip-${key}`,
      estimateGroup: groupNames[key],
    };
    lines.push(
      makeLine(index, "sip", sipPanelName(thickness, family), row.panels, {
        key: `panel-${key}`,
        ...lineOptions,
      }),
    );
    const installQuery =
      key === "ceiling"
        ? "Монтаж сип-панели потолка"
        : key.startsWith("partitions")
          ? "Монтаж сип-перегородок"
          : "Монтаж сип-панели пол/стены";
    lines.push(
      makeLine(index, "sip", installQuery, row.area, {
        key: `install-${key}`,
        kind: "labor",
        ...lineOptions,
      }),
    );
    lines.push(
      makeLine(index, "sip", "Раскрой сип-панелей", row.cutMeters, {
        key: `cut-${key}`,
        kind: "labor",
        ...lineOptions,
      }),
    );
    const usage = consumablesByKey.get(key);
    lines.push(
      makeLine(
        index,
        "sip",
        "Пеноклей для СИП-панелей 650 мл",
        usage.foamUnits,
        {
          key: `foam-${key}`,
          name:
            consumables.mode === "node"
              ? `Пеноклей для СИП-панелей 650 мл · ${round(usage.foamLength, 1)} м швов`
              : undefined,
          ...lineOptions,
        },
      ),
    );
    const structuralQuery =
      consumables.mode === "node"
        ? `Саморез конструкционный ${usage.structuralSize} мм`
        : "Саморезы конст.";
    lines.push(
      makeLine(index, "sip", structuralQuery, usage.structuralKg, {
        key: `fasteners-${key}`,
        unit: "кг",
        name:
          consumables.mode === "node"
            ? `Саморезы конструкционные ${usage.structuralSize} · ${usage.structuralCount} шт`
            : undefined,
        ...lineOptions,
      }),
    );
    if (consumables.mode === "node") {
      lines.push(
        makeLine(
          index,
          "sip",
          "Лента уплотнительная из вспененного полиэтилена 5 мм",
          usage.sealLength,
          {
            key: `seal-${key}`,
            unit: "м.п.",
            name: `Лента уплотнительная 5 мм · ${round(usage.sealLength, 1)} м`,
            ...lineOptions,
          },
        ),
      );
      lines.push(
        makeLine(
          index,
          "sip",
          "Скобы",
          Math.ceil(
            usage.stapleCount /
              Math.max(1, Number(f.sipSealStaplesPerPack) || 1000),
          ),
          {
            key: `seal-staples-${key}`,
            unit: "уп",
            name: `Скобы T53 10 мм · ${usage.stapleCount} шт`,
            ...lineOptions,
          },
        ),
      );
      lines.push(
        makeLine(
          index,
          "sip",
          "Саморезы 6х120",
          usage.universalScrewCount *
            Math.max(0, Number(f.sipUniversalScrewKgEach) || 0.02),
          {
            key: `universal-screws-${key}`,
            unit: "кг",
            name: `Саморезы 6×120 · ${usage.universalScrewCount} шт для Т-узлов`,
            ...lineOptions,
          },
        ),
      );
      lines.push(
        makeLine(index, "sip", "Саморезы 3.5 x 41", usage.seamKg, {
          key: `seam-screws-${key}`,
          unit: "кг",
          name: `Саморезы 3,8×41 · ${usage.seamCount} шт`,
          ...lineOptions,
        }),
      );
      lines.push(
        makeLine(index, "sip", "Саморезы 4.2 x 75", usage.edgeKg, {
          key: `edge-screws-${key}`,
          unit: "кг",
          name: `Саморезы 4,2×75 · ${usage.edgeCount} шт`,
          ...lineOptions,
        }),
      );
    } else {
      lines.push(
        makeLine(index, "sip", "Саморезы 4.2 x 75", usage.seamKg, {
          key: `seam-screws-${key}`,
          unit: "кг",
          ...lineOptions,
        }),
      );
      lines.push(
        makeLine(index, "sip", "Крепёж спиральный", usage.spiralPacks, {
          key: `spiral-fasteners-${key}`,
          unit: "уп",
          ...lineOptions,
        }),
      );
    }
  });
  if (project.services.partitions && sip.partitionType !== "sip") {
    const partitionFrameSection = sip.partitionFrameSection === "50x150" ? "50x150" : "50x100";
    const partitionBoardQuery = partitionFrameSection === "50x150"
      ? "Доска ест. влажн. сосна 50х150мм"
      : "Доска ест.влажн. сосна 50*100мм";
    const partitionVolumeFactor = partitionFrameSection === "50x150" ? 1.5 : 1;
    [
      {
        key: "partitions",
        area: metrics.firstFloorPartitionNetArea,
        suffix: "",
      },
      {
        key: "partitionsSecondFloor",
        area: metrics.secondFloorPartitionNetArea,
        suffix: "-secondFloor",
      },
    ].forEach(({ key, area, suffix }) => {
      if (!(area > 0)) return;
      lines.push(
        makeLine(
          index,
          "sip",
          partitionBoardQuery,
          area * f.partitionBoardM3PerM2 * partitionVolumeFactor,
          {
            key: `partition-board${suffix}`,
            unit: "м³",
            source: key,
            estimateGroup: groupNames[key],
            name: `Каркас перегородок · доска ${partitionFrameSection.replace("x", "×")} мм`,
          },
        ),
      );
      lines.push(
        makeLine(
          index,
          "sip",
          "Возведение перегородок из доски 100х50",
          area,
          {
            key: `partition-work${suffix}`,
            kind: "labor",
            source: key,
            estimateGroup: groupNames[key],
            name: `Монтаж каркасных перегородок · доска ${partitionFrameSection.replace("x", "×")} мм`,
          },
        ),
      );
    });
  }
  joinery.rows.forEach((row) => {
    const key = `${row.key}-connector`;
    if (joinery.type === "thermal") {
      const query = `Термобрус 95×${row.thermalDepth} мм`;
      lines.push(
        makeLine(
          index,
          "sip",
          query,
          row.jointPurchaseLength,
          {
            key,
            unit: "м.п.",
            name: `${query} · ${row.jointStockPieces} шт × ${formatNumberForName(row.stockLength)} м`,
            source: `sip-${row.key}-joints`,
            estimateGroup: groupNames[row.key],
          },
        ),
      );
    } else if (joinery.type === "board-pack") {
      const query = `Пакет клеёных досок 95×${row.endBoardDepth} мм для СИП ${row.panelThickness} мм`;
      lines.push(
        makeLine(
          index,
          "sip",
          query,
          row.jointPurchaseLength,
          {
            key,
            unit: "м.п.",
            name: `${query} · ${row.jointStockPieces} шт × ${formatNumberForName(row.stockLength)} м`,
            source: `sip-${row.key}-joints`,
            estimateGroup: groupNames[row.key],
          },
        ),
      );
    } else {
      const query = `Брус соединительный ест. влажности 100×${row.core} мм`;
      lines.push(
        makeLine(index, "sip", query, row.jointPurchaseLength, {
          key,
          unit: "м.п.",
          name: `${query} · ${row.jointStockPieces} шт × ${formatNumberForName(row.stockLength)} м`,
          source: `sip-${row.key}-joints`,
          estimateGroup: groupNames[row.key],
        }),
      );
    }
    const edgeQuery = `Доска сухая строганая ${row.endBoardDepth}×45 мм`;
    lines.push(
      makeLine(
        index,
        "sip",
        edgeQuery,
        row.endBoardPurchaseLength,
        {
          key: `${row.key}-edge-board`,
          unit: "м.п.",
          name: `${edgeQuery} · ${row.endBoardStockPieces} шт × ${formatNumberForName(row.stockLength)} м`,
          source: `sip-${row.key}-edges`,
          estimateGroup: groupNames[row.key],
        },
      ),
    );
  });
  const groupOrder = new Map(
    ["Пол", "Наружные стены", "Потолок", "Перегородки"].map((name, order) => [
      name,
      order,
    ]),
  );
  return {
    lines: compact(lines).sort(
      (a, b) =>
        (groupOrder.get(a.estimateGroup) ?? 99) -
        (groupOrder.get(b.estimateGroup) ?? 99),
    ),
    cutting,
    joinery,
    consumables,
  };
}

function foundationSection(project, index, inputs) {
  const foundation = calculateFoundation(project.plan, project.settings.piles);
  if (!project.services.foundation) return { lines: [], foundation };
  const count = foundation.totalPiles;
  return {
    foundation,
    lines: compact([
      makeLine(
        index,
        "foundation",
        "Разбивка осей фундамента (1 свая)",
        count,
        { key: "axes", kind: "labor" },
      ),
      makeLine(index, "foundation", "Монтаж свай", count, {
        key: "pile-work",
        kind: "labor",
      }),
      makeLine(index, "foundation", "Винтовые сваи 108мм", count, {
        key: "piles",
      }),
      makeLine(
        index,
        "foundation",
        "Пескобетон М300",
        count * inputs.formulas.pileConcreteM3,
        { key: "concrete", unit: "м³", digits: 3 },
      ),
      makeLine(index, "foundation", "Оголовок для свай", count, {
        key: "heads",
      }),
      makeLine(index, "foundation", "Монтаж оголовков", count, {
        key: "heads-work",
        kind: "labor",
      }),
      makeLine(index, "foundation", "Монтаж обвязки", count, {
        key: "binding-work",
        kind: "labor",
      }),
      makeLine(
        index,
        "foundation",
        "Доска ест. влажн. сосна 50х150мм",
        foundation.boardVolume,
        {
          key: "binding-board",
          unit: "м³",
          digits: 3,
          name: `Доска обвязки 50×150 мм · ${foundation.boardCount} шт × 6 м`,
        },
      ),
      makeLine(
        index,
        "foundation",
        "Саморезы 6х120",
        count * inputs.formulas.pileScrewKg,
        { key: "binding-screws", unit: "кг" },
      ),
      makeLine(
        index,
        "foundation",
        "Глухари",
        count * inputs.formulas.pileLagScrews,
        {
          key: "binding-lag-screws",
          unit: "шт",
          name: "Глухари для крепления обвязки",
        },
      ),
    ]),
  };
}

function roofSection(project, metrics, index, inputs) {
  if (!project.services.roof || project.plan.house?.contourDefined === false)
    return {
      lines: [],
      extensionLines: [],
      geometry: null,
      terraceRoofs: [],
      coldArea: 0,
      warmArea: 0,
      coldSlopeArea: 0,
      warmSlopeArea: 0,
      gableArea: 0,
      insulatedRafterArea: 0,
      terracePostCount: 0,
      totalArea: 0,
      mauerlatLength: 0,
      mauerlatPurchaseLength: 0,
      ridgeBeamLength: 0,
      ridgeBeamPurchaseLength: 0,
      mainEaveTrimPurchaseLength: 0,
      mainVergeTrimPurchaseLength: 0,
    };
  const { roof } = project.settings;
  const roofAxes = resolveRoofAxes(project.plan, roof);
  const covering = roofCoveringSpec(roof.covering);
  const osbSheetArea = 1.25 * 2.5;
  const span = roofAxes.span;
  const mainRoofShape = ["flat", "hip"].includes(roof.shape)
    ? roof.shape
    : "gable";
  const eaveOverhang = Math.max(0, Number(roof.eaveOverhang) || 0);
  const gableOverhang = Math.max(0, Number(roof.gableOverhang) || 0);
  const geometry = roofGeometry({
    span,
    ridgeLength: inputs.roof.ridgeLength,
    ridgeHeight: roof.ridgeHeight,
    shape: mainRoofShape,
    eaveOverhang,
    gableOverhang,
  });
  const mainArea = geometry.totalSlopeArea;
  const mainWarmPercent =
    roof.type === "sip" ? 100 : roof.type === "combo" ? roof.warmPercent : 0;
  const insulatedRafterArea = Math.min(
    mainArea,
    (metrics.openCeilingArea || 0) * geometry.slopeCoefficient,
  );
  const mainWarmSlopeArea = Math.max(
    0,
    (mainArea * mainWarmPercent) / 100 - insulatedRafterArea,
  );
  const mainColdSlopeArea = mainArea - mainWarmSlopeArea;
  let warmSlopeArea = mainWarmSlopeArea;
  let coldSlopeArea = mainColdSlopeArea;
  const terraceRoofs = (project.plan.platforms || [])
    .filter((platform) => platform.include !== false)
    .map((platform) => ({
      platform,
      result: calculateTerraceRoof(platform, project.plan.house, {
        mainSlopeCoefficient: geometry.slopeCoefficient,
        wallPanelThickness: project.settings.sip.wallThickness,
        postSpacing: inputs.formulas.terraceRoofPostSpacing,
      }),
    }));
  terraceRoofs.forEach(({ platform, result }) => {
    if (platform.roof?.mode === "warm") warmSlopeArea += result.netArea;
    if (platform.roof?.mode === "cold") coldSlopeArea += result.netArea;
  });
  const mainGableType =
    mainRoofShape !== "gable" || roof.gableType === "none"
      ? "none"
      : roof.gableType === "cold"
        ? "cold"
        : roof.gableType === "sip"
          ? "sip"
          : roof.type === "sip"
            ? "sip"
            : "cold";
  const mainGableCount =
    mainRoofShape === "gable"
      ? Math.min(2, Math.max(0, Math.round(Number(roof.gableCount) || 0)))
      : 0;
  const mainGableArea =
    mainGableType === "none" ? 0 : (geometry.gableArea * mainGableCount) / 2;
  const mainColdGableArea = mainGableType === "cold" ? mainGableArea : 0;
  const mainWarmGableArea = mainGableType === "sip" ? mainGableArea : 0;
  let coldGableArea = mainColdGableArea;
  let warmGableArea = mainWarmGableArea;
  terraceRoofs.forEach(({ result }) => {
    if (result.gableType === "cold") coldGableArea += result.gableArea;
    if (result.gableType === "sip") warmGableArea += result.gableArea;
  });
  const coldArea = coldSlopeArea + coldGableArea;
  const warmArea = warmSlopeArea + warmGableArea;
  const gableArea = coldGableArea + warmGableArea;
  const totalSlopeArea = coldSlopeArea + warmSlopeArea;
  const totalArea = totalSlopeArea + gableArea;
  const sipCutting = calculateSipRoofCutting(warmSlopeArea, {
    panelArea: inputs.formulas.panelArea,
    extraWastePercent: project.settings.sip.wastePercent,
  });
  const gableSipCutting = calculateSipRoofCutting(warmGableArea, {
    panelArea: inputs.formulas.panelArea,
    extraWastePercent: project.settings.sip.wastePercent,
  });
  const mainSipCutting = calculateSipRoofCutting(mainWarmSlopeArea, {
    panelArea: inputs.formulas.panelArea,
    extraWastePercent: project.settings.sip.wastePercent,
  });
  const mainGableSipCutting = calculateSipRoofCutting(mainWarmGableArea, {
    panelArea: inputs.formulas.panelArea,
    extraWastePercent: project.settings.sip.wastePercent,
  });
  const sipRoofSupportPointsPerPanel = Math.max(
    1,
    Math.round(Number(inputs.formulas.sipRoofSupportPointsPerPanel) || 2),
  );
  const mainSipSupportScrew = resolveSipSupportScrew(
    project.settings.sip.ceilingThickness,
    inputs.formulas,
  );
  const mainSipSupportScrewCount =
    mainSipCutting.panels * sipRoofSupportPointsPerPanel;
  const mainSipSupportScrewKg =
    mainSipSupportScrewCount * mainSipSupportScrew.kgEach;
  const mainSipRidgeRun =
    mainRoofShape === "flat"
      ? 0
      : mainRoofShape === "hip"
        ? geometry.ridgeLength
        : geometry.roofLength;
  const mainSipRidgePlateCount = mainSipCutting.panels
    ? Math.max(
        0,
        Math.ceil(mainSipRidgeRun / Math.max(0.2, inputs.formulas.panelWidth)) -
          1,
      )
    : 0;
  const mainSipRidgePlateScrewCount =
    mainSipRidgePlateCount *
    Math.max(0, Math.round(Number(inputs.formulas.sipRidgePlateScrews) || 8));
  const mainSipRidgePlateScrewKg =
    mainSipRidgePlateScrewCount *
    Math.max(0, Number(inputs.formulas.sipEdgeScrewKgEach) || 0.006);
  const mainGableSupportScrew = resolveSipStructuralScrew(
    project.settings.sip.wallThickness,
    inputs.formulas,
  );
  const mainGableSupportScrewCount =
    mainGableSipCutting.panels * sipRoofSupportPointsPerPanel;
  const houseLength = roofAxes.ridgeBaseLength;
  const rafterStructure = resolveRafterStructure(
    project,
    geometry,
    houseLength,
  );
  const rafterSection = rafterStructure.section;
  const rafterDepth = rafterSection === "50x200" ? 0.2 : 0.15;
  const terracePostCount = terraceRoofs.reduce(
    (sum, item) => sum + item.result.postCount,
    0,
  );
  const perimeterRuns = housePerimeterRuns(project.plan);
  const mauerlatLayout = ["perimeter", "supports", "none"].includes(
    roof.mauerlatLayout,
  )
    ? roof.mauerlatLayout
    : "perimeter";
  const mauerlatRuns =
    mainRoofShape === "flat" || mauerlatLayout === "none"
      ? []
      : mainRoofShape === "hip" || mauerlatLayout === "perimeter"
        ? perimeterRuns
        : [houseLength, houseLength];
  const mauerlatLength = mauerlatRuns.reduce((sum, length) => sum + length, 0);
  const mauerlatPurchaseLength =
    mauerlatLength * inputs.formulas.mauerlatReserve;
  const mauerlatBoardCount = mauerlatPurchaseLength
    ? Math.ceil(mauerlatPurchaseLength / 6)
    : 0;
  const mauerlatVolume = mauerlatBoardCount * 6 * 0.1 * 0.15;
  const mauerlatFastener = ["sip-screws", "anchors", "none"].includes(
    roof.mauerlatFastener,
  )
    ? roof.mauerlatFastener
    : "sip-screws";
  const mauerlatFastenerSpacing = Math.max(
    0.1,
    mauerlatFastener === "anchors"
      ? inputs.formulas.mauerlatAnchorSpacing
      : inputs.formulas.mauerlatScrewSpacing,
  );
  const mauerlatFastenerPoints =
    mauerlatFastener === "none"
      ? 0
      : mauerlatRuns.reduce(
          (sum, length) => sum + Math.ceil(length / mauerlatFastenerSpacing) + 1,
          0,
        );
  const mauerlatAnchors =
    mauerlatFastener === "anchors" ? mauerlatFastenerPoints : 0;
  const mauerlatScrewRows = Math.max(
    1,
    Math.round(Number(inputs.formulas.mauerlatScrewRows) || 2),
  );
  const mauerlatScrewCount =
    mauerlatFastener === "sip-screws"
      ? mauerlatFastenerPoints * mauerlatScrewRows
      : 0;
  const mauerlatScrew = resolveSipStructuralScrew(
    project.settings.sip.wallThickness,
    inputs.formulas,
  );
  const mauerlatScrewKg = mauerlatScrewCount * mauerlatScrew.kgEach;
  const ridgeBeamLength =
    mainRoofShape === "flat"
      ? 0
      : mainRoofShape === "hip"
        ? geometry.ridgeLength + geometry.hipLength
        : geometry.roofLength;
  const ridgeBeamPurchaseLength =
    ridgeBeamLength * inputs.formulas.ridgeBeamReserve;
  const rafterReserve =
    rafterStructure.system === "truss"
      ? inputs.formulas.trussRafterReserve
      : rafterStructure.system === "hanging"
        ? inputs.formulas.hangingRafterReserve
        : inputs.formulas.layeredRafterReserve;
  const hipRafterLength = mainRoofShape === "hip" ? geometry.hipLength : 0;
  const mainRafterLegLength = mainColdSlopeArea
    ? rafterStructure.legCount * geometry.slopeLength + hipRafterLength
    : 0;
  const mainRafterRequiredLength =
    mainRafterLegLength * rafterReserve + ridgeBeamPurchaseLength;
  const mainRafterBoardCount = mainRafterRequiredLength
    ? Math.ceil(mainRafterRequiredLength / 6)
    : 0;
  const mainRafterPurchaseLength = mainRafterBoardCount * 6;
  const mainRafterVolume = mainRafterPurchaseLength * 0.05 * rafterDepth;
  const mainEaveLength =
    mainRoofShape === "flat"
      ? 0
      : mainRoofShape === "hip"
        ? 2 * (geometry.roofLength + geometry.roofSpan)
        : geometry.roofLength * 2;
  const mainVergeLength =
    mainRoofShape === "gable" ? geometry.slopeLength * 4 : 0;
  const mainEaveTrimPurchaseLength =
    mainEaveLength * inputs.formulas.roofTrimReserve;
  const mainVergeTrimPurchaseLength =
    mainVergeLength * inputs.formulas.roofTrimReserve;
  const mainCoverPurchaseArea = mainArea * (1 + roof.wastePercent / 100);
  const mainGablePurchaseArea = mainGableArea * (1 + roof.wastePercent / 100);
  const mainConstructionArea = mainArea + mainGableArea;
  const mainGableBoardRequiredLength =
    (mainColdGableArea * inputs.formulas.gableBoardM3PerM2) / (0.05 * 0.15);
  const mainGableBoardCount = mainGableBoardRequiredLength
    ? Math.ceil(mainGableBoardRequiredLength / 6)
    : 0;
  const mainGableBoardVolume = mainGableBoardCount * 6 * 0.05 * 0.15;
  const lathStep = Math.min(1.2, Math.max(0.1, Number(roof.lathStep) || 0.35));
  const mainLathRequiredLength = mainArea
    ? mainArea / lathStep + mainEaveLength
    : 0;
  const mainLathBoardCount = mainLathRequiredLength
    ? Math.ceil(mainLathRequiredLength / 6)
    : 0;
  const mainLathVolume = mainLathBoardCount * 6 * 0.025 * 0.1;
  const hasTimberRafters = mainColdSlopeArea > 0 && mainRoofShape !== "flat";
  const rafterSupportNodeCount = !hasTimberRafters
    ? 0
    : mainRoofShape === "hip"
      ? perimeterRuns.reduce(
          (sum, length) => sum + Math.ceil(length / rafterStructure.module),
          0,
        )
      : rafterStructure.legCount;
  const rafterSupportConnection =
    roof.rafterSupportConnection === "angles" ? "angles" : "nails";
  const rafterSupportBracketCount =
    rafterSupportConnection === "angles" ? rafterSupportNodeCount : 0;
  const rafterSupportNailCount =
    rafterSupportNodeCount *
    Math.max(
      0,
      Math.round(
        Number(
          rafterSupportConnection === "angles"
            ? inputs.formulas.roofAngleNailsPerBracket
            : inputs.formulas.roofRafterSupportNails,
        ) || 0,
      ),
    );
  const rafterRidgeNailCount =
    rafterSupportNodeCount *
    Math.max(
      0,
      Math.round(Number(inputs.formulas.roofRafterRidgeNails) || 0),
    );
  const rafterTieJointCount =
    rafterStructure.system === "hanging" && hasTimberRafters
      ? rafterStructure.pairCount * 2
      : 0;
  const rafterTieNailCount =
    rafterTieJointCount *
    Math.max(
      0,
      Math.round(Number(inputs.formulas.roofRafterTieNails) || 0),
    );
  const framingNailCount =
    rafterSupportNailCount + rafterRidgeNailCount + rafterTieNailCount;
  const framingNailKg =
    framingNailCount *
    Math.max(0, Number(inputs.formulas.roofFramingNailKgEach) || 0);
  const lathCrossingCount = hasTimberRafters
    ? Math.ceil(mainLathRequiredLength / Math.max(0.1, rafterStructure.module))
    : 0;
  const lathNailCount =
    lathCrossingCount *
    Math.max(
      0,
      Math.round(Number(inputs.formulas.roofLathNailsPerCrossing) || 0),
    );
  const lathNailKg =
    lathNailCount *
    Math.max(0, Number(inputs.formulas.roofLathNailKgEach) || 0);
  const trussPlateCount =
    rafterStructure.system === "truss" && hasTimberRafters
      ? rafterStructure.pairCount *
        Math.max(
          0,
          Math.round(Number(inputs.formulas.roofTrussPlatesPerFrame) || 0),
        )
      : 0;
  const extensionLines = compact(
    terraceRoofs.flatMap(({ platform, result }) => {
      if (platform.roof?.mode === "none" || !result.netArea) return [];
      const key = `platform-${String(platform.id).replace(/[^a-zа-я0-9-]/gi, "-")}`;
      const title = platform.kind === "porch" ? "крыльца" : "террасы";
      const source = `${key}-roof`;
      const coldSlope = platform.roof.mode === "cold" ? result.netArea : 0;
      const coldGable = result.gableType === "cold" ? result.gableArea : 0;
      const warmSlope = platform.roof.mode === "warm" ? result.netArea : 0;
      const warmGable = result.gableType === "sip" ? result.gableArea : 0;
      const constructionArea = result.netArea + result.gableArea;
      const slopeSip = calculateSipRoofCutting(warmSlope, {
        panelArea: inputs.formulas.panelArea,
        extraWastePercent: project.settings.sip.wastePercent,
      });
      const gableSip = calculateSipRoofCutting(warmGable, {
        panelArea: inputs.formulas.panelArea,
        extraWastePercent: project.settings.sip.wastePercent,
      });
      const slopeSupportScrew = resolveSipSupportScrew(
        project.settings.sip.ceilingThickness,
        inputs.formulas,
      );
      const slopeSupportScrewCount =
        slopeSip.panels * sipRoofSupportPointsPerPanel;
      const slopeRidgePlateCount = slopeSip.panels
        ? Math.max(
            0,
            Math.ceil(
              result.ridgeLength /
                Math.max(0.2, Number(inputs.formulas.panelWidth) || 1.25),
            ) - 1,
          )
        : 0;
      const slopeRidgePlateScrewCount =
        slopeRidgePlateCount *
        Math.max(
          0,
          Math.round(Number(inputs.formulas.sipRidgePlateScrews) || 8),
        );
      const gableSupportScrew = resolveSipStructuralScrew(
        project.settings.sip.wallThickness,
        inputs.formulas,
      );
      const gableSupportScrewCount =
        gableSip.panels * sipRoofSupportPointsPerPanel;
      const postQuery =
        result.postSection === "100x100"
          ? "Брус ест.влажн. сосна 100×100 мм"
          : "Брус мауэрлата ест.влажн. сосна 150×100 мм";
      const ridgeBeamPurchaseLength =
        result.ridgeLength * inputs.formulas.ridgeBeamReserve;
      const terraceRafterRequiredLength =
        (coldSlope / rafterStructure.step) * rafterReserve +
        ridgeBeamPurchaseLength;
      const terraceRafterBoardCount = terraceRafterRequiredLength
        ? Math.ceil(terraceRafterRequiredLength / 6)
        : 0;
      const terraceRafterVolume =
        terraceRafterBoardCount * 6 * 0.05 * rafterDepth;
      const gableBoardRequiredLength =
        (coldGable * inputs.formulas.gableBoardM3PerM2) / (0.05 * 0.15);
      const gableBoardCount = gableBoardRequiredLength
        ? Math.ceil(gableBoardRequiredLength / 6)
        : 0;
      const gableBoardVolume = gableBoardCount * 6 * 0.05 * 0.15;
      const lathRequiredLength = result.netArea
        ? result.netArea / lathStep + result.eaveLength
        : 0;
      const lathBoardCount = lathRequiredLength
        ? Math.ceil(lathRequiredLength / 6)
        : 0;
      const lathVolume = lathBoardCount * 6 * 0.025 * 0.1;
      const terraceFrameCount = coldSlope
        ? Math.ceil(
            (result.shape === "gable" ? result.roofRun : result.roofWidth) /
              rafterStructure.module,
          ) + 1
        : 0;
      const terraceSupportNodeCount = terraceFrameCount * 2;
      const terraceRidgeNodeCount =
        result.shape === "gable" ? terraceFrameCount * 2 : 0;
      const terraceBracketCount =
        rafterSupportConnection === "angles" ? terraceSupportNodeCount : 0;
      const terraceFramingNailCount =
        terraceSupportNodeCount *
          Math.max(
            0,
            Math.round(
              Number(
                rafterSupportConnection === "angles"
                  ? inputs.formulas.roofAngleNailsPerBracket
                  : inputs.formulas.roofRafterSupportNails,
              ) || 0,
            ),
          ) +
        terraceRidgeNodeCount *
          Math.max(
            0,
            Math.round(Number(inputs.formulas.roofRafterRidgeNails) || 0),
          );
      const terraceFramingNailKg =
        terraceFramingNailCount *
        Math.max(0, Number(inputs.formulas.roofFramingNailKgEach) || 0);
      const terraceLathCrossingCount = coldSlope
        ? Math.ceil(lathRequiredLength / Math.max(0.1, rafterStructure.module))
        : 0;
      const terraceLathNailCount =
        terraceLathCrossingCount *
        Math.max(
          0,
          Math.round(Number(inputs.formulas.roofLathNailsPerCrossing) || 0),
        );
      const terraceLathNailKg =
        terraceLathNailCount *
        Math.max(0, Number(inputs.formulas.roofLathNailKgEach) || 0);
      const eaveTrimPurchaseLength =
        result.eaveLength * inputs.formulas.roofTrimReserve;
      const vergeTrimPurchaseLength =
        result.vergeLength * inputs.formulas.roofTrimReserve;
      const osbArea =
        (covering.osb ? result.purchaseArea : 0) +
        (coldGable ? result.gablePurchaseArea : 0);
      const osbSheets = osbArea ? Math.ceil(osbArea / osbSheetArea) : 0;
      return [
        makeLine(index, "roof", "Монтаж стропильной системы", coldSlope, {
          key: `${key}-rafters-work`,
          kind: "labor",
          name: `Монтаж стропильной системы ${title}`,
          source,
        }),
        makeLine(
          index,
          "roof",
          rafterSection === "50x200"
            ? "Доска ест. влажн. сосна 50х200мм"
            : "Доска ест. влажн. сосна 50х150мм",
          terraceRafterVolume,
          {
            key: `${key}-rafters`,
            unit: "м³",
            digits: 3,
            name: `Стропильная доска ${rafterSection.replace("x", "×")} мм · ${terraceRafterBoardCount} шт × 6 м, включая коньковый прогон · кровля ${title}`,
            source,
          },
        ),
        makeLine(
          index,
          "roof",
          "Уголок усиленный 90×70×55×2.5",
          terraceBracketCount,
          {
            key: `${key}-rafter-support-brackets`,
            unit: "шт",
            name: `Уголки опор стропил · кровля ${title} · ${terraceBracketCount} шт`,
            source,
            exactQuantity: true,
          },
        ),
        makeLine(
          index,
          "roof",
          "Гвозди/саморезы для обрешётки",
          terraceFramingNailKg,
          {
            key: `${key}-framing-nails`,
            unit: "кг",
            digits: 3,
            name: `Гвозди от 80 мм для стропильных узлов · кровля ${title} · ${terraceFramingNailCount} шт`,
            source,
            exactQuantity: true,
          },
        ),
        makeLine(
          index,
          "roof",
          "Доска ест. влажн. сосна 50х150мм",
          gableBoardVolume,
          {
            key: `${key}-gable-frame`,
            unit: "м³",
            digits: 3,
            name: `Каркас фронтона ${title} · доска 50×150 мм · ${gableBoardCount} шт × 6 м`,
            source,
          },
        ),
        makeLine(index, "roof", "Монтаж каркаса фронтонов", coldGable, {
          key: `${key}-gable-frame-work`,
          kind: "labor",
          name: `Монтаж каркаса фронтона ${title}`,
          source,
        }),
        makeLine(
          index,
          "roof",
          "Монтаж обрешётки и контробрешётки",
          result.netArea,
          {
            key: `${key}-lath-work`,
            kind: "labor",
            name: `Монтаж обрешётки кровли ${title}`,
            source,
          },
        ),
        makeLine(index, "roof", "Доска ест.влажн. сосна 25*100мм", lathVolume, {
          key: `${key}-lath`,
          unit: "м³",
          digits: 3,
          name: `Обрешётка кровли ${title} · шаг ${Math.round(lathStep * 1000)} мм · доска 25×100 мм · ${lathBoardCount} шт × 6 м`,
          source,
        }),
        makeLine(
          index,
          "roof",
          "Гвозди/саморезы для обрешётки",
          terraceLathNailKg,
          {
            key: `${key}-lath-fasteners`,
            unit: "кг",
            digits: 3,
            name: `Крепёж обрешётки · кровля ${title} · ${terraceLathNailCount} шт`,
            source,
            exactQuantity: true,
          },
        ),
        makeLine(
          index,
          "roof",
          "Гидро-ветрозащитная мембрана",
          Math.ceil(constructionArea / 70),
          {
            key: `${key}-membrane`,
            unit: "рулон",
            name: `Гидро-ветрозащитная мембрана · кровля ${title}`,
            source,
          },
        ),
        makeLine(
          index,
          "roof",
          covering.material,
          result.purchaseArea + result.gablePurchaseArea,
          {
            key: `${key}-cover`,
            unit: "м²",
            name: `${covering.label} · кровля ${title}`,
            source,
          },
        ),
        makeLine(index, "roof", covering.labor, constructionArea, {
          key: `${key}-cover-work`,
          kind: "labor",
        name: covering.key === "profile" ? `Монтаж профлиста · кровля ${title}` : `Монтаж: ${covering.label.toLocaleLowerCase("ru")} · кровля ${title}`,
          unit: "м²",
          source,
        }),
        covering.screws
          ? makeLine(
              index,
              "roof",
              "Саморезы кровельные",
              Math.ceil(constructionArea * inputs.formulas.roofScrewsPerM2),
              {
                key: `${key}-roof-screws`,
                unit: "шт",
                name: `Саморезы кровельные · кровля ${title}`,
                source,
              },
            )
          : null,
        makeLine(index, "roof", "ОСБ-3 12 мм 1250×2500 мм", osbSheets, {
          key: `${key}-osb`,
          unit: "шт",
          name: `ОСБ-3 12 мм · ${covering.osb ? "сплошной настил мягкой кровли" : "обшивка каркасного фронтона"} ${title}`,
          source,
        }),
        makeLine(index, "roof", "Монтаж подкладочного слоя ОСБ/ГВЛВ", osbArea, {
          key: `${key}-osb-work`,
          kind: "labor",
          name: `Монтаж ОСБ · кровля/фронтон ${title}`,
          unit: "м²",
          source,
        }),
        makeLine(
          index,
          "roof",
          "Планка конька",
          result.ridgeLength * inputs.formulas.ridgeReserve,
          {
            key: `${key}-ridge`,
            unit: "м.п.",
            name: `Планка конька · кровля ${title}`,
            source,
          },
        ),
        makeLine(index, "roof", "Монтаж конька", result.ridgeLength, {
          key: `${key}-ridge-work`,
          kind: "labor",
          name: `Монтаж планки конька · кровля ${title}`,
          source,
        }),
        roof.includeRidgeSeal !== false
          ? makeLine(
              index,
              "roof",
              "Уплотнитель универсальный под конёк",
              result.ridgeLength * inputs.formulas.ridgeReserve,
              {
                key: `${key}-ridge-seal`,
                unit: "м.п.",
                name: `Уплотнитель под конёк · кровля ${title}`,
                source,
              },
            )
          : null,
        roof.includeEaveTrim !== false
          ? makeLine(
              index,
              "roof",
              "Планка карнизная",
              eaveTrimPurchaseLength,
              {
                key: `${key}-eave-trim`,
                unit: "м.п.",
                name: `Планка карнизная · кровля ${title}`,
                source,
              },
            )
          : null,
        roof.includeEaveTrim !== false
          ? makeLine(
              index,
              "roof",
              "Монтаж карнизных планок",
              result.eaveLength,
              {
                key: `${key}-eave-trim-work`,
                kind: "labor",
                name: `Монтаж карнизных планок · кровля ${title}`,
                source,
              },
            )
          : null,
        roof.includeVergeTrim !== false
          ? makeLine(
              index,
              "roof",
              "Планка торцевая",
              vergeTrimPurchaseLength,
              {
                key: `${key}-verge-trim`,
                unit: "м.п.",
                name: `Планка торцевая (ветровая) · кровля ${title}`,
                source,
              },
            )
          : null,
        roof.includeVergeTrim !== false
          ? makeLine(index, "roof", "Монтаж торцевых", result.vergeLength, {
              key: `${key}-verge-trim-work`,
              kind: "labor",
              name: `Монтаж торцевых (ветровых) планок · кровля ${title}`,
              source,
            })
          : null,
        makeLine(
          index,
          "roof",
          sipPanelName(
            project.settings.sip.ceilingThickness,
            project.settings.sip.ceilingPanelFamily,
          ),
          slopeSip.panels,
          {
            key: `${key}-sip-panel`,
            name: `${sipPanelName(project.settings.sip.ceilingThickness, project.settings.sip.ceilingPanelFamily)} · кровля ${title}`,
            source,
          },
        ),
        makeLine(index, "roof", "Монтаж СИП-кровли", slopeSip.area, {
          key: `${key}-sip-install`,
          kind: "labor",
          name: `Монтаж СИП-кровли ${title}`,
          source,
        }),
        makeLine(index, "roof", "Раскрой сип-панелей", slopeSip.cutMeters, {
          key: `${key}-sip-cut`,
          kind: "labor",
          name: `Раскрой СИП-панелей · кровля ${title}`,
          source,
        }),
        makeLine(
          index,
          "roof",
          "Пеноклей для СИП-панелей 650 мл",
          Math.ceil(slopeSip.panels * inputs.formulas.foamUnitsPerPanel),
          {
            key: `${key}-sip-foam`,
            name: `Пеноклей для СИП-панелей 650 мл · кровля ${title}`,
            source,
          },
        ),
        makeLine(
          index,
          "roof",
          `Саморез конструкционный ${slopeSupportScrew.size} мм`,
          slopeSupportScrewCount * slopeSupportScrew.kgEach,
          {
            key: `${key}-sip-fasteners`,
            unit: "кг",
            name: `Саморезы конструкционные ${slopeSupportScrew.size} · СИП-кровля ${title} · ${slopeSupportScrewCount} точек опирания`,
            source,
          },
        ),
        makeLine(
          index,
          "roof",
          "Пластина коньковая перфорированная 180×65×2 мм",
          slopeRidgePlateCount,
          {
            key: `${key}-sip-ridge-plates`,
            unit: "шт",
            name: `Коньковые пластины SIP-кровли ${title} · ${slopeRidgePlateCount} узлов`,
            source,
          },
        ),
        makeLine(
          index,
          "roof",
          "Саморезы 4.2 x 75",
          slopeRidgePlateScrewCount *
            Math.max(0, Number(inputs.formulas.sipEdgeScrewKgEach) || 0.006),
          {
            key: `${key}-sip-ridge-plate-screws`,
            unit: "кг",
            name: `Саморезы 4,2×75 для коньковых пластин · ${slopeRidgePlateScrewCount} шт · кровля ${title}`,
            source,
          },
        ),
        makeLine(
          index,
          "roof",
          sipPanelName(
            project.settings.sip.wallThickness,
            project.settings.sip.wallPanelFamily,
          ),
          gableSip.panels,
          {
            key: `${key}-gable-sip-panel`,
            name: `${sipPanelName(project.settings.sip.wallThickness, project.settings.sip.wallPanelFamily)} · фронтон ${title}`,
            source,
          },
        ),
        makeLine(index, "roof", "Монтаж сип-панели пол/стены", gableSip.area, {
          key: `${key}-gable-sip-install`,
          kind: "labor",
          name: `Монтаж тёплого SIP-фронтона ${title}`,
          source,
        }),
        makeLine(index, "roof", "Раскрой сип-панелей", gableSip.cutMeters, {
          key: `${key}-gable-sip-cut`,
          kind: "labor",
          name: `Раскрой SIP-фронтона ${title}`,
          source,
        }),
        makeLine(
          index,
          "roof",
          "Пеноклей для СИП-панелей 650 мл",
          Math.ceil(gableSip.panels * inputs.formulas.foamUnitsPerPanel),
          {
            key: `${key}-gable-sip-foam`,
            name: `Пеноклей для СИП-фронтона ${title}`,
            source,
          },
        ),
        makeLine(
          index,
          "roof",
          `Саморез конструкционный ${gableSupportScrew.size} мм`,
          gableSupportScrewCount * gableSupportScrew.kgEach,
          {
            key: `${key}-gable-sip-fasteners`,
            unit: "кг",
            name: `Саморезы конструкционные ${gableSupportScrew.size} · СИП-фронтон ${title} · ${gableSupportScrewCount} точек`,
            source,
          },
        ),
        makeLine(index, "roof", postQuery, result.postVolume, {
          key: `${key}-posts-${result.postSection}`,
          unit: "м³",
          digits: 3,
          name: `Опорные столбы кровли ${title} ${result.postSection.replace("x", "×")} мм · ${result.postCount} шт`,
          source,
        }),
      ];
    }),
  );
  const gutterLength = roof.includeGutter === true ? mainEaveLength : 0;
  const mainOsbArea =
    (covering.osb ? mainCoverPurchaseArea : 0) +
    (mainColdGableArea ? mainGablePurchaseArea : 0);
  const mainOsbSheets = mainOsbArea ? Math.ceil(mainOsbArea / osbSheetArea) : 0;
  const gutterRunCount =
    mainRoofShape === "hip" ? 4 : mainRoofShape === "flat" ? 1 : 2;
  const gutterStockLength = 3;
  const gutterPieces = gutterLength
    ? Math.ceil(gutterLength / gutterStockLength)
    : 0;
  const gutterConnectors = gutterLength
    ? Math.max(0, gutterPieces - gutterRunCount)
    : 0;
  const gutterEndCaps = gutterLength ? gutterRunCount * 2 : 0;
  const gutterBrackets = gutterLength
    ? Math.ceil(gutterLength / inputs.formulas.gutterBracketSpacing) +
      gutterRunCount
    : 0;
  const gutterOutlets = gutterLength
    ? Math.max(
        gutterRunCount,
        gutterRunCount *
          Math.ceil(houseLength / inputs.formulas.gutterOutletSpacing),
      )
    : 0;
  const activeFloorCount = Math.max(
    1,
    Math.min(2, Math.round(Number(project.meta?.floors) || 1)),
  );
  const activeFloorPlans = [
    project.plan,
    ...(project.upperFloors || []).slice(0, activeFloorCount - 1),
  ];
  const facadeHeight = activeFloorPlans.reduce(
    (sum, floorPlan) =>
      sum + Math.max(0, Number(floorPlan?.wallHeight) || 2.5),
    0,
  );
  const downpipeLength = gutterOutlets * facadeHeight;
  const gutterElbows = gutterOutlets * 2;
  const downpipeClamps =
    gutterOutlets *
    (Math.ceil(
      facadeHeight / inputs.formulas.downpipeClampSpacing,
    ) +
      1);
  const lines = applyMainRoofComplexity(compact([
    makeLine(
      index,
      "roof",
      "Брус ест.влажн. сосна 100×150 мм",
      mauerlatVolume,
      {
        key: "mauerlat-timber",
        unit: "м³",
        digits: 3,
        name: `Мауэрлат 100×150 мм · ${mauerlatBoardCount} шт × 6 м`,
        exactQuantity: true,
      },
    ),
    makeLine(index, "roof", "Монтаж мауэрлата", mauerlatLength, {
      key: "mauerlat-work",
      kind: "labor",
      name: "Монтаж мауэрлата 100×150 мм",
    }),
    makeLine(
      index,
      "roof",
      "Анкер-шпилька для крепления мауэрлата",
      mauerlatAnchors,
      {
        key: "mauerlat-anchors",
        unit: "шт",
        name: `Анкер-шпилька М12×150 · шаг до ${formatNumberForName(mauerlatFastenerSpacing)} м`,
        exactQuantity: true,
      },
    ),
    makeLine(index, "roof", "Саморезы конст.", mauerlatScrewKg, {
      key: "mauerlat-screws",
      unit: "кг",
      digits: 3,
      name: `Конструкционные саморезы ${mauerlatScrew.size} для мауэрлата · ${mauerlatScrewCount} шт, ${mauerlatScrewRows} ряда с шагом до ${formatNumberForName(mauerlatFastenerSpacing)} м`,
      exactQuantity: true,
    }),
    makeLine(
      index,
      "roof",
      "Уголок усиленный 90×70×55×2.5",
      rafterSupportBracketCount,
      {
        key: "rafter-support-brackets",
        unit: "шт",
        name: `Уголок усиленный для опоры стропил · ${rafterSupportNodeCount} узлов`,
        exactQuantity: true,
      },
    ),
    makeLine(index, "roof", "Гвозди/саморезы для обрешётки", framingNailKg, {
      key: "framing-nails",
      unit: "кг",
      digits: 3,
      name: `Гвозди от 80 мм для стропильных узлов · ${framingNailCount} шт`,
      exactQuantity: true,
    }),
    makeLine(
      index,
      "roof",
      "Пластина соединительная 100×240×2",
      trussPlateCount,
      {
        key: "truss-plates",
        unit: "шт",
        name: `Соединительные пластины стропильных ферм · ${trussPlateCount} шт`,
        exactQuantity: true,
      },
    ),
    makeLine(index, "roof", "Монтаж стропильной системы", mainColdSlopeArea, {
      key: "rafters-work",
      kind: "labor",
      name:
        rafterStructure.system === "truss"
          ? "Монтаж стропильных ферм"
          : "Монтаж стропильной системы",
    }),
    makeLine(index, "roof", "Монтаж обрешётки и контробрешётки", mainArea, {
      key: "lath-work",
      kind: "labor",
    }),
    makeLine(
      index,
      "roof",
      rafterSection === "50x200"
        ? "Доска ест. влажн. сосна 50х200мм"
        : "Доска ест. влажн. сосна 50х150мм",
      mainRafterVolume,
      {
        key: "rafters",
        unit: "м³",
        digits: 3,
        name: `Стропильная доска ${rafterSection.replace("x", "×")} мм · ${mainRafterBoardCount} шт × 6 м, включая ${mainRoofShape === "hip" ? "коньковый и накосные стропила" : "коньковый прогон"}`,
      },
    ),
    makeLine(
      index,
      "roof",
      "Доска ест. влажн. сосна 50х150мм",
      mainGableBoardVolume,
      {
        key: "gable-frame",
        unit: "м³",
        digits: 3,
        name: `Каркас холодных фронтонов · доска 50×150 мм · ${mainGableBoardCount} шт × 6 м`,
        source: "gables",
      },
    ),
    makeLine(index, "roof", "Монтаж каркаса фронтонов", mainColdGableArea, {
      key: "gable-frame-work",
      kind: "labor",
      source: "gables",
    }),
    makeLine(index, "roof", "Доска ест.влажн. сосна 25*100мм", mainLathVolume, {
      key: "lath",
      unit: "м³",
      digits: 3,
      name: `Обрешётка 25×100 мм · шаг ${Math.round(lathStep * 1000)} мм · ${mainLathBoardCount} шт × 6 м`,
    }),
    makeLine(
      index,
      "roof",
      "Гидро-ветрозащитная мембрана",
      Math.ceil(mainConstructionArea / 70),
      { key: "membrane", unit: "рулон" },
    ),
    makeLine(
      index,
      "roof",
      covering.material,
      mainCoverPurchaseArea + mainGablePurchaseArea,
      { key: "cover", unit: "м²", name: covering.label },
    ),
    makeLine(index, "roof", covering.labor, mainConstructionArea, {
      key: "cover-work",
      kind: "labor",
      name: `Монтаж: ${covering.label.toLocaleLowerCase("ru")} · основная кровля`,
      unit: "м²",
    }),
    covering.screws
      ? makeLine(
          index,
          "roof",
          "Саморезы кровельные",
          Math.ceil(mainConstructionArea * inputs.formulas.roofScrewsPerM2),
          { key: "roof-screws", unit: "шт" },
        )
      : null,
    makeLine(index, "roof", "ОСБ-3 12 мм 1250×2500 мм", mainOsbSheets, {
      key: "roof-osb",
      unit: "шт",
      name: `ОСБ-3 12 мм · ${covering.osb ? "сплошной настил мягкой кровли" : "обшивка каркасных фронтонов"}`,
      source: covering.osb ? "roof-cover" : "gables",
    }),
    makeLine(index, "roof", "Монтаж подкладочного слоя ОСБ/ГВЛВ", mainOsbArea, {
      key: "roof-osb-work",
      kind: "labor",
      name: "Монтаж ОСБ кровли/фронтонов",
      unit: "м²",
      source: covering.osb ? "roof-cover" : "gables",
    }),
    makeLine(
      index,
      "roof",
      "Гвозди/саморезы для обрешётки",
      lathNailKg,
      {
        key: "general-fasteners",
        unit: "кг",
        digits: 3,
        name: `Гвозди/саморезы обрешётки · ${lathCrossingCount} пересечений, ${lathNailCount} шт`,
        exactQuantity: true,
      },
    ),
    makeLine(
      index,
      "roof",
      "Планка конька",
      ridgeBeamLength * inputs.formulas.ridgeReserve,
      { key: "ridge", unit: "м.п." },
    ),
    makeLine(index, "roof", "Монтаж конька", ridgeBeamLength, {
      key: "ridge-work",
      kind: "labor",
      name: "Монтаж планки конька",
    }),
    roof.includeRidgeSeal !== false
      ? makeLine(
          index,
          "roof",
          "Уплотнитель универсальный под конёк",
          ridgeBeamLength * inputs.formulas.ridgeReserve,
          {
            key: "ridge-seal",
            unit: "м.п.",
            name: "Уплотнитель универсальный под конёк",
          },
        )
      : null,
    roof.includeEaveTrim !== false
      ? makeLine(
          index,
          "roof",
          "Планка карнизная",
          mainEaveTrimPurchaseLength,
          { key: "eave-trim", unit: "м.п." },
        )
      : null,
    roof.includeEaveTrim !== false
      ? makeLine(index, "roof", "Монтаж карнизных планок", mainEaveLength, {
          key: "eave-trim-work",
          kind: "labor",
        })
      : null,
    roof.includeVergeTrim !== false
      ? makeLine(
          index,
          "roof",
          "Планка торцевая",
          mainVergeTrimPurchaseLength,
          {
            key: "verge-trim",
            unit: "м.п.",
            name: "Планка торцевая (ветровая)",
          },
        )
      : null,
    roof.includeVergeTrim !== false
      ? makeLine(index, "roof", "Монтаж торцевых", mainVergeLength, {
          key: "verge-trim-work",
          kind: "labor",
          name: "Монтаж торцевых (ветровых) планок",
        })
      : null,
    makeLine(index, "roof", "Жёлоб водосточный", gutterLength, {
      key: "gutter",
      unit: "м.п.",
    }),
    makeLine(index, "roof", "Соединитель жёлоба", gutterConnectors, {
      key: "gutter-connectors",
      unit: "шт",
    }),
    makeLine(index, "roof", "Заглушка жёлоба", gutterEndCaps, {
      key: "gutter-end-caps",
      unit: "шт",
    }),
    makeLine(index, "roof", "Кронштейн жёлоба", gutterBrackets, {
      key: "gutter-brackets",
      unit: "шт",
    }),
    makeLine(index, "roof", "Воронка водосточная", gutterOutlets, {
      key: "gutter-outlets",
      unit: "шт",
    }),
    makeLine(index, "roof", "Труба водосточная", downpipeLength, {
      key: "downpipes",
      unit: "м.п.",
    }),
    makeLine(index, "roof", "Колено (отвод) трубы", gutterElbows, {
      key: "gutter-elbows",
      unit: "шт",
    }),
    makeLine(index, "roof", "Хомут крепления трубы", downpipeClamps, {
      key: "downpipe-clamps",
      unit: "шт",
    }),
    makeLine(
      index,
      "roof",
      "Монтаж водосточной системы (жёлоб)",
      gutterLength,
      { key: "gutter-work", kind: "labor", unit: "м.п." },
    ),
    makeLine(index, "roof", "Монтаж водосточных труб", downpipeLength, {
      key: "downpipe-work",
      kind: "labor",
      unit: "м.п.",
    }),
    makeLine(
      index,
      "roof",
      "Утеплитель 100 мм П50-60",
      insulatedRafterArea * inputs.formulas.rafterInsulationThicknessM,
      {
        key: "open-rafter-insulation",
        unit: "м³",
        digits: 3,
        source: "open-rafter",
      },
    ),
    makeLine(
      index,
      "roof",
      "Укладка утеплителя стен 50 мм",
      insulatedRafterArea,
      {
        key: "open-rafter-insulation-work",
        kind: "labor",
        name: `Укладка минваты в стропила ${Math.round(inputs.formulas.rafterInsulationThicknessM * 1000)} мм`,
        unit: "м²",
        priceMultiplier: inputs.formulas.rafterInsulationThicknessM / 0.05,
        source: "open-rafter",
      },
    ),
    makeLine(
      index,
      "roof",
      'Пароизоляция "В"',
      Math.ceil(
        insulatedRafterArea / Math.max(1, inputs.formulas.vaporBarrierRollArea),
      ),
      { key: "open-rafter-vapor", unit: "рулон", source: "open-rafter" },
    ),
    makeLine(index, "roof", "Монтаж пароизоляции В", insulatedRafterArea, {
      key: "open-rafter-vapor-work",
      kind: "labor",
      source: "open-rafter",
    }),
    makeLine(
      index,
      "roof",
      sipPanelName(
        project.settings.sip.ceilingThickness,
        project.settings.sip.ceilingPanelFamily,
      ),
      mainSipCutting.panels,
      { key: "sip-panel", source: "sip-roof" },
    ),
    makeLine(index, "roof", "Монтаж СИП-кровли", mainSipCutting.area, {
      key: "sip-install",
      kind: "labor",
      source: "sip-roof",
    }),
    makeLine(index, "roof", "Раскрой сип-панелей", mainSipCutting.cutMeters, {
      key: "sip-cut",
      kind: "labor",
      source: "sip-roof",
    }),
    makeLine(
      index,
      "roof",
      "Пеноклей для СИП-панелей 650 мл",
      Math.ceil(mainSipCutting.panels * inputs.formulas.foamUnitsPerPanel),
      { key: "sip-foam", source: "sip-roof" },
    ),
    makeLine(
      index,
      "roof",
      `Саморез конструкционный ${mainSipSupportScrew.size} мм`,
      mainSipSupportScrewKg,
      {
        key: "sip-fasteners",
        unit: "кг",
        name: `Саморезы конструкционные ${mainSipSupportScrew.size} · SIP-кровля · ${mainSipSupportScrewCount} точек опирания`,
        source: "sip-roof",
      },
    ),
    makeLine(
      index,
      "roof",
      "Пластина коньковая перфорированная 180×65×2 мм",
      mainSipRidgePlateCount,
      {
        key: "sip-ridge-plates",
        unit: "шт",
        name: `Коньковые пластины SIP-кровли · ${mainSipRidgePlateCount} узлов`,
        source: "sip-roof",
      },
    ),
    makeLine(
      index,
      "roof",
      "Саморезы 4.2 x 75",
      mainSipRidgePlateScrewKg,
      {
        key: "sip-ridge-plate-screws",
        unit: "кг",
        name: `Саморезы 4,2×75 для коньковых пластин · ${mainSipRidgePlateScrewCount} шт`,
        source: "sip-roof",
      },
    ),
    makeLine(
      index,
      "roof",
      sipPanelName(
        project.settings.sip.wallThickness,
        project.settings.sip.wallPanelFamily,
      ),
      mainGableSipCutting.panels,
      { key: "gable-sip-panel", source: "gables" },
    ),
    makeLine(
      index,
      "roof",
      "Монтаж сип-панели пол/стены",
      mainGableSipCutting.area,
      {
        key: "gable-sip-install",
        kind: "labor",
        name: "Монтаж тёплых SIP-фронтонов",
        source: "gables",
      },
    ),
    makeLine(
      index,
      "roof",
      "Раскрой сип-панелей",
      mainGableSipCutting.cutMeters,
      { key: "gable-sip-cut", kind: "labor", source: "gables" },
    ),
    makeLine(
      index,
      "roof",
      "Пеноклей для СИП-панелей 650 мл",
      Math.ceil(mainGableSipCutting.panels * inputs.formulas.foamUnitsPerPanel),
      { key: "gable-sip-foam", source: "gables" },
    ),
    makeLine(
      index,
      "roof",
      `Саморез конструкционный ${mainGableSupportScrew.size} мм`,
      mainGableSupportScrewCount * mainGableSupportScrew.kgEach,
      { key: "gable-sip-fasteners", unit: "кг", source: "gables" },
    ),
    ...extensionLines,
  ]), mainRoofShape);
  return {
    lines,
    extensionLines,
    geometry,
    mainRoofShape,
    ridgeAxis: roofAxes.ridgeAxis,
    terraceRoofs,
    sipCutting,
    gableSipCutting,
    sipSupportScrewCount: mainSipSupportScrewCount,
    sipSupportScrewSize: mainSipSupportScrew.size,
    sipRidgePlateCount: mainSipRidgePlateCount,
    sipRidgePlateScrewCount: mainSipRidgePlateScrewCount,
    mainGableType,
    rafterStructure,
    coldSlopeArea: round(coldSlopeArea),
    warmSlopeArea: round(warmSlopeArea),
    coldGableArea: round(coldGableArea),
    warmGableArea: round(warmGableArea),
    coldArea: round(coldSlopeArea),
    warmArea: round(warmSlopeArea),
    coldConstructionArea: round(coldArea),
    warmConstructionArea: round(warmArea),
    gableArea: round(gableArea),
    insulatedRafterArea: round(insulatedRafterArea),
    terracePostCount,
    totalArea: round(totalArea),
    mauerlatLength: round(mauerlatLength, 3),
    mauerlatPurchaseLength: round(mauerlatPurchaseLength, 3),
    mauerlatBoardCount,
    mauerlatAnchors,
    mauerlatLayout,
    mauerlatFastener,
    mauerlatFastenerSpacing: round(mauerlatFastenerSpacing, 3),
    mauerlatFastenerPoints,
    mauerlatScrewRows,
    mauerlatScrewCount,
    mauerlatScrewSize: mauerlatScrew.size,
    rafterSupportConnection,
    rafterSupportNodeCount,
    rafterSupportBracketCount,
    framingNailCount,
    framingNailKg: round(framingNailKg, 3),
    lathCrossingCount,
    lathNailCount,
    lathNailKg: round(lathNailKg, 3),
    trussPlateCount,
    ridgeBeamLength: round(ridgeBeamLength, 3),
    ridgeBeamPurchaseLength: round(ridgeBeamPurchaseLength, 3),
    rafterLegLength: round(mainRafterLegLength, 3),
    rafterRequiredLength: round(mainRafterRequiredLength, 3),
    rafterBoardCount: mainRafterBoardCount,
    rafterPurchaseLength: round(mainRafterPurchaseLength, 3),
    mainEaveLength: round(mainEaveLength, 3),
    mainVergeLength: round(mainVergeLength, 3),
    eaveOverhang: round(eaveOverhang, 3),
    gableOverhang: round(gableOverhang, 3),
    mainEaveTrimPurchaseLength: round(mainEaveTrimPurchaseLength, 3),
    mainVergeTrimPurchaseLength: round(mainVergeTrimPurchaseLength, 3),
    lathStep,
    mainLathRequiredLength: round(mainLathRequiredLength, 3),
    mainLathBoardCount,
    gutterLength: round(gutterLength, 3),
    gutterPieces,
    gutterConnectors,
    gutterEndCaps,
    gutterBrackets,
    gutterOutlets,
    downpipeLength: round(downpipeLength, 3),
    gutterElbows,
    downpipeClamps,
    materialComplexityCoefficient: mainRoofShape === "hip" ? 1.25 : 1,
    laborComplexityCoefficient: mainRoofShape === "hip" ? 1.5 : 1,
  };
}

function terraceSection(project, index, inputs) {
  if (!project.services.terrace) return { lines: [], area: 0 };
  const platforms = project.plan.platforms.filter(
    (platform) => platform.include !== false,
  );
  const area = platforms.reduce(
    (sum, platform) => sum + platform.w * platform.h,
    0,
  );
  const perimeter = platforms.reduce(
    (sum, platform) => sum + 2 * (platform.w + platform.h),
    0,
  );
  const stairs = platforms.reduce(
    (sum, platform) => sum + (Math.round(platform.steps) || 0),
    0,
  );
  const staircases = platforms.filter(
    (platform) => Number(platform.steps) > 0,
  ).length;
  return {
    area: round(area),
    lines: compact([
      makeLine(index, "terrace", "Монтаж каркаса террасы", area, {
        key: "frame-work",
        kind: "labor",
        unit: "м²",
      }),
      makeLine(index, "terrace", "Монтаж настила террасы", area, {
        key: "deck-work",
        kind: "labor",
        unit: "м²",
      }),
      makeLine(
        index,
        "terrace",
        "Доска ест. влажн. сосна 50х150мм",
        perimeter * 0.05 * 0.15 +
          area * inputs.formulas.terraceFrameBoardM3PerM2,
        { key: "frame-board", unit: "м³", digits: 3 },
      ),
      makeLine(
        index,
        "terrace",
        "Доска террасная 45×145 мм",
        area * 0.045 * inputs.formulas.terraceDeckReserve,
        { key: "deck", unit: "м³", digits: 3 },
      ),
      makeLine(
        index,
        "terrace",
        "Саморезы 4.2 x 75",
        area * inputs.formulas.terraceScrewKgPerM2,
        { key: "screws", unit: "кг" },
      ),
      makeLine(index, "terrace", "Ступень лестницы", stairs, { key: "steps" }),
      makeLine(index, "terrace", "Изготовление лестниц", staircases, {
        key: "steps-work",
        kind: "labor",
        unit: "шт",
      }),
    ]),
  };
}

function openingSection(project, index) {
  if (!project.services.openings) return { lines: [] };
  const lines = [];
  const floorCount = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const openings = [project.plan, ...(project.upperFloors || []).slice(0, floorCount - 1)]
    .flatMap((plan, floorIndex) =>
      (plan.openings || []).map((opening) => ({ ...opening, floor: floorIndex + 1 })),
    );
  openings
    .filter((opening) => opening.includeInEstimate !== false)
    .forEach((opening, openingIndex) => {
      // Keep original indexes for saved overrides of the remaining openings.
      if (isInteriorDoor(opening)) return;
      const width = Math.round((opening.width || 0.8) * 1000);
      const height = Math.round((opening.height || 2) * 1000);
      const garage = opening.type === "door" && opening.doorType === "garage";
      const type =
        opening.type === "window"
          ? "Окно"
          : garage
            ? "Гаражные ворота"
            : opening.doorType === "interior"
              ? "Комплект межкомнатной двери"
              : "Дверь входная";
      const item =
        findCatalog(index, `${type} ${width}`) || findCatalog(index, type);
      lines.push(
        makeLine(
          index,
          "openings",
          item?.name || `${type} ${width}×${height}`,
          1,
          {
            key: `opening-${openingIndex}`,
            name: item?.name || `${type} ${width}×${height} мм`,
            unit: "шт",
          },
        ),
      );
      const work =
        opening.type === "window"
          ? "Монтаж окна"
          : garage
            ? "Монтаж гаражных ворот"
            : opening.doorType === "interior"
              ? "Установка межкомнатной двери"
              : "Монтаж двери";
      lines.push(
        makeLine(
          index,
          "openings",
          work,
          opening.type === "window" ? opening.width * opening.height : 1,
          { key: `work-${openingIndex}`, kind: "labor" },
        ),
      );
      if (!garage)
        lines.push(
          makeLine(
            index,
            "openings",
            "Комплект крепежа для монтажа окна / двери",
            1,
            { key: `fastener-${openingIndex}`, unit: "компл" },
          ),
        );
    });
  return { lines: compact(lines) };
}

function engineeringSection(project, index, inputs, metrics) {
  if (project.settings.engineering?.assemblyVersion === 1) {
    const calculation = calculateEngineering(project, inputs, metrics);
    return {
      calculation,
      lines: compact(calculation.lines.map((item) => makeLine(
        index,
        'engineering',
        item.catalogId,
        item.qty,
        {
          key: item.key,
          catalogId: item.catalogId,
          estimateGroup: item.group,
          source: 'engineering-assembly',
        },
      ))),
    };
  }
  const s = inputs.engineering;
  const lines = [];
  if (project.services.engineeringElectric) {
    lines.push(
      makeLine(
        index,
        "engineering",
        "Кабель ВВГнг-LS 3×1,5",
        s.cableRoute * 0.45,
        { key: "cable-light", unit: "м" },
      ),
    );
    lines.push(
      makeLine(
        index,
        "engineering",
        "Кабель ВВГнг-LS 3×2,5",
        s.cableRoute * 0.55,
        { key: "cable-power", unit: "м" },
      ),
    );
    lines.push(
      makeLine(
        index,
        "engineering",
        "Монтаж электрической точки",
        s.electricPoints,
        { key: "electric-work", kind: "labor", unit: "точка" },
      ),
    );
  }
  if (project.services.engineeringPlumbing) {
    lines.push(
      makeLine(index, "engineering", "Труба полипропиленовая", s.waterPipe, {
        key: "water-pipe",
        unit: "м",
      }),
    );
    lines.push(
      makeLine(
        index,
        "engineering",
        "Монтаж точки водоснабжения",
        s.waterPoints,
        { key: "water-work", kind: "labor", unit: "точка" },
      ),
    );
  }
  if (project.services.engineeringSewerage) {
    lines.push(
      makeLine(
        index,
        "engineering",
        "Труба канализационная 110",
        s.sewerLength,
        { key: "sewer-pipe", unit: "м" },
      ),
    );
    lines.push(
      makeLine(
        index,
        "engineering",
        "Монтаж внутренней канализации",
        s.sewerPoints,
        { key: "sewer-work", kind: "labor", unit: "точка" },
      ),
    );
  }
  if (project.services.engineeringVentilation) {
    lines.push(
      makeLine(index, "engineering", "Воздуховод", s.ventDuct, {
        key: "vent-duct",
        unit: "м",
      }),
    );
    lines.push(
      makeLine(
        index,
        "engineering",
        "Монтаж вентиляционной решётки",
        s.ventGrilles,
        { key: "vent-work", kind: "labor", unit: "шт" },
      ),
    );
  }
  return { lines: compact(lines), calculation: { mode: 'legacy', settings: project.settings.engineering, warnings: [] } };
}

function finishSections(project, index, inputs, metrics) {
  const internal = inputs.internal;
  const external = inputs.external;
  const internalCalculation = calculateInternal(project, metrics, inputs);
  const internalLines = project.services.internalFinish && internalCalculation.mode === 'rooms'
    ? compact(internalCalculation.lines.map(item => makeLine(index, 'internal', item.description, item.qty, {
        key: item.key,
        catalogId: item.catalogId,
        estimateGroup: item.group,
        source: 'internal-room-assembly',
      })))
    : project.services.internalFinish
    ? compact([
        makeLine(
          index,
          "internal",
          "Монтаж имитации бруса внутри",
          internal.wallArea,
          { key: "wall-work", kind: "labor", unit: "м²" },
        ),
        makeLine(
          index,
          "internal",
          "Имитация бруса",
          internal.wallArea * 0.016,
          { key: "wall-material", unit: "м³" },
        ),
        makeLine(index, "internal", "Ламинат", internal.laminateArea * 1.05, {
          key: "laminate",
          unit: "м²",
        }),
        makeLine(index, "internal", "Укладка ламината", internal.laminateArea, {
          key: "laminate-work",
          kind: "labor",
          unit: "м²",
        }),
        makeLine(index, "internal", "Плитка", internal.tileArea * 1.07, {
          key: "tile",
          unit: "м²",
        }),
        makeLine(index, "internal", "Монтаж керамогранита и плитки", internal.tileArea, {
          key: "tile-work",
          kind: "labor",
          unit: "м²",
        }),
        makeLine(
          index,
          "internal",
          "Комплект межкомнатной двери",
          internal.doors,
          { key: "doors", unit: "шт" },
        ),
        makeLine(index, "internal", "Установка межкомнатной двери с добором", internal.doors, {
          key: "doors-work", kind: "labor", unit: "шт",
        }),
        makeLine(index, "internal", "Комплект крепежа для монтажа окна / двери", internal.doors, {
          key: "doors-fasteners", unit: "компл",
        }),
      ])
    : [];
  const externalLines = project.services.externalFinish
    ? compact([
        makeLine(
          index,
          "external",
          "Монтаж обрешётки фасада",
          external.facadeArea,
          { key: "facade-work", kind: "labor", unit: "м²" },
        ),
        makeLine(
          index,
          "external",
          "Ветро-влагозащита",
          Math.ceil(external.windArea / 70),
          { key: "wind", unit: "рулон" },
        ),
        makeLine(
          index,
          "external",
          "Утеплитель 50мм",
          external.insulationArea * 0.05,
          { key: "insulation", unit: "м³" },
        ),
        makeLine(
          index,
          "external",
          "Профлист С-21 окрашенный",
          external.metalArea,
          { key: "metal", unit: "м²" },
        ),
        makeLine(
          index,
          "external",
          "Саморезы кровельные",
          Math.ceil(external.metalArea * 8),
          { key: "screws", unit: "шт" },
        ),
      ])
    : [];
  return { internalLines, externalLines, internalCalculation };
}

function deliverySection(project, index, inputs) {
  if (!project.services.delivery) return { lines: [] };
  const d = project.settings.delivery;
  return {
    lines: compact([
      makeLine(
        index,
        "delivery",
        "Доставка — базовая стоимость рейса",
        d.trips,
        { key: "base", unit: "рейс", price: d.baseTrip },
      ),
      makeLine(
        index,
        "delivery",
        "Доставка — стоимость 1 км",
        d.distance * d.trips,
        { key: "distance", unit: "км", price: d.perKm },
      ),
      makeLine(
        index,
        "delivery",
        "Погрузка/разгрузка материала",
        inputs.delivery.cargoVolume,
        { key: "unload", unit: "м³", price: d.unloadingPerM3 },
      ),
    ]),
  };
}

export function calculateProject(project) {
  const metrics = calculateBuildingMetrics(project);
  const inputs = deriveLinkedInputs(project, metrics);
  const index = catalogIndex(project);
  const foundation = foundationSection(project, index, inputs);
  const roof = roofSection(project, metrics, index, inputs);
  const sip = sipSection(project, metrics, index, inputs, roof);
  const terrace = terraceSection(project, index, inputs);
  const openings = openingSection(project, index);
  const engineering = engineeringSection(project, index, inputs, metrics);
  const finishes = finishSections(project, index, inputs, metrics);
  const exterior = calculateExterior(project, metrics, roof, inputs.external);
  if (project.settings.external.assemblyVersion !== 0) {
    finishes.externalLines = exterior.lines;
    Object.assign(inputs.external, {
      facadeArea: exterior.area,
      windArea: exterior.settings.windEnabled ? exterior.area : 0,
      insulationArea: exterior.settings.insulationEnabled ? exterior.area : 0,
      metalArea: exterior.areas.metal,
      woodArea: exterior.areas.wood,
      soffitArea: exterior.soffitArea,
    });
  } else {
    // A new plinth must not silently switch a saved legacy facade to the new assembly.
    finishes.externalLines.push(...exterior.lines.filter(line => line.id.startsWith('external:plinth-')));
  }
  const delivery = deliverySection(project, index, inputs);
  const sections = applyProjectEstimateEdits(project, [
    {
      key: "foundation",
      title: "Свайно-винтовой фундамент и обвязка",
      lines: foundation.lines,
    },
    { key: "sip", title: "СИП-конструкции и перегородки", lines: sip.lines },
    { key: "roof", title: "Кровля и фронтоны", lines: roof.lines },
    { key: "terrace", title: "Терраса и крыльцо", lines: terrace.lines },
    { key: "openings", title: "Окна и двери", lines: openings.lines },
    {
      key: "engineering",
      title: "Инженерные системы",
      lines: engineering.lines,
    },
    {
      key: "internal",
      title: "Внутренняя отделка",
      lines: finishes.internalLines,
    },
    {
      key: "external",
      title: "Наружная отделка",
      lines: finishes.externalLines,
    },
    { key: "delivery", title: "Доставка и логистика", lines: delivery.lines },
  ]).filter(
    (section) =>
      section.lines.length ||
      (project.estimateOverrides || []).some(
        (item) => item.section === section.key,
      ),
  );
  const lines = sections.flatMap((section) => section.lines);
  const totals = lines.reduce(
    (acc, line) => {
      const sum = line.qty * line.price;
      if (line.kind === "labor") acc.labor += sum;
      else acc.materials += sum;
      return acc;
    },
    { materials: 0, labor: 0 },
  );
  totals.total = totals.materials + totals.labor;
  return {
    metrics,
    inputs,
    foundation: foundation.foundation,
    sip,
    roof,
    terrace,
    exterior,
    internal: finishes.internalCalculation,
    engineering: engineering.calculation,
    sections,
    lines,
    totals,
  };
}
