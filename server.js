require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!MONDAY_API_TOKEN) {
  console.error('ERROR: MONDAY_API_TOKEN is not set in .env');
  process.exit(1);
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

// Proxy endpoint — keeps the monday token server-side
app.post('/api/monday', async (req, res) => {
  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': MONDAY_API_TOKEN,
        'API-Version': '2024-01',
      },
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
