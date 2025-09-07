/****************************
 * SOURCES (states TopoJSON + subdivision GeoJSON fallback)
 ****************************/
const TOPO_URLS = [
  "india.json",
  "assets/india.json",
  "https://rimtin.github.io/weather_bulletin/india.json",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/india.json",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/india.json"
];

const GEOJSON_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

/****************************
 * RUNTIME CACHES
 ****************************/
let __FC = null;                 // loaded FeatureCollection (states or sub-divisions)
let __NAME_KEY = "st_nm";        // detected name property
window.stateCentroids = window.stateCentroids || {};
window.actualStateList = (window.states || []).slice(); // allowed list drives main table

/****************************
 * HELPERS
 ****************************/
const cssEscape = s =>
  (window.CSS && CSS.escape) ? CSS.escape(String(s ?? "")) : String(s ?? "").replace(/'/g,"\\'").replace(/"/g,'\\"');

const byId = id => document.getElementById(id);

function pickNameKey(features){
  const pref = ["st_nm","ST_NM","name","NAME","st_name","ST_NAME","SUBDIV","subdiv"];
  const seen = new Set();
  features.forEach(f => Object.keys(f.properties||{}).forEach(k => seen.add(k)));
  for (const k of pref) if (seen.has(k)) return k;
  for (const f of features) for (const k of Object.keys(f.properties||{}))
    if (typeof f.properties[k] === "string") return k;
  return "st_nm";
}

function ensureHatch(svg){
  const id="diagonalHatch";
  if (!svg.select("#"+id).empty()) return id;
  let defs = svg.select("defs"); if (defs.empty()) defs = svg.append("defs");
  const p = defs.append("pattern").attr("id",id)
    .attr("patternUnits","userSpaceOnUse").attr("width",6).attr("height",6);
  p.append("path").attr("d","M0,0 l6,6").attr("stroke","#999").attr("stroke-width",1);
  return id;
}

/****************************
 * LOADERS (Topo first, then GeoJSON)
 ****************************/
