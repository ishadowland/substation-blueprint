/* =========================================================================
   SUBSTATION BLUEPRINT VIEWER — scene.js
   -------------------------------------------------------------------------
   Three.js scene construction, materials, interaction, and 3-theme state.
   Mirrors the Artemis (redradman/artemis) art direction:
     - Pure black + warm cream + amber accent (Space + Cinematic)
     - Cyanotype paper-cyan + sky-cyan (Blueprint)
     - Wireframe-first: every component rendered as THREE.LineSegments
       from EdgesGeometry. MeshPhongMaterial used only for the building hull
       and ground in Cinematic mode.
     - 3 tone states per selectable group: default (0.85 opacity), active
       (accent color, opacity 1.0, emissive boost), dimmed (0.14 opacity).
     - Materials mutated in place on theme switch (no new allocations).
   -------------------------------------------------------------------------
   Three.js 0.160.0 is loaded via importmap in index.html (jsdelivr CDN).
   No bundler, no build step, no React/Vue. Pure vanilla ES module.
   ========================================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ---------------------------------------------------------------------- */
/*  PALETTES — mirror the spec                                             */
/* ---------------------------------------------------------------------- */

const PALETTES = {
  // cyanotype — paper cyan + sky cyan
  blueprint: {
    line: 0xdceafe,
    active: 0x8fd2ff,
    bgCss: '#02060c',
  },
  // deep space — pure white + amber
  space: {
    line: 0xffffff,
    active: 0xe8a23b,
    bgCss: '#000000',
  },
  // cinematic — same palette as space, but with key/fill lighting
  cinematic: {
    line: 0xffffff,
    active: 0xe8a23b,
    bgCss: '#000000',
  },
};

/* ---------------------------------------------------------------------- */
/*  GLOBAL STATE                                                           */
/* ---------------------------------------------------------------------- */

const state = {
  theme: 'blueprint',
  selectedId: null,
  /** Wall-clock time of last user interaction — used to drive auto-rotate. */
  lastInteractAt: performance.now(),
  /** Whether the user is currently dragging — suppresses auto-rotate mid-drag. */
  isDragging: false,
  /** FPS readout throttle. */
  fpsAcc: 0,
  fpsFrames: 0,
  fpsLast: performance.now(),
};

/* ---------------------------------------------------------------------- */
/*  SHARED MATERIALS — mutated in place across themes                      */
/* ---------------------------------------------------------------------- */

const materials = {
  /** Default wire color for every component, ~0.85 opacity. */
  wireDefault: new THREE.LineBasicMaterial({
    color: PALETTES.blueprint.line,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }),
  /** Active (selected) wire color — full opacity, no depth-write so it pops. */
  wireActive: new THREE.LineBasicMaterial({
    color: PALETTES.blueprint.active,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
  }),
  /** Dimmed wire color (everything else when something is selected). */
  wireDim: new THREE.LineBasicMaterial({
    color: PALETTES.blueprint.line,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  }),
  /** Cinematic-only solid hull (warm cream Phong). Only used in cinematic. */
  hull: new THREE.MeshPhongMaterial({
    color: 0xf1ead9,
    shininess: 18,
    specular: 0x2a2620,
    transparent: true,
    opacity: 0.55,
  }),
  hullDark: new THREE.MeshPhongMaterial({
    color: 0xc6bba4,
    shininess: 10,
    specular: 0x1a1813,
    transparent: true,
    opacity: 0.45,
  }),
  /** Ground / landscape — Phong in cinematic, hidden in others. */
  ground: new THREE.MeshPhongMaterial({
    color: 0x222018,
    shininess: 4,
    specular: 0x000000,
    transparent: true,
    opacity: 0.0,
  }),
};

/* ---------------------------------------------------------------------- */
/*  SELECTABLE COMPONENT CATALOG                                           */
/*  Each component is a Group; its .userData.id matches a row below.       */
/* ---------------------------------------------------------------------- */

const CATALOG = {
  building: {
    label: 'CONTROL BUILDING',
    category: 'STRUCTURE',
    qty: '1',
    note: 'Long rectangular industrial hall — off-white ribbed walls, low-pitched panel roof. Houses relay panels, SCADA, batteries.',
  },
  transformer: {
    label: 'POWER TRANSFORMER',
    category: 'HV EQUIPMENT',
    qty: '3',
    note: 'Three-phase oil-immersed step-down units on concrete pads. Dark grey housings, white HV bushings, LV bus structures.',
  },
  switchgear: {
    label: 'SWITCHGEAR BAY',
    category: 'MV EQUIPMENT',
    qty: '2 ROWS',
    note: 'Parallel rows of disconnectors + breakers. Horizontal lattice busbars, A-frame / H-frame supports, pantograph isolators.',
  },
  capacitor: {
    label: 'CAPACITOR BANK',
    category: 'REACTIVE COMP',
    qty: '1 BANK',
    note: 'Shunt capacitor bank — cream ribbed enclosures, red / blue / dark terminal bushings. Power-factor correction for the feeder.',
  },
  mast: {
    label: 'LIGHTNING MAST',
    category: 'PROTECTION',
    qty: '2',
    note: 'Tall free-standing steel poles with overhead shield wires. Protect substation from direct lightning strikes.',
  },
  tower: {
    label: 'LATTICE TOWER',
    category: 'TRANSMISSION',
    qty: '3',
    note: 'Steel lattice transmission towers carrying bundled conductors out of the substation yard.',
  },
  perimeter: {
    label: 'PERIMETER WALL',
    category: 'CIVIL',
    qty: '1',
    note: 'Waist-high boundary wall — light-grey, irregular quadrilateral around the yard. Vehicle gate on the right-hand side.',
  },
  gate: {
    label: 'VEHICLE GATE',
    category: 'ACCESS',
    qty: '1',
    note: 'Sliding metal-bar gate with red / orange side panels. Main vehicle access through the right perimeter wall.',
  },
  road: {
    label: 'ACCESS ROAD',
    category: 'CIVIL',
    qty: '1',
    note: 'Curved internal access road connecting the gate to the building apron.',
  },
  landscape: {
    label: 'LANDSCAPING',
    category: 'CIVIL',
    qty: '—',
    note: 'Grass + flower beds + deciduous trees surrounding the compound, with a small lake at the top edge.',
  },
  'solar-demo': {
    label: 'PHOTOVOLTAIC ARRAY (DEMO)',
    category: 'RENEWABLE SOURCE',
    qty: '1 unit · 24 panels',
    note: '12 columns × 2 rows = 24 panels, ~25m wide, tilted ~26°. 4 vertical support posts (front + back rows). Each panel shows a 4-cell × 1-cell silicon grid. Demo placement south-east of the substation.',
  },
};

/* ---------------------------------------------------------------------- */
/*  RENDERER + SCENE + CAMERA                                              */
/* ---------------------------------------------------------------------- */

