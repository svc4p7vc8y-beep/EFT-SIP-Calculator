import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NODE_HOUSE_LAYERS as LAYERS, groupNodesAtAnchors, layerForNode, nextNodeAtAnchor } from './node-house-layers.js';

const addBeam = (group, a, b, thickness, material) => {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const delta = to.clone().sub(from);
  if (delta.lengthSq() < 0.0001) return;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(thickness, delta.length(), thickness), material.clone());
  beam.position.copy(from.add(to).multiplyScalar(0.5));
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  group.add(beam);
};

const crossSections = (points, fixed, axis) => {
  const intersections = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const a = axis === 'x' ? point.x : point.y;
    const b = axis === 'x' ? next.x : next.y;
    if ((a <= fixed && b > fixed) || (b <= fixed && a > fixed)) {
      const ratio = (fixed - a) / (b - a);
      intersections.push((axis === 'x' ? point.y : point.x) + ratio * ((axis === 'x' ? next.y : next.x) - (axis === 'x' ? point.y : point.x)));
    }
  });
  intersections.sort((a, b) => a - b);
  return intersections;
};

const contour = (plan) => Array.isArray(plan?.house?.points) && plan.house.points.length >= 3
  ? plan.house.points
  : [{ x: 0, y: 0 }, { x: Number(plan?.house?.w) || 1, y: 0 }, { x: Number(plan?.house?.w) || 1, y: Number(plan?.house?.h) || 1 }, { x: 0, y: Number(plan?.house?.h) || 1 }];

