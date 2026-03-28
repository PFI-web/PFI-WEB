import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(resolve(__dirname, '../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json'), 'utf8'));

const textResult = (text) => ({ content: [{ type: 'text', text }] });

// Google Sheets client (lazy-initialized)
let sheetsClient = null;
function getSheetsClient() {
    if (!sheetsClient) {
        const auth = new google.auth.GoogleAuth({
            credentials: serviceAccount,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        sheetsClient = google.sheets({ version: 'v4', auth });
    }
    return sheetsClient;
}

// Gmail SMTP transport (lazy-initialized)
let mailTransport = null;
function getMailTransport() {
    if (!mailTransport) {
        const user = process.env.GMAIL_USER;
        const pass = process.env.GMAIL_APP_PASSWORD;
        if (!user || !pass) return null;
        mailTransport = nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass }
        });
    }
    return mailTransport;
}

const server = new McpServer({
    name: 'pfi-outreach',
    version: '1.0.0'
});

// ===== search_web =====
server.tool(
    'search_web',
    'Search the web using Tavily API. Returns structured results (title, url, snippet). Use for discovering companies, projects, and signals — no browser needed.',
    { query: z.string().describe('Search query') },
    async ({ query }) => {
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) return textResult('ERROR: TAVILY_API_KEY not set.');
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey, query, max_results: 10 })
        });
        if (!res.ok) return textResult(`ERROR: Tavily returned ${res.status}`);
        const data = await res.json();
        const results = (data.results || []).map(r => ({
            title: r.title, url: r.url, snippet: r.content
        }));
        return textResult(JSON.stringify(results, null, 2));
    }
);

// ===== enrich_contact =====
server.tool(
    'enrich_contact',
    'Find email for a person using Hunter.io Email Finder. Returns { email, source } or { email: null } if not found.',
    {
        firstName: z.string().describe('First name'),
        lastName: z.string().describe('Last name'),
        domain: z.string().describe('Company domain (e.g. stripe.com)')
    },
    async ({ firstName, lastName, domain }) => {
        const apiKey = process.env.HUNTER_API_KEY;
        if (!apiKey) return textResult('ERROR: HUNTER_API_KEY not set.');
        const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return textResult(JSON.stringify({ email: null, source: 'hunter', error: res.status }));
        const data = await res.json();
        const email = data.data?.email || null;
        const confidence = data.data?.score || 0;
        return textResult(JSON.stringify({ email, confidence, source: 'hunter' }));
    }
);

// ===== send_email =====
server.tool(
    'send_email',
    'Send an email via Gmail SMTP. Requires GMAIL_USER and GMAIL_APP_PASSWORD env vars.',
    {
        to: z.string().describe('Recipient email address'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body (plain text)')
    },
    async ({ to, subject, body }) => {
        const transport = getMailTransport();
        if (!transport) return textResult('ERROR: Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
        try {
            await transport.sendMail({ from: process.env.GMAIL_USER, to, subject, text: body });
            return textResult(`Email sent to ${to}.`);
        } catch (err) {
            return textResult(`ERROR sending email: ${err.message}`);
        }
    }
);

// ===== Proof Sheet constants =====
const PROOF_TAB = 'Proof Sheet';
const PROOF_HEADERS = ['Company', 'Institutional Backer', 'Fund Experience', 'Classification', 'Why Them', 'Key Contact', 'Contact LinkedIn', 'Contact Email', 'Contact Rationale', 'Contact Confidence', 'Message', 'Email Subject', 'LinkedIn Note', 'Email Sent', 'LinkedIn Sent'];
const PROOF_FIELDS = ['company', 'institutional_backer', 'fund_experience', 'classification', 'why_them', 'key_contact', 'contact_linkedin', 'contact_email', 'contact_rationale', 'contact_confidence', 'message', 'email_subject', 'linkedin_note', 'email_sent', 'linkedin_sent'];

// ===== read_proof_sheet =====
server.tool(
    'read_proof_sheet',
    'Read all existing rows from a tab in a Google Sheet. Returns an array of row objects. Pass tabName to read a specific tab (defaults to "Proof Sheet").',
    {
        spreadsheetId: z.string().describe('Google Sheet ID (from the URL)'),
        tabName: z.string().optional().describe('Tab name to read (default: "Proof Sheet")')
    },
    async ({ spreadsheetId, tabName = PROOF_TAB }) => {
        try {
            const sheets = getSheetsClient();
            const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
            const existingTabs = new Set(spreadsheet.data.sheets.map(s => s.properties.title));
            if (!existingTabs.has(tabName)) {
                return textResult(JSON.stringify({ rows: [], message: `No "${tabName}" tab found. Sheet is empty.` }));
            }
            const result = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${tabName}'!A:O`
            }).catch(() => null);
            if (!result || !result.data.values || result.data.values.length <= 1) {
                return textResult(JSON.stringify({ rows: [], message: `"${tabName}" tab exists but has no data rows.` }));
            }
            const dataRows = result.data.values.slice(1);
            const rows = dataRows.map(row => {
                const obj = {};
                PROOF_FIELDS.forEach((field, i) => { obj[field] = row[i] || ''; });
                return obj;
            });
            return textResult(JSON.stringify({ rows, count: rows.length }));
        } catch (err) {
            return textResult(`ERROR reading Google Sheet: ${err.message}`);
        }
    }
);

