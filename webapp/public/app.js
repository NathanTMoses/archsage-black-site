// ── Constants ────────────────────────────────────────────────────
const LEVEL_COLORS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];
const LEVEL_LABELS = ['ROOT', 'L1', 'L2', 'L3', 'L4', 'L5'];
const DIM_COLOR    = '#111823';

// ── State ────────────────────────────────────────────────────────
let chart       = null;
let treeData    = null;
let ancestryIds = new Set();
let personNodes = []; // pre-fetched nodeId per person index

// ── Tree highlight ───────────────────────────────────────────────
function applyHighlights(node) {
  const hit   = ancestryIds.has(node.value);
  const d     = node.depth || 0;
  const hasSelection = ancestryIds.size > 0;

  if (hit) {
    node.itemStyle = {
      color:       LEVEL_COLORS[d % 6],
      borderColor: '#ffffff',
      borderWidth: 2,
      shadowBlur:  28,
      shadowColor: LEVEL_COLORS[d % 6],
      opacity:     1,
    };
    node.symbolSize = [14, 10];
  } else {
    node.itemStyle = {
      color:       hasSelection ? DIM_COLOR : LEVEL_COLORS[d % 6],
      borderColor: '#0b0f14',
      borderWidth: 0,
      shadowBlur:  0,
      shadowColor: 'transparent',
      opacity:     hasSelection ? 0.25 : 1,
    };
    node.symbolSize = [6, 6];
  }
  for (const c of node.children || []) applyHighlights(c);
}

function refreshHighlights() {
  if (!chart || !treeData) return;
  applyHighlights(treeData);
  chart.setOption({ series: [{ data: [treeData] }] }, false);
}

