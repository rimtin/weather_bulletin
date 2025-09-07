/***********************
 * CONFIG – Subdivision GeoJSON only
 ***********************/
const SUBDIV_GEO_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

/***********************
 * HELPERS
 ***********************/
const cssEscape = (s) =>
  (window.CSS && typeof CSS.escape === "function")
    ? CSS.escape(String(s ?? ""))
    : String(s ?? "").replace(/'/g, "\\'").replace(/"/g, '\\"');

function canonical(input) {
  return String(input || "")
    .replace(/[\u2010-\u2015]/g, "-")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim()
    // known IMD variants
    .replace(/north *interior *karnataka|n *i *karnataka/, "ni karnataka")
    .replace(/south *interior *karnataka|s *i *karnataka/, "si karnataka")
    .replace(/saurashtra *and *(kutch|kachchh|kachh)/, "saurashtra and kachh")
    .replace(/tamil *nadu *and *puducherry/, "tamil nadu and puducherry")
    .replace(/[^\w]+/g, "-");
}

function pickNameKey(features) {
  const priority = ["ST_NM","st_nm","NAME","name","ST_NAME","st_name","SUBDIV","subdiv"];
  const seen = new Set();
  features.forEach(f => Object.keys(f.properties || {}).forEach(k => seen.add(k)));
  for (const k of priority) if (seen.has(k)) return k;
  for (const f of features) for (const k of Object.keys(f.properties || {}))
    if (typeof f.properties[k] === "string") return k;
  return "ST_NM";
}

