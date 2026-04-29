require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CACHE_TTL_MS = 5 * 60 * 1000; // refresh every 5 minutes

if (!MONDAY_API_TOKEN) {
  console.error('ERROR: MONDAY_API_TOKEN is not set in .env');
  process.exit(1);
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

// ── Board cache ──────────────────────────────────────────────────
const BOARDS = [
  { key: 'aim',    id: '18397691833', cols: ['color_mm01gkr3','color_mm01njm4','multiple_person_mm01ep1t','dropdown_mm07v0wc','date_mm01xcns','date_mm01ead4','rating_mm0194kz','color_mm01kq73','multiple_person_mm019deh','dropdown_mm01zc7c'] },
  { key: 'harley', id: '18409299249', cols: ['color_mm2jpa8m','color_mm2jcewg','date_mm2jhcpf','text_mm2jrg3h'] },
  { key: 'pt',     id: '18410501676', cols: ['text_mm2tpd59','color_mm2t5ymq','text_mm2th0rf','color_mm2tpgb5'] },
  { key: 'iter',   id: '18391776041', cols: ['color_mkzy4ahq','color_mm01yqgw','date_mm018jsq','board_relation_mkykqaks'] },
];

const cache = { data: null, fetchedAt: null, refreshing: false };

async function mondayFetch(body) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_API_TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`monday HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data;
}

async function fetchBoardItems(boardId, cols) {
  let items = [], cursor = null, pages = 0;
  // Use inline fragment so board_relation columns return linked_item_ids
  const cvFrag = `column_values(ids:$c){id text ... on BoardRelationValue{linked_item_ids}}`;
  while (true) {
    let data;
    if (!cursor) {
      data = await mondayFetch({ query: `query($b:ID!,$l:Int!,$c:[String!]){boards(ids:[$b]){items_page(limit:$l){cursor items{id name url updated_at ${cvFrag}}}}}`, variables: { b: boardId, l: 500, c: cols } });
      const page = data.boards[0].items_page;
      items.push(...page.items); cursor = page.cursor || null;
    } else {
      data = await mondayFetch({ query: `query($l:Int!,$cur:String!,$c:[String!]){next_items_page(limit:$l,cursor:$cur){cursor items{id name url updated_at ${cvFrag}}}}`, variables: { l: 500, cur: cursor, c: cols } });
      const page = data.next_items_page;
      items.push(...page.items); cursor = page.cursor || null;
    }
    pages++; if (!cursor || pages > 20) break;
  }
  return items;
}

// Resolve IT owners for iteration items via linked board items
async function enrichIterOwners(iterItems) {
  // Collect all unique linked item IDs
  const linkedIds = new Set();
  for (const it of iterItems) {
    for (const cv of (it.column_values || [])) {
      if (cv.id === 'board_relation_mkykqaks') {
        for (const lid of (cv.linked_item_ids || [])) linkedIds.add(lid);
      }
    }
  }
  if (!linkedIds.size) return;

  // Batch fetch in chunks of 100
  const ids = [...linkedIds];
  const ownerMap = {}; // linked item id → owner name(s)
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const data = await mondayFetch({
        query: `query($ids:[ID!]!){items(ids:$ids){id column_values(ids:["multiple_person_mkyrscj4","person"]){id text}}}`,
        variables: { ids: chunk },
      });
      for (const item of (data.items || [])) {
        const owners = [];
        for (const cv of item.column_values) {
          if (cv.text) owners.push(...cv.text.split(',').map(s => s.trim()).filter(Boolean));
        }
        if (owners.length) ownerMap[item.id] = [...new Set(owners)];
      }
    } catch (e) {
      console.warn('[cache] Owner enrichment chunk failed:', e.message);
    }
  }

  // Attach owners back to iteration items
  for (const it of iterItems) {
    const owners = new Set();
    for (const cv of (it.column_values || [])) {
      if (cv.id === 'board_relation_mkykqaks') {
        for (const lid of (cv.linked_item_ids || [])) {
          (ownerMap[lid] || []).forEach(o => owners.add(o));
        }
      }
    }
    it._owners = [...owners];
  }
}

async function refreshCache() {
  if (cache.refreshing) return;
  cache.refreshing = true;
  const t = Date.now();
  console.log('[cache] Fetching all boards…');
  try {
    const results = await Promise.all(BOARDS.map(b => fetchBoardItems(b.id, b.cols)));
    const data = {};
    BOARDS.forEach((b, i) => { data[b.key] = results[i]; });

    // Enrich iteration items with IT owner from linked board
    console.log('[cache] Enriching iteration owners…');
    await enrichIterOwners(data.iter);

    cache.data = data;
    cache.fetchedAt = Date.now();
    const ownerCount = data.iter.filter(it => it._owners?.length).length;
    console.log(`[cache] Ready — ${Object.values(data).reduce((s,a)=>s+a.length,0)} total items, ${ownerCount} iter items with owners, ${Date.now()-t}ms`);
  } catch (err) {
    console.error('[cache] Refresh failed:', err.message);
  } finally {
    cache.refreshing = false;
  }
}

// Start background refresh loop
refreshCache();
setInterval(refreshCache, CACHE_TTL_MS);

// Serve cached board data to browser — instant response
app.get('/api/boards-cache', (req, res) => {
  if (!cache.data) return res.status(503).json({ error: 'Cache warming up, try again shortly', ready: false });
  res.json({ data: cache.data, fetchedAt: cache.fetchedAt, ready: true });
});

// Force manual refresh
app.post('/api/boards-refresh', (req, res) => {
  refreshCache();
  res.json({ ok: true, message: 'Refresh started' });
});

// Proxy endpoint — keeps the monday token server-side (still used for admin probing)
app.post('/api/monday', async (req, res) => {
  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_API_TOKEN, 'API-Version': '2024-01' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ errors: [{ message: err.message }] });
  }
});

// Claude proxy
app.post('/api/ai/claude', async (req, res) => {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your_anthropic_key_here') {
    return res.status(400).json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to .env' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// OpenAI proxy
app.post('/api/ai/openai', async (req, res) => {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_openai_key_here') {
    return res.status(400).json({ error: 'OpenAI API key not configured. Add OPENAI_API_KEY to .env' });
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Config endpoints
const CONFIG_PATH = path.join(__dirname, 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return { boards: [], ai: { defaultModel: 'openai' }, customViews: [] }; }
}
function writeConfig(cfg) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }

app.get('/api/config', (req, res) => res.json(readConfig()));

app.post('/api/config', (req, res) => {
  try { writeConfig(req.body); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Probe a monday board ID — returns board name and columns
app.post('/api/probe-board', async (req, res) => {
  const { boardId } = req.body;
  if (!boardId) return res.status(400).json({ error: 'boardId required' });
  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_API_TOKEN, 'API-Version': '2024-01' },
      body: JSON.stringify({ query: `query{boards(ids:[${boardId}]){name columns{id title type}}}` }),
    });
    const data = await response.json();
    if (data.errors) return res.status(400).json({ error: data.errors[0].message });
    const board = data.data?.boards?.[0];
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json({ name: board.name, columns: board.columns });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sprint API ────────────────────────────────────────────────
const ITER_BOARD_ID = '18391776041';
const SPRINT_PUSH_COL = 'color_mkzy4ahq';
const SPRINT_RELATION_COL = 'board_relation_mkykqaks';

// Column IDs per source board
const PROJECTS_COLS = { status:'color_mky88tbm', priority:'color_mky8z31n', owner:'person', domain:'color_mkypswp0', type:'color_mkyz8h43', quarter:'color_mkywwmk6' };
const TASKS_COLS    = { status:'color_mkyrdkxj', priority:'status', owner:'multiple_person_mkyrscj4', sp:'numeric_mkywnmps', due:'date4', category:'color_mkyrehkw' };

// Parse sprint date range from group title e.g. "Q2 Iteration3: 26.4 - 9.5"
function parseSprintDates(title) {
  const m = title.match(/(\d+\.\d+(?:\.\d+)?)\s*-\s*(\d+\.\d+(?:\.\d+)?)/);
  if (!m) return { start: null, end: null };
  const year = new Date().getFullYear();
  const parseD = s => {
    const parts = s.split('.').map(Number);
    return parts.length === 3
      ? new Date(parts[2], parts[1] - 1, parts[0])
      : new Date(year, parts[1] - 1, parts[0]);
  };
  return { start: parseD(m[1]), end: parseD(m[2]) };
}

async function fetchSprintData(groupId) {
  // 1. Fetch iteration items in this sprint group
  const groupData = await mondayFetch({
    query: `query($b:ID!,$g:[String!]){boards(ids:[$b]){groups(ids:$g){id title items_page(limit:200){items{id name column_values(ids:["${SPRINT_PUSH_COL}","${SPRINT_RELATION_COL}"]){id text ... on BoardRelationValue{linked_item_ids}}}}}}}`,
    variables: { b: ITER_BOARD_ID, g: [groupId] },
  });
  const group = groupData.boards[0].groups[0];
  const iterItems = group.items_page.items;

  // 2. Collect all unique linked item IDs
  const linkedIds = [];
  const iterMap = {}; // linkedId → iter item
  for (const it of iterItems) {
    for (const cv of it.column_values) {
      if (cv.id === SPRINT_RELATION_COL) {
        for (const lid of (cv.linked_item_ids || [])) {
          linkedIds.push(lid);
          iterMap[lid] = it;
        }
      }
    }
  }

  // 3. Batch fetch linked items in chunks of 50
  const linkedItems = [];
  for (let i = 0; i < linkedIds.length; i += 50) {
    const chunk = linkedIds.slice(i, i + 50);
    try {
      const data = await mondayFetch({
        query: `query($ids:[ID!]!){items(ids:$ids){id name url board{id name}column_values{id text}}}`,
        variables: { ids: chunk },
      });
      linkedItems.push(...(data.items || []));
    } catch(e) { console.warn('[sprint] chunk failed:', e.message); }
  }

  // 4. Normalize linked items into sprint tasks
  const tasks = linkedItems.map(it => {
    const cv = Object.fromEntries(it.column_values.map(c => [c.id, c.text || null]));
    const iterItem = iterMap[it.id] || {};
    const pushCV = (iterItem.column_values || []).find(c => c.id === SPRINT_PUSH_COL);
    const isTaskBoard = it.board.name.toLowerCase().includes('task');
    return {
      id: it.id,
      name: it.name,
      url: it.url,
      board: it.board.name,
      isTaskBoard,
      iterItemName: iterItem.name || it.name,
      push: pushCV?.text || null,
      // Unified fields — pick from whichever board type
      status:   isTaskBoard ? cv[TASKS_COLS.status]   : cv[PROJECTS_COLS.status],
      priority: isTaskBoard ? cv[TASKS_COLS.priority]  : cv[PROJECTS_COLS.priority],
      owner:    isTaskBoard ? cv[TASKS_COLS.owner]     : cv[PROJECTS_COLS.owner],
      sp:       isTaskBoard ? parseFloat(cv[TASKS_COLS.sp]) || 0 : 0,
      due:      isTaskBoard ? cv[TASKS_COLS.due]       : null,
      domain:   isTaskBoard ? cv[TASKS_COLS.category]  : cv[PROJECTS_COLS.domain],
      type:     isTaskBoard ? 'Task' : (cv[PROJECTS_COLS.type] || 'Project'),
    };
  });

  const dates = parseSprintDates(group.title);
  return { groupId: group.id, title: group.title, start: dates.start, end: dates.end, tasks };
}

// Cache sprint data per group
const sprintCache = {};

app.get('/api/sprint', async (req, res) => {
  const groupId = req.query.group || 'group_mm2jgqs6';
  try {
    // Return cached if fresh (10 min)
    if (sprintCache[groupId] && Date.now() - sprintCache[groupId].fetchedAt < 10 * 60 * 1000) {
      return res.json({ ...sprintCache[groupId].data, fromCache: true });
    }
    const data = await fetchSprintData(groupId);
    sprintCache[groupId] = { data, fetchedAt: Date.now() };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Return all sprint groups (for sprint switcher)
app.get('/api/sprints', async (req, res) => {
  try {
    const data = await mondayFetch({
      query: `query($b:ID!){boards(ids:[$b]){groups{id title}}}`,
      variables: { b: ITER_BOARD_ID },
    });
    const groups = data.boards[0].groups.filter(g =>
      !g.title.toLowerCase().includes('backlog')
    ).map(g => ({ id: g.id, title: g.title, dates: parseSprintDates(g.title) }));
    res.json({ groups });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Test AI keys
app.post('/api/test-ai', async (req, res) => {
  const { model } = req.body;
  if (model === 'openai') {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_openai_key_here') return res.json({ ok: false, error: 'No key set' });
    try {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` } });
      res.json({ ok: r.ok });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  } else {
    if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your_anthropic_key_here') return res.json({ ok: false, error: 'No key set' });
    res.json({ ok: true });
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
