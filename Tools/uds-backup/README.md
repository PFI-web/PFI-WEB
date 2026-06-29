# UDS Research Project — Handoff Doc

This folder contains in-progress research on **United Delivery Service (UDS)**, a regional last-mile courier in IL/IN/WI. The work was started in a previous Claude session and paused mid-flight while an MCP server bug was patched. This doc gives you everything you need to pick up where we left off.

---

## 1. What we're trying to figure out

The user is researching UDS for two related reasons:

1. **Reverse-engineer UDS's warehouse footprint** by looking at where they deliver packages most. The logic: high delivery density in a metro implies a warehouse within ~30 miles, because last-mile carriers cluster facilities near their delivery volume.
2. **Identify UDS's customers** — both who ships *through* UDS (e-commerce brands, pharma companies, hospitals) and where those customer pickup points are physically located.

Combined, this lets the user map the entire UDS network: depots, customer pickup sites, and delivery hotspots.

This is a **separate research track** from the user's main PFI (Permit Friction) outreach work. The main Proof Sheet is for energy/infrastructure projects with permitting friction; the UDS work lives in three custom tabs (see §4).

---

## 2. What UDS is (the subject company)

- **United Delivery Service (UDS)**, founded 1972, HQ Oakbrook Terrace IL (1S376 Summit Ave Ste 1F, 60181).
- Regional same-day / next-day parcel + courier operator serving **Illinois, Indiana, Wisconsin**.
- Claims **15 facilities** and **150,000 packages/day** capacity (source: MapQuest listing).
- Verticals (per their site): Automotive, Floral, Grocery, Meal Kits & Perishables, Office Supplies, **Prescription Drugs**, Retail & E-Commerce, Wine & Spirits, Payroll, Banking, Small Business, Cosmetics.
- Privately held. No known institutional backer. ~50+ year operator history.
- Also operates under (or related to) "Reliable Transport Services" per a Reddit thread — worth verifying as a DBA.

---

## 3. What we've established so far (the headline findings)

### 3a. Confirmed UDS facility map (11 of their claimed 15)
From the official UDS locations page, Yelp/MapQuest listings, and Indeed employee location tags:

| State | Sites |
|---|---|
| IL | Oakbrook Terrace (HQ), Chicago (20K sq ft main hub), Aurora, Lombard, Itasca, Waukegan, Machesney Park (10K sq ft, Rockford area) |
| IN | Griffith (311 N Colfax St, 46319 — confirmed address), Fort Wayne (10K sq ft), Indianapolis (1936 S Lynhurst Dr, 46241 — flagged: Yelp says CLOSED but ZipRecruiter shows 60+ active IN jobs; status unclear) |
| WI | Milwaukee |

Historical signal: NWI Times reported UDS considered Merrillville IN (6707 Broadway) for a distribution facility — likely superseded by the Griffith site.

**Gap**: ~3-4 facilities not yet identified. Likely candidates: Madison WI, Green Bay/Appleton WI, central IL (Peoria/Bloomington), South Bend IN.

### 3b. UDS operates TWO distinct pickup models
This was a critical finding for understanding their customer base:

