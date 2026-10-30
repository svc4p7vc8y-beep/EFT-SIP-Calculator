import { isEstimateLayerIncluded } from './estimate-layer-scope.js';
import { isEstimateAccessory, isEstimateCutting } from './estimate-line-types.js';
export { isEstimateAccessory, isEstimateCutting } from './estimate-line-types.js';

const KIT_NAMES = {
  "Пол": "Комплект для сборки пола",
  "Межэтажное перекрытие / пол 2 этажа":
    "Комплект для сборки межэтажного перекрытия",
  "Потолок": "Комплект для сборки потолка",
  "Наружные стены 1 этажа": "Комплект для сборки наружных стен 1 этажа",
  "Наружные стены 2 этажа": "Комплект для сборки наружных стен 2 этажа",
  "Перегородки 1 этажа": "Комплект для сборки перегородок 1 этажа",
  "Перегородки 2 этажа": "Комплект для сборки перегородок 2 этажа",
};

// Validate final project prices before grouping, and only for rows sent to the client.
export function unpricedClientLines(calculation, options = {}) {
  return (calculation.sections || [{key:'',title:'',lines:calculation.lines||[]}]).flatMap(section => section.lines.filter((line) =>
    Number(line.qty) > 0 &&
    isEstimateLayerIncluded(section, line, options) &&
    (options.includeLabor !== false || line.kind !== 'labor' || isEstimateCutting(line)) &&
    (options.includeAccessories !== false || !isEstimateAccessory(line)) &&
    (!Number.isFinite(Number(line.price)) || Number(line.price) <= 0)
  ));
}

const kitName = (section, group) =>
  KIT_NAMES[group] ||
  `Комплект крепежа и сопутствующих материалов · ${group || section.title}`;

const ROOF_LUMBER_NAME =
  /(мауэрлат|стропил|обреш[её]тк|контробреш[её]тк|пиломатериал|доск|брус|каркас.*фронтон)/iu;
const ROOF_TRIM_NAME =
  /(планк|кон[её]к|карниз|торцев|ветров|ендов|капельник|софит|желоб|водост|воронк|доборн|уплотнител.*кон[её]к)/iu;

const sumAmount = (lines) =>
  lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0), 0);

// Same product, specification, unit and rate only. Room/floor groups do not
// prevent consolidation; the original IDs remain available for traceability.
export function mergeIdenticalEstimateLines(lines) {
  const merged = new Map();
  for (const line of lines) {
    const key = JSON.stringify([line.catalogId || '', line.name, line.kind, line.unit, Number(line.price)]);
    const previous = merged.get(key);
    if (!previous) merged.set(key, { ...line, includedLineIds: [...(line.includedLineIds || [line.id])] });
    else {
      previous.qty += Number(line.qty) || 0;
      previous.includedLineIds.push(...(line.includedLineIds || [line.id]));
      if (previous.estimateGroup !== line.estimateGroup) previous.estimateGroup = '';
    }
  }
  return [...merged.values()];
}

function aggregateLines(lines, { id, name, unit = "компл.", kind = "material", quantity }) {
  if (!lines.length) return null;
  const amount = sumAmount(lines);
  const qty = quantity ? quantity(lines) : 1;
  return {
    id,
    section: lines[0].section,
    name,
    unit,
    qty,
    price: qty > 0 ? amount / qty : 0,
    kind,
    source: "client-maximum-compact",
    estimateGroup: lines[0].estimateGroup,
    includedLineIds: lines.flatMap((line) => line.includedLineIds || [line.id]),
  };
}

function compactRoof(lines, section) {
  const groups = {
    labor: lines.filter((line) => line.kind === "labor" && !isEstimateCutting(line)),
    lumber: lines.filter(
      (line) =>
        line.kind === "material" &&
        line.unit === "м³" &&
        ROOF_LUMBER_NAME.test(String(line.name || "")),
    ),
    trim: lines.filter(
      (line) =>
        line.kind === "material" && ROOF_TRIM_NAME.test(String(line.name || "")) &&
        !(line.unit === 'м³' && ROOF_LUMBER_NAME.test(String(line.name || ''))),
    ),
  };
  const reserved = new Set(
    [...groups.labor, ...groups.lumber, ...groups.trim].map((line) => line.id),
  );
  groups.fasteners = lines.filter(
    (line) => !reserved.has(line.id) && isEstimateAccessory(line),
  );
  groups.fasteners.forEach((line) => reserved.add(line.id));

  const replacements = new Map([
    [groups.lumber[0]?.id, aggregateLines(groups.lumber, {
      id: `client-compact:${section.key}:lumber`,
      name: "Пиломатериал для сборки крыши",
      unit: "м³",
      quantity: (items) => items.reduce((sum, line) => sum + Number(line.qty || 0), 0),
    })],
    [groups.fasteners[0]?.id, aggregateLines(groups.fasteners, {
      id: `client-compact:${section.key}:fasteners`,
      name: "Крепёж для сборки крыши",
    })],
    [groups.trim[0]?.id, aggregateLines(groups.trim, {
      id: `client-compact:${section.key}:trim`,
      name: "Доборные элементы кровли",
    })],
    [groups.labor[0]?.id, aggregateLines(groups.labor, {
      id: `client-compact:${section.key}:labor`,
      name: "Сборка крыши",
      kind: "labor",
    })],
  ]);

  return lines.flatMap((line) => {
    const replacement = replacements.get(line.id);
    if (replacement) return [replacement];
    if (reserved.has(line.id)) return [];
    return [line];
  });
}