const canvas = document.getElementById('canvas');
const overlay = document.getElementById('stage-overlay');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(new THREE.Color(PALETTES.blueprint.bgCss), 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTES.blueprint.bgCss);
scene.fog = new THREE.Fog(PALETTES.blueprint.bgCss, 320, 900);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.5,
  2000,
);
camera.position.set(-160, 130, 200);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 80;
controls.maxDistance = 420;
controls.maxPolarAngle = Math.PI * 0.49; // don't go below ground
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

/* ---------------------------------------------------------------------- */
/*  LIGHTING                                                               */
/* ---------------------------------------------------------------------- */

const ambient = new THREE.AmbientLight(0xffffff, 0.0);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xffffff, 0x080808, 0.0);
hemi.position.set(0, 200, 0);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xfff2dd, 0.0);
keyLight.position.set(-180, 220, 160);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 50;
keyLight.shadow.camera.far = 500;
keyLight.shadow.camera.left = -200;
keyLight.shadow.camera.right = 200;
keyLight.shadow.camera.top = 200;
keyLight.shadow.camera.bottom = -200;
keyLight.shadow.bias = -0.0008;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x99bbff, 0.0);
fillLight.position.set(200, 100, -180);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffd8a0, 0.0);
rimLight.position.set(120, 80, -220);
scene.add(rimLight);

/* ---------------------------------------------------------------------- */
/*  HELPER: wireframe group from a geometry                                */
/* ---------------------------------------------------------------------- */

/**
 * Build a `THREE.LineSegments` from `EdgesGeometry(geom)`, assign it one of
 * the three shared wire materials, register userData for raycasting, and
 * return a `THREE.Group` that can be added to the scene.
 *
 * The returned group has:
 *   userData.id        — selectable id (e.g. 'transformer')
 *   userData.lines     — array of LineSegments meshes inside the group
 *   userData.solidMesh — optional Mesh for Cinematic hull shading
 */
function wireGroup(geom, id, opts = {}) {
  const edges = new THREE.EdgesGeometry(geom, opts.threshold ?? 25);
  const lines = new THREE.LineSegments(edges, materials.wireDefault);
  lines.userData.selectableId = id;
  lines.userData.kind = 'wire';

  const group = new THREE.Group();
  group.name = id;
  group.userData.id = id;
  group.userData.lines = [lines];
  group.userData.solidMesh = null;
  group.add(lines);

  return group;
}

/**
 * Variant of wireGroup that also produces a solid Phong mesh alongside the
 * wireframe — used for the building hull and concrete pads in Cinematic mode.
 * The solid mesh is hidden by default and toggled in applyTheme().
function wireGroupWithSolid(geom, id, solidMat, opts = {}) {
  const g = wireGroup(geom, id, opts);
  const solid = new THREE.Mesh(geom, solidMat);
  solid.castShadow = true;
  solid.receiveShadow = true;
  solid.userData.kind = 'solid';
  solid.visible = false;
  g.add(solid);
  g.userData.solidMesh = solid;
  return g;
}
*/

function wireGroupWithSolid(geom, id, solidMat, opts = {}) {
  const edges = new THREE.EdgesGeometry(geom, opts.threshold ?? 25);
  const lines = new THREE.LineSegments(edges, materials.wireDefault);
  lines.userData.selectableId = id;
  lines.userData.kind = 'wire';

  const solid = new THREE.Mesh(geom, solidMat);
  solid.castShadow = true;
  solid.receiveShadow = true;
  solid.userData.kind = 'solid';
  solid.visible = false;

  const group = new THREE.Group();
  group.name = id;
  group.userData.id = id;
  group.userData.lines = [lines];
  group.userData.solidMesh = solid;
  group.add(solid);
  group.add(lines);
  return group;
}

/* ---------------------------------------------------------------------- */
/*  GROUND                                                                 */
/* ---------------------------------------------------------------------- */

// Big ground plane — invisible in Blueprint/Space, faintly visible in Cinematic.
{
  const groundGeom = new THREE.PlaneGeometry(1200, 1200);
  const groundMesh = new THREE.Mesh(groundGeom, materials.ground);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.05;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Outer ground edge — a faint wireframe ring to mark the earth line.
  const ringGeom = new THREE.RingGeometry(380, 384, 64, 1);
  const ringEdges = new THREE.EdgesGeometry(ringGeom);
  const ringLines = new THREE.LineSegments(ringEdges, materials.wireDefault);
  ringLines.rotation.x = -Math.PI / 2;
  ringLines.position.y = 0.0;
  ringLines.userData.kind = 'ambient';
  scene.add(ringLines);
}

/* ---------------------------------------------------------------------- */
/*  PERIMETER WALL + GATE                                                  */
/* ---------------------------------------------------------------------- */

const selectableGroups = [];

const wallGroup = (() => {
  // Irregular quadrilateral around the substation yard.
  const pts = [
    new THREE.Vector3(-180, 0, -120),
    new THREE.Vector3(180, 0, -140),
    new THREE.Vector3(200, 0, 130),
    new THREE.Vector3(-160, 0, 140),
  ];
  // Build a thin extruded wall along the polyline.
  const wallHeight = 4;
  const wallThickness = 0.8;
  const segs = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = a.distanceTo(b);
    const geom = new THREE.BoxGeometry(len, wallHeight, wallThickness);
    const seg = new THREE.Mesh(geom);
    // Position at midpoint
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    seg.position.copy(mid);
    seg.position.y = wallHeight / 2;
    // Orient toward b
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const angle = Math.atan2(dir.x, dir.z); // BoxGeometry runs along +x
    seg.rotation.y = angle - Math.PI / 2;
    segs.push(seg);
  }

  const group = new THREE.Group();
  group.name = 'perimeter';
  group.userData.id = 'perimeter';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  segs.forEach((seg) => {
    const edges = new THREE.EdgesGeometry(seg.geometry);
    const lines = new THREE.LineSegments(edges, materials.wireDefault);
    lines.userData.selectableId = 'perimeter';
    lines.userData.kind = 'wire';
    seg.add(lines);
    group.add(seg);
    group.userData.lines.push(lines);
  });

  return group;
})();
scene.add(wallGroup);
selectableGroups.push(wallGroup);

