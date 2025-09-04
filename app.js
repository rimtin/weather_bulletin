/***********************
 * CONFIG (tries local, then RAW, then CDN)
 ***********************/
const SUBDIV_GEO_URLS = [
  "assets/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/assets/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/assets/indian_met_zones.geojson"
];

/* Table label → GeoJSON name */
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
  // Prefer subdivision keys first
  const pref = ["SUBDIV","subdiv","SUBDIVISION","name","ST_NM","st_nm","NAME_1","st_name","NAME"];
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
      const cacheBust = url.startsWith("http") ? ("?v="+Date.now()) : "";
      const data = await d3.json(url + cacheBust);
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
    const wrap = document.createElement("div");
    wrap.innerHTML = `
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
    host.appendChild(wrap);
    table = wrap.querySelector("#subdivision-table");
  }
  return table;
}
function ensureMaps(){
  const page2 = document.querySelector(".page-2");
  if(!page2) return;

  if(!document.getElementById("indiaSubMapDay1")){
    const block = document.createElement("div");
    block.innerHTML = `
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
  const tbody = document.getElementById("subdivision-table-body");
  tbody.innerHTML = "";

  const groups = {};
  (window.subdivisions||[]).forEach(r=>{
    groups[r.state] = groups[r.state] || [];
    groups[r.state].push(r);
  });

  let serial = 1;
  Object.keys(groups).forEach(state=>{
    const rows = groups[state];
    rows.forEach((row,idx)=>{
      const tr = document.createElement("tr");
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
      d3.selectAll(`#indiaSubMapDay1 [id='${cssEscape(geo)}'], #indiaSubMapDay2 [id='${cssEscape(geo)}']`)
        .style("stroke-width","2.5px","important");
    });
    tr.addEventListener("mouseleave", ()=> {
      d3.selectAll(`#indiaSubMapDay1 [id='${cssEscape(geo)}'], #indiaSubMapDay2 [id='${cssEscape(geo)}']`)
        .style("stroke-width","1px","important");
    });
  });
}

/***********************
 * MAPS
 ***********************/
async function drawSubdivisionMap(svgSelector, onReady){
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();

  // Explicit drawing area
  const width = 860, height = 280;
  svg.attr("width", width).attr("height", height)
     .attr("viewBox", `0 0 ${width} ${height}`)
     .attr("preserveAspectRatio", "xMidYMid meet")
     .style("background","transparent");

  // pattern for "No Forecast Available"
  const defs=svg.append("defs");
  defs.append("pattern")
    .attr("id","diagonalHatch")
    .attr("patternUnits","userSpaceOnUse")
    .attr("width",6).attr("height",6)
    .append("path").attr("d","M0,0 l6,6").attr("stroke","#999").attr("stroke-width",1);

  try {
    const raw = await loadGeoJSON(SUBDIV_GEO_URLS);
    const {features,nameProp} = normalizeToFeatures(raw);

    // ---- Filter OUTLIERS so the fit isn't ruined by far-away coords ----
    // Keep only features whose bounds sit roughly over India.
    const inIndia = f => {
      const b = d3.geoBounds(f);           // [ [minLon,minLat], [maxLon,maxLat] ]
      const minLon=b[0][0], minLat=b[0][1], maxLon=b[1][0], maxLat=b[1][1];
      return (minLon > 60 && maxLon < 100 && minLat > 5 && maxLat < 40);
    };
    const clean = features.filter(inIndia);
    const fc = { type: "FeatureCollection", features: clean.length ? clean : features };

    // ---- Robust "fit" that always fills the svg ----
    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);

    // Compute bounds then set scale/translate manually (instead of fitSize)
    const b = path.bounds(fc);                             // [[x0,y0],[x1,y1]] in pixels at current (default) proj
    const dx = b[1][0] - b[0][0];
    const dy = b[1][1] - b[0][1];
    const scale = 0.95 / Math.max(dx / width, dy / height);
    const cx = (b[0][0] + b[1][0]) / 2;
    const cy = (b[0][1] + b[1][1]) / 2;

    // Re-project with the new scale/translate by reusing the geographic center
    const geoC = d3.geoCentroid(fc);                       // [lon, lat]
    projection
      .center(geoC)
      .scale(150 * scale * 100)                            // 150 is Mercator’s default; *100 gives a good base
      .translate([width/2, height/2]);

    // Recompute path after final projection (important!)
    const path2 = d3.geoPath().projection(projection);

    const sel = svg.selectAll("path.state")
      .data(fc.features)
      .enter()
      .append("path")
      .attr("class","state")
      .attr("id", d => String(d.properties[nameProp]).trim())
      .attr("d", path2)
      .style("fill", "#ccc")
      .style("stroke", "#333")
      .style("stroke-width", "1px")
      .style("vector-effect", "non-scaling-stroke");

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

    const c1=(window.forecastColors||{})[d1];
    const c2=(window.forecastColors||{})[d2];

    const fill1 = c1 === "pattern" ? "url(#diagonalHatch)" : (c1 || "#ccc");
    const fill2 = c2 === "pattern" ? "url(#diagonalHatch)" : (c2 || "#ccc");

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
      paintMapsFromTable();
    });
  });
};
