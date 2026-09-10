import { EFT_NODE_LIBRARY, getEftNodeRule } from '../data/eft-node-library.js';
import { detectSipTJunctions, resolveSipStructuralScrew, resolveSipSupportScrew } from './sip-joinery.js';

const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const pointDistance = (a, b) => Math.hypot((Number(b?.x) || 0) - (Number(a?.x) || 0), (Number(b?.y) || 0) - (Number(a?.y) || 0));

const contourPoints = (plan) => {
  const points = Array.isArray(plan?.house?.points) ? plan.house.points : [];
  if (points.length >= 3) return points.map(({ x, y }) => ({ x: Number(x) || 0, y: Number(y) || 0 }));
  const width = Number(plan?.house?.w) || 0;
  const height = Number(plan?.house?.h) || 0;
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
};

const contourRuns = (plan) => contourPoints(plan).map((start, index, points) => {
  const end = points[(index + 1) % points.length];
  return {
    index,
    start,
    end,
    length: pointDistance(start, end),
    x: round((start.x + end.x) / 2),
    y: round((start.y + end.y) / 2),
  };
}).filter((run) => run.length > 0);

const meaningfulCorners = (plan) => contourPoints(plan).filter((point, index, points) => {
  const previous = points[(index - 1 + points.length) % points.length];
  const next = points[(index + 1) % points.length];
  const cross = (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x);
  return Math.abs(cross) > 1e-6;
});

const formulaValue = (formulas, key, fallback = 0) => Number(formulas?.[key]) || fallback;
const safeId = (value) => String(value).replace(/[^a-zA-Z0-9_-]+/g, '-');
const displaySize = (value) => value ? String(value).replace('x', '×') : null;

function resolveFastener(rule, context, formulas) {
  const template = rule?.fasteners?.[0];
  if (!template) return null;
  let size = template.size;
  let kgEach = null;
  if (size === 'BY_SIP_THICKNESS') {
    const resolved = resolveSipStructuralScrew(context.panelThickness, formulas);
    size = resolved.size;
    kgEach = resolved.kgEach;
  } else if (size === 'NEXT_SIZE_BY_SIP_THICKNESS') {
    const resolved = resolveSipSupportScrew(context.panelThickness, formulas);
    size = resolved.size;
    kgEach = resolved.kgEach;
  } else if (size === 'BY_SIP_THICKNESS_OR_M12') {
    if (context.fastenerType === 'anchors') size = 'M12×150';
    else {
      const resolved = resolveSipStructuralScrew(context.panelThickness, formulas);
      size = resolved.size;
      kgEach = resolved.kgEach;
    }
  }
  const sizeNumbers = String(size || '').match(/(\d+(?:\.\d+)?)\D+(\d+)/);
  return {
    ...template,
    size: displaySize(size),
    diameterMm: template.diameterMm ?? (sizeNumbers ? Number(sizeNumbers[1]) : null),
    lengthMm: template.lengthMm ?? (sizeNumbers ? Number(sizeNumbers[2]) : null),
    kgEach,
  };
}

function makeNode(type, id, context, formulas, calculatedQty = 0, extra = {}) {
  const rule = getEftNodeRule(type);
  const fastener = resolveFastener(rule, context, formulas);
  const spacing = extra.spacing ?? (fastener?.stepFormulaKey ? formulaValue(formulas, fastener.stepFormulaKey) : null);
  const qtyPerNode = extra.qtyPerNode ?? (fastener?.qtyFormulaKey ? formulaValue(formulas, fastener.qtyFormulaKey) : null);
  return {
    id: `node-${safeId(id)}`,
    type,
    name: rule?.name || type,
    section: rule?.section || 'Без раздела',
    marker: rule?.marker || '?',
    source: 'auto',
    floor: context.floor || 1,
    x: round(extra.x ?? context.x ?? 0),
    y: round(extra.y ?? context.y ?? 0),
    length: round(extra.length ?? 0),
    nodeCount: Math.max(1, Math.round(extra.nodeCount || 1)),
    panelThickness: Number(context.panelThickness) || null,
    elements: rule?.elements || [],
    fastenerRule: type,
    fastener,
    spacing,
    qtyPerNode,
    calculatedQty: Math.max(0, Math.round(calculatedQty || 0)),
    reservePercent: extra.reservePercent,
    requiresEngineeringReview: rule?.requiresEngineeringReview !== false,
    sourceReference: rule?.source || { type: 'UNCONFIRMED', pages: null },
    formula: extra.formula || (calculatedQty ? `${calculatedQty} шт по геометрии узла` : 'Норма крепежа не подтверждена'),
    warnings: [...(extra.warnings || [])],
    enabled: true,
  };
}