/* Vehicle gate on the right-hand wall (segment from index 1 to 2). */
const gateGroup = (() => {
  const a = new THREE.Vector3(180, 0, -140);
  const b = new THREE.Vector3(200, 0, 130);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  // Open up a 16-unit-wide gap visually with two side panels + a gate bar.
  const group = new THREE.Group();
  group.name = 'gate';
  group.userData.id = 'gate';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  // Two red/orange side panels
  const panelGeom = new THREE.BoxGeometry(2, 5, 6);
  for (const dx of [-9, 9]) {
    const p = new THREE.Mesh(panelGeom, materials.hullDark);
    p.position.set(dx, 2.5, 0);
    const edges = new THREE.EdgesGeometry(p.geometry);
    const lines = new THREE.LineSegments(edges, materials.wireDefault);
    lines.userData.selectableId = 'gate';
    p.add(lines);
    p.userData.kind = 'solid';
    group.add(p);
    group.userData.lines.push(lines);
  }

  // Horizontal gate bar across the gap (metal bars feel)
  for (let i = -7; i <= 7; i += 2) {
    const barGeom = new THREE.BoxGeometry(0.4, 4, 0.4);
    const bar = new THREE.Mesh(barGeom, materials.hull);
    bar.position.set(i, 2, 0);
    const edges = new THREE.EdgesGeometry(bar.geometry);
    const lines = new THREE.LineSegments(edges, materials.wireDefault);
    lines.userData.selectableId = 'gate';
    bar.add(lines);
    group.add(bar);
    group.userData.lines.push(lines);
  }

  group.position.copy(mid);
  // Orient along the wall segment
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  group.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2;
  return group;
})();
scene.add(gateGroup);
selectableGroups.push(gateGroup);

/* ---------------------------------------------------------------------- */
/*  CURVED ACCESS ROAD INSIDE THE COMPOUND                                 */
/* ---------------------------------------------------------------------- */

const roadGroup = (() => {
  const group = new THREE.Group();
  group.name = 'road';
  group.userData.id = 'road';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  // Build the road as a series of flat boxes along a quadratic bezier curve.
  const start = new THREE.Vector3(180, 0.05, -60);   // near the gate
  const ctrl = new THREE.Vector3(60, 0.05, -90);     // pull left
  const end = new THREE.Vector3(-110, 0.05, -40);   // up by the building

  const segments = 28;
  const roadWidth = 8;
  const last = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * start.x + 2 * mt * t * ctrl.x + t * t * end.x;
    const z = mt * mt * start.z + 2 * mt * t * ctrl.z + t * t * end.z;
    const pos = new THREE.Vector3(x, 0.05, z);

    if (i > 0) {
      const dx = pos.x - last.x;
      const dz = pos.z - last.z;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);

      const segGeom = new THREE.BoxGeometry(len, 0.1, roadWidth);
      const seg = new THREE.Mesh(segGeom, materials.hullDark);
      seg.position.set((pos.x + last.x) / 2, 0.05, (pos.z + last.z) / 2);
      seg.rotation.y = ang;
      seg.userData.kind = 'solid';

      const edges = new THREE.EdgesGeometry(segGeom);
      const lines = new THREE.LineSegments(edges, materials.wireDefault);
      lines.userData.selectableId = 'road';
      seg.add(lines);
      group.add(seg);
      group.userData.lines.push(lines);
    }
    last.copy(pos);
  }
  return group;
})();
scene.add(roadGroup);
selectableGroups.push(roadGroup);

/* ---------------------------------------------------------------------- */
/*  CONTROL BUILDING — long rectangular industrial hall                    */
/* ---------------------------------------------------------------------- */

const buildingGroup = (() => {
  const group = new THREE.Group();
  group.name = 'building';
  group.userData.id = 'building';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  // Main hall
  const hallGeom = new THREE.BoxGeometry(180, 18, 50);
  const hall = new THREE.Mesh(hallGeom, materials.hull);
  hall.position.set(0, 9, -100);
  hall.castShadow = true;
  hall.receiveShadow = true;

  const hallEdges = new THREE.EdgesGeometry(hallGeom);
  const hallLines = new THREE.LineSegments(hallEdges, materials.wireDefault);
  hallLines.userData.selectableId = 'building';
  hall.add(hallLines);
  group.add(hall);
  group.userData.lines.push(hallLines);

  // Low-pitched paneled roof — a thin box on top
  const roofGeom = new THREE.BoxGeometry(184, 2, 54);
  const roof = new THREE.Mesh(roofGeom, materials.hullDark);
  roof.position.set(0, 19, -100);
  const roofEdges = new THREE.EdgesGeometry(roofGeom);
  const roofLines = new THREE.LineSegments(roofEdges, materials.wireDefault);
  roofLines.userData.selectableId = 'building';
  roof.add(roofLines);
  group.add(roof);
  group.userData.lines.push(roofLines);

  // Roof panel ridges — ribbed feel
  for (let i = -80; i <= 80; i += 8) {
    const ridgeGeom = new THREE.BoxGeometry(0.4, 1, 54);
    const ridge = new THREE.Mesh(ridgeGeom, materials.hullDark);
    ridge.position.set(i, 20.5, -100);
    const edges = new THREE.EdgesGeometry(ridgeGeom);
    const lines = new THREE.LineSegments(edges, materials.wireDefault);
    lines.userData.selectableId = 'building';
    ridge.add(lines);
    group.add(ridge);
    group.userData.lines.push(lines);
  }

  // Vertical wall ribs — engineering texture
  for (let i = -85; i <= 85; i += 4) {
    const ribGeom = new THREE.BoxGeometry(0.3, 18, 0.3);
    const rib = new THREE.Mesh(ribGeom, materials.hullDark);
    rib.position.set(i, 9, -75);
    const edges = new THREE.EdgesGeometry(ribGeom);
    const lines = new THREE.LineSegments(edges, materials.wireDefault);
    lines.userData.selectableId = 'building';
    rib.add(lines);
    group.add(rib);
    group.userData.lines.push(lines);

    const rib2 = rib.clone();
    rib2.position.z = -125;
    const edges2 = new THREE.EdgesGeometry(rib2.geometry);
    const lines2 = new THREE.LineSegments(edges2, materials.wireDefault);
    lines2.userData.selectableId = 'building';
    rib2.add(lines2);
    group.add(rib2);
    group.userData.lines.push(lines2);
  }

  // Door markers on the building front
  for (const dx of [-40, 0, 40]) {
    const doorGeom = new THREE.BoxGeometry(6, 8, 0.5);
    const door = new THREE.Mesh(doorGeom, materials.hullDark);
    door.position.set(dx, 4, -75);
    const edges = new THREE.EdgesGeometry(doorGeom);
    const lines = new THREE.LineSegments(edges, materials.wireDefault);
    lines.userData.selectableId = 'building';
    door.add(lines);
    group.add(door);
    group.userData.lines.push(lines);
  }

  return group;
})();
scene.add(buildingGroup);
selectableGroups.push(buildingGroup);

/* ---------------------------------------------------------------------- */
/*  THREE TRANSFORMER CLUSTERS ALONG THE BUILDING FRONT                    */
/* ---------------------------------------------------------------------- */

