/****************************
 * CONFIG – TopoJSON (states)
 ****************************/
const TOPO_URLS = [
  "india.json",
  "assets/india.json",
  "https://rimtin.github.io/weather_bulletin/india.json",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/india.json",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/india.json"
];

/****************************
 * RUNTIME CACHES
 ****************************/
let __statesFC = null; // GeoJSON FeatureCollection of states
window.stateCentroids = window.stateCentroids || {};
window.actualStateList = (window.states || []).slice(); // allowed states clone

/****************************
 * HELPERS
 ****************************/
const cssEscape = s =>
  (window.CSS && CSS.escape) ? CSS.escape(String(s ?? "")) : String(s ?? "").replace(/'/g,"\\'").replace(/"/g,'\\"');

function byId(id){ return document.getElementById(id); }

async function loadStatesTopo(){
  if (__statesFC) return __statesFC;
  let last;
  for (const u of TOPO_URLS){
    try{
      const url = u + (u.includes("?")?"&":"?") + "v=" + Date.now();
      const r = await fetch(url, {cache:"no-store"});
      if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const topo = await r.json();
      const obj = topo.objects?.states || Object.values(topo.objects||{})[0];
      if(!obj) throw new Error("No TopoJSON object named 'states'");
      const fc = (window.topojson||topojson).feature(topo, obj);
      if(!Array.isArray(fc.features) || !fc.features.length) throw new Error("Empty features");
      __statesFC = {type:"FeatureCollection", features: fc.features};
      console.info("[TopoJSON] states:", fc.features.length);
      return __statesFC;
    }catch(e){ console.warn("[TopoJSON] failed:", u, e); last=e; }
  }
  throw last || new Error("All india.json URLs failed");
}

function ensureDiagonalHatch(svg){
  const id="diagonalHatch";
  if(!svg.select("#"+id).empty()) return id;
  let defs=svg.select("defs"); if(defs.empty()) defs=svg.append("defs");
  const p=defs.append("pattern").attr("id",id)
    .attr("patternUnits","userSpaceOnUse").attr("width",6).attr("height",6);
  p.append("path").attr("d","M0,0 l6,6").attr("stroke","#999").attr("stroke-width",1);
  return id;
}

/****************************
 * DRAW ONE MAP
 * - svgId: "indiaSubMapDay1" / "indiaSubMapDay2"  (your current HTML ids)
 * - dayTag: same string saved in data-map (so both maps can coexist)
 ****************************/
async function drawIndiaMap(svgId, dayTag){
  const svg = d3.select("#"+svgId);
  if (svg.empty()){ console.error("Missing SVG:", svgId); return; }
  svg.selectAll("*").remove();

  const hatchId = ensureDiagonalHatch(svg);

  // —— EXACT Mercator numbers requested ——
  const projection = d3.geoMercator()
    .scale(850)
    .center([89.8, 21.5])
    .translate([430, 290]);
  const path = d3.geoPath().projection(projection);

  try{
    const fc = await loadStatesTopo();
    const feats = fc.features;

    // Default allowed-state list if none provided
    if (!window.actualStateList.length){
      window.actualStateList = feats.map(f => f.properties?.st_nm).filter(Boolean);
    }

    const root = svg.append("g").attr("class","viewport");

    // Paths (stroke + base fill)
    const statesG = root.append("g").attr("class","states");
    statesG.selectAll("path.state")
      .data(feats)
      .enter()
      .append("path")
      .attr("class","state")
      .attr("d", path)
      .attr("id", d => d.properties?.st_nm ?? "")
      .attr("data-map", dayTag)
      .attr("stroke", "#333").attr("stroke-width", 1)
      .attr("fill", d => {
        const nm = d.properties?.st_nm ?? "";
        return (window.actualStateList || []).includes(nm) ? "#ccc" : `url(#${hatchId})`;
      })
      .on("mouseover", function(){ d3.select(this).attr("stroke-width", 2.5); })
      .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 1); });

    // Cache centroids for icons
    feats.forEach(f => {
      const nm = f.properties?.st_nm; if(!nm) return;
      const [cx, cy] = path.centroid(f);
      window.stateCentroids[nm] = [cx, cy];
    });

    // If this is the second map, bootstrap tables/colors/icons now
    if (svgId === "indiaSubMapDay2"){
      ensureMainForecastTable();
      initializeForecastTable();
      addTableHoverSync();
      updateMapColors();
      updateMapIcons();
      // keep your subdivision table as-is (already in HTML)
    }
  }catch(e){
    console.error("[Map] draw error:", e);
    alert("Could not load India map (india.json). Check console.");
  }
}

