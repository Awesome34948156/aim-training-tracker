const $ = (selector) => document.querySelector(selector);
let allRecords = [];
let period = "all";
let category = "";
let subcategory = "";
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
// Fixed category -> hue assignment (validated for the dark panel surface).
// Runs outside the benchmark are "Other" and get pattern encoding instead of a color slot.
const CATEGORY_COLORS = { Clicking: "#f29a9a", Tracking: "#92b1e6", Switching: "#bba1ec" };
const OTHER_COLOR = "#99aaa8";

function clean(value, suffix = "") { return value == null ? "—" : `${format.format(value)}${suffix}`; }
function colorOf(run) { return CATEGORY_COLORS[run.category] || OTHER_COLOR; }
function isBenchmark(run) { return Boolean(CATEGORY_COLORS[run.category]); }
// Steam play link that launches Kovaak's straight into a scenario in challenge mode.
function scenarioPlayLink(scenario) {
  return `steam://run/824270/?action=jump-to-scenario;name=${encodeURIComponent(scenario)};mode=challenge`;
}

function filtered() {
  const scenarioName = $("#scenario").value;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  return allRecords.filter((run) => {
    if (scenarioName && run.scenario !== scenarioName) return false;
    if (category && run.category !== category) return false;
    if (subcategory && run.subcategory !== subcategory) return false;
    if (period === "all" || !run.timestamp) return true;
    const runDate = new Date(run.timestamp); runDate.setHours(0, 0, 0, 0);
    return period === "today" ? runDate.getTime() === today.getTime() : runDate.getTime() === yesterday.getTime();
  });
}

// Recap of the areas trained yesterday: one row per category (Clicking,
// Tracking, Switching, Other last), subcategory chips in canonical order.
function recapHTML() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const played = new Map(); // category -> Set(subcategory)
  for (const run of allRecords) {
    if (!run.timestamp) continue;
    const runDate = new Date(run.timestamp); runDate.setHours(0, 0, 0, 0);
    if (runDate.getTime() !== yesterday.getTime()) continue;
    if (!played.has(run.category)) played.set(run.category, new Set());
    if (run.subcategory) played.get(run.category).add(run.subcategory);
  }
  if (!played.size) return `<p class="recap-empty">No runs yesterday.</p>`;
  return [...CATEGORIES, "Other"].filter((name) => played.has(name)).map((name) => {
    const subs = subcategoriesOf(name).filter((sub) => played.get(name).has(sub));
    return `<div class="recap-row"><span class="chips"><span class="dot" style="background:${colorOf({ category: name })}"></span><span class="cat${name === "Other" ? " muted" : ""}">${name === "Other" ? "Other scenarios" : name}</span>${subs.map((sub) => `<span class="sub">${sub}</span>`).join("")}</span></div>`;
  }).join("");
}

// ---- Today's recommendation ----
// Recommends 2 Intermediate S5 scenarios per category that were NOT played
// yesterday. Prefers never-played / stale scenarios and spreads picks across
// different subcategories. Novice scenarios are intentionally excluded.
const INTERMEDIATE_CATEGORIES = ["Clicking", "Tracking", "Switching"];
const DAY_MS = 86400000;

