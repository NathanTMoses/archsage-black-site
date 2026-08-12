// neural.js — ARCHSAGE Neural Brain Mapping
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── BRAIN REGIONS ─────────────────────────────────────────────────────────────
// lp = local position as fraction of bounding-box half-extents [-1 … 1]
const REGIONS = [
  {
    id: 'prefrontal', label: 'Prefrontal Cortex', abbr: 'PFC',
    lp: [0, 0.32, 0.84],
    color: '#38bdf8', hz: 40, activity: 0.87,
    role: 'Executive Function & Decision Making',
    desc: 'Controls complex cognition, personality expression, decision making, and moderating social behavior. The seat of strategic intelligence and forward planning.',
    conn: ['motor', 'thalamus', 'amygdala', 'hippocampus'],
  },
  {
    id: 'motor', label: 'Motor Cortex', abbr: 'M1',
    lp: [0.1, 0.9, 0.08],
    color: '#4ade80', hz: 20, activity: 0.72,
    role: 'Voluntary Movement Control',
    desc: 'Executes voluntary movement commands and coordinates fine motor control. Directly maps to muscle groups across the body via the corticospinal tract.',
    conn: ['cerebellum', 'sensory', 'thalamus'],
  },
  {
    id: 'sensory', label: 'Somatosensory Cortex', abbr: 'S1',
    lp: [-0.1, 0.86, -0.06],
    color: '#34d399', hz: 10, activity: 0.65,
    role: 'Touch & Pain Processing',
    desc: 'Processes tactile information — touch, pressure, pain, temperature. Creates the body\'s sensory homunculus map in the cortex.',
    conn: ['parietal', 'thalamus', 'motor'],
  },
  {
    id: 'parietal', label: 'Parietal Lobe', abbr: 'PL',
    lp: [0, 0.76, -0.38],
    color: '#a78bfa', hz: 7, activity: 0.58,
    role: 'Spatial Awareness & Integration',
    desc: 'Integrates multisensory information and creates spatial awareness. Critical for navigation, object recognition, and understanding spatial relationships.',
    conn: ['occipital', 'sensory', 'temporal'],
  },
  {
    id: 'occipital', label: 'Occipital Lobe', abbr: 'V1',
    lp: [0, 0.36, -0.92],
    color: '#f43f5e', hz: 60, activity: 0.92,
    role: 'Visual Processing',
    desc: 'Primary visual cortex. Processes color, motion, depth, and object recognition. Highest activity frequency in the cortex — 60 Hz flicker fusion.',
    conn: ['temporal', 'parietal', 'thalamus'],
  },
  {
    id: 'temporal', label: 'Temporal Lobe', abbr: 'TL',
    lp: [-0.8, 0.04, 0.14],
    color: '#fb923c', hz: 8, activity: 0.76,
    role: 'Memory, Language & Auditory',
    desc: 'Processes auditory information and supports language comprehension. Essential for long-term memory formation and semantic understanding.',
    conn: ['hippocampus', 'amygdala', 'thalamus', 'occipital'],
  },
  {
    id: 'cerebellum', label: 'Cerebellum', abbr: 'CB',
    lp: [0, -0.68, -0.76],
    color: '#38bdf8', hz: 30, activity: 0.68,
    role: 'Coordination & Balance',
    desc: 'Fine-tunes motor commands, maintains balance and posture, coordinates timing. Contains half the brain\'s neurons in only 10% of its volume.',
    conn: ['brainstem', 'motor'],
  },
  {
    id: 'brainstem', label: 'Brainstem', abbr: 'BS',
    lp: [0, -0.82, -0.22],
    color: '#fb923c', hz: 1, activity: 0.99,
    role: 'Vital Autonomic Functions',
    desc: 'Controls breathing, heart rate, blood pressure, and consciousness. The most evolutionarily ancient structure — essential for survival.',
    conn: ['cerebellum', 'hypothalamus', 'thalamus'],
  },
  {
    id: 'hippocampus', label: 'Hippocampus', abbr: 'HC',
    lp: [-0.38, -0.1, -0.08],
    color: '#a78bfa', hz: 4, activity: 0.81,
    role: 'Memory Formation & Navigation',
    desc: 'Critical for forming new declarative memories and spatial navigation. First region damaged in Alzheimer\'s disease. Encodes the map of lived experience.',
    conn: ['temporal', 'amygdala', 'prefrontal', 'thalamus'],
  },
  {
    id: 'amygdala', label: 'Amygdala', abbr: 'AMY',
    lp: [-0.46, -0.16, 0.3],
    color: '#f43f5e', hz: 5, activity: 0.74,
    role: 'Emotion Processing & Threat Detection',
    desc: 'Processes emotional responses — especially fear and aggression. Triggers fight-or-flight and attaches emotional weight to memories.',
    conn: ['hippocampus', 'prefrontal', 'hypothalamus'],
  },
  {
    id: 'thalamus', label: 'Thalamus', abbr: 'TH',
    lp: [0, 0.06, -0.04],
    color: '#facc15', hz: 12, activity: 0.95,
    role: 'Central Sensory Relay',
    desc: 'The brain\'s central relay station. Routes nearly all sensory signals to appropriate cortical areas. Gateway to consciousness itself.',
    conn: ['prefrontal', 'sensory', 'temporal', 'occipital', 'hypothalamus', 'brainstem'],
  },
  {
    id: 'hypothalamus', label: 'Hypothalamus', abbr: 'HYP',
    lp: [0, -0.22, 0.24],
    color: '#facc15', hz: 3, activity: 0.88,
    role: 'Homeostasis & Hormonal Control',
    desc: 'Regulates body temperature, hunger, thirst, sleep, and hormone release. Master regulator of the endocrine system via the pituitary gland.',
    conn: ['thalamus', 'amygdala', 'brainstem'],
  },
];

