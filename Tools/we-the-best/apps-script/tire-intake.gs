/**
 * WE THE BEST — Tire Intake web app (tires coming IN only).
 *
 * A phone-friendly "texting" page that lives inside the spreadsheet. Whoever is
 * receiving tires types the size however they naturally type it and hits send:
 *   "225 45 17"  ·  "225/45R17"  ·  "P225/45R17"  ·  "2254517"  ·  "4 225 45 17"
 *   "225 45 17 x4"  ·  "qty 8 205 60 16"  ...
 * The script pulls the three numbers out, reformats to the standard size
 * (WWW-AA-DD, e.g. 225-45-17), and tags it with the New/Used the operator picked
 * on the page (the Nueva/Usada toggle). The Tire Inventory row key is the combined
 * label "<size> <Nueva|Usada>" (e.g. "225-45-17 Usada"), which is exactly what mom
 * sees and picks in her sale dropdown — so New and Used of one size are two separate
 * sellable lines, each with its own count. It then updates Tire Inventory:
 *   - that size+condition already listed -> add the count to its Qty on Hand
 *   - first time for that size+condition -> append a clean new row with the count
 * If it can't read a valid size it replies "didn't catch that, type it again"
 * and NOTHING is written until the input is clean.
 *
 * NOTE: column A holds the "<size> <condition>" label and B holds Qty on Hand, so the
 * sale-link onEdit and the catalog FILTER (Tire Inventory!A2:A…) need NO changes — they
 * already match column A exactly and decrement column B.
 *
 * UNDO: press-and-hold a sent size on the phone -> confirm -> undoTire() subtracts
 * that same count back off the size's Qty on Hand (never below 0).
 *
 * Sales are NOT handled here — they stay in the sheet with the Inv Item dropdown
 * so the cost-and-profit link (see onEdit) stays intact. This only ADDS stock.
 *
 * SETUP (owner does this by hand — the service account cannot deploy Apps Script):
 *   1. Extensions -> Apps Script (the same project that has onEdit).
 *   2. Add a script file named  tire-intake  and paste this file in.
 *   3. Add an HTML file named   tire-intake-page  and paste tire-intake-page.html in.
 *   4. Save. Deploy -> New deployment -> type: Web app.
 *        Execute as:  Me (the owner)        <- so it can write the sheet
 *        Who has access:  Anyone            <- so the phone needs no Google login
 *   5. Open the web-app URL on the phone, Share -> Add to Home Screen.
 *      It opens full-screen like a messaging app.
 */

var TIRE_TAB = "Tire Inventory"; // A = Tire Size, B = Qty on Hand

/** Serve the texting page. */
function doGet() {
  // NOTE: addMetaTag only allows a short list (viewport is fine); the apple-mobile-web-app-*
  // tags are rejected by Apps Script ("meta tag not allowed in this context"), so don't add them.
  return HtmlService.createHtmlOutputFromFile("tire-intake-page")
    .setTitle("WE THE BEST — Entrada de llantas")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
}

/**
 * Parse free-typed text into { ok, size, qty } or { ok:false }.
 * size is the standard WWW-AA-DD string; qty defaults to 1.
 */
function parseIntake(raw) {
  var text = String(raw == null ? "" : raw).trim();
  if (!text) return { ok: false };
  var up = text.toUpperCase();

  // 0) condition word typed in the text (Spanish or English) — overrides the page toggle.
  //    "usada/usado/usadas", "nueva/nuevo/nuevas", "used", "new". Then strip it out.
  var condition = null;
  if (/\b(?:USAD[AO]S?|USED)\b/.test(up)) condition = "Usada";
  else if (/\b(?:NUEV[AO]S?|NEW)\b/.test(up)) condition = "Nueva";
  up = up.replace(/\b(?:USAD[AO]S?|USED|NUEV[AO]S?|NEW)\b/g, " ");

  // 1) explicit quantity markers — English ("4x", "x4", "qty 4") and Spanish
  //    ("cantidad 4", "cant 4", "4 piezas"/"pzas"). Then strip them out.
  var qty = null, qm;
  if ((qm = up.match(/(\d{1,3})X(?![0-9])/))) { qty = parseInt(qm[1], 10); up = up.replace(qm[0], " "); }
  else if ((qm = up.match(/X\s*(\d{1,3})(?![0-9])/))) { qty = parseInt(qm[1], 10); up = up.replace(qm[0], " "); }
  else if ((qm = up.match(/(?:QTY|QUANTITY|COUNT|CANT(?:IDAD)?|CTD)\D{0,3}(\d{1,3})/))) { qty = parseInt(qm[1], 10); up = up.replace(qm[0], " "); }
  else if ((qm = up.match(/(\d{1,3})\s*(?:PIEZAS?|PZAS?|UNID(?:ADES?)?|LLANTAS?)\b/))) { qty = parseInt(qm[1], 10); up = up.replace(qm[0], " "); }

  // 2) the size triple: 3 digits, 2 digits, 2 digits, any junk (incl. R/ZR/P/LT) between
  var w, a, d, matchStr = null;
  var sm = up.match(/(\d{3})\s*[^0-9]*?(\d{2})\s*[^0-9]*?(\d{2})(?![0-9])/);
  if (sm) { w = sm[1]; a = sm[2]; d = sm[3]; matchStr = sm[0]; }
  else {
    var digits = up.replace(/[^0-9]/g, "");
    if (digits.length === 7) { w = digits.slice(0, 3); a = digits.slice(3, 5); d = digits.slice(5, 7); }
    else return { ok: false };
  }

  // 3) any leftover standalone number (no explicit marker) is the quantity
  if (qty == null) {
    var rest = matchStr ? up.replace(matchStr, " ") : "";
    var leftover = rest.match(/\d{1,3}/g);
    if (!leftover) qty = 1;
    else if (leftover.length === 1) qty = parseInt(leftover[0], 10);
    else return { ok: false }; // more than one stray number -> ambiguous
  }

  // 4) sanity ranges — catches typos and garbage
  var W = +w, A = +a, D = +d;
  if (W < 125 || W > 395) return { ok: false };
  if (A < 20 || A > 95) return { ok: false };
  if (D < 12 || D > 28) return { ok: false };
  if (!(qty >= 1 && qty <= 99)) return { ok: false };

  return { ok: true, size: w + "-" + a + "-" + d, qty: qty, condition: condition };
}

