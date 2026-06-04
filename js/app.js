// app.js — wires storage + parser + rules + insights + charts into the UI.
// Classic script; relies on globals from the other js/ files (load order matters,
// see index.html). This is the only place that touches the DOM.
(function () {
  const { store, parser, rules, insights, charts } = Koin;

  // ---- app state ----------------------------------------------------------
  const state = {
    raw: [],          // imported CSV transactions
    manual: [],       // user-created transactions
    overrides: {},    // id -> { category, ignored, deleted }
    rules: null,
    categories: [],
    catMap: {},       // key -> category def
    period: "month",  // 'year' | 'month' | 'week'
    anchor: null,     // ISO date within the active period
    effective: [],    // composed list after rules + overrides
    filter: { text: "", category: "all", showIgnored: false },
  };

  // ---- tiny DOM helper ----------------------------------------------------
  function h(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (v != null) e.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) {
      if (c == null) continue;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  }
  const $ = (sel) => document.querySelector(sel);
  const money = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

  // ---- bootstrap ----------------------------------------------------------
  async function init() {
    await store.init(); // pick the storage backend (shared file via server.js, else localStorage)
    state.categories = (await store.getCategories()) || Koin.DEFAULT_CATEGORIES;
    state.rules = (await store.getRules()) || Koin.DEFAULT_RULES;
    if (!(await store.getCategories())) await store.setCategories(state.categories);
    if (!(await store.getRules())) await store.setRules(state.rules);
    state.catMap = Object.fromEntries(state.categories.map((c) => [c.key, c]));

    await migratePalette();

    state.raw = await store.getTransactions();
    state.manual = await store.getManual();
    state.overrides = await store.getOverrides();

    bindChrome();
    compose();
    state.anchor = latestDate() || todayIso();
    renderAll();
  }

  // Refresh stored category colors when the default palette version changes. Only
  // updates colors for known category keys — custom categories, labels, and icons the
  // user changed are left untouched. No transactions/rules/overrides are affected.
  async function migratePalette() {
    const meta = await store.getMeta();
    if ((meta.paletteVersion || 1) >= (Koin.PALETTE_VERSION || 1)) return;
    const def = Object.fromEntries(Koin.DEFAULT_CATEGORIES.map((c) => [c.key, c.color]));
    let changed = false;
    for (const c of state.categories) {
      if (def[c.key] && c.color !== def[c.key]) { c.color = def[c.key]; changed = true; }
    }
    if (changed) {
      await store.setCategories(state.categories);
      state.catMap = Object.fromEntries(state.categories.map((c) => [c.key, c]));
    }
    meta.paletteVersion = Koin.PALETTE_VERSION;
    await store.setMeta(meta);
  }

  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function latestDate() {
    const all = state.effective;
    if (!all.length) return null;
    return all.map((t) => insights.effDate(t)).sort().reverse()[0];
  }

  // ---- composition (rules + overrides) ------------------------------------
  function compose() {
    const ov = state.overrides;
    let combined = state.raw.concat(state.manual).map((t) => {
      const o = ov[t.id];
      if (o && o.category != null) return { ...t, category: o.category, categorySource: "manual" };
      return { ...t };
    });
    let ruled = rules.apply(combined, state.rules);
    ruled = ruled.map((t) => {
      const o = ov[t.id];
      if (o && o.ignored != null) return { ...t, ignored: o.ignored };
      return t;
    });
    state.effective = ruled.filter((t) => !(ov[t.id] && ov[t.id].deleted));
  }

  async function setOverride(id, patch) {
    const cur = state.overrides[id] || {};
    state.overrides[id] = { ...cur, ...patch };
    await store.setOverrides(state.overrides);
    compose();
    renderAll();
  }

  // ---- import -------------------------------------------------------------
  async function importCsvText(text, filename) {
    const { transactions, skipped } = parser.parse(text);
    if (!transactions.length) { toast(`No transactions found in ${filename}.`); return; }
    // merge by id (dedup across overlapping months)
    const byId = new Map(state.raw.map((t) => [t.id, t]));
    let added = 0;
    for (const t of transactions) {
      if (!byId.has(t.id)) { byId.set(t.id, t); added++; }
    }
    state.raw = [...byId.values()];
    await store.setTransactions(state.raw);

    const meta = await store.getMeta();
    meta.imports = meta.imports || [];
    meta.imports.push({ filename, count: transactions.length, added, at: new Date().toISOString() });
    await store.setMeta(meta);

    compose();
    state.anchor = latestDate() || state.anchor;
    renderAll();
    toast(`Imported ${filename}: ${added} new, ${transactions.length - added} already present${skipped ? `, ${skipped} skipped` : ""}.`);
  }

  function pickFile(accept, cb) {
    const inp = h("input", { type: "file", accept, style: "display:none" });
    inp.addEventListener("change", () => { if (inp.files[0]) cb(inp.files[0]); });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(() => inp.remove(), 1000);
  }
  function readFile(file, cb) {
    const fr = new FileReader();
    fr.onload = () => cb(fr.result);
    fr.readAsText(file);
  }

  // ---- chrome (toolbar) wiring -------------------------------------------
  function bindChrome() {
    $("#btn-import").addEventListener("click", () =>
      pickFile(".csv,text/csv", (f) => readFile(f, (txt) => importCsvText(txt, f.name))));
    $("#btn-add").addEventListener("click", () => openTxnModal());
    $("#btn-rules").addEventListener("click", openRulesModal);
    $("#btn-export").addEventListener("click", exportBackup);
    $("#btn-import-backup").addEventListener("click", () =>
      pickFile(".json,application/json", (f) => readFile(f, importBackup)));
    $("#btn-reset").addEventListener("click", resetAll);

    document.querySelectorAll(".period-tab").forEach((b) =>
      b.addEventListener("click", () => { state.period = b.dataset.period; renderAll(); }));
    $("#nav-prev").addEventListener("click", () => { state.anchor = insights.shiftAnchor(state.anchor, state.period, -1); renderAll(); });
    $("#nav-next").addEventListener("click", () => { state.anchor = insights.shiftAnchor(state.anchor, state.period, 1); renderAll(); });
    $("#period-jump").addEventListener("change", (e) => { state.anchor = periodToAnchor(e.target.value, state.period); renderAll(); });

    $("#filter-text").addEventListener("input", (e) => { state.filter.text = e.target.value.toLowerCase(); renderTable(); });
    $("#filter-cat").addEventListener("change", (e) => { state.filter.category = e.target.value; renderTable(); });
    $("#filter-ignored").addEventListener("change", (e) => { state.filter.showIgnored = e.target.checked; renderTable(); });

    $("#sample-load")?.addEventListener("click", loadSample);
  }

  function periodToAnchor(key, period) {
    if (period === "year") return key + "-01-01";
    if (period === "month") return key + "-01";
    return key; // week key is already a Monday ISO date
  }

  function loadSample() {
    fetch("data/Transactions.sample.csv", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("http"); return r.text(); })
      .then((txt) => importCsvText(txt, "Transactions.sample.csv"))
      .catch(() => toast("Couldn't auto-load the sample (browsers block file reads from disk). Click ‘Import CSV’ and pick data/Transactions.sample.csv instead."));
  }

  // ---- rendering ----------------------------------------------------------
  function renderAll() {
    // active period tab
    document.querySelectorAll(".period-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.period === state.period));
    $("#period-label").textContent = insights.periodLabel(state.anchor, state.period);
    renderPeriodJump();
    $("#app").style.display = state.effective.length ? "" : "none";
    $("#empty").style.display = state.effective.length ? "none" : "";
    if (!state.effective.length) return;

    const inPeriod = insights.filterByPeriod(state.effective, state.period, state.anchor);
    renderSummary(inPeriod);
    renderCharts(inPeriod);
    renderInsights(inPeriod);
    renderCatFilter();
    renderTable();
  }

  function renderPeriodJump() {
    const sel = $("#period-jump");
    const periods = insights.availablePeriods(state.effective, state.period);
    const cur = insights.periodKey(state.anchor, state.period);
    sel.innerHTML = "";
    for (const key of periods) {
      const anchor = periodToAnchor(key, state.period);
      sel.appendChild(h("option", { value: key, selected: key === cur ? "selected" : null },
        insights.periodLabel(anchor, state.period)));
    }
  }

  function renderSummary(tx) {
    const s = insights.summary(tx);
    const ignored = tx.filter((t) => t.ignored).length;
    const cards = [
      { label: "Spent", value: money(s.spent), cls: "neg" },
      { label: "Transactions", value: String(s.count) },
      { label: "Recurring", value: String(tx.filter((t) => t.recurring && !t.ignored).length) },
      { label: "Ignored (transfers)", value: String(ignored), cls: "muted" },
    ];
    if (s.income > 0) cards.splice(1, 0, { label: "Income", value: money(s.income), cls: "pos" }, { label: "Net", value: money(s.net), cls: s.net < 0 ? "neg" : "pos" });
    const wrap = $("#summary");
    wrap.innerHTML = "";
    for (const c of cards) {
      wrap.appendChild(h("div", { class: "card" }, [
        h("div", { class: "card-label" }, c.label),
        h("div", { class: "card-value " + (c.cls || "") }, c.value),
      ]));
    }
  }

  function renderCharts(tx) {
    const cats = insights.byCategory(tx);
    const data = cats.map((c) => ({
      label: (state.catMap[c.category] || {}).label || c.category,
      value: c.total,
      color: (state.catMap[c.category] || {}).color || "#cbd5e1",
    }));
    charts.donut($("#donut"), data);

    const legend = $("#donut-legend");
    legend.innerHTML = "";
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    for (const d of data) {
      legend.appendChild(h("div", { class: "legend-row" }, [
        h("span", { class: "legend-dot", style: `background:${d.color}` }),
        h("span", { class: "legend-label" }, d.label),
        h("span", { class: "legend-val" }, `${money(d.value)} · ${Math.round((d.value / total) * 100)}%`),
      ]));
    }

    const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#6f7a4e";
    charts.bars($("#trend"), insights.trendBuckets(tx, state.period, state.anchor), { color: primary });
  }

  function renderInsights(tx) {
    const list = (title, rows) => {
      const box = h("div", { class: "insight-box" }, [h("h3", {}, title)]);
      if (!rows.length) box.appendChild(h("div", { class: "muted small" }, "Nothing here."));
      for (const r of rows) {
        box.appendChild(h("div", { class: "insight-row" }, [
          h("span", { class: "insight-name" }, r.name),
          h("span", { class: "insight-val" }, r.val),
        ]));
      }
      return box;
    };
    const wrap = $("#insights");
    wrap.innerHTML = "";
    wrap.appendChild(list("Top merchants", insights.topMerchants(tx, 6).map((m) => ({
      name: `${m.merchant} (${m.count})`, val: money(m.total),
    }))));
    wrap.appendChild(list("Biggest expenses", insights.biggestExpenses(tx, 6).map((t) => ({
      name: t.merchant, val: money(-t.amount),
    }))));
    const recur = [];
    const seen = new Set();
    for (const t of tx.filter((t) => t.recurring && !t.ignored && t.amount < 0)) {
      if (seen.has(t.merchant)) continue;
      seen.add(t.merchant);
      recur.push({ name: t.merchant, val: money(-t.amount) });
    }
    wrap.appendChild(list("Recurring / subscriptions", recur.slice(0, 6)));
  }

  function renderCatFilter() {
    const sel = $("#filter-cat");
    if (sel.dataset.built) return;
    sel.appendChild(h("option", { value: "all" }, "All categories"));
    for (const c of state.categories) sel.appendChild(h("option", { value: c.key }, `${c.icon} ${c.label}`));
    sel.dataset.built = "1";
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
      renderAll();
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
    renderAll();
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
    renderAll();
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

  function renderTable() {
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
      const dateInfo = t.effectiveDate !== t.postedDate
        ? h("span", { class: "date-eff", title: `Posted ${fmtDate(t.postedDate)}` }, "•")
        : null;

      const actions = h("div", { class: "row-actions" }, [
        h("button", { class: "icon-btn", title: t.ignored ? "Un-ignore" : "Ignore (exclude from totals)",
          onclick: () => toggleIgnore(t) }, t.ignored ? "↩" : "🚫"),
        t.source === "manual"
          ? h("button", { class: "icon-btn", title: "Edit", onclick: () => openTxnModal(t) }, "✏️")
          : null,
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

  function toggleIgnore(t) {
    if (t.source === "manual") {
      const m = state.manual.find((x) => x.id === t.id);
      if (m) { m.ignored = !m.ignored; store.setManual(state.manual); compose(); renderAll(); }
    } else {
      setOverride(t.id, { ignored: !t.ignored });
    }
  }

  async function deleteTxn(t) {
    if (!confirm(`Delete this transaction?\n\n${t.merchant} — ${money(t.amount)} on ${fmtDate(insights.effDate(t))}`)) return;
    if (t.source === "manual") {
      state.manual = state.manual.filter((x) => x.id !== t.id);
      await store.setManual(state.manual);
      compose(); renderAll();
    } else {
      setOverride(t.id, { deleted: true });
    }
  }

  // ---- add / edit modal ---------------------------------------------------
  function openTxnModal(existing) {
    const isEdit = !!existing;
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
    const inDesc = h("input", { type: "text", value: f.description, placeholder: "optional note" });
    const inAmount = h("input", { type: "number", step: "0.01", min: "0", value: f.amount, placeholder: "0.00" });
    const inDir = h("select", {}, [
      h("option", { value: "debit", selected: f.direction === "debit" ? "selected" : null }, "Money out (debit)"),
      h("option", { value: "credit", selected: f.direction === "credit" ? "selected" : null }, "Money in (credit)"),
    ]);
    const inCat = h("select", {}, state.categories.map((c) =>
      h("option", { value: c.key, selected: c.key === f.category ? "selected" : null }, `${c.icon} ${c.label}`)));

    const body = h("div", { class: "form" }, [
      field("Date", inDate),
      field("Merchant / name", inMerchant),
      field("Amount", inAmount),
      field("Direction", inDir),
      field("Category", inCat),
      field("Note", inDesc),
    ]);
    openModal(isEdit ? "Edit transaction" : "Add transaction", body, async () => {
      const amt = parseFloat(inAmount.value);
      if (!inMerchant.value.trim() || isNaN(amt)) { toast("Enter a merchant and a valid amount."); return false; }
      const signed = inDir.value === "debit" ? -Math.abs(amt) : Math.abs(amt);
      if (isEdit) {
        const m = state.manual.find((x) => x.id === existing.id);
        Object.assign(m, {
          effectiveDate: inDate.value, postedDate: inDate.value,
          merchant: inMerchant.value.trim(), description: inDesc.value.trim() || inMerchant.value.trim(),
          amount: signed, direction: inDir.value, category: inCat.value, categorySource: "manual",
        });
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
      }
      await store.setManual(state.manual);
      compose();
      state.anchor = inDate.value;
      renderAll();
      return true;
    });
  }
  function field(label, input) {
    return h("label", { class: "field" }, [h("span", {}, label), input]);
  }

  // ---- rules modal --------------------------------------------------------
  function openRulesModal() {
    // Friendly, live list of learned rules (managed here, not in the JSON below).
    const learnedWrap = h("div", { class: "learned-list" });
    renderLearnedList(learnedWrap);

    // The raw editor holds ONLY hand-written rules + ignore patterns; learned rules are
    // excluded so the two views never fight. They're re-attached on save.
    const handWritten = {
      ignorePatterns: state.rules.ignorePatterns || [],
      categoryRules: (state.rules.categoryRules || []).filter((r) => !r.learned),
    };
    const ta = h("textarea", { class: "json-editor", spellcheck: "false" }, JSON.stringify(handWritten, null, 2));
    const cta = h("textarea", { class: "json-editor", spellcheck: "false" }, JSON.stringify(state.categories, null, 2));

    const advanced = h("details", { class: "advanced" }, [
      h("summary", {}, "Advanced — edit raw rules & categories (JSON)"),
      h("div", { class: "form" }, [
        h("p", { class: "small muted" }, "Ignore patterns flag internal transfers so they don't count as spending. Category rules auto-assign categories (first match wins). Matching is case-insensitive; set \"isRegex\": true for a regular expression. (Learned rules are managed in the list above.)"),
        field("Ignore patterns + hand-written category rules", ta),
        field("Categories", cta),
        h("p", { class: "small muted" }, "“Save” applies edited rules to all auto-categorized transactions immediately. “Save & apply to history” goes further: it also re-runs the rules over transactions you'd categorised by hand, clearing those one-off edits so the rules win."),
      ]),
    ]);

    const body = h("div", { class: "form" }, [
      h("h3", { class: "rules-heading" }, "Learned rules"),
      h("p", { class: "small muted" }, "Categories Koin remembered when you categorised an uncategorised transaction. Each applies to that merchant across all history and future imports. Change the category or remove a rule below — it takes effect immediately."),
      learnedWrap,
      advanced,
    ]);

    // Validate + persist the editors. Learned rules (managed by the list, already saved)
    // are re-attached AFTER the hand-written ones so hand-written rules still win.
    const saveEditors = async () => {
      try {
        const parsed = JSON.parse(ta.value);
        const c = JSON.parse(cta.value);
        const learned = (state.rules.categoryRules || []).filter((r) => r.learned);
        const handCats = (parsed.categoryRules || []).filter((r) => !r.learned); // ignore stray learned flags
        state.rules = { ...parsed, categoryRules: [...handCats, ...learned] };
        state.categories = c;
        state.catMap = Object.fromEntries(c.map((x) => [x.key, x]));
        await store.setRules(state.rules); await store.setCategories(c);
        $("#filter-cat").dataset.built = ""; $("#filter-cat").innerHTML = "";
        compose(); renderAll();
        return true;
      } catch (err) { toast("Invalid JSON: " + err.message); return false; }
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
  function renderLearnedList(container) {
    container.innerHTML = "";
    const learned = (state.rules.categoryRules || []).filter((r) => r.learned);
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
  function learnedCategorySelect(rule) {
    const sel = h("select", { class: "cat-select" });
    for (const c of state.categories) {
      sel.appendChild(h("option", { value: c.key, selected: c.key === rule.category ? "selected" : null }, `${c.icon} ${c.label}`));
    }
    sel.addEventListener("change", async () => {
      rule.category = sel.value;            // rule is a live reference into state.rules
      await store.setRules(state.rules);
      compose(); renderAll();
      toast(`Updated learned rule “${rule.match}” → ${(state.catMap[sel.value] || {}).label || sel.value}.`);
    });
    return sel;
  }

  // Remove a learned rule (its merchant's transactions revert to auto-categorization,
  // i.e. uncategorized unless a hand-written rule matches). Reversible via Undo.
  async function deleteLearnedRule(rule, container) {
    const rules = state.rules.categoryRules || [];
    const idx = rules.indexOf(rule);
    if (idx < 0) return;
    rules.splice(idx, 1);
    await store.setRules(state.rules);
    compose(); renderAll();
    renderLearnedList(container);
    toast(`Removed learned rule “${rule.match}”.`, {
      label: "Undo",
      fn: async () => {
        rules.splice(idx, 0, rule);         // re-insert at its original position
        await store.setRules(state.rules);
        compose(); renderAll();
        renderLearnedList(container);
        toast(`Restored “${rule.match}”.`);
      },
    });
  }

  // Re-run the current rules across ALL transactions, including ones the user had
  // categorised by hand: drop per-transaction CATEGORY overrides (keeping ignore/delete
  // overrides) so rules decide every bank row. Manual transactions keep their category.
  async function reapplyRulesToHistory() {
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
    renderAll();
    toast(`Re-applied rules to all history${cleared ? ` (cleared ${cleared} one-off category edit${cleared === 1 ? "" : "s"})` : ""}.`);
  }

  // ---- backup / reset -----------------------------------------------------
  async function exportBackup() {
    const dump = await store.exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `koin-backup-${todayIso()}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    toast("Backup downloaded.");
  }
  function importBackup(text) {
    try {
      const dump = JSON.parse(text);
      store.importAll(dump).then(() => { toast("Backup restored. Reloading…"); setTimeout(() => location.reload(), 600); });
    } catch (err) { toast("Invalid backup file."); }
  }
  async function resetAll() {
    if (!confirm("Erase ALL Koin data (transactions, edits, rules) from this browser? Export a backup first if unsure.")) return;
    await store.clearAll();
    location.reload();
  }

  // ---- modal + toast primitives ------------------------------------------
  // extraButtons: optional [{ label, className, handler(close) }] rendered left of Cancel.
  function openModal(title, body, onSave, extraButtons) {
    const overlay = h("div", { class: "modal-overlay" });
    const close = () => overlay.remove();
    const save = async () => { const ok = await onSave(); if (ok !== false) close(); };
    const footer = (extraButtons || []).map((b) =>
      h("button", { class: b.className || "btn ghost", onclick: () => b.handler(close) }, b.label));
    footer.push(h("button", { class: "btn ghost", onclick: close }, "Cancel"));
    footer.push(h("button", { class: "btn primary", onclick: save }, "Save"));
    overlay.appendChild(h("div", { class: "modal" }, [
      h("div", { class: "modal-head" }, [h("h2", {}, title), h("button", { class: "icon-btn", onclick: close }, "✕")]),
      h("div", { class: "modal-body" }, [body]),
      h("div", { class: "modal-foot" }, footer),
    ]));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  }
  let toastTimer;
  // toast(message) or toast(message, { label, fn }) to show an action button (e.g. Undo).
  function toast(msg, action) {
    let el = $("#toast");
    if (!el) { el = h("div", { id: "toast" }); document.body.appendChild(el); }
    el.innerHTML = "";
    el.appendChild(h("span", {}, msg));
    if (action) {
      el.appendChild(h("button", {
        class: "toast-action",
        onclick: () => { el.classList.remove("show"); clearTimeout(toastTimer); action.fn(); },
      }, action.label));
    }
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), action ? 8000 : 4200);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
