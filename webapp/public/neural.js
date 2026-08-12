// neural.js — ARCHSAGE White Matter Tractography
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ── TRACT GROUPS ──────────────────────────────────────────────────────────────
const GROUPS = {
  commissural: { label: 'Commissural',  color: '#c7e3ff' },
  association:  { label: 'Association', color: '#facc15' },
  projection:   { label: 'Projection',  color: '#4ade80' },
  limbic:       { label: 'Limbic',      color: '#a78bfa' },
  cerebellar:   { label: 'Cerebellar',  color: '#2dd4bf' },
  brainstem:    { label: 'Brainstem',   color: '#c084fc' },
};

// ── WHITE MATTER TRACTS ───────────────────────────────────────────────────────
// spine[] = normalized waypoints in brain space [-1…1]: x=right y=up z=anterior
// spread  = perpendicular scatter of fibers (fraction of brain half-extent)
const TRACTS = [
  // ── COMMISSURAL ───────────────────────────────────────────────────────────
  { id:'cc_genu', label:'Corpus Callosum — Genu', abbr:'CC-G', group:'commissural',
    connects:'Left Prefrontal ↔ Right Prefrontal',
    desc:'Interhemispheric connection of the prefrontal cortices. Synchronizes executive function, decision making, and working memory across hemispheres. First fiber system affected in traumatic brain injury.',
    spine:[[-0.74,0.42,0.52],[-0.36,0.52,0.50],[0,0.56,0.48],[0.36,0.52,0.50],[0.74,0.42,0.52]],
    spread:0.14, fiberCount:70 },

  { id:'cc_body', label:'Corpus Callosum — Body', abbr:'CC-B', group:'commissural',
    connects:'Left Motor/Sensory Cortex ↔ Right Motor/Sensory Cortex',
    desc:'Bridges primary motor and somatosensory cortices bilaterally. Synchronizes movement and touch processing. The thickest section of the corpus callosum.',
    spine:[[-0.74,0.68,0.13],[-0.36,0.76,0.12],[0,0.80,0.10],[0.36,0.76,0.12],[0.74,0.68,0.13]],
    spread:0.14, fiberCount:75 },

  { id:'cc_splenium', label:'Corpus Callosum — Splenium', abbr:'CC-S', group:'commissural',
    connects:'Left Parieto-Occipital ↔ Right Parieto-Occipital',
    desc:'Connects parietal, temporal, and occipital cortices across hemispheres. Coordinates visual and visuospatial processing. Largest subdivision of the corpus callosum.',
    spine:[[-0.70,0.42,-0.38],[-0.33,0.52,-0.44],[0,0.55,-0.47],[0.33,0.52,-0.44],[0.70,0.42,-0.38]],
    spread:0.15, fiberCount:68 },

  // ── ASSOCIATION ───────────────────────────────────────────────────────────
  { id:'slf', label:'Superior Longitudinal Fasciculus', abbr:'SLF', group:'association',
    connects:'Frontal Lobe ↔ Parieto-Occipital',
    desc:'The brain\'s primary long-range association bundle. Runs from the frontal lobe to the parietal, temporal, and occipital regions. Critical for language, spatial attention, and working memory. Three subdivisions: SLF I, II, III.',
    spine:[[0.57,0.55,0.55],[0.61,0.63,0.22],[0.63,0.65,-0.10],[0.61,0.60,-0.40],[0.55,0.50,-0.62]],
    spread:0.13, fiberCount:68 },

  { id:'af', label:'Arcuate Fasciculus', abbr:'AF', group:'association',
    connects:"Broca's Area ↔ Wernicke's Area",
    desc:"The language superhighway. Arcs around the Sylvian fissure connecting Broca's expressive language area to Wernicke's receptive area. Damage causes conduction aphasia — intact comprehension and production but inability to repeat.",
    spine:[[-0.62,0.33,0.45],[-0.71,0.43,0.24],[-0.75,0.53,0.01],[-0.73,0.51,-0.21],[-0.66,0.36,-0.30]],
    spread:0.09, fiberCount:50 },

  { id:'ilf', label:'Inferior Longitudinal Fasciculus', abbr:'ILF', group:'association',
    connects:'Occipital Cortex ↔ Temporal Pole',
    desc:'Connects occipital visual cortex to the temporal pole. Carries visual-semantic signals to memory and identity systems. Damaged in prosopagnosia (face blindness) and semantic dementia.',
    spine:[[0.56,0.10,-0.62],[0.63,-0.04,-0.40],[0.66,-0.08,-0.14],[0.63,-0.06,0.15],[0.57,-0.08,0.42]],
    spread:0.09, fiberCount:44 },

  { id:'uncinate', label:'Uncinate Fasciculus', abbr:'UF', group:'association',
    connects:'Orbitofrontal Cortex ↔ Temporal Pole & Amygdala',
    desc:'Hooks under the Sylvian fissure connecting orbitofrontal cortex to the temporal pole and amygdala. Carries emotional memory and social behavior signals. Implicated in depression, schizophrenia, and antisocial behavior.',
    spine:[[0.28,0.02,0.80],[0.50,0.09,0.62],[0.61,0.06,0.42],[0.61,-0.06,0.20]],
    spread:0.10, fiberCount:40 },

  { id:'cingulum', label:'Cingulum Bundle', abbr:'CB', group:'association',
    connects:'Frontal Lobe ↔ Parahippocampal Gyrus (via Cingulate)',
    desc:'Curved bundle running along the cingulate gyrus from the frontal lobe to the parahippocampal region. Key node of the default mode network, episodic memory retrieval, and emotional regulation. Often reduced in depression and Alzheimer\'s.',
    spine:[[0.10,0.35,0.62],[0.06,0.52,0.44],[0.04,0.62,0.18],[0.04,0.60,-0.15],[0.07,0.50,-0.38],[0.17,0.30,-0.40]],
    spread:0.08, fiberCount:45 },

  { id:'ifof', label:'Inf. Fronto-Occipital Fasciculus', abbr:'IFOF', group:'association',
    connects:'Frontal Cortex ↔ Occipital Cortex (deep route)',
    desc:'Runs deep beneath the SLF connecting frontal cortex directly to occipital cortex. Longest white matter tract. Role in visual semantics, reading, and face/object recognition. Runs through the external capsule.',
    spine:[[0.47,0.22,0.58],[0.52,0.18,0.30],[0.53,0.15,0.02],[0.51,0.12,-0.30],[0.45,0.12,-0.62]],
    spread:0.10, fiberCount:50 },

  // ── PROJECTION ────────────────────────────────────────────────────────────
  { id:'cst_l', label:'Corticospinal Tract (Left)', abbr:'CST-L', group:'projection',
    connects:'Left Primary Motor Cortex → Brainstem / Spinal Cord',
    desc:'Carries voluntary motor commands from left M1 through the corona radiata and posterior internal capsule to the brainstem and contralateral spinal cord. Damage causes upper motor neuron syndrome.',
    spine:[[-0.38,0.88,0.10],[-0.28,0.65,0.08],[-0.16,0.40,0.04],[-0.10,0.14,0.02],[-0.07,-0.24,0.00],[-0.06,-0.56,-0.20]],
    spread:0.08, fiberCount:55 },

  { id:'cst_r', label:'Corticospinal Tract (Right)', abbr:'CST-R', group:'projection',
    connects:'Right Primary Motor Cortex → Brainstem / Spinal Cord',
    desc:'Carries voluntary motor commands from right M1. Decussates (crosses) in the pyramidal decussation of the medulla — right hemisphere controls left body. Most direct voluntary motor pathway.',
    spine:[[0.38,0.88,0.10],[0.28,0.65,0.08],[0.16,0.40,0.04],[0.10,0.14,0.02],[0.07,-0.24,0.00],[0.06,-0.56,-0.20]],
    spread:0.08, fiberCount:55 },

  { id:'thalamocort', label:'Thalamocortical Radiations', abbr:'TCR', group:'projection',
    connects:'Thalamic Nuclei → Entire Cortical Mantle',
    desc:'Massive fan of projection fibers from every thalamic relay nucleus to all cortical areas. Every sensory signal, motor planning relay, and cognitive signal passes through this system. The brain\'s central switching network.',
    spine:[[0.12,0.06,0.04],[0.30,0.28,0.14],[0.50,0.50,0.28],[0.60,0.66,0.42]],
    spread:0.23, fiberCount:85 },

  { id:'optic_rad', label:'Optic Radiations', abbr:'OR', group:'projection',
    connects:'Lateral Geniculate Nucleus → Primary Visual Cortex (V1)',
    desc:'Fans from the LGN to V1 in the occipital pole. Meyer\'s loop dips into the temporal lobe — a critical surgical landmark. Carries the contralateral visual hemifield. Damage causes visual field defects (quadrantanopia).',
    spine:[[0.22,0.02,-0.18],[0.28,0.04,-0.40],[0.21,0.12,-0.62],[0.10,0.24,-0.80],[0.04,0.28,-0.92]],
    spread:0.10, fiberCount:44 },

  // ── LIMBIC ────────────────────────────────────────────────────────────────
  { id:'fornix', label:'Fornix', abbr:'FX', group:'limbic',
    connects:'Hippocampus → Mammillary Bodies / Hypothalamus / Septum',
    desc:'C-shaped fiber bundle and primary output tract of the hippocampus. Carries episodic memory signals to the mammillary bodies, hypothalamus, and septal nuclei. Bilateral transection causes severe anterograde amnesia.',
    spine:[[0.30,-0.32,-0.10],[0.22,-0.14,-0.02],[0.12,0.00,0.08],[0.05,0.10,0.20],[0.03,0.08,0.36],[0.06,-0.12,0.38]],
    spread:0.06, fiberCount:34 },

  { id:'stria_term', label:'Stria Terminalis', abbr:'ST', group:'limbic',
    connects:'Amygdala → Bed Nucleus / Hypothalamus',
    desc:'Runs along the caudate nucleus connecting amygdala to the bed nucleus of the stria terminalis and hypothalamus. Major anatomical route for fear signal cascade and stress hormone (CRF) release.',
    spine:[[0.38,-0.20,0.26],[0.28,-0.10,0.20],[0.18,-0.02,0.14],[0.10,-0.09,0.20],[0.06,-0.13,0.18]],
    spread:0.06, fiberCount:26 },

  // ── CEREBELLAR ────────────────────────────────────────────────────────────
  { id:'scp', label:'Superior Cerebellar Peduncle', abbr:'SCP', group:'cerebellar',
    connects:'Dentate Nucleus → VL Thalamus & Red Nucleus',
    desc:'Primary OUTPUT pathway of the cerebellum. Carries error-corrected motor signals from the dentate nucleus to the VL thalamus and red nucleus. Decussates in the midbrain. Damaged in spinocerebellar ataxias.',
    spine:[[0.18,-0.72,-0.72],[0.14,-0.57,-0.56],[0.10,-0.42,-0.40],[0.08,-0.27,-0.22],[0.12,-0.07,-0.08],[0.14,0.04,0.04]],
    spread:0.07, fiberCount:38 },

  { id:'mcp', label:'Middle Cerebellar Peduncle', abbr:'MCP', group:'cerebellar',
    connects:'Pontine Nuclei → Cerebellar Cortex',
    desc:'Largest cerebellar peduncle and largest white matter pathway in the brain. Carries corticopontocerebellar fibers from the frontal and parietal cortex through pons into the cerebellar cortex for voluntary motor refinement.',
    spine:[[0.08,-0.60,-0.22],[0.11,-0.64,-0.40],[0.14,-0.68,-0.55],[0.17,-0.71,-0.65]],
    spread:0.12, fiberCount:48 },

  // ── BRAINSTEM ─────────────────────────────────────────────────────────────
  { id:'mlf', label:'Medial Longitudinal Fasciculus', abbr:'MLF', group:'brainstem',
    connects:'Oculomotor Nuclei ↔ Brainstem / Cervical Cord',
    desc:'Coordinates conjugate eye movements by linking oculomotor, trochlear, and abducens nuclei. Damage causes internuclear ophthalmoplegia (INO) — a hallmark sign of multiple sclerosis.',
    spine:[[0.03,-0.25,-0.18],[0.02,-0.40,-0.24],[0.02,-0.55,-0.30],[0.02,-0.71,-0.38]],
    spread:0.04, fiberCount:24 },

  { id:'med_lem', label:'Medial Lemniscus', abbr:'ML', group:'brainstem',
    connects:'Dorsal Column Nuclei (Medulla) → VPL Thalamus',
    desc:'Ascends from gracile and cuneate nuclei to the VPL thalamus. Carries fine touch, vibration, and proprioception from the body. Decussates at the sensory decussation just above the pyramidal decussation.',
    spine:[[0.08,-0.78,-0.48],[0.10,-0.64,-0.40],[0.12,-0.50,-0.32],[0.14,-0.34,-0.22],[0.18,-0.18,-0.12],[0.20,-0.02,-0.10]],
    spread:0.05, fiberCount:30 },
];