function buildTransformerCluster(centerX, centerZ, idSuffix) {
  const group = new THREE.Group();
  group.name = `transformer-${idSuffix}`;
  group.userData.id = 'transformer';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  // Concrete pad
  const padGeom = new THREE.BoxGeometry(22, 0.6, 14);
  const pad = new THREE.Mesh(padGeom, materials.hullDark);
  pad.position.set(centerX, 0.3, centerZ);
  pad.userData.kind = 'solid';
  const padEdges = new THREE.EdgesGeometry(padGeom);
  const padLines = new THREE.LineSegments(padEdges, materials.wireDefault);
  padLines.userData.selectableId = 'transformer';
  pad.add(padLines);
  group.add(pad);
  group.userData.lines.push(padLines);

  // Main housing (dark grey vertical cylinder)
  const housingGeom = new THREE.CylinderGeometry(2.6, 2.8, 9, 18, 1);
  const housing = new THREE.Mesh(housingGeom, materials.hullDark);
  housing.position.set(centerX, 5.4, centerZ);
  const hEdges = new THREE.EdgesGeometry(housingGeom);
  const hLines = new THREE.LineSegments(hEdges, materials.wireDefault);
  hLines.userData.selectableId = 'transformer';
  housing.add(hLines);
  group.add(housing);
  group.userData.lines.push(hLines);

  // Radiator panels (4 vertical fins around the housing)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const rad = 3.4;
    const finGeom = new THREE.BoxGeometry(0.4, 8, 1.5);
    const fin = new THREE.Mesh(finGeom, materials.hullDark);
    fin.position.set(centerX + Math.cos(a) * rad, 5, centerZ + Math.sin(a) * rad);
    fin.rotation.y = -a;
    const edges = new THREE.EdgesGeometry(finGeom);
    const lines = new THREE.LineSegments(edges, materials.wireDefault);
    lines.userData.selectableId = 'transformer';
    fin.add(lines);
    group.add(fin);
    group.userData.lines.push(lines);
  }

  // Top crown / conservator
  const crownGeom = new THREE.BoxGeometry(7, 1.2, 5);
  const crown = new THREE.Mesh(crownGeom, materials.hullDark);
  crown.position.set(centerX + 4, 10, centerZ);
  const cEdges = new THREE.EdgesGeometry(crownGeom);
  const cLines = new THREE.LineSegments(cEdges, materials.wireDefault);
  cLines.userData.selectableId = 'transformer';
  crown.add(cLines);
  group.add(crown);
  group.userData.lines.push(cLines);

  // White bus structure (horizontal bar connecting bushings)
  const busGeom = new THREE.BoxGeometry(8, 0.4, 0.4);
  const bus = new THREE.Mesh(busGeom, materials.hull);
  bus.position.set(centerX + 2, 11.5, centerZ);
  const bEdges = new THREE.EdgesGeometry(busGeom);
  const bLines = new THREE.LineSegments(bEdges, materials.wireDefault);
  bLines.userData.selectableId = 'transformer';
  bus.add(bLines);
  group.add(bus);
  group.userData.lines.push(bLines);

  // Angled cylindrical bushings (3 of them on top)
  for (let i = -1; i <= 1; i++) {
    const bushGeom = new THREE.CylinderGeometry(0.35, 0.4, 4, 10, 1);
    const bush = new THREE.Mesh(bushGeom, materials.hull);
    const bx = centerX + 2 + i * 2.5;
    const bz = centerZ;
    bush.position.set(bx, 12.7, bz);
    bush.rotation.x = -0.18;
    const e = new THREE.EdgesGeometry(bushGeom);
    const lines = new THREE.LineSegments(e, materials.wireDefault);
    lines.userData.selectableId = 'transformer';
    bush.add(lines);
    group.add(bush);
    group.userData.lines.push(lines);
  }

  return group;
}

const transformerGroup = new THREE.Group();
transformerGroup.name = 'transformers';
[
  { x: -50, z: -55 },
  { x: 0, z: -55 },
  { x: 50, z: -55 },
].forEach((p, i) => {
  const c = buildTransformerCluster(p.x, p.z, i);
  transformerGroup.add(c);
  c.userData.lines.forEach((l) => (l.userData.selectableId = 'transformer'));
});
// We registered each cluster as its own selectable group (same id) so the
// catalog will resolve correctly when any cluster is clicked.
transformerGroup.children.forEach((child) => selectableGroups.push(child));

/* ---------------------------------------------------------------------- */
/*  TWO PARALLEL ROWS OF SWITCHGEAR BAYS                                   */
/* ---------------------------------------------------------------------- */

function buildSwitchgearRow(zPos, idSuffix) {
  const group = new THREE.Group();
  group.name = `switchgear-${idSuffix}`;
  group.userData.id = 'switchgear';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  // 6 switchgear bays spaced evenly
  for (let i = 0; i < 6; i++) {
    const bx = -90 + i * 36;
    const bz = zPos;

    // Bay base
    const baseGeom = new THREE.BoxGeometry(8, 0.6, 4);
    const base = new THREE.Mesh(baseGeom, materials.hullDark);
    base.position.set(bx, 0.3, bz);
    const e0 = new THREE.EdgesGeometry(baseGeom);
    const l0 = new THREE.LineSegments(e0, materials.wireDefault);
    l0.userData.selectableId = 'switchgear';
    base.add(l0);
    group.add(base);
    group.userData.lines.push(l0);

    // Bay uprights
    const upGeom = new THREE.BoxGeometry(0.4, 6, 0.4);
    for (const dx of [-3, 3]) {
      const up = new THREE.Mesh(upGeom, materials.hull);
      up.position.set(bx + dx, 3, bz);
      const e = new THREE.EdgesGeometry(upGeom);
      const l = new THREE.LineSegments(e, materials.wireDefault);
      l.userData.selectableId = 'switchgear';
      up.add(l);
      group.add(up);
      group.userData.lines.push(l);
    }

    // A-frame / H-frame top crossbar
    const crossGeom = new THREE.BoxGeometry(6.8, 0.3, 0.3);
    const cross = new THREE.Mesh(crossGeom, materials.hull);
    cross.position.set(bx, 6.3, bz);
    const ec = new THREE.EdgesGeometry(crossGeom);
    const lc = new THREE.LineSegments(ec, materials.wireDefault);
    lc.userData.selectableId = 'switchgear';
    cross.add(lc);
    group.add(cross);
    group.userData.lines.push(lc);

    // Horizontal lattice busbar (3 parallel rods)
    for (let k = 0; k < 3; k++) {
      const rodGeom = new THREE.CylinderGeometry(0.15, 0.15, 8.5, 6, 1);
      const rod = new THREE.Mesh(rodGeom, materials.hull);
      rod.position.set(bx, 6.6 + k * 0.4, bz);
      rod.rotation.x = Math.PI / 2;
      const er = new THREE.EdgesGeometry(rodGeom);
      const lr = new THREE.LineSegments(er, materials.wireDefault);
      lr.userData.selectableId = 'switchgear';
      rod.add(lr);
      group.add(rod);
      group.userData.lines.push(lr);
    }
  }

  // Longitudinal busbars spanning the full row
  for (let k = 0; k < 3; k++) {
    const longGeom = new THREE.CylinderGeometry(0.18, 0.18, 220, 8, 1);
    const long = new THREE.Mesh(longGeom, materials.hull);
    long.position.set(-18, 6.7 + k * 0.4, zPos + 3.2);
    long.rotation.z = Math.PI / 2;
    const e = new THREE.EdgesGeometry(longGeom);
    const l = new THREE.LineSegments(e, materials.wireDefault);
    l.userData.selectableId = 'switchgear';
    long.add(l);
    group.add(long);
    group.userData.lines.push(l);

    const long2 = long.clone();
    long2.position.z = zPos - 3.2;
    const e2 = new THREE.EdgesGeometry(long2.geometry);
    const l2 = new THREE.LineSegments(e2, materials.wireDefault);
    l2.userData.selectableId = 'switchgear';
    long2.add(l2);
    group.add(long2);
    group.userData.lines.push(l2);
  }

  return group;
}

