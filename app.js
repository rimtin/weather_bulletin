/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  "assets/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/assets/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/assets/indian_met_zones.geojson"
];

const TableToGeoName = {
  "Punjab": "Punjab",
  "Telangana": "Telangana",
  "Tamil Nadu": "Tamil Nadu & Puducherry",
  "Chhattisgarh": "Chhattisgarh",
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
  "Vidarbha": "Vidarbha",
  "Andhra Pradesh": "Coastal Andhra Pradesh",
  "SW-AP (Rayalaseema)": "Rayalaseema",
  "North-Karnataka": "N.I. Karnataka",
  "South- Karnataka": "S.I. Karnataka"
};

/***********************
 * UTIL
 ***********************/
function cssEscape(s){ return String(s).replace(/'/g,"\\'"); }
function detectNameProp(props){
  if(!props) return "name";
  const pref = ["ST_NM","st_nm","name","SUBDIV","NAME_1","st_name","NAME"];
  for (const p of pref) if (p in props) return p;
  const guess = Object.keys(props).find(k => /name/i.test(k));
  return guess || "name";
}
function normalizeToFeatures(raw){
  if(!raw) return {features:[], nameProp:"name"};
  if(raw.type==="Topology"){
    const obj = Object.values(raw.objects)[0];
    const features = topojson.feature(raw, obj).features || [];
    const nameProp = features.length ? detectNameProp(features[0].properties) : "name";
    return {features, nameProp};
  }
  const features = raw.features || [];
  const nameProp = features.length ? detectNameProp(features[0].properties) : "name";
  return {features, nameProp};
}
async function loadGeoJSON(urls){
  let lastErr;
  for(const url of urls){
    try{
      const data = await d3.json(url + (url.startsWith("http") ? ("?v=" + Date.now()) : ""));
      console.log("[GeoJSON] loaded:", url, "features:", (data.features||[]).length);
      return data;
    }catch(e){
      console.warn("[GeoJSON] failed:", url, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All GeoJSON URLs failed");
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
 * TABLE
 ***********************/
function buildSubdivisionTable(){
  ensureTable();
  const tbody=document.getElementById("subdivision-table-body");
  tbody.innerHTML="";

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
        <td><select class="day1">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    });
  });

  tbody.querySelectorAll("select").forEach(s=>s.addEventListener("change", paintMapsFromTable));
  tbody.querySelectorAll("tr").forEach(tr=>{
    const label=tr.getAttribute("data-subdiv");
    const geo=TableToGeoName[label]||label;
    tr.addEventListener("mouseenter", ()=> {
      d3.selectAll(
        `#indiaSubMapDay1 [id='${cssEscape(geo)}'], #indiaSubMapDay2 [id='${cssEscape(geo)}']`
      ).style("stroke-width","2.5px","important");
    });
    tr.addEventListener("mouseleave", ()=> {
      d3.selectAll(
        `#indiaSubMapDay1 [id='${cssEscape(geo)}'], #indiaSubMapDay2 [id='${cssEscape(geo)}']`
      ).style("stroke-width","1px","important");
    });
  });
}

/***********************
 * MAPS
 ***********************/
async function drawSubdivisionMap(svgId, onReady){
  const svg=d3.select(svgId);
  svg.selectAll("*").remove();

  // Give the SVG a real size + viewBox to guarantee visibility
  const width = 860, height = 580;
  svg.attr("width", width).attr("height", height)
     .attr("viewBox", `0 0 ${width} ${height}`)
     .attr("preserveAspectRatio","xMidYMid meet");

  // Optional: hatch pattern
  const defs=svg.append("defs");
  defs.append("pattern")
    .attr("id","diagonalHatch")
    .attr("patternUnits","userSpaceOnUse")
    .attr("width",6).attr("height",6)
    .append("path").attr("d","M0,0 l6,6")
      .style("stroke","#999","important")
      .style("stroke-width","1px","important");

  try {
    const raw = await loadGeoJSON(SUBDIV_GEO_URLS);
    const {features,nameProp}=normalizeToFeatures(raw);
    const fc = { type:"FeatureCollection", features };

    // Auto-fit projection to your data
    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);
    projection.fitSize([width, height], fc);

    // Draw polygons (force styles with !important)
    const sel = svg.selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class","state")
      .attr("d", path)
      .attr("id", d=> String(d.properties[nameProp]).trim())
      .style("fill", "#ccc", "important")
      .style("stroke", "#333", "important")
      .style("stroke-width", "1px", "important")
      .style("vector-effect", "non-scaling-stroke", "important")
      .on("mouseover", function(){ d3.select(this).style("stroke-width","2.5px","important"); })
      .on("mouseout",  function(){ d3.select(this).style("stroke-width","1px","important"); });

    console.log("[Draw] paths rendered:", sel.size());
    onReady && onReady();
  } catch (err) {
    console.error("Geo load error:", err);
    const msg = document.createElement("div");
    msg.style.color = "crimson";
    msg.style.margin = "8px 0";
    msg.textContent = "⚠️ Could not load the sub-division GeoJSON. Check file path.";
    svg.node().parentNode.appendChild(msg);
    onReady && onReady();
  }
}

function paintMapsFromTable(){
  const rows=document.querySelectorAll("#subdivision-table-body tr");
  rows.forEach(row=>{
    const label=row.getAttribute("data-subdiv");
    const geo=TableToGeoName[label]||label;
    const d1=row.querySelector("select.day1")?.value;
    const d2=row.querySelector("select.day2")?.value;
    const c1=(window.forecastColors||{})[d1]||"#ccc";
    const c2=(window.forecastColors||{})[d2]||"#ccc";

    // color ALL parts (multi-part features)
    d3.selectAll(`#indiaSubMapDay1 [id='${cssEscape(geo)}']`).style("fill", c1, "important");
    d3.selectAll(`#indiaSubMapDay2 [id='${cssEscape(geo)}']`).style("fill", c2, "important");
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