const TRACT_BY_ID = Object.fromEntries(TRACTS.map(t => [t.id, t]));

// ── RENDERER ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('neural-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

// ── SCENE ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050810);
scene.fog = new THREE.FogExp2(0x050810, 0.048);

const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.01, 200);
camera.position.set(0, 0.3, 5.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.0;
controls.maxDistance = 14;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.25;

// ── LIGHTS ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x0a1525, 4));
const keyLight  = new THREE.PointLight(0x7ec8f8, 6, 14);
keyLight.position.set(3, 3, 3);
scene.add(keyLight);
const fillLight = new THREE.PointLight(0x9b7dff, 4, 12);
fillLight.position.set(-3, -2, -3);
scene.add(fillLight);
const rimLight  = new THREE.PointLight(0xffaa55, 2, 10);
rimLight.position.set(0, -3, 1);
scene.add(rimLight);

// ── STARS ─────────────────────────────────────────────────────────────────────
{
  const n = 2000, pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 120;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x1a3050, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.5 })));
}

// ── GRID ──────────────────────────────────────────────────────────────────────
{
  const grid = new THREE.GridHelper(28, 28, 0x0c1828, 0x0c1828);
  grid.position.y = -2.5;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);
}

// ── SCAN PLANE ────────────────────────────────────────────────────────────────
const scanMat   = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0, side: THREE.DoubleSide });
const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), scanMat);
scanPlane.rotation.x = Math.PI / 2;
scene.add(scanPlane);

