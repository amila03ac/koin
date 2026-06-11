// categories.ts — pure helpers for managing spending categories (add / rename / recolor).
// No DOM, no storage. A category is { key, label, color, icon }. The `key` is a STABLE
// identifier referenced by transactions, rules, and overrides — generated once from the
// label and then frozen (renaming edits only `label`). These helpers own key generation
// and validation.

// Human label -> storage-safe slug: lowercase, non-alphanumerics collapsed to single
// hyphens, leading/trailing hyphens trimmed. "Pets & Vet!" -> "pets-vet".
export function slugify(label: string): string {
  return String(label == null ? "" : label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A slug that doesn't collide with any key in `existingKeys`. Falls back to "category" for
// an empty / symbol-only label, then appends -2, -3, … until unique.
export function uniqueKey(label: string, existingKeys: string[]): string {
  const taken = new Set(existingKeys || []);
  const base = slugify(label) || "category";
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(base + "-" + i)) i++;
  return base + "-" + i;
}

// Accept a #rgb or #rrggbb hex color, case-insensitive. (<input type=color> emits #rrggbb;
// we still tolerate shorthand from hand-edited/imported data.)
export function isHexColor(color: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(color == null ? "" : color).trim());
}
