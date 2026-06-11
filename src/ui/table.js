// table.js — the transaction table and its row interactions (categorize / learn-rule /
// undo / ignore / delete) plus the add/edit transaction modal. Reads `state`, persists via
// the store, and calls rerender() to refresh the dashboard. Extracted from app.js in Step
// 3b. (Plain JS for now; typing is a later pass.)
import { store } from "../store/index";
import * as insights from "../core/insights";
import { h, $, money, fmtDate, todayIso } from "./dom";
import { toast } from "./toast";
import { openModal } from "./modal";
import { state, EDIT_FIELDS, hasFieldEdits, compose } from "./state";
import { rerender } from "./render-bus";

export function renderTable() {
  const inPeriod = insights.filterByPeriod(state.effective, state.period, state.anchor);
  let rows = inPeriod.slice().sort((a, b) => insights.effDate(b).localeCompare(insights.effDate(a)));
  const f = state.filter;
  rows = rows.filter((t) => {
    if (!f.showIgnored && t.ignored) return false;
    if (f.category !== "all" && t.category !== f.category) return false;
    if (f.text && !(t.description.toLowerCase().includes(f.text) || t.merchant.toLowerCase().includes(f.text))) return false;
    return true;
  });

  const tbody = $("#txn-body");
  tbody.innerHTML = "";
  $("#txn-count").textContent = `${rows.length} shown`;
  for (const t of rows) {
    const badges = [];
    if (t.recurring && !t.ignored) badges.push(h("span", { class: "badge recur" }, "recurring"));
    if (t.ignored) badges.push(h("span", { class: "badge ignored" }, "ignored"));
    if (t.source === "manual") badges.push(h("span", { class: "badge manual" }, "manual"));
    else if (hasFieldEdits(state.overrides[t.id])) badges.push(h("span", { class: "badge edited", title: "Edited from the imported value" }, "edited"));
    const dateInfo = t.effectiveDate !== t.postedDate
      ? h("span", { class: "date-eff", title: `Posted ${fmtDate(t.postedDate)}` }, "•")
      : null;

    const actions = h("div", { class: "row-actions" }, [
      h("button", { class: "icon-btn", title: t.ignored ? "Un-ignore" : "Ignore (exclude from totals)",
        onclick: () => toggleIgnore(t) }, t.ignored ? "↩" : "🚫"),
      h("button", { class: "icon-btn", title: "Edit", onclick: () => openTxnModal(t) }, "✏️"),
      h("button", { class: "icon-btn danger", title: "Delete", onclick: () => deleteTxn(t) }, "🗑"),
    ]);

    tbody.appendChild(h("tr", { class: t.ignored ? "is-ignored" : "" }, [
      h("td", { class: "td-date" }, [fmtDate(insights.effDate(t)), dateInfo]),
      h("td", { class: "td-desc" }, [
        h("div", { class: "merchant" }, t.merchant),
        h("div", { class: "desc-sub" }, badges),
      ]),
      h("td", {}, categorySelect(t)),
      h("td", { class: "td-amount " + (t.amount < 0 ? "neg" : "pos") }, money(t.amount)),
      h("td", { class: "td-actions" }, actions),
    ]));
  }
}

function categorySelect(txn) {
  const sel = h("select", { class: "cat-select" });
  for (const c of state.categories) {
    sel.appendChild(h("option", { value: c.key, selected: c.key === txn.category ? "selected" : null }, `${c.icon} ${c.label}`));
  }
  sel.addEventListener("change", () => {
    // When the user categorizes a previously UNcategorized transaction, also fill in
    // every other still-uncategorized transaction from the same merchant (all history).
    const propagate = txn.category === "uncategorized" && sel.value !== "uncategorized";
    applyCategory(txn, sel.value, propagate);
  });
  return sel;
}

