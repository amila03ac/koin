// rules-editor.ts — the "Manage rules & categories" modal: the learned-rules list, the
// category manager (add / rename / recolor), and the advanced raw-JSON rules editor, plus
// "re-apply rules to history". Reads `state`, persists via the store, and calls rerender()
// to refresh the dashboard.
import type { Category, CategoryRule } from "../core/types";
import { store } from "../store/index";
import * as categories from "../core/categories";
import { h, $, field } from "./dom";
import { toast } from "./toast";
import { openModal } from "./modal";
import { state, compose } from "./state";
import { rerender } from "./render-bus";

export function openRulesModal(): void {
  // Friendly, live list of learned rules (managed here, not in the JSON below).
  const learnedWrap = h("div", { class: "learned-list" });
  renderLearnedList(learnedWrap);

  // The raw editor holds ONLY hand-written rules + ignore patterns; learned rules are
  // excluded so the two views never fight. They're re-attached on save.
  const handWritten = {
    ignorePatterns: state.rules!.ignorePatterns || [],
    categoryRules: (state.rules!.categoryRules || []).filter((r) => !r.learned),
  };
  const ta = h("textarea", { class: "json-editor", spellcheck: "false" }, JSON.stringify(handWritten, null, 2)) as HTMLTextAreaElement;

  // Friendly category manager (add / rename / recolor). Like the learned-rules list, edits
  // here persist immediately — so it owns categories outright and the raw JSON editor below
  // holds only rules (the two never fight over the same data).
  const categoryWrap = h("div", { class: "category-list" });
  renderCategoryList(categoryWrap);

  const advanced = h("details", { class: "advanced" }, [
    h("summary", {}, "Advanced — edit raw rules (JSON)"),
    h("div", { class: "form" }, [
      h("p", { class: "small muted" }, "Ignore patterns flag internal transfers so they don't count as spending. Category rules auto-assign categories (first match wins). Matching is case-insensitive; set \"isRegex\": true for a regular expression — keep these simple (avoid nested quantifiers like (a+)+, which can hang the page). (Learned rules and categories are managed in the lists above.)"),
      field("Ignore patterns + hand-written category rules", ta),
      h("p", { class: "small muted" }, "“Save” applies edited rules to all auto-categorized transactions immediately. “Save & apply to history” goes further: it also re-runs the rules over transactions you'd categorised by hand, clearing those one-off edits so the rules win."),
    ]),
  ]);

  const body = h("div", { class: "form" }, [
    h("h3", { class: "rules-heading" }, "Categories"),
    h("p", { class: "small muted" }, "Rename a category, pick its colour, or set an emoji icon — changes apply everywhere immediately. The grey id on the right is the fixed internal key (it stays put when you rename, so nothing loses its category)."),
    categoryWrap,
    h("button", { class: "btn ghost add-cat-btn", onclick: () => addCategory(categoryWrap) }, "＋ Add category"),
    h("h3", { class: "rules-heading" }, "Learned rules"),
    h("p", { class: "small muted" }, "Categories Koin remembered when you categorised an uncategorised transaction. Each applies to that merchant across all history and future imports. Change the category or remove a rule below — it takes effect immediately."),
    learnedWrap,
    advanced,
  ]);

  // Validate + persist the rules editor. Learned rules (managed by the list, already saved)
  // are re-attached AFTER the hand-written ones so hand-written rules still win.
  const saveEditors = async () => {
    try {
      const parsed = JSON.parse(ta.value);
      const learned = (state.rules!.categoryRules || []).filter((r) => r.learned);
      const handCats = (parsed.categoryRules || []).filter((r: CategoryRule) => !r.learned); // ignore stray learned flags
      state.rules = { ...parsed, categoryRules: [...handCats, ...learned] };
      await store.setRules(state.rules!);
      compose(); rerender();
      return true;
    } catch (err) { toast("Invalid JSON: " + (err as Error).message); return false; }
  };

  openModal("Manage rules & categories", body, saveEditors, [
    {
      label: "Save & apply to history",
      className: "btn",
      handler: async (close) => {
        if (await saveEditors() === false) return;       // keep modal open on bad JSON
        await reapplyRulesToHistory();
        close();
      },
    },
  ]);
}

// Render (or re-render) the live list of learned rules into `container`.
function renderLearnedList(container: HTMLElement): void {
  container.innerHTML = "";
  const learned = (state.rules!.categoryRules || []).filter((r) => r.learned);
  if (!learned.length) {
    container.appendChild(h("div", { class: "learned-empty muted small" },
      "No learned rules yet — categorise an uncategorised transaction and Koin will remember it here."));
    return;
  }
  for (const rule of learned) {
    container.appendChild(h("div", { class: "learned-row" }, [
      h("span", { class: "learned-merchant", title: rule.match }, rule.match),
      h("span", { class: "learned-arrow" }, "→"),
      learnedCategorySelect(rule),
      h("button", { class: "icon-btn danger", title: "Delete this learned rule",
        onclick: () => deleteLearnedRule(rule, container) }, "🗑"),
    ]));
  }
}

// Category dropdown for one learned rule. Editing it re-targets the rule immediately.
function learnedCategorySelect(rule: CategoryRule): HTMLElement {
  const sel = h("select", { class: "cat-select" }) as HTMLSelectElement;
  for (const c of state.categories) {
    sel.appendChild(h("option", { value: c.key, selected: c.key === rule.category ? "selected" : null }, `${c.icon} ${c.label}`));
  }
  sel.addEventListener("change", async () => {
    rule.category = sel.value;            // rule is a live reference into state.rules
    await store.setRules(state.rules!);
    compose(); rerender();
    toast(`Updated learned rule “${rule.match}” → ${state.catMap[sel.value]?.label ?? sel.value}.`);
  });
  return sel;
}

