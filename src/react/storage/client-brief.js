import {
  createEmptyPlan,
  createProjectWithCurrentPrices,
  ensureProjectFloorCount,
} from "../state/project-model.js";
import { resizeProjectHouse } from "../planner/geometry.js";

export const CLIENT_BRIEF_FORMAT = "eft-client-brief";
export const CLIENT_BRIEF_SCHEMA_VERSION = 1;
export const PENDING_CLIENT_BRIEF_KEY = "eft-pending-client-brief-v1";

const clone = (value) => structuredClone(value);
const numberOrNull = (value) => {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
};

const SCOPE_TO_SERVICE = {
  "Сваи и обвязка": "foundation",
  "SIP-пол": "sipFloor",
  "SIP-стены": "sipWalls",
  "Перегородки": "partitions",
  "SIP-потолок": "sipCeiling",
  "Кровля": "roof",
  "Окна и двери": "openings",
  "Терраса или крыльцо": "terrace",
  "Доставка": "delivery",
};

const ROOF_SHAPES = {
  Двускатная: "gable",
  Вальмовая: "hip",
  Плоская: "flat",
};

const ROOF_COVERINGS = {
  Профлист: "profile",
  Металлочерепица: "metal-tile",
  "Мягкая кровля": "soft",
};

export function validateClientBrief(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("файл заявки повреждён");
  }
  if (raw.format !== CLIENT_BRIEF_FORMAT) {
    throw new Error("это не файл заявки EFT");
  }
  if (Number(raw.schemaVersion) !== CLIENT_BRIEF_SCHEMA_VERSION) {
    throw new Error("версия файла заявки пока не поддерживается");
  }
  if (!String(raw.customer?.name || "").trim()) {
    throw new Error("в заявке не указано имя клиента");
  }
  return raw;
}

export function clientBriefSummary(raw) {
  const brief = validateClientBrief(raw);
  const project = brief.project || {};
  const dimensions = [numberOrNull(project.length), numberOrNull(project.width)]
    .filter(Boolean)
    .join(" × ");
  return {
    customer: String(brief.customer?.name || "").trim(),
    contact: [brief.customer?.phone, brief.customer?.email].filter(Boolean).join(" · ") || "не указан",
    address: project.address || "не указан",
    dimensions: dimensions ? `${dimensions} м` : "нужно уточнить",
    floors: [1, 2].includes(Number(project.floors)) ? String(project.floors) : "нужно уточнить",
    area: numberOrNull(project.approxArea) ? `${numberOrNull(project.approxArea)} м²` : "не указана",
    scope: Array.isArray(brief.scope) && brief.scope.length ? brief.scope.join(", ") : "не выбран",
  };
}