function applyStoredOverrides(autoNodes, storedNodes, formulas) {
  const storedById = new Map((storedNodes || []).filter((item) => item?.id).map((item) => [item.id, item]));
  const merged = autoNodes.map((node) => {
    const saved = storedById.get(node.id);
    if (!saved) return node;
    const type = saved.type || node.type;
    const rule = getEftNodeRule(type);
    const context = { panelThickness: saved.panelThickness || node.panelThickness, fastenerType: saved.fastenerType };
    const fastener = saved.fastenerOverride || resolveFastener(rule, context, formulas) || node.fastener;
    return {
      ...node,
      type,
      name: rule?.name || node.name,
      section: rule?.section || node.section,
      marker: rule?.marker || node.marker,
      enabled: saved.enabled !== false,
      spacing: Number.isFinite(Number(saved.spacingOverride)) ? Math.max(0, Number(saved.spacingOverride)) : node.spacing,
      qtyPerNode: Number.isFinite(Number(saved.qtyPerNodeOverride)) ? Math.max(0, Number(saved.qtyPerNodeOverride)) : node.qtyPerNode,
      calculatedQty: Number.isFinite(Number(saved.calculatedQtyOverride)) ? Math.max(0, Math.round(Number(saved.calculatedQtyOverride))) : node.calculatedQty,
      reservePercent: Number.isFinite(Number(saved.reservePercent)) ? Math.max(0, Number(saved.reservePercent)) : node.reservePercent,
      packSize: Number.isFinite(Number(saved.packSize)) ? Math.max(0, Number(saved.packSize)) : node.packSize,
      fastener,
      requiresEngineeringReview: saved.requiresEngineeringReview ?? rule?.requiresEngineeringReview ?? node.requiresEngineeringReview,
      sourceReference: rule?.source || node.sourceReference,
      override: saved,
    };
  });
  const autoIds = new Set(autoNodes.map((node) => node.id));
  const manual = (storedNodes || []).filter((node) => node?.source === 'manual' && !autoIds.has(node.id)).map((node, index) => {
    const rule = getEftNodeRule(node.type) || EFT_NODE_LIBRARY.SIP_WALL_T;
    return {
      ...makeNode(rule.code, node.id || `manual-${index + 1}`, { panelThickness: node.panelThickness }, formulas, node.calculatedQtyOverride || node.calculatedQty || 0, node),
      ...node,
      source: 'manual',
      name: rule.name,
      section: rule.section,
      marker: rule.marker,
      fastener: node.fastenerOverride || resolveFastener(rule, node, formulas),
      enabled: node.enabled !== false,
    };
  });
  return [...merged, ...manual];
}

