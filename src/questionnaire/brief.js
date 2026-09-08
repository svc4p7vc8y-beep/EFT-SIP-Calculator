export const QUESTIONNAIRE_STORAGE_KEY = "eft-house-questionnaire-v2";
export const PENDING_CLIENT_BRIEF_KEY = "eft-pending-client-brief-v1";

export const initialAnswers = {
  goal: "Тёплый контур", customerName: "", phone: "", email: "", address: "", region: "",
  buildingType: "Жилой дом",
  siteArea: "", cadastralNumber: "", terrain: "Ровный", soil: "Не знаю", access: "Свободный",
  deliveryDistance: "",
  electricityOnSite: "Есть", waterOnSite: "Не выбрано", sewerOnSite: "Не выбрано",
  length: "10", width: "8", approxArea: "80", floors: "1", wallHeight: "2.5",
  houseShape: "Прямоугольная", basement: "Нет", attic: "Нет",
  bedrooms: "3", bathrooms: "1", kitchens: "1", utilityRooms: "1", roomsNotes: "",
  secondLight: false, staircaseOpening: false, windowsCount: "8", entranceDoorsCount: "1",
  interiorDoorsCount: "6", garageDoorsCount: "0", terrace: false, porch: true, balcony: false,
  windowWidth: "1.2", windowHeight: "1.4", entranceDoorWidth: "0.96", entranceDoorHeight: "2.05",
  garageDoorWidth: "3", garageDoorHeight: "2.5", openingsNotes: "",
  platformSize: "", platformLength: "", platformWidth: "", platformSide: "Подобрать", platformRoof: "Без кровли",
  scope: ["Сваи и обвязка", "SIP-пол", "SIP-стены", "Перегородки", "SIP-потолок", "Кровля", "Доставка"],
  wallThickness: "174 мм", floorThickness: "224 мм", ceilingThickness: "224 мм",
  secondFloorThickness: "224 мм",
  partitionType: "Каркасные", panelFamily: "PPS", panelLayout: "1250 мм",
  roofShape: "Двускатная", roofType: "Холодная", roofCovering: "Металлочерепица",
  ridgeAxis: "Вдоль длины дома",
  ridgeHeight: "2.5", eaveOverhang: "0.5", gableOverhang: "0.3",
  flatRoofSlopeDirection: "К задней стороне", flatRoofSlopePercent: "3",
  flatRoofSlopeMode: "Перепад высоты стен",
  gableType: "По типу кровли", gableCount: "2",
  electricStage: "Полная", heating: "Электрическое", waterSource: "Скважина", sewer: "Септик",
  ventilation: "Естественная", gas: false, fireplace: false,
  exteriorFinish: "Без отделки", interiorFinish: "Без отделки", floorFinish: "Без отделки",
  ceilingFinish: "Без отделки", plinth: false, gutters: true,
  budget: "", desiredStart: "", decisionStatus: "Собираю информацию", contactMethod: "Телефон",
  contactTime: "", notes: "", consent: false,
};

