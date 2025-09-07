
// =============== CONFIG (sub-division GeoJSON) ===============
const SUBDIV_GEO_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

// =============== HELPERS ===============
const W = 860, H = 580;           // canonical drawing size
const PAD = 18;                   // padding inside the viewBox
const SCALE_BOOST = 1.10;         // 1.00=fit exactly, >1 zoom in slightly

const cssEscape = s =>
  (window.CSS && CSS.escape) ? CSS.escape(String(s ?? "")) :
  String(s ?? "").replace(/'/g,"\\'").replace(/"/g,'\\"');

function canonical(input) {
  return String(input || "")
    .replace(/[\u2010-\u2015]/g, "-")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim()
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
    } catch (e) { console.warn("[GeoJSON] failed:", u, e); lastErr = e; }
  }
  throw lastErr || new Error("All URLs failed");
}

function featuresNearIndia(features) {
  const LON_MIN = 60, LON_MAX = 100, LAT_MIN = -5, LAT_MAX = 40;
  return features.filter(f => {
    try {
      const [lon, lat] = d3.geoCentroid(f);
      return lon >= LON_MIN && lon <= LON_MAX && lat >= LAT_MIN && lat <= LAT_MAX;
    } catch { return false; }
  });
}

// Make sure the SVG cannot collapse (this was the “5×580” issue).
function ensureSvgSize(svg) {
  svg.attr("viewBox", `0 0 ${W} ${H}`)
     .attr("preserveAspectRatio", "xMidYMid meet");
  const bb = svg.node().getBoundingClientRect();
  if (bb.width < W * 0.8 || bb.height < H * 0.8) {
    svg.attr("width", W).attr("height", H)
       .style("width", W + "px").style("height", H + "px");
  }
}

// Hatch pattern used to represent “No Forecast”
function ensureNoForecastPattern(svg) {
  const id = (svg.attr("id") || "map") + "_noForecast";
  let defs = svg.select("defs");
  if (defs.empty()) defs = svg.append("defs");
  if (svg.select("#" + cssEscape(id)).empty()) {
    const p = defs.append("pattern")
      .attr("id", id).attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8).attr("height", 8)
      .attr("patternTransform", "rotate(45)");
    p.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#f2f2f2");
    p.append("path").attr("d", "M 0 0 L 0 8").attr("stroke", "#999").attr("stroke-width", 1);
  }
  svg.attr("data-nf-pattern", id);
  return id;
}

// =============== TABLE (unchanged wiring) ===============
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

// =============== MAPS ===============
async function drawSubdivisionMap(svgSelector, onReady) {
  const svg = d3.select(svgSelector);
  if (svg.empty()) return onReady?.();
  svg.selectAll("*").remove();

  ensureSvgSize(svg);
  const nfId = ensureNoForecastPattern(svg);

  try {
    const fc = await loadGeoJSON(SUBDIV_GEO_URLS);
    const features = fc.features || [];
    if (!features.length) return onReady?.();

    const NAME = pickNameKey(features);

    // Projection & fit (no “donut”; centered; predictable zoom)
    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);

    const near = featuresNearIndia(features);
    const fitFC = { type: "FeatureCollection", features: near.length ? near : features };
    projection
      .fitExtent([[PAD, PAD], [W - PAD, H - PAD]], fitFC)
      .scale(projection.scale() * SCALE_BOOST)
      .translate([W / 2, H / 2]);

    // Fills
    svg.append("g").attr("class", "fills")
      .selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class", "state")
      .attr("d", path)
      .attr("fill-rule", "evenodd")
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
      })
      .append("title")
      .text(d => d.properties?.[NAME] ?? "");

    // Borders
    svg.append("g").attr("class", "borders")
      .selectAll("path.border")
      .data(features)
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

    onReady?.();
  } catch (e) {
    console.error("[Map] load error:", e);
    svg.append("text").attr("x", 20).attr("y", 40).attr("fill", "#b00")
      .text("Failed to load subdivision map data.");
    onReady?.();
  }
}

// =============== COLORS FROM TABLE ===============
function paintMapsFromTable() {
  const rows = document.querySelectorAll("#subdivision-table-body tr");
  const patt1 = document.getElementById("indiaSubMapDay1")?.getAttribute("data-nf-pattern");
  const patt2 = document.getElementById("indiaSubMapDay2")?.getAttribute("data-nf-pattern");
  const colors = window.forecastColors || {};

  rows.forEach(row => {
    const id = row.dataset.norm;
    const v1 = row.querySelector("select.day1")?.value?.trim() || "";
    const v2 = row.querySelector("select.day2")?.value?.trim() || "";

    const no1 = /no\s*forecast/i.test(v1);
    const no2 = /no\s*forecast/i.test(v2);

    const c1 = no1 ? (patt1 ? `url(#${patt1})` : "#f2f2f2") : (colors[v1] || "#e6e6e6");
    const c2 = no2 ? (patt2 ? `url(#${patt2})` : "#f2f2f2") : (colors[v2] || "#e6e6e6");

    d3.selectAll(`#indiaSubMapDay1 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c1);
    d3.selectAll(`#indiaSubMapDay2 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c2);
  });
}

// =============== INIT ===============
window.addEventListener("unhandledrejection", e => {
  console.error("[Global] Unhandled promise:", e.reason || e);
});

window.addEventListener("load", () => {
  if (typeof updateISTDate === "function") updateISTDate();

  buildSubdivisionTable();

  // draw both maps, then do an initial color paint
  drawSubdivisionMap("#indiaSubMapDay1", () => {
    drawSubdivisionMap("#indiaSubMapDay2", () => {
      paintMapsFromTable();
    });
  });

  // If layout changes collapse the SVG, redraw with a guaranteed size
  window.addEventListener("resize", () => {
    drawSubdivisionMap("#indiaSubMapDay1", () => {
      drawSubdivisionMap("#indiaSubMapDay2", paintMapsFromTable);
    });
  });
});