const regionById = Object.fromEntries(REGIONS.map(r => [r.id, r]));

// Deduplicate bidirectional connections
const CONNS = [];
const _cset = new Set();
REGIONS.forEach(r => r.conn.forEach(tid => {
  const key = [r.id, tid].sort().join('|');
  if (!_cset.has(key)) { _cset.add(key); CONNS.push({ from: r.id, to: tid }); }
}));

// ── RENDERER ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('neural-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

// ── SCENE ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a0f);
scene.fog = new THREE.FogExp2(0x060a0f, 0.055);

const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.01, 200);
camera.position.set(0, 0.4, 4.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.8;
controls.maxDistance = 14;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.target.set(0, 0, 0);

// ── LIGHTS ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x0a1930, 5));

const keyLight = new THREE.PointLight(0x38bdf8, 10, 14);
keyLight.position.set(3, 3, 3);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xa78bfa, 6, 12);
fillLight.position.set(-3, -2, -3);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0xfb923c, 3, 10);
rimLight.position.set(0, -3, 1);
scene.add(rimLight);

const topLight = new THREE.DirectionalLight(0xc7d2fe, 0.4);
topLight.position.set(0, 6, 2);
scene.add(topLight);

// ── STAR FIELD ────────────────────────────────────────────────────────────────
{
  const n = 3000;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 140;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x1a3560, size: 0.055, sizeAttenuation: true, transparent: true, opacity: 0.6,
  })));
}

// ── GRID FLOOR ────────────────────────────────────────────────────────────────
{
  const grid = new THREE.GridHelper(30, 30, 0x0d1a2e, 0x0d1a2e);
  grid.position.y = -2.2;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);
}

// ── SCAN PLANE ────────────────────────────────────────────────────────────────
const scanMat = new THREE.MeshBasicMaterial({
  color: 0x38bdf8, transparent: true, opacity: 0, side: THREE.DoubleSide,
});
const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), scanMat);
scanPlane.rotation.x = Math.PI / 2;
scene.add(scanPlane);

// ── STATE ─────────────────────────────────────────────────────────────────────
const nodes = {};      // regionId → { region, core, glow, ring, wp }
const connObjs = [];   // connection objects with curves and particles
const spikes = [];     // active spike animations
let selectedId = null;
let hoveredId = null;
let fireCount = 0;
let lastSpikeT = 0;

// ── FREQ RING CANVAS ──────────────────────────────────────────────────────────
const freqCanvas = document.getElementById('freq-ring');
const freqCtx = freqCanvas.getContext('2d');

function drawFreqRing(hz, color, activity) {
  const cx = 45, cy = 45, r = 34;
  freqCtx.clearRect(0, 0, 90, 90);

  // Track
  freqCtx.beginPath();
  freqCtx.arc(cx, cy, r, 0, Math.PI * 2);
  freqCtx.strokeStyle = '#1c2333';
  freqCtx.lineWidth = 4;
  freqCtx.stroke();

  // Fill arc
  freqCtx.beginPath();
  freqCtx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * activity);
  freqCtx.strokeStyle = color;
  freqCtx.lineWidth = 4;
  freqCtx.shadowBlur = 10;
  freqCtx.shadowColor = color;
  freqCtx.stroke();
  freqCtx.shadowBlur = 0;

  // Center text
  freqCtx.fillStyle = color;
  freqCtx.font = 'bold 14px monospace';
  freqCtx.textAlign = 'center';
  freqCtx.textBaseline = 'middle';
  freqCtx.fillText(hz + 'Hz', cx, cy);
}

