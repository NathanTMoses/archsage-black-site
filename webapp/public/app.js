// ── Constants ────────────────────────────────────────────────────
const LEVEL_COLORS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];
const LEVEL_LABELS = ['ROOT', 'L1', 'L2', 'L3', 'L4', 'L5'];

// ── State ────────────────────────────────────────────────────────
let chart           = null;
let treeData        = null;
let baseOption      = null;  // full initial chart option, reused for highlight rebuilds
let ancestryIds     = new Set();
let personNodes     = []; // pre-fetched nodeId per person index
let activePerson    = null;
let activePersonIdx = null;

// ── Tree highlight ───────────────────────────────────────────────
function applyHighlights(node) {
  const hit = ancestryIds.has(node.value);
  const d   = node.depth || 0;

  // Only mutate itemStyle — never symbolSize (changing symbolSize
  // forces ECharts to redo layout and corrupts its internal _edge
  // references, causing a null-property crash on the next setOption).
  if (hit) {
    node.itemStyle = {
      color:       LEVEL_COLORS[d % 6],
      borderColor: '#ffffff',
      borderWidth: 2,
      shadowBlur:  28,
      shadowColor: LEVEL_COLORS[d % 6],
      opacity:     1,
    };
  } else {
    // Always keep non-highlighted nodes fully visible at their level color.
    // Only the glow + white border on ancestry nodes makes them stand out —
    // never dim or hide the rest of the tree.
    node.itemStyle = {
      color:       LEVEL_COLORS[d % 6],
      borderColor: '#0b0f14',
      borderWidth: 0,
      shadowBlur:  0,
      shadowColor: 'transparent',
      opacity:     1,
    };
  }
  for (const c of node.children || []) applyHighlights(c);
}

// Creates plain-object copies of every tree node, stripping any internal
// ECharts properties (_edge, _index, etc.) that were grafted onto our
// original objects during the first render. ECharts crashes on setOption
// when it receives already-augmented objects in merge/notMerge modes alike.
function cloneForRender(node) {
  const clone = {
    name:  node.name,
    value: node.value,
    depth: node.depth,
  };
  if (node.itemStyle) clone.itemStyle = { ...node.itemStyle };
  if (node.children && node.children.length > 0)
    clone.children = node.children.map(cloneForRender);
  return clone;
}

function refreshHighlights() {
  if (!chart || !treeData || !baseOption) return;
  applyHighlights(treeData);                   // update styles on our master copy
  const freshTree = cloneForRender(treeData);  // strip ECharts-internal mutations
  chart.setOption(
    { ...baseOption, series: [{ ...baseOption.series[0], data: [freshTree] }] },
    { notMerge: true }
  );
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
  activePerson    = person;
  activePersonIdx = idx;
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

// ── Switch messaging path ───────────────────────────────────────
async function switchToNode(nodeId) {
  if (chart) chart.dispatchAction({ type: 'hideTip' });
  if (!activePerson) {
    // Flash a message in the right panel if no person is selected yet
    const panel = document.getElementById('right-content');
    const saved = panel.innerHTML;
    panel.innerHTML = '<div class="email-error" style="padding:16px">Select a contact on the left first, then choose a path.</div>';
    setTimeout(() => { panel.innerHTML = saved; }, 2500);
    return;
  }
  // Override this person’s assigned node and re-run the full selection flow
  personNodes[activePersonIdx] = nodeId;
  await onPersonSelect(activePerson, activePersonIdx);
}

// Global handler for the “USE THIS PATH” button rendered inside ECharts tooltips
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-change-node]');
  if (!btn) return;
  const nodeId = parseInt(btn.dataset.changeNode, 10);
  switchToNode(nodeId);
});

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

  baseOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      enterable: true,          // lets the pointer enter the tooltip so the button is clickable
      hideDelay: 300,
      formatter: p => {
        if (!p.data) return '';
        const d = p.data;
        const isLeaf = !d.children || d.children.length === 0;
        const pathBtn = isLeaf
          ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #1f2937">
               <button data-change-node="${d.value}"
                 style="background:#0f2535;border:1px solid #38bdf8;color:#38bdf8;
                        padding:5px 12px;border-radius:4px;font-size:10px;font-weight:700;
                        letter-spacing:.1em;cursor:pointer;font-family:inherit;
                        transition:background .15s">
                 &#8677; USE THIS PATH
               </button>
             </div>`
          : '';
        return `<span style="font-size:10px;color:#6b7280;letter-spacing:.06em">` +
               `ID ${d.value} &nbsp;&bull;&nbsp; LEVEL ${d.depth}</span><br/>` +
               `<span style="font-size:12px;color:#f9fafb;line-height:1.5">${d.name}</span>` +
               pathBtn;
      },
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
  };

  chart.setOption(baseOption);
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


