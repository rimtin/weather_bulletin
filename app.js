/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  "assets/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/assets/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/assets/indian_met_zones.geojson"
];

// Table label → GeoJSON ST_NM (IMD subdivision names)
const TableToGeoName = {
  // same-as
  "Punjab": "Punjab",
  "Telangana": "Telangana",
  "Tamil Nadu": "Tamil Nadu & Puducherry",
  "Chhattisgarh": "Chhattisgarh",
  "Bihar": "Bihar",
  "Andhra Pradesh": "Coastal Andhra Pradesh",
  "SW-AP (Rayalaseema)": "Rayalaseema",
  "North-Karnataka": "N.I. Karnataka",
  "South- Karnataka": "S.I. Karnataka",

  // splits
  "W-Raj": "West Rajasthan",
  "E-Raj": "East Rajasthan",

  "W-Gujarat (Saurashtra & Kachh)": "Saurashtra & Kachh",
  "E-Gujarat Region": "Gujarat region",

  "W-UP": "West Uttar Pradesh",
  "E-UP": "East Uttar Pradesh",

  "W-MP": "West Madhya Pradesh",
  "E-MP": "East Madhya Pradesh",

  "Madhya -MH": "Madhya Maharashtra",
  "Marathwada": "Marathwada",
  "Vidarbha": "Vidarbha"
};

/***********************
 * GLOBALS from data.js
 ***********************/
// window.subdivisions, window.forecastOptions, window.forecastColors, updateISTDate

/***********************
 * HELPERS
 ***********************/
const cssEscape = s => String(s).replace(/'/g, "\\'");
const norm = s => String(s || "")
  .toLowerCase()
  .replace(/&/g, "and")
  .replace(/[^\w]+/g, "-")
  .replace(/^-+|-+$/g, "");

async function loadGeoJSON(urls){
  let last;
  for(const u of urls){
    try{
      const r = await fetch(u + (u.startsWith("http") ? `?v=${Date.now()}` : ""));
      if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = await r.json();
      console.log("[GeoJSON] loaded:", u, "features:", (j.features||[]).length);
      return j;
    }catch(e){ console.warn("[GeoJSON] failed:", u, e); last = e; }
  }
  throw last || new Error("All URLs failed");
}

/***********************
 * BUILD TABLE
 ***********************/
function buildSubdivisionTable(){
  const tbody  = document.getElementById("subdivision-table-body");
  if(!tbody) return;
  tbody.innerHTML = "";

  // group rows by state for a nice rowspan
  const groups = {};
  (window.subdivisions || []).forEach(r=>{
    (groups[r.state] ||= []).push(r);
  });

  let serial = 1;
  Object.keys(groups).forEach(state=>{
    const rows = groups[state];
    rows.forEach((row, i)=>{
      const tr = document.createElement("tr");
      tr.dataset.state  = state;
      tr.dataset.subdiv = row.name;  // table label
      tr.innerHTML = `
        <td>${serial++}</td>
        ${i===0 ? `<td rowspan="${rows.length}">${state}</td>` : ""}
        <td>${row.name}</td>
        <td contenteditable="true"></td>
        <td><select class="day1">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // change events → repaint maps
  tbody.querySelectorAll("select").forEach(sel=>{
    sel.addEventListener("change", paintMapsFromTable);
  });

  // table hover → thicken stroke on map
  tbody.querySelectorAll("tr").forEach(tr=>{
    const tableLabel = tr.dataset.subdiv;
    const geoName = TableToGeoName[tableLabel] || tableLabel;
    const id = norm(geoName);
    tr.addEventListener("mouseenter", ()=>{
      d3.selectAll(`#indiaSubMapDay1 [data-id='${cssEscape(id)}'], #indiaSubMapDay2 [data-id='${cssEscape(id)}']`).attr("stroke-width",1.6);
    });
    tr.addEventListener("mouseleave", ()=>{
      d3.selectAll(`#indiaSubMapDay1 [data-id='${cssEscape(id)}'], #indiaSubMapDay2 [data-id='${cssEscape(id)}']`).attr("stroke-width",0.8);
    });
  });
}

/***********************
 * DRAW MAPS  (now using fitExtent)
 ***********************/
async function drawSubdivisionMap(svgSelector, onReady){
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();

  // fixed canvas for layout; viewBox lets it scale responsively
  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet");

  try {
    const geo = await loadGeoJSON(SUBDIV_GEO_URLS);
    const features = geo.features || [];
    const fc = { type: "FeatureCollection", features };

    // your file’s name field is ST_NM (IMD sub-division name)
    const NAME = "ST_NM";

    // --- the key change: fit the projection to the data area ---
    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);
    // add a small padding (10 px margin inside the SVG box)
    projection.fitSize([W - 10, H - 10], fc);

    // draw polygons
    svg.selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class", "state")
      .attr("d", path)
      .attr("data-name", d => d.properties?.[NAME] ?? "")
      .attr("data-id",   d => norm(d.properties?.[NAME] ?? ""))
      .attr("fill", "#e6e6e6")
      .attr("stroke", "#222")
      .attr("stroke-width", 0.8)
      .on("mouseover", function(){ d3.select(this).attr("stroke-width", 1.6); })
      .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 0.8); });

    if (typeof onReady === "function") onReady();
  } catch (e) {
    console.error("Geo load error:", e);
    const msg = document.createElement("div");
    msg.style.color = "crimson";
    msg.textContent = "⚠️ Could not load the sub-division GeoJSON.";
    svg.node().parentNode.appendChild(msg);
    if (typeof onReady === "function") onReady();
  }
}

/***********************
 * COLOR FROM TABLE
 ***********************/
function paintMapsFromTable(){
  const rows = document.querySelectorAll("#subdivision-table-body tr");
  rows.forEach(tr=>{
    const tableLabel = tr.dataset.subdiv;
    const geoName = TableToGeoName[tableLabel] || tableLabel;
    const id = norm(geoName);

    const d1 = tr.querySelector("select.day1")?.value;
    const d2 = tr.querySelector("select.day2")?.value;

    const c1 = (window.forecastColors||{})[d1] || "#e6e6e6";
    const c2 = (window.forecastColors||{})[d2] || "#e6e6e6";

    d3.selectAll(`#indiaSubMapDay1 [data-id='${cssEscape(id)}']`).attr("fill", c1);
    d3.selectAll(`#indiaSubMapDay2 [data-id='${cssEscape(id)}']`).attr("fill", c2);
  });
}

/***********************
 * INIT
 ***********************/
window.onload = () => {
  if(typeof updateISTDate === "function") updateISTDate();

  buildSubdivisionTable();

  drawSubdivisionMap("#indiaSubMapDay1", () => {
    drawSubdivisionMap("#indiaSubMapDay2", () => {
      paintMapsFromTable(); // initial paint
    });
  });
};
