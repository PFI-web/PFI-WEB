Here is your full **P.md** — clean, minimal, copy-paste ready:

---

# **Implementation Principles**

## 1. **Guiding Rules**

1. **Bare minimum only**

   * Reduce scope until it breaks.
   * Add back only what is strictly necessary for functionality.

2. **MVVM, simplest possible**

   * Follow the app’s existing MVVM pattern.
   * No extra layers or abstractions.
   * No third-party dependencies unless absolutely unavoidable.

3. **Confirm before coding each step**

   * Developer must always state the **plan** first (see Confirmation Protocol).
   * Wait for explicit **“Approved”** before writing any code.
   * Repeat this confirmation loop for every step.

4. **Reuse before adding**

   * Always check if existing logic or methods can be reused.
   * Do not create new methods or add complexity unless absolutely necessary.

---

## 2. **Confirmation Protocol**

For **every change step**, the developer must post:

**“Step N — Plan to implement:”**

**Explanation (max 2 short paragraphs)**

* Paragraph 1 — technical explanation of what will change, what logic is added or reused, constraints, and how this follows the simplicity and minimal-scope rules.
* Paragraph 2 — the same explanation using a simple real-world analogy to prove the solution is minimal and intuitive.

**Implementation details**

* **Files/components to add/edit** → names only (no exact paths)
* **Data structures / functions** → names + signatures
* **Inclusions / exclusions** → what will and will not be done
* **Test cases** → validations to confirm implementation

---

## 3. **Questions Protocol**

* Always ask questions if unsure.
* Never make assumptions.
* Keep asking until the task is **100% clear**.

---

## 4. **Simplicity Protocol**

* Every implementation must reduce or maintain simplicity.
* Complexity should never be introduced.
* **Simplify over complexity** — this is the default rule.

---

## 5. **Don’t Touch Rule**

* Do not touch or change any functionality that is not related to the task at hand.
* If unrelated code must change, confirm first and wait for explicit approval.

---

## 6. **Methods Rule**

* Do not create new methods or logic if existing logic can be reused or safely tweaked.
* Remove methods or logic that are no longer in use (dead code) or add unnecessary complexity.
* The bare minimum is the goal.

---

## 7. **Simpler**

* After forming a solution, ask: can this be done simpler?
* If yes, simplify it.
* Briefly explain why the simpler approach still achieves the required functionality.

---

⚠️ **Do not write code** until receiving explicit **“Approved”** reply.
Once approved, implement **only** what was confirmed.
