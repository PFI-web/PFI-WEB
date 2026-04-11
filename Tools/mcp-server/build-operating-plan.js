import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(resolve(__dirname, '../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json'), 'utf8'));

const SPREADSHEET_ID = '1VjCQBw86I8vTTbqyJ8EyJI4XnbaZbnge2ihGsDud2uI';

const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

// ── Color helpers ──
function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
        red: parseInt(h.substring(0, 2), 16) / 255,
        green: parseInt(h.substring(2, 4), 16) / 255,
        blue: parseInt(h.substring(4, 6), 16) / 255
    };
}

const COLORS = {
    navy: hexToRgb('1B3A5C'),
    blue: hexToRgb('2563A8'),
    lightBlue: hexToRgb('D6E8F7'),
    teal: hexToRgb('0F6E56'),
    lightTeal: hexToRgb('D6F0EA'),
    amber: hexToRgb('854F0B'),
    lightAmber: hexToRgb('FEF3E2'),
    purple: hexToRgb('3C3489'),
    lightPurple: hexToRgb('EEEDFE'),
    red: hexToRgb('A32D2D'),
    lightRed: hexToRgb('FCEBEB'),
    gray: hexToRgb('5F5E5A'),
    lightGray: hexToRgb('F5F5F3'),
    white: hexToRgb('FFFFFF'),
    cccccc: hexToRgb('CCCCCC'),
};

function solidFill(color) {
    return { userEnteredFormat: { backgroundColor: color } };
}

function textFmt(opts = {}) {
    const f = {};
    if (opts.bold !== undefined) f.bold = opts.bold;
    if (opts.italic !== undefined) f.italic = opts.italic;
    if (opts.size !== undefined) f.fontSize = opts.size;
    if (opts.color) f.foregroundColor = opts.color;
    if (opts.font) f.fontFamily = opts.font;
    return f;
}

function cellData(value, opts = {}) {
    const cell = {
        userEnteredValue: typeof value === 'number'
            ? { numberValue: value }
            : { stringValue: String(value) },
        userEnteredFormat: {}
    };
    if (opts.bg) cell.userEnteredFormat.backgroundColor = opts.bg;
    if (opts.valign) cell.userEnteredFormat.verticalAlignment = opts.valign;
    if (opts.halign) cell.userEnteredFormat.horizontalAlignment = opts.halign;
    if (opts.wrap) cell.userEnteredFormat.wrapStrategy = 'WRAP';
    const tf = textFmt(opts);
    if (Object.keys(tf).length) cell.userEnteredFormat.textFormat = tf;
    if (opts.borders) cell.userEnteredFormat.borders = opts.borders;
    return cell;
}

function emptyCell(opts = {}) {
    const cell = { userEnteredFormat: {} };
    if (opts.bg) cell.userEnteredFormat.backgroundColor = opts.bg;
    return cell;
}

const thinBorder = {
    top: { style: 'SOLID', color: COLORS.cccccc },
    bottom: { style: 'SOLID', color: COLORS.cccccc },
    left: { style: 'SOLID', color: COLORS.cccccc },
    right: { style: 'SOLID', color: COLORS.cccccc }
};

function dropdownRule(values) {
    return {
        condition: { type: 'ONE_OF_LIST', values: values.map(v => ({ userEnteredValue: v })) },
        showCustomUi: true,
        strict: true
    };
}

// ── Tab builders ──

function buildDashboardRows() {
    const rows = [];
    const hdrStyle = { bg: COLORS.navy, color: COLORS.white, bold: true, size: 10, font: 'Arial', borders: thinBorder };

    // Row 0 (1): Title bar — merged A1:G1
    rows.push({ values: [cellData('PFI \u2014 2026 OPERATING PLAN', { bg: COLORS.navy, color: COLORS.white, bold: true, size: 18, font: 'Arial', valign: 'MIDDLE' })] });

    // Row 1 (2): Last updated
    rows.push({ values: [
        emptyCell(),
        cellData('Weekly standup dashboard  \u00b7  Last updated:', { color: COLORS.gray, italic: true, size: 9, font: 'Arial' }),
        emptyCell(),
        cellData('Apr 3, 2026', { color: COLORS.navy, bold: true, font: 'Arial' }),
    ] });

    // Row 2 (3): blank
    rows.push({ values: [emptyCell()] });

    // Row 3 (4): North Star heading
    rows.push({ values: [
        emptyCell(),
        cellData('NORTH STAR \u2014 THREE NUMBERS THAT DEFINE 2026', { color: COLORS.navy, bold: true, size: 10, font: 'Arial' }),
    ] });

    // Row 4 (5): North Star headers
    rows.push({ values: [
        emptyCell(),
        cellData('METRIC', hdrStyle),
        cellData('TARGET', hdrStyle),
        cellData('ACTUAL (update weekly)', hdrStyle),
        cellData('STATUS', hdrStyle),
        cellData('NOTES', hdrStyle),
    ] });

    // Rows 5-7 (6-8): North Star data
    const nsData = [
        ['Founding subscribers signed', '8\u201312 by Dec 31', '', '', 'Min 4 by Jun 30 to trigger build'],
        ['Projects in system', '1,200\u20131,500 by Dec 31', '', '', '0 until Jul 1. Track from build start.'],
        ['States producing', '3 delivered + 4 in progress', '', '', '3 states full. VA/OH/NC/NV in production.'],
    ];
    for (const ns of nsData) {
        rows.push({ values: [
            emptyCell(),
            cellData(ns[0], { font: 'Arial', borders: thinBorder }),
            cellData(ns[1], { font: 'Arial', borders: thinBorder }),
            cellData(ns[2], { bg: COLORS.lightBlue, font: 'Arial', borders: thinBorder }),
            cellData(ns[3], { font: 'Arial', borders: thinBorder }),
            cellData(ns[4], { font: 'Arial', borders: thinBorder }),
        ] });
    }

    // Row 8 (9): blank
    rows.push({ values: [emptyCell()] });

    // Row 9 (10): Gate Tracker heading
    rows.push({ values: [
        emptyCell(),
        cellData('GATE TRACKER \u2014 PASS/FAIL DETERMINES EVERYTHING DOWNSTREAM', { color: COLORS.navy, bold: true, size: 10, font: 'Arial' }),
    ] });

    // Row 10 (11): Gate headers
    rows.push({ values: [
        emptyCell(),
        cellData('GATE', hdrStyle),
        cellData('PASS BY', hdrStyle),
        cellData('CONDITION TO PASS', hdrStyle),
        cellData('STATUS', hdrStyle),
        cellData('ACTUAL DATE PASSED', hdrStyle),
    ] });

    // Rows 11-16 (12-17): Gate data
    const gates = [
        ['Gate 1 \u2014 Foundation', 'Apr 30, 2026', 'Methodology doc final. Term sheet locked. Website live. CRM enriched. Command Center operational.'],
        ['Gate 2 \u2014 Presell Active', 'May 1, 2026', 'All 12\u201315 briefings scheduled. Pipeline fully active across Tier 1 & 2.'],
        ['Gate 3 \u2014 Build Trigger', 'Jun 30, 2026', 'MINIMUM 4 signed founding subscriber agreements. Hard rule \u2014 no exceptions.'],
        ['Gate 4 \u2014 Production', 'Aug 1, 2026', '6 collectors live on TX/GA/AZ. 200+ projects in system. QA protocol running.'],
        ['Gate 5 \u2014 First Delivery', 'Oct 1, 2026', 'Platform live. Founding subscribers have access. TX Wave 1 delivered.'],
        ['Gate 6 \u2014 Year End', 'Dec 31, 2026', '1,200+ projects. 3 states delivered. 4 expansion states in production. 8\u201312 subscribers active.'],
    ];
    for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        const isGate3 = i === 2;
        const rowBg = isGate3 ? COLORS.lightRed : undefined;
        rows.push({ values: [
            emptyCell({ bg: rowBg }),
            cellData(g[0], { bold: true, font: 'Arial', borders: thinBorder, bg: rowBg }),
            cellData(g[1], { bold: true, color: COLORS.blue, halign: 'CENTER', font: 'Arial', borders: thinBorder, bg: rowBg }),
            cellData(g[2], { color: COLORS.gray, italic: true, wrap: true, font: 'Arial', borders: thinBorder, bg: rowBg }),
            cellData('\u2b1c Not Yet', { font: 'Arial', borders: thinBorder, bg: rowBg }),
            cellData('', { font: 'Arial', borders: thinBorder, bg: rowBg }),
        ] });
    }

    // Row 17 (18): blank
    rows.push({ values: [emptyCell()] });

    // Row 18 (19): This Week heading
    rows.push({ values: [
        emptyCell(),
        cellData('THIS WEEK \u2014 Critical items (update every Monday before standup)', { color: COLORS.navy, bold: true, size: 10, font: 'Arial' }),
    ] });

    // Row 19 (20): This Week headers
    rows.push({ values: [
        emptyCell(),
        cellData('ITEM', { bg: COLORS.blue, color: COLORS.white, bold: true, font: 'Arial' }),
        cellData('OWNER', { bg: COLORS.blue, color: COLORS.white, bold: true, font: 'Arial' }),
        cellData('DUE', { bg: COLORS.blue, color: COLORS.white, bold: true, font: 'Arial' }),
        cellData('DONE?', { bg: COLORS.blue, color: COLORS.white, bold: true, font: 'Arial' }),
    ] });

    // Rows 20-25 (21-26): blank weekly items
    for (let i = 0; i < 6; i++) {
        const bg = i % 2 === 1 ? COLORS.lightGray : COLORS.white;
        rows.push({ values: [
            emptyCell({ bg }),
            cellData('', { bg, font: 'Arial' }),
            cellData('', { bg, font: 'Arial' }),
            cellData('', { bg, font: 'Arial' }),
            cellData('', { bg, font: 'Arial' }),
        ] });
    }

    // Row 26 (27): blank
    rows.push({ values: [emptyCell()] });

    // Row 27 (28): Monthly heading
    rows.push({ values: [
        emptyCell(),
        cellData('MONTHLY PROGRESS TRACKER', { color: COLORS.navy, bold: true, size: 10, font: 'Arial' }),
    ] });

    // Row 28 (29): Monthly headers
    rows.push({ values: [
        emptyCell(),
        cellData('MONTH', { ...hdrStyle, wrap: true }),
        cellData('SUBSCRIBERS SIGNED', { ...hdrStyle, wrap: true }),
        cellData('PROJECTS IN SYSTEM', { ...hdrStyle, wrap: true }),
        cellData('STATES PRODUCING', { ...hdrStyle, wrap: true }),
        cellData('KEY WIN THIS MONTH', { ...hdrStyle, wrap: true }),
        cellData('KEY RISK / BLOCKER', { ...hdrStyle, wrap: true }),
    ] });

    // Rows 29-37 (30-38): Monthly data
    const months = [
        ['April 2026', '0', '0', '0', 'Presell readiness month', ''],
        ['May 2026', '2\u20133', '0', '0', 'First briefings and closes', ''],
        ['June 2026', '4\u20138', '0', '0', 'Gate 3: build trigger', ''],
        ['July 2026', '6\u20138', '0 (training)', '0 (build starts)', 'Collector training month', ''],
        ['August 2026', '8', '200\u2013350', '3 (ramp pace)', 'First live data', ''],
        ['September 2026', '8', '900\u20131,200', '3', 'Full production', ''],
        ['October 2026', '8\u201310', '1,000+', '3 delivered', 'Gate 5: first delivery', ''],
        ['November 2026', '10', '1,200+', '5\u20136', 'Expansion running', ''],
        ['December 2026', '10\u201312', '1,200\u20131,500', '7 (3 full + 4 partial)', 'Gate 6: year end check', ''],
    ];
    for (const m of months) {
        rows.push({ values: [
            emptyCell(),
            cellData(m[0], { font: 'Arial', borders: thinBorder }),
            cellData(m[1], { font: 'Arial', borders: thinBorder }),
            cellData(m[2], { font: 'Arial', borders: thinBorder }),
            cellData(m[3], { font: 'Arial', borders: thinBorder }),
            cellData(m[4], { font: 'Arial', borders: thinBorder }),
            cellData(m[5], { font: 'Arial', borders: thinBorder }),
        ] });
    }

    return rows;
}

