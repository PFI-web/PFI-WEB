const admin = require('firebase-admin');
const serviceAccount = require('../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'thepfi'
});

const db = admin.firestore();

async function seedTest() {
    const uid = 'testuser1';
    const userRef = db.collection('test').doc(uid);

    // Profile
    await userRef.collection('profile').doc('main').set({
        onboarded: true,
        name: 'Test User',
        role: 'Tester',
        skill: 'You are helping Test User, a Tester at PFI.',
        linkedinLimit: 20,
        emailLimit: 20,
        claudeStarted: true
    });
    console.log('Seeded test profile');

    // Leads — 3 types
    const leadsRef = userRef.collection('leads');

    await leadsRef.doc('lead_both').set({
        name: 'Sarah Chen',
        company: 'Apex Infrastructure Partners',
        role: 'VP of Development',
        linkedin: 'https://www.linkedin.com/in/sarahchen-apex',
        email: 'schen@apexinfra.com',
        channel: 'email',
        enrichmentSource: 'hunter',
        message: '',
        done: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sentAt: null
    });

    await leadsRef.doc('lead_email_only').set({
        name: 'James Rivera',
        company: 'Meridian Power Holdings',
        role: 'Director of Permitting',
        linkedin: '',
        email: 'jrivera@meridianpower.com',
        channel: 'email',
        enrichmentSource: 'hunter',
        message: '',
        done: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sentAt: null
    });

    await leadsRef.doc('lead_linkedin_only').set({
        name: 'Marcus Webb',
        company: 'Solaris Capital Group',
        role: 'Partner, Infrastructure Investments',
        linkedin: 'https://www.linkedin.com/in/marcuswebb-solaris',
        email: '',
        channel: 'linkedin',
        enrichmentSource: 'none',
        message: '',
        done: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sentAt: null
    });
    console.log('Seeded 3 test leads (both, email-only, linkedin-only)');

    // Pending writeMessages task
    await userRef.collection('tasks').doc('writeMessages').set({
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Seeded pending writeMessages task');

    console.log('Done!');
    process.exit(0);
}

seedTest().catch(err => {
    console.error(err);
    process.exit(1);
});
