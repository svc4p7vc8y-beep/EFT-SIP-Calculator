import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultProject } from "../src/react/state/project-model.js";
import {
  clientBriefSummary,
  createProjectFromClientBrief,
  validateClientBrief,
} from "../src/react/storage/client-brief.js";

const sampleBrief = () => ({
  format: "eft-client-brief",
  schemaVersion: 1,
  createdAt: "2026-08-27T10:00:00.000Z",
  customer: {
    name: "Иван Иванов",
    phone: "+7 900 000-00-00",
    email: "ivan@example.ru",
  },
  project: {
    address: "Московская область",
    floors: 2,
    length: 12,
    width: 8,
    wallHeight: 2.8,
    approxArea: 160,
    rooms: "Кухня-гостиная, три спальни",
    features: ["Второй свет"],
  },
  scope: ["Сваи и обвязка", "SIP-пол", "SIP-стены", "Кровля", "Доставка"],
  sip: {
    wallThickness: "224 мм",
    floorThickness: "174 мм",
    partitionType: "Каркасные",
  },
  roof: { shape: "Вальмовая", covering: "Металлочерепица" },
  openings: { windows: "8 окон", doors: "2 двери" },
  extras: { items: ["Терраса"], platformSize: "6 × 2,5 м" },
  delivery: { access: "Свободный" },
  finish: "Электрика",
  notes: "Строительство весной",
  attachments: ["план.pdf"],
});

test("client brief validation and preview expose the confirmed source data", () => {
  const brief = sampleBrief();
  assert.equal(validateClientBrief(brief), brief);
  assert.deepEqual(clientBriefSummary(brief), {
    customer: "Иван Иванов",
    contact: "+7 900 000-00-00 · ivan@example.ru",
    address: "Московская область",
    dimensions: "12 × 8 м",
    floors: "2",
    area: "160 м²",
    scope: "Сваи и обвязка, SIP-пол, SIP-стены, Кровля, Доставка",
  });
});

test("client brief creates a clean draft and preserves commercial calculation data", () => {
  const current = createDefaultProject();
  current.priceMat[0].price = 123456;
  current.priceLab[0].price = 654321;
  current.settings.formulas.sipWastePercent = 17;
  current.settings.links.roofRidgeFromPlan = false;
  current.settings.priceAdjustments.sip.materials = 9;

  const next = createProjectFromClientBrief(current, sampleBrief());

  assert.equal(next.meta.customer, "Иван Иванов");
  assert.equal(next.meta.address, "Московская область");
  assert.equal(next.meta.floors, 2);
  assert.equal(next.plan.house.w, 12);
  assert.equal(next.plan.house.h, 8);
  assert.equal(next.plan.wallHeight, 2.8);
  assert.deepEqual(next.plan.rooms, []);
  assert.deepEqual(next.plan.openings, []);
  assert.equal(next.settings.sip.wallThickness, "224");
  assert.equal(next.settings.sip.floorThickness, "174");
  assert.equal(next.settings.sip.partitionType, "frame");
  assert.equal(next.settings.roof.shape, "hip");
  assert.equal(next.settings.roof.covering, "metal-tile");
  assert.equal(next.services.foundation, true);
  assert.equal(next.services.sipFloor, true);
  assert.equal(next.services.sipSecondFloor, true);
  assert.equal(next.services.partitions, false);
  assert.equal(next.services.openings, false);
  assert.equal(next.services.delivery, true);
  assert.equal(next.priceMat[0].price, 123456);
  assert.equal(next.priceLab[0].price, 654321);
  assert.equal(next.settings.formulas.sipWastePercent, 17);
  assert.equal(next.settings.links.roofRidgeFromPlan, false);
  assert.equal(next.settings.priceAdjustments.sip.materials, 9);
  assert.equal(next.clientBrief.project.rooms, "Кухня-гостиная, три спальни");
  assert.equal(next.clientBrief.openings.windows, "8 окон");
  assert.equal(current.meta.customer, "");
});

test("client brief rejects unrelated and incomplete JSON files", () => {
  assert.throws(() => validateClientBrief({ format: "eft-project", schemaVersion: 4 }), /не файл заявки/);
  assert.throws(
    () => validateClientBrief({ format: "eft-client-brief", schemaVersion: 1, customer: {} }),
    /не указано имя/,
  );
});