// ── LOAD BRAIN ────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
loader.load(
  '/models/brain%20human.glb',
  onBrainLoaded,
  (xhr) => {
    if (xhr.total > 0) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      document.getElementById('loader-bar').style.width = pct + '%';
      document.getElementById('loader-pct').textContent = pct + '%';
    }
  },
  (err) => {
    console.error('GLB load error:', err);
    document.getElementById('loader-error').style.display = 'block';
    document.getElementById('loader-bar').parentElement.style.display = 'none';
    document.getElementById('loader-pct').style.display = 'none';
  }
);

function onBrainLoaded(gltf) {
  const model = gltf.scene;

  // Apply translucent brain material to every mesh
  model.traverse(child => {
    if (!child.isMesh) return;
    child.material = new THREE.MeshPhongMaterial({
      color: 0x0d2448,
      emissive: 0x040f22,
      specular: 0x1a6090,
      shininess: 100,
      transparent: true,
      opacity: 0.72,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    child.renderOrder = 0;
  });

  // Normalize to 2-unit tall, centered at origin
  const box = new THREE.Box3().setFromObject(model);
  const sz = box.getSize(new THREE.Vector3());
  const ctr = box.getCenter(new THREE.Vector3());
  const scale = 2.0 / Math.max(sz.x, sz.y, sz.z);
  model.scale.setScalar(scale);
  model.position.sub(ctr.multiplyScalar(scale));
  scene.add(model);

  // Recompute bounding box after transform
  const box2 = new THREE.Box3().setFromObject(model);
  const sz2 = box2.getSize(new THREE.Vector3());
  const ctr2 = box2.getCenter(new THREE.Vector3());

  buildNeuralNetwork(ctr2, sz2);
  buildRegionBar();
  playScan(box2);

  document.getElementById('hud-syn').textContent = CONNS.length;
  document.getElementById('hud-nodes').textContent = REGIONS.length;

  // Dismiss loader
  setTimeout(() => {
    const el = document.getElementById('loader');
    el.classList.add('hidden');
    setTimeout(() => el.remove(), 750);
  }, 500);
}

// ── BUILD NEURAL NETWORK ──────────────────────────────────────────────────────
function buildNeuralNetwork(center, size) {
  const half = size.clone().multiplyScalar(0.5);

  // Create node objects
  REGIONS.forEach(r => {
    const wp = new THREE.Vector3(
      center.x + r.lp[0] * half.x,
      center.y + r.lp[1] * half.y,
      center.z + r.lp[2] * half.z,
    );
    const col = new THREE.Color(r.color);

    // Solid core
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.044, 20, 20),
      new THREE.MeshBasicMaterial({ color: col })
    );
    core.position.copy(wp);
    core.userData.regionId = r.id;
    core.renderOrder = 2;
    scene.add(core);

    // Soft glow halo (inside-out sphere, additive-ish)
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 16),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, side: THREE.BackSide })
    );
    glow.position.copy(wp);
    glow.renderOrder = 1;
    scene.add(glow);

    // Orbit ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.004, 4, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25 })
    );
    ring.position.copy(wp);
    ring.rotation.x = Math.random() * Math.PI;
    ring.rotation.z = Math.random() * Math.PI;
    ring.renderOrder = 2;
    scene.add(ring);

    nodes[r.id] = { region: r, core, glow, ring, wp };
  });

  // Create connections
  CONNS.forEach(c => {
    const na = nodes[c.from], nb = nodes[c.to];
    if (!na || !nb) return;

    // Bezier arc: push mid-point outward from brain center
    const mid = na.wp.clone().lerp(nb.wp, 0.5);
    mid.add(mid.clone().normalize().multiplyScalar(0.38));

    const curve = new THREE.QuadraticBezierCurve3(na.wp, mid, nb.wp);
    const blended = new THREE.Color(na.region.color).lerp(new THREE.Color(nb.region.color), 0.5);

    // Tube geometry along the bezier
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 52, 0.0025, 4, false),
      new THREE.MeshBasicMaterial({ color: blended, transparent: true, opacity: 0.28 })
    );
    tube.renderOrder = 1;
    scene.add(tube);

    // Traveling signal particles
    const particles = [];
    const pCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pCount; i++) {
      const pm = new THREE.Mesh(
        new THREE.SphereGeometry(0.0075, 5, 5),
        new THREE.MeshBasicMaterial({ color: blended, transparent: true, opacity: 0.88 })
      );
      pm.renderOrder = 3;
      scene.add(pm);
      particles.push({ mesh: pm, t: i / pCount, speed: 0.0018 + Math.random() * 0.0025 });
    }

    connObjs.push({ c, na, nb, curve, tube, particles, blended });
  });
}

