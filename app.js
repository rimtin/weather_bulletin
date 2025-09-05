/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  // your dissolved GeoJSON (one feature per sub-division, property ST_NM)
  "assets/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/assets/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/assets/indian_met_zones.geojson"
];

/**
 * Map table labels → sub-division names in your GeoJSON.
 * You can list multiple acceptable names (synonyms) for each.
 * The code will color every feature whose ST_NM matches any of them.
 */
const TableToGeoName = {
  // Simple one-to-one
  "Punjab": ["Punjab"],
  "Telangana": ["Telangana"],
  "Chhattisgarh": ["Chhattisgarh"],

  // Tamil Nadu sometimes comes with Puducherry together
  "Tamil Nadu": ["Tamil Nadu", "Tamil Nadu & Puducherry"],

  // Rajasthan
  "W-Raj": ["West Rajasthan"],
  "E-Raj": ["East Rajasthan"],

  // Gujarat variations
  "W-Gujarat (Saurashtra & Kachh)": [
    "Saurashtra & Kachh", "Saurashtra & Kutch", "Saurashtra & Kachchh"
  ],
  "E-Gujarat Region": ["Gujarat Region", "Gujarat region"],

  // Uttar Pradesh
  "W-UP": ["West Uttar Pradesh", "W. Uttar Pradesh"],
  "E-UP": ["East Uttar Pradesh", "E. Uttar Pradesh"],

  // Madhya Pradesh
  "W-MP": ["West Madhya Pradesh"],
  "E-MP": ["East Madhya Pradesh"],

  // Maharashtra
  "Madhya -MH": ["Madhya Maharashtra", "Madhya-Maharashtra"],
  "Marathwada": ["Marathwada"],
  "Vidarbha": ["Vidarbha"],

  // Andhra Pradesh
  "Andhra Pradesh": ["Coastal Andhra Pradesh", "Andhra Pradesh"],
  "SW-AP (Rayalaseema)": ["Rayalaseema","SW-AP (Rayalaseema)"],

  // Karnataka variants
  "North-Karnataka": ["North Interior Karnataka", "N.I. Karnataka", "North-Karnataka"],
  "South- Karnataka": ["South Interior Karnataka", "S.I. Karnataka", "South- Karnataka"]
};

/***********************
 * UTIL
 ***********************/
const prefNameOrder = ["ST_NM","st_nm","SUBDIV","subdiv","name","NAME"];
function detectNameProp(props){
  for (const k of prefNameOrder) if (k in props) return k;
  const g = Object.keys(props||{}).find(k=>/name/i.test(k));
  return g || "ST_NM";
}
function cssAttrEscape(s){ return String(s).replace(/'/g, "\\'"); }

/***********************
 * GEO LOADING
 ***********************/
async function loadGeoJSON(urls){
  let last;
  for(const url of urls){
    try{
      const u = url + (url.startsWith("http") ? ("?v=" + Date.now()) : "");
      const data = await d3.json(u);
      console.log("[GeoJSON] loaded:", url, "features:", (data.features||[]).length);
      return data;
    }catch(e){
      console.warn("[GeoJSON] failed:", url, e);
      last = e;
    }
  }
  throw last || new Error("All GeoJSON URLs failed");
}
function normalizeToFeatures(raw){
  if(!raw) return {features:[], nameProp:"ST_NM"};
  if(raw.type === "Topology"){
    const obj = Object.values(raw.objects)[0];
    const features = topojson.feature(raw,obj).features || [];
    const nameProp = features.length ? detectNameProp(features[0].properties) : "ST_NM";
    return {features,nameProp};
  }
  const features = raw.features || [];
  const nameProp = features.length ? detectNameProp(features[0].properties) : "ST_NM";
  return {features,nameProp};
}

/***********************
 * DOM BUILDERS
 ***********************/
function ensureTable(){
  let table = document.getElementById("subdivision-table");
  if(!table){
    const host = document.querySelector(".page-1") || document.body;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
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
      </table>`;
    host.appendChild(wrapper);
    table = wrapper.querySelector("#subdivision-table");
  }
  return table;
}
function ensureMaps(){
  const page2 = document.querySelector(".page-2") || (()=> {
    const p=document.createElement("div");
    p.className="page page-2";
    document.getElementById("pdf-area").appendChild(p);
    return p;
  })();

  if(!document.getElementById("indiaSubMapDay1")){
    const block=document.createElement("div");
    block.innerHTML=`
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
      </div>`;
    page2.appendChild(block);
  }
}

/***********************
 * TABLE CONSTRUCTION
 ***********************/
function buildSubdivisionTable(){
  ensureTable();
  const tbody = document.getElementById("subdivision-table-body");
  tbody.innerHTML = "";

  // Group by state for row-spans
  const groups = {};
  (window.subdivisions||[]).forEach(r=>{
    (groups[r.state] ||= []).push(r);
  });

  let i=1;
  Object.keys(groups).forEach(state=>{
    const rows = groups[state];
    rows.forEach((row, idx)=>{
      const tr = document.createElement("tr");
      tr.dataset.state = state;
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
    });
  });

  // interactions: hover highlight & repaint
  tbody.querySelectorAll("select").forEach(s=>s.addEventListener("change", paintMapsFromTable));
  tbody.querySelectorAll("tr").forEach(tr=>{
    const label = tr.dataset.subdiv;
    const targets = [].concat(TableToGeoName[label] || []);
    tr.addEventListener("mouseenter", ()=>{
      targets.forEach(t=>{
        d3.selectAll(`#indiaSubMapDay1 [data-name='${cssAttrEscape(t)}'], #indiaSubMapDay2 [data-name='${cssAttrEscape(t)}']`).attr("stroke-width", 2.5);
      });
    });
    tr.addEventListener("mouseleave", ()=>{
      targets.forEach(t=>{
        d3.selectAll(`#indiaSubMapDay1 [data-name='${cssAttrEscape(t)}'], #indiaSubMapDay2 [data-name='${cssAttrEscape(t)}']`).attr("stroke-width", 1);
      });
    });
  });
}

