/* =======================
   Cloud Bulletin – per‑Subdivision maps
   Loads local indian_met_zones.geojson, auto‑detects property names,
   and colors polygons by per‑subdivision Day‑1/Day‑2 table selections.
   ======================= */

// ---------- Small utilities ----------
const norm = s => (s || "").toString().toLowerCase().replace(/[^a-z0-9]+/g, "");
const pickProp = (obj, keys) => { for (const k of keys) if (obj && obj[k] != null) return k; return null; };

// Where we keep polygon centroids to drop emoji icons later
let SUBDIV_CENTROIDS = new Map();

// A best‑guess mapping from your table labels → common IMD subdivision labels
// (Edit the right‑hand values if your GeoJSON uses slightly different names)
const NAME_MAP = new Map([
  ["W-Raj", "West Rajasthan"],
  ["E-Raj", "East Rajasthan"],
  ["W-Gujarat (Saurashtra & Kachh)", "Saurashtra & Kachh"],
  ["E-Gujarat Region", "Gujarat region"],
  ["W-UP", "West Uttar Pradesh"],
  ["E-UP", "East Uttar Pradesh"],
  ["W-MP", "West Madhya Pradesh"],
  ["E-MP", "East Madhya Pradesh"],
  ["Madhya -MH", "Madhya Maharashtra"],
  ["North-Karnataka", "N.I. Karnataka"],
  ["South- Karnataka", "S.I. Karnataka"],
  ["SW-AP (Rayalaseema)", "Rayalaseema"],
  ["Andhra Pradesh", "Coastal Andhra Pradesh"],
  ["Tamil Nadu", "Tamil Nadu & Puducherry"],

  // direct passthroughs
  ["Punjab","Punjab"],
  ["Chhattisgarh","Chhattisgarh"],
  ["Marathwada","Marathwada"],
  ["Vidarbha","Vidarbha"],
  ["Telangana","Telangana"]
]);

// This tells us which property names to try when sniffing your GeoJSON
const SUBDIV_CANDIDATES = ["SUBDIV","SubDiv","Subdivision","SUBDIVISION","NAME","name","label","LABEL"];
const STATE_CANDIDATES  = ["STATE","STATE_UT","State","STATEUT","STATE_NAME","st_nm","ST_NM","stname","STNAME"];

// ---------- Table builders (per‑subdivision controls) ----------
function buildSubdivisionControlTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;
  if (tbody.dataset.built === "1") return; // only build once

  tbody.dataset.built = "1";
  tbody.innerHTML = "";

  let serial = 1;
  states.forEach(state => {
    const rows = (window.subdivisions || []).filter(s => s.state === state);
    rows.forEach(row => {
      const rawLabel = row.name;
      const mappedLabel = NAME_MAP.get(rawLabel) || rawLabel;
      const subKey = norm(mappedLabel);

      const tr = document.createElement("tr");
      tr.setAttribute("data-subkey", subKey);
      tr.setAttribute("data-raw", rawLabel);     // what table shows
      tr.setAttribute("data-mapped", mappedLabel); // what map uses
      tr.innerHTML = `
        <td>${serial++}</td>
        <td>${state}</td>
        <td>${row.subNo}</td>
        <td>${rawLabel}</td>
        <td><select class="sel-day1">${Object.keys(forecastColors).map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="sel-day2">${Object.keys(forecastColors).map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td contenteditable="true"></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // Change listeners
  tbody.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", () => {
      applyColorsFromTable();
      stampIconsFromTable();
    });
  });

  // Hover highlight
  tbody.querySelectorAll("tr").forEach(tr => {
    const key = tr.getAttribute("data-subkey");
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(`[data-subkey='${CSS.escape(key)}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(`[data-subkey='${CSS.escape(key)}']`).attr("stroke-width", 1);
    });
  });
}