// ── SCAN ANIMATION ────────────────────────────────────────────────────────────
function playScan(box) {
  const minY = box.min.y - 0.3, maxY = box.max.y + 0.3;
  scanPlane.position.y = minY;
  let start = null;
  (function tick(ts) {
    if (!start) start = ts;
    const frac = Math.min((ts - start) / 2000, 1);
    scanPlane.position.y = minY + (maxY - minY) * frac;
    scanMat.opacity = 0.12 * Math.sin(frac * Math.PI);
    if (frac < 1) requestAnimationFrame(tick);
    else { scanMat.opacity = 0; }
  })(performance.now());
}

// ── REGION BOTTOM BAR ─────────────────────────────────────────────────────────
function buildRegionBar() {
  const bar = document.getElementById('region-bar');
  REGIONS.forEach(r => {
    const chip = document.createElement('div');
    chip.className = 'r-chip';
    chip.dataset.id = r.id;
    chip.innerHTML = `<div class="r-chip-dot" style="background:${r.color}"></div>${r.abbr}`;
    chip.addEventListener('click', () => selectRegion(r.id));
    bar.appendChild(chip);
  });
}

// ── REGION SELECTION ──────────────────────────────────────────────────────────
function selectRegion(id) {
  selectedId = id;
  const r = regionById[id];

  // Chips
  document.querySelectorAll('.r-chip').forEach(ch => ch.classList.toggle('active', ch.dataset.id === id));

  // Panel
  const panel = document.getElementById('info-panel');
  panel.style.setProperty('--rcolor', r.color);
  document.getElementById('info-abbr').textContent = r.abbr;
  document.getElementById('info-name').textContent = r.label;
  document.getElementById('info-role').textContent = r.role;
  document.getElementById('info-hz').textContent = r.hz;
  document.getElementById('info-act').textContent = Math.round(r.activity * 100);
  document.getElementById('act-bar').style.width = (r.activity * 100) + '%';
  document.getElementById('act-bar').style.background = r.color;
  document.getElementById('act-bar').style.boxShadow = `0 0 8px ${r.color}`;
  document.getElementById('info-desc').textContent = r.desc;

  const connsEl = document.getElementById('info-conns');
  connsEl.innerHTML = '';
  r.conn.forEach(tid => {
    const tr = regionById[tid];
    const el = document.createElement('div');
    el.className = 'conn-item';
    el.innerHTML = `<span class="conn-arrow">→</span><div class="conn-dot" style="background:${tr.color}"></div>${tr.label}`;
    el.addEventListener('click', () => selectRegion(tid));
    connsEl.appendChild(el);
  });
  panel.classList.add('visible');

  drawFreqRing(r.hz, r.color, r.activity);
  applySelectionHighlight(id);
  flyToNode(nodes[id].wp);

  // Burst spike from this node's connections
  connObjs
    .filter(co => co.c.from === id || co.c.to === id)
    .slice(0, 3)
    .forEach(co => spawnSpike(co, id));
}

function applySelectionHighlight(activeId) {
  const activeConns = r => r.conn.includes(activeId) || r.id === activeId;

  Object.values(nodes).forEach(no => {
    const isLinked = activeConns(no.region);
    const isSelected = no.region.id === activeId;
    no.core.material.opacity = isLinked ? 1.0 : 0.2;
    no.glow.material.opacity = isSelected ? 0.22 : (isLinked ? 0.12 : 0.03);
    no.core.scale.setScalar(isSelected ? 1.55 : (isLinked ? 1.2 : 0.75));
    no.ring.material.opacity = isLinked ? 0.45 : 0.08;
  });

  connObjs.forEach(co => {
    const active = co.c.from === activeId || co.c.to === activeId;
    co.tube.material.opacity = active ? 0.7 : 0.1;
    co.particles.forEach(p => {
      p.mesh.material.opacity = active ? 1.0 : 0.2;
      p.speed = active ? (0.004 + Math.random() * 0.004) : 0.001;
    });
  });
}

