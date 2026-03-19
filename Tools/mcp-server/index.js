import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(resolve(__dirname, '../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json'), 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'thepfi'
});

const db = admin.firestore();

// Helpers
// SWITCH: change to 'users' when done testing
const ROOT_COLLECTION = 'test';
const userRef = (uid) => db.collection(ROOT_COLLECTION).doc(uid);
const profileRef = (uid) => userRef(uid).collection('profile').doc('main');
const leadsRef = (uid) => userRef(uid).collection('leads');
const tasksRef = (uid) => userRef(uid).collection('tasks');
const textResult = (text) => ({ content: [{ type: 'text', text }] });
const todayKey = () => 'linkedin_' + new Date().toISOString().split('T')[0];
const emailTodayKey = () => 'email_' + new Date().toISOString().split('T')[0];

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
        userId: z.string().describe('Firebase user ID'),
        leadId: z.string().describe('Lead document ID'),
        to: z.string().describe('Recipient email address'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body (plain text)')
    },
    async ({ userId, leadId, to, subject, body }) => {
        const transport = getMailTransport();
        if (!transport) return textResult('ERROR: Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');

        // Check email daily limit
        const key = emailTodayKey();
        const profileDoc = await profileRef(userId).get();
        const data = profileDoc.exists ? profileDoc.data() : {};
        const count = data[key] || 0;
        const limit = data.emailLimit || 20;
        if (count >= limit) {
            return textResult(`LIMIT_REACHED: Daily email limit of ${limit} hit. Stop sending.`);
        }

        try {
            await transport.sendMail({
                from: process.env.GMAIL_USER,
                to,
                subject,
                text: body
            });
            const leadDoc = await leadsRef(userId).doc(leadId).get();
            const leadData = leadDoc.exists ? leadDoc.data() : {};
            const linkedinDone = !!leadData.linkedinSent;
            const hasLinkedin = !!leadData.linkedin;
            const allDone = !hasLinkedin || linkedinDone;
            const update = {
                emailSent: true,
                emailSentAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (allDone) {
                update.done = true;
                update.sentAt = admin.firestore.FieldValue.serverTimestamp();
            }
            await leadsRef(userId).doc(leadId).update(update);
            await profileRef(userId).update({
                [key]: admin.firestore.FieldValue.increment(1)
            });
            const status = allDone ? 'fully done' : 'email sent (LinkedIn pending)';
            return textResult(`Email sent to ${to}. Lead ${leadId} ${status}. Count: ${count + 1}/${limit}.`);
        } catch (err) {
            return textResult(`ERROR sending email: ${err.message}`);
        }
    }
);

// ===== get_skill =====
server.tool(
    'get_skill',
    'Read the user skill document from Firestore',
    { userId: z.string().describe('Firebase user ID') },
    async ({ userId }) => {
        const doc = await profileRef(userId).get();
        if (!doc.exists) return textResult('No profile found.');
        return textResult(doc.data().skill || 'No skill document found.');
    }
);

// ===== get_pending_leads =====
server.tool(
    'get_pending_leads',
    'Get leads where done is false. Set needsMessage=true to only get leads with empty messages.',
    {
        userId: z.string().describe('Firebase user ID'),
        needsMessage: z.boolean().optional().describe('If true, only return leads with empty message field')
    },
    async ({ userId, needsMessage }) => {
        const snapshot = await leadsRef(userId).where('done', '==', false).get();
        let leads = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (needsMessage && data.message) return;
            leads.push({ id: doc.id, ...data });
        });
        return textResult(JSON.stringify(leads, null, 2));
    }
);