// ---------- Map drawing ----------
async function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Load local GeoJSON from repo root
  let geo = null;
  const candidates = ["indian_met_zones.geojson", "indian_met_zones (1).geojson"];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) { geo = await res.json(); break; }
    } catch (_) {}
  }
  if (!geo || !geo.features) {
    warn("Could not load indian_met_zones.geojson. Make sure it’s next to index.html.");
    return;
  }

  // Auto‑detect subdivision/state property keys
  const sampleProps = (geo.features[0] || {}).properties || {};
  const SUBDIV_PROP = pickProp(sampleProps, SUBDIV_CANDIDATES) || Object.keys(sampleProps)[0];
  const STATE_PROP  = pickProp(sampleProps, STATE_CANDIDATES); // may be null
  console.log("[Map] Using properties:", { SUBDIV_PROP, STATE_PROP });

  // Fit projection to your file
  const box = svg.node().getBoundingClientRect();
  const size = [Math.max(720, box.width || 720), 520];
  const projection = d3.geoMercator().fitSize(size, geo);
  const path = d3.geoPath().projection(projection);

  // Build features array with normalized keys
  SUBDIV_CENTROIDS = new Map();
  const feats = geo.features.map(f => {
    const p = f.properties || {};
    const subdiv = (p[SUBDIV_PROP] ?? "").toString();
    const mapped = NAME_MAP.get(subdiv) || subdiv; // if your file already matches, this is a no‑op
    const key = norm(mapped);
    const state = STATE_PROP ? (p[STATE_PROP] ?? "").toString() : "";
    return { f, subdiv, mapped, key, state };
  });

  // Draw polygons
  svg.selectAll("path.subdiv")
    .data(feats)
    .enter()
    .append("path")
    .attr("class", "subdiv")
    .attr("data-map", svgId.replace("#",""))      // indiaMapDay1 | indiaMapDay2
    .attr("data-subdiv", d => d.subdiv)           // label from file
    .attr("data-mapped", d => d.mapped)           // label we use after mapping
    .attr("data-state",  d => d.state)
    .attr("data-subkey", d => d.key)              // normalized id
    .attr("d", d => path(d.f))
    .attr("fill", "#ccc")
    .attr("stroke", "#333")
    .attr("stroke-width", 1)
    .on("mouseover", function(){ d3.select(this).attr("stroke-width", 2.5); })
    .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 1);  })
    .each(d => { SUBDIV_CENTROIDS.set(d.key, path.centroid(d.f)); });

  // After Day 2 is drawn, ensure colors/icons reflect current table
  if (svgId === "#indiaMapDay2") {
    applyColorsFromTable();
    stampIconsFromTable();
  }
}

// ---------- Update coloring/icons from per‑subdivision table ----------
function applyColorsFromTable() {
  // Reset to neutral first
  d3.selectAll("#indiaMapDay1 .subdiv, #indiaMapDay2 .subdiv").attr("fill","#ccc");

  document.querySelectorAll("#subdivision-table-body tr").forEach(tr => {
    const key = tr.getAttribute("data-subkey");
    const day1 = tr.querySelector(".sel-day1")?.value;
    const day2 = tr.querySelector(".sel-day2")?.value;
    const c1 = forecastColors[day1] || "#ccc";
    const c2 = forecastColors[day2] || "#ccc";

    d3.selectAll(`#indiaMapDay1 [data-subkey='${CSS.escape(key)}']`).attr("fill", c1);
    d3.selectAll(`#indiaMapDay2 [data-subkey='${CSS.escape(key)}']`).attr("fill", c2);
  });
}

function stampIconsFromTable() {
  d3.selectAll(".forecast-icon").remove();
  const size = 16;

  document.querySelectorAll("#subdivision-table-body tr").forEach(tr => {
    const key = tr.getAttribute("data-subkey");
    const d1 = tr.querySelector(".sel-day1")?.value;
    const d2 = tr.querySelector(".sel-day2")?.value;
    const i1 = forecastIcons[d1];
    const i2 = forecastIcons[d2];
    const c  = SUBDIV_CENTROIDS.get(key);
    if (!c) return;

    if (i1) {
      d3.select("#indiaMapDay1")
        .append("text").attr("class","forecast-icon")
        .attr("x", c[0]).attr("y", c[1])
        .attr("text-anchor","middle").attr("alignment-baseline","middle")
        .attr("font-size", size).text(i1);
    }
    if (i2) {
      d3.select("#indiaMapDay2")
        .append("text").attr("class","forecast-icon")
        .attr("x", c[0]).attr("y", c[1])
        .attr("text-anchor","middle").attr("alignment-baseline","middle")
        .attr("font-size", size).text(i2);
    }
  });
}

// ---------- Light banner for problems ----------
function warn(msg){
  let el = document.getElementById("warn-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "warn-banner";
    el.style.cssText = "margin:10px 0;padding:8px 10px;border:1px solid #e6a23c;background:#fff7e6;color:#8a5a00;border-radius:6px;";
    const container = document.querySelector(".container") || document.body;
    container.prepend(el);
  }
  el.textContent = msg;
}

// ---------- Init ----------
window.addEventListener("DOMContentLoaded", () => {
  // Date stamp
  if (typeof updateISTDate === "function") updateISTDate();

  // Build the per‑subdivision controls immediately (independent of map load)
  buildSubdivisionControlTable();

  // Draw maps
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
});
