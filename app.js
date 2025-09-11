
// === App logic for forecast ===

// Global stores
window.stateCentroids = {};   // computed on draw (per svgId)
window.actualStateList = [];  // from data.js -> states

// Map layout helpers
const W = 860, H = 580;
const PAD = 18;
const SCALE_BOOST = 1.10;

// Escape for CSS selectors/IDs
const cssEscape = s =>
  (window.CSS && CSS.escape) ? CSS.escape(String(s ?? "")) :
  String(s ?? "").replace(/'/g,"\\'").replace(/\"/g,'\\\"');

// Simple name normalizer (handles minor variants)
function normalizeName(name) {
  return String(name || "").trim().toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/&/g, "and");
}

// Try a list of possible data URLs; resolve first that succeeds
async function fetchFirst(urls) {
  for (const url of urls) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) continue;
      const data = await resp.json();
      return { data, url };
    } catch(e) { /* try next */ }
  }
  throw new Error("Could not load any GeoJSON/TopoJSON URLs");
}

// Candidate state-boundary URLs
const STATE_GEO_URLS = [
  "https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/india.geojson",
  "https://raw.githubusercontent.com/markmarkoh/datamaps/master/src/js/data/india.topo.json"
];

// Draw India map into a given SVG element.
// svgId: "#indiaMapDay1" or "#indiaMapDay2"
async function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Define hatch pattern for excluded/no-forecast
  const defs = svg.append("defs");
  const pat = defs.append("pattern")
    .attr("id", "diagonalHatch")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6)
    .attr("height", 6);
  pat.append("path")
    .attr("d", "M0,0 l6,6")
    .attr("stroke", "#999")
    .attr("stroke-width", 1);

  // Fetch data (GeoJSON or TopoJSON)
  let features = null;
  try {
    const { data } = await fetchFirst(STATE_GEO_URLS);
    if (data.type === "Topology") {
      const key = Object.keys(data.objects)[0];
      features = topojson.feature(data, data.objects[key]).features;
    } else {
      features = data.features;
    }
  } catch (err) {
    alert("Could not load map data. Please check network or URL list.");
    console.error(err);
    return;
  }

  // Projection fit (rough but effective)
  const projection = d3.geoMercator();
  const path = d3.geoPath(projection);

  const bounds = d3.geoBounds({ type: "FeatureCollection", features });
  const [[minX, minY], [maxX, maxY]] = bounds;
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = Math.min(
    (W - PAD * 2) / width,
    (H - PAD * 2) / height
  ) * 150 * SCALE_BOOST;

  projection
    .scale(scale)
    .center([(minX + maxX)/2, (minY + maxY)/2])
    .translate([W/2, H/2]);

  // Build a set for quick check of allowed states (from data.js)
  const allowed = new Set((window.states || []).map(s => normalizeName(s)));
  window.actualStateList = (window.states || []).slice();

  const g = svg.append("g").attr("class", "states");

  // Draw states
  g.selectAll("path")
    .data(features)
    .join("path")
    .attr("class", "state")
    .attr("data-name", d => (d.properties && (d.properties.ST_NM || d.properties.st_nm || d.properties.NAME_1 || d.properties.name)) || "")
    .attr("id",      d => {
      const nm = (d.properties && (d.properties.ST_NM || d.properties.st_nm || d.properties.NAME_1 || d.properties.name)) || "";
      return "st-" + normalizeName(nm).replace(/[^a-z0-9]+/g, "-");
    })
    .attr("d", path)
    .attr("fill", d => {
      const nmRaw = (d.properties && (d.properties.ST_NM || d.properties.st_nm || d.properties.NAME_1 || d.properties.name)) || "";
      const nm = normalizeName(nmRaw);
      // Default fill = hatch if not in allowed list
      if (!allowed.has(nm)) return "url(#diagonalHatch)";
      return "#eee"; // recolored by updateMapColors()
    })
    .on("mouseover", function() {
      d3.select(this).raise();
    });

  // Save centroids for icons (per svgId)
  window.stateCentroids[svgId] = {};
  features.forEach(f => {
    const name = (f.properties && (f.properties.ST_NM || f.properties.st_nm || f.properties.NAME_1 || f.properties.name)) || "";
    const c = path.centroid(f);
    window.stateCentroids[svgId][name] = c;
  });

  // After both maps draw, init tables & bind once
  if (svgId === "#indiaMapDay2") {
    if (typeof initializeForecastTable === "function") initializeForecastTable();
    if (typeof renderSubdivisionTable === "function") renderSubdivisionTable();
    if (typeof buildLegendFromPalette === "function") buildLegendFromPalette();
    if (typeof updateMapColors === "function") updateMapColors();
  }
}

