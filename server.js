const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const fssync = require("node:fs");
const { exec } = require("node:child_process");

const PORT = Number(process.env.PORT || 4173);
// Save settings to a user-writable dir so it works both in dev and inside a packaged exe.
const userDataDir = process.env.APPDATA ? path.join(process.env.APPDATA, "kovaaks-aim-tracker") : path.join(os.homedir(), ".kovaaks-aim-tracker");
const configPath = path.join(userDataDir, "config.json");
const publicDirectory = path.join(__dirname, "public");

const DEFAULT_STATS_DIR =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\FPSAimTrainer\\FPSAimTrainer\\stats";

// Resolve the stats directory: saved config > env var > default.
let statsDirectory = (() => {
  try {
    const saved = JSON.parse(fssync.readFileSync(configPath, "utf8"));
    if (saved && typeof saved.statsDirectory === "string") return saved.statsDirectory;
  } catch { /* no saved config yet */ }
  return process.env.KOVAAKS_STATS_DIR || DEFAULT_STATS_DIR;
})();

async function saveConfig() {
  try {
    await fs.mkdir(userDataDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({ statsDirectory }, null, 2), "utf8");
  } catch { /* ignore write errors */ }
}

function openBrowser(url) {
  const command = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  try { exec(command, { windowsHide: true }, () => {}); } catch { /* ignore */ }
}

// Auto-quit when no browser tab is open (packaged exe only). The page sends a
// /api/heartbeat while open, and a "closed" beacon on pagehide; when no pages
// remain (or none ever connected) the process kills itself.
const startTime = Date.now();
const clients = new Map();         // heartbeat id -> last seen (ms)
let everConnected = false;
let lastEmptyAt = null;
const HEARTBEAT_TIMEOUT_MS = 90000; // prune a stale page after this (survives background throttling)
const QUIT_GRACE_MS = 2000;         // wait for a refresh before quitting
const NO_CONNECT_QUIT_MS = 30000;   // give up if no page ever connects

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  });
  response.end(body);
}

function value(lines, label) {
  const line = lines.find((item) => item.startsWith(`${label}:,`));
  return line ? line.slice(label.length + 2).trim() : null;
}

