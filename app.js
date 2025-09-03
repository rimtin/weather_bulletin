/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URL =
  // ❗ Use a RAW file URL here (not a GitHub “blob” page).
  // Example if your file lives in your repo:
  // "https://raw.githubusercontent.com/<your-user>/<your-repo>/<branch>/weather_bulletin/indian_met_zones.geojson"
  "https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/india.geojson"; // ← replace with your subdivisions RAW URL

// Table label → GeoJSON name mapping
const TableToGeoName = {
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

/***********************
 * DATA (from data.js)
 ***********************/
 // uses global `subdivisions`, `forecastOptions`, `forecastColors`, `updateISTDate`

/***********************
 * UTIL
 ***********************/
function cssEscape(s){ return String(s).replace(/'/g,"\\'"); }
function detectNameProp(props){
  if(!props) return "name";
  const pref=["name","SUBDIV","NAME_1","st_nm","st_name","NAME"];
  for(const p of pref){ if(p in props) return p; }
  const guess=Object.keys(props).find(k=>/name/i.test(k));
  return guess||"name";
}
function normalizeToFeatures(raw){
  if(!raw) return {features:[], nameProp:"name"};
  if(raw.type==="Topology"){
    const obj=Object.values(raw.objects)[0];
    const features=topojson.feature(raw,obj).features||[];
    const nameProp=features.length?detectNameProp(features[0].properties):"name";
    return {features,nameProp};
  }
  const features=raw.features||[];
  const nameProp=features.length?detectNameProp(features[0].properties):"name";
  return {features,nameProp};
}

/***********************
 * DOM BUILDERS (auto-create if missing)
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
  const page2 = document.querySelector(".page-2") || (()=>{
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
 * TABLE (rowspans + selects)
 ***********************/
function buildSubdivisionTable(){
  ensureTable();
  const tbody=document.getElementById("subdivision-table-body");
  tbody.innerHTML="";

  // group by state for rowspans
  const groups={};
  (window.subdivisions||[]).forEach(r=>{
    groups[r.state]=groups[r.state]||[];
    groups[r.state].push(r);
  });

  let serial=1;
  Object.keys(groups).forEach(state=>{
    const rows=groups[state];
    rows.forEach((row,idx)=>{
      const tr=document.createElement("tr");
      tr.setAttribute("data-state", state);
      tr.setAttribute("data-subdiv", row.name);

      tr.innerHTML = `
        <td>${serial++}</td>
        ${idx===0?`<td rowspan="${rows.length}">${state}</td>`:""}
        <td>${row.name}</td>
        <td contenteditable="true"></td>
        <td><select class="day1">${forecastOptions.map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${forecastOptions.map(o=>`<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // interactions
  tbody.querySelectorAll("select").forEach(s=>s.addEventListener("change", paintMapsFromTable));
  tbody.querySelectorAll("tr").forEach(tr=>{
    const label=tr.getAttribute("data-subdiv");
    const geo=TableToGeoName[label]||label;
    tr.addEventListener("mouseenter", ()=> {
      d3.selectAll(`#indiaSubMapDay1 [id='${cssEscape(geo)}'], #indiaSubMapDay2 [id='${cssEscape(geo)}']`).attr("stroke-width",2.5);
    });
    tr.addEventListener("mouseleave", ()=> {
      d3.selectAll(`#indiaSubMapDay1 [id='${cssEscape(geo)}'], #indiaSubMapDay2 [id='${cssEscape(geo)}']`).attr("stroke-width",1);
    });
  });
}

/***********************
 * MAPS
 ***********************/
function drawSubdivisionMap(svgId, onReady){
  const svg=d3.select(svgId);
  svg.selectAll("*").remove();

  const defs=svg.append("defs");
  defs.append("pattern")
    .attr("id","diagonalHatch")
    .attr("patternUnits","userSpaceOnUse")
    .attr("width",6).attr("height",6)
    .append("path").attr("d","M0,0 l6,6").attr("stroke","#999").attr("stroke-width",1);

  const projection=d3.geoMercator().scale(850).center([89.8,21.5]).translate([430,290]);
  const path=d3.geoPath().projection(projection);

  d3.json(SUBDIV_GEO_URL).then(raw=>{
    const {features,nameProp}=normalizeToFeatures(raw);

    svg.selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class","state")
      .attr("d",path)
      .attr("id", d=> d.properties[nameProp])
      .attr("fill","#ccc")
      .attr("stroke","#333")
      .attr("stroke-width",1)
      .on("mouseover", function(){ d3.select(this).attr("stroke-width",2.5); })
      .on("mouseout",  function(){ d3.select(this).attr("stroke-width",1); });

    if(typeof onReady==="function") onReady();
  }).catch(err=>{
    console.error("Geo load error", err);
    alert("Could not load the online GeoJSON/TopoJSON. Check SUBDIV_GEO_URL.");
  });
}

function paintMapsFromTable(){
  const rows=document.querySelectorAll("#subdivision-table-body tr");
  rows.forEach(row=>{
    const label=row.getAttribute("data-subdiv");
    const geo=TableToGeoName[label]||label;
    const d1=row.querySelector("select.day1")?.value;
    const d2=row.querySelector("select.day2")?.value;
    const c1=forecastColors[d1]||"#ccc";
    const c2=forecastColors[d2]||"#ccc";

    const s1=d3.select(`#indiaSubMapDay1 [id='${cssEscape(geo)}']`);
    const s2=d3.select(`#indiaSubMapDay2 [id='${cssEscape(geo)}']`);
    if(!s1.empty()) s1.attr("fill", c1);
    if(!s2.empty()) s2.attr("fill", c2);
  });
}

/***********************
 * INIT
 ***********************/
window.onload = ()=>{
  if(typeof updateISTDate==="function") updateISTDate();

  // ensure UI exists
  ensureTable();
  ensureMaps();

  // (re)build table, draw maps, then paint
  buildSubdivisionTable();
  drawSubdivisionMap("#indiaSubMapDay1", ()=> {
    drawSubdivisionMap("#indiaSubMapDay2", ()=> {
      paintMapsFromTable();
    });
  });
};
