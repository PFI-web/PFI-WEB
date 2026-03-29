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

## Outreach System

### Overview
CLI-driven outreach automation tool. Run commands directly in Claude Code to find leads and research them. All data lives in Google Sheets.

### Tech Stack
- MCP server (`Tools/mcp-server/`) bridging Claude Code ↔ external APIs + Google Sheets
- Claude Code triggered via direct commands — no dashboard
- Playwright used only during lead discovery (LinkedIn profile search), not for sending

### Architecture
- **Claude Code** is triggered directly via commands (e.g. `/find-leads 5`, `/proof-sheet 10`)
- **Claude Code** executes tasks using MCP tools + external APIs + Playwright (lead discovery only)
- All contact and intelligence data lives in **Google Sheets**

### Start Command
```bash
cd ~/development/PFI && claude --dangerously-skip-permissions --mcp-config '{"mcpServers":{"pfi":{"command":"node","args":["Tools/mcp-server/index.js"],"env":{"TAVILY_API_KEY":"...","HUNTER_API_KEY":"...","GMAIL_USER":"...","GMAIL_APP_PASSWORD":"..."}}}}'
```

### Lead Discovery & Outreach Flow (Signal-First, Fund-Level Targeting)
**Core principle:** The developer/operator is the evidence that pain exists. The institutional fund behind them is the customer. The tool finds both, but outreach goes to the fund.

**Pressure chain:** Project in permitting pain → Developer/operator → Who funded them → Fund-level contact

1. **Find Leads** → Agent searches for signal strength first, prioritizing sources by weight tier, focused on TX, GA, AZ:
   - **Tier 1 — High-Weight (Primary Truth Sources, search first):**
     - FERC interconnection queues (delayed study phases, withdrawals, long queue duration)
     - ISO interconnection queues (ERCOT/MISO/SPP/Georgia Power/APS/SRP)
     - State PUC/PSC dockets (contested permits, intervenor filings, review extensions — not just existence of dockets)
     - EPA/NEPA environmental review databases (projects in extended or supplemental review)
     - Army Corps Section 404/408 permit databases (approval delays)
     - State permit databases (TCEQ/GA EPD/AZ DEQ)
     - permits.performance.gov delayed milestones
     - County zoning/special use permits, state water authority permits, FAA obstruction filings
     - EPA Title V air permits, state NPDES wastewater permits, BLM right-of-way applications
   - **Tier 2 — Medium-Weight (Ownership & Capital Mapping):**
     - SEC Form D filings (EDGAR) — links private capital raises to projects
     - FERC market-based rate applications — discloses generation asset ownership
     - State utility commission ownership filings — structured ownership visibility
   - **Tier 3 — Supporting Intelligence (Contextual Validation, never standalone):**
     - permitting.gov press releases, capital commitment announcements, state economic development announcements
     - Infrastructure fund portfolio pages, PitchBook/Preqin, public pension LP disclosures (CalPERS, CDPQ)
   - **Source tier rule:** Leads backed by Tier 1 evidence are strongest. Leads sourced only from Tier 3 require at least one Tier 1/Tier 2 confirmation before saving.
   - If a project appears in a non-energy source but not in an energy queue, still classify using Active Pain / Capital Pattern logic. Do not expand geography beyond TX, GA, AZ until instructed.
2. Each company classified as **Active Pain** (stuck in permitting now) or **Capital Pattern** (repeat builder, next project coming)
3. **Institutional backer lookup** — Multi-step process: (A) Direct search — "[Company] equity partner", "backed by", "investors" (3 queries max). (B) Regulatory ownership filings — SEC Form D on EDGAR, FERC market-based rate applications, state PUC ownership filings (if Step A inconclusive). (C) Pension LP disclosures — CalPERS, CDPQ infrastructure commitments (last resort). If not found after all steps → "backer not found" (row still saved)
4. Agent finds fund-level contacts per firm using the project record as search context — searches combine fund name + project name + agency + state (not generic role searches). Contact priority hierarchy:
   - **Priority 1: Head of Asset Management / Portfolio Operations** (post-investment persona — manages execution risk on live projects, recalculates pro forma when permits slip)
   - **Priority 2: Infrastructure / Energy Transition Partner** (pre-investment persona — active deal responsibility, evaluates permitting risk before deploying capital, has budget authority)
   - **Priority 3: CIO** (pre-investment persona — at mid-sized funds under ~$10B AUM where decision authority is concentrated; skip at large funds)
   - **Do Not Target as primary leads:** Investor Relations (manages LP relationships, not purchasing decisions), Research Analysts (no buying authority), Associates (no budget ownership), GPs/CEOs/Chairmen (too senior), capital raising roles
   - **Do not stop at one contact per company.** Find all verified contacts tied to the project across priority tiers. Each saved as a separate lead with a distinct rationale. Every additional contact must pass full verification: project tie confirmed, Playwright verification (name/employer/current), forwarding test passed, three required fields complete, and rationale distinct from other contacts. Do not add contacts just to increase volume. If none of Priorities 1-3 found at the fund, skip the company and move on
