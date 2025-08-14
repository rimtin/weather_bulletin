// === Cloud Bulletin – App logic ===

// Centroids for shapes (now subdivisions); used for placing icons, etc.
window.stateCentroids = {};
// For the state forecast table (from data.js -> states)
window.actualStateList = [];

// --- Helpers ---
/** Make a safe DOM id from any label */
function toDomId(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Try to detect the subdivision name property in your GeoJSON */
function detectSubdivProp(feature) {
  const keys = Object.keys(feature.properties || {});
  const candidates = [
    "SUBDIV", "SubDiv", "subdiv",
    "SUB_DIV", "SUBDIVISION", "Subdivision", "subdivision",
    "NAME", "Name", "name", "label", "LABEL"
  ];
  return candidates.find(k => keys.includes(k)) || keys[0];
}

/** Try to detect the state name property in your GeoJSON (used only for hatch/filters) */
function detectStateProp(feature) {
  const keys = Object.keys(feature.properties || {});
  const candidates = [
    "STATE", "State", "state",
    "ST_NM", "st_nm", "STNAME", "ST_NAME"
  ];
  return candidates.find(k => keys.includes(k));
}

/**
 * Draw map (Day 1 or Day 2) from local indian_met_zones.geojson
 * svgId: "#indiaMapDay1" or "#indiaMapDay2"
 */
function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Hatch pattern (for things you want to exclude)
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

  const projection = d3.geoMercator()
    .scale(850)
    .center([89.8, 21.5])
    .translate([430, 290]);

  const path = d3.geoPath().projection(projection);

  // IMPORTANT: local file so it works on GitHub Pages
  d3.json("indian_met_zones.geojson")
    .then(fc => {
      if (!fc || !fc.features || !fc.features.length) {
        throw new Error("GeoJSON missing or empty");
      }

      const features = fc.features;
      const subdivProp = detectSubdivProp(features[0]);
      const stateProp  = detectStateProp(features[0]); // optional

      // Keep your state list for the state-level table
      const allowedStates = states.slice();
      actualStateList = allowedStates;

      // Draw polygons (subdivisions)
      svg.selectAll("path.subdivision")
        .data(features)
        .enter()
        .append("path")
        .attr("class", "state subdivision")
        .attr("d", path)
        .attr("id", d => {
          const label = d.properties[subdivProp];
          const id = toDomId(label);
          window.stateCentroids[label] = path.centroid(d);
          // Keep a quick alias for id lookup by raw label too
          window.stateCentroids[id] = window.stateCentroids[label];
          return id;
        })
        .attr("data-label", d => d.properties[subdivProp])
        .attr("data-map", svgId.replace("#", "")) // indiaMapDay1 | indiaMapDay2
        .attr("fill", d => {
          // If you want to gray/hatch items outside your state list:
          if (!stateProp) return "#ccc";
          const stName = d.properties[stateProp];
          return allowedStates.includes(stName) ? "#ccc" : "url(#diagonalHatch)";
        })
        .attr("stroke", "#333")
        .attr("stroke-width", 1)
        .on("mouseover", function () { d3.select(this).attr("stroke-width", 2.5); })
        .on("mouseout",  function () { d3.select(this).attr("stroke-width", 1); });

      // If this is the second map, we can finish wiring everything
      if (svgId === "#indiaMapDay2") {
        // Tables & sync are now created INDEPENDENT of map load,
        // but calling again is harmless (idempotent).
        initializeForecastTable();   // state-level forecast (existing)
        renderSubdivisionTable();    // subdivision list (chart-only)
        addTableHoverSync();         // bold outline on hover
        updateMapColors();           // initial colors from selects
        updateMapIcons();            // initial icons
      }
    })
    .catch(err => {
      console.error("Map loading error:", err);
      // NOTE: tables now render even if map fails
      alert("Could not load the map (network/CORS/URL). The tables still work.");
    });
}

window.drawMap = drawMap;

