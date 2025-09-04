/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  "assets/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/assets/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/assets/indian_met_zones.geojson"
];

/**
 * Table label -> "map key" we want to color.
 * With your current GeoJSON (districts), we color by STATE (ST_NM),
 * so for split regions (W/E) we map both to the same state for now.
 * When you later upload a real sub-division GeoJSON with a SUBDIV field,
 * this mapping will still work (we’ll prefer SUBDIV if available).
 */
const TableToMapKey = {
  // simple states:
  "Punjab": "Punjab",
  "Chhattisgarh": "Chhattisgarh",
  "Telangana": "Telangana",
  "Tamil Nadu": "Tamil Nadu",

  // Rajasthan
  "West-Raj": "Rajasthan",
  "East-Raj": "Rajasthan",

  // Gujarat
  "West-Gujarat (Saurashtra & Kachh)": "Gujarat",
  "East-Gujarat Region": "Gujarat",

  // Uttar Pradesh
  "West-UP": "Uttar Pradesh",
  "East-UP": "Uttar Pradesh",

  // Madhya Pradesh
  "West-MP": "Madhya Pradesh",
  "East-MP": "Madhya Pradesh",

  // Maharashtra
  "Madhya -MH": "Maharashtra",
  "Marathwada": "Maharashtra",
  "Vidarbha": "Maharashtra",

  // Andhra Pradesh
  "Andhra Pradesh": "Andhra Pradesh",
  "SW-AP (Rayalaseema)": "Andhra Pradesh",

  // Karnataka
  "North-Karnataka": "Karnataka",
  "South- Karnataka": "Karnataka"
};

/***********************
 * UTIL
 ***********************/
function cssEscape(s){ return String(s).replace(/'/g,"\\'"); }

function detectProps(props){
  // Prefer SUBDIV if your future file has it; else use state name ST_NM (your file has this)
  const propSubdiv = ["SUBDIV","subdiv","SUBDIVISION","subdivision"].find(p=>p in props);
  const propState  = ["ST_NM","st_nm","STATE","state","state_name","STATE_NAME"].find(p=>p in props);
  return { propSubdiv, propState };
}

function normalizeToFeatures(raw){
  if(!raw) return {features:[]};
  if(raw.type==="Topology"){
    const obj = Object.values(raw.objects)[0];
    const features = topojson.feature(raw, obj).features || [];
    return {features};
  }
  return {features: raw.features || []};
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
        <td><select class="day1">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // interactions
  tbody.querySelectorAll("select").forEach(s=>s.addEventListener("change", paintMapsFromTable));
}

/***********************
 * MAPS
 ***********************/
let _featureStateProp = "ST_NM"; // will detect from file

async function drawSubdivisionMap(svgId, onReady){
  const svg=d3.select(svgId);
  svg.selectAll("*").remove();

  // Visible drawing area
  const width = 860, height = 320;
  svg.attr("width", width).attr("height", height)
     .attr("viewBox", `0 0 ${width} ${height}`)
     .attr("preserveAspectRatio","xMidYMid meet");

  // hatch pattern for "No Forecast Available"
  const defs=svg.append("defs");
  const pat = defs.append("pattern")
    .attr("id","diagonalHatch")
    .attr("patternUnits","userSpaceOnUse")
    .attr("width",6).attr("height",6);
  pat.append("path").attr("d","M0,0 l6,6").attr("stroke","#999").attr("stroke-width",1);

  try {
    const raw = await loadGeoJSON(SUBDIV_GEO_URLS);
    const {features}=normalizeToFeatures(raw);
    if(!features.length){ throw new Error("No features"); }

    // detect property names
    const propInfo = detectProps(features[0].properties || {});
    _featureStateProp = propInfo.propState || "ST_NM";

    const fc = { type:"FeatureCollection", features };

    // Auto-fit projection
    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);
    projection.fitSize([width, height], fc);

    // Draw districts (pieces of states)
    const sel = svg.selectAll("path.state-piece")
      .data(features)
      .enter()
      .append("path")
      .attr("class","state-piece")
      .attr("d", path)
      .attr("data-st", d => String(d.properties[_featureStateProp]).trim())
      .style("fill", "#eee")
      .style("stroke", "#333")
      .style("stroke-width", "0.6px")
      .style("vector-effect", "non-scaling-stroke");

    // outline whole country (subtle)
    svg.append("path")
      .datum(d3.geoBounds ? null : null)  // noop; kept if you later want outer outline
      .style("pointer-events","none");

    console.log("[Draw] paths rendered:", sel.size());
    if(typeof onReady==="function") onReady();
  } catch (err) {
    console.error("Geo load error:", err);
    const msg = document.createElement("div");
    msg.style.color = "crimson";
    msg.style.margin = "8px 0";
    msg.textContent = "⚠️ Could not load the GeoJSON.";
    svg.node().parentNode.appendChild(msg);
    if(typeof onReady==="function") onReady();
  }
}

function paintMapsFromTable(){
  const rows=document.querySelectorAll("#subdivision-table-body tr");
  rows.forEach(row=>{
    const label=row.getAttribute("data-subdiv");
    const geo=TableToGeoName[label]||label;
    const d1=row.querySelector("select.day1")?.value;
    const d2=row.querySelector("select.day2")?.value;

    const c1=(window.forecastColors||{})[d1];
    const c2=(window.forecastColors||{})[d2];

    const fill1 = (c1 === "pattern") ? "url(#diagonalHatch)" : (c1 || "#ccc");
    const fill2 = (c2 === "pattern") ? "url(#diagonalHatch)" : (c2 || "#ccc");

    d3.selectAll(`#indiaSubMapDay1 [id='${cssEscape(geo)}']`)
      .style("fill", fill1, "important")
      .style("stroke", "#333", "important")
      .style("stroke-width", "1px", "important");

    d3.selectAll(`#indiaSubMapDay2 [id='${cssEscape(geo)}']`)
      .style("fill", fill2, "important")
      .style("stroke", "#333", "important")
      .style("stroke-width", "1px", "important");
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
      paintMapsFromTable();  // paint once (defaults to "No Forecast Available")
    });
  });
};
