# PFI — Permitting Friction Index

## Overview
Two-part project: a static marketing site and an internal team outreach system.

## Marketing Site (`index.html`)

### Tech Stack
- Single `index.html` file with inline CSS and JS (no build tools, no frameworks)
- Font: Inter (Google Fonts)
- No dependencies

### Page Structure
1. **Hero** — Full-viewport background image with logo and mist widget
2. **Flipper 1: Intro ↔ What PFI Measures** — Arrow-based page flipper with fade+slide animation
3. **Flipper 2: Initial Coverage ↔ Who Uses The PFI** — Split layout (image left/top, text flips right/below)
4. **Founding Subscribers** — Notion-style centered text with email link
5. **Footer**

### Flipper Mechanism
- Arrow buttons slide content horizontally like turning a page
- Coordinated animation: fade-out → 300ms delay → slide track + fade-in (1s cubic-bezier easing)
- Progressive reveal: sections hidden until user clicks through each flipper
- Flipper viewport height locks to active page content to prevent white space
- Flipper 2 text container height locks to active page; uses `align-items: flex-start` on track so pages size independently

### Design System
Notion-inspired design language with reusable CSS classes:
- `.notion-section`, `.notion-content` — Section containers (max-width: 720px, centered)
- `.notion-label` — Small gray category label
- `.notion-title` — Section heading (28px, semibold)
- `.notion-subheading` — Subsection heading (18px, bold)
- `.notion-body` — Body text (16px, #555)
- `.notion-split` — Two-column grid layout for image+text sections
- `.flipper-arrow` — Circular arrow button for flipping between content pages

### Responsive Breakpoints
- **Desktop** — Side-by-side grid for section 3, full nav text
- **Tablet (≤1024px)** — Reduced padding
- **Mobile (≤768px)** — LOCKED IN. Nav shows "PFI" instead of full name, section 3 stacks image above text (edge-to-edge), flipper2 labels hidden, footer centered
- **Small phone (≤400px)** — LOCKED IN. Further size reductions

## Outreach System (`Team/index.html`)

### Overview
Internal outreach automation tool at `permitfriction.com/Team`. Team members log in, manage LinkedIn leads, and use Claude Code + MCP to automate message writing and outreach.

### Tech Stack
- Single `Team/index.html` file with inline CSS and JS
- Firebase (Firestore) for data — project: `thepfi`
- MCP server (`Tools/mcp-server/`) bridging Claude Code ↔ Firestore
- Claude Code + Playwright for LinkedIn automation (persistent session at `~/.pfi-linkedin-session/`)
- No Firebase Auth — simple email-based login matching against employee list in Firestore

### Screen Flow (4 screens, sequential)
1. **Login** — Employee name cards from Firestore. Click a name → enter email → matched against `company/employees`
2. **Onboarding** (first time only) — Install Claude Code, set up skill
3. **Setup** — Two terminal commands: start Claude Code with MCP server, then paste polling prompt
4. **Dashboard** — Lead table, action buttons (Find Leads, Add Lead, Write Messages, Perform Outreach)

### Architecture
- **Portal** writes tasks to `users/{uid}/tasks/` in Firestore
- **Claude Code** polls for tasks via MCP `poll_tasks` tool every 10s
- **Claude Code** executes tasks using MCP tools + external APIs + Playwright (LinkedIn fallback)
- **Portal** updates in real time via Firestore `onSnapshot` listener

### Lead Discovery & Outreach Flow
1. **Find Leads** → Tavily web search (API, no browser) discovers companies/projects
2. Agent identifies key people at target companies (permitting/development roles, not operators)
3. For each person: **always** get LinkedIn profile via Playwright, **then** try Hunter for email
4. Email found → `channel: 'email'`, lead has both email + LinkedIn | No email → `channel: 'linkedin'`, LinkedIn only
5. **Outreach**: email leads sent via Gmail SMTP, LinkedIn leads sent via Playwright

### Playwright / LinkedIn Session
- Uses persistent browser context saved at `~/.pfi-linkedin-session/`
- On agent startup, verifies LinkedIn session is active (navigates to feed)
- First time only: user logs into LinkedIn manually in the Playwright browser window
- Session persists across agent restarts — no Chrome debug port needed
- Agent must always use `chromium.launchPersistentContext()`, never `chromium.launch()` or CDP

### MCP Server (`Tools/mcp-server/index.js`)
11 tools exposed:
- `search_web(query)` — Tavily API web search, returns structured results
- `enrich_contact(firstName, lastName, domain)` — Hunter email finder, returns email or null
- `send_email(userId, leadId, to, subject, body)` — Gmail SMTP send, auto-marks lead done, enforces daily email limit
- `get_skill(userId)` — Read user's skill document
- `get_pending_leads(userId, needsMessage?)` — Get leads where done=false
- `save_leads(userId, leads[])` — Save new leads with dedup by LinkedIn URL and email
- `save_message(userId, leadId, message)` — Save message to a lead
- `mark_lead_done(userId, leadId)` — Set done=true, sentAt, increment daily counter, enforce limit
- `get_daily_count(userId)` — Today's LinkedIn + email counts, limits, and remaining
- `poll_tasks(userId)` — Check for pending tasks
- `complete_task(userId, taskName)` — Mark task as complete

### Environment Variables (MCP Server)
- `TAVILY_API_KEY` — Tavily web search
- `HUNTER_API_KEY` — Hunter.io email finder
- `GMAIL_USER` — Gmail address for outreach
- `GMAIL_APP_PASSWORD` — Gmail app password

### Firestore Data Model
- `company/employees` — `{ list: [{ name, role, email }] }`
- `company/config` — `{ skillTemplate: "..." }` with `{{name}}` and `{{role}}` placeholders
- `users/{uid}/profile/main` — `{ onboarded, skill, name, role, linkedinLimit, emailLimit, linkedin_YYYY-MM-DD, email_YYYY-MM-DD, claudeStarted }`
- `users/{uid}/leads/{leadId}` — `{ name, company, role, linkedin, email, channel, enrichmentSource, message, done, createdAt, sentAt }`
- `users/{uid}/tasks/{taskName}` — `{ status: "pending"|"complete", createdAt }`

### Firestore Rules
- `company/*` — read: open, write: console only
- `users/*` — read/write: open (internal tool)

### Skill System
Master skill template in `company/config` gets personalized per user (replace `{{name}}` and `{{role}}`). Claude Code sets up the Claude Project with instructions automatically on first run.

### Daily Limits
Default: 20/day for both LinkedIn and email (separate counters). Stored as `linkedin_YYYY-MM-DD` and `email_YYYY-MM-DD` fields. Top bar shows both counters. Color: gray (safe) → orange (80%) → red (at limit). `mark_lead_done` enforces LinkedIn limit server-side, `send_email` enforces email limit server-side.

## Assets
- Images live in `assets/`
- Design reference screenshots (PNG) are also in `assets/`

## File Map
```
PFI/
├── index.html                    # Marketing site
├── Team/
│   └── index.html                # Outreach system (login + onboarding + dashboard)
├── Tools/
│   ├── mcp-server/
│   │   ├── index.js              # MCP server (Firestore bridge)
│   │   └── package.json
│   ├── seed/
│   │   ├── seed.js               # Firestore seed script
│   │   └── package.json
│   ├── outreach-agent.md          # Agent instructions (polling, task handlers, Playwright rules)
│   ├── Outreach.md               # System description
│   ├── OutreachPlan.md           # Implementation plan
│   └── P.md                      # Implementation principles
├── firestore.rules
├── firebase.json
├── assets/
├── CNAME
├── CLAUDE.md
└── .gitignore
```

## Workflow
- Marketing site: sections rebuilt one at a time to match design screenshots
- Outreach system: follow P.md confirmation protocol (plan → "Approved" → code)
- Keep styles consistent with PFI design language (Inter font, #1C2B3A, #2E6DA4)
- Prefer editing existing files over creating new ones
