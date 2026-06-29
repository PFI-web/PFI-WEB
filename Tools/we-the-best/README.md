# WE THE BEST — shop ledger tooling

Standalone tooling for cleaning and reporting on the **`WE THE BEST - transactions`** Google
Sheet (auto repair + inspection + tire shop). Separate from the PFI outreach MCP server — these
are plain Node scripts driven by the service-account key.

> **Agents:** point your agent at **`START-HERE.md`** at the start of every WE THE BEST
> conversation — it's the orientation + tool inventory so nothing gets rebuilt.

## Layout
```
we-the-best/
├── START-HERE.md                   agent briefing — read first every session
├── README.md                       this file
├── package.json                    deps note (googleapis)
├── node_modules ─► ../mcp-server/node_modules   (symlink — shares the existing install)
├── docs/
│   └── cleanup-handoff.md          full status, rules, current numbers, open items — READ FIRST
├── scripts/                        reusable tools
│   ├── summary-tab.mjs             rebuild the Summary tab
│   ├── labor-and-daily-profit.mjs  set Labor formulas + daily profit totals
│   └── one-time/                   run-once historical cleaners & builders (kept for reference)
└── apps-script/
    └── we-the-best-onedit.gs       onEdit script the owner pastes into the sheet by hand
```

## Running
```sh
cd scripts            # (or scripts/one-time for historical scripts)
node summary-tab.mjs
```
- **Sheet ID:** `1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4`
- **Auth:** service-account key `thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json` at the **repo root**
  (scripts reference it by relative path; do not move it).
- **Dependencies:** `googleapis`, resolved via the `node_modules` symlink to `../mcp-server`.
  To make this folder fully standalone instead, delete the symlink and run `npm install`.

## Ground rule
**Never edit the owner's hand-entered numbers** (Amount Paid, Part Cost, Date, Type, Tip).
Only derive (formulas), summarize, format, or flag. The one authorized exception is the Apps
Script decrementing `Qty Left` on Tire Inventory. Full rules in `docs/cleanup-handoff.md`.
