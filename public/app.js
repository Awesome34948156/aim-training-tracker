const $ = (selector) => document.querySelector(selector);
let allRecords = [];
let period = "all";
let category = "";
let subcategory = "";
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
// Fixed category -> hue assignment (validated for the dark panel surface).
// Runs outside the benchmark are "Other" and get pattern encoding instead of a color slot.
const CATEGORY_COLORS = { Clicking: "#3987e5", Tracking: "#d95926", Switching: "#199e70" };
const OTHER_COLOR = "#99aaa8";

function clean(value, suffix = "") { return value == null ? "—" : `${format.format(value)}${suffix}`; }
function colorOf(run) { return CATEGORY_COLORS[run.category] || OTHER_COLOR; }
function isBenchmark(run) { return Boolean(CATEGORY_COLORS[run.category]); }

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
  $("#runs").innerHTML = records.slice(0, 20).map((run) => {
    const chips = `<span class="chips"><span class="dot" style="background:${colorOf(run)}"></span><span class="cat${isBenchmark(run) ? "" : " muted"}">${run.category}</span>${run.subcategory ? `<span class="sub">${run.subcategory}</span>` : ""}</span>`;
    return `<tr><td>${run.timestamp ? dateFormat.format(new Date(run.timestamp)) : "—"}</td><td>${run.scenario}</td><td>${chips}</td><td>${clean(run.score)}</td><td>${clean(run.accuracy == null ? null : run.accuracy * 100, "%")}</td><td>${clean(run.hits, "")} / ${clean(run.misses, "")}</td><td>${clean(run.avgFps)}</td></tr>`;
  }).join("") || `<tr><td colspan="7">No runs match these filters.</td></tr>`;
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
  } catch (error) { $("#source").textContent = error.message; }
  $("#refresh").disabled = false;
}
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