async function tryFetchJSON(u){
  const url = u + (u.includes("?")?"&":"?") + "v=" + Date.now();
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function loadAnyIndia(){
  if (__FC) return __FC;

  // 1) Try TopoJSON (states)
  for (const u of TOPO_URLS){
    try{
      const topo = await tryFetchJSON(u);
      const obj = topo.objects?.states || Object.values(topo.objects||{})[0];
      if (!obj) throw new Error("No 'states' object");
      const fc = (window.topojson||topojson).feature(topo, obj);
      if (!Array.isArray(fc.features) || !fc.features.length) throw new Error("Empty features");
      __NAME_KEY = pickNameKey(fc.features);
      __FC = { type:"FeatureCollection", features: fc.features };
      console.info("[Map] Using TopoJSON (states). NAME_KEY:", __NAME_KEY);
      return __FC;
    }catch(e){ console.warn("[Topo] failed:", u, e.message||e); }
  }

  // 2) Fallback to your sub-division GeoJSON
  for (const u of GEOJSON_URLS){
    try{
      const gj = await tryFetchJSON(u);
      const feats = (gj.features||[]).filter(f => f && f.geometry);
      if (!feats.length) throw new Error("Empty features");
      __NAME_KEY = pickNameKey(feats);
      __FC = { type:"FeatureCollection", features: feats };
      console.info("[Map] Using GeoJSON (sub-divisions). NAME_KEY:", __NAME_KEY);
      return __FC;
    }catch(e){ console.warn("[GeoJSON] failed:", u, e.message||e); }
  }

  throw new Error("Could not load india.json or indian_met_zones.geojson");
}

/****************************
 * DRAW ONE MAP into your existing SVG ids
 ****************************/
async function drawIndiaMap(svgId, dayTag){
  const svg = d3.select("#"+svgId);
  if (svg.empty()){ console.error("Missing SVG:", svgId); return; }
  svg.selectAll("*").remove();

  // size & background (keeps proportions)
  const W=860, H=580;
  svg.attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet");

  const hatch = ensureHatch(svg);

  try{
    const fc = await loadAnyIndia();
    const features = fc.features;

    // Fallback allowed list = all names if none provided
    if (!window.actualStateList.length){
      window.actualStateList = [...new Set(features.map(f => f.properties?.[__NAME_KEY]).filter(Boolean))];
    }

    // Your requested Mercator numbers
    const projection = d3.geoMercator().scale(850).center([89.8,21.5]).translate([430,290]);
    const path = d3.geoPath().projection(projection);

    const root = svg.append("g").attr("class","viewport");

    root.append("g").attr("class","states")
      .selectAll("path.state").data(features).enter().append("path")
      .attr("class","state").attr("d", path)
      .attr("id", d => d.properties?.[__NAME_KEY] ?? "")
      .attr("data-map", dayTag)
      .attr("stroke","#333").attr("stroke-width",1)
      .attr("fill", d => {
        const nm = d.properties?.[__NAME_KEY] ?? "";
        return (window.actualStateList||[]).includes(nm) ? "#ccc" : `url(#${hatch})`;
      })
      .on("mouseover", function(){ d3.select(this).attr("stroke-width",2.5); })
      .on("mouseout",  function(){ d3.select(this).attr("stroke-width",1); });

    // centroid cache for icons
    features.forEach(f => {
      const nm = f.properties?.[__NAME_KEY]; if(!nm) return;
      window.stateCentroids[nm] = path.centroid(f);
    });

    // After second map renders, build tables + first paint
    if (svgId === "indiaSubMapDay2"){
      ensureMainForecastTable();
      initializeForecastTable();
      addTableHoverSync();
      updateMapColors();
      updateMapIcons();
      // your subdivision table stays as-is (already in HTML; use window.subdivisions)
    }
  }catch(e){
    console.error("[Map] draw error:", e);
    alert("Map data could not be loaded. See console for details.");
  }
}

/****************************
 * MAIN FORECAST TABLE (auto-create if missing)
 ****************************/
function ensureMainForecastTable(){
  if (byId("forecast-table-body")) return;
  const host = document.querySelector("#pdf-area") || document.body;
  const h3 = document.createElement("h3");
  h3.textContent = "State / Sub-division Forecast";
  h3.style.margin = "16px 0 6px";
  const table = document.createElement("table");
  table.className = "forecast-table";
  table.innerHTML = `
    <thead><tr>
      <th>S. No.</th><th>Name</th><th>Day 1</th><th>Day 2</th>
    </tr></thead>
    <tbody id="forecast-table-body"></tbody>`;
  host.appendChild(h3); host.appendChild(table);
}

function initializeForecastTable(){
  const tbody = byId("forecast-table-body");
  if (!tbody) return;

  const fresh = tbody.cloneNode(false);
  tbody.parentNode.replaceChild(fresh, tbody);

  const list = window.actualStateList.slice().sort((a,b)=>a.localeCompare(b));
  const options = (window.forecastOptions||[]).map(o=>`<option value="${o}">${o}</option>`).join("");
  let serial = 1;

  list.forEach(name=>{
    const tr = document.createElement("tr");
    tr.setAttribute("data-name", name);
    tr.innerHTML = `
      <td>${serial++}</td>
      <td>${name}</td>
      <td><select class="sel day1"><option value="">— Select —</option>${options}</select></td>
      <td><select class="sel day2"><option value="">— Select —</option>${options}</select></td>`;
    fresh.appendChild(tr);
  });

  fresh.querySelectorAll("select.sel").forEach(sel=>{
    sel.addEventListener("change", ()=>{ updateMapColors(); updateMapIcons(); });
  });
}

/****************************
 * HOVER SYNC (table ↔ both maps)
 ****************************/
function addTableHoverSync(){
  const tbody = byId("forecast-table-body");
  if (!tbody) return;
  tbody.querySelectorAll("tr").forEach(tr=>{
    const nm = tr.getAttribute("data-name");
    tr.addEventListener("mouseenter", ()=>{ d3.selectAll(`[id='${cssEscape(nm)}']`).attr("stroke-width",2.5); });
    tr.addEventListener("mouseleave", ()=>{ d3.selectAll(`[id='${cssEscape(nm)}']`).attr("stroke-width",1); });
  });
}

/****************************
 * COLORING
 ****************************/
function updateMapColors(){
  const tbd = byId("forecast-table-body"); if(!tbd) return;
  const colorOf = v => (window.forecastColors||{})[v] || "#ccc";

  tbd.querySelectorAll("tr").forEach(tr=>{
    const nm = tr.getAttribute("data-name");
    const v1 = tr.querySelector(".day1")?.value || "";
    const v2 = tr.querySelector(".day2")?.value || "";
    d3.selectAll(`[id='${cssEscape(nm)}'][data-map='indiaSubMapDay1']`).attr("fill", colorOf(v1));
    d3.selectAll(`[id='${cssEscape(nm)}'][data-map='indiaSubMapDay2']`).attr("fill", colorOf(v2));
  });
}

/****************************
 * ICONS (emoji text)
 ****************************/
function updateMapIcons(){
  const icons = window.forecastIcons || {};
  const tbd = byId("forecast-table-body"); if(!tbd) return;

  d3.selectAll(".forecast-icon").remove();

  tbd.querySelectorAll("tr").forEach(tr=>{
    const nm = tr.getAttribute("data-name");
    const [cx, cy] = window.stateCentroids[nm] || [];
    if (cx == null) return;

    const v1 = tr.querySelector(".day1")?.value || "";
    const v2 = tr.querySelector(".day2")?.value || "";
    const i1 = icons[v1] || "";
    const i2 = icons[v2] || "";

    if (i1){
      d3.select("#indiaSubMapDay1 .viewport").append("text")
        .attr("class","forecast-icon").attr("x",cx).attr("y",cy)
        .attr("text-anchor","middle").attr("alignment-baseline","middle")
        .attr("font-size",18).text(i1);
    }
    if (i2){
      d3.select("#indiaSubMapDay2 .viewport").append("text")
        .attr("class","forecast-icon").attr("x",cx).attr("y",cy)
        .attr("text-anchor","middle").attr("alignment-baseline","middle")
        .attr("font-size",18).text(i2);
    }
  });
}

/****************************
 * BOOTSTRAP
 ****************************/
window.addEventListener("load", ()=>{
  if (typeof updateISTDate === "function") updateISTDate();
  drawIndiaMap("indiaSubMapDay1","indiaSubMapDay1").then(()=>{
    drawIndiaMap("indiaSubMapDay2","indiaSubMapDay2");
  });
});