// ===== save_leads =====
server.tool(
    'save_leads',
    'Save new leads to Firestore. Deduplicates by LinkedIn URL and email. Supports optional email, channel, and enrichmentSource fields.',
    {
        userId: z.string().describe('Firebase user ID'),
        leads: z.array(z.object({
            name: z.string(),
            company: z.string(),
            linkedin: z.string().optional().default(''),
            role: z.string().optional().default(''),
            email: z.string().optional().default(''),
            institutionalBacker: z.string().optional().default('').describe('PE fund or institutional investor behind this company'),
            channel: z.enum(['email', 'linkedin']).optional().default('linkedin'),
            enrichmentSource: z.enum(['hunter', 'none']).optional().default('none')
        })).describe('Array of leads to save')
    },
    async ({ userId, leads }) => {
        const existing = await leadsRef(userId).get();
        const existingUrls = new Set();
        const existingEmails = new Set();
        existing.forEach(doc => {
            const d = doc.data();
            if (d.linkedin) existingUrls.add(d.linkedin.toLowerCase());
            if (d.email) existingEmails.add(d.email.toLowerCase());
        });

        let added = 0;
        let skipped = 0;
        const batch = db.batch();

        for (const lead of leads) {
            if (lead.linkedin && existingUrls.has(lead.linkedin.toLowerCase())) { skipped++; continue; }
            if (lead.email && existingEmails.has(lead.email.toLowerCase())) { skipped++; continue; }
            const ref = leadsRef(userId).doc();
            batch.set(ref, {
                name: lead.name,
                company: lead.company,
                role: lead.role,
                linkedin: lead.linkedin,
                email: lead.email,
                institutionalBacker: lead.institutionalBacker || '',
                channel: lead.email ? 'email' : 'linkedin',
                enrichmentSource: lead.enrichmentSource,
                message: '',
                done: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                sentAt: null
            });
            added++;
        }

        await batch.commit();
        return textResult(`Added ${added} leads, skipped ${skipped} duplicates.`);
    }
);

// ===== save_message =====
server.tool(
    'save_message',
    'Save outreach messages to a lead. For email-channel leads: subject + message (email body) + optional linkedinNote. For linkedin-channel leads: just message (the connection note, under 300 chars).',
    {
        userId: z.string().describe('Firebase user ID'),
        leadId: z.string().describe('Lead document ID'),
        message: z.string().describe('Email body (email-channel) or LinkedIn note (linkedin-channel)'),
        subject: z.string().optional().describe('Email subject line (email-channel leads only)'),
        linkedinNote: z.string().optional().describe('LinkedIn connection note under 300 chars (for email-channel leads that also have LinkedIn)')
    },
    async ({ userId, leadId, message, subject, linkedinNote }) => {
        const update = { message };
        if (subject) update.emailSubject = subject;
        if (linkedinNote) update.linkedinNote = linkedinNote;
        await leadsRef(userId).doc(leadId).update(update);
        return textResult(`Message saved for lead ${leadId}.`);
    }
);