// ── PULSE GEOMETRY (shared) ───────────────────────────────────────────────────
const pulseGeo = new THREE.SphereGeometry(0.012, 5, 5);

// ── STATE ─────────────────────────────────────────────────────────────────────
const tractObjs  = {};  // id → { tract, mesh, mat, curves, hitSphere }
const pulses     = [];  // active pulse animations { curve, t, speed, mesh }
let selectedId   = null;
let hoveredId    = null;
let activeGroup  = null;
let pulseCount   = 0;
let lastPulseT   = 0;

// ── LOAD BRAIN ────────────────────────────────────────────────────────────────
new GLTFLoader().load(
  '/models/brain%20human.glb',
  onBrainLoaded,
  xhr => {
    if (xhr.total > 0) {
      const p = Math.round(xhr.loaded / xhr.total * 100);
      document.getElementById('loader-bar').style.width  = p + '%';
      document.getElementById('loader-pct').textContent  = p + '%';
    }
  },
  err => {
    console.error(err);
    document.getElementById('loader-error').style.display = 'block';
    document.getElementById('loader-bar').parentElement.style.display = 'none';
    document.getElementById('loader-pct').style.display   = 'none';
  }
);

function onBrainLoaded(gltf) {
  const model = gltf.scene;

  // Brain shell — ultra-transparent reference only, not the main visual
  model.traverse(child => {
    if (!child.isMesh) return;
    child.material = new THREE.MeshPhongMaterial({
      color: 0x0a1e3a, emissive: 0x030810, specular: 0x142840,
      shininess: 60, transparent: true, opacity: 0.07,
      side: THREE.FrontSide, depthWrite: false,
    });
    child.renderOrder = 0;
  });

  // Normalize brain to 2-unit height, centered at origin
  const box  = new THREE.Box3().setFromObject(model);
  const sz   = box.getSize(new THREE.Vector3());
  const ctr  = box.getCenter(new THREE.Vector3());
  const s    = 2.0 / Math.max(sz.x, sz.y, sz.z);
  model.scale.setScalar(s);
  model.position.sub(ctr.multiplyScalar(s));
  scene.add(model);

  // Wireframe overlay — faint brain surface lines
  const wireModel = model.clone(true);
  wireModel.traverse(child => {
    if (!child.isMesh) return;
    child.material = new THREE.MeshBasicMaterial({
      color: 0x1a3a5e, wireframe: true, transparent: true, opacity: 0.06,
    });
    child.renderOrder = 0;
  });
  scene.add(wireModel);

  const box2   = new THREE.Box3().setFromObject(model);
  const center = box2.getCenter(new THREE.Vector3());
  const size   = box2.getSize(new THREE.Vector3());

  buildTracts(center, size);
  buildGroupBar();
  playScan(box2);

  document.getElementById('hud-syn').textContent   = TRACTS.length;
  document.getElementById('hud-nodes').textContent = TRACTS.reduce((s, t) => s + t.fiberCount, 0);

  setTimeout(() => {
    const el = document.getElementById('loader');
    el.classList.add('hidden');
    setTimeout(() => el.remove(), 750);
  }, 500);
}

