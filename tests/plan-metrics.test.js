import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGridContourCutLength, calculatePlanMetrics, calculateSipCutting, calculateSipRoofCutting, calculateWallCutLength, chooseDimensionSides, roofGeometry } from '../src/calculations/plan-metrics.js';

test('attached room extension adds floor and outside perimeter without becoming a partition', () => {
  const metrics = calculatePlanMetrics({
    house: { w: 8, h: 6 }, wallHeight: 2.5, wallThickness: 0.174,
    rooms: [{ id: 'extension', name: 'Пристройка', extension: true, include: true, points: [
      { x: 8, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 5 }, { x: 8, y: 5 },
    ] }], walls: [], openings: [], wallGaps: [], platforms: [],
  });
  assert.equal(metrics.floorArea, 54);
  assert.equal(metrics.perimeter, 32);
  assert.equal(metrics.partitionLength, 0);
});

test('shared and partially overlapping room walls count once', () => {
  const plan = {
    house: { w: 10, h: 8 }, wallThickness: 0.2, wallHeight: 2.5,
    rooms: [
      { x: 0.2, y: 0.2, w: 4.8, h: 7.6 },
      { x: 5, y: 0.2, w: 4.8, h: 3.8 },
      { x: 5, y: 4, w: 4.8, h: 3.8 }
    ],
    walls: [], openings: []
  };
  const metrics = calculatePlanMetrics(plan);
  assert.equal(metrics.partitionLength, 12.4);
});

test('room faces and drawn lines along the outside wall are not partitions', () => {
  const plan = {
    house: { w: 10, h: 8 }, wallThickness: 0.174, wallHeight: 2.5,
    rooms: [
      { x: 0, y: 0, w: 5, h: 8 },
      { x: 5, y: 0, w: 5, h: 8 }
    ],
    walls: [
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x1: 5, y1: 0, x2: 5, y2: 8 }
    ],
    openings: []
  };
  const metrics = calculatePlanMetrics(plan);
  assert.equal(metrics.partitionLength, 8);
  assert.equal(metrics.partitionGrossArea, 20);
});

test('outer openings reduce exterior walls and interior doors reduce partitions', () => {
  const plan = {
    house: { w: 6, h: 4 }, wallThickness: 0.2, wallHeight: 2.5,
    rooms: [
      { x: 0.2, y: 0.2, w: 2.8, h: 3.6 },
      { x: 3, y: 0.2, w: 2.8, h: 3.6 }
    ],
    walls: [],
    openings: [
      { type: 'window', width: 1.2, height: 1.2, outer: true },
      { type: 'door', width: 0.8, height: 2, outer: false }
    ]
  };
  const metrics = calculatePlanMetrics(plan);
  assert.equal(metrics.partitionLength, 3.6);
  assert.equal(metrics.partitionNetArea, 7.4);
  assert.equal(metrics.exteriorWallNetArea, 48.56);
});

test('explicit wall gaps are subtracted from wall and partition quantities', () => {
  const plan = {
    house: { w: 10, h: 8 }, wallHeight: 2.5, wallThickness: 0.174,
    rooms: [
      { id: 'a', points: [{ x: .174, y: .174 }, { x: 5, y: .174 }, { x: 5, y: 7.826 }, { x: .174, y: 7.826 }] },
      { id: 'b', points: [{ x: 5, y: .174 }, { x: 9.826, y: .174 }, { x: 9.826, y: 7.826 }, { x: 5, y: 7.826 }] }
    ], walls: [], openings: [], platforms: [],
    wallGaps: [
      { width: 1, x: 5, y: 4, orientation: 'v', outer: false },
      { width: 1.2, x: 10, y: 4, orientation: 'v', outer: true }
    ]
  };
  const metrics = calculatePlanMetrics(plan);
  assert.equal(metrics.partitionLength, 6.65);
  assert.equal(metrics.exteriorWallNetArea, 87);
  assert.equal(metrics.wallGapLength, 2.2);
});