function number(valueText) {
  const parsed = Number(valueText);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampFromName(name) {
  const match = name.match(/- (\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}) Stats\.csv$/i);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}` : null;
}

async function readRecord(name) {
  const contents = await fs.readFile(path.join(statsDirectory, name), "utf8");
  const lines = contents.split(/\r?\n/);
  const hits = number(value(lines, "Hit Count"));
  const misses = number(value(lines, "Miss Count"));
  return {
    id: name,
    timestamp: timestampFromName(name),
    scenario: value(lines, "Scenario") || name.replace(/ - \d{4}.*$/, ""),
    score: number(value(lines, "Score")),
    hits,
    misses,
    accuracy: hits !== null && misses !== null && hits + misses > 0 ? hits / (hits + misses) : null,
    sensitivity: number(value(lines, "Horiz Sens")),
    dpi: number(value(lines, "DPI")),
    avgFps: number(value(lines, "Avg FPS")),
  };
}

async function records() {
  const entries = await fs.readdir(statsDirectory, { withFileTypes: true });
  const csvs = entries.filter((entry) => entry.isFile() && / Stats\.csv$/i.test(entry.name));
  const parsed = await Promise.all(csvs.map((entry) => readRecord(entry.name).catch(() => null)));
  return parsed.filter(Boolean).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
}

async function statsCount(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && / Stats\.csv$/i.test(entry.name)).length;
  } catch {
    return 0;
  }
}

// List subdirectories of a folder and report whether it holds Kovaak's records.
async function browse(dir) {
  const target = dir || os.homedir();
  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch {
    const parent = path.dirname(target) === target ? null : path.dirname(target);
    return { path: target, parent, dirs: [], hasStats: false, exists: false };
  }
  const dirs = [];
  let hasStats = false;
  for (const entry of entries) {
    if (entry.isDirectory()) dirs.push(entry.name);
    else if (/ Stats\.csv$/i.test(entry.name)) hasStats = true;
  }
  dirs.sort((a, b) => a.localeCompare(b));
  const parent = path.dirname(target) === target ? null : path.dirname(target);
  return { path: target, parent, dirs, hasStats, exists: true };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => { data += chunk; });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestPath = url.pathname;
  const query = url.searchParams;

  if (requestPath === "/api/records") {
    try {
      const data = await records();
      return send(response, 200, JSON.stringify({ statsDirectory, records: data }));
    } catch (error) {
      return send(response, 500, JSON.stringify({ error: `Could not read Kovaak's stats folder: ${error.message}`, statsDirectory }));
    }
  }

  if (requestPath === "/api/config") {
    if (request.method === "GET") {
      const count = await statsCount(statsDirectory);
      const valid = await fs.stat(statsDirectory).then(() => count > 0).catch(() => false);
      return send(response, 200, JSON.stringify({ statsDirectory, valid, recordsCount: count }));
    }
    if (request.method === "POST") {
      let body;
      try { body = JSON.parse(await readBody(request)); } catch { return send(response, 400, JSON.stringify({ ok: false, error: "Invalid request." })); }
      const dir = body && typeof body.directory === "string" ? body.directory.trim() : "";
      if (!dir) return send(response, 400, JSON.stringify({ ok: false, error: "No folder given." }));
      let stat;
      try { stat = await fs.stat(dir); } catch { return send(response, 400, JSON.stringify({ ok: false, error: `Folder not accessible: ${dir}` })); }
      if (!stat.isDirectory()) return send(response, 400, JSON.stringify({ ok: false, error: `Not a folder: ${dir}` }));
      statsDirectory = dir;
      await saveConfig();
      const count = await statsCount(dir);
      return send(response, 200, JSON.stringify({ ok: true, statsDirectory: dir, recordsCount: count }));
    }
    return send(response, 405, JSON.stringify({ ok: false, error: "Method not allowed" }));
  }

  if (requestPath === "/api/browse") {
    const data = await browse(query.get("path") || undefined);
    return send(response, 200, JSON.stringify(data));
  }

  if (requestPath === "/api/heartbeat") {
    let id = "", closed = false;
    try {
      const parsed = JSON.parse(await readBody(request));
      id = (parsed && parsed.id) || "";
      closed = Boolean(parsed && parsed.closed);
    } catch { /* empty/invalid body */ }
    if (closed) {
      if (id) clients.delete(id);
    } else if (id) {
      clients.set(id, Date.now());
      everConnected = true;
      lastEmptyAt = null;
    }
    return send(response, 200, "{}");
  }

  const file = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = path.resolve(publicDirectory, file);
  const relative = path.relative(publicDirectory, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return send(response, 403, "Forbidden", "text/plain");
  try {
    const content = await fs.readFile(filePath);
    const type = file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
    return send(response, 200, content, type);
  } catch {
    return send(response, 404, "Not found", "text/plain");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Aim tracker: http://localhost:${PORT}`);
  if (process.pkg) openBrowser(`http://localhost:${PORT}`);
});

// Packaged exe only: kill the process once no browser tab is open.
if (process.pkg) {
  setInterval(() => {
    const now = Date.now();
    for (const [id, seen] of clients) if (now - seen > HEARTBEAT_TIMEOUT_MS) clients.delete(id);
    if (clients.size === 0) {
      if (lastEmptyAt === null) lastEmptyAt = now;
      if ((everConnected && now - lastEmptyAt > QUIT_GRACE_MS) || (!everConnected && now - startTime > NO_CONNECT_QUIT_MS)) {
        process.exit(0);
      }
    } else {
      lastEmptyAt = null;
    }
  }, 1000);
}