// ── People list ──────────────────────────────────────────────────
function renderPeople(people) {
  document.getElementById('people-count').textContent = `${people.length} CONTACTS`;
  const list = document.getElementById('people-list');
  people.forEach((person, idx) => {
    const item = document.createElement('div');
    item.className = 'person-item';
    item.innerHTML = `
      <div class="person-name">${person.name}</div>
      <div class="person-meta">${person.title} &middot; ${person.company}</div>
    `;
    item.addEventListener('click', () => {
      document.querySelectorAll('.person-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      onPersonSelect(person, idx);
    });
    list.appendChild(item);
  });
}

// ── Message trail ────────────────────────────────────────────────
async function onPersonSelect(person, idx) {
  const panel = document.getElementById('right-content');
  panel.innerHTML = `<div class="loading-msg"><div class="spinner"></div>Mapping intelligence thread&hellip;</div>`;

  try {
    // 1. Get this person's assigned level-5 node
    const nodeId = personNodes[idx];
    if (!nodeId) throw new Error('No node mapped for this person.');

    // 2. Fetch ancestry chain
    const chain = await fetch(`/api/ancestry/${nodeId}`).then(r => r.json());

    // 3. Highlight tree
    ancestryIds = new Set(chain.map(n => n.id));
    refreshHighlights();
    document.getElementById('center-panel').classList.add('has-ancestry');

    // 4. Render trail + email placeholder
    panel.innerHTML = buildTrailHTML(person, chain) +
      `<div class="email-section">
         <div class="email-section-header">GENERATED OUTREACH</div>
         <div id="email-body-content">
           <div class="loading-msg"><div class="spinner"></div>Generating outreach&hellip;</div>
         </div>
       </div>`;

    // 5. Generate email in parallel with trail render
    generateEmail(person, chain);

  } catch (err) {
    panel.innerHTML = `<div class="email-error">Error: ${err.message}</div>`;
  }
}

function buildTrailHTML(person, chain) {
  const items = chain.map(node => `
    <div class="trail-item">
      <div class="trail-badge" style="background:${LEVEL_COLORS[node.depth % 6]};color:#0b0f14">
        ${LEVEL_LABELS[node.depth] || `L${node.depth}`}
      </div>
      <div class="trail-msg">${esc(node.message)}</div>
    </div>
  `).join('<div class="trail-arrow">&darr;</div>');

  return `
    <div class="trail-target">
      <div class="trail-target-name">${esc(person.name)}</div>
      <div class="trail-target-meta">${esc(person.title)} &middot; ${esc(person.company)}</div>
    </div>
    <div class="trail-list">${items}</div>
  `;
}

// ── Email generation ─────────────────────────────────────────────
async function generateEmail(person, ancestry) {
  const emailDiv = document.getElementById('email-body-content');
  if (!emailDiv) return;

  try {
    const res = await fetch('/api/generate-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person, ancestry }),
    });
    const { email, privateLink, error } = await res.json();
    if (error) throw new Error(error);

    const lines = email.split('\n');
    let subject = '', bodyStart = 0;
    if (lines[0].toLowerCase().startsWith('subject:')) {
      subject = lines[0].replace(/^subject:\s*/i, '').trim();
      bodyStart = lines[1] === '' ? 2 : 1;
    }
    const body = lines.slice(bodyStart).join('\n');

    emailDiv.innerHTML = `
      ${subject ? `<div class="email-subject">&#9993; ${esc(subject)}</div>` : ''}
      <pre class="email-body-text">${esc(body)}</pre>
      <div class="private-link-block">
        <span class="private-link-label">&#128274; PRIVATE ONE-TIME ACCESS LINK</span>
        <a class="private-link-url" href="${privateLink}" target="_blank">${privateLink}</a>
      </div>
    `;
  } catch (err) {
    if (emailDiv) emailDiv.innerHTML = `<div class="email-error">Error: ${err.message}</div>`;
  }
}

// ── Tree ─────────────────────────────────────────────────────────
function initTree(tree, total) {
  document.getElementById('node-count').textContent = `${total.toLocaleString()} NODES &middot; 6 LEVELS`;

  chart = echarts.init(document.getElementById('tree-container'), null, { renderer: 'canvas' });

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      formatter: p =>
        `<span style="font-size:10px;color:#6b7280;letter-spacing:.06em">` +
        `ID ${p.data.value} &nbsp;&bull;&nbsp; LEVEL ${p.data.depth}</span><br/>` +
        `<span style="font-size:12px;color:#f9fafb;line-height:1.5">${p.name}</span>`,
      backgroundColor: '#0d1117',
      borderColor: '#1c2333',
      padding: [10, 14],
      extraCssText: 'max-width:300px;white-space:normal;border-radius:6px',
    },
    series: [{
      type: 'tree',
      data: [tree],
      top: '5%', left: '2%', bottom: '3%', right: '2%',
      orient: 'TB',
      edgeShape: 'curve',
      symbol: 'rect',
      symbolSize: [8, 8],
      label: { show: false },
      itemStyle: { borderColor: '#0b0f14', borderWidth: 0 },
      lineStyle: { color: '#1a2535', curveness: 0.5, width: 1 },
      emphasis: { disabled: true },
      expandAndCollapse: true,
      initialTreeDepth: 2,
      animationDuration: 800,
      animationDurationUpdate: 600,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicInOut',
      roam: true,
      zoom: 1,
    }],
  });

  window.addEventListener('resize', () => chart.resize());
}

// ── Utils ────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Bootstrap ────────────────────────────────────────────────────
async function main() {
  const [{ total, tree }, people] = await Promise.all([
    fetch('/api/tree').then(r => r.json()),
    fetch('/api/people').then(r => r.json()),
  ]);

  treeData = tree;

  // Pre-fetch all person→node mappings in one burst
  personNodes = await Promise.all(
    people.map((_, i) => fetch(`/api/person-node/${i}`).then(r => r.json()).then(d => d.nodeId))
  );

  document.getElementById('node-count').innerHTML = `${total.toLocaleString()} NODES &middot; 6 LEVELS`;
  renderPeople(people);
  initTree(tree, total);
}

main();


