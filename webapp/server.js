/**
 * ARCHSAGE BLACK SITE — Node.js/Express backend.
 *
 * Endpoints:
 *   GET  /api/tree            — full 52,486-node hierarchy (loaded once at startup)
 *   GET  /api/people          — 50-person list from people.js
 *   POST /api/generate-email  — Gemini-powered cold email for a given person
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const fs = require('fs');
const path = require('path');
const people = require('./people');

const app = express();
const PORT = process.env.PORT || 3000;
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

app.use(express.json());

// ── Tree ──────────────────────────────────────────────────────────────────────
const LEVEL_FILL_COLORS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];

function transform(node, depth) {
  const colorIdx = depth % LEVEL_FILL_COLORS.length;
  return {
    name: node.message,
    value: node.id,
    depth,
    itemStyle: { color: LEVEL_FILL_COLORS[colorIdx], borderColor: '#0b0f14', borderWidth: 1 },
    children: (node.children || []).map((child) => transform(child, depth + 1)),
  };
}

function countNodes(node) {
  return 1 + (node.children || []).reduce((sum, c) => sum + countNodes(c), 0);
}

function loadTree() {
  const rootMetaPath = path.join(OUTPUT_DIR, '_root.json');
  if (!fs.existsSync(rootMetaPath)) {
    throw new Error(`Could not find ${rootMetaPath}. Run reconstruct_tree first.`);
  }
  const rootMeta = JSON.parse(fs.readFileSync(rootMetaPath, 'utf-8'));
  const branchFiles = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith('branch_') && f.endsWith('.json'))
    .sort();
  const branches = branchFiles.map((f) =>
    JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf-8')));
  return {
    name: rootMeta.message, value: rootMeta.id, depth: 0,
    itemStyle: { color: LEVEL_FILL_COLORS[0], borderColor: '#0b0f14', borderWidth: 1 },
    children: branches.map((b) => transform(b, 1)),
  };
}

let cachedTree, totalNodes;
try {
  cachedTree = loadTree();
  totalNodes = countNodes(cachedTree);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// ── Flat index for ancestry lookups ───────────────────────────────────────────
const nodeById = new Map(); // id → { id, parentId, depth, message }
const level5Nodes = [];    // all level-5 node ids in insertion order

(function indexTree(node, parentId) {
  nodeById.set(node.value, { id: node.value, parentId, depth: node.depth, message: node.name });
  if (node.depth === 5) level5Nodes.push(node.value);
  for (const child of node.children || []) indexTree(child, node.value);
})(cachedTree, null);

console.log(`Indexed ${nodeById.size.toLocaleString()} nodes | ${level5Nodes.length.toLocaleString()} level-5 leaves`);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tree', (_req, res) => res.json({ total: totalNodes, tree: cachedTree }));

app.get('/api/people', (_req, res) => res.json(people));

// Returns the full ancestor chain from root → nodeId
app.get('/api/ancestry/:nodeId', (req, res) => {
  const id = parseInt(req.params.nodeId, 10);
  const chain = [];
  let cur = nodeById.get(id);
  while (cur) {
    chain.unshift({ id: cur.id, depth: cur.depth, message: cur.message });
    cur = cur.parentId != null ? nodeById.get(cur.parentId) : null;
  }
  if (!chain.length) return res.status(404).json({ error: 'Node not found' });
  res.json(chain);
});

// Maps person list index → a level-5 node id (evenly spread across the leaf space)
app.get('/api/person-node/:idx', (req, res) => {
  const idx = parseInt(req.params.idx, 10);
  if (isNaN(idx) || idx < 0 || idx >= people.length)
    return res.status(400).json({ error: 'Invalid index' });
  const spread = Math.floor(level5Nodes.length / people.length);
  const nodeId = level5Nodes[Math.min(idx * spread, level5Nodes.length - 1)];
  res.json({ nodeId });
});

app.post('/api/generate-email', async (req, res) => {
  const { person, ancestry } = req.body;
  if (!person || !GEMINI_API_KEY) {
    return res.status(400).json({ error: 'Missing person or API key.' });
  }

  const { randomUUID } = require('crypto');
  const token = randomUUID().replace(/-/g, '').slice(0, 14).toUpperCase();
  const privateLink = `https://haiveminds.io/invite/${token}`;

  const threadContext = Array.isArray(ancestry) && ancestry.length
    ? ancestry.map((n) => `  Level ${n.depth}: "${n.message}"`).join('\n')
    : null;

  const prompt = `You are a senior enterprise sales executive at haiveminds — an overarching Enterprise OS that unifies all business operations through interconnected standalone products.
${
  threadContext
    ? `\nIntelligence thread (the specific operational context this contact has been mapped to — weave these themes into the email naturally):\n${threadContext}\n`
    : ''
}
Write a professional, concise cold outreach email to ${person.name}, ${person.title} at ${person.company}.

Requirements:
- Subject line on the first line, prefixed with "Subject: "
- Blank line after subject
- Body under 160 words
- Tie the value proposition tightly to their industry and role using the intelligence thread as context
- Executive-level tone, no buzzwords
- The final sentence of the body must say that a private one-time access link is attached below — do NOT write any URL, just state it is attached
- Sign off with exactly: haiveminds

Output only the email. Nothing else.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9 },
        }),
      }
    );
    const data = await response.json();
    const email = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!email) throw new Error(JSON.stringify(data));
    res.json({ email, privateLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`ARCHSAGE BLACK SITE: http://localhost:${PORT}  (${totalNodes.toLocaleString()} nodes)`);
});
