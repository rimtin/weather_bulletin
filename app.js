// === App logic (single table -> single map by sub-division) ===

// Cache centroids by GeoJSON sub-division id
window.subdivCentroids = {};

// IMPORTANT: If your GeoJSON uses a different property for the sub-division name,
// update GEO_NAME_PROP below (common: "name", "SUBDIV", "sub_name", etc.)
const GEO_NAME_PROP = "name"; // <-- change if needed

// Map your table labels to exact GeoJSON feature names
// This covers your requested splits and common IMD naming differences.
const TableToGeoName = {
  // Direct matches (keep as-is when identical)
  "Punjab": "Punjab",
  "Chhattisgarh": "Chhattisgarh",
  "Telangana": "Telangana",
  "Tamil Nadu": "Tamil Nadu",

  // Rajasthan
  "West Rajasthan": "West Rajasthan",
  "East Rajasthan": "East Rajasthan",

  // Gujarat (IMD names: "Saurashtra & Kutch" and "Gujarat Region")
  "West Gujarat": "Saurashtra & Kutch",
  "East Gujarat Region": "Gujarat Region",

  // Uttar Pradesh
  "West Uttar Pradesh": "West Uttar Pradesh",
  "East Uttar Pradesh": "East Uttar Pradesh",

  // Madhya Pradesh
  "West Madhya Pradesh": "West Madhya Pradesh",
  "East Madhya Pradesh": "East Madhya Pradesh",

  // Maharashtra (IMD names: "Madhya Maharashtra", "Marathwada", "Vidarbha")
  "Madhya_MH": "Madhya Maharashtra",
  "Marathwada": "Marathwada",
  "Vidarbha": "Vidarbha",

  // Andhra Pradesh (IMD names: "Coastal Andhra Pradesh" and "Rayalaseema")
  "Andhra Pradesh": "Coastal Andhra Pradesh",
  "SW-AP (Rayalaseema)": "Rayalaseema",

  // Karnataka (IMD names: "North Interior Karnataka", "South Interior Karnataka")
  "North Karnataka": "North Interior Karnataka",
  "South Karnataka": "South Interior Karnataka"
};

/** Draw India sub-division map into #indiaSubdivMap */
function drawSubdivisionMap() {
  const svg = d3.select("#indiaSubdivMap");
  svg.selectAll("*").remove();

  // Pattern for "no forecast"
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

  // Load local sub-division GeoJSON
  d3.json("indian_met_zones.geojson")
    .then(geo => {
      const features = geo.type === "Topology"
        ? topojson.feature(geo, Object.values(geo.objects)[0]).features
        : geo.features;

      svg.selectAll("path.state")
        .data(features)
        .enter()
        .append("path")
        .attr("class", "state")
        .attr("d", path)
        .attr("id", d => {
          const nm = d.properties[GEO_NAME_PROP];
          const c = path.centroid(d);
          window.subdivCentroids[nm] = c;
          return nm;
        })
        .attr("fill", "#ccc")
        .attr("stroke", "#333")
        .attr("stroke-width", 1)
        .on("mouseover", function () { d3.select(this).attr("stroke-width", 2.5); })
        .on("mouseout", function () { d3.select(this).attr("stroke-width", 1); });

      // After map draws, build table + bind hover + paint
      buildSubdivisionTable();
      bindTableHover();
      paintMapFromTable();
    })
    .catch(err => {
      console.error("Map loading error:", err);
      alert("Could not load indian_met_zones.geojson. Check the filename/path and the name property.");
    });
}

/** Build the single Sub Division table (Column B drives the map) */
function buildSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  let serial = 1;
  subdivisions.forEach(row => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-state", row.state);
    tr.setAttribute("data-subdiv", row.name);

    tr.innerHTML = `
      <td>${serial++}</td> 
      <td>
        <select>
          ${forecastOptions.map(opt => `<option>${opt}</option>`).join("")}
        </select>
      </td>
      <td>${row.state}</td>
      <td>${row.name}</td>
      <td contenteditable="true"></td>
    `;
    tbody.appendChild(tr);
  });

  // change -> repaint
  tbody.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", paintMapFromTable);
  });
}

/** Hover a table row -> bold the matching feature */
function bindTableHover() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;

  const clone = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(clone, tbody);

  clone.querySelectorAll("tr").forEach(tr => {
    const sub = tr.getAttribute("data-subdiv");
    const geoName = TableToGeoName[sub] || sub;
    tr.addEventListener("mouseenter", () => {
      d3.select(`#indiaSubdivMap [id='${cssEscape(geoName)}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.select(`#indiaSubdivMap [id='${cssEscape(geoName)}']`).attr("stroke-width", 1);
    });

    // keep onchange after cloning
    tr.querySelectorAll("select").forEach(sel => {
      sel.addEventListener("change", paintMapFromTable);
    });
  });
}

/** Apply colors to the map from Column B (forecast) of the table */
function paintMapFromTable() {
  const rows = document.querySelectorAll("#subdivision-table-body tr");

  rows.forEach(row => {
    const subdivLabel = row.getAttribute("data-subdiv");     // table subdivision (Column D)
    const forecastVal = row.children[1]?.querySelector("select")?.value; // Column B
    const color = forecastColors[forecastVal] || "#ccc";

    const geoName = TableToGeoName[subdivLabel] || subdivLabel;
    const sel = d3.select(`#indiaSubdivMap [id='${cssEscape(geoName)}']`);
    if (!sel.empty()) {
      sel.attr("fill", color);
    }
  });
}

/** Safe id selection for names containing spaces & special chars */
function cssEscape(str) {
  // minimal escape for attribute equals selector
  return String(str).replace(/'/g, "\\'");
}

// === Init ===
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawSubdivisionMap();
};
