// ---- Per‑Subdivision control + maps, using local indian_met_zones.geojson ----

// Normalizer for safe IDs / CSS matching
const norm = s => (s || "").toString().toLowerCase().replace(/[^a-z0-9]+/g, "");

// Safely pick the first existing property name from a list
const pickProp = (obj, keys) => {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return undefined;
};

// Store subdivision centroids for icon placement
window.subdivCentroids = {};

// Build the per‑subdivision table
function buildSubdivisionControlTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  let serial = 1;

  // Keep grouped by states list (visual clarity)
  states.forEach(state => {
    const rows = (window.subdivisions || []).filter(s => s.state === state);
    rows.forEach(row => {
      const subKey = norm(row.name);
      const tr = document.createElement("tr");
      tr.setAttribute("data-subkey", subKey);
      tr.setAttribute("data-state", state);
      tr.innerHTML = `
        <td>${serial++}</td>
        <td>${state}</td>
        <td>${row.subNo}</td>
        <td>${row.name}</td>
        <td>
          <select class="sel-day1">
            ${forecastOptions.map(opt => `<option>${opt}</option>`).join("")}
          </select>
        </td>
        <td>
          <select class="sel-day2">
            ${forecastOptions.map(opt => `<option>${opt}</option>`).join("")}
          </select>
        </td>
        <td contenteditable="true"></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // Changes recolor the maps + icons
  tbody.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", () => {
      updateMapColorsFromTable();
      updateMapIconsFromTable();
    });
  });

  // Hover sync (bold polygon)
  tbody.querySelectorAll("tr").forEach(tr => {
    const subKey = tr.getAttribute("data-subkey");
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(`[data-subkey='${CSS.escape(subKey)}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(`[data-subkey='${CSS.escape(subKey)}']`).attr("stroke-width", 1);
    });
  });
}

// Draw IMD sub‑division GeoJSON into a given SVG
async function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Try both filenames in your repo root
  const candidates = ["indian_met_zones.geojson"];
  let geojson = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) { geojson = await res.json(); break; }
    } catch (_) {}
  }

  if (!geojson || !geojson.features) {
    console.error("Could not load indian_met_zones.geojson");
    alert("Place indian_met_zones.geojson in the same folder as index.html.");
    return;
  }

  // Projection (auto‑fit to your file’s bounds)
  const size = [720, 520];
  const projection = d3.geoMercator().fitSize(size, geojson);
  const path = d3.geoPath().projection(projection);

  // Property keys commonly used in IMD subdivision files
  const SUBDIV_KEYS = ["SUBDIV", "SubDiv", "Subdivision", "SUBDIVISION", "NAME", "name"];
  const STATE_KEYS  = ["STATE", "STATE_UT", "State", "STATEUT", "STATE_NAME", "st_nm"];

  // Convert features & compute centroids
  const feats = geojson.features.map(f => {
    const p = f.properties || {};
    const subdiv = pickProp(p, SUBDIV_KEYS) || "";
    const state  = pickProp(p, STATE_KEYS)  || "";
    const subKey = norm(subdiv);
    return { f, subdiv, state, subKey };
  });

  svg.selectAll("path.subdiv")
    .data(feats)
    .enter()
    .append("path")
    .attr("class", "subdiv")
    .attr("data-map", svgId.replace("#", "")) // indiaMapDay1 | indiaMapDay2
    .attr("data-subkey", d => d.subKey)      // normalized key
    .attr("data-state", d => d.state)        // raw state name
    .attr("data-subdiv", d => d.subdiv)      // raw subdiv name
    .attr("d", d => path(d.f))
    .attr("fill", "#ccc")
    .attr("stroke", "#333")
    .attr("stroke-width", 1)
    .each(d => { window.subdivCentroids[d.subKey] = path.centroid(d.f); })
    .on("mouseover", function(){ d3.select(this).attr("stroke-width", 2.5); })
    .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 1);  });

  // After second map is drawn, make sure initial colors/icons are in place
  if (svgId === "#indiaMapDay2") {
    updateMapColorsFromTable();
    updateMapIconsFromTable();
  }
}

// Apply colors from per‑subdivision table to both maps
function updateMapColorsFromTable() {
  // Neutral first
  d3.selectAll("#indiaMapDay1 .subdiv, #indiaMapDay2 .subdiv").attr("fill", "#ccc");

  document.querySelectorAll("#subdivision-table-body tr").forEach(tr => {
    const subKey = tr.getAttribute("data-subkey");
    const day1 = tr.querySelector(".sel-day1")?.value;
    const day2 = tr.querySelector(".sel-day2")?.value;

    const color1 = forecastColors[day1] || "#ccc";
    const color2 = forecastColors[day2] || "#ccc";

    d3.selectAll(`#indiaMapDay1 [data-subkey='${CSS.escape(subKey)}']`).attr("fill", color1);
    d3.selectAll(`#indiaMapDay2 [data-subkey='${CSS.escape(subKey)}']`).attr("fill", color2);
  });
}

// Place emoji at each subdivision centroid based on selections
function updateMapIconsFromTable() {
  d3.selectAll(".forecast-icon").remove();
  const iconSize = 16;

  document.querySelectorAll("#subdivision-table-body tr").forEach(tr => {
    const subKey = tr.getAttribute("data-subkey");
    const day1   = tr.querySelector(".sel-day1")?.value;
    const day2   = tr.querySelector(".sel-day2")?.value;

    const icon1 = forecastIcons[day1];
    const icon2 = forecastIcons[day2];
    const c = window.subdivCentroids[subKey];

    if (c && icon1) {
      d3.select("#indiaMapDay1")
        .append("text")
        .attr("class", "forecast-icon")
        .attr("x", c[0]).attr("y", c[1])
        .attr("text-anchor", "middle").attr("alignment-baseline", "middle")
        .attr("font-size", iconSize)
        .text(icon1);
    }
    if (c && icon2) {
      d3.select("#indiaMapDay2")
        .append("text")
        .attr("class", "forecast-icon")
        .attr("x", c[0]).attr("y", c[1])
        .attr("text-anchor", "middle").attr("alignment-baseline", "middle")
        .attr("font-size", iconSize)
        .text(icon2);
    }
  });
}

// Init
window.addEventListener("DOMContentLoaded", () => {
  if (typeof updateISTDate === "function") updateISTDate();
  buildSubdivisionControlTable();      // table should appear even if map fails
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
});
