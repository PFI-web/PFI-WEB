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
    'Find an email address using Apollo.io People Match. Pass first name, last name, and company domain to discover their email.',
    {
        firstName: z.string().describe('First name of the person'),
        lastName: z.string().describe('Last name of the person'),
        domain: z.string().describe('Company domain (e.g. swca.com)')
    },
    async ({ firstName, lastName, domain }) => {
        const apiKey = process.env.APOLLO_API_KEY;
        if (!apiKey) return textResult('ERROR: APOLLO_API_KEY not set.');
        const res = await fetch('https://api.apollo.io/v1/people/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ first_name: firstName, last_name: lastName, domain })
        });
        if (!res.ok) return textResult(JSON.stringify({ email: null, source: 'apollo', error: res.status }));
        const data = await res.json();
        const person = data.person || {};
        return textResult(JSON.stringify({
            email: person.email || null,
            title: person.title || null,
            linkedin_url: person.linkedin_url || null,
            company: person.organization?.name || null,
            source: 'apollo'
        }));
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

const LEARNING_TRACK_TAB = 'Learning Track';
const LEARNING_TRACK_HEADERS = ['Name', 'Company', 'Role', 'Related Project', 'Related Friction', 'LinkedIn', 'Email', 'Channel', 'Message'];
const LEARNING_TRACK_FIELDS = ['name', 'company', 'role', 'related_project', 'related_friction', 'linkedin', 'email', 'channel', 'message'];

function schemaForTab(tabName) {
    if (tabName === LEARNING_TRACK_TAB) {
        return { headers: LEARNING_TRACK_HEADERS, fields: LEARNING_TRACK_FIELDS, endCol: 'I' };
    }
    return { headers: PROOF_HEADERS, fields: PROOF_FIELDS, endCol: 'O' };
}

// Set cells to CLIP wrapping so rows stay uniform height
async function clipCells(sheets, spreadsheetId, tabName, sheetRow, startCol, endColIdx) {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === tabName);
    if (!sheet) return;
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{
                repeatCell: {
                    range: {
                        sheetId: sheet.properties.sheetId,
                        startRowIndex: sheetRow - 1,
                        endRowIndex: sheetRow,
                        startColumnIndex: startCol,
                        endColumnIndex: endColIdx
                    },
                    cell: { userEnteredFormat: { wrapStrategy: 'CLIP' } },
                    fields: 'userEnteredFormat.wrapStrategy'
                }
            }]
        }
    });
}

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
            const { fields, endCol } = schemaForTab(tabName);
            const sheets = getSheetsClient();
            const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
            const existingTabs = new Set(spreadsheet.data.sheets.map(s => s.properties.title));
            if (!existingTabs.has(tabName)) {
                return textResult(JSON.stringify({ rows: [], message: `No "${tabName}" tab found. Sheet is empty.` }));
            }
            const result = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${tabName}'!A:${endCol}`
            }).catch(() => null);
            if (!result || !result.data.values || result.data.values.length <= 1) {
                return textResult(JSON.stringify({ rows: [], message: `"${tabName}" tab exists but has no data rows.` }));
            }
            const dataRows = result.data.values.slice(1);
            const rows = dataRows.map(row => {
                const obj = {};
                fields.forEach((field, i) => { obj[field] = row[i] || ''; });
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
    'Append rows to a tab in a Google Sheet. Pass tabName to write to a specific tab (defaults to "Proof Sheet"). Tab and headers are created automatically. Proof Sheet fields: company, institutional_backer, fund_experience, classification, why_them, key_contact, contact_linkedin, contact_email, contact_rationale, contact_confidence, message, email_subject, linkedin_note, email_sent, linkedin_sent. Learning Track fields: name, company, role, related_project, related_friction, linkedin, email, channel.',
    {
        spreadsheetId: z.string().describe('Google Sheet ID (from the URL)'),
        tabName: z.string().optional().describe('Tab name to write to (default: "Proof Sheet")'),
        rows: z.array(z.record(z.string(), z.string())).describe('Array of row objects. Keys must match the tab schema (see tool description).')
    },
    async ({ spreadsheetId, tabName = PROOF_TAB, rows }) => {
        try {
            const { headers, fields, endCol } = schemaForTab(tabName);
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
                range: `'${tabName}'!A1:${endCol}1`
            }).catch(() => null);
            const values = [];
            if (!existing || !existing.data.values || existing.data.values.length === 0) {
                values.push(headers);
            }
            for (const row of rows) {
                values.push(fields.map(f => row[f] || ''));
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
    'Update existing rows in a Google Sheet tab by matching on the first column (company for Proof Sheet, name for Learning Track). Pass tabName to target a specific tab (defaults to "Proof Sheet"). Overwrites only the fields you provide.',
    {
        spreadsheetId: z.string().describe('Google Sheet ID (from the URL)'),
        tabName: z.string().optional().describe('Tab name to update (default: "Proof Sheet")'),
        updates: z.array(z.record(z.string(), z.string())).describe('Array of row objects. The first-column field (company or name) is used to match existing rows.')
    },
    async ({ spreadsheetId, tabName = PROOF_TAB, updates }) => {
        try {
            const { fields, endCol } = schemaForTab(tabName);
            const matchKey = fields[0];
            const sheets = getSheetsClient();
            const result = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${tabName}'!A:${endCol}`
            });
            if (!result || !result.data.values || result.data.values.length <= 1) {
                return textResult(`ERROR: No data rows found in "${tabName}".`);
            }
            const allRows = result.data.values;
            let updatedCount = 0;
            const notFound = [];
            for (const update of updates) {
                const matchValue = update[matchKey];
                if (!matchValue) { notFound.push('(missing match key)'); continue; }
                const rowIndex = allRows.findIndex((row, i) => i > 0 && row[0] && row[0].trim().toLowerCase() === matchValue.trim().toLowerCase());
                if (rowIndex === -1) { notFound.push(matchValue); continue; }
                const existingRow = allRows[rowIndex];
                const newRow = fields.map((field, colIdx) => {
                    if (field === matchKey) return existingRow[colIdx] || '';
                    return update[field] !== undefined ? update[field] : (existingRow[colIdx] || '');
                });
                const sheetRow = rowIndex + 1;
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${tabName}'!A${sheetRow}:${endCol}${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [newRow] }
                });
                // Clip cells so row height stays uniform
                const endColIdx = fields.length;
                await clipCells(sheets, spreadsheetId, tabName, sheetRow, 0, endColIdx);
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