async function loadGeoJSON(urls) {
  let last;
  for (const u of urls) {
    try {
      const join = u.includes("?") ? "&" : "?";
      const res = await fetch(`${u}${join}v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      const j = await res.json();
      const feats = (j.features || []).filter(f => f && f.geometry);
      if (!feats.length) throw new Error("Empty features");
      return { type: "FeatureCollection", features: feats };
    } catch (e) { console.warn("[GeoJSON] fail:", u, e); last = e; }
  }
  throw last || new Error("All URLs failed");
}

/** Ensure a hatch pattern exists per SVG and return its id */
function ensureNoForecastPattern(svg) {
  const id = (svg.attr("id") || "map") + "_noForecast";
  let defs = svg.select("defs");
  if (defs.empty()) defs = svg.append("defs");

  if (svg.select("#" + cssEscape(id)).empty()) {
    const p = defs.append("pattern")
      .attr("id", id)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8).attr("height", 8)
      .attr("patternTransform", "rotate(45)");

    p.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#f2f2f2");
    p.append("path").attr("d", "M 0 0 L 0 8").attr("stroke", "#999").attr("stroke-width", 1);
  }
  svg.attr("data-nf-pattern", id);
  return id;
}

/***********************
 * TABLE
 ***********************/
function buildSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const groups = {};
  (window.subdivisions || []).forEach(r => { (groups[r.state] ||= []).push(r); });

  let serial = 1;
  Object.keys(groups).forEach(state => {
    const rows = groups[state];
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.dataset.state = state;
      tr.dataset.subdiv = row.name;
      tr.dataset.norm = canonical(row.name);
      tr.innerHTML = `
        <td>${serial++}</td>
        ${i === 0 ? `<td rowspan="${rows.length}">${state}</td>` : ""}
        <td>${row.name}</td>
        <td contenteditable="true"></td>
        <td><select class="day1">${(window.forecastOptions || []).map(o => `<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${(window.forecastOptions || []).map(o => `<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // select → color
  tbody.querySelectorAll("select").forEach(sel =>
    sel.addEventListener("change", paintMapsFromTable)
  );

  // table → map hover
  tbody.querySelectorAll("tr").forEach(tr => {
    const id = tr.dataset.norm;
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],` +
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke", "#000").attr("stroke-width", 1.6);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],` +
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke", "#666").attr("stroke-width", 0.8);
    });
  });
}

/***********************
 * MAPS
 ***********************/
async function drawSubdivisionMap(svgSelector, onReady) {
  const svg = d3.select(svgSelector);
  if (svg.empty()) { onReady?.(); return; }

  svg.selectAll("*").remove();

  // viewBox MUST be 4 numbers; keep CSS responsive
  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");

  // hatch for "No Forecast"
  const nfPatternId = ensureNoForecastPattern(svg);

  try {
    const fc = await loadGeoJSON(SUBDIV_GEO_URLS);
    const NAME = pickNameKey(fc.features);

    // projection tuned for India
    const projection = d3.geoConicEqualArea()
      .parallels([12, 33])          // standard parallels
      .rotate([-82.5, 0])           // longitude of center as rotation
      .center([0, 22]);             // latitude center
    const path = d3.geoPath().projection(projection);
    projection.fitSize([W - 12, H - 12], fc);

    // Fills
    svg.append("g").attr("class", "fills")
      .selectAll("path.state")
      .data(fc.features)
      .enter()
      .append("path")
      .attr("class", "state")
      .attr("d", path)
      .attr("data-name", d => d.properties?.[NAME] ?? "")
      .attr("data-norm", d => canonical(d.properties?.[NAME] ?? ""))
      .attr("fill", "#e6e6e6")
      .on("mouseenter", function (e, d) {
        const id = canonical(d.properties?.[NAME]);
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],` +
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke", "#000").attr("stroke-width", 1.6);
      })
      .on("mouseleave", function (e, d) {
        const id = canonical(d.properties?.[NAME]);
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],` +
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke", "#666").attr("stroke-width", 0.8);
      });

    // Borders
    svg.append("g").attr("class", "borders")
      .selectAll("path.border")
      .data(fc.features)
      .enter()
      .append("path")
      .attr("class", "border")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#666")
      .attr("stroke-width", 0.8)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("pointer-events", "none")
      .attr("data-name", d => d.properties?.[NAME] ?? "")
      .attr("data-norm", d => canonical(d.properties?.[NAME] ?? ""));

    svg.attr("data-nf-pattern", nfPatternId);

    onReady?.();
  } catch (e) {
    console.error("[Map] load error:", e);
    const msg = "Failed to load subdivision map data.";
    svg.append("text").attr("x", 20).attr("y", 40).attr("fill", "#b00").text(msg);
    onReady?.();
  }
}

/***********************
 * COLOR FROM TABLE
 ***********************/
function paintMapsFromTable() {
  const rows = document.querySelectorAll("#subdivision-table-body tr");
  const patt1 = document.getElementById("indiaSubMapDay1")?.getAttribute("data-nf-pattern");
  const patt2 = document.getElementById("indiaSubMapDay2")?.getAttribute("data-nf-pattern");
  const colors = window.forecastColors || {};

  rows.forEach(row => {
    const id = row.dataset.norm;
    const d1 = row.querySelector("select.day1")?.value?.trim() || "";
    const d2 = row.querySelector("select.day2")?.value?.trim() || "";

    const isNo1 = /no\s*forecast/i.test(d1);
    const isNo2 = /no\s*forecast/i.test(d2);

    const c1 = isNo1 ? (patt1 ? `url(#${patt1})` : "#f2f2f2") : (colors[d1] || "#e6e6e6");
    const c2 = isNo2 ? (patt2 ? `url(#${patt2})` : "#f2f2f2") : (colors[d2] || "#e6e6e6");

    d3.selectAll(`#indiaSubMapDay1 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c1);
    d3.selectAll(`#indiaSubMapDay2 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c2);
  });
}

/***********************
 * INIT
 ***********************/
window.addEventListener("unhandledrejection", e => {
  console.error("[Global] Unhandled promise:", e.reason || e);
});

window.addEventListener("load", () => {
  if (typeof updateISTDate === "function") updateISTDate();

  buildSubdivisionTable();

  // draw both maps, then do an initial paint so colors show
  drawSubdivisionMap("#indiaSubMapDay1", () => {
    drawSubdivisionMap("#indiaSubMapDay2", () => {
      paintMapsFromTable();
    });
  });
});
