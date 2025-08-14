// === App logic for forecast (Subdivision map from local GeoJSON) ===

// Average centroid per STATE (for icons)
window.stateCentroids = {};
// We'll store the states used for the table (comes from data.js -> states)
window.actualStateList = [];

// ---- helpers ----
const pickExistingKey = (obj, keys) => {
  for (const k of keys) if (obj && k in obj) return k;
  return null;
};

const SUBDIV_KEYS = ["SUBDIV","SubDiv","Subdivision","SUBDIVISION","NAME","name","label","LABEL"];
const STATE_KEYS  = ["STATE","STATE_UT","State","STATEUT","STATE_NAME","st_nm","ST_NM","stname","STNAME"];

// ---- MAIN: draw a map into an SVG ----
// svgId: "#indiaMapDay1" or "#indiaMapDay2"
function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Hatch pattern (for states we don't use — currently unused but kept for parity)
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

  // Load your local subdivisions GeoJSON
  const GEOJSON_PATH = "weather_bulletin/indian_met_zones.geojson";

  d3.json(GEOJSON_PATH)
    .then(fc => {
      if (!fc || !fc.features || !fc.features.length) {
        throw new Error("GeoJSON missing or empty");
      }

      // Detect property names
      const sampleProps = (fc.features[0] || {}).properties || {};
      const SUBDIV_PROP = pickExistingKey(sampleProps, SUBDIV_KEYS) || Object.keys(sampleProps)[0];
      const STATE_PROP  = pickExistingKey(sampleProps, STATE_KEYS);
      if (!STATE_PROP) console.warn("[Map] Could not find a STATE property; coloring-by-state may fail.");

      // Projection fit to file
      const box = svg.node().getBoundingClientRect();
      const size = [Math.max(520, box.width || 520), 220];
      const projection = d3.geoMercator().fitSize(size, fc);
      const path = d3.geoPath().projection(projection);

      // Use the list from data.js; it already excludes Bihar
      const allowedStates = states.slice();
      actualStateList = allowedStates;

      // Collect centroids per state (average of its subdivisions)
      const stateSum = {}; // { state: {x,y,count} }

      // Draw subdivisions
      svg.selectAll("path.subdiv")
        .data(fc.features)
        .enter()
        .append("path")
        .attr("class", "state subdiv")
        .attr("d", d => path(d))
        .attr("data-map", svgId.replace("#", "")) // indiaMapDay1 | indiaMapDay2
        .attr("data-state", d => {
          const st = (d.properties?.[STATE_PROP] ?? "").toString();
          return st;
        })
        .attr("data-subdiv", d => (d.properties?.[SUBDIV_PROP] ?? "").toString())
        .attr("fill", "#ccc")
        .attr("stroke", "#333")
        .attr("stroke-width", 1)
        .on("mouseover", function () { d3.select(this).attr("stroke-width", 2.5); })
        .on("mouseout",  function () { d3.select(this).attr("stroke-width", 1); });

      // Compute average centroid per state
      fc.features.forEach(f => {
        const st = (f.properties?.[STATE_PROP] ?? "").toString();
        if (!st) return;
        const c = path.centroid(f);
        if (!c || !isFinite(c[0]) || !isFinite(c[1])) return;
        if (!stateSum[st]) stateSum[st] = { x: 0, y: 0, n: 0 };
        stateSum[st].x += c[0];
        stateSum[st].y += c[1];
        stateSum[st].n += 1;
      });

      window.stateCentroids = {};
      Object.keys(stateSum).forEach(st => {
        const s = stateSum[st];
        window.stateCentroids[st] = [s.x / s.n, s.y / s.n];
      });

      // After both maps draw, build tables + sync + set initial fills
      if (svgId === "#indiaMapDay2") {
        initializeForecastTable();   // state table with Day1/Day2
        renderSubdivisionTable();    // chart-only subdivision table
        addTableHoverSync();         // hover a state row -> highlight its polygons
        updateMapColors();           // set initial fills from default selects
        updateMapIcons();            // set initial icons at averaged state centroids
      }
    })
    .catch(err => {
      console.error("Map loading error:", err);
      alert("Could not load map from weather_bulletin/indian_met_zones.geojson. Check the path/case.");
    });
}

window.drawMap = drawMap;

// ---- Build the Day1/Day2 forecast dropdown table (by STATE) ----
function initializeForecastTable() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;

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

  // onchange listeners
  tbody.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", () => {
      updateMapColors();
      updateMapIcons();
    });
  });
}

// ---- Sync table row hover with map (bold outlines on both maps) ----
function addTableHoverSync() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;

  // reset listeners safely
  const fresh = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(fresh, tbody);

  fresh.querySelectorAll("tr").forEach(tr => {
    const state = tr.getAttribute("data-state");
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(`[data-state='${CSS.escape(state)}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(`[data-state='${CSS.escape(state)}']`).attr("stroke-width", 1);
    });

    tr.querySelectorAll("select").forEach(sel => {
      sel.addEventListener("change", () => {
        updateMapColors();
        updateMapIcons();
      });
    });
  });
}

// ---- Color all subdivisions of a state on both maps ----
function updateMapColors() {
  const rows = document.querySelectorAll("#forecast-table-body tr");
  rows.forEach(row => {
    const state = row.getAttribute("data-state") || row.children[1]?.textContent?.trim();
    const forecast1 = row.children[2]?.querySelector("select")?.value;
    const forecast2 = row.children[3]?.querySelector("select")?.value;

    const color1 = forecastColors[forecast1] || "#ccc";
    const color2 = forecastColors[forecast2] || "#ccc";

    const sel1 = d3.selectAll(`#indiaMapDay1 [data-state='${CSS.escape(state)}']`);
    const sel2 = d3.selectAll(`#indiaMapDay2 [data-state='${CSS.escape(state)}']`);

    sel1.attr("fill", color1);
    sel2.attr("fill", color2);
  });

  updateMapIcons();
}

// ---- Put simple emoji icons at each state's averaged centroid ----
function updateMapIcons() {
  const iconSize = 18;
  d3.selectAll(".forecast-icon").remove();

  document.querySelectorAll("#forecast-table-body tr").forEach(row => {
    const state = row.getAttribute("data-state") || row.children[1]?.textContent?.trim();
    const forecast1 = row.children[2]?.querySelector("select")?.value;
    const forecast2 = row.children[3]?.querySelector("select")?.value;

    const coords = window.stateCentroids[state];
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

// ---- Render the Subdivision (chart) table under the main forecast table ----
function renderSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  // Keep order grouped by main 'states' list
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
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
