// ------------------------------
// CONFIG
// ------------------------------

// 1) Put your online (GeoJSON OR TopoJSON) URL here:
const SUBDIV_GEO_URL =
  "https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/india.geojson";
// ^ Replace with your sub-division file if different

// 2) Map table labels -> exact feature names in the GeoJSON
//    (Edit if your online file uses slightly different naming.)
const TableToGeoName = {
  // Punjab / Telangana / TN / Chhattisgarh
  "Punjab": "Punjab",
  "Telangana": "Telangana",
  "Tamil Nadu": "Tamil Nadu",
  "Chhattisgarh": "Chhattisgarh",

  // Rajasthan
  "W-Raj": "West Rajasthan",
  "E-Raj": "East Rajasthan",

  // Gujarat
  "W-Gujarat (Saurashtra & Kachh)": "Saurashtra & Kutch",
  "E-Gujarat Region": "Gujarat Region",

  // Uttar Pradesh
  "W-UP": "West Uttar Pradesh",
  "E-UP": "East Uttar Pradesh",

  // Madhya Pradesh
  "W-MP": "West Madhya Pradesh",
  "E-MP": "East Madhya Pradesh",

  // Maharashtra
  "Madhya -MH": "Madhya Maharashtra",
  "Marathwada": "Marathwada",
  "Vidarbha": "Vidarbha",

  // Andhra Pradesh
  "Andhra Pradesh": "Coastal Andhra Pradesh",
  "SW-AP (Rayalaseema)": "Rayalaseema",

  // Karnataka
  "North-Karnataka": "North Interior Karnataka",
  "South- Karnataka": "South Interior Karnataka"
};

// ------------------------------
// HELPERS
// ------------------------------

// Try to find the best property in a feature that looks like a name field
function detectNameProp(props) {
  if (!props) return "name";
  const cand = Object.keys(props);
  // Sort preferred keys first
  const pref = ["name", "NAME_1", "SUBDIV", "sub_name", "st_nm", "st_name", "NAME"];
  for (const p of pref) if (p in props) return p;
  // Fallback to something that contains 'name'
  const guessed = cand.find(k => /name/i.test(k));
  return guessed || "name";
}

// Safely escape ids in CSS attribute selectors
function cssEscape(str) {
  return String(str).replace(/'/g, "\\'");
}

// Given a raw (geo|topo)json, return {features, nameProp}
function normalizeToFeatures(raw) {
  if (!raw) return { features: [], nameProp: "name" };
  if (raw.type === "Topology") {
    const obj = Object.values(raw.objects)[0];
    const features = topojson.feature(raw, obj).features || [];
    const nameProp = features.length ? detectNameProp(features[0].properties) : "name";
    return { features, nameProp };
  }
  // GeoJSON
  const features = raw.features || [];
  const nameProp = features.length ? detectNameProp(features[0].properties) : "name";
  return { features, nameProp };
}

// ------------------------------
// BUILD THE ONE TABLE (exact layout as your sheet)
// Columns: S.No | State | Sub Division | No. Solar Site | Day 1 | Day 2
// State cells are merged with rowspan.
// ------------------------------
function buildSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;

  // Ensure the header has Day 1 and Day 2 columns (append if missing)
  const thead = document.querySelector("#subdivision-table thead tr");
  if (thead && thead.children.length < 6) {
    const thDay1 = document.createElement("th");
    thDay1.textContent = "Day 1";
    const thDay2 = document.createElement("th");
    thDay2.textContent = "Day 2";
    thead.appendChild(thDay1);
    thead.appendChild(thDay2);
  }

  tbody.innerHTML = "";

  // Group by state to compute rowspans like in your image
  const groups = {};
  (window.subdivisions || []).forEach(r => {
    groups[r.state] = groups[r.state] || [];
    groups[r.state].push(r);
  });

  let serial = 1;
  Object.keys(groups).forEach(state => {
    const rows = groups[state];
    rows.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-state", state);
      tr.setAttribute("data-subdiv", row.name);

      // Build HTML for the row
      const cells = [];
      // S.No
      cells.push(`<td>${serial++}</td>`);
      // State (rowspan on first row only)
      if (idx === 0) {
        cells.push(`<td class="state-cell" rowspan="${rows.length}">${state}</td>`);
      }
      // Sub Division (Column C in your image)
      cells.push(`<td>${row.name}</td>`);
      // No. Solar Site (editable)
      cells.push(`<td contenteditable="true"></td>`);
      // Day 1 (Column E)
      cells.push(`
        <td>
          <select class="day1">
            ${forecastOptions.map(o => `<option>${o}</option>`).join("")}
          </select>
        </td>
      `);
      // Day 2 (Column F)
      cells.push(`
        <td>
          <select class="day2">
            ${forecastOptions.map(o => `<option>${o}</option>`).join("")}
          </select>
        </td>
      `);

      tr.innerHTML = cells.join("");
      tbody.appendChild(tr);
    });
  });

  // Any select change -> repaint the maps
  tbody.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", paintMapsFromTable);
  });

  // Hover a row -> bold the matching polygon on both maps
  tbody.querySelectorAll("tr").forEach(tr => {
    const subdiv = tr.getAttribute("data-subdiv");
    const geoName = TableToGeoName[subdiv] || subdiv;
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(`#indiaSubMapDay1 [id='${cssEscape(geoName)}'], #indiaSubMapDay2 [id='${cssEscape(geoName)}']`)
        .attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(`#indiaSubMapDay1 [id='${cssEscape(geoName)}'], #indiaSubMapDay2 [id='${cssEscape(geoName)}']`)
        .attr("stroke-width", 1);
    });
  });
}

