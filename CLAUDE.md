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
- Claude Code for automated email outreach; LinkedIn outreach is manual via dashboard
- Playwright used only during lead discovery (LinkedIn profile search), not for sending
- No Firebase Auth — simple email-based login matching against employee list in Firestore

### Screen Flow (4 screens, sequential)
1. **Login** — Employee name cards from Firestore. Click a name → enter email → matched against `company/employees`
2. **Onboarding** (first time only) — Install Claude Code, set up skill
3. **Setup** — Two terminal commands: start Claude Code with MCP server, then paste polling prompt
4. **Dashboard** — Lead table, action buttons (Find Leads, Add Lead, Write Messages, Perform Outreach, Proof Sheet)

### Architecture
- **Portal** writes tasks to `users/{uid}/tasks/` in Firestore
- **Claude Code** polls for tasks via MCP `poll_tasks` tool every 10s
- **Claude Code** executes tasks using MCP tools + external APIs + Playwright (lead discovery only)
- **Portal** updates in real time via Firestore `onSnapshot` listeners (leads table + daily counters)

### Lead Discovery & Outreach Flow (Signal-First)
1. **Find Leads** → Agent searches for signal strength first: FERC queues, permits.performance.gov delayed milestones, state permit databases (TCEQ/GA EPD/AZ DEQ), ISO interconnection queues (ERCOT/MISO/SPP/Georgia Power/APS/SRP), capital commitments — focused on TX, GA, AZ
2. Each company classified as **Active Pain** (stuck in permitting now) or **Capital Pattern** (repeat builder, next project coming)
3. Agent finds the strongest contact — the ONE person most accountable for permitting timelines or capital deployment
4. For each person: **always** get LinkedIn profile via Playwright, **then** try Hunter for email
5. Email found → `channel: 'email'`, lead has both email + LinkedIn | No email → `channel: 'linkedin'`, LinkedIn only
6. **Outreach**: Agent sends emails via Gmail SMTP only. LinkedIn connection requests are **manual** — user sends them and clicks the LinkedIn icon in the dashboard to mark complete.

### Proof Sheet (Boss Cross-Check)
- **"Proof Sheet" button** on dashboard — runs the same signal-first discovery pipeline but writes to a Google Sheet instead of the leads database
- Modal: count input + helper text (Google Sheet ID is hardcoded: `1VjCQBw86I8vTTbqyJ8EyJI4XnbaZbnge2ihGsDud2uI`)
- Task type: `proofSheet` with `{ status, count, spreadsheetId, createdAt }`
- **Two tabs** in the Google Sheet — rows are routed by classification:
  - **Active Pain** tab columns: Company, What They're Building, Where, Why They're Hurting, Proof, Contact, LinkedIn, Thought Process
  - **Capital Pattern** tab columns: Company, What They Keep Doing, Where, Why PFI Matters To Them, Proof, Contact, LinkedIn, Thought Process
- Multi-line fields: `why_they_are_hurting`, `why_pfi_matters`, and `thought_process` render with line breaks in the sheet (`USER_ENTERED` mode)
- Tabs and headers are created automatically by the MCP tool
- Results written incrementally as the agent finds them (not batched at the end)
- `count` = exact number of companies to return. If count is 1, agent runs one search and picks one company
- Google Sheet shared with `firebase-adminsdk-fbsvc@thepfi.iam.gserviceaccount.com`
- Uses `googleapis` npm package with the Firebase service account credentials

### Source Credibility Rules
- Every company picked by the agent (in both `findLeads` and `proofSheet`) **must come from a real, verifiable source** with an actual URL
- Acceptable: government filings, regulatory databases (permits.performance.gov, FERC, TCEQ, etc.), major industry publications, official project announcements
- Not acceptable: unverified sources, speculative content, AI-generated summaries, questionable/unknown websites
- No source URL = no save. Agent skips any result it cannot verify.

### Dual-Channel Tracking
- Leads can have email, LinkedIn, or both contact methods
- Each channel tracked independently: `emailSent` and `linkedinSent` fields
- **Partial completion**: Yellow badge ("Email Sent" or "LinkedIn Sent") when one channel is done
- **Full completion**: Green "Done" badge when all available channels are complete
- Dashboard shows a LinkedIn icon button next to partial-status leads for manual LinkedIn completion