/** Normalize the page's toggle into "Nueva" or "Usada" (defaults to Nueva). */
function normCondition(c) {
  var s = String(c == null ? "" : c).trim().toLowerCase();
  if (s === "usada" || s === "usado" || s === "used" || s === "u") return "Usada";
  return "Nueva"; // default to New
}

/**
 * Called from the page. Receives stock for one size + condition (New/Used).
 * Returns { ok, message, size, qty, onHand, isNew, condition } for the reply bubble.
 * `size` is the combined "<size> <condition>" label, which is also the undo key.
 * Writes NOTHING unless the size parses clean.
 */
function receiveTire(raw, condition) {
  var p = parseIntake(raw);
  if (!p.ok) return { ok: false, message: "no entendí, escríbelo otra vez" };

  var cond = normCondition(p.condition || condition); // a typed word (Spanish/English) wins, else the toggle
  var label = p.size + " " + cond; // row key + what mom sees/picks in the sale dropdown

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) {
    return { ok: false, message: "está ocupado, mándalo otra vez" };
  }
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(TIRE_TAB);
    if (!sh) return { ok: false, message: "no encontré la pestaña de inventario de llantas" };

    var last = sh.getLastRow();
    var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 2).getValues() : []; // A:B
    var totalRow = 0, foundRow = 0, current = 0;
    for (var i = 0; i < rows.length; i++) {
      var name = (rows[i][0] || "").toString().trim();
      if (name.toUpperCase() === "TOTAL") { totalRow = i + 2; continue; }
      if (name === label) { foundRow = i + 2; current = Number(rows[i][1]) || 0; break; }
    }

    var onHand;
    if (foundRow) {                       // size+condition already listed -> add to its count
      onHand = current + p.qty;
      sh.getRange(foundRow, 2).setValue(onHand);
    } else {                              // first time for this size+condition -> clean new row
      onHand = p.qty;
      var target = totalRow ? totalRow : (last + 1); // keep above a TOTAL row if present
      if (totalRow) sh.insertRowBefore(totalRow);
      sh.getRange(target, 1).setValue(label);
      sh.getRange(target, 2).setValue(onHand);
    }

    var times = p.qty === 1 ? "" : (p.qty + " × ");
    var tag = foundRow ? "" : " (primera vez)";
    return {
      ok: true,
      size: label, qty: p.qty, onHand: onHand, isNew: !foundRow, condition: cond,
      message: "Agregué " + times + p.size + " (" + cond + ")" + tag + ". Ahora hay " + onHand + " en inventario."
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reverse one previously-received entry (the phone's "hold to undo").
 * Subtracts the same qty back off that size's Qty on Hand (never below 0), so
 * it still does the right thing even if a sale decremented it in between.
 * Returns { ok, message, onHand } for the reply bubble.
 */
function undoTire(size, qty) {
  size = String(size == null ? "" : size).trim();
  qty = parseInt(qty, 10);
  if (!size || !(qty >= 1)) return { ok: false, message: "nada que deshacer" };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) {
    return { ok: false, message: "está ocupado, intenta deshacer otra vez" };
  }
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(TIRE_TAB);
    if (!sh) return { ok: false, message: "no encontré la pestaña de inventario de llantas" };

    var last = sh.getLastRow();
    var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][0] || "").toString().trim() !== size) continue;
      var cur = Number(rows[i][1]) || 0;
      var next = cur - qty; if (next < 0) next = 0;
      sh.getRange(i + 2, 2).setValue(next);
      var times = qty === 1 ? "" : (qty + " × ");
      return { ok: true, size: size, onHand: next, message: "Quité " + times + size + ". Ahora hay " + next + " en inventario." };
    }
    return { ok: false, message: "no encontré " + size + " para deshacer" };
  } finally {
    lock.releaseLock();
  }
}
