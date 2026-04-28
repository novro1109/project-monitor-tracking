# Project Monitor & Tracking

A live multi-board project monitoring dashboard powered by [monday.com](https://monday.com), with an AI chat assistant and an admin console.

![Dashboard](https://img.shields.io/badge/stack-Node.js%20%7C%20Express%20%7C%20ECharts-blue)
![AI](https://img.shields.io/badge/AI-OpenAI%20%7C%20Claude-purple)

---

## Features

### 📊 Multi-Board Dashboard
- Unified sidebar with board switcher — switch between boards instantly
- KPI cards and status strips per board
- Apache ECharts 5.5 charts with a custom enterprise theme (doughnut, horizontal bar, stacked bar, vertical bar)
- Per-board tabs: Overview, By Status, By Priority, Team, Active Items, Risk, Done

### 🤖 AI Chat Assistant
- Floating chat bubble (bottom-right corner)
- Active model shown as a read-only pill in the chat header — select models from the Admin Console
- Full board context injected automatically — questions are answered from live data
- Built-in skill routing:
  - `person-lookup` — "What is Yuval working on?"
  - `overdue-report` — "What's overdue?"
  - `blocked-report` — "What's blocked?"
  - `priority-drill` — "Show all critical items"
  - `team-load` — "Who has the most open tasks?"
  - `this-week` — "What's happening this week?"
  - `risk-report` — "What are the risks?"

### ⚙️ Admin Console
- **Boards** — add/remove monday.com boards, toggle visibility, probe board IDs
- **AI Settings** — test API key connections; choose the active model from a full model picker showing all available OpenAI and Claude models with pricing per 1M tokens and value notes. Selection persists to `config.json`
- **Custom Views** — create person-focused views showing all tasks assigned to specific team members across all boards
- All settings persisted to `config.json`

### 🔒 Security
- API tokens stored server-side in `.env` — never exposed to the browser
- Express proxy forwards all API calls with tokens injected server-side
- `.env` permissions locked to owner read/write only (`chmod 600`)

---

## Supported AI Models

### OpenAI
| Model | Input/1M | Output/1M | Context | Note |
|-------|----------|-----------|---------|------|
| GPT-4.1 | $2.00 | $8.00 | 1M | Latest flagship |
| GPT-4.1 Mini | $0.40 | $1.60 | 1M | Best value long-context |
| GPT-4.1 Nano | $0.10 | $0.40 | 1M | Cheapest option |
| GPT-4o | $2.50 | $10.00 | 128K | Proven multimodal |
| GPT-4o Mini | $0.15 | $0.60 | 128K | Ultra-cheap |
| GPT-4.5 Preview | $75.00 | $150.00 | 128K | Largest GPT (deprecated soon) |
| o4-mini | $1.10 | $4.40 | 200K | Best cost-effective reasoning |
| o3 | $2.00 | $8.00 | 200K | Top-tier reasoning |
| o3-pro | $20.00 | $80.00 | 200K | Max reasoning reliability |
| o3-mini | $1.10 | $4.40 | 200K | Fast STEM & code reasoning |
| o1 | $15.00 | $60.00 | 200K | Premium reasoning (prev-gen) |
| o1-mini | $1.10 | $4.40 | 128K | Cheap reasoning (prev-gen) |
| o1-pro | $150.00 | $600.00 | 200K | Highest compute reasoning |
| Codex Mini | $1.50 | $6.00 | 200K | Agentic coding (Codex CLI) |

### Anthropic Claude
| Model | Input/1M | Output/1M | Context | Note |
|-------|----------|-----------|---------|------|
| Claude Opus 4.7 | $5.00 | $25.00 | 1M | Most capable Claude |
| Claude Sonnet 4.6 | $3.00 | $15.00 | 1M | Best speed/intelligence balance |
| Claude Haiku 4.5 | $1.00 | $5.00 | 200K | Fastest Claude |
| Claude Haiku 3.5 | $0.80 | $4.00 | 200K | Cheapest current-gen |
| Claude Haiku 3 | $0.25 | $1.25 | 200K | Ultra-cheap legacy |

---

## Boards Included

| Board | Description |
|-------|-------------|
| 🔐 Access & Identity Management | IAM progress tracking |
| 🤖 Harley — Ask-it First Responder | AI Slack bot task tracking |
| 🎯 Project Tracking — Control Up | Sprint and backlog management |

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/novro1109/project-monitor-tracking.git
cd project-monitor-tracking
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
MONDAY_API_TOKEN=your_monday_api_token_here
OPENAI_API_KEY=your_openai_key_here          # optional
ANTHROPIC_API_KEY=your_anthropic_key_here    # optional
PORT=3000
```

Lock down permissions:
```bash
chmod 600 .env
```

- Get your monday.com token: **Profile → Developers → My Access Tokens**
- Get your OpenAI key: [platform.openai.com](https://platform.openai.com)
- Get your Anthropic key: [console.anthropic.com](https://console.anthropic.com)

### 3. Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
project-monitor-tracking/
├── index.html       # Single-page app (dashboard, chat, admin UI)
├── server.js        # Express server — monday.com + AI proxies, config API
├── config.json      # Persisted board and AI settings
├── package.json
└── .env             # Not committed — add your tokens here
```

---

## Adding a New Board

1. Open the **⚙️ Admin Console** (bottom of sidebar)
2. Go to **Boards** tab
3. Paste your monday.com board ID (found in the board URL)
4. Click **Verify Board** — confirms it exists and fetches column names
5. Click **Add Board** → **Save Config**
6. Reload the page

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS, HTML/CSS — no framework |
| Charts | Apache ECharts 5.5 with custom enterprise theme |
| Backend | Node.js + Express |
| Data | monday.com GraphQL API v2 (cursor pagination) |
| AI | OpenAI (14 models) + Anthropic Claude (5 models) |
| Config | JSON file on disk |
