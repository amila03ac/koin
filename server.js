// server.js — tiny zero-dependency local helper for Koin.
//
// Why this exists: localStorage is per-browser. Running Koin through this helper makes
// every browser on this machine read/write ONE shared JSON file, so your data persists
// across browsers and sessions — without a database, and without storing anything in the
// project folder. The data lives in your home directory at ~/.koin/koin-data.json.
//
// Run:   node server.js     (then open the printed URL)
// It serves the static app AND a small data API:
//   GET  /api/data  -> returns the JSON blob (or {} if none yet)
//   PUT  /api/data  -> overwrites the JSON blob (also accepts POST, for sendBeacon)
//
// This is a LOCAL-ONLY convenience, not a production server: it binds to localhost and
// trusts the local user. Do not expose it to a network.

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = __dirname;
// Data location. Defaults to ~/.koin, but KOIN_DATA_DIR can point it elsewhere — used to
// keep automated/test runs (e.g. Claude) away from your real data. See .claude/settings.json.
const DATA_DIR = process.env.KOIN_DATA_DIR || path.join(os.homedir(), ".koin");
const DATA_FILE = path.join(DATA_DIR, "koin-data.json");
const PORT = process.env.PORT || 4178;
const MAX_BODY = 50 * 1024 * 1024; // 50 MB guard

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function readData() {
  try { return fs.readFileSync(DATA_FILE, "utf8"); } catch { return "{}"; }
}
function writeData(body) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // write-to-temp + rename = atomic-ish; avoids a half-written file on crash
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, DATA_FILE);
}

// Rough "size" of a dataset — transactions + manual rows. Used by the shrink-guard.
function recordCount(obj) {
  const tx = obj && Array.isArray(obj["koin:transactions"]) ? obj["koin:transactions"].length : 0;
  const man = obj && Array.isArray(obj["koin:manual"]) ? obj["koin:manual"].length : 0;
  return tx + man;
}
// Shrink-guard thresholds: once there's real data on disk, refuse a write that drops it
// to under half — that's almost always a stale browser tab clobbering newer data, not an
// intentional change. Intentional bulk ops (import/restore, reset) pass ?force=1.
const SHRINK_MIN = 20;
const SHRINK_FRAC = 0.5;

const server = http.createServer((req, res) => {
  const pathname = req.url.split("?")[0];
  const query = new URLSearchParams(req.url.split("?")[1] || "");
  // --- data API ---
  if (pathname === "/api/data") {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": MIME[".json"] });
      return res.end(readData());
    }
    if (req.method === "PUT" || req.method === "POST") {
      // Reject cross-site writes: a malicious page in the same browser could otherwise
      // POST/sendBeacon to localhost and overwrite the data file. Same-origin requests
      // send a matching Origin (or none); cross-site ones send a foreign Origin.
      const origin = req.headers.origin;
      const allowed = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
      if (origin && !allowed.includes(origin)) { res.writeHead(403); return res.end("forbidden"); }
      const force = query.get("force") === "1" || req.headers["x-koin-force"] === "1";
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > MAX_BODY) { res.writeHead(413); res.end(); req.destroy(); }
      });
      req.on("end", () => {
        let incoming;
        try { incoming = JSON.parse(body); }       // validate before persisting
        catch { res.writeHead(400); return res.end("invalid json"); }

        if (!force) {
          let current;
          try { current = JSON.parse(readData()); } catch { current = {}; }
          const cur = recordCount(current);
          const next = recordCount(incoming);
          if (cur >= SHRINK_MIN && next < cur * SHRINK_FRAC) {
            res.writeHead(409, { "Content-Type": MIME[".json"] });
            return res.end(JSON.stringify({
              error: "shrink-guard",
              current: cur,
              incoming: next,
              message: "Refused: this save would shrink the dataset from " + cur + " to " +
                next + " rows. Likely a stale tab overwriting newer data. Reload, or re-send with ?force=1.",
            }));
          }
        }
        writeData(body);
        res.writeHead(204); res.end();
      });
      return;
    }
    res.writeHead(405); return res.end();
  }

  // --- static files (scoped to the project dir) ---
  let filePath = decodeURIComponent(pathname);
  if (filePath === "/") filePath = "/index.html";
  const file = path.join(ROOT, path.normalize(filePath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("\n  Koin is running");
  console.log(`  → open   http://localhost:${PORT}`);
  console.log(`  → data   ${DATA_FILE}\n`);
});