// ── BUILD FIBER TRACTS ────────────────────────────────────────────────────────
function buildTracts(center, size) {
  const half    = size.clone().multiplyScalar(0.5);
  const minHalf = Math.min(half.x, half.y, half.z);

  TRACTS.forEach(tract => {
    // Convert spine to world coordinates
    const worldSpine = tract.spine.map(p => new THREE.Vector3(
      center.x + p[0] * half.x,
      center.y + p[1] * half.y,
      center.z + p[2] * half.z,
    ));

    const spreadW = tract.spread * minHalf;
    const col     = new THREE.Color(GROUPS[tract.group].color);
    const curves  = [];
    const geos    = [];

    for (let i = 0; i < tract.fiberCount; i++) {
      // Perpendicular scatter vector (constant per fiber, varies smoothly)
      const ox = (Math.random() - 0.5) * 2;
      const oy = (Math.random() - 0.5) * 1.5;
      const oz = (Math.random() - 0.5) * 2;

      // Random fiber length (creates natural bundle tapering)
      const t0 = Math.random() * 0.05;
      const t1 = 1 - Math.random() * 0.05;

      // Sample uniformly along [t0,t1] of the spine
      const nPts = Math.max(worldSpine.length + 2, 6);
      const pts  = [];
      for (let j = 0; j < nPts; j++) {
        const u    = t0 + (t1 - t0) * (j / (nPts - 1));
        const segF = u * (worldSpine.length - 1);
        const segI = Math.min(Math.floor(segF), worldSpine.length - 2);
        const segT = segF - segI;
        const base = worldSpine[segI].clone().lerp(worldSpine[segI + 1], segT);
        // Taper off at ends so bundle has tapered end caps
        const taper = Math.sin(Math.PI * u);
        pts.push(new THREE.Vector3(
          base.x + ox * spreadW * taper,
          base.y + oy * spreadW * 0.65 * taper,
          base.z + oz * spreadW * taper,
        ));
      }

      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
      curves.push(curve);

      // Slight color variation per fiber for depth/richness
      const fCol = col.clone().offsetHSL(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.12,
        (Math.random() - 0.5) * 0.10,
      );
      const geo = new THREE.TubeGeometry(curve, 10, 0.0038, 3, false);
      // Tag geometry verts with color (mergeGeometries needs uniform attributes — set via material)
      geo.userData.color = fCol;
      geos.push(geo);
    }

    // Merge all fiber geometries into a single draw call
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());

    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.72,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.userData.tractId = tract.id;
    mesh.renderOrder = 2;
    scene.add(mesh);

    // Invisible hit sphere at tract geometric center for fast picking
    const midWorld = worldSpine.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(worldSpine.length);
    const hitSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 5, 5),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitSphere.position.copy(midWorld);
    hitSphere.userData.tractId = tract.id;
    scene.add(hitSphere);

    tractObjs[tract.id] = { tract, mesh, mat, curves, hitSphere, midWorld };
  });
}

