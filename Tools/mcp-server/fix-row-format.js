// One-off: find a row by company name in the Proof Sheet and force its
// formatting to black text, left-aligned, top-aligned, CLIP wrapping.
// Usage: node fix-row-format.js "<company substring>"

import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(resolve(__dirname, '../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json'), 'utf8'));

const SPREADSHEET_ID = '1VjCQBw86I8vTTbqyJ8EyJI4XnbaZbnge2ihGsDud2uI';
const TAB = 'Proof Sheet';
const END_COL = 'O'; // 15 columns
const END_COL_IDX = 15;

const match = process.argv[2];
if (!match) {
    console.error('Usage: node fix-row-format.js "<company substring>"');
    process.exit(1);
}

const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

// Get values to find the row
const valuesResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${TAB}'!A:${END_COL}`
});
const rows = valuesResp.data.values || [];
const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] && r[0].toLowerCase().includes(match.toLowerCase()));
if (rowIndex === -1) {
    console.error(`No row matching "${match}"`);
    process.exit(2);
}
const sheetRow = rowIndex + 1; // 1-indexed
console.log(`Found "${rows[rowIndex][0]}" at row ${sheetRow}`);

// Get sheetId for the tab
const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties(sheetId,title)'
});
const sheet = meta.data.sheets.find(s => s.properties.title === TAB);
if (!sheet) {
    console.error(`Tab "${TAB}" not found`);
    process.exit(3);
}
const sheetId = sheet.properties.sheetId;

// Force formatting: black text, left-aligned, top-aligned, CLIP wrap
await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
        requests: [{
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: sheetRow - 1,
                    endRowIndex: sheetRow,
                    startColumnIndex: 0,
                    endColumnIndex: END_COL_IDX
                },
                cell: {
                    userEnteredFormat: {
                        wrapStrategy: 'CLIP',
                        horizontalAlignment: 'LEFT',
                        verticalAlignment: 'TOP',
                        textFormat: {
                            foregroundColor: { red: 0, green: 0, blue: 0 },
                            bold: false
                        }
                    }
                },
                fields: 'userEnteredFormat(wrapStrategy,horizontalAlignment,verticalAlignment,textFormat.foregroundColor,textFormat.bold)'
            }
        }]
    }
});
console.log(`Reformatted row ${sheetRow} (${rows[rowIndex][0]}) to black / left / top / CLIP`);