const switchgearA = buildSwitchgearRow(40, 'a');
const switchgearB = buildSwitchgearRow(70, 'b');
scene.add(switchgearA);
scene.add(switchgearB);
selectableGroups.push(switchgearA, switchgearB);

/* ---------------------------------------------------------------------- */
/*  CAPACITOR BANK — upper-left                                            */
/* ---------------------------------------------------------------------- */

const capacitorGroup = (() => {
  const group = new THREE.Group();
  group.name = 'capacitor';
  group.userData.id = 'capacitor';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  // Concrete pad
  const padGeom = new THREE.BoxGeometry(28, 0.5, 12);
  const pad = new THREE.Mesh(padGeom, materials.hullDark);
  pad.position.set(-130, 0.25, -100);
  pad.userData.kind = 'solid';
  const padE = new THREE.EdgesGeometry(padGeom);
  const padL = new THREE.LineSegments(padE, materials.wireDefault);
  padL.userData.selectableId = 'capacitor';
  pad.add(padL);
  group.add(pad);
  group.userData.lines.push(padL);

  // Cream ribbed enclosures — 6 columns × 3 rows
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const w = 3.5;
      const h = 4;
      const d = 4;
      const geom = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geom, materials.hull);
      mesh.position.set(-130 - 12 + c * 4.5, 0.5 + h / 2 + r * 4.5, -100);
      mesh.userData.kind = 'solid';
      const e = new THREE.EdgesGeometry(geom);
      const l = new THREE.LineSegments(e, materials.wireDefault);
      l.userData.selectableId = 'capacitor';
      mesh.add(l);
      group.add(mesh);
      group.userData.lines.push(l);

      // Vertical ribbed seams on the front face
      const ribGeom = new THREE.BoxGeometry(0.15, h - 0.4, 0.15);
      for (const zx of [-1, 1]) {
        const rib = new THREE.Mesh(ribGeom, materials.hullDark);
        rib.position.set(0, 0, zx * (d / 2));
        const re = new THREE.EdgesGeometry(ribGeom);
        const rl = new THREE.LineSegments(re, materials.wireDefault);
        rl.userData.selectableId = 'capacitor';
        rib.add(rl);
        mesh.add(rib);
        group.userData.lines.push(rl);
      }
    }
  }

  // Terminal bushings on top — red, blue, dark
  const termColors = [
    materials.hullDark, // dark
    materials.hull,     // cream ~ amber (palette-mapped later if active)
    materials.hullDark,
  ];
  for (let c = 0; c < 6; c++) {
    const bushGeom = new THREE.CylinderGeometry(0.35, 0.4, 1.6, 10, 1);
    const bush = new THREE.Mesh(bushGeom, termColors[c % termColors.length]);
    bush.position.set(-130 - 12 + c * 4.5, 14.4, -100);
    const e = new THREE.EdgesGeometry(bushGeom);
    const l = new THREE.LineSegments(e, materials.wireDefault);
    l.userData.selectableId = 'capacitor';
    bush.add(l);
    group.add(bush);
    group.userData.lines.push(l);
  }

  return group;
})();
scene.add(capacitorGroup);
selectableGroups.push(capacitorGroup);

/* ---------------------------------------------------------------------- */
/*  TWO TALL POLES / LIGHTNING MASTS                                       */
/* ---------------------------------------------------------------------- */

const mastGroup = (() => {
  const group = new THREE.Group();
  group.name = 'masts';
  group.userData.id = 'mast';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  function makeMast(x, z, leaning = false) {
    const poleGeom = leaning
      ? new THREE.CylinderGeometry(0.8, 1.2, 60, 8, 1)
      : new THREE.CylinderGeometry(0.6, 1.0, 60, 8, 1);
    const pole = new THREE.Mesh(poleGeom, materials.hull);
    pole.position.set(x, 30, z);
    if (leaning) pole.rotation.z = -0.06;
    const pe = new THREE.EdgesGeometry(poleGeom);
    const pl = new THREE.LineSegments(pe, materials.wireDefault);
    pl.userData.selectableId = 'mast';
    pole.add(pl);
    group.add(pole);
    group.userData.lines.push(pl);

    // Cross arm + insulators at top
    const armGeom = new THREE.BoxGeometry(8, 0.3, 0.3);
    const arm = new THREE.Mesh(armGeom, materials.hull);
    arm.position.set(x, 58, z);
    const ae = new THREE.EdgesGeometry(armGeom);
    const al = new THREE.LineSegments(ae, materials.wireDefault);
    al.userData.selectableId = 'mast';
    arm.add(al);
    group.add(arm);
    group.userData.lines.push(al);

    // 3 insulator discs hanging off the arm
    for (let i = -1; i <= 1; i++) {
      const insGeom = new THREE.CylinderGeometry(0.25, 0.4, 1.4, 8, 1);
      const ins = new THREE.Mesh(insGeom, materials.hull);
      ins.position.set(x + i * 3, 57, z);
      const ie = new THREE.EdgesGeometry(insGeom);
      const il = new THREE.LineSegments(ie, materials.wireDefault);
      il.userData.selectableId = 'mast';
      ins.add(il);
      group.add(ins);
      group.userData.lines.push(il);
    }
  }

  makeMast(-50, -180, false);   // top-left-center
  makeMast(-160, -50, true);   // leaning white pole near left

  return group;
})();
scene.add(mastGroup);
selectableGroups.push(mastGroup);

/* ---------------------------------------------------------------------- */
/*  THREE LATTICE TRANSMISSION TOWERS — lower-left + left edge             */
/* ---------------------------------------------------------------------- */