function localMidnight(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function startOfToday() { return localMidnight(new Date()).getTime(); }
function startOfYesterday() { return localMidnight(new Date(Date.now() - DAY_MS)).getTime(); }

// Map of subcategories practiced on a given local-midnight date, by category.
function coveredOn(dateKey) {
  const seen = new Map();
  for (const run of allRecords) {
    if (!run.timestamp) continue;
    if (localMidnight(new Date(run.timestamp)).getTime() !== dateKey) continue;
    if (!seen.has(run.category)) seen.set(run.category, new Set());
    if (run.subcategory) seen.get(run.category).add(run.subcategory);
  }
  return seen;
}

// Timestamp (ms) of a scenario's most recent play, or null if never played.
function lastPlayedAt(scenario) {
  let latest = null;
  for (const run of allRecords) {
    if (run.scenario !== scenario || !run.timestamp) continue;
    const t = new Date(run.timestamp).getTime();
    if (latest === null || t > latest) latest = t;
  }
  return latest;
}

// Whether a scenario has any record on a given local-midnight date.
function scenarioPlayedOn(scenario, dateKey) {
  for (const run of allRecords) {
    if (run.scenario !== scenario || !run.timestamp) continue;
    if (localMidnight(new Date(run.timestamp)).getTime() === dateKey) return true;
  }
  return false;
}

function recommendCategory(category) {
  const yesterdayKey = startOfYesterday();
  // Group this category's Intermediate scenarios by subcategory.
  const bySub = new Map();
  for (const [scenario, item] of Object.entries(INTERMEDIATE_SCENARIOS)) {
    if (item.category !== category) continue;
    if (!bySub.has(item.subcategory)) bySub.set(item.subcategory, []);
    bySub.get(item.subcategory).push(scenario);
  }
  const candidates = [];
  for (const [sub, list] of bySub) {
    for (const scenario of list) {
      const last = lastPlayedAt(scenario);
      candidates.push({ scenario, sub, last, playedYesterday: scenarioPlayedOn(scenario, yesterdayKey) });
    }
  }
  // Prefer scenarios not played yesterday, then never-played / stale, then name.
  candidates.sort((a, b) => {
    if (a.playedYesterday !== b.playedYesterday) return a.playedYesterday ? 1 : -1;
    const aLast = a.last === null ? -Infinity : a.last;
    const bLast = b.last === null ? -Infinity : b.last;
    if (aLast !== bLast) return aLast - bLast;
    return a.scenario.localeCompare(b.scenario);
  });
  // Only suggest scenarios the user did NOT play yesterday; if a whole category
  // was covered yesterday, fall back to the full ranked list.
  const pool = candidates.filter((c) => !c.playedYesterday);
  const usable = pool.length >= 2 ? pool : candidates;
  // Pick 2, preferring two distinct subcategories.
  const picked = [];
  for (const c of usable) {
    if (!picked.length) { picked.push(c); continue; }
    if (picked.length >= 2) break;
    if (c.sub !== picked[0].sub) { picked.push(c); break; }
  }
  if (picked.length < 2) {
    for (const c of usable) {
      if (!picked.includes(c)) { picked.push(c); if (picked.length >= 2) break; }
    }
  }
  const nowKey = startOfToday();
  return picked.map((p) => {
    const reason = p.last === null ? "Never played"
      : p.playedYesterday ? "Coverage gap"
      : `Not played in ${Math.max(1, Math.round((nowKey - p.last) / DAY_MS))} days`;
    return { scenario: p.scenario, sub: p.sub, reason };
  });
}

// The day's recommendation list is frozen on the first load of the day, so
// playing a recommended scenario doesn't reshuffle the list. Items already
// played today are shown struck through.
function localDateKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function frozenRecommendations() {
  const key = `recommendations-${localDateKey()}`;
  let cached = null;
  try { cached = localStorage.getItem(key); } catch { /* storage unavailable */ }
  if (cached) {
    try { return JSON.parse(cached); } catch { /* malformed; recompute below */ }
  }
  const picks = {};
  for (const cat of INTERMEDIATE_CATEGORIES) {
    const order = subcategoriesOf(cat);
    picks[cat] = recommendCategory(cat).slice().sort((a, b) => order.indexOf(a.sub) - order.indexOf(b.sub));
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const existing = localStorage.key(i);
      if (existing && existing.startsWith("recommendations-") && existing !== key) {
        localStorage.removeItem(existing);
      }
    }
    localStorage.setItem(key, JSON.stringify(picks));
  } catch { /* storage unavailable; still render this day's picks */ }
  return picks;
}