const numberOrNull = (value) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function buildClientBrief(answers, attachments = []) {
  const floors = Number(answers.floors);
  const features = [answers.secondLight && "Второй свет", answers.staircaseOpening && "Лестничный проём"].filter(Boolean);
  const extras = [answers.terrace && "Терраса", answers.porch && "Крыльцо", answers.balcony && "Балкон"].filter(Boolean);
  return {
    format: "eft-client-brief", schemaVersion: 1, questionnaireVersion: 3, createdAt: new Date().toISOString(),
    customer: { name: answers.customerName.trim(), phone: answers.phone.trim(), email: answers.email.trim(), preferredContact: answers.contactMethod, preferredTime: answers.contactTime },
    project: {
      goal: answers.goal, buildingType: answers.buildingType, address: answers.address.trim() || answers.region.trim(), region: answers.region.trim(),
      floors: [1, 2].includes(floors) ? floors : null, length: numberOrNull(answers.length), width: numberOrNull(answers.width),
      wallHeight: numberOrNull(answers.wallHeight), approxArea: numberOrNull(answers.approxArea), shape: answers.houseShape,
      basement: answers.basement, attic: answers.attic, rooms: answers.roomsNotes.trim(),
      roomCounts: { bedrooms: numberOrNull(answers.bedrooms) || 0, bathrooms: numberOrNull(answers.bathrooms) || 0, kitchens: numberOrNull(answers.kitchens) || 0, utilityRooms: numberOrNull(answers.utilityRooms) || 0 },
      features,
    },
    site: { area: numberOrNull(answers.siteArea), cadastralNumber: answers.cadastralNumber.trim(), terrain: answers.terrain, soil: answers.soil, access: answers.access, utilities: { electricity: answers.electricityOnSite, water: answers.waterOnSite, sewer: answers.sewerOnSite } },
    scope: [...answers.scope],
    sip: { wallThickness: answers.wallThickness, floorThickness: answers.floorThickness, secondFloorThickness: answers.secondFloorThickness, ceilingThickness: answers.ceilingThickness, partitionType: answers.partitionType, panelFamily: answers.panelFamily, panelLayout: answers.panelLayout },
    roof: {
      shape: answers.roofShape,
      type: answers.roofType,
      covering: answers.roofCovering,
      ridgeAxis: answers.ridgeAxis,
      ridgeHeight: numberOrNull(answers.ridgeHeight),
      eaveOverhang: numberOrNull(answers.eaveOverhang),
      gableOverhang: numberOrNull(answers.gableOverhang),
      slopeDirection: answers.roofShape === "Плоская" ? answers.flatRoofSlopeDirection : null,
      slopePercent: answers.roofShape === "Плоская" ? numberOrNull(answers.flatRoofSlopePercent) : null,
      slopeMode: answers.roofShape === "Плоская" ? answers.flatRoofSlopeMode : null,
      gableType: answers.roofShape === "Двускатная" || (answers.roofShape === "Плоская" && answers.flatRoofSlopeMode === "Перепад высоты стен") ? answers.gableType : "Не учитывать",
      gableCount: answers.roofShape === "Двускатная" || (answers.roofShape === "Плоская" && answers.flatRoofSlopeMode === "Перепад высоты стен") ? Number(answers.gableCount) || 0 : 0,
    },
    openings: {
      windows: `${answers.windowsCount || 0} окон`,
      doors: `${answers.entranceDoorsCount || 0} входных, ${answers.interiorDoorsCount || 0} межкомнатных, ${answers.garageDoorsCount || 0} ворот`,
      counts: { windows: numberOrNull(answers.windowsCount) || 0, entranceDoors: numberOrNull(answers.entranceDoorsCount) || 0, interiorDoors: numberOrNull(answers.interiorDoorsCount) || 0, garageDoors: numberOrNull(answers.garageDoorsCount) || 0 },
      standardSizes: {
        window: { width: numberOrNull(answers.windowWidth), height: numberOrNull(answers.windowHeight) },
        entranceDoor: { width: numberOrNull(answers.entranceDoorWidth), height: numberOrNull(answers.entranceDoorHeight) },
        garageDoor: { width: numberOrNull(answers.garageDoorWidth), height: numberOrNull(answers.garageDoorHeight) },
      },
      notes: answers.openingsNotes.trim(),
    },
    extras: {
      items: extras,
      platformSize: answers.platformSize.trim() || [answers.platformLength, answers.platformWidth].filter(Boolean).join(" × "),
      platform: { length: numberOrNull(answers.platformLength), width: numberOrNull(answers.platformWidth), side: answers.platformSide, roof: answers.platformRoof },
    },
    engineering: { electricStage: answers.electricStage, heating: answers.heating, waterSource: answers.waterSource, sewer: answers.sewer, ventilation: answers.ventilation, gas: answers.gas, fireplace: answers.fireplace },
    finish: { exterior: answers.exteriorFinish, interior: answers.interiorFinish, floor: answers.floorFinish, ceiling: answers.ceilingFinish, plinth: answers.plinth, gutters: answers.gutters },
    delivery: { access: answers.access, distance: numberOrNull(answers.deliveryDistance) },
    budget: { amount: numberOrNull(answers.budget), desiredStart: answers.desiredStart, decisionStatus: answers.decisionStatus },
    notes: answers.notes.trim(), attachments: attachments.map((file) => file.name),
    automation: automationReadiness(answers, attachments),
  };
}

export function automationReadiness(answers, attachments = []) {
  const confirmed = [
    answers.buildingType && "Тип строения",
    Number(answers.length) > 0 && Number(answers.width) > 0 && "Габариты",
    [1, 2].includes(Number(answers.floors)) && "Этажность",
    Number(answers.wallHeight) > 0 && "Высота стен",
    answers.scope?.length && "Состав расчёта",
    answers.wallThickness && answers.floorThickness && answers.ceilingThickness && "SIP-конструкции",
    answers.roofShape && answers.roofType && answers.roofCovering && "Кровля",
  ].filter(Boolean);
  const manualReview = [
    answers.houseShape !== "Прямоугольная" && "Нужен точный контур строения",
    "Нужна геометрия помещений и внутренних стен",
    "Нужно расположение окон, дверей и ворот на плане",
    (answers.terrace || answers.porch || answers.balcony) && "Нужно положение площадок относительно строения",
    attachments.length ? "Приложенный план нужно проверить и перенести в редактор" : "Нужен план или эскиз с размерами",
  ].filter(Boolean);
  return {
    status: confirmed.length >= 7 ? "draft-ready" : "incomplete",
    confirmed,
    manualReview,
    canCreateDraft: confirmed.length >= 7,
    canCalculateAutomatically: manualReview.length === 0,
  };
}

export function completionPercent(answers) {
  const important = [answers.customerName, answers.phone || answers.email, answers.region || answers.address, answers.buildingType, answers.length, answers.width, answers.floors, answers.wallHeight, answers.scope.length, answers.wallThickness, answers.roofShape, answers.heating, answers.exteriorFinish, answers.decisionStatus];
  return Math.round((important.filter(Boolean).length / important.length) * 100);
}