function buildMasterTasksRows() {
    const rows = [];
    const hdrStyle = { bg: COLORS.navy, color: COLORS.white, bold: true, size: 10, font: 'Arial' };

    // Row 0: Headers
    rows.push({ values: [
        cellData('PHASE', hdrStyle),
        cellData('DUE DATE', hdrStyle),
        cellData('OWNER', hdrStyle),
        cellData('TASK', hdrStyle),
        cellData('DETAIL / NOTES', hdrStyle),
        cellData('STATUS', hdrStyle),
        cellData('COMPLETED', hdrStyle),
        cellData('STANDUP NOTES', hdrStyle),
    ] });

    // Phase colors
    const phaseColors = {
        'Gate 1 \u2013 This Week': { bg: COLORS.lightBlue, text: COLORS.blue },
        'Phase 1 \u2013 Foundation': { bg: COLORS.lightTeal, text: COLORS.teal },
        'Phase 2 \u2013 Presell': { bg: COLORS.lightPurple, text: COLORS.purple },
        'Phase 3 \u2013 Build': { bg: COLORS.lightAmber, text: COLORS.amber },
        'Phase 4 \u2013 Delivery': { bg: COLORS.lightRed, text: COLORS.red },
        'Ongoing': { bg: COLORS.lightGray, text: COLORS.gray },
        'SOP \u2013 Phase 0': { bg: COLORS.lightTeal, text: COLORS.teal },
        'SOP \u2013 Phase 1': { bg: COLORS.lightTeal, text: COLORS.teal },
        'SOP \u2013 Phase 2': { bg: COLORS.lightPurple, text: COLORS.purple },
        'SOP \u2013 Phase 3': { bg: COLORS.lightAmber, text: COLORS.amber },
        'SOP \u2013 Phase 4': { bg: COLORS.lightRed, text: COLORS.red },
    };

    const ownerColors = {
        'Gabriel': { bg: COLORS.lightBlue, text: COLORS.blue },
        'Alieel': { bg: COLORS.lightTeal, text: COLORS.teal },
        'Both': { bg: COLORS.lightPurple, text: COLORS.purple },
    };

    // All 65 tasks
    const tasks = [
        // GATE 1 — THIS WEEK (7)
        ['Gate 1 \u2013 This Week', 'Apr 4', 'Gabriel', 'Begin methodology document', 'Draft Section 1: what PFI measures and why variance \u2014 not delay \u2014 is the correct frame. Working draft by Apr 4. Final by Apr 18.'],
        ['Gate 1 \u2013 This Week', 'Apr 4', 'Gabriel', 'Lock delivery date commitment', 'Specific month for 3-state release goes in writing. Load-bearing for the term sheet.'],
        ['Gate 1 \u2013 This Week', 'Apr 4', 'Alieel', 'Load all Tier 1 contacts into CRM', 'Blackstone, GIP/BlackRock, KKR, Apollo, Stonepeak, Brookfield, Energy Capital Partners. Full 15-column structure for all 7.'],
        ['Gate 1 \u2013 This Week', 'Apr 4', 'Alieel', 'Run Apollo/Hunter enrichment on Tier 1', 'Verify emails for all 7 contacts. Log source and confidence rating for each.'],
        ['Gate 1 \u2013 This Week', 'Apr 4', 'Alieel', 'Submit website revision instructions', 'Rate lock language, founding cohort cap (12 institutions), institutional selectivity signals, managed inquiry contact mechanism, typography corrections.'],
        ['Gate 1 \u2013 This Week', 'Apr 4', 'Alieel', 'Test Outreach Command Center end-to-end', 'Confirm copy generation via Anthropic API works. Confirm Gmail MCP can send. Load 3 contacts and generate copy variants.'],
        ['Gate 1 \u2013 This Week', 'Apr 4', 'Alieel', 'Proof Sheet confidence tier review', 'Review all contacts. Flag low-confidence entries. Wave 1 list confirmed with only high-confidence contacts.'],

        // PHASE 1 — FOUNDATION (11)
        ['Phase 1 \u2013 Foundation', 'Apr 18', 'Gabriel', 'Methodology document \u2014 final and locked', 'All sections complete: what PFI measures, five milestones defined, source hierarchy, statistical construction logic, what PFI does NOT do. Must survive IC partner scrutiny.'],
        ['Phase 1 \u2013 Foundation', 'Apr 18', 'Gabriel', 'Milestone taxonomy \u2014 pressure-tested', 'Pull real permit records from TX, GA, AZ. Test all 5 milestones against actual documents. Two-collector same-document same-date test must pass before this is marked done.'],
        ['Phase 1 \u2013 Foundation', 'Apr 18', 'Gabriel', 'Term sheet \u2014 final language locked', '$25K/yr, permanent rate lock, 3 states + 4 project types, named seat structure, 12-institution cap, specific delivery date.'],
        ['Phase 1 \u2013 Foundation', 'Apr 18', 'Alieel', 'Tier 2 contact enrichment \u2014 complete', 'All 12\u201315 target institutions enriched. Every contact: name, title, verified email, LinkedIn URL, warm path, anticipated objection.'],
        ['Phase 1 \u2013 Foundation', 'Apr 18', 'Alieel', 'Website live at permitfriction.com', 'All revision instructions implemented. Gabriel reviews preview link before going live. Rate lock framing confirmed. Institutional posture confirmed.'],
        ['Phase 1 \u2013 Foundation', 'Apr 25', 'Gabriel', 'SOP Layer 1 \u2014 methodology SOPs begun', 'Start SOPs 1.1\u20131.9 (10 methodology SOPs). Milestone taxonomy must be locked first. Parallel to presell.'],
        ['Phase 1 \u2013 Foundation', 'Apr 25', 'Alieel', 'SOP Layer 1 template \u2014 built in Notion', 'Taxonomy template and state overlay template structure built. Ready for Gabriel\'s definitions.'],
        ['Phase 1 \u2013 Foundation', 'Apr 25', 'Alieel', 'Outreach sequencing plan \u2014 finalized', 'Week-by-week outreach calendar for May. Warm paths confirmed for first 6 institutions. Tier 1 in Week 1, Tier 2 beginning Week 3.'],
        ['Phase 1 \u2013 Foundation', 'Apr 30', 'Gabriel', 'First 2\u20133 methodology briefings complete', 'April 21 onwards. Warm paths only. Tier 1 targets. Methodology doc as leave-behind. Briefing = education, not sales.'],
        ['Phase 1 \u2013 Foundation', 'Apr 30', 'Alieel', 'Post-briefing follow-up executed (Institutions 1\u20133)', 'Thank-you note within 24 hours. Methodology doc attached. Term sheet ready to send on request.'],
        ['Phase 1 \u2013 Foundation', 'Apr 30', 'Alieel', 'Signal Brief #1 \u2014 draft begun', 'Dry, factual, non-prescriptive. Topic: Texas BESS opposition patterns or permitting variance in data centers. For background placement with infrastructure journalists.'],

        // SOP PHASE 0 (2)
        ['SOP \u2013 Phase 0', 'Apr 4', 'Alieel', 'Create Notion SOP workspace \u2014 four-layer folder structure', 'Set up PFI Operations Manual root in Notion. Create four sections: Methodology (SOPs 1.1\u20131.10), Data Collection (SOPs 2.1\u20132.15), Quality Assurance (SOPs 3.1\u20133.8), Product & Delivery (SOPs 4.1\u20134.9). Add a fifth section: Jurisdiction Playbooks.'],
        ['SOP \u2013 Phase 0', 'Apr 7', 'Gabriel', 'Identify three pressure-test projects with confirmed source access', 'One TX data center (Travis County preferred). One AZ large manufacturing with environmental review (Maricopa County). One GA project that stalled or was withdrawn. Confirm full public record access.'],

        // SOP PHASE 1 (10)
        ['SOP \u2013 Phase 1', 'Apr 11', 'Gabriel', 'SOP 1.1: Project Qualification Criteria \u2014 draft and lock', 'Binary decision tree: four gates \u2014 capital-intensive, grid-significant, publicly recorded, multi-agency permitting. Include explicit examples of what qualifies and what does not.'],
        ['SOP \u2013 Phase 1', 'Apr 11', 'Gabriel', 'SOP 1.2: Project Type Definitions \u2014 draft and lock', 'Strict definitions for each of the four project types PFI v1 covers: data centers, large manufacturing, utility-scale solar, BESS. Inclusion criteria, exclusion criteria, edge case handling.'],
        ['SOP \u2013 Phase 1', 'Apr 16', 'Gabriel', 'SOP 1.3: Milestone Glossary \u2014 working draft', 'Five milestone definitions (M1\u2013M5). For each: strict definition, valid evidence examples, invalid evidence (disallowed proxies), known failure mode. DRAFT until pressure test.'],
        ['SOP \u2013 Phase 1', 'Apr 16', 'Gabriel', 'SOP 1.4: Source Hierarchy \u2014 working draft', 'Five-tier source priority system. What counts as each tier with real document examples. Permanently excluded source types. Rule: tiers cannot be skipped.'],
        ['SOP \u2013 Phase 1', 'Apr 16', 'Gabriel', 'SOP 1.5: Missing Data Protocol \u2014 working draft', 'Five scenarios and correct treatments. Decision tree format so a collector resolves a missing data situation in under 30 seconds.'],
        ['SOP \u2013 Phase 1', 'Apr 18', 'Both', '\u26a0 PRESSURE TEST: Apply draft definitions to all three test projects', 'Gabriel and Alieel each independently extract all five milestones from the same three test projects using draft SOPs 1.3, 1.4, 1.5. Compare results. Rewrite until two collectors, same document, same date.'],
        ['SOP \u2013 Phase 1', 'Apr 22', 'Gabriel', 'SOP 1.3, 1.4, 1.5: Finalize post-pressure-test', 'Rewrite any definitions that produced ambiguity during the pressure test. Document every revision with the reason. Lock these three SOPs.'],
        ['SOP \u2013 Phase 1', 'Apr 25', 'Gabriel', 'SOP 1.6: Status Resolution Definitions \u2014 write and lock', 'Strict definitions for each project status: approved, approved with conditions, withdrawn, denied, stalled (180-day threshold), unknown.'],
        ['SOP \u2013 Phase 1', 'Apr 25', 'Gabriel', 'SOP 1.7: Cross-Jurisdiction Equivalence Rules \u2014 write and lock', 'Rules governing how locally-named milestones map to PFI\'s standard taxonomy. PFI measures functional equivalents, not named equivalents.'],
        ['SOP \u2013 Phase 1', 'Apr 25', 'Gabriel', 'SOP 1.9: Methodology Version Control \u2014 write and lock', 'How SOP versions are numbered. How changes are documented. How version numbers attach to project records. What triggers a version increment.'],
        ['SOP \u2013 Phase 1', 'Apr 30', 'Alieel', 'Load all locked Phase 1 SOPs into Notion workspace', 'SOPs 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9 formatted and uploaded to Methodology section of Notion.'],

        // SOP PHASE 2 (14)
        ['SOP \u2013 Phase 2', 'May 15', 'Gabriel', 'SOP 2.1: Master SOP \u2014 complete draft', 'The central operational document. Weaves all locked Layer 1 SOPs into one manual. Adds: project record five-layer structure, escalation protocol, county pattern classification guide, forbidden actions list.'],
        ['SOP \u2013 Phase 2', 'May 15', 'Alieel', 'SOP 2.2: Project Discovery Workflow \u2014 draft and review', 'How a collector finds qualifying projects in a new jurisdiction. Where to start, what search terms to use, how to identify potential projects.'],
        ['SOP \u2013 Phase 2', 'May 15', 'Both', 'SOP 2.3: County Pattern Classification Guide \u2014 build decision tree', 'Five-pattern decision tree: Agenda Platform, Planning Portal, PDF-Only, Hybrid, State-Driven. Quick diagnostic \u2014 routes a collector to the correct pattern in under 5 minutes.'],
        ['SOP \u2013 Phase 2', 'May 22', 'Alieel', 'SOP 2.4: Collection Playbook \u2014 Agenda Platform Counties (Pattern 1)', 'Step-by-step for CivicPlus, PrimeGov, Legistar, Granicus. Where to go, what to click, what to download, what to extract.'],
        ['SOP \u2013 Phase 2', 'May 22', 'Alieel', 'SOP 2.5: Collection Playbook \u2014 Planning Portal Counties (Pattern 2)', 'Step-by-step for counties with dedicated online planning/permitting portals. Portal navigation, case number lookup, document download, field extraction.'],
        ['SOP \u2013 Phase 2', 'May 22', 'Alieel', 'SOP 2.6: Collection Playbook \u2014 PDF-Only Counties (Pattern 3)', 'Step-by-step for counties where records exist only as scanned PDFs with no search. OCR tools, manual extraction, source attribution for scanned documents.'],
        ['SOP \u2013 Phase 2', 'May 22', 'Alieel', 'SOP 2.7: Collection Playbook \u2014 Hybrid Counties (Pattern 4)', 'Step-by-step for counties that mix online portals with PDF archives. Which milestones come from which source type.'],
        ['SOP \u2013 Phase 2', 'May 22', 'Alieel', 'SOP 2.8: Collection Playbook \u2014 State-Driven Counties (Pattern 5)', 'Step-by-step for jurisdictions where state agencies hold primary permitting authority. TCEQ in Texas, EPD in Georgia, ADEQ in Arizona.'],
        ['SOP \u2013 Phase 2', 'May 22', 'Alieel', 'SOPs 2.9, 2.10, 2.11: Data Entry Guide, Escalation Protocol, Forbidden Actions', 'Standalone versions of sections within the Master SOP (2.1). Extract each section, format as its own Notion page for quick reference.'],
        ['SOP \u2013 Phase 2', 'May 29', 'Alieel', 'SOP 2.12: State Overlay \u2014 Texas', 'State identity, regulatory structure, agency list (TCEQ, county planning boards, ERCOT), portal reference table, county pattern map, terminology translation, known quirks, high-activity county list.'],
        ['SOP \u2013 Phase 2', 'May 29', 'Alieel', 'SOP 2.13: State Overlay \u2014 Georgia', 'Same structure as 2.12. Agencies: EPD, county planning. Known quirks: Georgia Power IRP process. High-activity counties: Bartow, Carroll, Douglas, Paulding, Fulton, Gwinnett.'],
        ['SOP \u2013 Phase 2', 'May 29', 'Alieel', 'SOP 2.14: State Overlay \u2014 Arizona', 'Same structure as 2.12. Agencies: ADEQ, county planning. Known quirks: water resource constraints, seasonal public comment processes, tribal and federal overlay.'],
        ['SOP \u2013 Phase 2', 'May 29', 'Alieel', 'SOP 2.15: Blank State Overlay Template', 'The reusable template built as a Notion template page. Used for every new state added after TX/GA/AZ.'],
        ['SOP \u2013 Phase 2', 'May 31', 'Both', '\u26a0 GATE TEST: Alieel extracts one full project using only Master SOP + state overlay', 'One real project from TX, GA, or AZ. All five milestones extracted using only SOP 2.1 and state overlay. Zero clarification needed = pass.'],

        // SOP PHASE 3 (7)
        ['SOP \u2013 Phase 3', 'Jun 1', 'Gabriel', 'SOP 3.1: Blind Re-Extraction Protocol \u2014 write and lock', 'How the QA sample is selected (10\u201320% random). How the second extraction is assigned without seeing the original. Field by field comparison.'],
        ['SOP \u2013 Phase 3', 'Jun 1', 'Gabriel', 'SOP 3.2: Discrepancy Triage Workflow \u2014 write and lock', 'How to compare two extractions. How to classify minor vs. major. Triage question: collector error or definition failure? Decision tree format.'],
        ['SOP \u2013 Phase 3', 'Jun 1', 'Gabriel', 'SOP 3.3: Definition Revision Protocol \u2014 write and lock', 'Trigger: three or more discrepancies on the same milestone = formal revision required. Self-correcting mechanism.'],
        ['SOP \u2013 Phase 3', 'Jun 1', 'Alieel', 'SOP 3.5: Field-Level Validation Checklist \u2014 build', 'Automated or manual checks on every project record. Milestones in chronological order, source attribution present, valid project type, valid status tag, no blank fields without flags.'],
        ['SOP \u2013 Phase 3', 'Jun 1', 'Alieel', 'SOP 3.6: Discrepancy Log \u2014 build and configure in Notion', 'Live log as Notion database. Fields: project ID, milestone affected, collector ID, QA reviewer ID, original date, re-extracted date, discrepancy type, resolution, date resolved, SOP version.'],
        ['SOP \u2013 Phase 3', 'Jun 15', 'Gabriel', 'SOP 3.4: Retroactive Audit Protocol \u2014 write', 'When a definition changes: identify affected projects, re-extract milestone, document change in audit trail.'],
        ['SOP \u2013 Phase 3', 'Jun 15', 'Gabriel', 'SOP 3.8: Retroactive Correction Protocol \u2014 write', 'How errors found after record is locked get corrected. Original preserved, correction logged with reason and date.'],
        ['SOP \u2013 Phase 3', 'Aug 7', 'Alieel', 'SOP 3.7: QA Reporting Template \u2014 build', 'Periodic QA report: discrepancy count by type, milestone, state, resolution status. Build after first week of live collection.'],

        // SOP PHASE 4 (9)
        ['SOP \u2013 Phase 4', 'Sep 15', 'Gabriel', 'SOP 4.1: Data Refresh Protocol \u2014 write', 'How and when index aggregations are recomputed. What triggers a refresh, who initiates it, validation before new outputs go live.'],
        ['SOP \u2013 Phase 4', 'Sep 15', 'Gabriel', 'SOP 4.2: Aggregation Computation Rules \u2014 write', 'Deterministic rules for distributions, percentiles, confidence tiers. Pre-computed, cached. Outputs: P25, P50, P75, P90 per state per project type.'],
        ['SOP \u2013 Phase 4', 'Sep 15', 'Gabriel', 'SOP 4.3: PDF Artifact Generation Rules \u2014 write', 'Branded PDF snapshots. Time-stamped, watermarked, methodology footnoted, immutable once generated.'],
        ['SOP \u2013 Phase 4', 'Sep 15', 'Gabriel', 'SOP 4.4: Web Interface Content Rules \u2014 write', 'Required metadata on every index view: project count, confidence tier, date range, inclusion criteria. Disallowed: rankings, custom formulas, forecast toggles, predictive overlays.'],
        ['SOP \u2013 Phase 4', 'Sep 15', 'Alieel', 'SOP 4.5: Subscriber Onboarding Protocol \u2014 write', 'Institution-level accounts, role-based permissions, no self-service signup. Named seat model.'],
        ['SOP \u2013 Phase 4', 'Sep 15', 'Gabriel', 'SOP 4.8: Access Control and Audit Trail Rules \u2014 write', 'All access logged. All exports logged. Immutable audit trail. Permissions structure.'],
        ['SOP \u2013 Phase 4', 'Sep 15', 'Gabriel', 'SOP 4.9: Methodology Publication Protocol \u2014 write', 'Subscriber-facing methodology document: definitions, inclusion/exclusion criteria, milestone logic, treatment of missing data, explicit limitations.'],
        ['SOP \u2013 Phase 4', 'Sep 30', 'Alieel', 'SOP 4.6: Subscriber Communication Rules \u2014 write', 'Five allowed email categories. Tone: institutional, sparse, non-promotional. Never sent: onboarding drips, engagement nudges, feature announcements.'],
        ['SOP \u2013 Phase 4', 'Sep 30', 'Alieel', 'SOP 4.7: Admin Console Usage Guide \u2014 write', 'Behavioral signals tracked: entry points, filters, comparisons, exports. Not optimized: DAU, engagement, feature adoption.'],

        // PHASE 2 — PRESELL (13)
        ['Phase 2 \u2013 Presell', 'May 31', 'Gabriel', 'All Tier 1 methodology briefings complete', '7 Priority Rank 1 institutions briefed. Note every objection for methodology doc refinement.'],
        ['Phase 2 \u2013 Presell', 'May 31', 'Gabriel', 'First 3\u20134 founding subscriber closes', 'Target: 2\u20133 by May 15. 3\u20134 by May 31. Term sheet sent day of briefing for interested parties.'],
        ['Phase 2 \u2013 Presell', 'May 15', 'Gabriel', 'Methodology document v2 \u2014 refined', 'Incorporate objections surfaced in May briefings. Version 2 complete by May 15.'],
        ['Phase 2 \u2013 Presell', 'Weekly', 'Alieel', 'Pipeline CRM \u2014 daily status updates', 'Every active conversation: stage, last contact date, next action, sentiment, follow-up due date.'],
        ['Phase 2 \u2013 Presell', 'May 31', 'Alieel', 'All Tier 2 briefings scheduled', 'Remaining 8 institutions scheduled for May\u2013June briefings. Calendar confirmed.'],
        ['Phase 2 \u2013 Presell', 'May 31', 'Alieel', 'SOP Layers 1 and 2 \u2014 complete draft (25 SOPs)', 'Master SOP + 14 supporting SOPs including TX, GA, AZ state overlays. Working draft complete.'],
        ['Phase 2 \u2013 Presell', 'May 31', 'Alieel', 'Signal Brief #1 \u2014 complete and placed', 'Placed with 2\u20133 infrastructure journalists as background context. Never attributed. Never marketed.'],
        ['Phase 2 \u2013 Presell', 'May 31', 'Alieel', 'Collector candidate sourcing \u2014 shortlist of 6\u20138', 'Identify and pre-screen candidates. Do not hire yet. List ready for immediate hire once Gate 3 passes.'],
        ['Phase 2 \u2013 Presell', 'Jun 30', 'Gabriel', '\u26a0 GATE 3: Minimum 4 signed founding subscriber agreements', 'HARD RULE. No build costs incurred until this passes. 4 signed = $100K = build funded.'],
        ['Phase 2 \u2013 Presell', 'Jun 30', 'Gabriel', 'All Tier 2 methodology briefings complete', 'All 12\u201315 institutions briefed. Every open term sheet has received a direct close conversation.'],
        ['Phase 2 \u2013 Presell', 'Jun 30', 'Alieel', 'All 42 SOPs \u2014 complete across all 4 layers', 'Layer 1 (10 methodology), Layer 2 (15 collection), Layer 3 (8 QA), Layer 4 (9 product). All complete before first collector hired.'],
        ['Phase 2 \u2013 Presell', 'Jun 30', 'Alieel', 'Tech lead \u2014 hired and contracted', 'Offshore senior. LATAM or India/Pakistan. ~$6,500/month. Keystone hire. Do not compromise on seniority.'],
        ['Phase 2 \u2013 Presell', 'Jun 30', 'Alieel', 'Backend (x2) + frontend (x1) engineers \u2014 contracted', 'Full engineering team assembled. Backend ~$4,000/month each. Frontend ~$3,500/month.'],

        // PHASE 3 — BUILD (14)
        ['Phase 3 \u2013 Build', 'Jul 7', 'Gabriel', 'Master SOP \u2014 collector-ready version locked', 'Deterministic, zero ambiguity. Two-collector same-document same-date test passed. No collection starts before this.'],
        ['Phase 3 \u2013 Build', 'Jul 14', 'Alieel', '6 offshore collectors \u2014 hired and training begins', 'All 6 contracted. Training: 15 test projects each under supervision before live collection starts.'],
        ['Phase 3 \u2013 Build', 'Jul 14', 'Alieel', 'Engineering team \u2014 all roles contracted and producing', 'Tech lead + 2 backend + 1 frontend + 0.5 data engineer. Schema design begins week of July 7.'],
        ['Phase 3 \u2013 Build', 'Jul 21', 'Gabriel', 'Collector training \u2014 final assessment passed', 'Each collector processes 10 test projects checked against answers. SOP gaps identified and fixed.'],
        ['Phase 3 \u2013 Build', 'Jul 21', 'Alieel', 'TX live collection \u2014 begins', 'First real projects entering system. Monitor closely. Track projects per analyst per week from day 1.'],
        ['Phase 3 \u2013 Build', 'Jul 28', 'Alieel', 'GA and AZ live collection \u2014 begins', 'All 3 states at production pace. Target 5\u20138 projects per collector per week in ramp phase.'],
        ['Phase 3 \u2013 Build', 'Jul 28', 'Alieel', 'Engineering: canonical schema locked', 'Ingestion pipeline cannot be built until schema is locked. Tech lead owns this gate.'],
        ['Phase 3 \u2013 Build', 'Aug 31', 'Alieel', 'Production tracking \u2014 projects per analyst per week dashboard live', 'Simple tracking sheet updated weekly. This is the compass metric. Never stop tracking it.'],
        ['Phase 3 \u2013 Build', 'Aug 31', 'Gabriel', 'QA: first full audit cycle complete', '10\u201320% random audit of all projects. Flag errors. Trigger SOP revision if systemic.'],
        ['Phase 3 \u2013 Build', 'Aug 31', 'Gabriel', 'Founding subscriber update \u2014 progress memo sent', 'Brief, factual, confidence-building. Milestone count, state status, delivery timeline confirmed.'],
        ['Phase 3 \u2013 Build', 'Sep 30', 'Both', '\u26a0 GATE 4: 2,000\u20133,000 projects in system', 'All 3 states at full production. SOPs stable. QA clean. Platform approaching beta.'],
        ['Phase 3 \u2013 Build', 'Sep 30', 'Alieel', 'Expansion state overlays \u2014 VA, OH, NC, NV drafted', 'Agency lists, portals, county guides for all 4 expansion states. Ready for Phase 4.'],
        ['Phase 3 \u2013 Build', 'Sep 30', 'Alieel', 'Collector team expansion \u2014 10\u201312 collectors sourced', '4\u20136 additional collectors identified for expansion states. Ready to hire October 1.'],
        ['Phase 3 \u2013 Build', 'Sep 30', 'Alieel', 'Engineering platform beta \u2014 internal walkthrough complete', 'Index view, comparison view, methodology pages functional. Internal review done.'],

        // PHASE 4 — DELIVERY (9)
        ['Phase 4 \u2013 Delivery', 'Oct 7', 'Gabriel', '\u26a0 GATE 5: Platform delivered to founding subscribers', 'Personal communication to each subscriber. Access details confirmed. Platform live and stable.'],
        ['Phase 4 \u2013 Delivery', 'Oct 7', 'Gabriel', 'First Quarterly Reference Report \u2014 placed', 'Distributed to pre-selected regulators, lenders, select boards. Not marketed \u2014 placed with context.'],
        ['Phase 4 \u2013 Delivery', 'Oct 14', 'Alieel', 'VA and OH collectors \u2014 onboarded and producing', 'New collectors trained on expansion state overlays. Live collection by October 14.'],
        ['Phase 4 \u2013 Delivery', 'Oct 21', 'Alieel', 'NC and NV collection \u2014 begins', '4 expansion states now active. Track projects per analyst per week across full expanded team.'],
        ['Phase 4 \u2013 Delivery', 'Nov 30', 'Gabriel', 'Post-founding pricing \u2014 2027 rate established', 'New subscribers after founding cohort closes pay higher standard rate. Documented and confirmed.'],
        ['Phase 4 \u2013 Delivery', 'Nov 30', 'Gabriel', '2027 plan \u2014 first draft complete', 'Path to 12\u201315 states, second subscriber tier, EI pre-planning outline, next state cohort.'],
        ['Phase 4 \u2013 Delivery', 'Dec 31', 'Both', '\u26a0 GATE 6: Year-end success check', '1,200\u20131,500 projects. TX/GA/AZ delivered. VA/OH/NC/NV in production. 8\u201312 subscribers active. Methodology never compromised.'],
        ['Phase 4 \u2013 Delivery', 'Dec 31', 'Gabriel', '2027 plan \u2014 final and locked', 'TEG architecture documented internally. EI pre-planning. Founding subscriber renewal strategy confirmed.'],
        ['Phase 4 \u2013 Delivery', 'Dec 31', 'Alieel', 'Second Quarterly Reference Report \u2014 placed', 'Q4 reference report produced and placed with same distribution list as Q1.'],

        // ONGOING (6)
        ['Ongoing', 'Weekly', 'Gabriel', 'Methodology integrity check', 'Did any GTM pressure touch a methodological decision this week? This check never stops. Non-negotiable.'],
        ['Ongoing', 'Weekly', 'Gabriel', 'Presell pipeline review (Phase 1\u20132)', 'Active conversations, follow-ups due, closes pending. Every open conversation has a next action.'],
        ['Ongoing', 'Weekly', 'Alieel', 'CRM pipeline \u2014 updated', 'Every active contact: current stage, last contact date, next action, notes.'],
        ['Ongoing', 'Weekly', 'Alieel', 'Production tracking (Phase 3\u20134)', 'Projects per analyst per week logged. Outliers flagged. QA issues escalated to Gabriel.'],
        ['Ongoing', 'Monthly', 'Both', 'State coverage + dataset depth report', 'Total project count by state. QA status per state. Trend vs prior month.'],
        ['Ongoing', 'Monthly', 'Gabriel', 'Internal memo', 'What was learned this month. What broke. What was refined. What changed in the plan.'],
    ];

    for (const t of tasks) {
        const pc = phaseColors[t[0]] || { bg: COLORS.lightGray, text: COLORS.gray };
        const oc = ownerColors[t[2]] || { bg: COLORS.white, text: COLORS.gray };
        rows.push({ values: [
            cellData(t[0], { bg: pc.bg, color: pc.text, font: 'Arial', size: 10, bold: true }),
            cellData(t[1], { font: 'Arial', size: 10 }),
            cellData(t[2], { bg: oc.bg, color: oc.text, font: 'Arial', size: 10 }),
            cellData(t[3], { bold: true, font: 'Arial', size: 10, wrap: true }),
            cellData(t[4], { italic: true, color: COLORS.gray, font: 'Arial', size: 9, wrap: true }),
            cellData('\u2b1c Not Started', { font: 'Arial', size: 10 }),
            cellData('', { font: 'Arial', size: 10 }),
            cellData('', { font: 'Arial', size: 10, wrap: true }),
        ] });
    }

    // 20 blank rows
    for (let i = 0; i < 20; i++) {
        const bg = i % 2 === 0 ? COLORS.lightGray : COLORS.white;
        rows.push({ values: Array(8).fill(null).map(() => emptyCell({ bg })) });
    }

    return rows;
}