// ── SCAN ANIMATION ────────────────────────────────────────────────────────────
function playScan(box) {
  const minY = box.min.y - 0.3, maxY = box.max.y + 0.3;
  scanPlane.position.y = minY;
  let start = null;
  (function tick(ts) {
    if (!start) start = ts;
    const frac = Math.min((ts - start) / 2400, 1);
    scanPlane.position.y = minY + (maxY - minY) * frac;
    scanMat.opacity = 0.10 * Math.sin(frac * Math.PI);
    if (frac < 1) requestAnimationFrame(tick); else scanMat.opacity = 0;
  })(performance.now());
}

// ── GROUP FILTER BAR ──────────────────────────────────────────────────────────
function buildGroupBar() {
  const bar = document.getElementById('region-bar');
  bar.innerHTML = '';

  const allBtn = document.createElement('div');
  allBtn.className = 'r-chip active';
  allBtn.dataset.group = '';
  allBtn.textContent = 'ALL TRACTS';
  allBtn.addEventListener('click', () => setGroup(null));
  bar.appendChild(allBtn);

  Object.entries(GROUPS).forEach(([key, g]) => {
    const btn = document.createElement('div');
    btn.className = 'r-chip';
    btn.dataset.group = key;
    btn.innerHTML = `<div class="r-chip-dot" style="background:${g.color}"></div>${g.label}`;
    btn.addEventListener('click', () => setGroup(key));
    bar.appendChild(btn);
  });
}

