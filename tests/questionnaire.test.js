import assert from "node:assert/strict";
import test from "node:test";

import { buildClientBrief, completionPercent, initialAnswers } from "../src/questionnaire/brief.js";
import { createDefaultProject } from "../src/react/state/project-model.js";
import { createProjectFromClientBrief } from "../src/react/storage/client-brief.js";

test("questionnaire builds a calculator-compatible brief with complete construction data", () => {
  const answers = {
    ...initialAnswers,
    customerName: "Анна Петрова",
    phone: "+7 900 123-45-67",
    contactMethod: "WhatsApp",
    region: "Ленинградская область",
    buildingType: "Гараж",
    floors: "2",
    length: "12",
    width: "9",
    ceilingThickness: "174 мм",
    secondFloorThickness: "124 мм",
    secondFloorWallThickness: "174 мм",
    secondFloorWallHeight: "2.7",
    secondFloorPartitionType: "SIP-панели",
    panelFamily: "Минвата",
    panelLayout: "625 мм",
    roofType: "Тёплая SIP",
    roofShape: "Двускатная",
    ridgeAxis: "Вдоль ширины дома",
    gableType: "Из SIP-панелей",
    gableCount: "1",
    deliveryDistance: "75",
    garageDoorsCount: "1",
    garageDoorWidth: "3.2",
    garageDoorHeight: "2.6",
    terrace: true,
    terraceLength: "6",
    terraceWidth: "2.5",
    terraceArea: "",
    terraceSide: "Фасад",
    terraceRoof: "Холодная",
    porch: true,
    porchLength: "2",
    porchWidth: "1.5",
    porchArea: "3",
    waterStage: "Черновая разводка",
    sewerStage: "Только выпуск из дома",
    scope: [...initialAnswers.scope, "Инженерия", "Внешняя отделка"],
    consent: true,
  };
  const brief = buildClientBrief(answers, [{ name: "plan.pdf" }]);

  assert.equal(brief.format, "eft-client-brief");
  assert.equal(brief.schemaVersion, 1);
  assert.equal(brief.questionnaireVersion, 4);
  assert.equal(brief.customer.preferredContact, "WhatsApp");
  assert.equal(brief.project.buildingType, "Гараж");
  assert.equal(brief.project.floors, 2);
  assert.equal(brief.project.length, 12);
  assert.equal(brief.sip.ceilingThickness, "174 мм");
  assert.equal(brief.sip.secondFloorThickness, "124 мм");
  assert.deepEqual(brief.sip.secondFloor, { wallThickness: "174 мм", wallHeight: 2.7, partitionType: "SIP-панели" });
  assert.equal(brief.sip.panelFamily, "Минвата");
  assert.equal(brief.engineering.heating, "Электрическое");
  assert.equal(brief.roof.ridgeAxis, "Вдоль ширины дома");
  assert.equal(brief.delivery.distance, 75);
  assert.deepEqual(brief.openings.standardSizes.garageDoor, { width: 3.2, height: 2.6 });
  assert.deepEqual(brief.extras.terrace, { enabled: true, length: 6, width: 2.5, area: 15, side: "Фасад", roof: "Холодная" });
  assert.deepEqual(brief.extras.porch, { enabled: true, length: 2, width: 1.5, area: 3, side: "Фасад", roof: "Без кровли" });
  assert.equal(brief.engineering.requested, true);
  assert.equal(brief.engineering.waterStage, "Черновая разводка");
  assert.equal(brief.engineering.sewerStage, "Только выпуск из дома");
  assert.equal(brief.automation.canCreateDraft, true);
  assert.equal(brief.automation.canCalculateAutomatically, false);
  assert.deepEqual(brief.attachments, ["plan.pdf"]);

  const project = createProjectFromClientBrief(createDefaultProject(), brief);
  assert.equal(project.settings.sip.ceilingThickness, "174");
  assert.equal(project.settings.sip.secondFloorThickness, "124");
  assert.equal(project.settings.sip.wallPanelFamily, "mineral-wool");
  assert.equal(project.settings.sip.floorPanelWidth, "0.625");
  assert.equal(project.settings.roof.type, "sip");
  assert.equal(project.settings.roof.shape, "gable");
  assert.equal(project.settings.roof.gableType, "sip");
  assert.equal(project.settings.roof.gableCount, 1);
  assert.equal(project.settings.roof.ridgeAxis, "y");
  assert.equal(project.settings.delivery.distance, 75);
  assert.equal(project.meta.buildingType, "Гараж");
  assert.equal(project.services.engineeringElectric, true);
  assert.equal(project.services.externalFinish, true);
});

test("flat roof brief keeps its one-side slope direction and value", () => {
  const brief = buildClientBrief({
    ...initialAnswers,
    customerName: "Иван",
    roofShape: "Плоская",
    flatRoofSlopeDirection: "Вправо",
    flatRoofSlopePercent: "4.5",
  });
  const project = createProjectFromClientBrief(createDefaultProject(), brief);

  assert.equal(brief.roof.gableCount, 2);
  assert.equal(brief.roof.slopeDirection, "Вправо");
  assert.equal(brief.roof.slopePercent, 4.5);
  assert.equal(project.settings.roof.shape, "flat");
  assert.equal(brief.roof.slopeMode, "Перепад высоты стен");
  assert.equal(project.settings.roof.flatSlopeMode, "structural");
  assert.equal(project.settings.roof.flatSlopeDirection, "right");
  assert.equal(project.settings.roof.flatSlopePercent, 4.5);
  assert.equal(project.settings.roof.gableCount, 2);
});

test("questionnaire completion reflects the important calculator inputs", () => {
  assert.ok(completionPercent(initialAnswers) < 100);
  assert.equal(completionPercent({ ...initialAnswers, customerName: "Иван", phone: "+7", region: "Москва" }), 100);
  assert.equal(completionPercent({ ...initialAnswers, customerName: "Иван", contactMethod: "Почта", email: "ivan@example.ru", region: "Москва" }), 100);
  assert.ok(completionPercent({ ...initialAnswers, customerName: "Иван", contactMethod: "Почта", phone: "+7", region: "Москва" }) < 100);
});
