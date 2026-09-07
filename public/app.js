const $ = (selector) => document.querySelector(selector);
let allRecords = [];
let period = "all";
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function clean(value, suffix = "") { return value == null ? "—" : `${format.format(value)}${suffix}`; }
function filtered() {
  const scenario = $("#scenario").value;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  return allRecords.filter((run) => {
    if (scenario && run.scenario !== scenario) return false;
    if (period === "all" || !run.timestamp) return true;
    const runDate = new Date(run.timestamp); runDate.setHours(0, 0, 0, 0);
    return period === "today" ? runDate.getTime() === today.getTime() : runDate.getTime() === yesterday.getTime();
  });
}
function card(label, value, detail) { return `<article><p>${label}</p><strong>${value}</strong><small>${detail}</small></article>`; }

function render() {
  const records = filtered();
  const latest = records[0];
  const best = records.reduce((current, run) => Math.max(current, run.score ?? -Infinity), -Infinity);
  const accuracy = records.filter((run) => run.accuracy != null).reduce((sum, run, _, list) => sum + run.accuracy / list.length, 0);
  $("#run-count").textContent = `${records.length} recorded runs`;
  $("#cards").innerHTML = [
    card("Latest score", clean(latest?.score), latest?.timestamp ? dateFormat.format(new Date(latest.timestamp)) : "No data"),
    card("Personal best", best > -Infinity ? clean(best) : "—", $("#scenario").value || "Across all scenarios"),
    card("Average accuracy", records.length ? clean(accuracy * 100, "%") : "—", "Across recorded hits and misses"),
    card("Latest average FPS", clean(latest?.avgFps), latest?.scenario || "—"),
  ].join("");
  $("#runs").innerHTML = records.slice(0, 20).map((run) => `<tr><td>${run.timestamp ? dateFormat.format(new Date(run.timestamp)) : "—"}</td><td>${run.scenario}</td><td>${clean(run.score)}</td><td>${clean(run.accuracy == null ? null : run.accuracy * 100, "%")}</td><td>${clean(run.hits, "")} / ${clean(run.misses, "")}</td><td>${clean(run.avgFps)}</td></tr>`).join("") || `<tr><td colspan="6">No runs match this scenario.</td></tr>`;
  draw(records.slice(0, 40).reverse());
}

function draw(records) {
  const values = records.map((run) => run.score).filter((score) => score != null);
  const svg = $("#chart");
  if (!values.length) { svg.innerHTML = `<text x="400" y="130" text-anchor="middle">No score data</text>`; return; }
  const low = Math.min(...values), high = Math.max(...values), padding = Math.max((high - low) * .15, 1);
  const scaleY = (value) => 230 - ((value - low + padding) / (high - low + padding * 2)) * 200;
  const points = records.map((run, index) => `${30 + index * (740 / Math.max(records.length - 1, 1))},${scaleY(run.score ?? low)}`).join(" ");
  svg.innerHTML = `<line x1="30" y1="230" x2="770" y2="230"/><line x1="30" y1="30" x2="30" y2="230"/><polyline points="${points}"/>${records.map((run, index) => `<circle cx="${30 + index * (740 / Math.max(records.length - 1, 1))}" cy="${scaleY(run.score ?? low)}" r="4"><title>${run.scenario}: ${clean(run.score)}</title></circle>`).join("")}`;
  $("#trend-caption").textContent = `${records.length} most recent runs · ${clean(low)}–${clean(high)}`;
}

async function load() {
  $("#refresh").disabled = true;
  try {
    const response = await fetch("/api/records"); const data = await response.json(); if (!response.ok) throw new Error(data.error);
    allRecords = data.records;
    const current = $("#scenario").value;
    $("#scenario").innerHTML = `<option value="">All scenarios</option>${[...new Set(allRecords.map((run) => run.scenario))].sort().map((name) => `<option ${name === current ? "selected" : ""}>${name}</option>`).join("")}`;
    $("#source").textContent = `${allRecords.length} runs read directly from ${data.statsDirectory}`;
    render();
  } catch (error) { $("#source").textContent = error.message; }
  $("#refresh").disabled = false;
}
$("#refresh").addEventListener("click", load);
$("#scenario").addEventListener("change", render);
document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => {
  period = button.dataset.period;
  document.querySelectorAll("[data-period]").forEach((item) => item.classList.toggle("active", item === button));
  render();
}));
load();
