import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NODE_HOUSE_LAYERS as LAYERS, layerForNode } from './node-house-layers.js';

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
  const [error, setError] = useState('');
  const [mode, setMode] = useState('layers');
  const [layer, setLayer] = useState('walls');
  selectRef.current = onSelect;

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
    const timber = new THREE.MeshStandardMaterial({ color: 0xa77b50, roughness: 0.82 });
    const timberLight = new THREE.MeshStandardMaterial({ color: 0xb89067, roughness: 0.82 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x738b8b, metalness: 0.55, roughness: 0.5 });
    const outline = new THREE.Shape();
    points.forEach((p, index) => index ? outline.lineTo(p.x - cx, p.y - cy) : outline.moveTo(p.x - cx, p.y - cy));
    outline.closePath();
    let level = 0;
    plans.forEach((item, floorIndex) => {
      const floorHeight = heights[floorIndex];
      const slab = new THREE.Mesh(new THREE.ShapeGeometry(outline), new THREE.MeshStandardMaterial({ color: floorIndex ? 0xc9d9c8 : 0xb8d1be, side: THREE.DoubleSide, roughness: 0.85 }));
      slab.rotation.x = -Math.PI / 2;
      slab.position.y = level;
      groups.floor.add(slab);
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
      const axis = maxX - minX >= maxY - minY ? 'x' : 'y';
      const lower = axis === 'x' ? minX : minY;
      const upper = axis === 'x' ? maxX : maxY;
      for (let fixed = lower + 0.625, count = 0; fixed < upper - 0.1 && count < 160; fixed += 0.625, count++) {
        const intersections = crossSections(points, fixed, axis);
        for (let index = 0; index + 1 < intersections.length; index += 2) {
          const a = axis === 'x' ? [fixed - cx, level + 0.07, intersections[index] - cy] : [intersections[index] - cx, level + 0.07, fixed - cy];
          const b = axis === 'x' ? [fixed - cx, level + 0.07, intersections[index + 1] - cy] : [intersections[index + 1] - cx, level + 0.07, fixed - cy];
          addBeam(details.floor, a, b, 0.07, timberLight);
        }
      }
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
    } else if (roofShape === 'gable' && points.length === 4) {
      if (project.settings?.roof?.ridgeAxis !== 'y') {
        const mid = (z0 + z1) / 2;
        addTriangle([x0, top, z0], [x1, top, z0], [x1, top + roofHeight, mid]);
        addTriangle([x0, top, z0], [x1, top + roofHeight, mid], [x0, top + roofHeight, mid]);
        addTriangle([x0, top + roofHeight, mid], [x1, top + roofHeight, mid], [x1, top, z1]);
        addTriangle([x0, top + roofHeight, mid], [x1, top, z1], [x0, top, z1]);
        addBeam(groups.roof, [x0, top + roofHeight, mid], [x1, top + roofHeight, mid], 0.11, timber);
        for (let x = x0, count = 0; x <= x1 && count < 160; x += 0.625, count++) {
          addBeam(details.roof, [x, top, z0], [x, top + roofHeight, mid], 0.065, timberLight);
          addBeam(details.roof, [x, top + roofHeight, mid], [x, top, z1], 0.065, timberLight);
        }
      } else {
        const mid = (x0 + x1) / 2;
        addTriangle([x0, top, z0], [x0, top, z1], [mid, top + roofHeight, z1]);
        addTriangle([x0, top, z0], [mid, top + roofHeight, z1], [mid, top + roofHeight, z0]);
        addTriangle([mid, top + roofHeight, z0], [mid, top + roofHeight, z1], [x1, top, z1]);
        addTriangle([mid, top + roofHeight, z0], [x1, top, z1], [x1, top, z0]);
        addBeam(groups.roof, [mid, top + roofHeight, z0], [mid, top + roofHeight, z1], 0.11, timber);
        for (let z = z0, count = 0; z <= z1 && count < 160; z += 0.625, count++) {
          addBeam(details.roof, [x0, top, z], [mid, top + roofHeight, z], 0.065, timberLight);
          addBeam(details.roof, [mid, top + roofHeight, z], [x1, top, z], 0.065, timberLight);
        }
      }
    } else {
      const roof = new THREE.Mesh(new THREE.ShapeGeometry(outline), roofMat);
      roof.rotation.x = -Math.PI / 2;
      roof.position.y = top + 0.15;
      groups.roof.add(roof);
    }
    points.forEach((start, index) => {
      const end = points[(index + 1) % points.length];
      addBeam(groups.roof, [start.x - cx, top, start.y - cy], [end.x - cx, top, end.y - cy], 0.1, timber);
    });
    const markers = [];
    const anchorCounts = new Map();
    const markerGeometry = new THREE.SphereGeometry(Math.max(0.13, span * 0.025), 12, 10);
    nodes.forEach((node, index) => {
      const floor = Math.max(1, Math.min(heights.length, Number(node.floor) || 1));
      const base = heights.slice(0, floor - 1).reduce((sum, value) => sum + value, 0);
      const markerLayer = layerForNode(node);
      const y = markerLayer === 'roof' ? top + 0.25 + (index % 4) * 0.11 : markerLayer === 'foundation' ? 0.15 + (index % 4) * 0.08 : markerLayer === 'floor' ? base + 0.16 + (index % 4) * 0.08 : base + heights[floor - 1] * 0.65 + (index % 4) * 0.11;
      const anchorX = (Number(node.x) || 0) - cx, anchorZ = (Number(node.y) || 0) - cy;
      const anchorKey = `${Math.round(anchorX * 10)}:${Math.round(anchorZ * 10)}:${markerLayer}:${floor}`;
      const collision = anchorCounts.get(anchorKey) || 0;
      anchorCounts.set(anchorKey, collision + 1);
      const radius = collision ? Math.max(0.35, span * 0.045) * Math.sqrt(collision) : 0;
      const marker = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: node.id === selectedId ? 0x14a06b : node.requiresEngineeringReview ? 0xe59a43 : 0x267b5f, emissive: node.id === selectedId ? 0x176747 : 0x000000, emissiveIntensity: 0.35 }));
      marker.userData.review = node.requiresEngineeringReview;
      marker.userData.layer = markerLayer;
      marker.position.set(anchorX + Math.cos(collision * 2.4) * radius, y, anchorZ + Math.sin(collision * 2.4) * radius);
      marker.userData.nodeId = node.id;
      scene.add(marker);
      if (collision) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(anchorX, y, anchorZ), marker.position]), new THREE.LineBasicMaterial({ color: 0x8ea79a })));
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
      const hit = raycaster.intersectObjects(markers)[0];
      if (hit) { setMode('layers'); setLayer(hit.object.userData.layer); selectRef.current(hit.object.userData.nodeId); }
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
    sceneRef.current = { controls, camera, markers, groups, details, span, top };
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
  }, [project.plan, project.meta?.floors, project.settings?.roof?.shape, project.settings?.roof?.ridgeAxis, project.settings?.roof?.ridgeHeight, floorPlans, nodes]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    state.markers.forEach(marker => {
      const selected = marker.userData.nodeId === selectedId;
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
  }, [selectedId, nodes, mode, layer]);

  useEffect(() => {
    const selected = nodes.find(node => node.id === selectedId);
    if (selected) setLayer(layerForNode(selected));
  }, [selectedId, nodes]);

  const focus = () => {
    const state = sceneRef.current;
    const marker = state?.markers.find(item => item.userData.nodeId === selectedId);
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
    <div ref={host} className="node-3d-canvas" role="img" aria-label="Трёхмерная схема дома с точками строительных узлов" />
    <div className="node-3d-camera"><span aria-live="polite">{mode === 'layers' ? LAYERS.find(([key]) => key === layer)?.[1] : 'Весь дом'} · {mode === 'layers' ? 'конструктивные детали' : 'общий вид'}</span><button type="button" onClick={() => zoom(0.8)} aria-label="Приблизить модель">＋</button><button type="button" onClick={() => zoom(1.25)} aria-label="Отдалить модель">−</button><button type="button" onClick={focus} disabled={!selectedId}>Приблизить узел</button><button type="button" onClick={reset}>Общий вид</button></div>
    {error ? <p role="alert">{error}</p> : <p className="node-map-help">Перетащите для вращения; колесо, жест двумя пальцами или кнопки — для приближения. Нажмите на точку, чтобы выбрать узел. Модель не заменяет рабочий чертёж; проёмы и детали крепления показаны условно.</p>}
  </div>;
}
