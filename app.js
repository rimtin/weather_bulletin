// === Sub-Division-only app logic, stacked layout ===

// Global stores (per day map)
window.subdivCentroids = {};   // { "#indiaMapDay1": { "Subdiv Name": [x,y], ... }, ... }

// Layout
const W = 860, H = 580;
const PAD = 18;
const SCALE_BOOST = 1.10;

// Helpers
const cssEscape = s =>
  (window.CSS && CSS.escape) ? CSS.escape(String(s ?? "")) :
  String(s ?? "").replace(/'/g,"\\'").replace(/\"/g,'\\\"');

function normalizeName(name) {
  return String(name || "").trim().toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/&/g, "and");
}
function getProp(obj, keys) {
  if (!obj) return "";
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]);
  }
  return "";
}
function getStateName(props) {
  return getProp(props, ["ST_NM", "st_nm", "STATE", "STATE_UT", "NAME_1", "state_name", "State"]);
}
function getSubdivName(props) {
  // Adjust keys if your file uses a different label
  return getProp(props, ["SUBDIV", "SUBDIV_NAME", "subdivision", "SUBDIVISION", "NAME_2", "name", "Name"]);
}

// Try a list of possible sub-division files (local → GitHub → CDN)
const SUBDIV_GEO_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "weather_bulletin/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

async function fetchFirst(urls) {
  for (const url of urls) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) continue;
      const data = await resp.json();
      return data;
    } catch(e) { /* try next */ }
  }
  throw new Error("Could not load any sub-division GeoJSON URLs");
}

// Draw sub-division map into #indiaMapDay1 or #indiaMapDay2
async function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Hatch for excluded
  const defs = svg.append("defs");
  defs.append("pattern")
    .attr("id", "diagonalHatch")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6)
    .attr("height", 6)
    .append("path")
    .attr("d", "M0,0 l6,6")
    .attr("stroke", "#999")
    .attr("stroke-width", 1);

  // Load sub-divisions
  let features = [];
  try {
    const geo = await fetchFirst(SUBDIV_GEO_URLS);
    features = geo.features || [];
  } catch (err) {
    alert("Could not load sub-division map data.");
    console.error(err);
    return;
  }

  // Projection fit
  const projection = d3.geoMercator();
  const path = d3.geoPath(projection);
  const bounds = d3.geoBounds({ type: "FeatureCollection", features });
  const [[minX, minY], [maxX, maxY]] = bounds;
  const width = maxX - minX, height = maxY - minY;
  const scale = Math.min((W - PAD*2)/width, (H - PAD*2)/height) * 150 * SCALE_BOOST;

  projection
    .scale(scale)
    .center([(minX + maxX)/2, (minY + maxY)/2])
    .translate([W/2, H/2]);

  // Allowed sub-divisions (from table list)
  const allowed = new Set((window.subdivisions || []).map(s => normalizeName(s.name)));

  // Draw
  svg.append("g")
    .attr("class", "subdivs")
    .selectAll("path")
    .data(features)
    .join("path")
    .attr("class", "subdiv")
    .attr("data-subdiv", d => getSubdivName(d.properties))
    .attr("data-state",  d => getStateName(d.properties))
    .attr("id", d => "sd-" + normalizeName(getSubdivName(d.properties)).replace(/[^a-z0-9]+/g, "-"))
    .attr("d", path)
    .attr("fill", d => {
      const nm = normalizeName(getSubdivName(d.properties));
      return allowed.has(nm) ? "#eee" : "url(#diagonalHatch)";
    })
    .on("mouseover", function() { d3.select(this).raise(); });

  // Centroids for icons
  window.subdivCentroids[svgId] = {};
  features.forEach(f => {
    const n = getSubdivName(f.properties);
    window.subdivCentroids[svgId][n] = path.centroid(f);
  });

  // After second map is drawn, init once
  if (svgId === "#indiaMapDay2") {
    buildLegendFromPalette();
    initializeForecastTable();
    updateMapColors();
  }
}

// (Optional) build palette -> can be used later if you add a legend
function buildLegendFromPalette() {
  // Intentionally left (no legend in this vertical layout)
}

// === TABLES (Sub-division controls) ===
function initializeForecastTable() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const options = (window.forecastOptions || []);
  let idx = 1;

  (window.subdivisions || []).forEach(row => {
    const tr = document.createElement("tr");

    // Day dropdowns
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
      <td>${row.state}</td>
      <td>${row.name}</td>
    `;
    const td1 = document.createElement("td");
    const td2 = document.createElement("td");
    td1.appendChild(sel1);
    td2.appendChild(sel2);
    tr.appendChild(td1);
    tr.appendChild(td2);

    // Hover highlight on both maps
    tr.addEventListener("mouseenter", () => highlightSubdiv(row.name, true));
    tr.addEventListener("mouseleave", () => highlightSubdiv(row.name, false));

    tbody.appendChild(tr);
  });
}

function highlightSubdiv(subdivName, on) {
  const safe = cssEscape(subdivName);
  ["#indiaMapDay1", "#indiaMapDay2"].forEach(svgId => {
    const node = document.querySelector(`${svgId} .subdiv[data-subdiv="${safe}"]`);
    if (!node) return;
    node.style.strokeWidth = on ? "2.0px" : "";
    node.style.filter = on ? "drop-shadow(0 0 4px rgba(0,0,0,0.4))" : "";
  });
}

// Recolor maps + place icons by sub-division
function updateMapColors() {
  const rows = Array.from(document.querySelectorAll("#forecast-table-body tr"));
  const bySubdiv = {};
  rows.forEach(tr => {
    const subdiv = tr.children[2]?.textContent?.trim();      // 0:SNo 1:State 2:SubDiv 3:Day1 4:Day2
    const day1 = tr.children[3]?.querySelector("select")?.value || null;
    const day2 = tr.children[4]?.querySelector("select")?.value || null;
    if (!subdiv) return;
    bySubdiv[subdiv] = { day1, day2 };
  });

  const pal = window.forecastColors || {};
  ["#indiaMapDay1", "#indiaMapDay2"].forEach((svgId, idx) => {
    const dayKey = idx === 0 ? "day1" : "day2";
    d3.select(svgId).selectAll(".subdiv").attr("fill", function() {
      const labelName = this.getAttribute("data-subdiv") || "";
      if (!(labelName in bySubdiv)) return "url(#diagonalHatch)"; // excluded
      const label = bySubdiv[labelName][dayKey];
      return pal[label] || "#eee";
    });
  });

  updateMapIcons(bySubdiv);
}

// Emoji overlay per sub-division centroid
function updateMapIcons(bySubdiv) {
  const icons = window.forecastIcons || {};
  const size = 18;

  ["#indiaMapDay1", "#indiaMapDay2"].forEach((svgId, idx) => {
    const dayKey = idx === 0 ? "day1" : "day2";
    const svg = d3.select(svgId);
    svg.selectAll(".map-icon").remove();

    const cents = window.subdivCentroids[svgId] || {};
    Object.entries(bySubdiv).forEach(([subdiv, vals]) => {
      const icon = icons[vals[dayKey]];
      if (!icon) return;
      const pos = cents[subdiv];
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

// === Init ===
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
