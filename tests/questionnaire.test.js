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
    region: "Ленинградская область",
    floors: "2",
    length: "12",
    width: "9",
    ceilingThickness: "174 мм",
    panelFamily: "Минвата",
    panelLayout: "625 мм",
    roofType: "Тёплая SIP",
    roofShape: "Двускатная",
    gableType: "Из SIP-панелей",
    gableCount: "1",
    scope: [...initialAnswers.scope, "Инженерия", "Внешняя отделка"],
    consent: true,
  };
  const brief = buildClientBrief(answers, [{ name: "plan.pdf" }]);

  assert.equal(brief.format, "eft-client-brief");
  assert.equal(brief.schemaVersion, 1);
  assert.equal(brief.questionnaireVersion, 2);
  assert.equal(brief.project.floors, 2);
  assert.equal(brief.project.length, 12);
  assert.equal(brief.sip.ceilingThickness, "174 мм");
  assert.equal(brief.sip.panelFamily, "Минвата");
  assert.equal(brief.engineering.heating, "Электрическое");
  assert.deepEqual(brief.attachments, ["plan.pdf"]);

  const project = createProjectFromClientBrief(createDefaultProject(), brief);
  assert.equal(project.settings.sip.ceilingThickness, "174");
  assert.equal(project.settings.sip.wallPanelFamily, "mineral-wool");
  assert.equal(project.settings.sip.floorPanelWidth, "0.625");
  assert.equal(project.settings.roof.type, "sip");
  assert.equal(project.settings.roof.shape, "gable");
  assert.equal(project.settings.roof.gableType, "sip");
  assert.equal(project.settings.roof.gableCount, 1);
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
});