export function createProjectFromClientBrief(currentProject, raw) {
  const brief = validateClientBrief(raw);
  const next = createProjectWithCurrentPrices(currentProject);

  // A client brief starts a clean draft. Current commercial data and approved
  // calculation rules remain untouched.
  next.settings.formulas = clone(currentProject?.settings?.formulas || next.settings.formulas);
  next.settings.links = clone(currentProject?.settings?.links || next.settings.links);
  next.settings.priceAdjustments = clone(
    currentProject?.settings?.priceAdjustments || next.settings.priceAdjustments,
  );
  next.plan = createEmptyPlan();

  const project = brief.project || {};
  const width = numberOrNull(project.length);
  const height = numberOrNull(project.width);
  if (width && height) resizeProjectHouse(next, width, height);
  const wallHeight = numberOrNull(project.wallHeight);
  if (wallHeight) next.plan.wallHeight = wallHeight;

  next.meta.customer = String(brief.customer?.name || "").trim();
  next.meta.address = String(project.address || "").trim();
  ensureProjectFloorCount(next, [1, 2].includes(Number(project.floors)) ? Number(project.floors) : 1);

  if (Array.isArray(brief.scope)) {
    for (const service of Object.values(SCOPE_TO_SERVICE)) next.services[service] = false;
    for (const label of brief.scope) {
      const service = SCOPE_TO_SERVICE[label];
      if (service) next.services[service] = true;
    }
  }
  next.services.sipSecondFloor = next.meta.floors > 1 && next.services.sipFloor;

  const thickness = (value) => /^(124|174|224)(?:\s*мм)?$/.exec(String(value || ""))?.[1];
  const wallThickness = thickness(brief.sip?.wallThickness);
  const floorThickness = thickness(brief.sip?.floorThickness);
  const ceilingThickness = thickness(brief.sip?.ceilingThickness);
  if (wallThickness) next.settings.sip.wallThickness = wallThickness;
  if (floorThickness) next.settings.sip.floorThickness = floorThickness;
  if (ceilingThickness) next.settings.sip.ceilingThickness = ceilingThickness;
  if (brief.sip?.partitionType === "Каркасные") next.settings.sip.partitionType = "frame";
  if (brief.sip?.partitionType === "SIP-панели") next.settings.sip.partitionType = "sip";
  const panelFamily = {
    PPS: "pps",
    Минвата: "mineral-wool",
    "CSP PPS": "csp-pps",
  }[brief.sip?.panelFamily];
  if (panelFamily) {
    next.settings.sip.floorPanelFamily = panelFamily;
    next.settings.sip.wallPanelFamily = panelFamily;
    next.settings.sip.ceilingPanelFamily = panelFamily;
  }
  if (brief.sip?.panelLayout === "625 мм") {
    next.settings.sip.floorPanelWidth = "0.625";
    next.settings.sip.ceilingPanelWidth = "0.625";
  }

  const roofShape = ROOF_SHAPES[brief.roof?.shape];
  const roofCovering = ROOF_COVERINGS[brief.roof?.covering];
  if (roofShape) next.settings.roof.shape = roofShape;
  if (roofCovering) next.settings.roof.covering = roofCovering;
  if (brief.roof?.type === "Тёплая SIP") next.settings.roof.type = "sip";
  if (brief.roof?.type === "Холодная") next.settings.roof.type = "cold";
  if (numberOrNull(brief.roof?.ridgeHeight)) next.settings.roof.ridgeHeight = numberOrNull(brief.roof.ridgeHeight);
  if (numberOrNull(brief.roof?.eaveOverhang)) next.settings.roof.eaveOverhang = numberOrNull(brief.roof.eaveOverhang);
  if (numberOrNull(brief.roof?.gableOverhang)) next.settings.roof.gableOverhang = numberOrNull(brief.roof.gableOverhang);
  const gableType = {
    "По типу кровли": "auto",
    Каркасные: "cold",
    "Из SIP-панелей": "sip",
    "Не учитывать": "none",
  }[brief.roof?.gableType];
  if (gableType) next.settings.roof.gableType = gableType;
  if (roofShape === "gable" && Number.isFinite(Number(brief.roof?.gableCount))) {
    next.settings.roof.gableCount = Math.min(2, Math.max(0, Math.round(Number(brief.roof.gableCount))));
  }
  if (roofShape === "flat") {
    next.settings.roof.flatSlopeDirection = String(brief.roof?.slopeDirection || "").trim();
    next.settings.roof.flatSlopePercent = numberOrNull(brief.roof?.slopePercent);
  }

  if (Array.isArray(brief.scope)) {
    const enabled = new Set(brief.scope);
    next.services.engineeringElectric = enabled.has("Инженерия") && brief.engineering?.electricStage !== "Не нужна";
    next.services.engineeringPlumbing = enabled.has("Инженерия") && brief.engineering?.waterSource !== "Не нужен";
    next.services.engineeringSewerage = enabled.has("Инженерия") && brief.engineering?.sewer !== "Не нужна";
    next.services.engineeringVentilation = enabled.has("Инженерия") && Boolean(brief.engineering?.ventilation);
    next.services.internalFinish = enabled.has("Внутренняя отделка");
    next.services.externalFinish = enabled.has("Внешняя отделка");
  }

  next.clientBrief = {
    ...clone(brief),
    importedAt: new Date().toISOString(),
  };
  return next;
}