function wallNodes(project, calculation, formulas) {
  const nodes = [];
  const floorPlans = calculation.metrics?.floorPlans || [{ plan: project.plan }];
  const rows = calculation.sip?.joinery?.rows || [];
  const usageByKey = new Map((calculation.sip?.consumables?.rows || []).map((row) => [row.key, row]));
  rows.forEach((row) => {
    const floor = row.key.includes('SecondFloor') || row.key === 'secondFloor' ? 2 : row.key === 'ceiling' ? floorPlans.length : 1;
    const plan = floorPlans[Math.min(floor - 1, floorPlans.length - 1)]?.plan || project.plan;
    const center = { x: (Number(plan.house?.w) || 0) / 2, y: (Number(plan.house?.h) || 0) / 2 };
    const usage = usageByKey.get(row.key) || {};
    const seamCount = Math.ceil((Number(row.jointLength) || 0) * 2 / formulaValue(formulas, 'sipSeamScrewSpacingM', 0.15));
    if (row.jointLength > 0) nodes.push(makeNode('SIP_SPLINE', `${floor}-${row.key}-splines`, { floor, ...center, panelThickness: row.panelThickness }, formulas, seamCount, {
      length: row.jointLength,
      nodeCount: Math.max(1, Math.ceil(row.jointLength / 2.5)),
      formula: `${round(row.jointLength, 2)} м × 2 стороны ÷ ${formulaValue(formulas, 'sipSeamScrewSpacingM', 0.15)} м`,
    }));
    if (row.endBoardLength > 0) nodes.push(makeNode('SIP_EDGE_BOARD', `${floor}-${row.key}-edges`, { floor, ...center, panelThickness: row.panelThickness }, formulas, usage.edgeCount, {
      length: row.endBoardLength,
      formula: `ceil(${round(row.endBoardLength, 2)} м ÷ ${formulaValue(formulas, 'sipEdgeScrewSpacingM', 0.4)} м)`,
    }));
    const supportCount = Math.max(0, (usage.seamCount || 0) - seamCount);
    if (supportCount) nodes.push(makeNode('SIP_PANEL_SUPPORT', `${floor}-${row.key}-panel-supports`, { floor, ...center, panelThickness: row.panelThickness }, formulas, supportCount, {
      nodeCount: calculation.sip?.cutting?.find((item) => item.key === row.key)?.panels || 1,
      formula: `${calculation.sip?.cutting?.find((item) => item.key === row.key)?.panels || 0} пан. × ${formulaValue(formulas, 'sipPanelSupportScrews', 8)} шт`,
    }));

    if (row.key.startsWith('walls')) {
      const runs = contourRuns(plan);
      const bindingSpacing = formulaValue(formulas, 'sipBindingScrewSpacingM', 1.5);
      const structural = resolveSipStructuralScrew(row.panelThickness, formulas);
      const support = row.supportPanelThickness ? resolveSipSupportScrew(row.supportPanelThickness, formulas) : structural;
      runs.forEach((run) => {
        const count = Math.max(1, Math.ceil(run.length / bindingSpacing));
        const startType = Number(row.supportPanelThickness) >= 224 ? 'SIP_START_BOARD_THROUGH_224' : 'SIP_START_BOARD';
        nodes.push(makeNode(startType, `${floor}-start-${run.index}`, { floor, panelThickness: row.supportPanelThickness || row.panelThickness }, formulas, count, {
          ...run,
          formula: `ceil(${round(run.length, 2)} м ÷ ${bindingSpacing} м)`,
          fastenerOverride: support,
        }));
        nodes.push(makeNode('SIP_TOP_BOARD', `${floor}-top-${run.index}`, { floor, panelThickness: row.panelThickness }, formulas, count, {
          ...run,
          formula: `ceil(${round(run.length, 2)} м ÷ ${bindingSpacing} м)`,
        }));
      });
      const cornerSpacing = formulaValue(formulas, 'sipCornerScrewSpacingM', 1.5);
      meaningfulCorners(plan).forEach((point, index) => {
        const height = Number(plan.wallHeight) || 2.5;
        const count = Math.ceil(height / cornerSpacing) + 1;
        nodes.push(makeNode('SIP_WALL_CORNER', `${floor}-corner-${index}`, { floor, ...point, panelThickness: row.panelThickness }, formulas, count, {
          length: height,
          formula: `ceil(${height} м ÷ ${cornerSpacing} м) + 1`,
          warnings: [{ code: 'TIMBER_INSERT_CONFIRMATION', severity: 'info', message: 'Подтвердите наличие деревянной закладной в наружном углу.' }],
        }));
      });
      (plan.openings || []).filter((opening) => opening.outer !== false && opening.subtractFromSip !== false).forEach((opening, index) => {
        const width = Math.max(0, Number(opening.width) || 0);
        const height = Math.max(0, Number(opening.height) || 0);
        const base = width && height ? 2 * Math.max(1, Math.ceil(width / bindingSpacing)) + 2 * Math.max(1, Math.ceil(height / bindingSpacing)) : 0;
        const multiplier = opening.type === 'door' && opening.doorType === 'garage'
          ? formulaValue(formulas, 'sipGarageOpeningFastenerMultiplier', 2)
          : opening.type === 'door' && opening.doorType !== 'interior'
            ? formulaValue(formulas, 'sipEntranceOpeningFastenerMultiplier', 1.5)
            : 1;
        const type = opening.type === 'window' ? 'OPENING_FRAME_WINDOW' : 'OPENING_FRAME_DOOR';
        nodes.push(makeNode(type, `${floor}-opening-${opening.id || index}`, { floor, panelThickness: row.panelThickness }, formulas, Math.ceil(base * multiplier), {
          x: Number(opening.x) || center.x,
          y: Number(opening.y) || center.y,
          length: 2 * (width + height),
          formula: `${base} шт по периметру × ${multiplier} усиление`,
        }));
      });
    } else if (['floor', 'secondFloor', 'ceiling'].includes(row.key) && row.structuralCount > 0) {
      const type = row.key === 'floor' ? 'SIP_FLOOR_SUPPORT' : row.key === 'ceiling' ? 'SIP_WALL_TO_CEILING' : 'SIP_WALL_TO_FLOOR';
      nodes.push(makeNode(type, `${floor}-${row.key}-support`, { floor, ...center, panelThickness: row.supportPanelThickness || row.panelThickness }, formulas, row.structuralCount, {
        length: row.endBoardLength,
        nodeCount: contourRuns(plan).length,
        formula: `${round(row.endBoardLength, 2)} м опорного контура; расчёт каждой стороны с шагом ${formulaValue(formulas, 'sipBindingScrewSpacingM', 1.5)} м`,
      }));
    }
  });
  floorPlans.forEach((item, floorIndex) => {
    if (project.settings.sip.partitionType !== 'sip') return;
    detectSipTJunctions(item.plan).forEach((point, index) => {
      const qty = formulaValue(formulas, 'sipUniversalScrewsPerTNode', 2);
      nodes.push(makeNode('SIP_WALL_T', `${floorIndex + 1}-t-${index}`, { floor: floorIndex + 1, ...point, panelThickness: project.settings.sip.partitionThickness }, formulas, qty, {
        formula: `1 Т-узел × ${qty} шт`,
      }));
    });
  });
  return nodes;
}