// Assign a category. Two modes:
//  - propagate (the source was uncategorized): "learn" a merchant->category rule, so
//    EVERY transaction from this merchant gets categorized — across all history AND on
//    future imports — from one editable place (the Rules list).
//  - one-off (the source was already categorized): just set this single transaction.
async function applyCategory(srcTxn, category, propagate) {
  if (!propagate) {
    if (srcTxn.source === "manual") {
      const m = state.manual.find((x) => x.id === srcTxn.id);
      if (m) { m.category = category; m.categorySource = "manual"; await store.setManual(state.manual); }
    } else {
      state.overrides[srcTxn.id] = { ...(state.overrides[srcTxn.id] || {}), category };
      await store.setOverrides(state.overrides);
    }
    compose();
    rerender();
    return;
  }

  const merchant = srcTxn.merchant;
  // how many existing transactions this will newly categorize (for the toast)
  const affected = state.effective.filter((t) => t.merchant === merchant && t.category === "uncategorized").length;

  // Snapshot just enough to undo: the learned rule's prior state, and any manual rows
  // we're about to fill. (Bank rows are driven purely by the rule, so reverting the
  // rule reverts them automatically on the next compose.)
  const priorRule = state.rules.categoryRules?.find(
    (r) => r.learned && !r.isRegex && r.match.toLowerCase() === merchant.toLowerCase());
  const undoSnapshot = {
    ruleExisted: !!priorRule,
    prevCategory: priorRule ? priorRule.category : null,
    manual: [],
  };

  learnRule(merchant, category);

  // Rules don't recategorize manual transactions (they're categorySource:'manual'),
  // so fill any manual same-merchant uncategorized rows directly.
  let manualTouched = false;
  for (const m of state.manual) {
    if (m.merchant === merchant && m.category === "uncategorized") {
      undoSnapshot.manual.push({ id: m.id, category: m.category, categorySource: m.categorySource });
      m.category = category; m.categorySource = "manual"; manualTouched = true;
    }
  }

  await store.setRules(state.rules);
  if (manualTouched) await store.setManual(state.manual);
  compose();
  rerender();
  const label = (state.catMap[category] || {}).label || category;
  toast(
    `Categorised ${affected} “${merchant}” ${affected === 1 ? "transaction" : "transactions"} as ${label}, and added a rule so future imports match automatically.`,
    { label: "Undo", fn: () => undoLearnedCategory(merchant, undoSnapshot) }
  );
}

// Revert a learned-category action: remove the rule we added (or restore its previous
// category), and put any directly-edited manual rows back as they were.
async function undoLearnedCategory(merchant, snap) {
  const rules2 = state.rules.categoryRules || [];
  const idx = rules2.findIndex((r) => r.learned && !r.isRegex && r.match.toLowerCase() === merchant.toLowerCase());
  if (idx >= 0) {
    if (snap.ruleExisted) rules2[idx].category = snap.prevCategory; // we updated it
    else rules2.splice(idx, 1);                                     // we added it
  }
  for (const u of snap.manual) {
    const m = state.manual.find((x) => x.id === u.id);
    if (m) { m.category = u.category; m.categorySource = u.categorySource; }
  }
  await store.setRules(state.rules);
  if (snap.manual.length) await store.setManual(state.manual);
  compose();
  rerender();
  toast(`Reverted “${merchant}”.`);
}

// Add or update a learned "merchant -> category" rule. Appended after the user's
// curated rules (first match wins); de-duplicated by merchant. Marked learned:true
// so it's easy to spot and edit/remove in the Rules editor.
function learnRule(merchant, category) {
  state.rules.categoryRules = state.rules.categoryRules || [];
  const existing = state.rules.categoryRules.find(
    (r) => r.learned && !r.isRegex && r.match.toLowerCase() === merchant.toLowerCase());
  if (existing) existing.category = category;
  else state.rules.categoryRules.push({ match: merchant, category, isRegex: false, learned: true });
}

function toggleIgnore(t) {
  if (t.source === "manual") {
    const m = state.manual.find((x) => x.id === t.id);
    if (m) { m.ignored = !m.ignored; store.setManual(state.manual); compose(); rerender(); }
  } else {
    setOverride(t.id, { ignored: !t.ignored });
  }
}

async function deleteTxn(t) {
  if (!confirm(`Delete this transaction?\n\n${t.merchant} — ${money(t.amount)} on ${fmtDate(insights.effDate(t))}`)) return;
  if (t.source === "manual") {
    state.manual = state.manual.filter((x) => x.id !== t.id);
    await store.setManual(state.manual);
    compose(); rerender();
  } else {
    setOverride(t.id, { deleted: true });
  }
}

async function setOverride(id, patch) {
  const cur = state.overrides[id] || {};
  state.overrides[id] = { ...cur, ...patch };
  await store.setOverrides(state.overrides);
  compose();
  rerender();
}