// ===== mark_lead_done =====
server.tool(
    'mark_lead_done',
    'Mark a lead as done after outreach is sent. Increments the daily outreach counter.',
    {
        userId: z.string().describe('Firebase user ID'),
        leadId: z.string().describe('Lead document ID')
    },
    async ({ userId, leadId }) => {
        const key = todayKey();
        const profileDoc = await profileRef(userId).get();
        const data = profileDoc.exists ? profileDoc.data() : {};
        const count = data[key] || 0;
        const limit = data.linkedinLimit || 20;

        if (count >= limit) {
            return textResult(`LIMIT_REACHED: Daily limit of ${limit} hit. Stop sending.`);
        }

        const leadDoc = await leadsRef(userId).doc(leadId).get();
        const leadData = leadDoc.exists ? leadDoc.data() : {};
        const emailDone = !!leadData.emailSent;
        const hasEmail = !!leadData.email;
        const allDone = !hasEmail || emailDone;
        const update = {
            linkedinSent: true,
            linkedinSentAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (allDone) {
            update.done = true;
            update.sentAt = admin.firestore.FieldValue.serverTimestamp();
        }
        await leadsRef(userId).doc(leadId).update(update);

        await profileRef(userId).update({
            [key]: admin.firestore.FieldValue.increment(1)
        });

        const status = allDone ? 'fully done' : 'LinkedIn sent (email pending)';
        return textResult(`Lead ${leadId} ${status}. Count: ${count + 1}/${limit}.`);
    }
);

// ===== get_daily_count =====
server.tool(
    'get_daily_count',
    'Get today\'s LinkedIn and email send counts and daily limits',
    { userId: z.string().describe('Firebase user ID') },
    async ({ userId }) => {
        const doc = await profileRef(userId).get();
        const data = doc.exists ? doc.data() : {};
        const liCount = data[todayKey()] || 0;
        const liLimit = data.linkedinLimit || 20;
        const emCount = data[emailTodayKey()] || 0;
        const emLimit = data.emailLimit || 20;
        return textResult(JSON.stringify({
            linkedin: { count: liCount, limit: liLimit, remaining: liLimit - liCount },
            email: { count: emCount, limit: emLimit, remaining: emLimit - emCount }
        }));
    }
);

// ===== poll_tasks =====
server.tool(
    'poll_tasks',
    'Check for pending tasks. Returns the task type if one is pending, or "none".',
    { userId: z.string().describe('Firebase user ID') },
    async ({ userId }) => {
        const tasks = ['findLeads', 'writeMessages', 'performOutreach', 'proofSheet'];
        for (const taskName of tasks) {
            const doc = await tasksRef(userId).doc(taskName).get();
            if (doc.exists && doc.data().status === 'pending') {
                return textResult(JSON.stringify({ task: taskName, ...doc.data() }));
            }
        }
        return textResult(JSON.stringify({ task: 'none' }));
    }
);

// ===== complete_task =====
server.tool(
    'complete_task',
    'Mark a task as complete',
    {
        userId: z.string().describe('Firebase user ID'),
        taskName: z.string().describe('Task name: findLeads, writeMessages, or performOutreach')
    },
    async ({ userId, taskName }) => {
        await tasksRef(userId).doc(taskName).update({
            status: 'complete',
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return textResult(`Task ${taskName} marked complete.`);
    }
);

// ===== read_proof_sheet =====
server.tool(
    'read_proof_sheet',
    'Read all existing rows from the "Proof Sheet" tab in a Google Sheet. Returns an array of row objects with the 7 fields. Use this before writing to check what companies are already in the sheet.',
    {
        spreadsheetId: z.string().describe('Google Sheet ID (from the URL)')
    },
    async ({ spreadsheetId }) => {
        try {
            const sheets = getSheetsClient();

            // Check if tab exists
            const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
            const existingTabs = new Set(spreadsheet.data.sheets.map(s => s.properties.title));
            if (!existingTabs.has(PROOF_TAB)) {
                return textResult(JSON.stringify({ rows: [], message: 'No "Proof Sheet" tab found. Sheet is empty.' }));
            }

            // Read all data
            const result = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${PROOF_TAB}'!A:G`
            }).catch(() => null);

            if (!result || !result.data.values || result.data.values.length <= 1) {
                return textResult(JSON.stringify({ rows: [], message: 'Proof Sheet tab exists but has no data rows.' }));
            }

            // Skip header row, map to objects
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
const PROOF_HEADERS = ['Company', 'Institutional Backer', 'Classification', "What's Happening", 'Why Them', 'Key Contact', 'Source'];
const PROOF_FIELDS = ['company', 'institutional_backer', 'classification', 'whats_happening', 'why_them', 'key_contact', 'source'];
const PROOF_TAB = 'Proof Sheet';

server.tool(
    'write_proof_sheet',
    'Write proof-of-concept rows to a Google Sheet. All rows go to a single "Proof Sheet" tab. Tab and headers are created automatically.',
    {
        spreadsheetId: z.string().describe('Google Sheet ID (from the URL)'),
        rows: z.array(z.object({
            company: z.string().describe('Company name (the developer/operator)'),
            institutional_backer: z.string().optional().default('').describe('PE fund, infrastructure fund, or investor behind the company. "backer not found" if unknown.'),
            classification: z.enum(['Active Pain', 'Capital Pattern']).describe('Active Pain = currently stuck in permitting. Capital Pattern = repeat builder, next project coming.'),
            whats_happening: z.string().optional().default('').describe('Situational intelligence: specific project name, capacity (MW), county/location, exact agency stage (e.g. "TCEQ air quality permit review"), regulatory signal or policy shift causing friction, and timeline evidence (filed date, expected approval, current status). Must read like an internal briefing, not a search summary.'),
            why_them: z.string().optional().default('').describe('Personalization intelligence — ties company/backer → project friction → permitting risk exposure → what\'s actionable. Must connect the specific permit delay to the financial risk the backer is carrying (IRR erosion, idle capital, LP reporting gaps) and land on why quantifying permitting risk now is the actionable step. Should read like a reason to take a meeting, not a summary of the delay.'),
            key_contact: z.string().optional().default('').describe('Person-project-role connection. Format: "Name → Project Name → Role (Asset Manager / Investor Relations)". Multiple contacts separated by semicolon. "contact not found" if neither role found at the fund.'),
            source: z.string().optional().default('').describe('Verifiable source URL(s). Multiple sources separated by " | " (e.g. "https://source1.com | https://source2.com"). More sources = stronger evidence.')
        })).describe('Array of rows to append')
    },
    async ({ spreadsheetId, rows }) => {
        try {
            const sheets = getSheetsClient();

            // Get existing sheet names
            const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
            const existingTabs = new Set(spreadsheet.data.sheets.map(s => s.properties.title));

            // Create tab if it doesn't exist
            if (!existingTabs.has(PROOF_TAB)) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: { requests: [{ addSheet: { properties: { title: PROOF_TAB } } }] }
                });
            }

            // Check if header exists
            const existing = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${PROOF_TAB}'!A1:G1`
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
                range: `'${PROOF_TAB}'!A1`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values }
            });

            return textResult(`Wrote ${rows.length} rows to "${PROOF_TAB}" tab.`);
        } catch (err) {
            return textResult(`ERROR writing to Google Sheet: ${err.message}`);
        }
    }
);