function buildStandupLogRows() {
    const rows = [];
    const hdrStyle = { bg: COLORS.navy, color: COLORS.white, bold: true, font: 'Arial', size: 10, wrap: true };

    rows.push({ values: [
        cellData('DATE', hdrStyle),
        cellData('NORTH STAR UPDATE', hdrStyle),
        cellData('WHAT WAS DISCUSSED', hdrStyle),
        cellData('DECISIONS MADE', hdrStyle),
        cellData('BLOCKERS RAISED', hdrStyle),
        cellData('WHO IS DOING WHAT BY NEXT WEEK', hdrStyle),
    ] });

    // First entry
    rows.push({ values: [
        cellData('March 31, 2026', { font: 'Arial', wrap: true }),
        cellData('0 / 0 / 0', { font: 'Arial', wrap: true }),
        cellData('Kickoff standup. Reviewed 2026 plan. Confirmed Gate 1 deliverables.', { font: 'Arial', wrap: true }),
        cellData('Methodology doc draft due Apr 18. Website revisions submitted this week.', { font: 'Arial', wrap: true }),
        cellData('Methodology doc not started yet.', { font: 'Arial', wrap: true }),
        cellData('Gabriel: begin methodology doc. Alieel: load Tier 1 CRM, run Apollo enrichment, submit website revisions.', { font: 'Arial', wrap: true }),
    ] });

    // 50 blank rows
    for (let i = 0; i < 50; i++) {
        const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
        rows.push({ values: Array(6).fill(null).map(() => emptyCell({ bg })) });
    }

    return rows;
}