function setGroup(group) {
  activeGroup = group;
  selectedId  = null;
  document.getElementById('info-panel').classList.remove('visible');

  document.querySelectorAll('#region-bar .r-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.group === (group || ''));
  });

  Object.values(tractObjs).forEach(to => {
    const show = !group || to.tract.group === group;
    to.mesh.visible       = show;
    to.hitSphere.visible  = false;
    if (show) { to.mat.opacity = 0.72; to.mat.color.set(GROUPS[to.tract.group].color); }
  });
}

// ── TRACT SELECTION ───────────────────────────────────────────────────────────
function selectTract(id) {
  selectedId = id;
  const tract = TRACT_BY_ID[id];
  if (!tract) return;

  const g = GROUPS[tract.group];
  const panel = document.getElementById('info-panel');
  panel.style.setProperty('--rcolor', g.color);

  document.getElementById('info-abbr').textContent = tract.abbr;
  document.getElementById('info-name').textContent  = tract.label;
  document.getElementById('info-role').textContent  = tract.connects;
  document.getElementById('info-hz').textContent    = g.label;
  document.getElementById('info-act').textContent   = tract.fiberCount;

  const bar = document.getElementById('act-bar');
  const maxFibers = Math.max(...TRACTS.map(t => t.fiberCount));
  bar.style.width      = (tract.fiberCount / maxFibers * 100) + '%';
  bar.style.background = g.color;
  bar.style.boxShadow  = `0 0 8px ${g.color}`;

  document.getElementById('info-desc').textContent = tract.desc;

  // Repurpose connections section for tract path endpoints
  const connsEl = document.getElementById('info-conns');
  connsEl.innerHTML = '';
  const endEl = document.createElement('div');
  endEl.className = 'conn-item';
  endEl.innerHTML = `<span class="conn-arrow">↔</span><div class="conn-dot" style="background:${g.color}"></div><span style="color:#9ca3af;font-size:10px">${tract.connects}</span>`;
  connsEl.appendChild(endEl);

  panel.classList.add('visible');
  drawFreqRing(tract.fiberCount, g.color, tract.fiberCount / maxFibers);
  applyTractHighlight(id);
  flyToTract(tractObjs[id].midWorld);

  // Burst 3 pulses along this tract's fibers
  const to = tractObjs[id];
  for (let i = 0; i < 3; i++) {
    spawnPulse(to.curves[Math.floor(Math.random() * to.curves.length)], g.color);
  }
}

function applyTractHighlight(activeId) {
  Object.values(tractObjs).forEach(to => {
    const isActive = to.tract.id === activeId;
    to.mesh.visible      = isActive || !activeGroup || to.tract.group === activeGroup;
    if (to.mesh.visible) {
      to.mat.opacity = isActive ? 0.95 : 0.10;
      to.mat.color.set(isActive ? GROUPS[to.tract.group].color : '#1a2a3a');
    }
  });
}

function flyToTract(target) {
  const sp = camera.position.clone(), st = controls.target.clone();
  const ep = target.clone().add(sp.clone().sub(st).normalize().multiplyScalar(3.8));
  let t = 0;
  controls.autoRotate = false;
  (function tick() {
    t = Math.min(t + 0.024, 1);
    const e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(sp, ep, e);
    controls.target.lerpVectors(st, target, e);
    if (t < 1) requestAnimationFrame(tick); else controls.autoRotate = true;
  })();
}

// ── FREQ RING (repurposed for fiber density) ──────────────────────────────────
const freqCanvas = document.getElementById('freq-ring');
const freqCtx    = freqCanvas.getContext('2d');