// ===== update_proof_sheet =====
server.tool(
    'update_proof_sheet',
    'Update existing rows in the "Proof Sheet" tab by matching on company name. Overwrites only the fields you provide — unspecified fields are left unchanged.',
    {
        spreadsheetId: z.string().describe('Google Sheet ID (from the URL)'),
        updates: z.array(z.object({
            company: z.string().describe('Company name to match (must match an existing row exactly)'),
            institutional_backer: z.string().optional().describe('New value for Institutional Backer column'),
            classification: z.string().optional().describe('New value for Classification column'),
            whats_happening: z.string().optional().describe('New value for What\'s Happening column'),
            why_them: z.string().optional().describe('New value for Why Them column'),
            key_contact: z.string().optional().describe('New value for Key Contact column'),
            source: z.string().optional().describe('New value for Source column')
        })).describe('Array of updates, each keyed by company name')
    },
    async ({ spreadsheetId, updates }) => {
        try {
            const sheets = getSheetsClient();

            // Read all data
            const result = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${PROOF_TAB}'!A:G`
            });

            if (!result || !result.data.values || result.data.values.length <= 1) {
                return textResult('ERROR: No data rows found in Proof Sheet.');
            }

            const allRows = result.data.values; // includes header at index 0
            let updatedCount = 0;
            const notFound = [];

            for (const update of updates) {
                // Find the row index (1-based in sheet) where column A matches company
                const rowIndex = allRows.findIndex((row, i) => i > 0 && row[0] && row[0].trim().toLowerCase() === update.company.trim().toLowerCase());

                if (rowIndex === -1) {
                    notFound.push(update.company);
                    continue;
                }

                // Build the updated row, keeping existing values for unspecified fields
                const existingRow = allRows[rowIndex];
                const newRow = PROOF_FIELDS.map((field, colIdx) => {
                    if (field === 'company') return existingRow[colIdx] || ''; // don't change company name
                    return update[field] !== undefined ? update[field] : (existingRow[colIdx] || '');
                });

                // Write just this row back (rowIndex is 0-based, sheet rows are 1-based)
                const sheetRow = rowIndex + 1;
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${PROOF_TAB}'!A${sheetRow}:G${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [newRow] }
                });

                // Update local copy so subsequent matches see updated data
                allRows[rowIndex] = newRow;
                updatedCount++;
            }

            let msg = `Updated ${updatedCount} row(s).`;
            if (notFound.length > 0) {
                msg += ` Not found: ${notFound.join(', ')}`;
            }
            return textResult(msg);
        } catch (err) {
            return textResult(`ERROR updating Google Sheet: ${err.message}`);
        }
    }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
