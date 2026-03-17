import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
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
const userRef = (uid) => db.collection('users').doc(uid);
const profileRef = (uid) => userRef(uid).collection('profile').doc('main');
const leadsRef = (uid) => userRef(uid).collection('leads');
const tasksRef = (uid) => userRef(uid).collection('tasks');
const textResult = (text) => ({ content: [{ type: 'text', text }] });
const todayKey = () => 'linkedin_' + new Date().toISOString().split('T')[0];
const emailTodayKey = () => 'email_' + new Date().toISOString().split('T')[0];

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
            await leadsRef(userId).doc(leadId).update({
                done: true,
                sentAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await profileRef(userId).update({
                [key]: admin.firestore.FieldValue.increment(1)
            });
            return textResult(`Email sent to ${to}. Lead ${leadId} marked done. Count: ${count + 1}/${limit}.`);
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
    'Save a message to a specific lead document',
    {
        userId: z.string().describe('Firebase user ID'),
        leadId: z.string().describe('Lead document ID'),
        message: z.string().describe('The LinkedIn connection note (under 300 chars)')
    },
    async ({ userId, leadId, message }) => {
        await leadsRef(userId).doc(leadId).update({ message });
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

        await leadsRef(userId).doc(leadId).update({
            done: true,
            sentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await profileRef(userId).update({
            [key]: admin.firestore.FieldValue.increment(1)
        });

        return textResult(`Lead ${leadId} marked done. Count: ${count + 1}/${limit}.`);
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
        const tasks = ['findLeads', 'writeMessages', 'performOutreach'];
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

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