function buildGateTrackerRows() {
    const rows = [];
    const hdrStyle = { bg: COLORS.navy, color: COLORS.white, bold: true, font: 'Arial', size: 10, wrap: true };

    rows.push({ values: [
        cellData('GATE', hdrStyle),
        cellData('TARGET DATE', hdrStyle),
        cellData('CONDITIONS TO PASS', hdrStyle),
        cellData('WHAT HAPPENS IF IT FAILS', hdrStyle),
        cellData('STATUS', hdrStyle),
        cellData('ACTUAL DATE PASSED', hdrStyle),
        cellData('NOTES', hdrStyle),
    ] });

    const gateData = [
        {
            name: 'Gate 1 \u2014 Foundation', bg: COLORS.lightBlue, target: 'Apr 30, 2026',
            conditions: '1. Methodology doc final and locked  2. Term sheet finalized  3. Website live with correct language  4. CRM fully enriched (15 contacts)  5. Command Center operational',
            fail: 'First briefings can\'t start May 1. Every week of delay here costs two weeks at the back end.'
        },
        {
            name: 'Gate 2 \u2014 Presell Active', bg: COLORS.lightTeal, target: 'May 1, 2026',
            conditions: '1. All 12\u201315 briefings scheduled  2. First wave April briefings done  3. Pipeline fully active  4. Copy variants generated for all entity types',
            fail: 'June close target is at risk. Widen the pipeline immediately if thin by May 15.'
        },
        {
            name: 'Gate 3 \u2014 Build Trigger \u26a0', bg: COLORS.lightRed, target: 'Jun 30, 2026',
            conditions: 'MINIMUM 4 signed founding subscriber agreements. Hard rule \u2014 no build costs incurred until this passes. 4 = $100K = build funded. Push for 6\u20138.',
            fail: 'Build does not start. No collectors hired. No engineering spend. Assess and decide.'
        },
        {
            name: 'Gate 4 \u2014 Production Running', bg: COLORS.lightAmber, target: 'Aug 1, 2026',
            conditions: '1. 6 collectors live on TX/GA/AZ  2. 200+ projects in system  3. QA protocol running (10\u201320% audit)  4. Projects per analyst per week being tracked weekly',
            fail: 'October delivery date is at risk. Add collectors or increase hours \u2014 but never skip QA.'
        },
        {
            name: 'Gate 5 \u2014 First Delivery', bg: COLORS.lightPurple, target: 'Oct 1, 2026',
            conditions: '1. Platform live and stable  2. Founding subscribers have access  3. TX Wave 1 (data centers + manufacturing) delivered  4. VA/OH collection has begun',
            fail: 'Subscribers are waiting. Communicate proactively. Delay is recoverable; silence is not.'
        },
        {
            name: 'Gate 6 \u2014 Year End', bg: COLORS.lightGray, target: 'Dec 31, 2026',
            conditions: '1. 1,200\u20131,500 projects in system  2. TX/GA/AZ delivered to subscribers  3. VA/OH/NC/NV in active production  4. 8\u201312 subscribers active  5. Methodology never compromised',
            fail: 'Assess which condition failed. Build 2027 plan around closing the gap.'
        },
    ];

    for (const g of gateData) {
        rows.push({ values: [
            cellData(g.name, { bg: g.bg, bold: true, font: 'Arial', size: 10, wrap: true }),
            cellData(g.target, { bold: true, font: 'Arial', size: 10, halign: 'CENTER' }),
            cellData(g.conditions, { font: 'Arial', size: 10, wrap: true }),
            cellData(g.fail, { italic: true, color: COLORS.red, font: 'Arial', size: 10, wrap: true }),
            cellData('\u2b1c Not Yet', { font: 'Arial', size: 10 }),
            cellData('', { font: 'Arial', size: 10 }),
            cellData('', { font: 'Arial', size: 10, wrap: true }),
        ] });
    }

    return rows;
}