function drawFreqRing(count, color, fraction) {
  const cx = 45, cy = 45, r = 34;
  freqCtx.clearRect(0, 0, 90, 90);
  freqCtx.beginPath(); freqCtx.arc(cx, cy, r, 0, Math.PI * 2);
  freqCtx.strokeStyle = '#1c2333'; freqCtx.lineWidth = 4; freqCtx.stroke();
  freqCtx.beginPath();
  freqCtx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
  freqCtx.strokeStyle = color; freqCtx.shadowBlur = 10; freqCtx.shadowColor = color;
  freqCtx.lineWidth = 4; freqCtx.stroke(); freqCtx.shadowBlur = 0;
  freqCtx.fillStyle = color; freqCtx.font = 'bold 12px monospace';
  freqCtx.textAlign = 'center'; freqCtx.textBaseline = 'middle';
  freqCtx.fillText(count + 'f', cx, cy);
}

// ── PULSE ANIMATIONS ──────────────────────────────────────────────────────────
function spawnPulse(curve, color) {
  if (pulses.length >= 12) return;
  const mat  = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 1.0 });
  const mesh = new THREE.Mesh(pulseGeo, mat);
  mesh.renderOrder = 4;
  scene.add(mesh);
  pulses.push({ curve, t: 0, speed: 0.014 + Math.random() * 0.01, mesh });
}

function triggerRandomPulse() {
  const visible = Object.values(tractObjs).filter(to => to.mesh.visible);
  if (!visible.length) return;
  const to   = visible[Math.floor(Math.random() * visible.length)];
  const curve = to.curves[Math.floor(Math.random() * to.curves.length)];
  spawnPulse(curve, GROUPS[to.tract.group].color);
  pulseCount++;
  document.getElementById('hud-fires').textContent = pulseCount;
}

// ── INTERACTION ───────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2(-9, -9);
const tooltip   = document.getElementById('tooltip');
let _ptrDirty   = false;

window.addEventListener('pointermove', e => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top  = (e.clientY - 10)  + 'px';
  _ptrDirty = true;
});

canvas.addEventListener('click', () => { if (hoveredId) selectTract(hoveredId); });

function checkHover() {
  if (!_ptrDirty) return;
  _ptrDirty = false;
  raycaster.setFromCamera(pointer, camera);

  // Raycast against actual tract meshes (merged geometry, accurate)
  const meshes = Object.values(tractObjs).filter(to => to.mesh.visible).map(to => to.mesh);
  const hits   = raycaster.intersectObjects(meshes, false);

  if (hits.length) {
    const id = hits[0].object.userData.tractId;
    if (id !== hoveredId) {
      hoveredId = id;
      tooltip.textContent = TRACT_BY_ID[id].label;
      tooltip.classList.add('show');
      canvas.style.cursor = 'pointer';
    }
  } else if (hoveredId) {
    hoveredId = null;
    tooltip.classList.remove('show');
    canvas.style.cursor = 'default';
  }
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── ANIMATION LOOP ────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  controls.update();
  checkHover();

  // Subtle opacity breathing per tract — each group breathes at different rate
  if (!selectedId) {
    Object.values(tractObjs).forEach(to => {
      if (!to.mesh.visible) return;
      const rate  = to.tract.group === 'commissural' ? 0.4 :
                    to.tract.group === 'association'  ? 0.55 :
                    to.tract.group === 'projection'   ? 0.7  :
                    to.tract.group === 'limbic'        ? 0.35 : 0.5;
      const phase = (to.tract.fiberCount % 7) * 0.9;
      to.mat.opacity = 0.62 + 0.14 * Math.sin(t * rate + phase);
    });
  }

  // Hover highlight
  if (hoveredId && !selectedId) {
    const to = tractObjs[hoveredId];
    if (to && to.mesh.visible) to.mat.opacity = 0.95;
  }

  // Advance pulses
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.t += p.speed;
    if (p.t >= 1) {
      scene.remove(p.mesh); p.mesh.material.dispose(); pulses.splice(i, 1);
    } else {
      p.curve.getPoint(p.t, p.mesh.position);
      // Pulse brightens and shrinks at ends
      const intensity = Math.sin(p.t * Math.PI);
      p.mesh.material.opacity  = 0.6 + 0.4 * intensity;
      p.mesh.scale.setScalar(0.6 + 0.8 * intensity);
    }
  }

  // Spawn random pulses through visible tracts
  if (t - lastPulseT > 0.45 + Math.random() * 0.4) {
    triggerRandomPulse();
    lastPulseT = t;
  }

  // Lights breathe
  keyLight.intensity  = 6  + 1.8 * Math.sin(t * 0.55);
  fillLight.intensity = 3.5 + 1.2 * Math.sin(t * 0.40 + 1.2);

  renderer.render(scene, camera);
}

animate();
