import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

async function products(range) {
  const v = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range })).data.values || [];
  const head = v[0].map((h) => (h || "").toString().trim().toLowerCase());
  const pi = head.indexOf("product");
  return v.slice(1).map((r) => (r[pi] || "").toString().trim()).filter(Boolean);
}

const all = [
  ...(await products("'Transactions (older)'!A1:N1599")),
  ...(await products("'Transactions (Jun 13+)'!A1:I200")),
];

// services / non-parts to set aside
const SERVICE = /^(oil change|inspection|inspeccion|labor|deposit|deposito|total made|expense|office|car wash|diagnostic|diagnosis|tune up|alignment|mount|balance|rotation)/i;

const norm = (s) => s.toLowerCase().replace(/\$?\d[\d.,]*/g, "").replace(/\s+/g, " ").trim();
const counts = new Map();
for (const p of all) {
  const n = norm(p);
  if (!n) continue;
  counts.set(n, (counts.get(n) || 0) + 1);
}
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

console.log("=== RECURRING (count >= 2), parts-ish vs service ===");
for (const [name, c] of sorted) {
  if (c < 2) continue;
  const tag = SERVICE.test(name) ? "service" : "PART?";
  console.log(`${String(c).padStart(3)}  [${tag}]  ${name}`);
}
console.log(`\nTotal distinct normalized products: ${counts.size}; rows scanned: ${all.length}`);