function roofNodes(project, calculation, formulas) {
  const roof = calculation.roof || {};
  if (!roof.geometry) return [];
  const center = { x: (Number(project.plan.house?.w) || 0) / 2, y: (Number(project.plan.house?.h) || 0) / 2 };
  const nodes = [];
  if (roof.mauerlatLength > 0 && roof.mauerlatFastener !== 'none') {
    const qty = roof.mauerlatFastener === 'anchors' ? roof.mauerlatAnchors : roof.mauerlatScrewCount;
    nodes.push(makeNode('MAUERLAT', 'roof-mauerlat', { ...center, panelThickness: project.settings.sip.wallThickness, fastenerType: roof.mauerlatFastener }, formulas, qty, {
      length: roof.mauerlatLength,
      nodeCount: roof.mauerlatFastenerPoints || 1,
      spacing: roof.mauerlatFastenerSpacing,
      formula: roof.mauerlatFastener === 'anchors'
        ? `${roof.mauerlatFastenerPoints} точек анкеров с шагом ${roof.mauerlatFastenerSpacing} м`
        : `${roof.mauerlatFastenerPoints} точек × ${roof.mauerlatScrewRows} ряда`,
    }));
  }
  if (roof.sipSupportScrewCount > 0) nodes.push(makeNode('SIP_ROOF_SUPPORT', 'roof-sip-supports', { ...center, panelThickness: project.settings.sip.ceilingThickness }, formulas, roof.sipSupportScrewCount, {
    nodeCount: roof.sipCutting?.panels || 1,
    formula: `${roof.sipCutting?.panels || 0} пан. × ${formulaValue(formulas, 'sipRoofSupportPointsPerPanel', 2)} точки`,
  }));
  if (roof.rafterSupportNodeCount > 0) {
    const supportPerNode = roof.rafterSupportConnection === 'angles'
      ? formulaValue(formulas, 'roofAngleNailsPerBracket', 5)
      : formulaValue(formulas, 'roofRafterSupportNails', 3);
    nodes.push(makeNode('RAFTER_TO_MAUERLAT', 'roof-rafter-support', center, formulas, roof.rafterSupportNodeCount * supportPerNode, {
      nodeCount: roof.rafterSupportNodeCount,
      qtyPerNode: supportPerNode,
      formula: `${roof.rafterSupportNodeCount} узл. × ${supportPerNode} шт`,
    }));
    const ridgePerNode = formulaValue(formulas, 'roofRafterRidgeNails', 3);
    nodes.push(makeNode('RAFTER_TO_RIDGE', 'roof-rafter-ridge', center, formulas, roof.rafterSupportNodeCount * ridgePerNode, {
      nodeCount: roof.rafterSupportNodeCount,
      qtyPerNode: ridgePerNode,
      formula: `${roof.rafterSupportNodeCount} узл. × ${ridgePerNode} шт`,
    }));
    const known = roof.rafterSupportNodeCount * (supportPerNode + ridgePerNode);
    const tieQty = Math.max(0, (roof.framingNailCount || 0) - known);
    if (tieQty) {
      const tiePerNode = formulaValue(formulas, 'roofRafterTieNails', 3);
      nodes.push(makeNode('RAFTER_TIE', 'roof-rafter-ties', center, formulas, tieQty, {
        nodeCount: Math.max(1, Math.round(tieQty / tiePerNode)),
        qtyPerNode: tiePerNode,
        formula: `${Math.max(1, Math.round(tieQty / tiePerNode))} узл. × ${tiePerNode} шт`,
      }));
    }
  }
  if (roof.lathCrossingCount > 0) nodes.push(makeNode('ROOF_LATH', 'roof-lath-crossings', center, formulas, roof.lathNailCount, {
    nodeCount: roof.lathCrossingCount,
    qtyPerNode: formulaValue(formulas, 'roofLathNailsPerCrossing', 2),
    length: roof.mainLathRequiredLength,
    formula: `${roof.lathCrossingCount} пересеч. × ${formulaValue(formulas, 'roofLathNailsPerCrossing', 2)} шт`,
  }));
  if (project.settings.roof.showCounterLath === true) nodes.push(makeNode('ROOF_COUNTERLATH', 'roof-counterlath', center, formulas, 0, {
    length: roof.rafterLegLength,
    formula: 'Геометрия известна, подтверждённая норма крепежа отсутствует',
  }));
  return nodes;
}

