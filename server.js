const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4173);
const statsDirectory = process.env.KOVAAKS_STATS_DIR ||
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\FPSAimTrainer\\FPSAimTrainer\\stats";
const publicDirectory = path.join(__dirname, "public");

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

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  response.end(body);
}

http.createServer(async (request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (requestPath === "/api/records") {
    try {
      const data = await records();
      return send(response, 200, JSON.stringify({ statsDirectory, records: data }));
    } catch (error) {
      return send(response, 500, JSON.stringify({ error: `Could not read Kovaak's stats folder: ${error.message}`, statsDirectory }));
    }
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
}).listen(PORT, () => console.log(`Aim tracker: http://localhost:${PORT}`));