const INTERNAL_PRIMARY_IDS = new Set(['MAT-105','MAT-106','MAT-108','MAT-110','MAT-111','MAT-206','MAT-207','MAT-208','MAT-209','MAT-210','MAT-180']);
function internalSurface(line) {
  const group=String(line.estimateGroup||'');
  if(/парн|саун/iu.test(group))return 'Парная / сауна';
  if(/трап/iu.test(group))return 'Трапы помещений';
  if(/потолок/iu.test(group))return 'Потолки';
  if(/стен/iu.test(group))return 'Стены';
  if(/двер/iu.test(group))return 'Двери';
  return 'Полы';
}
function compactInternal(lines,section) {
  const primary=new Map(),buckets=new Map();
  lines.forEach(line=>{
    if(line.kind==='material'&&INTERNAL_PRIMARY_IDS.has(line.catalogId)) {
      const key=`${line.catalogId}:${line.price}:${line.unit}`;
      const current=primary.get(key)||{...line,id:`client-compact:${section.key}:${key}`,qty:0,includedLineIds:[]};
      current.qty+=Number(line.qty)||0;current.includedLineIds.push(line.id);current.estimateGroup=internalSurface(line);primary.set(key,current);return;
    }
    const surface=internalSurface(line),kind=line.kind==='labor'?'labor':'material',key=`${surface}:${kind}`;
    const current=buckets.get(key)||{items:[],surface,kind};current.items.push(line);buckets.set(key,current);
  });
  const aggregated=[...buckets.values()].map(bucket=>aggregateLines(bucket.items,{
    id:`client-compact:${section.key}:${bucket.surface}:${bucket.kind}`,
    name:bucket.kind==='labor'?`Монтаж и отделочные работы · ${bucket.surface}`:`Комплект сопутствующих материалов · ${bucket.surface}`,
    kind:bucket.kind,
  }));
  return [...primary.values(),...aggregated].filter(Boolean);
}

export function buildClientEstimate(calculation, options = {}) {
  const includeLabor = options.includeLabor !== false;
  const includeAccessories = options.includeAccessories !== false;
  const compactAccessories = options.compactAccessories !== false;
  const maximumCompact = options.maximumCompact === true;

  let sections = (calculation.sections || []).map((section) => {
    const visible = section.lines.filter(
      (line) =>
        isEstimateLayerIncluded(section, line, options) &&
        (includeLabor || line.kind !== "labor" || isEstimateCutting(line)) &&
        (includeAccessories || !isEstimateAccessory(line)),
    );
    if (maximumCompact && section.key === "roof") {
      return { ...section, lines: compactRoof(visible, section) };
    }
    if (maximumCompact && section.key === 'internal') {
      return { ...section, lines: compactInternal(visible, section) };
    }
    if ((!compactAccessories && !maximumCompact) || !includeAccessories) {
      return { ...section, lines: visible };
    }

    const kits = new Map();
    const lines = [];
    visible.forEach((line) => {
      if (!isEstimateAccessory(line)) {
        lines.push(line);
        return;
      }
      const group = line.estimateGroup || section.title;
      const current = kits.get(group) || {
        id: `client-kit:${section.key}:${group}`,
        section: section.key,
        name: kitName(section, group),
        unit: "компл.",
        qty: 1,
        price: 0,
        kind: "material",
        source: "client-accessory-kit",
        estimateGroup: group,
        includedLineIds: [],
      };
      current.price += line.qty * line.price;
      current.includedLineIds.push(line.id);
      kits.set(group, current);
    });
    lines.push(...kits.values());
    return { ...section, lines };
  }).filter((section) => section.lines.length)
    .map(section => maximumCompact ? { ...section, lines: mergeIdenticalEstimateLines(section.lines) } : section);

  if (options.mergeConstructionMaterials) {
    const collected=[];
    sections=sections.map(section=>({...section,lines:section.lines.filter(line=>{
      if(line.kind!=='material'||!(/сип-панел|доск|брус|пиломатериал|стропил|мауэрлат|обреш[её]тк/iu.test(line.name)))return true;
      collected.push({...line,name:String(line.name).split(' · ')[0],estimateGroup:''});return false;
    })})).filter(section=>section.lines.length);
    if(collected.length)sections.unshift({key:'merged-materials',title:'Сводные панели и пиломатериал',lines:mergeIdenticalEstimateLines(collected)});
  }
  const totals = sections.reduce(
    (sum, section) => {
      section.lines.forEach((line) => {
        const amount = line.qty * line.price;
        if (line.kind === "labor") sum.labor += amount;
        else sum.materials += amount;
      });
      return sum;
    },
    { materials: 0, labor: 0 },
  );
  totals.total = totals.materials + totals.labor;
  return { sections, totals, compactLines: maximumCompact ? mergeIdenticalEstimateLines(sections.flatMap(section => section.lines)) : [] };
}