function renderRecommendations() {
  const picks = frozenRecommendations();
  const todayKey = startOfToday();
  $("#recommend").innerHTML = INTERMEDIATE_CATEGORIES.map((cat) => {
    const color = CATEGORY_COLORS[cat];
    const items = (picks[cat] || []).map((p) => {
      const played = scenarioPlayedOn(p.scenario, todayKey);
      return `<div class="rec-item${played ? " done" : ""}"><span class="rec-sub">${p.sub}</span><span class="rec-name">${p.scenario}</span><small class="rec-reason">${played ? "Played today" : p.reason}</small><a class="rec-play" href="${scenarioPlayLink(p.scenario)}" title="Play ${p.scenario} in Kovaak's" aria-label="Play ${p.scenario} in Kovaak's">▶</a></div>`;
    }).join("");
    return `<div class="rec-cat"><div class="rec-cat-head"><span class="dot" style="background:${color}"></span><span class="cat" style="color:${color}">${cat}</span></div><div class="rec-list">${items}</div></div>`;
  }).join("");
}

// Scenario options = played scenarios plus benchmark scenarios matching the
// category/subcategory filter, so the whole benchmark stays browsable even
// before every scenario has been played.
function scenarioOptions() {
  let names = new Set(allRecords.map((run) => run.scenario));
  if (category || subcategory) {
    names = new Set([...names].filter((name) => {
      const item = categoryOf(name);
      return (!category || item.category === category) && (!subcategory || item.subcategory === subcategory);
    }));
  }
  for (const [scenario, item] of Object.entries(SCENARIO_CATEGORIES)) {
    if ((!category || item.category === category) && (!subcategory || item.subcategory === subcategory)) names.add(scenario);
  }
  return [...names].sort();
}

function populateScenarioOptions() {
  const current = $("#scenario").value;
  $("#scenario").innerHTML = `<option value="">All scenarios</option>${scenarioOptions().map((name) => `<option ${name === current ? "selected" : ""}>${name}</option>`).join("")}`;
}

function populateCategoryOptions() {
  $("#category").innerHTML = `<option value="">All categories</option>${[...CATEGORIES, "Other"].map((name) => `<option ${name === category ? "selected" : ""}>${name}</option>`).join("")}`;
}

function populateSubcategories() {
  let subs;
  if (category === "Other") subs = [];
  else if (category) subs = subcategoriesOf(category);
  else subs = [...new Set(Object.values(SCENARIO_CATEGORIES).map((item) => item.subcategory))].sort();
  if (subcategory && !subs.includes(subcategory)) subcategory = "";
  $("#subcategory").innerHTML = `<option value="">All subcategories</option>${subs.map((name) => `<option ${name === subcategory ? "selected" : ""}>${name}</option>`).join("")}`;
}

function card(label, value, detail) { return `<article><p>${label}</p><strong>${value}</strong><small>${detail}</small></article>`; }

function render() {
  const records = filtered();
  const latest = records[0];
  const best = records.reduce((current, run) => Math.max(current, run.score ?? -Infinity), -Infinity);
  const accuracy = records.filter((run) => run.accuracy != null).reduce((sum, run, _, list) => sum + run.accuracy / list.length, 0);
  const scope = subcategory || category || $("#scenario").value || "Across all scenarios";
  $("#run-count").textContent = `${records.length} recorded runs`;
  $("#cards").innerHTML = [
    card("Latest score", clean(latest?.score), latest?.timestamp ? dateFormat.format(new Date(latest.timestamp)) : "No data"),
    card("Personal best", best > -Infinity ? clean(best) : "—", scope),
    card("Average accuracy", records.length ? clean(accuracy * 100, "%") : "—", "Across recorded hits and misses"),
    card("Latest average FPS", clean(latest?.avgFps), latest?.scenario || "—"),
  ].join("");
  // Yesterday's recap is fixed to the previous day and independent of the
  // filters above: it answers "what did I practice", not "what matches".
  $("#recap").innerHTML = recapHTML();
  renderRecommendations();
  draw(records.slice(0, 40).reverse());
}

