import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const contour = (plan) => Array.isArray(plan?.house?.points) && plan.house.points.length >= 3
  ? plan.house.points
  : [{ x: 0, y: 0 }, { x: Number(plan?.house?.w) || 1, y: 0 }, { x: Number(plan?.house?.w) || 1, y: Number(plan?.house?.h) || 1 }, { x: 0, y: Number(plan?.house?.h) || 1 }];

export default function NodeHouse3D({ project, floorPlans, nodes, selectedId, onSelect }) {
  const host = useRef(null);
  const sceneRef = useRef(null);
  const selectRef = useRef(onSelect);
  const [error, setError] = useState('');
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
    const outline = new THREE.Shape();
    points.forEach((p, index) => index ? outline.lineTo(p.x - cx, p.y - cy) : outline.moveTo(p.x - cx, p.y - cy));
    outline.closePath();
    let level = 0;
    plans.forEach((item, floorIndex) => {
      const floorHeight = heights[floorIndex];
      const slab = new THREE.Mesh(new THREE.ShapeGeometry(outline), new THREE.MeshStandardMaterial({ color: floorIndex ? 0xc9d9c8 : 0xb8d1be, side: THREE.DoubleSide, roughness: 0.85 }));
      slab.rotation.x = -Math.PI / 2;
      slab.position.y = level;
      scene.add(slab);
      points.forEach((start, index) => {
        const end = points[(index + 1) % points.length];
        const dx = end.x - start.x, dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (!length) return;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(length, floorHeight, 0.07), new THREE.MeshStandardMaterial({ color: 0x78a893, transparent: true, opacity: 0.27, side: THREE.DoubleSide, depthWrite: false }));
        wall.position.set((start.x + end.x) / 2 - cx, level + floorHeight / 2, (start.y + end.y) / 2 - cy);
        wall.rotation.y = -Math.atan2(dy, dx);
        scene.add(wall);
        const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(start.x - cx, level, start.y - cy), new THREE.Vector3(start.x - cx, level + floorHeight, start.y - cy), new THREE.Vector3(end.x - cx, level + floorHeight, end.y - cy)]), new THREE.LineBasicMaterial({ color: 0x467861 }));
        scene.add(edge);
      });
      level += floorHeight;
    });
    const roofHeight = Math.max(0.3, Number(project.settings?.roof?.ridgeHeight) || 1.8);
    const roofShape = project.settings?.roof?.shape || 'gable';
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x557d6f, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
    const x0 = minX - cx, x1 = maxX - cx, z0 = minY - cy, z1 = maxY - cy;
    const addTriangle = (a, b, c) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
      geometry.computeVertexNormals();
      scene.add(new THREE.Mesh(geometry, roofMat));
    };
    if (roofShape === 'flat') {
      const roof = new THREE.Mesh(new THREE.ShapeGeometry(outline), roofMat);
      roof.rotation.x = -Math.PI / 2;
      roof.position.y = top + 0.1;
      scene.add(roof);
    } else if (roofShape === 'gable' && points.length === 4) {
      if (project.settings?.roof?.ridgeAxis !== 'y') {
        const mid = (z0 + z1) / 2;
        addTriangle([x0, top, z0], [x1, top, z0], [x1, top + roofHeight, mid]);
        addTriangle([x0, top, z0], [x1, top + roofHeight, mid], [x0, top + roofHeight, mid]);
        addTriangle([x0, top + roofHeight, mid], [x1, top + roofHeight, mid], [x1, top, z1]);
        addTriangle([x0, top + roofHeight, mid], [x1, top, z1], [x0, top, z1]);
      } else {
        const mid = (x0 + x1) / 2;
        addTriangle([x0, top, z0], [x0, top, z1], [mid, top + roofHeight, z1]);
        addTriangle([x0, top, z0], [mid, top + roofHeight, z1], [mid, top + roofHeight, z0]);
        addTriangle([mid, top + roofHeight, z0], [mid, top + roofHeight, z1], [x1, top, z1]);
        addTriangle([mid, top + roofHeight, z0], [x1, top, z1], [x1, top, z0]);
      }
    } else {
      const roof = new THREE.Mesh(new THREE.ShapeGeometry(outline), roofMat);
      roof.rotation.x = -Math.PI / 2;
      roof.position.y = top + 0.15;
      scene.add(roof);
    }
    const markers = [];
    const anchorCounts = new Map();
    const markerGeometry = new THREE.SphereGeometry(Math.max(0.13, span * 0.025), 12, 10);
    nodes.forEach((node, index) => {
      const floor = Math.max(1, Math.min(heights.length, Number(node.floor) || 1));
      const base = heights.slice(0, floor - 1).reduce((sum, value) => sum + value, 0);
      const isRoof = /roof|rafter|mauerlat/i.test(`${node.id} ${node.section}`);
      const y = isRoof ? top + 0.25 + (index % 4) * 0.11 : base + heights[floor - 1] * 0.65 + (index % 4) * 0.11;
      const anchorX = (Number(node.x) || 0) - cx, anchorZ = (Number(node.y) || 0) - cy;
      const anchorKey = `${Math.round(anchorX * 10)}:${Math.round(anchorZ * 10)}:${isRoof ? 'roof' : floor}`;
      const collision = anchorCounts.get(anchorKey) || 0;
      anchorCounts.set(anchorKey, collision + 1);
      const radius = collision ? Math.max(0.35, span * 0.045) * Math.sqrt(collision) : 0;
      const marker = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: node.id === selectedId ? 0x14a06b : node.requiresEngineeringReview ? 0xe59a43 : 0x267b5f, emissive: node.id === selectedId ? 0x176747 : 0x000000, emissiveIntensity: 0.35 }));
      marker.userData.review = node.requiresEngineeringReview;
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
      if (hit) selectRef.current(hit.object.userData.nodeId);
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
    sceneRef.current = { controls, camera, markers, span, top };
    return () => {
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
    });
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
    state.controls.target.set(0, state.top * 0.45, 0);
    state.camera.position.set(state.span * 1.15, state.top + state.span * 1.1, state.span * 1.25);
    state.controls.update();
  };
  return <div className="node-3d-wrap"><div className="node-3d-toolbar"><button type="button" onClick={focus} disabled={!selectedId}>Приблизить узел</button><button type="button" onClick={reset}>Общий вид</button></div><div ref={host} className="node-3d-canvas" role="img" aria-label="Трёхмерная схема дома с точками строительных узлов" />{error ? <p role="alert">{error}</p> : <p className="node-map-help">Перетащите для вращения, колесо или жест двумя пальцами — приближение, нажмите на точку для выбора узла. Модель схематичная, не заменяет рабочий чертёж.</p>}</div>;
}