// ---- add / edit modal ---------------------------------------------------
export function openTxnModal(existing) {
  const isEdit = !!existing;
  const isCsv = isEdit && existing.source === "csv";
  const today = todayIso();
  const f = {
    date: existing ? insights.effDate(existing) : today,
    merchant: existing ? existing.merchant : "",
    description: existing ? existing.description : "",
    amount: existing ? Math.abs(existing.amount) : "",
    direction: existing ? existing.direction : "debit",
    category: existing ? existing.category : "uncategorized",
  };
  const inDate = h("input", { type: "date", value: f.date });
  const inMerchant = h("input", { type: "text", value: f.merchant, placeholder: "e.g. Corner Cafe" });
  const inDesc = h("input", { type: "text", value: f.description, placeholder: isCsv ? "" : "optional note" });
  const inAmount = h("input", { type: "number", step: "0.01", min: "0", value: f.amount, placeholder: "0.00" });
  const inDir = h("select", {}, [
    h("option", { value: "debit", selected: f.direction === "debit" ? "selected" : null }, "Money out (debit)"),
    h("option", { value: "credit", selected: f.direction === "credit" ? "selected" : null }, "Money in (credit)"),
  ]);
  const inCat = h("select", {}, state.categories.map((c) =>
    h("option", { value: c.key, selected: c.key === f.category ? "selected" : null }, `${c.icon} ${c.label}`)));

  const body = h("div", { class: "form" }, [
    isCsv ? h("p", { class: "small muted" }, "Imported bank transaction. Your changes are saved as adjustments layered over the original — re-importing won't undo them, and you can reset to the imported values any time.") : null,
    field("Date", inDate),
    field("Merchant / name", inMerchant),
    field("Amount", inAmount),
    field("Direction", inDir),
    field("Category", inCat),
    field(isCsv ? "Description" : "Note", inDesc),
  ]);

  const onSave = async () => {
    const amt = parseFloat(inAmount.value);
    if (!inMerchant.value.trim() || isNaN(amt)) { toast("Enter a merchant and a valid amount."); return false; }
    const signed = inDir.value === "debit" ? -Math.abs(amt) : Math.abs(amt);

    if (isCsv) {
      // Persist edits as overrides layered on the pristine raw row (diff so we only
      // store real changes and a reset is clean).
      const raw = state.raw.find((x) => x.id === existing.id) || existing;
      const o = { ...(state.overrides[existing.id] || {}) };
      const same = (a, b) => (typeof a === "number" ? Math.round(a * 100) === Math.round(b * 100) : a === b);
      const setOrClear = (key, val, orig) => { if (same(val, orig)) delete o[key]; else o[key] = val; };
      setOrClear("effectiveDate", inDate.value, raw.effectiveDate);
      setOrClear("merchant", inMerchant.value.trim(), raw.merchant);
      setOrClear("description", inDesc.value.trim(), raw.description);
      setOrClear("amount", signed, raw.amount);
      if (inCat.value !== existing.category) o.category = inCat.value; // manual category choice
      if (Object.keys(o).length) state.overrides[existing.id] = o; else delete state.overrides[existing.id];
      await store.setOverrides(state.overrides);
    } else if (isEdit) {
      const m = state.manual.find((x) => x.id === existing.id);
      Object.assign(m, {
        effectiveDate: inDate.value, postedDate: inDate.value,
        merchant: inMerchant.value.trim(), description: inDesc.value.trim() || inMerchant.value.trim(),
        amount: signed, direction: inDir.value, category: inCat.value, categorySource: "manual",
      });
      await store.setManual(state.manual);
    } else {
      state.manual.push({
        id: "m_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8),
        postedDate: inDate.value, effectiveDate: inDate.value,
        description: inDesc.value.trim() || inMerchant.value.trim(),
        merchant: inMerchant.value.trim(),
        amount: signed, direction: inDir.value, balance: null,
        category: inCat.value, categorySource: "manual",
        ignored: false, recurring: false, source: "manual",
      });
      await store.setManual(state.manual);
    }
    compose();
    state.anchor = inDate.value;
    rerender();
    return true;
  };

  // Bank rows get a "Reset to imported values" action that clears the field edits
  // (keeps category/ignore decisions, which are managed separately).
  const extras = isCsv ? [{
    label: "Reset to imported values",
    className: "btn ghost",
    handler: async (close) => {
      const o = state.overrides[existing.id];
      if (o) {
        EDIT_FIELDS.forEach((k) => delete o[k]);
        if (Object.keys(o).length === 0) delete state.overrides[existing.id];
        await store.setOverrides(state.overrides);
        compose(); rerender();
      }
      toast(`Reset “${existing.merchant}” to its imported values.`);
      close();
    },
  }] : undefined;

  openModal(isEdit ? "Edit transaction" : "Add transaction", body, onSave, extras);
}

function field(label, input) {
  return h("label", { class: "field" }, [h("span", {}, label), input]);
}