/****************************
 * MAIN FORECAST TABLE (states)
 ****************************/
function ensureMainForecastTable(){
  if (byId("forecast-table-body")) return;

  // create a compact table under the maps if it doesn't exist
  const wrap = document.querySelector("#pdf-area") || document.body;
  const h3 = document.createElement("h3");
  h3.textContent = "State Forecast";
  h3.style.margin = "16px 0 6px";
  const table = document.createElement("table");
  table.className = "forecast-table";
  table.innerHTML = `
    <thead>
      <tr><th>S. No.</th><th>State</th><th>Day 1</th><th>Day 2</th></tr>
    </thead>
    <tbody id="forecast-table-body"></tbody>
  `;
  wrap.appendChild(h3);
  wrap.appendChild(table);
}

function initializeForecastTable(){
  const tbody = byId("forecast-table-body");
  if (!tbody) return;

  // reset listeners by cloning tbody
  const fresh = tbody.cloneNode(false);
  tbody.parentNode.replaceChild(fresh, tbody);

  const list = (window.actualStateList || []).slice();
  let serial = 1;

  const options = (window.forecastOptions || []).map(o => `<option value="${o}">${o}</option>`).join("");

  list.forEach(st => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-state", st);
    tr.innerHTML = `
      <td>${serial++}</td>
      <td>${st}</td>
      <td><select class="sel day1"><option value="">— Select —</option>${options}</select></td>
      <td><select class="sel day2"><option value="">— Select —</option>${options}</select></td>
    `;
    fresh.appendChild(tr);
  });

  fresh.querySelectorAll("select.sel").forEach(sel => {
    sel.addEventListener("change", () => { updateMapColors(); updateMapIcons(); });
  });
}

/****************************
 * TABLE ↔ MAP HOVER SYNC
 ****************************/
function addTableHoverSync(){
  const tbody = byId("forecast-table-body");
  if (!tbody) return;

  tbody.querySelectorAll("tr").forEach(tr => {
    const st = tr.getAttribute("data-state");
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(`[id='${cssEscape(st)}']`).attr("stroke-width", 2.5);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(`[id='${cssEscape(st)}']`).attr("stroke-width", 1);
    });
  });
}

/****************************
 * COLORING
 ****************************/
function updateMapColors(){
  const tbd = byId("forecast-table-body"); if(!tbd) return;
  const colorOf = v => (window.forecastColors||{})[v] || "#ccc";

  tbd.querySelectorAll("tr").forEach(tr => {
    const st = tr.getAttribute("data-state");
    const v1 = tr.querySelector(".day1")?.value || "";
    const v2 = tr.querySelector(".day2")?.value || "";

    d3.selectAll(`[id='${cssEscape(st)}'][data-map='indiaSubMapDay1']`).attr("fill", colorOf(v1));
    d3.selectAll(`[id='${cssEscape(st)}'][data-map='indiaSubMapDay2']`).attr("fill", colorOf(v2));
  });
}

/****************************
 * ICONS (emoji as <text>)
 ****************************/
function updateMapIcons(){
  const icons = window.forecastIcons || {};
  const tbd = byId("forecast-table-body"); if(!tbd) return;

  d3.selectAll(".forecast-icon").remove();

  tbd.querySelectorAll("tr").forEach(tr => {
    const st = tr.getAttribute("data-state");
    const [cx, cy] = window.stateCentroids[st] || [];
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
window.addEventListener("load", () => {
  if (typeof updateISTDate === "function") updateISTDate();

  // draw into your EXISTING SVG ids
  drawIndiaMap("indiaSubMapDay1", "indiaSubMapDay1").then(() => {
    drawIndiaMap("indiaSubMapDay2", "indiaSubMapDay2");
  });
});