// Remove a learned rule (its merchant's transactions revert to auto-categorization, i.e.
// uncategorized unless a hand-written rule matches). Reversible via Undo.
async function deleteLearnedRule(rule: CategoryRule, container: HTMLElement): Promise<void> {
  const rules = state.rules!.categoryRules || [];
  const idx = rules.indexOf(rule);
  if (idx < 0) return;
  rules.splice(idx, 1);
  await store.setRules(state.rules!);
  compose(); rerender();
  renderLearnedList(container);
  toast(`Removed learned rule “${rule.match}”.`, {
    label: "Undo",
    fn: async () => {
      rules.splice(idx, 0, rule);         // re-insert at its original position
      await store.setRules(state.rules!);
      compose(); rerender();
      renderLearnedList(container);
      toast(`Restored “${rule.match}”.`);
    },
  });
}

// Persist the (already-mutated) category list and re-render everything that depends on it:
// catMap, the donut/legend colours, the filter dropdown, and the per-row selects.
async function persistCategories(): Promise<void> {
  state.catMap = Object.fromEntries(state.categories.map((c) => [c.key, c] as const));
  await store.setCategories(state.categories);
  $("#filter-cat")!.dataset.built = ""; $("#filter-cat")!.innerHTML = ""; // rebuild with new labels/icons
  compose(); rerender();
}

// Is this category key referenced anywhere? Used to decide whether a freshly-added
// category's key may still be re-derived from a rename (safe only while unused).
function categoryUsed(key: string): boolean {
  return state.effective.some((t) => t.category === key)
    || state.manual.some((t) => t.category === key)
    || Object.values(state.overrides).some((o) => o && o.category === key)
    || (state.rules!.categoryRules || []).some((r) => r.category === key);
}

// Render (or re-render) the editable list of categories into `container`.
function renderCategoryList(container: HTMLElement): void {
  container.innerHTML = "";
  for (const cat of state.categories) container.appendChild(categoryRow(cat, container));
}

// One editable row: colour swatch, emoji icon, display name, and the fixed key.
function categoryRow(cat: Category, container: HTMLElement): HTMLElement {
  // <input type=color> requires #rrggbb; fall back for shorthand/invalid stored colours.
  const colorVal = categories.isHexColor(cat.color) && cat.color.length === 7 ? cat.color : "#888888";
  const color = h("input", { type: "color", class: "cat-color", value: colorVal, title: "Pick a colour" }) as HTMLInputElement;
  color.addEventListener("input", async () => { cat.color = color.value; await persistCategories(); });

  const icon = h("input", { type: "text", class: "cat-icon", maxlength: "4", value: cat.icon || "", title: "Emoji / icon", "aria-label": "Icon" }) as HTMLInputElement;
  icon.addEventListener("change", async () => { cat.icon = icon.value.trim(); await persistCategories(); });

  const label = h("input", { type: "text", class: "cat-label", value: cat.label || "", title: "Display name", "aria-label": "Category name" }) as HTMLInputElement;
  label.addEventListener("change", async () => {
    const v = label.value.trim();
    if (!v) { label.value = cat.label; return; } // names can't be blank — revert
    cat.label = v;
    // While a category is still unused, keep its internal key in step with the name so
    // backups/JSON stay readable. Once it's referenced anywhere, the key freezes.
    if (!categoryUsed(cat.key)) {
      cat.key = categories.uniqueKey(v, state.categories.filter((c) => c !== cat).map((c) => c.key));
      renderCategoryList(container); // refresh the shown key
    }
    await persistCategories();
  });

  return h("div", { class: "category-row" }, [
    color, icon, label,
    h("span", { class: "cat-key muted small", title: "Internal id (fixed — referenced by your transactions & rules)" }, cat.key),
  ]);
}

// Add a new category. It lands just before "Uncategorized" (so that stays last), with a
// generic name you rename inline; the name field is focused for a quick edit.
async function addCategory(container: HTMLElement): Promise<void> {
  const cat: Category = {
    key: categories.uniqueKey("New category", state.categories.map((c) => c.key)),
    label: "New category",
    color: "#8a8f98",
    icon: "🏷️",
  };
  const idx = state.categories.findIndex((c) => c.key === "uncategorized");
  if (idx >= 0) state.categories.splice(idx, 0, cat); else state.categories.push(cat);
  await persistCategories();
  renderCategoryList(container);
  const rows = container.querySelectorAll(".category-row");
  const row = rows[idx >= 0 ? idx : rows.length - 1];
  const input = row?.querySelector<HTMLInputElement>(".cat-label");
  if (input) { input.focus(); input.select(); }
  toast("Added a category — give it a name, colour and icon.");
}

// Re-run the current rules across ALL transactions, including ones the user had categorised
// by hand: drop per-transaction CATEGORY overrides (keeping ignore/delete overrides) so
// rules decide every bank row. Manual transactions keep their category.
async function reapplyRulesToHistory(): Promise<void> {
  let cleared = 0;
  for (const id of Object.keys(state.overrides)) {
    const o = state.overrides[id];
    if (o && o.category != null) {
      delete o.category; cleared++;
      if (Object.keys(o).length === 0) delete state.overrides[id];
    }
  }
  await store.setOverrides(state.overrides);
  compose();
  rerender();
  toast(`Re-applied rules to all history${cleared ? ` (cleared ${cleared} one-off category edit${cleared === 1 ? "" : "s"})` : ""}.`);
}
