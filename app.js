/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

// map of table label → GeoJSON label (kept empty; we canonicalize)
const TableToGeoName = {};

/***********************
 * HELPERS
 ***********************/
const cssEscape = (s) => {
  s = String(s ?? "");
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(s);
  return s.replace(/'/g, "\\'").replace(/"/g, '\\"');
};

// Normalize names for matching
function canonical(input) {
  let s = String(input || "")
    .replace(/[\u2010-\u2015]/g, "-")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();

  s = s.replace(/north *interior *karnataka|n *i *karnataka/, "ni karnataka");
  s = s.replace(/south *interior *karnataka|s *i *karnataka/, "si karnataka");
  s = s.replace(/saurashtra *and *(kutch|kachchh|kachh)/, "saurashtra and kachh");
  s = s.replace(/gujarat *region/, "gujarat region");
  s = s.replace(/tamil *nadu *and *puducherry/, "tamil nadu and puducherry");
  s = s.replace(/konkan *and *goa/, "konkan and goa");
  return s.replace(/[^\w]+/g, "-");
}

function showInlineError(svg, msg) {
  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  svg.append("text").attr("x", W/2).attr("y", H/2)
    .attr("text-anchor", "middle").attr("font-size", 16).attr("fill", "#aa0000").text(msg);
}

// choose the name field (defaults to ST_NM)
function pickNameKey(features) {
  const pref = ["ST_NM","st_nm","NAME","name"];
  const seen = new Set();
  features.forEach(f => Object.keys(f.properties||{}).forEach(k => seen.add(k)));
  for (const k of pref) if (seen.has(k)) return k;
  for (const f of features) for (const k of Object.keys(f.properties||{}))
    if (typeof f.properties[k] === "string") return k;
  return "ST_NM";
}