function foundationAndExtensionNodes(project, calculation, formulas) {
  const nodes = [];
  const center = { x: (Number(project.plan.house?.w) || 0) / 2, y: (Number(project.plan.house?.h) || 0) / 2 };
  if (calculation.foundation?.totalPiles > 0) {
    const perPile = formulaValue(formulas, 'pileLagScrews', 4);
    nodes.push(makeNode('PILE_BINDING', 'foundation-pile-binding', center, formulas, calculation.foundation.totalPiles * perPile, {
      nodeCount: calculation.foundation.totalPiles,
      length: calculation.foundation.bindingLength,
      qtyPerNode: perPile,
      formula: `${calculation.foundation.totalPiles} свай × ${perPile} шт`,
    }));
  }
  (project.plan.platforms || []).filter((platform) => platform.include !== false).forEach((platform, index) => {
    const isPorch = platform.kind === 'porch' || platform.type === 'porch' || /крыл/i.test(platform.name || '');
    const type = isPorch ? 'PORCH_FRAME' : 'TERRACE_LEDGER';
    nodes.push(makeNode(type, `platform-${platform.id || index}`, {
      x: (Number(platform.x) || 0) + (Number(platform.w) || 0) / 2,
      y: (Number(platform.y) || 0) + (Number(platform.h) || 0) / 2,
    }, formulas, 0, {
      length: Number(platform.w) || 0,
      formula: 'Узел обнаружен по геометрии площадки; норма не назначена',
    }));
    if (!isPorch) nodes.push(makeNode('TERRACE_JOIST', `platform-${platform.id || index}-joists`, {
      x: (Number(platform.x) || 0) + (Number(platform.w) || 0) / 2,
      y: (Number(platform.y) || 0) + (Number(platform.h) || 0) / 2,
    }, formulas, 0, {
      length: Number(platform.h) || 0,
      formula: 'Площадка обнаружена; шаг лаг и подтверждённая норма крепежа не заданы',
    }));
  });
  return nodes;
}

