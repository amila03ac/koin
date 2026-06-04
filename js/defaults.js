// defaults.js — seed categories + rules, embedded as JS so Koin works from
// file:// (where fetch() of the config/*.json files is blocked by the browser).
//
// These are only the FIRST-RUN seed. Once Koin saves your edited copy to storage,
// that copy is authoritative. The human-readable mirrors in config/*.json are kept
// for reference; if you edit those, mirror the change here too (or just edit in-app).
(function () {
  window.Koin = window.Koin || {};

  // Bumped whenever the default palette changes, so existing installs can refresh
  // their category colors (see migratePalette in app.js) without losing data.
  Koin.PALETTE_VERSION = 2;

  // Muted, earthy palette (v2).
  Koin.DEFAULT_CATEGORIES = [
    { key: "groceries",     label: "Groceries",         color: "#7a8450", icon: "🛒" },
    { key: "dining",        label: "Dining & Takeaway", color: "#b0764e", icon: "🍔" },
    { key: "transport",     label: "Transport & Fuel",  color: "#6d8a96", icon: "🚗" },
    { key: "shopping",      label: "Shopping",          color: "#8a7592", icon: "🛍️" },
    { key: "utilities",     label: "Utilities & Bills", color: "#c0a050", icon: "💡" },
    { key: "subscriptions", label: "Subscriptions",     color: "#b07f88", icon: "🔁" },
    { key: "health",        label: "Health & Pharmacy", color: "#a95f54", icon: "💊" },
    { key: "education",     label: "Education & Kids",   color: "#6c7595", icon: "🎓" },
    { key: "entertainment", label: "Entertainment",     color: "#538079", icon: "🎬" },
    { key: "housing",       label: "Housing & Rent",    color: "#9c7d5d", icon: "🏠" },
    { key: "income",        label: "Income",            color: "#5f7d52", icon: "💰" },
    { key: "transfers",     label: "Transfers",         color: "#9c958a", icon: "↔️" },
    { key: "fees",          label: "Fees & Charges",    color: "#97574f", icon: "🏦" },
    { key: "uncategorized", label: "Uncategorized",     color: "#c4bcae", icon: "❓" },
  ];

  Koin.DEFAULT_RULES = {
    // Generic starter rules using well-known brands + common keywords. Add your own
    // (or just categorize a transaction in the UI — that learns a rule automatically).
    ignorePatterns: [
      { match: "Internal Transfer", isRegex: false, note: "Transfers between your own accounts" },
    ],
    categoryRules: [
      { match: "coles", category: "groceries" },
      { match: "woolworths", category: "groceries" },
      { match: "aldi", category: "groceries" },
      { match: "iga", category: "groceries" },
      { match: "supermarket", category: "groceries" },
      { match: "grocer", category: "groceries" },

      { match: "uber eats", category: "dining" },
      { match: "ubereats", category: "dining" },
      { match: "doordash", category: "dining" },
      { match: "menulog", category: "dining" },
      { match: "deliveroo", category: "dining" },
      { match: "eats", category: "dining" },
      { match: "mcdonald", category: "dining" },
      { match: "kfc", category: "dining" },
      { match: "cafe", category: "dining" },
      { match: "coffee", category: "dining" },
      { match: "restaurant", category: "dining" },
      { match: "bakery", category: "dining" },
      { match: "pizza", category: "dining" },
      { match: "burger", category: "dining" },

      { match: "opal", category: "transport" },
      { match: "petrol", category: "transport" },
      { match: "fuel", category: "transport" },
      { match: "\\bbp\\b", category: "transport", isRegex: true },
      { match: "shell", category: "transport" },
      { match: "caltex", category: "transport" },
      { match: "ampol", category: "transport" },
      { match: "7-eleven", category: "transport" },
      { match: "parking", category: "transport" },
      { match: "uber", category: "transport" },

      { match: "kmart", category: "shopping" },
      { match: "target", category: "shopping" },
      { match: "big w", category: "shopping" },
      { match: "bunnings", category: "shopping" },
      { match: "officeworks", category: "shopping" },
      { match: "amazon", category: "shopping" },
      { match: "ebay", category: "shopping" },
      { match: "myer", category: "shopping" },

      { match: "energy", category: "utilities" },
      { match: "agl", category: "utilities" },
      { match: "electricity", category: "utilities" },
      { match: "water", category: "utilities" },
      { match: "\\bgas\\b", category: "utilities", isRegex: true },
      { match: "telstra", category: "utilities" },
      { match: "optus", category: "utilities" },
      { match: "vodafone", category: "utilities" },
      { match: "broadband", category: "utilities" },
      { match: "internet", category: "utilities" },
      { match: "mobile", category: "utilities" },

      { match: "netflix", category: "subscriptions" },
      { match: "spotify", category: "subscriptions" },
      { match: "disney", category: "subscriptions" },
      { match: "prime video", category: "subscriptions" },
      { match: "youtube", category: "subscriptions" },
      { match: "apple.com", category: "subscriptions" },
      { match: "subscription", category: "subscriptions" },

      { match: "pharmacy", category: "health" },
      { match: "chemist", category: "health" },
      { match: "priceline", category: "health" },
      { match: "medical", category: "health" },
      { match: "dental", category: "health" },
      { match: "clinic", category: "health" },
      { match: "doctor", category: "health" },
      { match: "hospital", category: "health" },
      { match: "fitness", category: "health" },
      { match: "\\bgym\\b", category: "health", isRegex: true },

      { match: "school", category: "education" },
      { match: "tuition", category: "education" },
      { match: "childcare", category: "education" },
      { match: "daycare", category: "education" },
      { match: "swim", category: "education" },
      { match: "lesson", category: "education" },
      { match: "university", category: "education" },
      { match: "tafe", category: "education" },

      { match: "cinema", category: "entertainment" },
      { match: "movie", category: "entertainment" },
      { match: "ticket", category: "entertainment" },
      { match: "concert", category: "entertainment" },
      { match: "theatre", category: "entertainment" },

      { match: "\\brent\\b", category: "housing", isRegex: true },
      { match: "mortgage", category: "housing" },
      { match: "real estate", category: "housing" },
      { match: "strata", category: "housing" },

      { match: "osko", category: "transfers" },
      { match: "transfer to", category: "transfers" },
      { match: "bpay", category: "transfers" },
      { match: "pay anyone", category: "transfers" },

      { match: "account fee", category: "fees" },
      { match: "atm fee", category: "fees" },
      { match: "interest charge", category: "fees" },
      { match: "overdrawn", category: "fees" },
    ],
  };
})();