// load GeoJSON with fallbacks
async function loadGeoJSON(urls) {
  let lastErr;
  for (const u of urls) {
    try {
      const url = u + (u.includes("?") ? "&" : "?") + "v=" + Date.now();
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = await r.json();
      const feats = (j.features || []).filter(f => f && f.geometry);
      if (!feats.length) throw new Error("Empty features");
      return { type: "FeatureCollection", features: feats };
    } catch (e) {
      console.warn("[GeoJSON] failed:", u, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All URLs failed");
}

// make a diagonal hatch pattern for "No Forecast"
function ensureNoForecastPattern(svg) {
  const svgId = svg.attr("id") || "map";
  const patId = `${svgId}_noForecast`;
  let defs = svg.select("defs"); if (defs.empty()) defs = svg.append("defs");
  if (svg.select(`#${cssEscape(patId)}`).empty()) {
    const p = defs.append("pattern").attr("id", patId)
      .attr("patternUnits", "userSpaceOnUse").attr("width", 8).attr("height", 8).attr("patternTransform", "rotate(45)");
    p.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#f2f2f2");
    p.append("path").attr("d", "M 0 0 L 0 8").attr("stroke", "#999").attr("stroke-width", 1);
  }
  svg.attr("data-nf-pattern", patId);
  return patId;
}

/***********************
 * TABLE
 ***********************/
function buildSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) { console.error("[Table] Missing #subdivision-table-body"); return; }
  tbody.innerHTML = "";

  // group rows by state
  const groups = {};
  (window.subdivisions || []).forEach(r => (groups[r.state] ||= []).push(r));

  let serial = 1;
  Object.keys(groups).forEach(state => {
    const rows = groups[state];
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.dataset.state = state;
      tr.dataset.subdiv = row.name;
      tr.dataset.norm = canonical(TableToGeoName[row.name] || row.name);
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

  // change → recolor
  tbody.querySelectorAll("select").forEach(sel =>
    sel.addEventListener("change", paintMapsFromTable)
  );

  // hover sync table → map
  tbody.querySelectorAll("tr").forEach(tr => {
    const id = tr.dataset.norm;
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke-width", 1.6).attr("stroke", "#000");
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke-width", 0.6).attr("stroke", "#666");
    });
  });
}

/***********************
 * MAPS
 ***********************/
async function drawSubdivisionMap(svgSelector, onReady) {
  const svg = d3.select(svgSelector);
  if (svg.empty()) { console.error("[Map] SVG not found:", svgSelector); return onReady?.(); }
  svg.selectAll("*").remove();

  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");

  const nfPatternId = ensureNoForecastPattern(svg);

  try {
    const fcAll = await loadGeoJSON(SUBDIV_GEO_URLS);
    const feats = fcAll.features || [];
    if (!feats.length) { showInlineError(svg, "No features found."); return onReady?.(); }

    const NAME = pickNameKey(feats);

    // keep ONLY the 20 sub-divisions we want
    const wanted = new Set((window.subdivisions || []).map(r => canonical(r.name)));
    const features = feats.filter(f => wanted.has(canonical(f.properties?.[NAME])));

    // conic equal area (better India shape) and fit
    const projection = d3.geoConicEqualArea().parallels([12,33]).center([82.5,22]);
    const path = d3.geoPath().projection(projection);
    projection.fitSize([W - 12, H - 12], { type: "FeatureCollection", features });

    // Fills
    const fillsG = svg.append("g").attr("class", "fills");
    fillsG.selectAll("path.state")
      .data(features).enter().append("path")
      .attr("class", "state")
      .attr("d", path)
      .attr("data-name", d => d.properties?.[NAME] ?? "")
      .attr("data-norm", d => canonical(d.properties?.[NAME]))
      .attr("fill", "#e6e6e6")
      .attr("stroke", "none")
      .on("mouseenter", function (event, d) {
        const id = canonical(d.properties?.[NAME]);
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke-width", 1.6).attr("stroke", "#000");
      })
      .on("mouseleave", function (event, d) {
        const id = canonical(d.properties?.[NAME]);
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke-width", 0.6).attr("stroke", "#666");
      })
      .append("title").text(d => d.properties?.[NAME] ?? "");

    // Borders overlay
    const bordersG = svg.append("g").attr("class", "borders");
    bordersG.selectAll("path.border")
      .data(features).enter().append("path")
      .attr("class", "border")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#666")
      .attr("stroke-width", 0.6)
      .attr("pointer-events", "none")
      .attr("data-name", d => d.properties?.[NAME] ?? "")
      .attr("data-norm", d => canonical(d.properties?.[NAME]));

    svg.attr("data-nf-pattern", nfPatternId);

    onReady?.();
  } catch (e) {
    console.error("[Map] Geo load error:", e);
    showInlineError(svg, "Failed to load subdivision map data.");
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

  rows.forEach(row => {
    const id = row.dataset.norm;
    const d1 = row.querySelector("select.day1")?.value?.trim();
    const d2 = row.querySelector("select.day2")?.value?.trim();

    const isNo1 = !d1 || /select|no\s*forecast/i.test(d1);
    const isNo2 = !d2 || /select|no\s*forecast/i.test(d2);

    const c1 = isNo1 ? (patt1 ? `url(#${patt1})` : "#f2f2f2") : ((window.forecastColors || {})[d1] || "#e6e6e6");
    const c2 = isNo2 ? (patt2 ? `url(#${patt2})` : "#f2f2f2") : ((window.forecastColors || {})[d2] || "#e6e6e6");

    d3.selectAll(`#indiaSubMapDay1 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c1);
    d3.selectAll(`#indiaSubMapDay2 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c2);
  });
}

/***********************
 * INIT
 ***********************/
window.addEventListener("load", () => {
  if (typeof updateISTDate === "function") updateISTDate();

  buildSubdivisionTable();

  drawSubdivisionMap("#indiaSubMapDay1", () => {
    drawSubdivisionMap("#indiaSubMapDay2", () => {
      paintMapsFromTable(); // initial paint
    });
  });
});