// ------------------------------
// DRAW SUB-DIVISION MAP (for Day 1 or Day 2)
// ------------------------------
function drawSubdivisionMap(svgId, onReady) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

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

  d3.json(SUBDIV_GEO_URL).then(raw => {
    const { features, nameProp } = normalizeToFeatures(raw);

    svg.selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class", "state")
      .attr("d", path)
      .attr("id", d => d.properties[nameProp])
      .attr("fill", "#ccc")
      .attr("stroke", "#333")
      .attr("stroke-width", 1)
      .on("mouseover", function () { d3.select(this).attr("stroke-width", 2.5); })
      .on("mouseout", function () { d3.select(this).attr("stroke-width", 1); });

    if (typeof onReady === "function") onReady();
  }).catch(err => {
    console.error("Map load error:", err);
    alert("Could not load the online GeoJSON/TopoJSON. Check SUBDIV_GEO_URL.");
  });
}

// ------------------------------
// COLOR BOTH MAPS FROM THE TABLE
//  - Day 1 -> #indiaSubMapDay1
//  - Day 2 -> #indiaSubMapDay2
// ------------------------------
function paintMapsFromTable() {
  const rows = document.querySelectorAll("#subdivision-table-body tr");

  rows.forEach(row => {
    const subdivLabel = row.getAttribute("data-subdiv");
    const day1 = row.querySelector("select.day1")?.value;
    const day2 = row.querySelector("select.day2")?.value;

    const geoName = TableToGeoName[subdivLabel] || subdivLabel;
    const color1 = forecastColors[day1] || "#ccc";
    const color2 = forecastColors[day2] || "#ccc";

    const f1 = d3.select(`#indiaSubMapDay1 [id='${cssEscape(geoName)}']`);
    const f2 = d3.select(`#indiaSubMapDay2 [id='${cssEscape(geoName)}']`);

    if (!f1.empty()) f1.attr("fill", color1);
    if (!f2.empty()) f2.attr("fill", color2);
  });
}

// ------------------------------
// INIT
// ------------------------------
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();

  // If your HTML uses different svg IDs, change them here:
  const day1Svg = document.getElementById("indiaSubMapDay1");
  const day2Svg = document.getElementById("indiaSubMapDay2");

  // If the current HTML still has the older state maps (#indiaMapDay1/2),
  // we’ll repurpose them to sub-division maps so you don’t need to edit HTML.
  if (!day1Svg || !day2Svg) {
    const d1 = document.getElementById("indiaMapDay1");
    const d2 = document.getElementById("indiaMapDay2");
    if (d1) d1.setAttribute("id", "indiaSubMapDay1");
    if (d2) d2.setAttribute("id", "indiaSubMapDay2");
  }

  // Build the one table (with Day1/Day2 selects and merged State cells)
  buildSubdivisionTable();

  // Draw both maps, then paint colors from table
  drawSubdivisionMap("#indiaSubMapDay1", () => {
    drawSubdivisionMap("#indiaSubMapDay2", () => {
      paintMapsFromTable(); // initial fill
    });
  });
};