function flyToNode(targetPos) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endPos = targetPos.clone().add(dir.multiplyScalar(3.2));
  let t = 0;

  controls.autoRotate = false;
  (function tick() {
    t = Math.min(t + 0.028, 1);
    const e = 1 - Math.pow(1 - t, 3); // cubic ease-out
    camera.position.lerpVectors(startPos, endPos, e);
    controls.target.lerpVectors(startTarget, targetPos, e);
    if (t < 1) requestAnimationFrame(tick);
    else controls.autoRotate = true;
  })();
}

// ── SPIKE ANIMATIONS ──────────────────────────────────────────────────────────
function spawnSpike(co, fromId) {
  const forward = co.c.from === fromId;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 6, 6),
    new THREE.MeshBasicMaterial({ color: co.blended, transparent: true, opacity: 1.0 })
  );
  mesh.renderOrder = 4;
  scene.add(mesh);
  spikes.push({ curve: co.curve, t: forward ? 0 : 1, dir: forward ? 1 : -1, speed: 0.022 + Math.random() * 0.014, mesh });
}

function triggerRandomSpike() {
  if (!connObjs.length) return;
  const co = connObjs[Math.floor(Math.random() * connObjs.length)];
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.013, 6, 6),
    new THREE.MeshBasicMaterial({ color: co.blended, transparent: true, opacity: 1.0 })
  );
  mesh.renderOrder = 4;
  scene.add(mesh);
  spikes.push({ curve: co.curve, t: 0, dir: 1, speed: 0.018 + Math.random() * 0.012, mesh });
  fireCount++;
  document.getElementById('hud-fires').textContent = fireCount;
}

// ── INTERACTION ───────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-9, -9);
const tooltip = document.getElementById('tooltip');
let _ptrDirty = false;

window.addEventListener('pointermove', e => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top = (e.clientY - 10) + 'px';
  _ptrDirty = true;
});

canvas.addEventListener('click', () => { if (hoveredId) selectRegion(hoveredId); });

function checkHover() {
  if (!_ptrDirty) return;
  _ptrDirty = false;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(Object.values(nodes).map(n => n.core));
  if (hits.length) {
    const id = hits[0].object.userData.regionId;
    if (id !== hoveredId) {
      hoveredId = id;
      tooltip.textContent = regionById[id].label;
      tooltip.classList.add('show');
      canvas.style.cursor = 'pointer';
    }
  } else if (hoveredId) {
    hoveredId = null;
    tooltip.classList.remove('show');
    canvas.style.cursor = 'default';
  }
}

// ── RESIZE ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── ANIMATE ───────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  controls.update();
  checkHover();

  // Pulse nodes
  Object.values(nodes).forEach(no => {
    const r = no.region;
    // Frequency-driven pulse
    const pulse = 1 + 0.18 * Math.sin(t * r.hz * 0.12 + r.hz * 0.4);
    no.glow.material.opacity = (
      no.region.id === selectedId ? 0.2 :
      no.region.id === hoveredId  ? 0.14 :
      (selectedId ? 0.04 : 0.09)
    ) * pulse;

    // Orbit ring spin — speed proportional to Hz
    no.ring.rotation.y += 0.002 * (r.hz / 10);
    no.ring.rotation.x += 0.001 * (r.hz / 10);

    // Subtle scale breathe when nothing selected
    if (!selectedId) {
      no.core.scale.setScalar(0.92 + 0.1 * Math.sin(t * r.activity * 2 + r.hz));
    }
  });

  // Advance particles along connections
  connObjs.forEach(co => {
    co.particles.forEach(p => {
      p.t = (p.t + p.speed) % 1;
      co.curve.getPoint(p.t, p.mesh.position);
    });
  });

  // Advance spikes
  for (let i = spikes.length - 1; i >= 0; i--) {
    const s = spikes[i];
    s.t += s.speed * s.dir;
    const done = s.dir > 0 ? s.t >= 1 : s.t <= 0;
    if (done) {
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      spikes.splice(i, 1);
    } else {
      s.curve.getPoint(Math.max(0, Math.min(1, s.t)), s.mesh.position);
      s.mesh.material.opacity = 1 - Math.abs(s.t - 0.5) * 1.4;
      const sc = 1 + 0.5 * Math.sin(s.t * Math.PI);
      s.mesh.scale.setScalar(sc);
    }
  }

  // Random synapse fires (~every 0.7s)
  if (t - lastSpikeT > 0.55 + Math.random() * 0.45) {
    triggerRandomSpike();
    lastSpikeT = t;
  }

  // Gently breathe lights
  keyLight.intensity = 9 + 2.5 * Math.sin(t * 0.6);
  fillLight.intensity = 5 + 1.5 * Math.sin(t * 0.45 + 1.2);

  renderer.render(scene, camera);
}

animate();
