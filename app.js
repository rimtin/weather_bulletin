// === App logic for forecast ===

// Centroids for each state, computed when we draw the maps
window.stateCentroids = {};
// We'll store the states used for the table (comes from data.js -> states)
window.actualStateList = [];

/**
 * Draw India map into a given SVG element.
 * svgId: "#indiaMapDay1" or "#indiaMapDay2"
 */
function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Pattern for states we don't forecast (hatch)
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

  // Load India states TopoJSON (public source)
  d3.json("https://raw.githubusercontent.com/udit-001/india-maps-data/refs/heads/main/topojson/india.json")
    .then(data => {
      const features = topojson.feature(data, data.objects["states"]).features;
      const nameProp = "st_nm";

      // Use the list from data.js; it already excludes Bihar
      const allowedStates = states.slice();
      actualStateList = allowedStates;

      // Draw states
      svg.selectAll("path.state")
        .data(features)
        .enter()
        .append("path")
        .attr("class", "state")
        .attr("d", path)
        .attr("id", d => {
          const stateName = d.properties[nameProp];
          const centroid = path.centroid(d);
          window.stateCentroids[stateName] = centroid;
          return stateName;
        })
        .attr("data-map", svgId.replace("#", "")) // indiaMapDay1 | indiaMapDay2
        .attr("fill", d => {
          const stateName = d.properties[nameProp];
          return allowedStates.includes(stateName) ? "#ccc" : "url(#diagonalHatch)";
        })
        .attr("stroke", "#333")
        .attr("stroke-width", 1)
        .on("mouseover", function () { d3.select(this).attr("stroke-width", 2.5); })
        .on("mouseout", function () { d3.select(this).attr("stroke-width", 1); });

      // After both maps draw, build tables + sync
      if (svgId === "#indiaMapDay2") {
        initializeForecastTable();
        renderSubdivisionTable();    // chart-only subdivision table
        addTableHoverSync();         // hover a row -> highlight map state
        updateMapColors();           // set initial fills from default selects
        updateMapIcons();            // set initial icons
      }
    })
    .catch(err => {
      console.error("Map loading error:", err);
      alert("Could not load map. Please check the TopoJSON path or object key.");
    });
}

window.drawMap = drawMap;

/** Build the Day1/Day2 forecast dropdown table */
function initializeForecastTable() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  actualStateList.forEach((state, index) => {
    const row = document.createElement("tr");
    row.setAttribute("data-state", state);
    row.innerHTML = `
      <td>${index + 1}</td>          <!-- A: S.No. -->
      <td>${state}</td>              <!-- B: State -->
      <td>                           <!-- D: Day 1 (controls first map) -->
        <select onchange="updateMapColors()">
          ${forecastOptions.map(opt => `<option>${opt}</option>`).join("")}
        </select>
      </td>
      <td>                           <!-- E: Day 2 (controls second map) -->
        <select onchange="updateMapColors()">
          ${forecastOptions.map(opt => `<option>${opt}</option>`).join("")}
        </select>
      </td>
    `;
    tbody.appendChild(row);
  });
}

/** Sync table row hover with map: bold the state outline on both maps */
function addTableHoverSync() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;

  // Clear previous listeners by cloning (safe reset)
  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);

  newTbody.querySelectorAll("tr").forEach(tr => {
    const state = tr.getAttribute("data-state");
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(`[id='${state}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(`[id='${state}']`).attr("stroke-width", 1);
    });

    // keep onchange on selects after cloning
    tr.querySelectorAll("select").forEach(sel => {
      sel.addEventListener("change", updateMapColors);
    });
  });
}

/**
 * Apply selected colors to states on both maps.
 * IMPORTANT: Column mapping (as requested):
 *  - Column B = State name (row.children[1])
 *  - Column D = Day 1 value (row.children[2])  -> first map (#indiaMapDay1)
 *  - Column E = Day 2 value (row.children[3])  -> second map (#indiaMapDay2)
 */
function updateMapColors() {
  const rows = document.querySelectorAll("#forecast-table-body tr");
  rows.forEach(row => {
    const state = row.children[1]?.textContent?.trim(); // B
    const forecastDay1 = row.children[2]?.querySelector("select")?.value; // D
    const forecastDay2 = row.children[3]?.querySelector("select")?.value; // E

    const color1 = forecastColors[forecastDay1] || "#ccc";
    const color2 = forecastColors[forecastDay2] || "#ccc";

    // First map (Day 1) uses B + D
    const region1 = d3.select(`[id='${state}'][data-map='indiaMapDay1']`);
    if (!region1.empty()) region1.attr("fill", color1);

    // Second map (Day 2) uses B + E
    const region2 = d3.select(`[id='${state}'][data-map='indiaMapDay2']`);
    if (!region2.empty()) region2.attr("fill", color2);
  });

  updateMapIcons();
}

/** Drop simple emoji icons at each state's centroid for both days */
function updateMapIcons() {
  const iconSize = 18;

  // Clear old icons
  d3.selectAll(".forecast-icon").remove();

  document.querySelectorAll("#forecast-table-body tr").forEach(row => {
    const state = row.children[1]?.textContent?.trim(); // B
    const forecast1 = row.children[2]?.querySelector("select")?.value; // D
    const forecast2 = row.children[3]?.querySelector("select")?.value; // E

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

/** Render the Subdivision (chart) table under the main forecast table */
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