### Playwright / LinkedIn Session
- Used **only during lead discovery** (finding LinkedIn profile URLs via search)
- Uses persistent browser context saved at `~/.pfi-linkedin-session/`
- First time only: user logs into LinkedIn manually in the Playwright browser window
- Session persists across agent restarts
- Agent must always use `chromium.launchPersistentContext()`, never `chromium.launch()` or CDP
- **Not used for sending connection requests** — that's manual

### MCP Server (`Tools/mcp-server/index.js`)
12 tools exposed:
- `search_web(query)` — Tavily API web search, returns structured results
- `enrich_contact(firstName, lastName, domain)` — Hunter email finder, returns email or null
- `send_email(userId, leadId, to, subject, body)` — Gmail SMTP send, sets `emailSent: true`, only sets `done: true` if LinkedIn is also complete (or not applicable). Enforces daily email limit
- `get_skill(userId)` — Read user's skill document
- `get_pending_leads(userId, needsMessage?)` — Get leads where done=false
- `save_leads(userId, leads[])` — Save new leads with dedup by LinkedIn URL and email
- `save_message(userId, leadId, message, subject?, linkedinNote?)` — Save outreach message to a lead. Email leads: `message` (body) + `subject` + optional `linkedinNote`. LinkedIn-only leads: `message` (connection note under 300 chars)
- `mark_lead_done(userId, leadId)` — Sets `linkedinSent: true`, only sets `done: true` if email is also complete (or not applicable). Increments daily LinkedIn counter, enforces limit
- `get_daily_count(userId)` — Today's LinkedIn + email counts, limits, and remaining
- `poll_tasks(userId)` — Check for pending tasks
- `complete_task(userId, taskName)` — Mark task as complete
- `write_proof_sheet(spreadsheetId, rows[])` — Append rows to a Google Sheet. Each row includes a `tab` field (`"Active Pain"` or `"Capital Pattern"`) and tab-specific columns (8 per tab, including Thought Process). Auto-creates tabs and headers. Uses `USER_ENTERED` mode for multi-line cell support.

### Environment Variables (MCP Server)
- `TAVILY_API_KEY` — Tavily web search
- `HUNTER_API_KEY` — Hunter.io email finder
- `GMAIL_USER` — Gmail address for outreach
- `GMAIL_APP_PASSWORD` — Gmail app password

### Firestore Data Model
- `company/employees` — `{ list: [{ name, role, email }] }`
- `company/config` — `{ skillTemplate: "..." }` with `{{name}}` and `{{role}}` placeholders
- `users/{uid}/profile/main` — `{ onboarded, skill, name, role, linkedinLimit, emailLimit, linkedin_YYYY-MM-DD, email_YYYY-MM-DD, claudeStarted }`
- `users/{uid}/leads/{leadId}` — `{ name, company, role, linkedin, email, channel, enrichmentSource, message, emailSubject, linkedinNote, emailSent, emailSentAt, linkedinSent, linkedinSentAt, done, createdAt, sentAt }`
- `users/{uid}/tasks/{taskName}` — `{ status: "pending"|"complete", createdAt }`. Task names: `findLeads` (+ count), `writeMessages`, `performOutreach`, `proofSheet` (+ count, spreadsheetId)

### Testing Mode
**Currently active.** Both `Tools/mcp-server/index.js` and `Team/index.html` have a `ROOT_COLLECTION` constant set to `'test'` instead of `'users'`. This routes all reads/writes to the `test` Firestore collection. Test data seeded via `Tools/seed/seed-test.js`. **Switch back to `'users'` in both files when done testing.**

### Dashboard UI
- Lead table with real-time Firestore `onSnapshot` listeners
- Message modal (popup) for viewing/editing email and LinkedIn messages separately
- Status column: Pending (gray) → partial (yellow, "Email Sent" or "LinkedIn Sent") → Done (green)
- LinkedIn icon button appears next to partial-status leads for manual completion
- Daily counters (LinkedIn + email) update in real time via `onSnapshot`

### Firestore Rules
- `company/*` — read: open, write: console only
- `users/*` — read/write: open (internal tool)
- `test/*` — read/write: open (testing only, remove when done)

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
│   │   ├── seed.js               # Firestore seed script (production)
│   │   ├── seed-test.js          # Test data seed script (test collection)
│   │   └── package.json
│   └── outreach-agent.md          # Agent instructions (polling, task handlers, LinkedIn safety rules)
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