function buildFieldDefinitionsRows() {
    const rows = [];

    // Title bar
    rows.push({ values: [
        cellData('PFI 2026 \u2014 MASTER TASKS FIELD DEFINITIONS', { bg: COLORS.navy, color: COLORS.white, bold: true, size: 16, font: 'Arial' }),
    ] });

    // Subtitle
    rows.push({ values: [
        cellData('Keep this tab open while filling in Master Tasks. Every field is defined below.', { italic: true, color: COLORS.gray, size: 9, font: 'Arial' }),
    ] });

    // Blank spacer
    rows.push({ values: [emptyCell()] });

    const defs = [
        {
            col: 'Column A \u2014 PHASE',
            what: 'Which phase of the 2026 plan this task belongs to. Every task maps to exactly one phase.',
            valid: 'Gate 1 \u2013 This Week  |  Phase 1 \u2013 Foundation  |  Phase 2 \u2013 Presell  |  Phase 3 \u2013 Build  |  Phase 4 \u2013 Delivery  |  Ongoing',
            rules: 'Every task must have a phase \u2014 no exceptions. Set when task is created. Never blank. Ongoing = recurring weekly or monthly with no end date.',
            bad: "Writing 'April' or 'Q2'. Free-typing instead of using the dropdown. Leaving blank."
        },
        {
            col: 'Column B \u2014 PRIORITY',
            what: 'How critical this task is to the current phase gate passing on time.',
            valid: '\ud83d\udd34 High \u2014 gate-blocking, gate fails if not done on time.  |  \ud83d\udfe1 Medium \u2014 important but delay is recoverable.  |  \u26aa Low \u2014 can slip without downstream consequence.',
            rules: 'Every task must have a priority. Set at creation. Can only be changed during standup \u2014 change must be discussed out loud and logged in Standup Notes. Test: does the phase gate fail if this isn\'t done? Yes = High.',
            bad: 'Leaving blank. Marking everything High \u2014 makes priority meaningless. Changing priority silently without standup discussion.'
        },
        {
            col: 'Column C \u2014 DUE DATE',
            what: 'The specific date this task must be completed by. Not a range. Not an approximation. A real date.',
            valid: "A specific calendar date: Apr 18, 2026.  |  For recurring tasks only: 'Weekly' or 'Monthly'.",
            rules: 'Every task must have a due date before it goes in the sheet. If a date slips, update the cell immediately and log the reason in Standup Notes. The Dashboard This Week view reads from this column \u2014 stale dates break the dashboard.',
            bad: "'Soon.' 'Before May.' 'ASAP.' 'TBD.' A date range. Leaving blank."
        },
        {
            col: 'Column D \u2014 OWNER',
            what: 'The single person responsible for making sure this task gets done. Owner means accountable \u2014 not just involved.',
            valid: 'Gabriel  |  Alieel  |  Both (use sparingly \u2014 only when deliverables genuinely can\'t be separated)',
            rules: "Every task has exactly one owner. If you're the owner and stuck, you ask for help \u2014 task doesn't move to someone else. If Gabriel owns a task, Alieel ensures Gabriel has everything he needs, not takes it over.",
            bad: "'Gabriel/Alieel' as free text. Multiple names in one cell. Leaving blank."
        },
        {
            col: 'Column E \u2014 TASK',
            what: 'The short name of the task. What gets read out loud at standup. What shows in the Dashboard This Week view.',
            valid: "A concise action phrase, 3\u20138 words, starting with a verb. Bold. Gate tasks get a \u26a0 prefix.  Good examples: 'Lock methodology document final draft.'  'Hire tech lead offshore.'",
            rules: 'Must start with a verb: Write, Complete, Send, Hire, Lock, Test, Review, Build. Specific enough that two people reading it independently understand what done looks like. Detail goes in column F.',
            bad: "'Methodology stuff.'  'Follow up.'  'Engineering.'  Anything that doesn't start with a verb or is vague enough that two people interpret it differently."
        },
        {
            col: 'Column F \u2014 DETAIL',
            what: 'The full explanation of what needs to happen, how, and what done looks like specifically. All specificity lives here.',
            valid: 'Free text. Answers three questions: What exactly needs to happen? What does done look like? Are there any rules or constraints on how it gets done?',
            rules: 'Every High priority task must have a detail entry. Gate tasks must state the exact condition that defines passing. If Gabriel adds a task with no detail, Alieel asks him to fill it in before the meeting ends \u2014 never guess.',
            bad: "Repeating the task name. Writing 'see above.' Leaving blank on any High priority task."
        },
        {
            col: 'Column G \u2014 DEPENDS ON',
            what: 'The specific task or condition that must be true before this task can move to In Progress. A hard upstream dependency.',
            valid: "The exact task name from column E of another row  \u2014  OR  \u2014  a plain statement of what must be true.  Examples: 'Methodology document \u2014 final and locked.'  'Gate 3: 4 signed agreements.'",
            rules: "Leave blank if no dependency. A task with a dependency cannot be In Progress until the dependency is Done. Checked every standup. If a task is In Progress and its dependency isn't Done, it gets flagged immediately.",
            bad: "'Gabriel.'  'Previous step.'  Vague references that can't be verified. Writing a dependency but not checking it during standup."
        },
        {
            col: 'Column H \u2014 SOURCE',
            what: 'Where this task came from. Creates a permanent record of why every task exists.',
            valid: '2026 Plan  |  Gabriel Direction  |  Standup Decision  |  Subscriber Feedback  |  Build Discovery  |  External',
            rules: "Set when the task is created. Never changed after that. Warning signal: if most new tasks in a month are 'Subscriber Feedback', GTM pressure may be contaminating the methodology plan.",
            bad: 'Leaving blank. Writing free text instead of using the dropdown. Changing source retroactively.'
        },
        {
            col: 'Column I \u2014 LINK',
            what: 'A direct URL or file reference attached to this task. Connects the task to the resource needed to complete it.',
            valid: 'A hyperlink to a Google Doc, Notion page, email thread, Framer preview, CRM entry, SOP document, or any resource directly relevant to completing this task.',
            rules: 'Not required for every task. Only add when it meaningfully helps the owner complete the task faster. Link to the most specific resource possible. If a link breaks, fix or delete it immediately.',
            bad: 'Linking to a top-level Google Drive folder. Pasting a URL into the Detail column instead of here. Leaving broken links unfixed.'
        },
        {
            col: 'Column J \u2014 STATUS',
            what: 'The current state of this task right now. The most-read field in the entire sheet. Updated BEFORE every standup \u2014 not during.',
            valid: '\u2b1c Not Started  |  \u23f3 In Progress (work happened in last 7 days)  |  \u2705 Done (output exists, Gabriel has seen it)  |  \u274c Blocked (blocker named in Standup Notes)  |  \u23f8 Deferred (reason + new date in Standup Notes)',
            rules: 'Done requires completed date in column K. Blocked requires a named blocker in Standup Notes. Deferred requires a new due date in column C. Never delete a task \u2014 Deferred with a note if cancelled.',
            bad: 'Leaving blank. Done without a completed date. Blocked with no explanation. In Progress when no work happened in the last 7 days.'
        },
        {
            col: 'Column K \u2014 COMPLETED',
            what: 'The actual date the task was finished. Not the due date \u2014 the real date. The gap between these two dates tells you whether the plan is realistic.',
            valid: 'A specific calendar date: Apr 18, 2026. Required the moment Status moves to \u2705 Done.',
            rules: 'Required when Status = Done. No exceptions. Never backdate. If completed last week and entering today, write today\'s date and note actual completion in Standup Notes.',
            bad: 'Copying the due date from column C. Leaving blank when Status is Done. Backdating.'
        },
        {
            col: 'Column L \u2014 STANDUP NOTES',
            what: 'A running log of anything discussed about this task during standups. The institutional memory of the operation. Notes accumulate \u2014 never overwritten.',
            valid: 'Free text. Timestamped entries appended below old ones. Format: [Apr 7] \u2014 note here. [Apr 14] \u2014 follow-up here.',
            rules: 'Alieel owns this column. Every status change must have a note explaining why. Every Blocked task names the specific blocker. Every gate task gets a note when it passes: [Jun 28] Gate 3 passed \u2014 5 agreements signed.',
            bad: 'Blank when a status changes. Notes without dates. Overwriting old notes instead of appending.'
        },
    ];

    for (let i = 0; i < defs.length; i++) {
        const d = defs[i];
        // Column header
        rows.push({ values: [
            cellData(d.col, { bold: true, size: 12, font: 'Arial', color: COLORS.navy }),
        ] });
        // WHAT IT IS
        rows.push({ values: [
            cellData('WHAT IT IS', { bold: true, size: 9, font: 'Arial', bg: COLORS.lightGray }),
            cellData(d.what, { font: 'Arial', size: 10, bg: COLORS.lightGray, wrap: true }),
        ] });
        // VALID INPUTS
        rows.push({ values: [
            cellData('VALID INPUTS', { bold: true, size: 9, font: 'Arial', bg: COLORS.lightTeal }),
            cellData(d.valid, { font: 'Arial', size: 10, bg: COLORS.lightTeal, wrap: true }),
        ] });
        // RULES
        rows.push({ values: [
            cellData('RULES', { bold: true, size: 9, font: 'Arial', bg: COLORS.lightBlue }),
            cellData(d.rules, { font: 'Arial', size: 10, bg: COLORS.lightBlue, wrap: true }),
        ] });
        // BAD INPUT
        rows.push({ values: [
            cellData('BAD INPUT', { bold: true, size: 9, font: 'Arial', bg: COLORS.lightRed }),
            cellData(d.bad, { font: 'Arial', size: 10, bg: COLORS.lightRed, wrap: true }),
        ] });
        // Spacer
        rows.push({ values: [emptyCell()] });
    }

    // Final rule
    rows.push({ values: [
        cellData('THE ONE RULE THAT GOVERNS ALL 12 COLUMNS:', { bold: true, size: 10, font: 'Arial', color: COLORS.red }),
        cellData('A task is not in the sheet until it has Phase, Priority, Due Date, Owner, and Task name. The other fields can be filled in progressively. But those five are required at the moment of creation. No exceptions.', { font: 'Arial', size: 10, wrap: true, color: COLORS.red }),
    ] });

    return rows;
}

