import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import admin from 'firebase-admin';
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

const server = new McpServer({
    name: 'pfi-outreach',
    version: '1.0.0'
});

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
    'Save new leads to Firestore. Deduplicates against existing leads by LinkedIn URL.',
    {
        userId: z.string().describe('Firebase user ID'),
        leads: z.array(z.object({
            name: z.string(),
            company: z.string(),
            linkedin: z.string()
        })).describe('Array of leads to save')
    },
    async ({ userId, leads }) => {
        const existing = await leadsRef(userId).get();
        const existingUrls = new Set();
        existing.forEach(doc => {
            const url = doc.data().linkedin;
            if (url) existingUrls.add(url.toLowerCase());
        });

        let added = 0;
        let skipped = 0;
        const batch = db.batch();

        for (const lead of leads) {
            if (existingUrls.has(lead.linkedin.toLowerCase())) {
                skipped++;
                continue;
            }
            const ref = leadsRef(userId).doc();
            batch.set(ref, {
                name: lead.name,
                company: lead.company,
                linkedin: lead.linkedin,
                message: '',
                done: false,
                channel: 'linkedin',
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
    'Mark a lead as done after outreach is sent. Increments the daily LinkedIn counter.',
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
    'Get today\'s LinkedIn send count and the daily limit',
    { userId: z.string().describe('Firebase user ID') },
    async ({ userId }) => {
        const key = todayKey();
        const doc = await profileRef(userId).get();
        const data = doc.exists ? doc.data() : {};
        const count = data[key] || 0;
        const limit = data.linkedinLimit || 20;
        return textResult(JSON.stringify({ count, limit, remaining: limit - count }));
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
