/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  "assets/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/assets/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/assets/indian_met_zones.geojson"
];

/***********************
 * UTIL
 ***********************/
function cssAttrEscape(s){ return String(s).replace(/'/g, "\\'"); }

// small tolerant matcher (handles Kutch/Kachchh, N.I./North Interior, S.I./South Interior, &/and)
function normName(s){
  return String(s||"")
    .toLowerCase()
    .replace(/&/g,"and")
    .replace(/\b(kutch|kachchh|kachh)\b/g,"kachchh")
    .replace(/\b(n\.?i\.?|north\s+interior)\b/g,"north interior")
    .replace(/\b(s\.?i\.?|south\s+interior)\b/g,"south interior")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

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
 * TABLE (uses names exactly as in data.js)
 ***********************/
function buildSubdivisionTable(){
  ensureTable();
  const tbody = document.getElementById("subdivision-table-body");
  tbody.innerHTML = "";

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

  tbody.querySelectorAll("select").forEach(s=>s.addEventListener("change", paintMapsFromTable));
  tbody.querySelectorAll("tr").forEach(tr=>{
    const targetNorm = normName(tr.dataset.subdiv);
    tr.addEventListener("mouseenter", ()=>{
      d3.selectAll(`#indiaSubMapDay1 [data-norm='${cssAttrEscape(targetNorm)}'], #indiaSubMapDay2 [data-norm='${cssAttrEscape(targetNorm)}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", ()=>{
      d3.selectAll(`#indiaSubMapDay1 [data-norm='${cssAttrEscape(targetNorm)}'], #indiaSubMapDay2 [data-norm='${cssAttrEscape(targetNorm)}']`).attr("stroke-width", 1);
    });
  });
}

/***********************
 * MAPS
 ***********************/
let knownNames = new Set();

async function drawSubdivisionMap(svgId, onReady){
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // SVG canvas
  const W = 860, H = 580;
  svg.attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet");

  try{
    const raw = await loadGeoJSON(SUBDIV_GEO_URLS);
    const features = Array.isArray(raw?.features) ? raw.features : [];
    if(!features.length) throw new Error("No features in GeoJSON");

    // 🔒 Use ST_NM as the label field and auto-fit to your data
    const nameProp = "ST_NM";
    const fc = { type:"FeatureCollection", features };

    const projection = d3.geoMercator().fitSize([W,H], fc);
    const path = d3.geoPath().projection(projection);

    knownNames = new Set();

    svg.selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class","state")
      .attr("d",path)
      .attr("data-name", d=> String(d.properties?.[nameProp] ?? "").trim())
      .attr("data-norm", d=>{
        const n = normName(d.properties?.[nameProp]);
        knownNames.add(n);
        return n;
      })
      .attr("fill","#ccc")
      .attr("stroke","#333")
      .attr("stroke-width",1)
      .on("mouseover", function(){ d3.select(this).attr("stroke-width",2.5); })
      .on("mouseout",  function(){ d3.select(this).attr("stroke-width",1); });

    onReady && onReady();
  }catch(err){
    console.error("Geo load/draw error:", err);
    const msg = document.createElement("div");
    msg.style.cssText = "color:#b00020;margin:8px 0;font-weight:600";
    msg.textContent = "⚠️ Could not draw the sub-division map. Check that assets/indian_met_zones.geojson exists and has an ST_NM field.";
    svg.node().parentNode.appendChild(msg);
    onReady && onReady();
  }
}

function paintMapsFromTable(){
  const rows = document.querySelectorAll("#subdivision-table-body tr");
  rows.forEach(row=>{
    const targetNorm = normName(row.dataset.subdiv);
    const d1 = row.querySelector("select.day1")?.value;
    const d2 = row.querySelector("select.day2")?.value;
    const c1 = (window.forecastColors||{})[d1] || "#ccc";
    const c2 = (window.forecastColors||{})[d2] || "#ccc";

    const sel1 = d3.selectAll(`#indiaSubMapDay1 [data-norm='${cssAttrEscape(targetNorm)}']`);
    const sel2 = d3.selectAll(`#indiaSubMapDay2 [data-norm='${cssAttrEscape(targetNorm)}']`);

    if(sel1.size()===0 && sel2.size()===0){
      console.warn("No match for table label:", row.dataset.subdiv, "(norm:", targetNorm, ")");
    }

    sel1.attr("fill", c1);
    sel2.attr("fill", c2);
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