// ── Main ──

async function main() {
    console.log('Reading existing spreadsheet...');
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
    console.log('Existing tabs:', existingSheets.join(', '));

    // Tab definitions
    const tabDefs = [
        { title: '\ud83d\udcca Dashboard', color: COLORS.navy, buildRows: buildDashboardRows },
        { title: '\u2705 Master Tasks', color: COLORS.teal, buildRows: buildMasterTasksRows },
        { title: '\ud83d\udcdd Standup Log', color: COLORS.blue, buildRows: buildStandupLogRows },
        { title: '\ud83d\udea6 Gate Tracker', color: COLORS.red, buildRows: buildGateTrackerRows },
        { title: '\ud83d\udcd6 Field Definitions', color: COLORS.gray, buildRows: buildFieldDefinitionsRows },
    ];

    // Delete existing tabs with same names (to allow re-runs)
    const deleteRequests = [];
    for (const tab of tabDefs) {
        const existing = spreadsheet.data.sheets.find(s => s.properties.title === tab.title);
        if (existing) {
            console.log(`Deleting existing tab: ${tab.title}`);
            deleteRequests.push({ deleteSheet: { sheetId: existing.properties.sheetId } });
        }
    }
    if (deleteRequests.length) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests: deleteRequests }
        });
    }

    // Create new tabs
    const addRequests = [];
    const sheetIds = {};
    let baseId = 1000;
    for (const tab of tabDefs) {
        const sheetId = baseId++;
        sheetIds[tab.title] = sheetId;
        addRequests.push({
            addSheet: {
                properties: {
                    sheetId,
                    title: tab.title,
                    tabColor: tab.color,
                    gridProperties: { rowCount: 200, columnCount: 20 }
                }
            }
        });
    }

    console.log('Creating tabs...');
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: addRequests }
    });

    // Populate each tab
    for (const tab of tabDefs) {
        const sheetId = sheetIds[tab.title];
        const rows = tab.buildRows();
        console.log(`Populating: ${tab.title} (${rows.length} rows)...`);

        const requests = [];

        // Write row data
        requests.push({
            updateCells: {
                rows,
                fields: 'userEnteredValue,userEnteredFormat',
                start: { sheetId, rowIndex: 0, columnIndex: 0 }
            }
        });

        // Tab-specific formatting
        if (tab.title === '\ud83d\udcca Dashboard') {
            // Merge A1:G1 title bar
            requests.push({ mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } });
            // Row heights
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 44 }, fields: 'pixelSize' } });
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } });
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } });
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } });
            // NS data rows 5-7: 28px
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 5, endIndex: 8 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } });
            // Gate heading
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } });
            // Gate data rows: 36px
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 11, endIndex: 17 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } });
            // This week items: 22px
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 20, endIndex: 26 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } });
            // Monthly header: 32px
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 28, endIndex: 29 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } });
            // Freeze rows 1-2
            requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties.frozenRowCount' } });

            // Dropdowns — Gate Status (rows 11-16, col E = index 4)
            requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 11, endRowIndex: 17, startColumnIndex: 4, endColumnIndex: 5 }, rule: dropdownRule(['\ud83d\udfe2 Passed', '\ud83d\udfe1 At Risk', '\ud83d\udd34 Not Passed', '\u2b1c Not Yet']) } });
            // NS Status dropdown (rows 5-7, col E = index 4)
            requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 4, endColumnIndex: 5 }, rule: dropdownRule(['\ud83d\udfe2 On Track', '\ud83d\udfe1 At Risk', '\ud83d\udd34 Behind']) } });
            // This Week Owner dropdown (rows 20-25, col C = index 2)
            requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 20, endRowIndex: 26, startColumnIndex: 2, endColumnIndex: 3 }, rule: dropdownRule(['Gabriel', 'Alieel', 'Both']) } });
            // This Week Done? dropdown (rows 20-25, col E = index 4)
            requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 20, endRowIndex: 26, startColumnIndex: 4, endColumnIndex: 5 }, rule: dropdownRule(['\u2705 Done', '\u23f3 In Progress', '\u274c Blocked', '\u2b1c Not Started']) } });
        }

        if (tab.title === '\u2705 Master Tasks') {
            // Header row height
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } });
            // Task row heights: 50px
            const totalTaskRows = 65 + 20; // tasks + blank rows
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + totalTaskRows }, properties: { pixelSize: 50 }, fields: 'pixelSize' } });
            // Column widths
            const colWidths = [120, 100, 90, 260, 300, 130, 120, 250];
            for (let c = 0; c < colWidths.length; c++) {
                requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: colWidths[c] }, fields: 'pixelSize' } });
            }
            // Freeze row 1 + col A
            requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } });
            // Owner dropdown (col C, rows 1+)
            requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, endRowIndex: 200, startColumnIndex: 2, endColumnIndex: 3 }, rule: dropdownRule(['Gabriel', 'Alieel', 'Both']) } });
            // Status dropdown (col F, rows 1+)
            requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, endRowIndex: 200, startColumnIndex: 5, endColumnIndex: 6 }, rule: dropdownRule(['\u2b1c Not Started', '\u23f3 In Progress', '\u2705 Done', '\u274c Blocked', '\u23f8 Deferred']) } });
        }

        if (tab.title === '\ud83d\udcdd Standup Log') {
            // Header row height: 32px
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } });
            // Data rows: 80px
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 52 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } });
            // Column widths
            const slWidths = [110, 200, 220, 240, 240, 200];
            for (let c = 0; c < slWidths.length; c++) {
                requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: slWidths[c] }, fields: 'pixelSize' } });
            }
            // Freeze row 1
            requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });
        }

        if (tab.title === '\ud83d\udea6 Gate Tracker') {
            // Header row height: 32px
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } });
            // Gate rows: 90px
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 7 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } });
            // Column widths
            const gtWidths = [180, 110, 260, 260, 120, 120, 220];
            for (let c = 0; c < gtWidths.length; c++) {
                requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: gtWidths[c] }, fields: 'pixelSize' } });
            }
            // Freeze row 1
            requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });
            // Status dropdown (col E, rows 1-6)
            requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, endRowIndex: 7, startColumnIndex: 4, endColumnIndex: 5 }, rule: dropdownRule(['\ud83d\udfe2 Passed', '\ud83d\udfe1 At Risk', '\ud83d\udd34 Not Passed', '\u2b1c Not Yet']) } });
        }

        if (tab.title === '\ud83d\udcd6 Field Definitions') {
            // Merge title bar A1:F1
            requests.push({ mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } });
            // Title row height
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } });
            // Subtitle row height
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } });
            // Column widths
            requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } });
            for (let c = 1; c < 6; c++) {
                requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: 160 }, fields: 'pixelSize' } });
            }
            // Merge B:F for each content row (definition blocks start at row 3)
            // Each block: header, what, valid, rules, bad, spacer = 6 rows. 12 blocks.
            for (let block = 0; block < 12; block++) {
                const startRow = 3 + (block * 6);
                // Merge B:F for the 4 content rows (what, valid, rules, bad)
                for (let r = 1; r <= 4; r++) {
                    requests.push({ mergeCells: { range: { sheetId, startRowIndex: startRow + r, endRowIndex: startRow + r + 1, startColumnIndex: 1, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } });
                }
            }
            // Merge the final rule row B:F
            const finalRuleRow = 3 + (12 * 6);
            requests.push({ mergeCells: { range: { sheetId, startRowIndex: finalRuleRow, endRowIndex: finalRuleRow + 1, startColumnIndex: 1, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } });
        }

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests }
        });

        console.log(`\u2705 ${tab.title} done`);
    }

    console.log('\n\u2705 All 5 tabs created successfully!');
    console.log(`Open: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);
}

main().catch(err => {
    console.error('ERROR:', err.message);
    if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
    process.exit(1);
});
