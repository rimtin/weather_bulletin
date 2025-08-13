// === Per‑Subdivision Forecast Maps ===

// Centroids for each subdivision (by normalized key)
window.subdivCentroids = {};

// Normalizer for IDs / matching
const norm = s => (s || "").toString().toLowerCase().replace(/[^a-z0-9]+/g, "");

// Safely pick the first existing property name
const pickProp = (obj, keys) => {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return undefined;
};

// Draw a GeoJSON of IMD sub‑divisions into a given SVG
async function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Pattern (kept for future “no forecast” handling)
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

  // Try both file names (place the file next to index.html)
  const candidates = ["indian_met_zones.geojson", "indian_met_zones (1).geojson"];
  let geojson = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) { geojson = await res.json(); break; }
    } catch (_) {}
  }

  if (!geojson || !geojson.features) {
    console.error("GeoJSON not found: indian_met_zones.geojson");
    alert("Place indian_met_zones.geojson in the project root (same folder as index.html).");
    return;
  }

  // Projection fit to the GeoJSON bbox
  const size = [720, 520];
  const projection = d3.geoMercator().fitSize(size, geojson);
  const path = d3.geoPath().projection(projection);

  // Common property names in IMD subdivision files
  const SUBDIV_KEYS = ["SUBDIV", "SubDiv", "Subdivision", "SUBDIVISION", "NAME", "name"];
  const STATE_KEYS  = ["STATE", "STATE_UT", "State", "STATEUT", "STATE_NAME", "st_nm"];

  // Convert features, compute centroid map
  const feats = geojson.features.map(f => {
    const p = f.properties || {};
    const subdiv = pickProp(p, SUBDIV_KEYS) || "";
    const state  = pickProp(p, STATE_KEYS)  || "";
    const subKey = norm(subdiv);
    return { f, subdiv, state, subKey };
  });

  // Draw polygons
  svg.selectAll("path.subdiv")
    .data(feats)
    .enter()
    .append("path")
    .attr("class", "subdiv")
    .attr("data-map", svgId.replace("#",""))    // indiaMapDay1 | indiaMapDay2
    .attr("data-subkey", d => d.subKey)        // normalized key
    .attr("data-state", d => d.state)          // state name (raw)
    .attr("data-subdiv", d => d.subdiv)        // subdiv name (raw)
    .attr("d", d => path(d.f))
    .attr("fill", "#ccc")
    .attr("stroke", "#333")
    .attr("stroke-width", 1)
    .on("mouseover", function(){ d3.select(this).attr("stroke-width", 2.5); })
    .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 1);  })
    .each(d => { window.subdivCentroids[d.subKey] = path.centroid(d.f); });

  // After Day 2 is drawn, build the per‑subdivision table + wire events
  if (svgId === "#indiaMapDay2") {
    buildSubdivisionControlTable(); // adds Day1/Day2 selects per row
    addSubdivisionHoverSync();      // hover row -> highlight polygons
    updateMapColorsFromSubdivisionControls(); // set initial fills
    updateMapIconsFromSubdivisionControls();  // set initial icons
  }
}

window.drawMap = drawMap;

/* ---------- Table: Per‑Subdivision Controls ---------- */
function buildSubdivisionControlTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  let serial = 1;

  // Keep grouped by states list
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

  // Changes re-color the maps + icons
  tbody.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", () => {
      updateMapColorsFromSubdivisionControls();
      updateMapIconsFromSubdivisionControls();
    });
  });
}

/* ---------- Hover sync: row <-> polygons ---------- */
function addSubdivisionHoverSync() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;

  // Reset listeners safely
  const fresh = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(fresh, tbody);

  // Re‑attach change events after cloning
  fresh.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", () => {
      updateMapColorsFromSubdivisionControls();
      updateMapIconsFromSubdivisionControls();
    });
  });

  fresh.querySelectorAll("tr").forEach(tr => {
    const subKey = tr.getAttribute("data-subkey");
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(`[data-subkey='${CSS.escape(subKey)}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(`[data-subkey='${CSS.escape(subKey)}']`).attr("stroke-width", 1);
    });
  });
}

/* ---------- Apply colors from table to both maps ---------- */
function updateMapColorsFromSubdivisionControls() {
  // Reset to neutral first
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

/* ---------- Emoji icons from table selections ---------- */
function updateMapIconsFromSubdivisionControls() {
  d3.selectAll(".forecast-icon").remove();
  const iconSize = 16;

  document.querySelectorAll("#subdivision-table-body tr").forEach(tr => {
    const subKey = tr.getAttribute("data-subkey");
    const day1 = tr.querySelector(".sel-day1")?.value;
    const day2 = tr.querySelector(".sel-day2")?.value;

    const icon1 = forecastIcons[day1];
    const icon2 = forecastIcons[day2];
    const c = window.subdivCentroids[subKey];

    if (c && icon1) {
      d3.select("#indiaMapDay1")
        .append("text")
        .attr("class", "forecast-icon")
        .attr("x", c[0])
        .attr("y", c[1])
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("font-size", iconSize)
        .text(icon1);
    }
    if (c && icon2) {
      d3.select("#indiaMapDay2")
        .append("text")
        .attr("class", "forecast-icon")
        .attr("x", c[0])
        .attr("y", c[1])
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("font-size", iconSize)
        .text(icon2);
    }
  });
}

/* ---------- Init ---------- */
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
