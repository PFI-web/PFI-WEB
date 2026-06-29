/**
 * WE THE BEST — new-day auto-calc + sale → inventory link.
 *
 * Columns: A Product | B Payment | C Amount Paid | D Part Cost | E Profit | F Date | G Type | H Tip | I Notes | J Inv Item
 *
 * NEW-DAY AUTO-CALC (so formulas just work when you add a new day):
 *   - Type or paste any transaction row on "Transactions (Jun 13+)" and the script
 *     fills that row's Profit (col E) with =IF(C="","",C-N(D)) = Amount Paid - Part Cost.
 *   - To close out a day, type "total" in the Product column (A) of the next blank row.
 *     It becomes "Total made (profit) <date>" with that day's profit summed in col E.
 *
 * SALE -> INVENTORY LINK.
 * Fires when mom picks / clears / changes an item in the "Inv Item" dropdown
 * (column J) on the "Transactions (Jun 13+)" tab.
 *   APPLY a pick:
 *     PART  -> auto-fills Part Cost (col D) from the part's cost (only if empty,
 *              so a typed number is never overwritten) and stamps "Sold On"
 *              (Parts Inventory col F) -> Status flips to Sold (FIFO: oldest
 *              in-stock part of that name).
 *     TIRE  -> subtracts 1 from that size's Qty on Hand (Tire Inventory col B),
 *              never below 0.
 *   REVERSE on clear/change (uses the cell's previous value):
 *     PART  -> finds the part stamped for THIS sale row, clears its Sold On
 *              (back to In stock) and clears the cost the script filled.
 *     TIRE  -> adds 1 back to that size's Qty on Hand.
 *   Changing X -> Y reverses X then applies Y.
 * Owner-authorized to edit Tire Qty on Hand. Count only for tires (no cost).
 * Simple onEdit trigger — just Save, no deployment. Keep the name "onEdit".
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== "Transactions (Jun 13+)") return;

  handleCalc(sh, e.range); // auto-fill Profit on new rows + "total" day-close

  if (e.range.getColumn() !== 10 || e.range.getRow() < 2) return; // J = Inv Item

  var row = e.range.getRow();
  var newVal = (e.value || "").toString().trim();
  var oldVal = (e.oldValue || "").toString().trim();
  if (newVal === oldVal) return;

  var parts = e.source.getSheetByName("Parts Inventory");
  var tire = e.source.getSheetByName("Tire Inventory");

  if (oldVal) reverseItem(sh, row, oldVal, parts, tire); // un-do the previous pick
  if (newVal) applyItem(sh, row, newVal, parts, tire);   // ring up the new pick
}

function applyItem(sh, row, name, parts, tire) {
  // ---- PART ----
  if (parts) {
    var lp = parts.getLastRow();
    if (lp >= 3) {
      var pv = parts.getRange(3, 2, lp - 2, 5).getValues(); // B..F
      for (var i = 0; i < pv.length; i++) {
        if ((pv[i][0] || "").toString().trim() !== name) continue; // B Name
        var soldOn = pv[i][4];                                     // F Sold On
        if (soldOn && soldOn.toString().trim()) continue;          // already sold -> next (FIFO)
        var costCell = sh.getRange(row, 4);                        // D Part Cost
        var cc = costCell.getValue();
        if (cc !== "" && cc !== null) return;                      // respect a typed cost
        costCell.setValue(pv[i][1]);                               // C Cost (Parts Inventory)
        var dVal = sh.getRange(row, 6).getValue();                 // F on Jun 13+ = Date
        parts.getRange(i + 3, 6).setValue("Jun 13+ row " + row + (dVal ? " (" + dVal + ")" : ""));
        return;
      }
    }
  }
  // ---- TIRE ----
  if (tire) {
    var lt = tire.getLastRow();
    if (lt >= 2) {
      var tv = tire.getRange(2, 1, lt - 1, 2).getValues(); // A..B
      for (var j = 0; j < tv.length; j++) {
        if ((tv[j][0] || "").toString().trim() !== name) continue;  // A Tire Size
        var left = Number(tv[j][1]);                                // B Qty on Hand
        if (!isNaN(left) && left > 0) {                             // first listing with stock
          tire.getRange(j + 2, 2).setValue(left - 1);
          return;
        }
        // this listing is empty/blank -> keep looking for the next listing of the same size
      }
    }
  }
}

function reverseItem(sh, row, oldVal, parts, tire) {
  // ---- TIRE: add 1 back ----
  if (tire) {
    var lt = tire.getLastRow();
    if (lt >= 2) {
      var tv = tire.getRange(2, 1, lt - 1, 2).getValues(); // A..B
      for (var j = 0; j < tv.length; j++) {
        if ((tv[j][0] || "").toString().trim() !== oldVal) continue; // A Tire Size
        var q = Number(tv[j][1]);                                    // B Qty on Hand
        if (!isNaN(q)) tire.getRange(j + 2, 2).setValue(q + 1);
        return;
      }
    }
  }
  // ---- PART: clear the stamp for THIS sale row + the cost we filled ----
  if (parts) {
    var lp = parts.getLastRow();
    if (lp >= 3) {
      var re = new RegExp("^Jun 13\\+ row " + row + "(\\D|$)"); // exact row, not a prefix (1 vs 12)
      var sv = parts.getRange(3, 6, lp - 2, 1).getValues();    // F Sold On
      var cleared = false;
      for (var i = 0; i < sv.length; i++) {
        if (re.test((sv[i][0] || "").toString())) { parts.getRange(i + 3, 6).setValue(""); cleared = true; }
      }
      if (cleared) sh.getRange(row, 4).setValue(""); // clear only the cost the script filled (D Part Cost)
    }
  }
}

// ---- NEW-DAY AUTO-CALC ----
// Columns: A Product | B Pay | C Amount Paid | D Part Cost | E Profit | F Date | G Type
// Runs over every edited row (handles single edits and multi-row pastes).
function handleCalc(sh, range) {
  var startRow = range.getRow();
  var nRows = range.getNumRows();
  for (var i = 0; i < nRows; i++) {
    var row = startRow + i;
    if (row < 2) continue;
    var prod = (sh.getRange(row, 1).getValue() || "").toString().trim(); // A
    if (/^total$/i.test(prod)) { closeDay(sh, row); continue; }           // "total" -> build day total
    if (/^total made/i.test(prod)) continue;                             // existing total row, leave it

    var amt = sh.getRange(row, 3).getValue();                            // C Amount Paid
    var type = (sh.getRange(row, 7).getValue() || "").toString().trim(); // G Type
    if ((amt === "" || amt === null) && !type) continue;                 // blank row, nothing to calc

    var profit = sh.getRange(row, 5);                                    // E Profit = Amount Paid - Part Cost
    if (profit.getValue() === "" || profit.getValue() === null) {
      profit.setFormula("=IF(C" + row + "=\"\",\"\",C" + row + "-N(D" + row + "))");
    }
  }
}

// Turn a typed "total" in column A into the day's "Total made (profit)" row.
function closeDay(sh, row) {
  var start = 2;                                                         // first row of this day's block
  for (var r = row - 1; r >= 2; r--) {
    if (/^total made/i.test((sh.getRange(r, 1).getValue() || "").toString().trim())) { start = r + 1; break; }
  }
  var end = row - 1;
  if (end < start) return;                                              // no day rows above the trigger

  var date = "";                                                        // day's date = last filled Date (F) in the block
  for (var k = end; k >= start; k--) {
    var g = sh.getRange(k, 6).getValue();
    if (g !== "" && g !== null) { date = (g instanceof Date) ? Utilities.formatDate(g, Session.getScriptTimeZone(), "M/d/yy") : g.toString().trim(); break; }
  }
  sh.getRange(row, 1).setValue("Total made (profit) " + date);          // A label
  sh.getRange(row, 5).setFormula("=SUM(C" + start + ":C" + end + ")-SUM(D" + start + ":D" + end + ")"); // E day profit
  sh.getRange(row, 1, 1, 5).setFontWeight("bold").setBackground("#fff2cc"); // A..E bold + yellow
  sh.getRange(row, 5).setNumberFormat("$#,##0.00");
}