function nodeWarnings(node) {
  const warnings = [...(node.warnings || [])];
  if (!node.fastener || !node.fastener.size) warnings.push({ code: 'MISSING_FASTENER_RULE', severity: 'warning', message: 'Узел обнаружен, но типоразмер крепежа не подтверждён.' });
  if (node.requiresEngineeringReview) warnings.push({ code: 'ENGINEERING_REVIEW', severity: 'warning', message: 'Требуется инженерная проверка узла.' });
  const minimumLength = node.type === 'SIP_START_BOARD_THROUGH_224'
    ? 45 + (Number(node.panelThickness) || 224) + 50
    : null;
  if (minimumLength && Number(node.fastener?.lengthMm) < minimumLength) warnings.push({
    code: 'FASTENER_TOO_SHORT',
    severity: 'error',
    message: `Стартовая доска 45 мм + SIP ${node.panelThickness || 224} мм + заход 50 мм = минимум ${minimumLength} мм.`,
  });
  return warnings;
}

function buildConstructionSnapshot(project, calculation, nodes) {
  const cutting = calculation.sip?.cutting || [];
  const joinery = calculation.sip?.joinery?.rows || [];
  const mapPanels = (keys) => cutting.filter((row) => keys.some((key) => row.key.includes(key))).map((row) => ({ id: `panels-${row.key}`, source: 'auto', area: row.area, panels: row.panels, panelThickness: row.thickness || null }));
  const fromNodes = (types) => nodes.filter((node) => types.includes(node.type)).map(({ id, type, floor, x, y, length, source }) => ({ id, type, floor, x, y, length, source }));
  return {
    floorPanels: mapPanels(['floor', 'secondFloor']),
    wallPanels: mapPanels(['walls', 'partitions']),
    ceilingPanels: mapPanels(['ceiling']),
    splines: joinery.map((row) => ({ id: `spline-${row.key}`, source: 'auto', length: row.jointLength, profileDepth: row.thermalDepth, floor: row.key.includes('SecondFloor') ? 2 : 1 })),
    starterBoards: fromNodes(['SIP_START_BOARD', 'SIP_START_BOARD_THROUGH_224']),
    topBoards: fromNodes(['SIP_TOP_BOARD']),
    edgeBoards: joinery.map((row) => ({ id: `edge-${row.key}`, source: 'auto', length: row.endBoardLength, profileDepth: row.endBoardDepth })),
    rafters: calculation.roof?.rafterStructure ? [{ id: 'rafters-main', source: 'auto', ...calculation.roof.rafterStructure, requiredLength: calculation.roof.rafterRequiredLength }] : [],
    mauerlat: calculation.roof?.mauerlatLength > 0 ? [{ id: 'mauerlat-main', source: 'auto', length: calculation.roof.mauerlatLength, layout: calculation.roof.mauerlatLayout }] : [],
    lath: calculation.roof?.mainLathRequiredLength > 0 ? [{ id: 'lath-main', source: 'auto', length: calculation.roof.mainLathRequiredLength, step: calculation.roof.lathStep }] : [],
    counterLath: project.settings.roof.showCounterLath === true ? [{ id: 'counterlath-main', source: 'auto', length: calculation.roof?.rafterLegLength || 0, requiresEngineeringReview: true }] : [],
  };
}

