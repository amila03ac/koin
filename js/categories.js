// categories.js — pure helpers for managing spending categories (add / rename / recolor).
// No DOM, no storage (those live in app.js / store.js); kept pure so it's unit-testable
// headless, like parser/rules/insights.
//
// A category is { key, label, color, icon }. The `key` is a STABLE identifier referenced
// by transactions, rules, and overrides — so it is generated once from the label and then
// frozen (renaming edits only `label`). These helpers own key generation + validation.
(function () {
  window.Koin = window.Koin || {};

  // Human label -> storage-safe slug: lowercase, non-alphanumerics collapsed to single
  // hyphens, leading/trailing hyphens trimmed. "Pets & Vet!" -> "pets-vet".
  function slugify(label) {
    return String(label == null ? "" : label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // A slug that doesn't collide with any key in `existingKeys`. Falls back to "category"
  // for an empty / symbol-only label, then appends -2, -3, … until unique.
  function uniqueKey(label, existingKeys) {
    const taken = new Set(existingKeys || []);
    const base = slugify(label) || "category";
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(base + "-" + i)) i++;
    return base + "-" + i;
  }

  // Accept a #rgb or #rrggbb hex color, case-insensitive. (<input type=color> emits
  // #rrggbb; we still tolerate shorthand from hand-edited/imported data.)
  function isHexColor(color) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(color == null ? "" : color).trim());
  }

  Koin.categories = { slugify, uniqueKey, isHexColor };
})();
