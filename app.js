// === App logic for forecast ===

// Centroids for each state, computed when we draw the maps
window.stateCentroids = {};
// We'll store the states used for the table (comes from data.js -> states)
window.actualStateList = [];

/** Draw India map into a given SVG element (#indiaMapDay1 | #indiaMapDay2) */
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

  // ✅ FIX: correct TopoJSON URL (no /refs/heads/)
  const topoURL = "https://raw.githubusercontent.com/udit-001/india-maps-data/main/topojson/india.json";

  d3.json(topoURL)
    .then(data => {
      const features = topojson.feature(data, data.objects["states"]).features;
      const nameProp = "st_nm";

      const allowedStates = states.slice();
      actualStateList = allowedStates;

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
        .on("mouseout",  function () { d3.select(this).attr("stroke-width", 1); });

      // If this is the second map, set initial colors/icons
      if (svgId === "#indiaMapDay2") {
        updateMapColors();
        updateMapIcons();
      }
    })
    .catch(err => {
      console.error("Map loading error:", err);
      // Still allow the page to be usable
      alert("Could not load the map (network/CORS/URL). The tables still work.");
    });
}
window.drawMap = drawMap;

/** Build the Day1/Day2 forecast dropdown table — render regardless of map status */
function initializeForecastTable() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  actualStateList = states.slice(); // ensure it’s set even if map failed
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

  addTableHoverSync();
  updateMapColors();
  updateMapIcons();

  // onchange listeners
  tbody.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", () => {
      updateMapColors();
      updateMapIcons();
    });
  });
}

/** Sync table row hover with map: bold the state outline on both maps */
function addTableHoverSync() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;

  tbody.querySelectorAll("tr").forEach(tr => {
    const state = tr.getAttribute("data-state");
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(`[id='${state}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(`[id='${state}']`).attr("stroke-width", 1);
    });
  });
}

/** Apply selected colors to states on Day 1 and Day 2 maps */
function updateMapColors() {
  const rows = document.querySelectorAll("#forecast-table-body tr");
  rows.forEach(row => {
    const state = row.children[1]?.textContent?.trim();
    const forecast1 = row.children[2]?.querySelector("select")?.value;
    const forecast2 = row.children[3]?.querySelector("select")?.value;

    const color1 = forecastColors[forecast1] || "#ccc";
    const color2 = forecastColors[forecast2] || "#ccc";

    const region1 = d3.select(`[id='${state}'][data-map='indiaMapDay1']`);
    const region2 = d3.select(`[id='${state}'][data-map='indiaMapDay2']`);

    if (!region1.empty()) region1.attr("fill", color1);
    if (!region2.empty()) region2.attr("fill", color2);
  });
}

/** Drop simple emoji icons at each state's centroid for both days */
function updateMapIcons() {
  const iconSize = 18;
  d3.selectAll(".forecast-icon").remove();

  document.querySelectorAll("#forecast-table-body tr").forEach(row => {
    const state = row.children[1]?.textContent?.trim();
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

/** Render the Subdivision (chart) table under the main forecast table */
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

/** PDF download */
function downloadPDF() {
  const element = document.getElementById("pdf-area");
  if (!element) { alert("PDF container not found!"); return; }
  const opt = {
    margin: 0.3,
    filename: "Cloud_Forecast_Bulletin.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
    jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] }
  };
  html2pdf().set(opt).from(element).save();
}

// === Init ===
window.addEventListener("DOMContentLoaded", () => {
  if (typeof updateISTDate === "function") updateISTDate();

  // Build tables immediately (independent of the map)
  initializeForecastTable();
  renderSubdivisionTable();

  // Draw maps (if the fetch fails, the rest of the page still works)
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");

  // Hook up the button
  const btn = document.getElementById("downloadBtn");
  if (btn) btn.addEventListener("click", downloadPDF);
});
