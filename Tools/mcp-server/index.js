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

// ===== write_proof_sheet =====
const TAB_HEADERS = {
    'Active Pain': ['Company', "What They're Building", 'Where', "Why They're Hurting", 'Proof', 'Contact', 'LinkedIn', 'Thought Process'],
    'Capital Pattern': ['Company', 'What They Keep Doing', 'Where', 'Why PFI Matters To Them', 'Proof', 'Contact', 'LinkedIn', 'Thought Process']
};
const TAB_FIELDS = {
    'Active Pain': ['company', 'what_they_are_building', 'where', 'why_they_are_hurting', 'proof', 'contact', 'linkedin', 'thought_process'],
    'Capital Pattern': ['company', 'what_they_keep_doing', 'where', 'why_pfi_matters', 'proof', 'contact', 'linkedin', 'thought_process']
};

server.tool(
    'write_proof_sheet',
    'Write proof-of-concept rows to a Google Sheet. Each row includes a tab field ("Active Pain" or "Capital Pattern") and is appended to the matching tab. Tabs and headers are created automatically.',
    {
        spreadsheetId: z.string().describe('Google Sheet ID (from the URL)'),
        rows: z.array(z.object({
            tab: z.enum(['Active Pain', 'Capital Pattern']).optional().default('Active Pain').describe('Which tab to write to'),
            company: z.string().describe('Company name'),
            what_they_are_building: z.string().optional().default('').describe('Active Pain: the actual project'),
            where: z.string().optional().default('').describe('TX / GA / AZ'),
            why_they_are_hurting: z.string().optional().default('').describe('Active Pain: what is stuck and how long'),
            what_they_keep_doing: z.string().optional().default('').describe('Capital Pattern: their pattern'),
            why_pfi_matters: z.string().optional().default('').describe('Capital Pattern: why the next project is coming'),
            proof: z.string().optional().default('').describe('Source URL'),
            contact: z.string().optional().default('').describe('Best person to reach, name only'),
            linkedin: z.string().optional().default('').describe('Contact LinkedIn URL'),
            thought_process: z.string().optional().default('').describe('3-4 sentences: why this company and why this contact')
        })).describe('Array of rows to append')
    },
    async ({ spreadsheetId, rows }) => {
        try {
            const sheets = getSheetsClient();

            // Get existing sheet names
            const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
            const existingTabs = new Set(spreadsheet.data.sheets.map(s => s.properties.title));

            // Group rows by tab
            const grouped = {};
            for (const row of rows) {
                const tab = row.tab || 'Active Pain';
                if (!grouped[tab]) grouped[tab] = [];
                grouped[tab].push(row);
            }

            let totalWritten = 0;

            for (const [tabName, tabRows] of Object.entries(grouped)) {
                // Create tab if it doesn't exist
                if (!existingTabs.has(tabName)) {
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId,
                        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
                    });
                    existingTabs.add(tabName);
                }

                // Check if header exists
                const existing = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `'${tabName}'!A1:G1`
                }).catch(() => null);

                const values = [];
                const headers = TAB_HEADERS[tabName] || TAB_HEADERS['Active Pain'];
                if (!existing || !existing.data.values || existing.data.values.length === 0) {
                    values.push(headers);
                }

                const fields = TAB_FIELDS[tabName] || TAB_FIELDS['Active Pain'];
                for (const row of tabRows) {
                    values.push(fields.map(f => row[f] || ''));
                }

                await sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range: `'${tabName}'!A1`,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values }
                });

                totalWritten += tabRows.length;
            }

            return textResult(`Wrote ${totalWritten} rows across ${Object.keys(grouped).length} tab(s).`);
        } catch (err) {
            return textResult(`ERROR writing to Google Sheet: ${err.message}`);
        }
    }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