test('SIP cutting covers only floor, outer walls and horizontal ceiling', () => {
  const rows = calculateSipCutting({ floor: 50, walls: 80, ceiling: 50, partitions: 30, roof: 70 });
  assert.deepEqual(rows.map((row) => row.key), ['floor', 'walls', 'ceiling']);
  assert.ok(rows.every((row) => row.panels > 0));
  assert.ok(rows.every((row) => row.cutMeters >= 0));
  assert.ok(rows.some((row) => row.cutMeters > 0));
  assert.equal(calculateSipRoofCutting(70).key, 'roof');
});

test('625 mm floor and ceiling layouts keep full-panel purchases but add longitudinal cutting', () => {
  const surfaces = { floor: 50, walls: 80, ceiling: 50 };
  const standard = calculateSipCutting(surfaces, {
    panelWidth: 1.25, panelLength: 2.5,
    layoutWidths: { floor: 1.25, ceiling: 1.25 }
  });
  const reinforced = calculateSipCutting(surfaces, {
    panelWidth: 1.25, panelLength: 2.5,
    layoutWidths: { floor: .625, ceiling: .625 }
  });

  for (const key of ['floor', 'ceiling']) {
    const base = standard.find((row) => row.key === key);
    const half = reinforced.find((row) => row.key === key);
    assert.equal(half.panels, base.panels);
    assert.equal(half.purchasedArea, base.purchasedArea);
    assert.equal(half.layoutWidth, .625);
    assert.equal(half.stripsPerPanel, 2);
    assert.equal(half.splitCutMeters, half.productionPanels * 2.5);
    assert.equal(half.cutMeters, Math.round((half.trimCutMeters + half.splitCutMeters) * 10) / 10);
  }
  assert.equal(reinforced.find((row) => row.key === 'walls').splitCutMeters, 0);
});

test('SIP cutting uses real contour and opening cuts instead of an area coefficient', () => {
  const rectangle = [
    { x: 0, y: 0 }, { x: 8.66, y: 0 },
    { x: 8.66, y: 12.975 }, { x: 0, y: 12.975 },
  ];
  assert.equal(calculateGridContourCutLength(rectangle, 1.25, 2.5), 21.635);
  assert.equal(calculateGridContourCutLength([
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7.5 }, { x: 0, y: 7.5 },
  ], 1.25, 2.5), 0);
  assert.equal(calculateWallCutLength([8, 6, 8, 6], 2.5, 1.25, 2.5, 6), 16);
});

test('reserve panels are purchased but are not charged as already cut', () => {
  const [row] = calculateSipCutting({ floor: 50 }, {
    extraWastePercent: 10,
    layoutWidths: { floor: .625 },
    cutLengths: { floor: 4 },
  });
  assert.ok(row.panels > row.productionPanels);
  assert.equal(row.splitCutMeters, row.productionPanels * 2.5);
  assert.equal(row.cutMeters, row.splitCutMeters + 4);
});

test('empty plan keeps the full house floor and ceiling areas', () => {
  const metrics = calculatePlanMetrics({
    house: { w: 10, h: 8 }, wallThickness: 0.174, wallHeight: 2.5,
    rooms: [], walls: [], openings: [], wallGaps: [], platforms: []
  });
  assert.equal(metrics.roomArea, 0);
  assert.equal(metrics.floorArea, 80);
  assert.equal(metrics.ceilingArea, 80);
  assert.equal(metrics.openCeilingArea, 0);
});

test('second-light room removes only its area from the horizontal ceiling', () => {
  const metrics = calculatePlanMetrics({
    house: { w: 10, h: 8 }, wallThickness: 0.174, wallHeight: 2.5,
    rooms: [{ x: 1, y: 1, w: 5, h: 4, include: true, ceilingMode: 'open-rafter' }],
    walls: [], openings: [], wallGaps: [], platforms: []
  });
  assert.equal(metrics.floorArea, 80);
  assert.equal(metrics.openCeilingArea, 20);
  assert.equal(metrics.ceilingArea, 60);
});

test('second light can occupy only part of a room', () => {
  const metrics = calculatePlanMetrics({
    house: { w: 10, h: 8 }, wallThickness: 0.174, wallHeight: 2.5,
    rooms: [{ x: 1, y: 1, w: 5, h: 4, include: true, ceilingMode: 'open-rafter', openCeilingArea: 12 }],
    walls: [], openings: [], wallGaps: [], platforms: []
  });
  assert.equal(metrics.openCeilingArea, 12);
  assert.equal(metrics.ceilingArea, 68);
});