// === Existing state-level forecast table ===
function initializeForecastTable() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;

  // Only build once
  if (tbody.dataset.built === "1") return;
  tbody.dataset.built = "1";

  tbody.innerHTML = "";
  actualStateList.forEach((state, index) => {
    const row = document.createElement("tr");
    row.setAttribute("data-state", state);
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${state}</td>
      <td>
        <select>
          ${forecastOptions.map(opt => `<option>${opt}</option>`).join("")}
        </select>
      </td>
      <td>
        <select>
          ${forecastOptions.map(opt => `<option>${opt}</option>`).join("")}
        </select>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Attach once
  tbody.querySelectorAll("select").forEach(sel =>
    sel.addEventListener("change", updateMapColors)
  );
}

// Hover-to-highlight on the map
function addTableHoverSync() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;

  // Remove any old listeners safely
  const fresh = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(fresh, tbody);

  fresh.querySelectorAll("tr").forEach(tr => {
    const state = tr.getAttribute("data-state");
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(`[data-label][data-map='indiaMapDay1']`).filter(function() {
        // If your GeoJSON has a STATE property, this could be tighter.
        return true; // keep simple bold on hover of any subdivision
      });
      d3.selectAll(`[id='${toDomId(state)}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(`[id='${toDomId(state)}']`).attr("stroke-width", 1);
    });

    tr.querySelectorAll("select").forEach(sel =>
      sel.addEventListener("change", updateMapColors)
    );
  });
}

// Apply selected colors (kept state-level like your table)
function updateMapColors() {
  const rows = document.querySelectorAll("#forecast-table-body tr");
  rows.forEach(row => {
    const state = row.children[1]?.textContent?.trim();
    const forecast1 = row.children[2]?.querySelector("select")?.value;
    const forecast2 = row.children[3]?.querySelector("select")?.value;

    const color1 = forecastColors[forecast1] || "#ccc";
    const color2 = forecastColors[forecast2] || "#ccc";

    // Fill ALL subdivisions that belong to this state if that property exists.
    // If your GeoJSON has a STATE prop, this will color by state grouping.
    const fillByState = (mapId, color) => {
      const sel = d3.select(mapId);
      const candidates = sel.selectAll("path.subdivision");
      candidates.each(function(d) {
        const stProp = detectStateProp(d);
      });
    };

    // Fallback: color by matching id to the state name (useful if your
    // subdivision label sometimes equals the state label)
    const region1 = d3.select(`[id='${toDomId(state)}'][data-map='indiaMapDay1']`);
    const region2 = d3.select(`[id='${toDomId(state)}'][data-map='indiaMapDay2']`);

    if (!region1.empty()) region1.attr("fill", color1);
    if (!region2.empty()) region2.attr("fill", color2);
  });

  updateMapIcons();
}

// Drop simple emoji icons at centroids (still state keyed)
function updateMapIcons() {
  const iconSize = 18;
  d3.selectAll(".forecast-icon").remove();

  document.querySelectorAll("#forecast-table-body tr").forEach(row => {
    const state = row.children[1]?.textContent?.trim();
    const forecast1 = row.children[2]?.querySelector("select")?.value;
    const forecast2 = row.children[3]?.querySelector("select")?.value;

    // We kept centroids keyed by raw label and by safe id
    const coords = window.stateCentroids[state] || window.stateCentroids[toDomId(state)];
    const icon1 = forecastIcons[forecast1];
    const icon2 = forecastIcons[forecast2];

    if (coords && icon1) {
      d3.select("#indiaMapDay1")
        .append("text")
        .attr("class", "forecast-icon")
        .attr("x", coords[0])
        .attr("y", coords[1])
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("font-size", iconSize)
        .text(icon1);
    }

    if (coords && icon2) {
      d3.select("#indiaMapDay2")
        .append("text")
        .attr("class", "forecast-icon")
        .attr("x", coords[0])
        .attr("y", coords[1])
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("font-size", iconSize)
        .text(icon2);
    }
  });
}

// Subdivision table (read‑only list right now)
function renderSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;

  // Only build once
  if (tbody.dataset.built === "1") return;
  tbody.dataset.built = "1";

  tbody.innerHTML = "";
  let serial = 1;
  states.forEach(state => {
    const rows = (window.subdivisions || []).filter(s => s.state === state);
    rows.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${serial++}</td>
        <td>${state}</td>
        <td>${row.subNo}</td>
        <td>${row.name}</td>
        <td contenteditable="true"></td>
      `;
      tbody.appendChild(tr);
    });
  });
}

// === Init ===
// Create tables immediately (so they show even if the map fails),
// then draw both maps.
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();

  initializeForecastTable();
  renderSubdivisionTable();
  addTableHoverSync();

  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