function buildLatticeTower(x, z, height = 70) {
  const group = new THREE.Group();
  group.name = `tower-${x}-${z}`;
  group.userData.id = 'tower';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  // 4 corner legs
  const legGeom = new THREE.BoxGeometry(1.2, height, 1.2);
  const legOffsets = [
    [-4, -4],
    [4, -4],
    [-4, 4],
    [4, 4],
  ];
  legOffsets.forEach(([dx, dz]) => {
    const leg = new THREE.Mesh(legGeom, materials.hull);
    leg.position.set(dx, height / 2, dz);
    const e = new THREE.EdgesGeometry(legGeom);
    const l = new THREE.LineSegments(e, materials.wireDefault);
    l.userData.selectableId = 'tower';
    leg.add(l);
    group.add(leg);
    group.userData.lines.push(l);
  });

  // Horizontal braces at multiple heights
  const braceY = [15, 30, 45, height - 4];
  braceY.forEach((y) => {
    const sides = [
      new THREE.BoxGeometry(8, 0.3, 0.3),
      new THREE.BoxGeometry(0.3, 0.3, 8),
    ];
    sides.forEach((g) => {
      const m = new THREE.Mesh(g, materials.hull);
      m.position.set(0, y, 0);
      const e = new THREE.EdgesGeometry(g);
      const l = new THREE.LineSegments(e, materials.wireDefault);
      l.userData.selectableId = 'tower';
      m.add(l);
      group.add(m);
      group.userData.lines.push(l);
    });
  });

  // Diagonal cross-braces — X pattern on each face
  const diagMat = materials.hull;
  for (let y = 0; y < braceY.length - 1; y++) {
    const y0 = braceY[y];
    const y1 = braceY[y + 1];
    const yMid = (y0 + y1) / 2;
    const h = y1 - y0;
    // Front face X
    const diagGeom = new THREE.BoxGeometry(Math.sqrt(64 + h * h), 0.25, 0.25);
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(diagGeom, diagMat);
      d.position.set(0, yMid, -4);
      d.rotation.y = sx > 0 ? Math.atan2(h, 8) : -Math.atan2(h, 8);
      const e = new THREE.EdgesGeometry(diagGeom);
      const l = new THREE.LineSegments(e, materials.wireDefault);
      l.userData.selectableId = 'tower';
      d.add(l);
      group.add(d);
      group.userData.lines.push(l);
    }
    // Side face X
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(diagGeom, diagMat);
      d.position.set(-4, yMid, 0);
      d.rotation.y = Math.PI / 2 + (sx > 0 ? Math.atan2(h, 8) : -Math.atan2(h, 8));
      const e = new THREE.EdgesGeometry(diagGeom);
      const l = new THREE.LineSegments(e, materials.wireDefault);
      l.userData.selectableId = 'tower';
      d.add(l);
      group.add(d);
      group.userData.lines.push(l);
    }
  }

  // Crossarms at the top
  for (const yOff of [height - 4, height - 8]) {
    const ca = new THREE.BoxGeometry(18, 0.4, 0.4);
    const m = new THREE.Mesh(ca, materials.hull);
    m.position.set(0, yOff, 0);
    const e = new THREE.EdgesGeometry(ca);
    const l = new THREE.LineSegments(e, materials.wireDefault);
    l.userData.selectableId = 'tower';
    m.add(l);
    group.add(m);
    group.userData.lines.push(l);
  }

  group.position.set(x, 0, z);
  return group;
}

const tower1 = buildLatticeTower(-110, 60);
const tower2 = buildLatticeTower(-180, 30);
const tower3 = buildLatticeTower(-150, 110);
scene.add(tower1, tower2, tower3);
selectableGroups.push(tower1, tower2, tower3);

/* Diagonal conductors from the towers toward the substation edge. */
const conductorGroup = (() => {
  const group = new THREE.Group();
  group.name = 'conductors';
  group.userData.id = 'tower';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  const conductors = [
    { from: [-110, 62, 60], to: [180, 50, -50] },
    { from: [-180, 62, 30], to: [180, 50, 50] },
    { from: [-150, 62, 110], to: [180, 50, 130] },
  ];
  conductors.forEach(({ from, to }) => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const len = a.distanceTo(b);
    const geom = new THREE.CylinderGeometry(0.12, 0.12, len, 5, 1);
    const m = new THREE.Mesh(geom, materials.hull);
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    m.quaternion.copy(q);
    const e = new THREE.EdgesGeometry(geom);
    const l = new THREE.LineSegments(e, materials.wireDefault);
    l.userData.selectableId = 'tower';
    m.add(l);
    group.add(m);
    group.userData.lines.push(l);
  });
  return group;
})();
scene.add(conductorGroup);
selectableGroups.push(conductorGroup);

/* ---------------------------------------------------------------------- */
/*  SOLAR ARRAY — single demo unit (12 cols × 2 rows, 4 support posts)     */
/*  WIP: this is a single instance; we'll multiply to ~800 units after    */
/*  visual confirmation.                                                  */
/* ---------------------------------------------------------------------- */

const solarDemoGroup = (() => {
  const group = new THREE.Group();
  group.name = 'solar-demo';
  group.userData.id = 'solar-demo';
  group.userData.lines = [];

  // ─── Dimensions ────────────────────────────────────────────────────────
  const PANEL_W = 2.0;     // 横向单块宽
  const PANEL_H = 1.0;     // 纵向单块深
  const PANEL_T = 0.08;    // 板厚度
  const COLS = 12;         // 横向列数
  const ROWS = 2;          // 纵向排数
  const PANEL_GAP = 0.05;  // 板与板间隙
  const GROUP_WIDTH = COLS * PANEL_W + (COLS - 1) * PANEL_GAP;  // 24.55m
  const GROUP_DEPTH = ROWS * PANEL_H + (ROWS - 1) * PANEL_GAP;  // 2.05m
  const POST_H = 2.5;      // 支撑柱高
  const PANEL_TILT = 0.45; // ~26°
  const POST_INSET_X = 2.5; // 柱从两端各缩进 ~2.5m

  // Panel box geometry (shared by all 24)
  const panelGeom = new THREE.BoxGeometry(PANEL_W, PANEL_T, PANEL_H);

  // ─── Build panels (24 total in a 12×2 grid) ───────────────────────────
  // Tilt the whole array around X axis (panels lean back)
  const tiltPivot = new THREE.Group();
  tiltPivot.position.y = POST_H; // pivot at top of posts
  tiltPivot.rotation.x = -PANEL_TILT;
  group.add(tiltPivot);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      // Local x = horizontal (across columns), z = depth (across rows)
      const lx = (col - (COLS - 1) / 2) * (PANEL_W + PANEL_GAP);
      const lz = (row - (ROWS - 1) / 2) * (PANEL_H + PANEL_GAP);

      const panel = new THREE.Mesh(panelGeom, materials.hullDark);
      panel.position.set(lx, 0, lz);
      tiltPivot.add(panel);

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(panelGeom),
        materials.wireDefault,
      );
      panel.add(edge);
      edge.userData.selectableId = 'solar-demo';
      group.userData.lines.push(edge);

      // Inner cell grid (3 vertical lines + 1 horizontal, looks like silicon cells)
      const cellPts = [];
      for (let i = 1; i <= 3; i++) {
        const x = -PANEL_W / 2 + (i / 4) * PANEL_W;
        cellPts.push(new THREE.Vector3(x, PANEL_T / 2 + 0.002, -PANEL_H / 2));
        cellPts.push(new THREE.Vector3(x, PANEL_T / 2 + 0.002, PANEL_H / 2));
      }
      cellPts.push(new THREE.Vector3(-PANEL_W / 2, PANEL_T / 2 + 0.002, 0));
      cellPts.push(new THREE.Vector3(PANEL_W / 2, PANEL_T / 2 + 0.002, 0));
      const cellGeo = new THREE.BufferGeometry().setFromPoints(cellPts);
      const cellLines = new THREE.LineSegments(cellGeo, materials.wireAccent);
      panel.add(cellLines);
      cellLines.userData.selectableId = 'solar-demo';
      group.userData.lines.push(cellLines);
    }
  }

  // ─── 4 support posts ────────────────────────────────────────────────────
  // 2 on front row, 2 on back row. Inset from edges by POST_INSET_X.
  const postGeom = new THREE.BoxGeometry(0.2, POST_H, 0.2);
  const postXs = [
    -(GROUP_WIDTH / 2 - POST_INSET_X),
     (GROUP_WIDTH / 2 - POST_INSET_X),
  ];
  const postZs = [
    -(GROUP_DEPTH / 2),
     (GROUP_DEPTH / 2),
  ];

  for (const px of postXs) {
    for (const pz of postZs) {
      const post = new THREE.Mesh(postGeom, materials.hull);
      // Posts are vertical (no tilt) — anchored in the ground
      post.position.set(px, POST_H / 2, pz);
      group.add(post);

      const postEdge = new THREE.LineSegments(
        new THREE.EdgesGeometry(postGeom),
        materials.wireDefault,
      );
      post.add(postEdge);
      postEdge.userData.selectableId = 'solar-demo';
      group.userData.lines.push(postEdge);
    }
  }

  // Place the demo group south-east of the substation, away from buildings
  group.position.set(20, 0, 25);

  return group;
})();
selectableGroups.push(solarDemoGroup);
scene.add(solarDemoGroup);


