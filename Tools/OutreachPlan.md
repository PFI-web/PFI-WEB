# Implementation Plan — Team Outreach System at `/Team`

---

## Architecture

- **Firebase project:** `thepfi`
- **Runtime:** Claude Code — user runs one terminal command, it polls Firestore for tasks via MCP
- **MCP server:** Local server (`Tools/mcp-server/`) bridging Claude Code ↔ Firestore
- **Browser automation:** Claude Code uses Playwright for LinkedIn actions (find leads, send connections)
- **Communication:** Portal writes tasks to Firestore → Claude Code polls via MCP → executes → writes results back → portal updates live
- **Channel:** LinkedIn only (no email)

---

## User Flow

### First Time
1. Go to `permitfriction.com/Team`
2. Pick your name → Google Sign-In → email validated
3. Onboarding (4 steps): sign in (auto-done), install Claude Code, set up skill in Claude Projects, confirm LinkedIn is open
4. Click "Enter App" → dashboard
5. Run the Claude Code startup command once in terminal — it polls for tasks from then on

### Every Time After
Go to `/Team` → sign in → dashboard. Claude Code is already running in terminal.

### Adding Leads Manually
Click "Add Lead" → fill in name, company, LinkedIn URL → saved to Firestore → appears in table

### Finding Leads
Click "Find Leads" → fill in role, industry, company type, count → portal saves criteria + writes task to Firestore → Claude Code picks it up via `poll_tasks` → opens LinkedIn in Playwright → searches and scrapes results → saves new leads via `save_leads` (deduped) → marks task complete → table updates live

### Writing Messages
Click "Write Messages" → portal writes task to Firestore → Claude Code picks it up → reads pending leads via `get_pending_leads(needsMessage=true)` + skill via `get_skill` → generates messages → saves each via `save_message` → marks task complete → table updates live

### Performing Outreach
Click "Perform Outreach" → portal writes task to Firestore → Claude Code picks it up → reads leads via `get_pending_leads` → navigates Playwright to each LinkedIn profile → sends connection request → calls `mark_lead_done` (which enforces daily limit) → waits 3s between sends → stops at limit → marks task complete → dashboard updates live

### Daily Limits
Default: 20/day. `mark_lead_done` MCP tool enforces the limit server-side. Top bar: gray/orange/red.

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_skill(userId)` | Read user's skill document |
| `get_pending_leads(userId, needsMessage?)` | Get leads where done=false |
| `save_leads(userId, leads[])` | Save new leads with dedup by LinkedIn URL |
| `save_message(userId, leadId, message)` | Save message to a lead |
| `mark_lead_done(userId, leadId)` | Set done=true, sentAt, increment counter, enforce limit |
| `get_daily_count(userId)` | Today's count + limit + remaining |
| `poll_tasks(userId)` | Check for pending tasks |
| `complete_task(userId, taskName)` | Mark task as complete |

---

## Data Model

### `users/{uid}/leads/{leadId}`
```json
{ "name": "", "company": "", "linkedin": "", "message": "", "done": false, "channel": "linkedin", "createdAt": timestamp, "sentAt": null }
```

### `users/{uid}/tasks/{taskName}`
```json
{ "status": "pending|complete", "createdAt": timestamp }
```

### `users/{uid}/profile/search`
```json
{ "role": "", "industry": "", "companyType": "", "count": 10 }
```

---

## File Map

```
PFI/
├── Team/
│   └── index.html              # Login + onboarding + dashboard
├── Tools/
│   └── mcp-server/
│       ├── index.js            # MCP server (Firestore bridge)
│       └── package.json
├── firestore.rules
└── .gitignore
```

---

## Startup Command

```bash
claude --mcp-server "node /path/to/PFI/Tools/mcp-server/index.js"
```

User runs this once. Claude Code connects to the MCP server and begins polling for tasks.
