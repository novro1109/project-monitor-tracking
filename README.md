# Project Monitor & Tracking

A live multi-board project monitoring dashboard powered by [monday.com](https://monday.com), with an AI chat assistant and an admin console.

![Dashboard](https://img.shields.io/badge/stack-Node.js%20%7C%20Express%20%7C%20Chart.js-blue)
![AI](https://img.shields.io/badge/AI-GPT--4o%20%7C%20Claude-purple)

---

## Features

### 📊 Multi-Board Dashboard
- Unified sidebar with board switcher — switch between boards instantly
- KPI cards, status strips, Chart.js charts (doughnut, bar, stacked)
- Per-board tabs: Overview, By Status, By Priority, Team, Active Items, Risk, Done

### 🤖 AI Chat Assistant
- Floating chat bubble (bottom-right corner)
- Toggle between **GPT-4o** (OpenAI) and **Claude** (Anthropic)
- Full board context injected automatically — asks are answered from live data
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
- **AI Settings** — test API key connections, set default model
- **Custom Views** — create person-focused views showing all tasks assigned to specific team members across all boards
- All settings persisted to `config.json`

### 🔒 Security
- API tokens stored server-side in `.env` — never exposed to the browser
- Express proxy forwards all API calls with tokens injected server-side

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
├── config.json      # Persisted board and settings config
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
|-------|-----------|
| Frontend | Vanilla JS, HTML/CSS — no framework |
| Charts | Chart.js 4.5 |
| Backend | Node.js + Express |
| Data | monday.com GraphQL API v2 |
| AI | OpenAI GPT-4o + Anthropic Claude |
| Config | JSON file on disk |
