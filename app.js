/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  "assets/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/assets/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/assets/indian_met_zones.geojson"
];

// Table label → ST_NM in GeoJSON
const TableToGeoName = {
  "Punjab": "Punjab",
  "Telangana": "Telangana",
  "Chhattisgarh": "Chhattisgarh",

  // Rajasthan
  "W-Raj": "West Rajasthan",
  "E-Raj": "East Rajasthan",

  // Gujarat
  "W-Gujarat (Saurashtra & Kachh)": "Saurashtra & Kachh",
  "E-Gujarat Region": "Gujarat region",

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
  "North-Karnataka": "N.I. Karnataka",
  "South- Karnataka": "S.I. Karnataka",

  // Tamil Nadu
  "Tamil Nadu": "Tamil Nadu & Puducherry",
};

function tableLabelToGeo(label){ return TableToGeoName[label] || label; }

/***********************
 * UTIL
 ***********************/
function norm(s){
  return String(s||"")
    .toLowerCase()
    .replace(/\u00a0/g," ")        // NBSP
    .replace(/&/g,"and")
    .replace(/\b(kutch|kachh|kachchh)\b/g,"kachchh")
    .replace(/\bn\.?i\.?\b/g,"north interior")
    .replace(/\bs\.?i\.?\b/g,"south interior")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}