/* ---------------------------------------------------------------------- */
/*  LANDSCAPING — grass, trees, flowers, lake                              */
/* ---------------------------------------------------------------------- */

const landscapeGroup = (() => {
  const group = new THREE.Group();
  group.name = 'landscape';
  group.userData.id = 'landscape';
  group.userData.lines = [];
  group.userData.solidMesh = null;

  // Deciduous trees scattered around the perimeter
  const treeSpots = [
    [-220, -60], [-220, 0], [-220, 60], [-220, 120],
    [240, -160], [240, -90], [240, 0], [240, 80], [240, 160],
    [-100, 200], [-30, 200], [40, 200], [110, 200], [180, 200],
  ];
  treeSpots.forEach(([x, z]) => {
    // Trunk
    const trunkGeom = new THREE.CylinderGeometry(0.5, 0.7, 6, 6, 1);
    const trunk = new THREE.Mesh(trunkGeom, materials.hull);
    trunk.position.set(x, 3, z);
    const te = new THREE.EdgesGeometry(trunkGeom);
    const tl = new THREE.LineSegments(te, materials.wireDefault);
    tl.userData.selectableId = 'landscape';
    trunk.add(tl);
    group.add(trunk);
    group.userData.lines.push(tl);

    // Canopy (icosphere)
    const canopyGeom = new THREE.IcosahedronGeometry(3.5, 1);
    const canopy = new THREE.Mesh(canopyGeom, materials.hullDark);
    canopy.position.set(x, 8, z);
    const ce = new THREE.EdgesGeometry(canopyGeom);
    const cl = new THREE.LineSegments(ce, materials.wireDefault);
    cl.userData.selectableId = 'landscape';
    canopy.add(cl);
    group.add(canopy);
    group.userData.lines.push(cl);
  });

  // Flower beds — small accent rectangles
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const r = 220;
    const bedGeom = new THREE.BoxGeometry(8, 0.3, 3);
    const bed = new THREE.Mesh(bedGeom, materials.hull);
    bed.position.set(Math.cos(ang) * r, 0.15, Math.sin(ang) * r);
    bed.rotation.y = -ang;
    const e = new THREE.EdgesGeometry(bedGeom);
    const l = new THREE.LineSegments(e, materials.wireDefault);
    l.userData.selectableId = 'landscape';
    bed.add(l);
    group.add(bed);
    group.userData.lines.push(l);
  }

  // Lake at the top edge
  const lakeGeom = new THREE.CircleGeometry(40, 24);
  const lake = new THREE.Mesh(lakeGeom, materials.hullDark);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, 0.02, -220);
  lake.userData.kind = 'solid';
  const le = new THREE.EdgesGeometry(lakeGeom);
  const ll = new THREE.LineSegments(le, materials.wireDefault);
  ll.userData.selectableId = 'landscape';
  lake.add(ll);
  group.add(lake);
  group.userData.lines.push(ll);

  // Concentric ripples in the lake
  for (const r of [12, 22, 32]) {
    const rippleGeom = new THREE.RingGeometry(r - 0.2, r + 0.2, 36, 1);
    const ripple = new THREE.Mesh(rippleGeom, materials.wireDefault);
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(0, 0.03, -220);
    ripple.userData.kind = 'wire';
    ripple.userData.selectableId = 'landscape';
    group.add(ripple);
    group.userData.lines.push(ripple);
  }

  return group;
})();
scene.add(landscapeGroup);
selectableGroups.push(landscapeGroup);

/* ---------------------------------------------------------------------- */
/*  VEHICLES — small boxes on the access road                              */
/* ---------------------------------------------------------------------- */

const vehicles = (() => {
  const group = new THREE.Group();
  group.name = 'vehicles';
  group.userData.lines = [];
  const spots = [
    [80, 0.8, -70],
    [120, 0.8, -75],
    [-60, 0.8, -45],
  ];
  spots.forEach(([x, y, z]) => {
    const carGeom = new THREE.BoxGeometry(5, 1.6, 2.4);
    const car = new THREE.Mesh(carGeom, materials.hullDark);
    car.position.set(x, y, z);
    const e = new THREE.EdgesGeometry(carGeom);
    const l = new THREE.LineSegments(e, materials.wireDefault);
    l.userData.kind = 'ambient';
    car.add(l);
    group.add(car);
  });
  return group;
})();
scene.add(vehicles);

/* ---------------------------------------------------------------------- */
/*  THEME SWITCHING — mutate shared materials in place                     */
/* ---------------------------------------------------------------------- */