5. For each person: **always** get LinkedIn profile via Playwright, **then** try Hunter for email
6. Email found → stored in `contact_email`. No email → field left blank. Both LinkedIn and email stored in the Proof Sheet for use in outreach.

### Proof Sheet (Structured Intelligence)
- Run `/proof-sheet [count]` — deep signal-first discovery pipeline writing structured intelligence to Google Sheet ID `1VjCQBw86I8vTTbqyJ8EyJI4XnbaZbnge2ihGsDud2uI`
- **Row grain = project, not fund.** A single fund can appear multiple times if they back multiple projects with permitting friction. Each project gets its own row with its own contact. `count` = number of projects to find.
- **Single "Proof Sheet" tab** with 10 columns: Company, Institutional Backer, Fund Experience, Classification, Why Them, Key Contact, Contact LinkedIn, Contact Email, Contact Rationale, Contact Confidence. **No separate Source column** — all source URLs are cited inline within Why Them and Contact Rationale at the exact point where each claim is made
- **Fund Experience**: `"New Entrant"` (1–3 years or first infrastructure fund) or `"Seasoned"` (5+ years US infra capital). **New Entrants are the priority target** — less experienced firms face more permitting friction (lack regulatory relationships, less jurisdiction-specific knowledge, more exposed to timeline surprises). Search for and prioritize New Entrant-backed projects first; fill remaining slots with Seasoned if needed. US-based funds only — foreign funds with no US office/team are discarded.
- **Non-U.S. Companies tab**: When adding companies to this tab, confirm the firm does **not materially operate in the United States as a company**. A company belongs here only if its core operations, headquarters, and primary business activity are outside the U.S. It is acceptable if the firm is working on or participating in specific U.S. projects, but the company itself must not be U.S.-based or broadly operating in the U.S. market. If a firm has a significant operational presence in the U.S. beyond isolated project involvement, it is **not** a Non-U.S. company.
- **Personalization intelligence** ("Why Them"): Ties it all together — company/backer → project friction → permitting risk exposure → what's actionable. Every factual claim must cite its source URL inline. Connect the specific permit delay to the financial exposure the backer faces — IRR erosion, capital sitting idle, LP reporting gaps, pro forma revisions. Every "Why Them" should read like a reason the fund needs to take a meeting about permitting risk, not a summary of what's happening.
- **Contact search** — project-specific, not fund-level. Large funds have multiple people owning different assets. Two-step process: (1) Google via `search_web` to find LinkedIn URLs using `[Fund Name] + [Project/Asset Type] + [State] + [role] + site:linkedin.com`, (2) Playwright to confirm name, employer, and Present status on the profile page. Search hierarchy: Head of Asset Management/Portfolio Operations (post-investment) → Infrastructure/Energy Transition Partner (pre-investment) → CIO at mid-sized funds under ~$10B AUM (pre-investment) → Infra Strategy/Portfolio Mgmt. **Do not stop at one contact** — find all verified contacts tied to the project across priority tiers. Each gets their own row with a distinct rationale. Every contact must pass full verification (project tie, Playwright check, forwarding test, three required fields, distinct rationale). Do Not Target: IR, Research Analysts, Associates, GPs/CEOs/Chairmen, capital raising roles.
- **Forwarding test**: Would this person immediately know which project from a one-paragraph note about permitting variance risk in TX/GA/AZ? If they'd forward it → go deeper.
- **Playwright verification**: Name must match, employer must match the fund (current position), and they must be currently employed there. Any fail = discard and keep searching.
- **Key Contact column**: `"Name (Verified Title, Firm)"`. `"contact not found"` if search failed.
- **Contact LinkedIn**: Full LinkedIn profile URL (not shortened).
- **Contact Email**: Email address from Hunter. Empty if not found — does not block the row.
- **Contact Rationale**: One sentence naming the project and why this person owns the exposure, **with inline source URLs for every factual claim.** Example: `"Manages Brookfield's $200M stake in Scout Clean Energy (https://brookfield.com/portfolio/scout-clean-energy); owns the ERCOT interconnection delay outcome directly (https://ercot.com/queue/project-id)."`
- **Contact Confidence**: `"High"` (named in press release tied to project), `"Medium"` (title+tenure align on LinkedIn/fund site), `"Low"` (flagged, do not send outreach). Cannot reach Medium in 20 min = flag and move on.
- **Three required fields** to close a contact record: (1) full name + verified current title, (2) full LinkedIn URL, (3) one-sentence rationale naming the project. If any missing, record stays open.
- Agent runs follow-up searches per company to extract project-level specifics (not just surface signals)
- Tab and headers are created automatically by the MCP tool
- Agent reads the sheet first via `read_proof_sheet` to check existing projects and skip duplicates (dedup by project, not fund)
- Results written incrementally as the agent finds them (not batched at the end)
- Google Sheet shared with `firebase-adminsdk-fbsvc@thepfi.iam.gserviceaccount.com`
- Uses `googleapis` npm package with the Firebase service account credentials