function draw(records) {
  const svg = $("#chart");
  const values = records.map((run) => run.score).filter((score) => score != null);
  if (!values.length) {
    svg.innerHTML = `<text x="400" y="130" text-anchor="middle">No score data</text>`;
    $("#chart-legend").innerHTML = "";
    return;
  }
  const low = Math.min(...values), high = Math.max(...values), padding = Math.max((high - low) * .15, 1);
  const scaleY = (value) => 230 - ((value - low + padding) / (high - low + padding * 2)) * 200;
  const x = (index) => 30 + index * (740 / Math.max(records.length - 1, 1));
  // One polyline per consecutive group of runs sharing a category, colored by category.
  const segments = [];
  for (const [index, run] of records.entries()) {
    const color = colorOf(run);
    if (!segments.length || segments[segments.length - 1].color !== color) segments.push({ color, points: [] });
    segments[segments.length - 1].points.push(`${x(index)},${scaleY(run.score ?? low)}`);
  }
  const circles = records.map((run, index) => {
    const isOther = !isBenchmark(run);
    const fill = isOther ? `style="fill:var(--panel);stroke:${OTHER_COLOR};stroke-width:2"` : `fill="${colorOf(run)}"`;
    return `<circle cx="${x(index)}" cy="${scaleY(run.score ?? low)}" r="4" ${fill}><title>${run.scenario} · ${run.category}${run.subcategory ? " / " + run.subcategory : ""}: ${clean(run.score)}</title></circle>`;
  }).join("");
  const polylines = segments.map((segment) => `<polyline points="${segment.points.join(" ")}"${segment.color === OTHER_COLOR ? ` stroke-dasharray="5 5"` : ""} style="stroke:${segment.color}"/>`).join("");
  svg.innerHTML = `<line x1="30" y1="230" x2="770" y2="230"/><line x1="30" y1="30" x2="30" y2="230"/>${polylines}${circles}`;
  const used = [...new Set(records.map((run) => run.category))];
  $("#chart-legend").innerHTML = used.map((name) => {
    const color = CATEGORY_COLORS[name] || OTHER_COLOR;
    return `<span class="legend-item"><i class="${color === OTHER_COLOR ? "legend-dash" : ""}" style="background:${color}"></i>${name}</span>`;
  }).join("");
  $("#trend-caption").textContent = `${records.length} most recent runs · ${clean(low)}–${clean(high)}`;
}

async function load() {
  $("#refresh").disabled = true;
  try {
    const response = await fetch("/api/records"); const data = await response.json(); if (!response.ok) throw new Error(data.error);
    allRecords = data.records.map((run) => Object.assign(run, categoryOf(run.scenario)));
    populateCategoryOptions();
    populateSubcategories();
    populateScenarioOptions();
    $("#source").textContent = `${allRecords.length} runs read directly from ${data.statsDirectory}`;
    render();
    hideSetup();
  } catch (error) { $("#source").textContent = error.message; showSetup(); }
  $("#refresh").disabled = false;
}
// ---- Stats folder setup (shown on first run / when the folder is unreadable) ----
const SETUP = { path: null };
const STEAM_DEFAULT = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\FPSAimTrainer\\FPSAimTrainer\\stats";
const STEAM_D = "D:\\Steam\\steamapps\\common\\FPSAimTrainer\\FPSAimTrainer\\stats";

function joinPath(base, name) { return base.replace(/[\\/]+$/, "") + "\\" + name; }
function showSetup() { $("#setup").hidden = false; loadConfigAndBrowse(); }

let lastReturnRefresh = 0;
function refreshOnReturn() {
  if (document.visibilityState === "hidden") return;
  const now = Date.now();
  if (now - lastReturnRefresh < 1500) return;
  lastReturnRefresh = now;
  load();
}

function hideSetup() { $("#setup").hidden = true; }