// ===== write_proof_sheet =====
server.tool(
    'write_proof_sheet',
    'Append rows to a tab in a Google Sheet. Pass tabName to write to a specific tab (defaults to "Proof Sheet"). Tab and headers are created automatically.',
    {
        spreadsheetId: z.string().describe('Google Sheet ID (from the URL)'),
        tabName: z.string().optional().describe('Tab name to write to (default: "Proof Sheet")'),
        rows: z.array(z.object({
            company: z.string().describe('Developer/operator (the project entity)'),
            institutional_backer: z.string().optional().default('').describe('PE fund or investor behind the company. "backer not found" if unknown.'),
            fund_experience: z.string().optional().default('').describe('"Seasoned" or "New Entrant"'),
            classification: z.enum(['Active Pain', 'Capital Pattern']).describe('Active Pain = currently stuck in permitting. Capital Pattern = repeat builder.'),
            why_them: z.string().optional().default('').describe('Personalization intelligence with inline citations — ties backer → project friction → financial risk exposure → why act now.'),
            key_contact: z.string().optional().default('').describe('"Name (Verified Title, Firm)". "contact not found" if search failed.'),
            contact_linkedin: z.string().optional().default('').describe('Full LinkedIn profile URL. Empty if not found.'),
            contact_email: z.string().optional().default('').describe('Email from Hunter. Empty if not found.'),
            contact_rationale: z.string().optional().default('').describe('One sentence naming the project and why this person owns the exposure, with inline source URLs.'),
            contact_confidence: z.string().optional().default('').describe('"High", "Medium", or "Low".'),
            message: z.string().optional().default('').describe('Outreach email body. Leave blank — filled by writeMessages.'),
            email_subject: z.string().optional().default('').describe('Email subject line. Leave blank — filled by writeMessages.'),
            linkedin_note: z.string().optional().default('').describe('LinkedIn connection note under 300 chars. Leave blank — filled by writeMessages.'),
            email_sent: z.string().optional().default('').describe('Date email was sent (YYYY-MM-DD). Leave blank — filled by performOutreach.'),
            linkedin_sent: z.string().optional().default('').describe('Date LinkedIn request was sent (YYYY-MM-DD). Leave blank — filled manually.')
        })).describe('Array of rows to append')
    },
    async ({ spreadsheetId, tabName = PROOF_TAB, rows }) => {
        try {
            const sheets = getSheetsClient();
            const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
            const existingTabs = new Set(spreadsheet.data.sheets.map(s => s.properties.title));
            if (!existingTabs.has(tabName)) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
                });
            }
            const existing = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${tabName}'!A1:O1`
            }).catch(() => null);
            const values = [];
            if (!existing || !existing.data.values || existing.data.values.length === 0) {
                values.push(PROOF_HEADERS);
            }
            for (const row of rows) {
                values.push(PROOF_FIELDS.map(f => row[f] || ''));
            }
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `'${tabName}'!A1`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values }
            });
            return textResult(`Wrote ${rows.length} rows to "${tabName}" tab.`);
        } catch (err) {
            return textResult(`ERROR writing to Google Sheet: ${err.message}`);
        }
    }
);

// ===== update_proof_sheet =====
server.tool(
    'update_proof_sheet',
    'Update existing rows in a Google Sheet tab by matching on company name. Pass tabName to target a specific tab (defaults to "Proof Sheet"). Overwrites only the fields you provide.',
    {
        spreadsheetId: z.string().describe('Google Sheet ID (from the URL)'),
        tabName: z.string().optional().describe('Tab name to update (default: "Proof Sheet")'),
        updates: z.array(z.object({
            company: z.string().describe('Company name to match (must match an existing row exactly)'),
            institutional_backer: z.string().optional(),
            fund_experience: z.string().optional(),
            classification: z.string().optional(),
            why_them: z.string().optional(),
            key_contact: z.string().optional(),
            contact_linkedin: z.string().optional(),
            contact_email: z.string().optional(),
            contact_rationale: z.string().optional(),
            contact_confidence: z.string().optional(),
            message: z.string().optional(),
            email_subject: z.string().optional(),
            linkedin_note: z.string().optional(),
            email_sent: z.string().optional(),
            linkedin_sent: z.string().optional()
        })).describe('Array of updates, each keyed by company name')
    },
    async ({ spreadsheetId, tabName = PROOF_TAB, updates }) => {
        try {
            const sheets = getSheetsClient();
            const result = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${tabName}'!A:O`
            });
            if (!result || !result.data.values || result.data.values.length <= 1) {
                return textResult(`ERROR: No data rows found in "${tabName}".`);
            }
            const allRows = result.data.values;
            let updatedCount = 0;
            const notFound = [];
            for (const update of updates) {
                const rowIndex = allRows.findIndex((row, i) => i > 0 && row[0] && row[0].trim().toLowerCase() === update.company.trim().toLowerCase());
                if (rowIndex === -1) { notFound.push(update.company); continue; }
                const existingRow = allRows[rowIndex];
                const newRow = PROOF_FIELDS.map((field, colIdx) => {
                    if (field === 'company') return existingRow[colIdx] || '';
                    return update[field] !== undefined ? update[field] : (existingRow[colIdx] || '');
                });
                const sheetRow = rowIndex + 1;
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${tabName}'!A${sheetRow}:J${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [newRow] }
                });
                allRows[rowIndex] = newRow;
                updatedCount++;
            }
            let msg = `Updated ${updatedCount} row(s).`;
            if (notFound.length > 0) msg += ` Not found: ${notFound.join(', ')}`;
            return textResult(msg);
        } catch (err) {
            return textResult(`ERROR updating Google Sheet: ${err.message}`);
        }
    }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