function applyTheme(name) {
  const pal = PALETTES[name];
  state.theme = name;

  // ----- Background + fog
  scene.background = new THREE.Color(pal.bgCss);
  renderer.setClearColor(new THREE.Color(pal.bgCss), 1);
  scene.fog.color = new THREE.Color(pal.bgCss);

  // ----- Wire materials — in-place color mutate
  materials.wireDefault.color.setHex(pal.line);
  materials.wireActive.color.setHex(pal.active);
  materials.wireDim.color.setHex(pal.line);

  // ----- Lighting per theme
  if (name === 'blueprint') {
    ambient.intensity = 0.0;
    hemi.intensity = 0.0;
    keyLight.intensity = 0.0;
    fillLight.intensity = 0.0;
    rimLight.intensity = 0.0;
    materials.ground.opacity = 0.0;
    materials.hull.opacity = 0.0;
    materials.hullDark.opacity = 0.0;
  } else if (name === 'space') {
    ambient.intensity = 0.18;
    hemi.intensity = 0.12;
    keyLight.intensity = 0.0;
    fillLight.intensity = 0.0;
    rimLight.intensity = 0.0;
    materials.ground.opacity = 0.0;
    materials.hull.opacity = 0.0;
    materials.hullDark.opacity = 0.0;
  } else if (name === 'cinematic') {
    ambient.intensity = 0.32;
    hemi.intensity = 0.18;
    keyLight.intensity = 1.4;
    fillLight.intensity = 0.55;
    rimLight.intensity = 0.45;
    materials.ground.opacity = 0.22;
    materials.hull.opacity = 0.55;
    materials.hullDark.opacity = 0.45;
  }

  // ----- Make solid hull meshes visible only in Cinematic
  const showSolids = name === 'cinematic';
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.kind === 'solid') {
      obj.visible = showSolids;
    }
  });

  // ----- CSS theme on body (drives HUD palette)
  document.body.dataset.theme = name;

  // ----- Update theme buttons
  document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
    const active = btn.dataset.themeBtn === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });

  // ----- Re-apply current selection so colors stay correct
  applySelection(state.selectedId);
}

/* ---------------------------------------------------------------------- */
/*  SELECTION — apply 3-tone state                                         */
/* ---------------------------------------------------------------------- */

function applySelection(id) {
  state.selectedId = id;

  for (const g of selectableGroups) {
    const lines = g.userData.lines || [];
    const isMatch = id !== null && g.userData.id === id;
    const hasSelection = id !== null;

    for (const line of lines) {
      if (line.userData.kind === 'ambient') {
        // Always faint regardless of selection state.
        line.material = materials.wireDim;
        continue;
      }

      if (!hasSelection) {
        line.material = materials.wireDefault;
      } else if (isMatch) {
        line.material = materials.wireActive;
      } else {
        line.material = materials.wireDim;
      }
    }
  }

  // Update panel
  const selName = document.getElementById('sel-name');
  const selCat = document.getElementById('sel-cat');
  const selQty = document.getElementById('sel-qty');
  const selNote = document.getElementById('sel-note');

  if (id && CATALOG[id]) {
    const meta = CATALOG[id];
    selName.textContent = meta.label;
    selName.classList.add('is-accent');
    selCat.textContent = meta.category;
    selQty.textContent = meta.qty;
    selNote.textContent = meta.note;
  } else {
    selName.textContent = 'NONE';
    selName.classList.remove('is-accent');
    selCat.textContent = '—';
    selQty.textContent = '—';
    selNote.textContent =
      'Click any component to isolate. Click empty space to clear.';
  }
}

/* ---------------------------------------------------------------------- */
/*  RAYCASTER — click to select                                            */
/* ---------------------------------------------------------------------- */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function onPointerDown(event) {
  if (event.button !== 0) return;
  state.lastInteractAt = performance.now();
  controls.autoRotate = false;
  state.isDragging = false;
  pointer.downX = event.clientX;
  pointer.downY = event.clientY;
}

function onPointerMove(event) {
  state.lastInteractAt = performance.now();
  // Detect drag — only suppress click if pointer moved more than 4 px
  if (pointer.downX !== undefined) {
    const dx = event.clientX - pointer.downX;
    const dy = event.clientY - pointer.downY;
    if (Math.hypot(dx, dy) > 4) state.isDragging = true;
  }
}

function onPointerUp(event) {
  state.lastInteractAt = performance.now();
  if (event.button !== 0) return;
  if (state.isDragging) {
    state.isDragging = false;
    pointer.downX = undefined;
    return;
  }
  // Cast ray
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  // Collect candidate wire lines across all groups
  const candidates = [];
  for (const g of selectableGroups) {
    for (const line of g.userData.lines) {
      if (line.userData.kind !== 'wire') continue;
      candidates.push(line);
    }
  }

  const hits = raycaster.intersectObjects(candidates, false);
  if (hits.length === 0) {
    applySelection(null);
  } else {
    const id = hits[0].object.userData.selectableId;
    applySelection(id);
  }
  pointer.downX = undefined;
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);

/* ---------------------------------------------------------------------- */
/*  THEME BUTTONS + KEYBOARD SHORTCUTS                                     */
/* ---------------------------------------------------------------------- */

document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.themeBtn);
  });
});

window.addEventListener('keydown', (event) => {
  if (event.key === '1') applyTheme('blueprint');
  else if (event.key === '2') applyTheme('space');
  else if (event.key === '3') applyTheme('cinematic');
  else if (event.key === 'Escape') applySelection(null);
});

/* ---------------------------------------------------------------------- */
/*  PANEL COLLAPSE                                                         */
/* ---------------------------------------------------------------------- */

const panel = document.getElementById('panel');
const panelClose = document.getElementById('panel-close');
if (panelClose) {
  panelClose.addEventListener('click', () => panel.classList.add('is-collapsed'));
}

/* ---------------------------------------------------------------------- */
/*  RESIZE                                                                 */
/* ---------------------------------------------------------------------- */

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', onResize);

/* ---------------------------------------------------------------------- */
/*  RENDER LOOP + AUTO-ROTATE                                              */
/* ---------------------------------------------------------------------- */

const fpsReadout = document.getElementById('fps-readout');
const IDLE_BEFORE_AUTOROTATE_MS = 4000;
const ROTATE_SPEED = 0.35;

function tick() {
  // Auto-rotate only after idle period, and not mid-drag.
  const idle = performance.now() - state.lastInteractAt;
  controls.autoRotate = idle > IDLE_BEFORE_AUTOROTATE_MS && !state.isDragging;
  controls.autoRotateSpeed = ROTATE_SPEED;

  controls.update();

  // FPS readout — throttle to 1 Hz
  state.fpsFrames++;
  const now = performance.now();
  if (now - state.fpsLast >= 1000) {
    state.fpsAcc = state.fpsFrames;
    state.fpsFrames = 0;
    state.fpsLast = now;
    if (fpsReadout) {
      fpsReadout.textContent = `${state.fpsAcc} FPS`;
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ---------------------------------------------------------------------- */
/*  BOOT                                                                   */
/* ---------------------------------------------------------------------- */

function boot() {
  applyTheme('blueprint');
  applySelection(null);

  // Hide overlay after first paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('is-hidden');
    });
  });

  tick();
}

boot();

/* Surface uncaught errors to the overlay so failures are obvious. */
window.addEventListener('error', (event) => {
  console.error('[substation]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[substation]', event.reason);
});