function cssq(v){ return v.replace(/'/g,"\\'"); }

async function loadGeoJSON(urls){
  let last;
  for(const url of urls){
    try{
      const u = url + (url.startsWith("http") ? `?v=${Date.now()}` : "");
      const data = await d3.json(u);
      console.log("[GeoJSON] loaded:", url, "features:", data?.features?.length ?? 0);
      return data;
    }catch(e){ console.warn("[GeoJSON] failed:", url, e); last=e; }
  }
  throw last || new Error("All GeoJSON URLs failed");
}

/***********************
 * DOM BUILDERS
 ***********************/
function ensureTable(){
  if(document.getElementById("subdivision-table")) return;
  const host = document.querySelector(".page-1") || document.body;
  host.insertAdjacentHTML("beforeend", `
    <h3 class="table-title" style="text-align:left;">Sub Divisions</h3>
    <table class="forecast-table subdivision-table" id="subdivision-table">
      <thead>
        <tr>
          <th>S. No.</th>
          <th>State</th>
          <th>Sub Division</th>
          <th>No. Solar Site</th>
          <th>Day 1</th>
          <th>Day 2</th>
        </tr>
      </thead>
      <tbody id="subdivision-table-body"></tbody>
    </table>
  `);
}

function ensureMaps(){
  if(document.getElementById("indiaSubMapDay1")) return;
  const page2 = document.querySelector(".page-2") || (()=> {
    const p=document.createElement("div");
    p.className="page page-2";
    document.getElementById("pdf-area").appendChild(p);
    return p;
  })();

  page2.insertAdjacentHTML("beforeend", `
    <h3 class="map-label">Day 1 Forecast Map (Sub Division)</h3>
    <div class="map-wrapper">
      <svg id="indiaSubMapDay1"></svg>
      <div class="map-legend">
        <ul>
          <li><span class="legend-swatch swatch-clear"></span> Clear Sky</li>
          <li><span class="legend-swatch swatch-low"></span> Low Cloud Cover</li>
          <li><span class="legend-swatch swatch-medium"></span> Medium Cloud Cover</li>
          <li><span class="legend-swatch swatch-high"></span> High Cloud Cover</li>
          <li><span class="legend-swatch swatch-overcast"></span> Overcast Cloud Cover</li>
          <li><span class="legend-pattern"></span> No Forecast Available</li>
        </ul>
      </div>
    </div>

    <h3 class="map-label">Day 2 Forecast Map (Sub Division)</h3>
    <div class="map-wrapper">
      <svg id="indiaSubMapDay2"></svg>
      <div class="map-legend">
        <ul>
          <li><span class="legend-swatch swatch-clear"></span> Clear Sky</li>
          <li><span class="legend-swatch swatch-low"></span> Low Cloud Cover</li>
          <li><span class="legend-swatch swatch-medium"></span> Medium Cloud Cover</li>
          <li><span class="legend-swatch swatch-high"></span> High Cloud Cover</li>
          <li><span class="legend-swatch swatch-overcast"></span> Overcast Cloud Cover</li>
          <li><span class="legend-pattern"></span> No Forecast Available</li>
        </ul>
      </div>
    </div>
  `);
}

/***********************
 * TABLE
 ***********************/
function buildSubdivisionTable(){
  ensureTable();
  const tbody = document.getElementById("subdivision-table-body");
  tbody.innerHTML = "";

  const groups = {};
  (window.subdivisions||[]).forEach(r => (groups[r.state] ||= []).push(r));

  let i=1;
  for(const state of Object.keys(groups)){
    const rows = groups[state];
    for(let idx=0; idx<rows.length; idx++){
      const row = rows[idx];
      const tr = document.createElement("tr");
      tr.dataset.state  = state;
      tr.dataset.subdiv = row.name;

      tr.innerHTML = `
        <td>${i++}</td>
        ${idx===0 ? `<td rowspan="${rows.length}">${state}</td>` : ""}
        <td>${row.name}</td>
        <td contenteditable="true"></td>
        <td><select class="day1">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    }
  }

  tbody.querySelectorAll("select").forEach(s=>s.addEventListener("change", paintMapsFromTable));
}

/***********************
 * MAPS
 ***********************/
let NAME_PROP = "ST_NM";      // field in your GeoJSON
let nameIndexDay1 = new Map(); // normName -> selection of paths
let nameIndexDay2 = new Map();

function indexPaths(svgSelector, indexMap){
  indexMap.clear();
  document.querySelectorAll(`${svgSelector} path.state`).forEach(p=>{
    const n = p.getAttribute("data-norm");
    if(!n) return;
    if(!indexMap.has(n)) indexMap.set(n, []);
    indexMap.get(n).push(p);
  });
}

async function drawSubdivisionMap(svgId, onReady){
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  const W = 860, H = 580;
  svg.attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet");

  try{
    const raw = await loadGeoJSON(SUBDIV_GEO_URLS);
    const features = Array.isArray(raw?.features) ? raw.features : [];
    if(!features.length) throw new Error("No features in GeoJSON");

    // verify the property exists
    const sampleProps = features[0]?.properties || {};
    if(!(NAME_PROP in sampleProps)){
      const maybe = Object.keys(sampleProps).find(k=>/st.?_?nm/i.test(k)) || Object.keys(sampleProps).find(k=>/name/i.test(k)) || "ST_NM";
      NAME_PROP = maybe;
      console.log("[Geo] using name field:", NAME_PROP);
    }

    const fc = { type:"FeatureCollection", features };
    const projection = d3.geoMercator().fitSize([W,H], fc);
    const path = d3.geoPath().projection(projection);

    svg.selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class","state")
      .attr("d",path)
      .attr("data-name", d => String(d.properties?.[NAME_PROP] ?? "").trim())
      .attr("data-norm", d => norm(d.properties?.[NAME_PROP]))
      .attr("fill","#e6e6e6")
      .attr("stroke","#222")
      .attr("stroke-width",0.8);

    // small one-off proof the polygons are visible:
    svg.selectAll("path.state").filter((d,i)=>i%120===0).attr("fill","#cde7ff");

    // build fast indices for painting
    if(svgId==="#indiaSubMapDay1") indexPaths("#indiaSubMapDay1", nameIndexDay1);
    if(svgId==="#indiaSubMapDay2") indexPaths("#indiaSubMapDay2", nameIndexDay2);

    onReady && onReady();
  }catch(err){
    console.error("Geo load/draw error:", err);
    onReady && onReady();
  }
}

function paintMapsFromTable(){
  const colors = window.forecastColors || {};
  const tbodyRows = document.querySelectorAll("#subdivision-table-body tr");
  const unmatched = [];

  tbodyRows.forEach(tr=>{
    const label = tr.dataset.subdiv;
    const geoName = tableLabelToGeo(label);
    const key = norm(geoName);

    const d1 = tr.querySelector(".day1")?.value || "Clear Sky";
    const d2 = tr.querySelector(".day2")?.value || "Clear Sky";

    const c1 = colors[d1] || "#e6e6e6";
    const c2 = colors[d2] || "#e6e6e6";

    const arr1 = nameIndexDay1.get(key);
    const arr2 = nameIndexDay2.get(key);

    if(!arr1 && !arr2){
      unmatched.push({label, tried: geoName});
      return;
    }
    if(arr1) arr1.forEach(p=>p.setAttribute("fill", c1));
    if(arr2) arr2.forEach(p=>p.setAttribute("fill", c2));
  });

  if(unmatched.length){
    console.warn("Unmatched table rows (check spelling or add to TableToGeoName):",
      unmatched.map(u=>`${u.label} → ${u.tried}`));
  }
}

/***********************
 * INIT
 ***********************/
window.onload = ()=>{
  if(typeof updateISTDate==="function") updateISTDate();

  ensureTable();
  ensureMaps();
  buildSubdivisionTable();

  // draw both maps then paint
  drawSubdivisionMap("#indiaSubMapDay1", ()=>{
    drawSubdivisionMap("#indiaSubMapDay2", ()=>{
      // ensure indices built
      indexPaths("#indiaSubMapDay1", nameIndexDay1);
      indexPaths("#indiaSubMapDay2", nameIndexDay2);
      paintMapsFromTable();
    });
  });
};