async function loadConfigAndBrowse() {
  let current = "";
  try {
    const res = await fetch("/api/config"); const data = await res.json();
    current = data.statsDirectory || "";
  } catch { /* ignore */ }
  $("#setup-path-input").value = current;
  browseTo(current || null);
}

async function browseTo(path) {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  let data;
  try { const res = await fetch(`/api/browse${query}`); data = await res.json(); } catch { data = null; }
  if (!data) {
    $("#setup-status").textContent = "Could not browse that folder.";
    $("#setup-status").className = "setup-status err";
    return;
  }
  SETUP.path = data.path;
  $("#setup-current").textContent = data.path;
  $("#setup-current").title = data.path;
  const list = $("#setup-list");
  list.innerHTML = "";
  if (data.parent) list.appendChild(dirButton("..", data.parent));
  for (const name of data.dirs) list.appendChild(dirButton(name, joinPath(data.path, name)));
  $("#setup-select").disabled = !data.exists;
  const status = $("#setup-status");
  if (data.hasStats) { status.textContent = "✓ Kovaak's stats detected here"; status.className = "setup-status ok"; }
  else if (data.exists) { status.textContent = "Folder found, but no Stats.csv yet"; status.className = "setup-status"; }
  else { status.textContent = "Folder not found"; status.className = "setup-status err"; }
}

function dirButton(label, full) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "setup-dir"; b.textContent = label;
  b.addEventListener("click", () => browseTo(full));
  return b;
}

async function selectSetup() {
  if (!SETUP.path) return;
  const status = $("#setup-status");
  status.textContent = "Saving…"; status.className = "setup-status";
  try {
    const res = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ directory: SETUP.path }) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Could not save that folder.");
    hideSetup();
    load();
  } catch (error) { status.textContent = error.message; status.className = "setup-status err"; }
}

$("#set-folder").addEventListener("click", showSetup);
$("#setup-cancel").addEventListener("click", hideSetup);
$("#setup-go").addEventListener("click", () => browseTo($("#setup-path-input").value));
$("#setup-path-input").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); browseTo($("#setup-path-input").value); } });
$("#setup-home").addEventListener("click", () => browseTo(null));
$("#setup-steam").addEventListener("click", () => browseTo(STEAM_DEFAULT));
$("#setup-steam-d").addEventListener("click", () => browseTo(STEAM_D));
$("#setup-select").addEventListener("click", selectSetup);

$("#refresh").addEventListener("click", load);
$("#scenario").addEventListener("change", render);
$("#category").addEventListener("change", () => {
  category = $("#category").value;
  populateSubcategories();
  populateScenarioOptions();
  render();
});
$("#subcategory").addEventListener("change", () => {
  subcategory = $("#subcategory").value;
  populateScenarioOptions();
  render();
});
document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => {
  period = button.dataset.period;
  document.querySelectorAll("[data-period]").forEach((item) => item.classList.toggle("active", item === button));
  render();
}));
load();
document.addEventListener("visibilitychange", refreshOnReturn);
window.addEventListener("focus", refreshOnReturn);

// Heartbeat: keeps the packaged exe alive while this tab is open. On pagehide
// we beacon "closed" so the exe can quit. Uses a per-tab id so multiple tabs and
// page refreshes don't falsely close the app.
let hbId = sessionStorage.getItem("kovaaks-hb-id");
if (!hbId) {
  hbId = Math.random().toString(36).slice(2);
  sessionStorage.setItem("kovaaks-hb-id", hbId);
}
async function heartbeat() {
  try {
    await fetch("/api/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: hbId }),
      keepalive: true
    });
  } catch { /* ignore */ }
}
heartbeat();
setInterval(heartbeat, 5000);
window.addEventListener("pagehide", () => {
  try { navigator.sendBeacon("/api/heartbeat", JSON.stringify({ id: hbId, closed: true })); } catch { /* ignore */ }
});