/***********************
 * MAPS
 ***********************/
async function drawSubdivisionMap(svgId, onReady){
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // Give SVG a fixed drawing area so paths are visible
  svg.attr("viewBox","0 0 860 580").attr("preserveAspectRatio","xMidYMid meet");

  const defs = svg.append("defs");
  defs.append("pattern")
    .attr("id","diagonalHatch")
    .attr("patternUnits","userSpaceOnUse")
    .attr("width",6).attr("height",6)
    .append("path").attr("d","M0,0 l6,6").attr("stroke","#999").attr("stroke-width",1);

  const projection = d3.geoMercator().scale(850).center([89.8,21.5]).translate([430,290]);
  const path = d3.geoPath().projection(projection);

  try{
    const raw = await loadGeoJSON(SUBDIV_GEO_URLS);
    const {features,nameProp} = normalizeToFeatures(raw);
    if(!features.length) console.warn("No features in GeoJSON");

    svg.selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class","state")
      .attr("d",path)
      .attr("data-name", d=> String(d.properties[nameProp]).trim())
      .attr("fill","#ccc")
      .attr("stroke","#333")
      .attr("stroke-width",1)
      .on("mouseover", function(){ d3.select(this).attr("stroke-width",2.5); })
      .on("mouseout",  function(){ d3.select(this).attr("stroke-width",1); });

    if(typeof onReady==="function") onReady();
  }catch(err){
    console.error("Geo load error:", err);
    const msg = document.createElement("div");
    msg.style.color = "crimson";
    msg.style.margin = "8px 0";
    msg.textContent = "⚠️ Could not load the sub-division GeoJSON. Check file path.";
    svg.node().parentNode.appendChild(msg);
    if(typeof onReady==="function") onReady();
  }
}

function paintMapsFromTable(){
  const rows = document.querySelectorAll("#subdivision-table-body tr");
  rows.forEach(row=>{
    const label = row.dataset.subdiv;
    const targets = [].concat(TableToGeoName[label] || []);
    const d1 = row.querySelector("select.day1")?.value;
    const d2 = row.querySelector("select.day2")?.value;
    const c1 = (window.forecastColors||{})[d1] || "#ccc";
    const c2 = (window.forecastColors||{})[d2] || "#ccc";

    targets.forEach(name=>{
      d3.selectAll(`#indiaSubMapDay1 [data-name='${cssAttrEscape(name)}']`).attr("fill", c1);
      d3.selectAll(`#indiaSubMapDay2 [data-name='${cssAttrEscape(name)}']`).attr("fill", c2);
    });
  });
}

/***********************
 * INIT
 ***********************/
window.onload = ()=>{
  if(typeof updateISTDate==="function") updateISTDate();
  ensureTable();
  ensureMaps();

  buildSubdivisionTable();
  drawSubdivisionMap("#indiaSubMapDay1", ()=> {
    drawSubdivisionMap("#indiaSubMapDay2", ()=> {
      paintMapsFromTable();
    });
  });
};
