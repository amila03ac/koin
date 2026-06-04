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
const DATA_DIR = path.join(os.homedir(), ".koin");
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

const server = http.createServer((req, res) => {
  // --- data API ---
  if (req.url === "/api/data") {
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
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > MAX_BODY) { res.writeHead(413); res.end(); req.destroy(); }
      });
      req.on("end", () => {
        try {
          JSON.parse(body);          // validate before persisting
          writeData(body);
          res.writeHead(204); res.end();
        } catch {
          res.writeHead(400); res.end("invalid json");
        }
      });
      return;
    }
    res.writeHead(405); return res.end();
  }

  // --- static files (scoped to the project dir) ---
  let pathname = decodeURIComponent(req.url.split("?")[0]);
  if (pathname === "/") pathname = "/index.html";
  const file = path.join(ROOT, path.normalize(pathname));
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
