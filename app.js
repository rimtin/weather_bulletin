// === App logic for forecast (Subdivision map from local GeoJSON at repo root) ===
<h3>Forecast (by State)</h3>
<table class="forecast-table">
  <thead>
    <tr>
      <th>S. No.</th>
      <th>State</th>
      <th>Day 1</th>
      <th>Day 2</th>
    </tr>
  </thead>
  <tbody id="forecast-table-body"></tbody>
</table>

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

  // (hatch pattern kept for “no forecast” style if you want later)
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

  // 1) Your GeoJSON is in the repo root:
  const GEOJSON_PATH = "indian_met_zones.geojson";

  d3.json(GEOJSON_PATH)
    .then(raw => {
      // 2) Be tolerant to different shapes (FeatureCollection or array)
      const fc = (raw && raw.type === "FeatureCollection")
        ? raw
        : { type: "FeatureCollection", features: (raw?.features || raw || []) };

      if (!fc || !fc.features || !fc.features.length) {
        throw new Error("GeoJSON missing or empty");
      }

      // 3) Detect property names automatically
      const sampleProps = (fc.features[0] || {}).properties || {};
      const SUBDIV_PROP = pickExistingKey(sampleProps, SUBDIV_KEYS) || Object.keys(sampleProps)[0];
      const STATE_PROP  = pickExistingKey(sampleProps, STATE_KEYS);
      if (!STATE_PROP) console.warn("[Map] Could not find a STATE property; coloring-by-state may fail.");

      // 4) Fit to the SVG (use full height = 520 as in CSS)
      const box = svg.node().getBoundingClientRect();
      const size = [Math.max(520, box.width || 520), 520];
      const projection = d3.geoMercator().fitSize(size, fc);
      const path = d3.geoPath().projection(projection);

      // List from data.js (Bihar already excluded there)
      const allowedStates = states.slice();
      actualStateList = allowedStates;

      // Collect average centroid per state (for icons)
      const stateSum = {};

      // Draw polygons
      svg.selectAll("path.subdiv")
        .data(fc.features)
        .enter()
        .append("path")
        .attr("class", "state subdiv")
        .attr("d", d => path(d))
        .attr("data-map", svgId.replace("#", "")) // indiaMapDay1 | indiaMapDay2
        .attr("data-state", d => (d.properties?.[STATE_PROP] ?? "").toString())
        .attr("data-subdiv", d => (d.properties?.[SUBDIV_PROP] ?? "").toString())
        .attr("fill", "#eee")
        .attr("stroke", "#333")
        .attr("stroke-width", 1)
        .on("mouseover", function () { d3.select(this).attr("stroke-width", 2.5); })
        .on("mouseout",  function () { d3.select(this).attr("stroke-width", 1); });

      // Compute centroids per state
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

      // After both maps draw, build tables + sync + initial fill
      if (svgId === "#indiaMapDay2") {
        initializeForecastTable();   // main state table with Day1/Day2
        renderSubdivisionTable();    // chart-only subdivision table
        addTableHoverSync();         // hover a state row -> highlight its polygons
        updateMapColors();           // set initial fills
        updateMapIcons();            // drop icons at centroids
      }
    })
    .catch(err => {
      console.error("Map loading error:", err);
      alert("Could not load ./indian_met_zones.geojson. Check the file name/case in the repo.");
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

    const color1 = forecastColors[forecast1] || "#eee";
    const color2 = forecastColors[forecast2] || "#eee";

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

// ---- Render the Subdivision (chart) table ----
function renderSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;

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
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};

  // Index features by normalized subdivision name
  featuresByKey.clear();
  geoFC.features.forEach(f => {
    const key = normalize(f.properties[SUBDIV_PROP]);
    if (!featuresByKey.has(key)) featuresByKey.set(key, []);
    featuresByKey.get(key).push(f);
  });

  // Build table + draw maps
  buildSubdivisionTable();
  drawMap("#indiaMapDay1", 0);
  drawMap("#indiaMapDay2", 1);

  // Any change should repaint
  document.getElementById("subdivision-table-body")
    .addEventListener("change", repaintMaps);
}

// GO
window.onload = init;