test('ridge height determines slope and gable areas', () => {
  const geometry = roofGeometry({ span: 8, ridgeLength: 10, ridgeHeight: 3 });
  assert.equal(geometry.slopeLength, 5);
  assert.equal(geometry.slopeArea, 50);
  assert.equal(geometry.totalSlopeArea, 100);
  assert.equal(geometry.gableArea, 24);
  assert.equal(geometry.slopeCoefficient, 1.25);
});

test('flat main roof uses one horizontal plane without ridge or gables', () => {
  const geometry = roofGeometry({ span: 8, ridgeLength: 10, ridgeHeight: 3, shape: 'flat' });
  assert.equal(geometry.shape, 'flat');
  assert.equal(geometry.totalSlopeArea, 80);
  assert.equal(geometry.gableArea, 0);
  assert.equal(geometry.slopeCoefficient, 1);
});

test('main roof geometry includes independent eave and gable overhangs', () => {
  const geometry = roofGeometry({ span: 8, ridgeLength: 10, ridgeHeight: 3, eaveOverhang: 0.5, gableOverhang: 0.3 });
  assert.equal(geometry.roofSpan, 9);
  assert.equal(geometry.roofLength, 10.6);
  assert.equal(geometry.slopeLength, 5.408);
  assert.equal(geometry.totalSlopeArea, 114.66);
  assert.equal(geometry.gableArea, 24);
  assert.equal(geometry.slopeCoefficient, 1.25);
});

test('house dimensions move to the free perimeter side', () => {
  const leftTerrace = chooseDimensionSides({
    house: { w: 10, h: 8 },
    platforms: [{ x: -3, y: 0, w: 3, h: 8, steps: 3, tread: 0.3, stairSide: 'left' }]
  });
  assert.equal(leftTerrace.vertical, 'right');
  assert.equal(leftTerrace.horizontal, 'top');

  const topTerrace = chooseDimensionSides({
    house: { w: 10, h: 8 },
    platforms: [{ x: 0, y: -2, w: 10, h: 2, steps: 2, tread: 0.3, stairSide: 'top' }]
  });
  assert.equal(topTerrace.horizontal, 'bottom');
});

test('irregular outer contour drives house area and perimeter', () => {
  const metrics = calculatePlanMetrics({
    house: { w: 10, h: 10, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 6, y: 8 }, { x: 6, y: 10 }, { x: 4, y: 10 }, { x: 4, y: 8 }, { x: 0, y: 8 }] },
    wallThickness: .174, partitionThickness: .1, wallHeight: 2.5,
    rooms: [], walls: [], openings: [], wallGaps: []
  });
  assert.equal(metrics.floorArea, 84);
  assert.equal(metrics.perimeter, 40);
});

test('opening supply and SIP cutting can be controlled independently', () => {
  const metrics = calculatePlanMetrics({
    house: { w: 10, h: 8 }, wallThickness: .174, partitionThickness: .1, wallHeight: 2.5,
    rooms: [], walls: [], wallGaps: [], openings: [
      { type: 'window', width: 2, height: 1, x: 5, y: 0, orientation: 'h', outer: true, includeInEstimate: false, subtractFromSip: true },
      { type: 'door', width: 1, height: 2, x: 0, y: 4, orientation: 'v', outer: true, includeInEstimate: true, subtractFromSip: false }
    ]
  });
  assert.equal(metrics.windowArea, 0);
  assert.equal(metrics.doorArea, 2);
  assert.equal(metrics.exteriorOpeningsArea, 2);
});

test('hip roof has no gables and includes ridge plus four hip rafters', () => {
  const geometry = roofGeometry({ span: 8, ridgeLength: 10, ridgeHeight: 3, shape: 'hip', eaveOverhang: .5 });
  assert.equal(geometry.shape, 'hip');
  assert.equal(geometry.gableArea, 0);
  assert.ok(geometry.ridgeLength > 0);
  assert.ok(geometry.hipLength > 0);
  assert.ok(geometry.totalSlopeArea > 80);
});