### Source Credibility Rules
- Every company picked by the agent **must come from a real, verifiable source** with an actual URL
- Acceptable: government filings, regulatory databases (permits.performance.gov, FERC, TCEQ, etc.), major industry publications, official project announcements
- Not acceptable: unverified sources, speculative content, AI-generated summaries, questionable/unknown websites
- No source URL = no save. Agent skips any result it cannot verify.

### Jurisdictional Verification (CRITICAL)
Before using any permitting pain point, bottleneck, or regulatory claim about a company, the agent MUST:
1. **Verify the permit/approval actually exists in that jurisdiction** — Not all counties have building permits. Not all project types require the same state-level permits. Confirm the specific jurisdiction (county, state, grid region) requires what you are claiming.
2. **Verify the project type is subject to that regulation** — A project may have designed around a permit requirement (e.g., no wells = no TCEQ water use authorization). Confirm the regulatory dependency applies to this specific project structure.
3. **Verify the agency/pipeline dependency is relevant** — If the project is not tying into FERC-regulated infrastructure, do not claim FERC is a bottleneck. Confirm the project actually interfaces with the regulatory body you are citing.
4. **Verify active relevance** — The issue must be happening now, not hypothetical. Find evidence the company is currently dealing with the specific friction you are describing.

If further research shows the permit, constraint, or dependency **does not apply** in that geography or project structure, the claim is **invalid and must be removed immediately**.

**No verified source = no claim. No jurisdictional confirmation = no insight. No evidence of active relevance = do not include.**

Zero tolerance for assumptions, inferred logic, or "probable scenarios." The system must prioritize credibility, precision, and defensibility over volume of insights.

### Outreach Channels
- Contacts can have email, LinkedIn, or both — both are stored in the Proof Sheet for use in outreach
- Outreach (email and LinkedIn) is handled manually outside this system

### Playwright / LinkedIn Session
- Used **only during lead discovery** (finding LinkedIn profile URLs via search)
- Uses persistent browser context saved at `~/.pfi-linkedin-session/`
- First time only: user logs into LinkedIn manually in the Playwright browser window
- Session persists across agent restarts
- Agent must always use `chromium.launchPersistentContext()`, never `chromium.launch()` or CDP
- **Not used for sending connection requests** — that's manual

### MCP Server (`Tools/mcp-server/index.js`)
6 tools:
- `search_web(query)` — Tavily web search
- `enrich_contact(firstName, lastName, domain)` — Hunter email finder, returns email or null
- `read_proof_sheet(spreadsheetId, tabName?)` — Read rows from any tab (default: "Proof Sheet")
- `write_proof_sheet(spreadsheetId, rows[], tabName?)` — Append rows to any tab. Auto-creates tab and headers. 10 fields: company, institutional_backer, fund_experience, classification, why_them, key_contact, contact_linkedin, contact_email, contact_rationale, contact_confidence
- `update_proof_sheet(spreadsheetId, updates[], tabName?)` — Update existing rows by company name

### Environment Variables (MCP Server)
- `TAVILY_API_KEY` — Tavily web search
- `HUNTER_API_KEY` — Hunter.io email finder
- `GMAIL_USER` — Gmail address for outreach
- `GMAIL_APP_PASSWORD` — Gmail app password

### Google Sheets Data Model
All data lives in spreadsheet `1VjCQBw86I8vTTbqyJ8EyJI4XnbaZbnge2ihGsDud2uI`, shared with `firebase-adminsdk-fbsvc@thepfi.iam.gserviceaccount.com`.

- **"Proof Sheet" tab** — `company, institutional_backer, fund_experience, classification, why_them, key_contact, contact_linkedin, contact_email, contact_rationale, contact_confidence`
- **"Learning Track" tab** — `name, company, role, related_project, related_friction, linkedin, email, channel, message`

## Assets
- Images live in `assets/`
- Design reference screenshots (PNG) are also in `assets/`

## File Map
```
PFI/
├── index.html                          # Marketing site
├── Tools/
│   ├── mcp-server/
│   │   ├── index.js                    # MCP server (Sheets + email + search)
│   │   └── package.json
│   ├── outreach-agent.md               # Agent instructions (task handlers, LinkedIn safety rules)
│   ├── PFI_Learning_Track_Addition.md  # Learning track instructions
│   ├── P.md                            # Implementation principles
│   └── SETUP.md                        # API keys and start command
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