function groupRows(nodes, settings) {
  const reserveDefault = Math.max(0, Number(settings.reservePercent) || 0);
  const packSizes = settings.packSizes || {};
  const grouped = new Map();
  nodes.filter((node) => node.enabled !== false).forEach((node) => {
    const fastenerKey = node.fastener?.size || node.fastener?.type || 'UNASSIGNED';
    const key = [node.section, node.type, fastenerKey, node.spacing ?? '', node.qtyPerNode ?? ''].join('|');
    const current = grouped.get(key) || {
      key,
      section: node.section,
      type: node.type,
      node: node.name,
      fastenerType: node.fastener?.type || 'Не назначен',
      size: node.fastener?.size || '—',
      nodeCount: 0,
      length: 0,
      spacing: node.spacing,
      calculatedQty: 0,
      reservePercent: node.reservePercent ?? reserveDefault,
      packSize: node.packSize || Number(packSizes[fastenerKey]) || null,
      source: node.sourceReference,
      requiresEngineeringReview: false,
      formulas: [],
    };
    current.nodeCount += node.nodeCount || 1;
    current.length = round(current.length + (Number(node.length) || 0));
    current.calculatedQty += Math.max(0, Number(node.calculatedQty) || 0);
    current.requiresEngineeringReview ||= node.requiresEngineeringReview === true;
    if (node.formula && !current.formulas.includes(node.formula)) current.formulas.push(node.formula);
    grouped.set(key, current);
  });
  return [...grouped.values()].map((row) => {
    const calculatedQty = Math.ceil(row.calculatedQty);
    const withReserve = Math.ceil(calculatedQty * (1 + row.reservePercent / 100));
    const purchasePacks = row.packSize ? Math.ceil(withReserve / row.packSize) : null;
    return {
      ...row,
      calculatedQty,
      withReserve,
      purchasePacks,
      purchaseQty: purchasePacks === null ? withReserve : purchasePacks * row.packSize,
      formula: row.formulas.join(' + '),
    };
  });
}

export function calculateConstructionNodes(project, calculation) {
  const formulas = project.settings?.formulas || {};
  const autoNodes = [
    ...wallNodes(project, calculation, formulas),
    ...roofNodes(project, calculation, formulas),
    ...foundationAndExtensionNodes(project, calculation, formulas),
  ];
  const nodes = applyStoredOverrides(autoNodes, project.nodes, formulas).map((node) => ({ ...node, warnings: nodeWarnings(node) }));
  const settings = { reservePercent: 10, packSizes: {}, ...(project.settings?.nodeFasteners || {}) };
  const rows = groupRows(nodes, settings);
  const order = new Map();
  const purchase = [];
  rows.filter((row) => row.calculatedQty > 0 && row.size !== '—').forEach((row) => {
    const key = `${row.fastenerType}|${row.size}`;
    if (!order.has(key)) {
      order.set(key, purchase.length);
      purchase.push({ key, fastenerType: row.fastenerType, size: row.size, calculatedQty: 0, withReserve: 0, purchaseQty: 0, purchasePacks: 0, packSize: row.packSize });
    }
    const item = purchase[order.get(key)];
    item.calculatedQty += row.calculatedQty;
    item.withReserve += row.withReserve;
    item.purchaseQty += row.purchaseQty;
    if (row.purchasePacks !== null) item.purchasePacks += row.purchasePacks;
    else item.purchasePacks = null;
  });
  const construction = buildConstructionSnapshot(project, calculation, nodes);
  return {
    libraryVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: project.settings?.sip?.consumablesMode === 'quick' ? 'quick-with-node-diagnostics' : 'node',
    construction,
    nodes,
    rows,
    purchase,
    warnings: nodes.flatMap((node) => node.warnings.map((warning) => ({ ...warning, nodeId: node.id, nodeType: node.type, nodeName: node.name }))),
    stats: Object.fromEntries(Object.entries(nodes.reduce((map, node) => {
      map[node.type] = (map[node.type] || 0) + (node.nodeCount || 1);
      return map;
    }, {})).sort()),
  };
}