export default function NodeHouse3D({ project, floorPlans, nodes, selectedId, onSelect }) {
  const host = useRef(null);
  const sceneRef = useRef(null);
  const viewRef = useRef(null);
  const selectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('layers');
  const [layer, setLayer] = useState('walls');
  const [showLath, setShowLath] = useState(false);
  selectRef.current = onSelect;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setError('3D недоступно в этом браузере. Используйте 2D-план ниже.'); return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4f8f4');
    const plans = floorPlans?.length ? floorPlans : [{ plan: project.plan }];
    const points = contour(project.plan).map(point => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }));
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const span = Math.max(4, maxX - minX, maxY - minY);
    const heights = plans.map(item => Math.max(1.8, Number(item.plan?.wallHeight) || 2.5));
    const top = heights.reduce((sum, value) => sum + value, 0);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, Math.max(300, span * 30));
    camera.position.set(span * 1.15, top + span * 1.1, span * 1.25);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = span * 5;
    controls.maxPolarAngle = Math.PI * 0.95;
    controls.target.set(0, top * 0.45, 0);
    if (viewRef.current) {
      camera.position.copy(viewRef.current.position);
      controls.target.copy(viewRef.current.target);
    }
    controls.update();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c8b8, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(span, top + span, span * 0.5);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 2.2, span * 2.2), new THREE.MeshStandardMaterial({ color: 0xe5eee6, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    scene.add(ground);
    const grid = new THREE.GridHelper(span * 2, Math.max(8, Math.round(span * 2)), 0xb7cbb9, 0xd8e4d9);
    grid.position.y = -0.045;
    scene.add(grid);
    const groups = Object.fromEntries(LAYERS.map(([key]) => [key, new THREE.Group()]));
    const details = Object.fromEntries(LAYERS.map(([key]) => [key, new THREE.Group()]));
    LAYERS.forEach(([key]) => { groups[key].add(details[key]); scene.add(groups[key]); });
    const roofLath = new THREE.Group();
    details.roof.add(roofLath);
    const timber = new THREE.MeshStandardMaterial({ color: 0xa77b50, roughness: 0.82 });
    const timberLight = new THREE.MeshStandardMaterial({ color: 0xb89067, roughness: 0.82 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x738b8b, metalness: 0.55, roughness: 0.5 });
    const outline = new THREE.Shape();
    points.forEach((p, index) => index ? outline.lineTo(p.x - cx, p.y - cy) : outline.moveTo(p.x - cx, p.y - cy));
    outline.closePath();
    const panelLength = Math.max(0.5, Number(project.settings?.formulas?.panelLength) || 2.5);
    const addPanelSurface = (target, seamTarget, elevation, width, color) => {
      const panel = new THREE.Mesh(new THREE.ShapeGeometry(outline), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.84, roughness: 0.88 }));
      panel.rotation.x = -Math.PI / 2;
      panel.position.y = elevation;
      target.add(panel);
      const seam = new THREE.MeshStandardMaterial({ color: 0x9c7048, roughness: 0.82 });
      const actualWidth = Math.max(0.3, Number(width) || 1.25);
      for (let x = minX + actualWidth, stripe = 1; x < maxX - 0.01 && stripe < 100; x += actualWidth, stripe++) {
        const cuts = crossSections(points, x, 'x');
        for (let i = 0; i + 1 < cuts.length; i += 2) addBeam(seamTarget, [x - cx, elevation + 0.035, cuts[i] - cy], [x - cx, elevation + 0.035, cuts[i + 1] - cy], 0.055, seam);
      }
      for (let stripe = 0; minX + stripe * actualWidth < maxX && stripe < 100; stripe++) {
        const start = minX + stripe * actualWidth;
        const end = Math.min(maxX, start + actualWidth);
        for (let y = minY + panelLength * (1 + (stripe % 2) * 0.5), row = 0; y < maxY - 0.01 && row < 100; y += panelLength, row++) {
          const cuts = crossSections(points, y, 'y');
          for (let i = 0; i + 1 < cuts.length; i += 2) {
            const a = Math.max(start, cuts[i]), b = Math.min(end, cuts[i + 1]);
            if (b - a > 0.02) addBeam(seamTarget, [a - cx, elevation + 0.035, y - cy], [b - cx, elevation + 0.035, y - cy], 0.045, seam);
          }
        }
      }
      points.forEach((start, index) => {
        const end = points[(index + 1) % points.length];
        addBeam(seamTarget, [start.x - cx, elevation + 0.035, start.y - cy], [end.x - cx, elevation + 0.035, end.y - cy], 0.065, timber);
      });
    };
    let level = 0;
    plans.forEach((item, floorIndex) => {
      const floorHeight = heights[floorIndex];
      const floorWidth = floorIndex ? project.settings?.sip?.secondFloorPanelWidth : project.settings?.sip?.floorPanelWidth;
      if (floorIndex || project.services?.sipFloor !== false) addPanelSurface(groups.floor, details.floor, level + 0.06, floorWidth, floorIndex ? 0xc7d9c7 : 0xb9d2bc);
      points.forEach((start, index) => {
        const end = points[(index + 1) % points.length];
        const dx = end.x - start.x, dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (!length) return;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(length, floorHeight, 0.07), new THREE.MeshStandardMaterial({ color: 0x78a893, transparent: true, opacity: 0.27, side: THREE.DoubleSide, depthWrite: false }));
        wall.position.set((start.x + end.x) / 2 - cx, level + floorHeight / 2, (start.y + end.y) / 2 - cy);
        wall.rotation.y = -Math.atan2(dy, dx);
        groups.walls.add(wall);
        const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(start.x - cx, level, start.y - cy), new THREE.Vector3(start.x - cx, level + floorHeight, start.y - cy), new THREE.Vector3(end.x - cx, level + floorHeight, end.y - cy)]), new THREE.LineBasicMaterial({ color: 0x467861 }));
        groups.walls.add(edge);
        const start3 = [start.x - cx, level, start.y - cy];
        const end3 = [end.x - cx, level, end.y - cy];
        addBeam(groups.walls, start3, end3, 0.11, timber);
        addBeam(groups.walls, [start3[0], level + floorHeight, start3[2]], [end3[0], level + floorHeight, end3[2]], 0.11, timber);
        for (let distance = 0, count = 0; distance <= length && count < 160; distance += 0.625, count++) {
          const fraction = Math.min(1, distance / length);
          const x = start3[0] + (end3[0] - start3[0]) * fraction;
          const z = start3[2] + (end3[2] - start3[2]) * fraction;
          addBeam(details.walls, [x, level, z], [x, level + floorHeight, z], 0.065, timberLight);
        }
      });
      if (floorIndex === plans.length - 1 && project.services?.sipCeiling !== false) addPanelSurface(groups.ceiling, details.ceiling, level + floorHeight, project.settings?.sip?.ceilingPanelWidth, 0xdce5d2);
      level += floorHeight;
    });
    points.forEach((start, index) => {
      const end = points[(index + 1) % points.length];
      addBeam(groups.foundation, [start.x - cx, -0.16, start.y - cy], [end.x - cx, -0.16, end.y - cy], 0.15, timber);
    });
    const pilePositions = [...(project.plan?.piles || []).map(pile => [Number(pile.x), Number(pile.y)])];
    (project.plan?.pileRows || []).forEach(row => {
      const count = Math.max(1, Math.min(80, Math.round(Number(row.count) || 0)));
      for (let index = 0; index < count; index++) {
        const fraction = count === 1 ? 0.5 : index / (count - 1);
        pilePositions.push([Number(row.x1) + (Number(row.x2) - Number(row.x1)) * fraction, Number(row.y1) + (Number(row.y2) - Number(row.y1)) * fraction]);
      }
    });
    const uniquePiles = new Set();
    pilePositions.forEach(([x, y]) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const key = `${x.toFixed(2)}:${y.toFixed(2)}`;
      if (uniquePiles.has(key)) return;
      uniquePiles.add(key);
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.65, 10), steel);
      pile.position.set(x - cx, -0.45, y - cy);
      details.foundation.add(pile);
    });
    plans.forEach((item, floorIndex) => {
      const floorBase = heights.slice(0, floorIndex).reduce((sum, value) => sum + value, 0);
      const floorHeight = heights[floorIndex];
      (item.plan?.openings || []).filter(opening => opening.outer !== false).forEach(opening => {
        const x = Number(opening.x), z = Number(opening.y);
        const width = Number(opening.width), height = Number(opening.height);
        if (![x, z, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
        const vertical = opening.orientation === 'v';
        const bottom = opening.type === 'window' ? Math.max(0.55, (floorHeight - height) * 0.5) : 0;
        const topFrame = Math.min(floorHeight, bottom + height);
        const offset = width / 2;
        const left = vertical ? [x - cx, z - cy - offset] : [x - cx - offset, z - cy];
        const right = vertical ? [x - cx, z - cy + offset] : [x - cx + offset, z - cy];
        [left, right].forEach(([fx, fz]) => addBeam(details.walls, [fx, floorBase + bottom, fz], [fx, floorBase + topFrame, fz], 0.09, timber));
        addBeam(details.walls, [left[0], floorBase + topFrame, left[1]], [right[0], floorBase + topFrame, right[1]], 0.09, timber);
        if (opening.type === 'window') addBeam(details.walls, [left[0], floorBase + bottom, left[1]], [right[0], floorBase + bottom, right[1]], 0.09, timber);
      });
    });
    const roofHeight = Math.max(0.3, Number(project.settings?.roof?.ridgeHeight) || 1.8);
    const roofShape = project.settings?.roof?.shape || 'gable';
    const rafterStep = Math.max(0.2, Number(project.settings?.roof?.rafterStep) || 0.6);
    const lathStep = Math.max(0.2, Number(project.settings?.roof?.lathStep) || 0.35);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8cae99, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const x0 = minX - cx, x1 = maxX - cx, z0 = minY - cy, z1 = maxY - cy;
    const addTriangle = (a, b, c) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
      geometry.computeVertexNormals();
      groups.roof.add(new THREE.Mesh(geometry, roofMat));
    };
    if (roofShape === 'flat') {
      const roof = new THREE.Mesh(new THREE.ShapeGeometry(outline), roofMat);
      roof.rotation.x = -Math.PI / 2;
      roof.position.y = top + 0.1;
      groups.roof.add(roof);
      for (let x = minX + rafterStep, count = 0; x < maxX && count < 120; x += rafterStep, count++) {
        const cuts = crossSections(points, x, 'x');
        for (let i = 0; i + 1 < cuts.length; i += 2) addBeam(details.roof, [x - cx, top + 0.15, cuts[i] - cy], [x - cx, top + 0.15, cuts[i + 1] - cy], 0.065, timberLight);
      }
    } else if (roofShape === 'gable' && points.length === 4) {
      if (project.settings?.roof?.ridgeAxis !== 'y') {
        const mid = (z0 + z1) / 2;
        addTriangle([x0, top, z0], [x1, top, z0], [x1, top + roofHeight, mid]);
        addTriangle([x0, top, z0], [x1, top + roofHeight, mid], [x0, top + roofHeight, mid]);
        addTriangle([x0, top + roofHeight, mid], [x1, top + roofHeight, mid], [x1, top, z1]);
        addTriangle([x0, top + roofHeight, mid], [x1, top, z1], [x0, top, z1]);
        addBeam(groups.roof, [x0, top + roofHeight, mid], [x1, top + roofHeight, mid], 0.11, timber);
        for (let x = x0, count = 0; x <= x1 && count < 160; x += rafterStep, count++) {
          addBeam(details.roof, [x, top, z0], [x, top + roofHeight, mid], 0.065, timberLight);
          addBeam(details.roof, [x, top + roofHeight, mid], [x, top, z1], 0.065, timberLight);
        }
        const half = (z1 - z0) / 2;
        for (let distance = lathStep, count = 0; distance < half && count < 100; distance += lathStep, count++) {
          const rise = roofHeight * distance / half;
          addBeam(roofLath, [x0, top + rise + 0.04, z0 + distance], [x1, top + rise + 0.04, z0 + distance], 0.045, timber);
          addBeam(roofLath, [x0, top + rise + 0.04, z1 - distance], [x1, top + rise + 0.04, z1 - distance], 0.045, timber);
        }
      } else {
        const mid = (x0 + x1) / 2;
        addTriangle([x0, top, z0], [x0, top, z1], [mid, top + roofHeight, z1]);
        addTriangle([x0, top, z0], [mid, top + roofHeight, z1], [mid, top + roofHeight, z0]);
        addTriangle([mid, top + roofHeight, z0], [mid, top + roofHeight, z1], [x1, top, z1]);
        addTriangle([mid, top + roofHeight, z0], [x1, top, z1], [x1, top, z0]);
        addBeam(groups.roof, [mid, top + roofHeight, z0], [mid, top + roofHeight, z1], 0.11, timber);
        for (let z = z0, count = 0; z <= z1 && count < 160; z += rafterStep, count++) {
          addBeam(details.roof, [x0, top, z], [mid, top + roofHeight, z], 0.065, timberLight);
          addBeam(details.roof, [mid, top + roofHeight, z], [x1, top, z], 0.065, timberLight);
        }
        const half = (x1 - x0) / 2;
        for (let distance = lathStep, count = 0; distance < half && count < 100; distance += lathStep, count++) {
          const rise = roofHeight * distance / half;
          addBeam(roofLath, [x0 + distance, top + rise + 0.04, z0], [x0 + distance, top + rise + 0.04, z1], 0.045, timber);
          addBeam(roofLath, [x1 - distance, top + rise + 0.04, z0], [x1 - distance, top + rise + 0.04, z1], 0.045, timber);
        }
      }
    } else if (roofShape === 'hip' && points.length === 4) {
      const alongX = project.settings?.roof?.ridgeAxis !== 'y';
      const midX = (x0 + x1) / 2, midZ = (z0 + z1) / 2;
      const inset = Math.min((x1 - x0) / 2, (z1 - z0) / 2);
      const a = alongX ? [x0 + inset, top + roofHeight, midZ] : [midX, top + roofHeight, z0 + inset];
      const b = alongX ? [x1 - inset, top + roofHeight, midZ] : [midX, top + roofHeight, z1 - inset];
      const corners = [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]];
      if (alongX) {
        addTriangle(corners[0], corners[1], b); addTriangle(corners[0], b, a);
        addTriangle(corners[1], corners[2], b);
        addTriangle(corners[2], corners[3], a); addTriangle(corners[2], a, b);
        addTriangle(corners[3], corners[0], a);
      } else {
        addTriangle(corners[0], corners[1], a);
        addTriangle(corners[1], corners[2], b); addTriangle(corners[1], b, a);
        addTriangle(corners[2], corners[3], b);
        addTriangle(corners[3], corners[0], a); addTriangle(corners[3], a, b);
      }
      addBeam(groups.roof, a, b, 0.11, timber);
      [corners[0], corners[3]].forEach(corner => addBeam(details.roof, corner, a, 0.07, timberLight));
      [corners[1], corners[2]].forEach(corner => addBeam(details.roof, corner, b, 0.07, timberLight));
      for (let t = rafterStep, count = 0; t < (alongX ? x1 - x0 : z1 - z0) - rafterStep && count < 120; t += rafterStep, count++) {
        if (alongX) {
          const x = x0 + t, ridgeX = Math.min(b[0], Math.max(a[0], x));
          addBeam(details.roof, [x, top, z0], [ridgeX, top + roofHeight, midZ], 0.06, timberLight);
          addBeam(details.roof, [x, top, z1], [ridgeX, top + roofHeight, midZ], 0.06, timberLight);
        } else {
          const z = z0 + t, ridgeZ = Math.min(b[2], Math.max(a[2], z));
          addBeam(details.roof, [x0, top, z], [midX, top + roofHeight, ridgeZ], 0.06, timberLight);
          addBeam(details.roof, [x1, top, z], [midX, top + roofHeight, ridgeZ], 0.06, timberLight);
        }
      }
    } else {
      const roof = new THREE.Mesh(new THREE.ShapeGeometry(outline), roofMat);
      roof.rotation.x = -Math.PI / 2;
      roof.position.y = top + 0.15;
      groups.roof.add(roof);
      for (let x = minX + rafterStep, count = 0; x < maxX && count < 120; x += rafterStep, count++) {
        const cuts = crossSections(points, x, 'x');
        for (let i = 0; i + 1 < cuts.length; i += 2) addBeam(details.roof, [x - cx, top + 0.2, cuts[i] - cy], [x - cx, top + 0.2, cuts[i + 1] - cy], 0.06, timberLight);
      }
    }
    points.forEach((start, index) => {
      const end = points[(index + 1) % points.length];
      addBeam(groups.roof, [start.x - cx, top, start.y - cy], [end.x - cx, top, end.y - cy], 0.1, timber);
    });
    const markers = [];
    const markerGeometry = new THREE.SphereGeometry(Math.max(0.09, span * 0.012), 12, 10);
    groupNodesAtAnchors(nodes, { separateLayers: true }).forEach(group => {
      const floor = Math.max(1, Math.min(heights.length, group.floor));
      const base = heights.slice(0, floor - 1).reduce((sum, value) => sum + value, 0);
      let roofRise = 0.18;
      if (roofShape !== 'flat' && points.length === 4) {
        const hipInset = Math.max(0.1, Math.min(maxX - minX, maxY - minY) / 2);
        const xFraction = Math.max(0, Math.min(1, (group.x - minX) / hipInset, (maxX - group.x) / hipInset));
        const zFraction = Math.max(0, Math.min(1, (group.y - minY) / hipInset, (maxY - group.y) / hipInset));
        const gableFraction = project.settings?.roof?.ridgeAxis === 'y'
          ? 1 - Math.min(1, Math.abs(group.x - (minX + maxX) / 2) / Math.max(0.1, (maxX - minX) / 2))
          : 1 - Math.min(1, Math.abs(group.y - (minY + maxY) / 2) / Math.max(0.1, (maxY - minY) / 2));
        roofRise = roofHeight * (roofShape === 'hip' ? Math.min(xFraction, zFraction) : gableFraction);
      }
      const y = group.layer === 'roof' ? top + roofRise + 0.14 : group.layer === 'foundation' ? -0.02 : group.layer === 'floor' ? base + 0.16 : group.layer === 'ceiling' ? base + heights[floor - 1] + 0.12 : base + heights[floor - 1] * 0.65;
      const selected = group.nodes.some(node => node.id === selectedId);
      const review = group.nodes.some(node => node.requiresEngineeringReview);
      const marker = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: selected ? 0x14a06b : review ? 0xe59a43 : 0x267b5f, emissive: selected ? 0x176747 : 0x000000, emissiveIntensity: 0.35 }));
      marker.userData.review = review;
      marker.userData.layer = group.layer;
      marker.userData.group = group;
      marker.position.set(group.x - cx, y, group.y - cy);
      scene.add(marker);
      markers.push(marker);
    });
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = null;
    const onDown = event => { down = { x: event.clientX, y: event.clientY }; };
    const onUp = event => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markers.filter(marker => marker.visible))[0];
      if (hit) {
        const marker = hit.object;
        const next = nextNodeAtAnchor(marker.userData.group, selectedIdRef.current);
        setMode('layers');
        setLayer(marker.userData.layer);
        if (next) selectRef.current(next.id);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    const resize = () => {
      const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let frame;
    const render = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(render); };
    render();
    LAYERS.forEach(([key]) => groups[key].traverse(object => {
      if (!object.material) return;
      object.material.transparent = true;
      object.material.userData.baseOpacity = object.material.opacity;
    }));
    sceneRef.current = { controls, camera, markers, groups, details, roofLath, span, top };
    return () => {
      viewRef.current = { position: camera.position.clone(), target: controls.target.clone() };
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      scene.traverse(object => { object.geometry?.dispose?.(); if (Array.isArray(object.material)) object.material.forEach(item => item.dispose()); else object.material?.dispose?.(); });
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, [project.plan, project.meta?.floors, project.settings?.roof, project.settings?.sip?.floorPanelWidth, project.settings?.sip?.secondFloorPanelWidth, project.settings?.sip?.ceilingPanelWidth, project.settings?.formulas?.panelLength, project.services?.sipFloor, project.services?.sipCeiling, floorPlans, nodes]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    state.markers.forEach(marker => {
      const selected = marker.userData.group.nodes.some(node => node.id === selectedId);
      marker.material.color.setHex(selected ? 0x14a06b : marker.userData.review ? 0xe59a43 : 0x267b5f);
      marker.scale.setScalar(selected ? 1.55 : 1);
      marker.visible = mode === 'overview' || marker.userData.layer === layer;
    });
    LAYERS.forEach(([key]) => {
      const active = mode === 'overview' || layer === key;
      state.details[key].visible = mode === 'layers' && layer === key;
      state.groups[key].traverse(object => {
        if (!object.material) return;
        object.material.opacity = object.material.userData.baseOpacity * (active ? 1 : 0.08);
      });
    });
    state.roofLath.visible = showLath && mode === 'layers' && layer === 'roof';
  }, [selectedId, nodes, mode, layer, showLath]);

  useEffect(() => {
    const selected = nodes.find(node => node.id === selectedId);
    if (selected) setLayer(layerForNode(selected));
  }, [selectedId, nodes]);

  const focus = () => {
    const state = sceneRef.current;
    const marker = state?.markers.find(item => item.userData.group.nodes.some(node => node.id === selectedId));
    if (!marker) return;
    state.controls.target.copy(marker.position);
    state.camera.position.copy(marker.position).add(new THREE.Vector3(Math.max(1, state.span * 0.15), Math.max(1, state.span * 0.12), Math.max(1, state.span * 0.15)));
    state.controls.update();
  };
  const reset = () => {
    const state = sceneRef.current;
    if (!state) return;
    setMode('overview');
    state.controls.target.set(0, state.top * 0.45, 0);
    state.camera.position.set(state.span * 1.15, state.top + state.span * 1.1, state.span * 1.25);
    state.controls.update();
    viewRef.current = null;
  };
  const zoom = (factor) => {
    const state = sceneRef.current;
    if (!state) return;
    const offset = state.camera.position.clone().sub(state.controls.target).multiplyScalar(factor);
    const distance = Math.min(state.span * 5, Math.max(0.5, offset.length()));
    state.camera.position.copy(state.controls.target).add(offset.setLength(distance));
    state.controls.update();
  };
  return <div className="node-3d-wrap">
    <div className="node-3d-heading"><strong>Каркас по слоям</strong><span>Конструктив показан схематично по данным проекта</span></div>
    <div className="node-3d-toolbar" role="group" aria-label="Режим 3D-модели"><button type="button" aria-pressed={mode === 'overview'} onClick={() => setMode('overview')}>Весь дом</button><button type="button" aria-pressed={mode === 'layers'} onClick={() => setMode('layers')}>По слоям</button></div>
    {mode === 'layers' ? <div className="node-3d-layers" role="group" aria-label="Слои каркаса">{LAYERS.map(([key, label]) => <button key={key} type="button" aria-pressed={layer === key} onClick={() => setLayer(key)}>{label}</button>)}</div> : null}
    {mode === 'layers' && layer === 'roof' ? <div className="node-3d-toolbar" role="group" aria-label="Детали кровли"><button type="button" aria-pressed={showLath} onClick={() => setShowLath(value => !value)}>Обрешётка {showLath ? 'видна' : 'скрыта'}</button></div> : null}
    <div ref={host} className="node-3d-canvas" role="img" aria-label="Трёхмерная схема дома с точками строительных узлов" />
    <div className="node-3d-camera"><span aria-live="polite">{mode === 'layers' ? LAYERS.find(([key]) => key === layer)?.[1] : 'Весь дом'} · {mode === 'layers' ? 'конструктивные детали' : 'общий вид'}</span><button type="button" onClick={() => zoom(0.8)} aria-label="Приблизить модель">＋</button><button type="button" onClick={() => zoom(1.25)} aria-label="Отдалить модель">−</button><button type="button" onClick={focus} disabled={!selectedId}>Приблизить узел</button><button type="button" onClick={reset}>Общий вид</button></div>
    {error ? <p role="alert">{error}</p> : <p className="node-map-help">Перетащите для вращения; колесо, жест двумя пальцами или кнопки — для приближения. Нажмите на точку, чтобы выбрать узел. У сводных узлов точка обозначает одно характерное соединение, карточка учитывает все соединения этого типа. Раскладка и детали показаны схематично, не заменяют рабочий чертёж.</p>}
  </div>;
}