| Model | Used for | What it means |
|---|---|---|
| **Injection** | E-commerce parcels (Urban Outfitters and all URBN brands, EasyPost-integrated merchants, meal kits likely) | A national shipper trucks packages from a remote DC (e.g., URBN's Gap PA fulfillment center) into a UDS depot. UDS only does the last ~30 miles. The shipper's "warehouse" is **out of region**. |
| **Direct pickup** | Pharma/healthcare (pharmacy DCs, hospital docks, specialty pharmacies, compounding labs), grocery, floral, auto parts, payroll/banking, wine & spirits | UDS drivers physically visit the customer's site to pick up packages, then deliver them. Customer warehouses are **inside the UDS service radius** — this is the model that helps us locate real customer facilities in IL/IN/WI. |

Evidence:
- Indeed driver review: "Load up and head out for deliveries once all stops are completed you go home" — describes the injection model (drivers don't visit shipper sites).
- UDS Prescription Drugs page: "Real-time Signature Capture to accurately gauge pick-up and delivery times", "STAT deliveries on-demand", "Service available to Hospitals, Pharmacies and Residences" — describes direct pickup.
- UDS quote in Parcel Industry PDF: "Later processing times and flexible services means UDS can offer faster shipping than national carriers, while our dense, integrated Next Day routing system sets us apart" — pitches the injection model to e-com shippers.

### 3c. Confirmed/inferred customers
- **Urban Outfitters** (CONFIRMED via Reddit threads, eBay forums, QVC community) → injection from Gap PA fulfillment center (URBN's 1.2M sq ft east coast FC).
- **URBN sister brands** (Anthropologie, Free People, FP Movement, Terrain, BHLDN, Nuuly) → inferred same lane.
- **Pharmacy / hospital verticals** → direct pickup. **Walgreens HQ at Deerfield IL (200 Wilmot Rd, 60015)** is the most obvious anchor candidate; specialty pharmacies (Accredo Naperville, CVS Specialty Bannockburn area) are next-best.
- **EasyPost-integrated long-tail e-com merchants** — UDS is listed as a shipper carrier in EasyPost/Shippo/AfterShip/Track123/ShipStation, so hundreds of small merchants likely use them via these platforms.

### 3d. Service radius math
Derived from industry benchmarks (Indeed medical courier listings, USPack specialty-pharmacy case study, Reddit r/couriersofreddit, Oxmaint urban fleet study):
- Medical courier dedicated routes: ~300-500 mi/day round trip.
- Dense urban last-mile: 80-120 stops/day at 50-100 mi total driving.
- Specialty pharmacy same-day delivery window: ~50 mi from origin.

Working radii applied:
- **~25 mi** = dense parcel last-mile from depot.
- **~40 mi** = pharma/STAT direct-pickup from depot (50 mi outer bound).

### 3e. Hospital systems + pharma DCs within each UDS facility's radius
Enumerated for: Greater Chicago Metro (Northwestern, Rush, UChicago, Advocate, Endeavor, Loyola, Cook County Health, Lurie, Ascension, AdventHealth, etc.), Rockford (Mercyhealth, OSF, UW Health), Milwaukee (Froedtert, Advocate Aurora, Children's Wisconsin, Ascension, ProHealth), Fort Wayne (Parkview, Lutheran), Indianapolis (IU Health, Community, Ascension St. Vincent, Eskenazi, Franciscan), NW Indiana (Methodist, Powers Health, Franciscan).

Pharma DCs flagged (some need exact-address verification): Walgreens HQ Deerfield, Cardinal Health Aurora IL, AmerisourceBergen Romeoville/Lockport, McKesson Midwest, Henry Schein Niles/Elk Grove, Accredo Naperville, CVS Specialty Bannockburn area.

**Excluded by design**: individual retail pharmacy stores (Walgreens/CVS storefronts). Thousands per metro; they are delivery DESTINATIONS not customer pickup origins.

---

## 4. The data files (this folder)

| File | Rows | What it is |
|---|---|---|
| `uds-delivery-map.json` | 18 | One row per UDS facility, delivery zone, or network-level signal. Schema: city, state, zip, signal_type, evidence, frequency_hint, source_url, inferred_facility, notes. |
| `uds-customers.json` | 16 | One row per UDS customer or vertical, including pickup model (injection vs direct pickup). Schema: customer, vertical, pickup_model, evidence, frequency_hint, source_url, customer_warehouse_location, notes. |
| `uds-service-radius.json` | 54 | One row per hospital system / pharma DC inside each UDS facility's service radius, plus methodology and gap rows. Schema: facility, radius_miles, institution, institution_type, city_state, est_miles_from_facility, pickup_candidate, evidence_source, notes. |

All three are valid JSON arrays of objects. Each object's keys are the column names; values are strings.

---

## 5. State of the Google Sheet

**Spreadsheet ID**: `1VjCQBw86I8vTTbqyJ8EyJI4XnbaZbnge2ihGsDud2uI`

| Tab | Current state |
|---|---|
| `Proof Sheet` (main) | Has **one UDS row** added (company-level entry with warehouse expansion angle in `why_them`). This row landed successfully. Leave it alone unless updating. |
| `UDS Delivery Map` | EXISTS but EMPTY (broken — see §6). Needs to be repopulated from `uds-delivery-map.json`. |
| `UDS Customers` | EXISTS but EMPTY. Needs to be repopulated from `uds-customers.json`. |
| `UDS Service Radius` | EXISTS but EMPTY. Needs to be repopulated from `uds-service-radius.json`. |

---

## 6. The MCP server bug and the patch

**What was broken**: `Tools/mcp-server/index.js` originally hardcoded only two tab schemas (`Proof Sheet`, `Learning Track`). Writing to any other tab name silently fell back to Proof Sheet headers, so custom field keys (city, signal_type, customer, pickup_model, etc.) didn't match — rows were written but all cells were blank because keys didn't match the field map. The tool returned a misleading "Wrote N rows" success message.

**What was fixed**: Added a `resolveSchema(sheets, spreadsheetId, tabName, sampleRow)` helper. For unknown tabs:
- Write path → derives `headers`/`fields` from the first row's keys (snake_case → Title Case for display).
- Read path → derives `headers`/`fields` from the existing row-1 header in the sheet.
- If existing headers don't match the new row keys on write (which is the case for the three broken UDS tabs), the patch clears row 1 and rewrites correct headers, then appends data.

Net effect: on the next `write_proof_sheet` call to any of the three UDS tabs, the broken Proof Sheet headers in row 1 will be auto-replaced with the correct headers derived from the JSON, and the data will land correctly.

The patch is already applied to `Tools/mcp-server/index.js` and passes `node --check`. **The patch only takes effect after the MCP session is restarted** (i.e., the `claude --mcp-config '{...}'` command is re-run from terminal).

---

## 7. Immediate next task

In order:

1. **Read** the three JSON files in this folder.
2. **Write** each one to its corresponding tab using `write_proof_sheet` with the spreadsheet ID above.
3. **Read** each tab back to confirm row counts: 18, 16, 54.
4. **Report** to the user whether all three tabs landed clean.

---

## 8. Further work the user may want next (don't do unprompted)

- Find the missing 3-4 UDS facilities (likely Madison WI, Green Bay/Appleton, central IL, South Bend IN).
- Verify the Indianapolis facility status (closed vs relocated vs still active).
- Pin down exact addresses for Cardinal Health Aurora, McKesson Midwest, AmerisourceBergen Romeoville/Lockport, Walgreens Specialty Pharmacy ops.
- Investigate Walgreens Deerfield as a confirmed UDS pharma client (the most likely anchor account).
- Map UDS truck routes more precisely using Glassdoor reviews mentioning specific shipper pickup sites.
- Decide whether to pitch UDS as a permitting-friction interview subject (their warehouse expansion = recurring zoning/conditional-use exposure).

---

## 9. Important context constraints (from user memory)

- **Proof Sheet duplicate rows** are intentional and load-bearing. Never merge or restructure existing rows — only fill empty cells in place.
- **No em dashes in outreach emails** (subject + body). This rule doesn't apply to internal briefing fields like `why_them`, but be conservative.
- **PFI is a data instrument, not a "firm"**. Frame accordingly if you write anything user-facing.
- The user prefers terse, action-oriented responses. They responded "Go" to multiple questions to keep things moving. Skip over-questioning.