// Build legend entries dynamically from forecastColors
function buildLegendFromPalette() {
  const ul = document.getElementById("legendList");
  if (!ul) return;
  ul.innerHTML = "";
  const palette = window.forecastColors || {};
  for (const [label, color] of Object.entries(palette)) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="legend-swatch" style="background:${color}"></span> ${label}`;
    ul.appendChild(li);
  }
}

// === TABLES ===

// State forecast table (drives map colors)
function initializeForecastTable() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const options = (window.forecastOptions || []);
  let idx = 1;

  (window.states || []).forEach(stateName => {
    const tr = document.createElement("tr");

    const sel1 = document.createElement("select");
    const sel2 = document.createElement("select");
    [sel1, sel2].forEach(sel => {
      options.forEach(opt => {
        const o = document.createElement("option");
        o.value = opt; o.textContent = opt;
        sel.appendChild(o);
      });
      sel.addEventListener("change", updateMapColors);
    });

    tr.innerHTML = `
      <td>${idx++}</td>
      <td>${stateName}</td>
    `;
    const td1 = document.createElement("td");
    const td2 = document.createElement("td");
    td1.appendChild(sel1);
    td2.appendChild(sel2);
    tr.appendChild(td1);
    tr.appendChild(td2);

    // Hover sync (highlight state on both maps)
    tr.addEventListener("mouseenter", () => highlightState(stateName, true));
    tr.addEventListener("mouseleave", () => highlightState(stateName, false));

    tbody.appendChild(tr);
  });
}

// Highlight by *state* name across both maps
function highlightState(stateName, on) {
  ["#indiaMapDay1", "#indiaMapDay2"].forEach(svgId => {
    const node = document.querySelector(
      `${svgId} .state[data-name="${cssEscape(stateName)}"]`
    );
    if (!node) return;
    node.style.strokeWidth = on ? "2.0px" : "";
    node.style.filter = on ? "drop-shadow(0 0 4px rgba(0,0,0,0.4))" : "";
  });
}

// Map recoloring + icons based on table selections
function updateMapColors() {
  const rows = Array.from(document.querySelectorAll("#forecast-table-body tr"));

  // Build a map: StateName -> { day1: label, day2: label }
  const byState = {};
  rows.forEach(tr => {
    const state = tr.children[1]?.textContent?.trim();
    const day1 = tr.children[2]?.querySelector("select")?.value || null;
    const day2 = tr.children[3]?.querySelector("select")?.value || null;
    if (!state) return;
    byState[state] = { day1, day2 };
  });

  // Apply fills
  const pal = window.forecastColors || {};
  ["#indiaMapDay1", "#indiaMapDay2"].forEach((svgId, idx) => {
    const dayKey = idx === 0 ? "day1" : "day2";
    d3.select(svgId).selectAll(".state").attr("fill", function() {
      const stateName = this.getAttribute("data-name") || "";
      // If this state isn't in the 'states' allowlist, keep hatch
      if (!new Set((window.states||[]).map(s=>normalizeName(s))).has(normalizeName(stateName))) {
        return "url(#diagonalHatch)";
      }
      const match = byState[stateName] || {};
      const label = match[dayKey];
      return pal[label] || "#eee";
    });
  });

  updateMapIcons(byState);
}

// Emoji icon overlay
function updateMapIcons(byState) {
  const icons = window.forecastIcons || {};
  const size = 18;

  ["#indiaMapDay1", "#indiaMapDay2"].forEach((svgId, idx) => {
    const dayKey = idx === 0 ? "day1" : "day2";
    const svg = d3.select(svgId);
    svg.selectAll(".map-icon").remove();

    const cents = window.stateCentroids[svgId] || {};
    Object.entries(byState).forEach(([state, vals]) => {
      const icon = icons[vals[dayKey]];
      if (!icon) return;
      const pos = cents[state];
      if (!pos) return;

      svg.append("text")
        .attr("class", "map-icon")
        .attr("x", pos[0])
        .attr("y", pos[1])
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("font-size", size)
        .text(icon);
    });
  });
}

// Subdivision (display) table
function renderSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  let i = 1;
  (window.subdivisions || []).forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i++}</td>
      <td>${row.state}</td>
      <td>${row.subNo}</td>
      <td>${row.name}</td>
      <td contenteditable="true"></td>
    `;
    tbody.appendChild(tr);
  });
}

// === Init ===
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
