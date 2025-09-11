// === Sub-Division app logic (always-visible maps) ===

// Per-map centroid store
window.subdivCentroids = {};

// Layout
const W = 860, H = 580;
const PAD = 18;

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
  for (const k of keys) if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]);
  return "";
}
function getStateName(props) {
  return getProp(props, ["ST_NM","st_nm","STATE","STATE_UT","NAME_1","state_name","State"]);
}
function getSubdivName(props) {
  // Add/adjust keys if your file is different
  return getProp(props, [
    "SUBDIV","SUBDIV_NAME","SUBDIVISION","SubDiv","SUBDIV_N",
    "NAME_2","name","Name","Division","DIVISION","SUB_DIV"
  ]);
}

// Preferred sub-division file locations (first that loads is used)
const SUBDIV_GEO_URLS = [
  // If index.html and the .geojson are in the same folder, this one will hit:
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
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const data = await r.json();
      console.log("[Map] Loaded:", url);
      return data;
    } catch (e) {
      console.warn("[Map] Failed:", url, e);
    }
  }
  throw new Error("Could not load any sub-division GeoJSON URLs");
}

function pickProjectionFor(fc) {
  // Detect if coordinates look like lon/lat or projected meters.
  // If width/height >> typical lon/lat span, assume projected and use Identity.
  const [[minX, minY], [maxX, maxY]] = d3.geoBounds(fc);
  const width = maxX - minX;
  const height = maxY - minY;

  // Heuristic thresholds (lon/lat for India is roughly 65..98, 6..37)
  const looksLikeLonLat = width < 200 && height < 120 && minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;

  if (looksLikeLonLat) {
    return d3.geoMercator().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], fc);
  } else {
    // For projected CRS, draw in screen space using Identity (flip Y)
    return d3.geoIdentity().reflectY(true).fitExtent([[PAD, PAD], [W - PAD, H - PAD]], fc);
  }
}

// Draw sub-division map into #indiaMapDay1 or #indiaMapDay2
async function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Hatch fill for excluded
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

  // Load geometry
  let features = [];
  try {
    const geo = await fetchFirst(SUBDIV_GEO_URLS);
    if (geo.type === "Topology") {
      const key = Object.keys(geo.objects)[0];
      features = topojson.feature(geo, geo.objects[key]).features;
    } else {
      features = geo.features || [];
    }
  } catch (err) {
    alert("Could not load sub-division map data.");
    console.error(err);
    return;
  }
  if (!features.length) {
    alert("Sub-division file loaded but had 0 features.");
    return;
  }

  const fc = { type: "FeatureCollection", features };
  const projection = pickProjectionFor(fc);
  const path = d3.geoPath(projection);

  // Allowed sub-divisions = those listed in the table
  const allowSet = new Set((window.subdivisions || []).map(s => normalizeName(s.name)));

  // Draw shapes
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
    .attr("fill", d => allowSet.has(normalizeName(getSubdivName(d.properties))) ? "#eee" : "url(#diagonalHatch)")
    .on("mouseover", function() { d3.select(this).raise(); });

  // Centroids for icons
  window.subdivCentroids[svgId] = {};
  features.forEach(f => {
    const n = getSubdivName(f.properties);
    window.subdivCentroids[svgId][n] = path.centroid(f);
  });

  // After the second map, initialize UI once
  if (svgId === "#indiaMapDay2") {
    initializeForecastTable();
    updateMapColors();
  }
}

// === TABLE (Sub-division controls) ===
function initializeForecastTable() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const options = (window.forecastOptions || []);
  let idx = 1;

  (window.subdivisions || []).forEach(row => {
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
      <td>${row.state}</td>
      <td>${row.name}</td>
    `;
    const td1 = document.createElement("td");
    const td2 = document.createElement("td");
    td1.appendChild(sel1);
    td2.appendChild(sel2);
    tr.appendChild(td1);
    tr.appendChild(td2);

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
    node.style.strokeWidth = on ? "2px" : "";
    node.style.filter = on ? "drop-shadow(0 0 4px rgba(0,0,0,0.4))" : "";
  });
}

// Recolor maps + place icons by sub-division
function updateMapColors() {
  const rows = Array.from(document.querySelectorAll("#forecast-table-body tr"));
  const bySubdiv = {};
  rows.forEach(tr => {
    const subdiv = tr.children[2]?.textContent?.trim(); // 0:SNo 1:State 2:SubDiv 3:Day1 4:Day2
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
