const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const fssync = require("node:fs");

const PORT = Number(process.env.PORT || 4173);
const configPath = path.join(__dirname, "config.json");
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
    await fs.writeFile(configPath, JSON.stringify({ statsDirectory }, null, 2), "utf8");
  } catch { /* ignore write errors */ }
}

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
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

  const file = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = path.resolve(publicDirectory, file);
  if (!filePath.startsWith(publicDirectory)) return send(response, 403, "Forbidden", "text/plain");
  try {
    const content = await fs.readFile(filePath);
    const type = file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
    return send(response, 200, content, type);
  } catch {
    return send(response, 404, "Not found", "text/plain");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Aim tracker: http://localhost:${PORT}`));
