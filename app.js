// === Sub-division coloring for exactly the 20 provided names ===

const W = 860, H = 580, PAD = 18;
let SUBDIV_KEY = "name";      // detected from GeoJSON
let STATE_KEY  = "ST_NM";     // detected from GeoJSON

// Per-map stores
const nameIndex   = { "#indiaMapDay1": new Map(), "#indiaMapDay2": new Map() }; // norm(name) -> [DOM nodes]
const centroids   = { "#indiaMapDay1": {},         "#indiaMapDay2": {} };        // norm(name) -> [x,y]

// ---- helpers ----
const cssEscape = s => (window.CSS && CSS.escape) ? CSS.escape(String(s ?? "")) :
  String(s ?? "").replace(/'/g,"\\'").replace(/\"/g,'\\\"');

const norm = s => String(s || "")
  .toLowerCase()
  .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .replace(/\s*&\s*/g, " and ")
  .replace(/\s*\([^)]*\)\s*/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// Small alias to absorb the usual spelling differences if they exist
function aliasKey(s) {
  let t = norm(s);
  // handle Kachh/Kachchh/Kutch variants gracefully
  t = t.replace(/\bkachh\b/g, "kachchh").replace(/\bkutch\b/g, "kachchh");
  // NI/SI punctuation collapses to tokens by norm(), so fine.
  return t;
}

function detectKeys(features) {
  const sKeys = ["ST_NM","st_nm","STATE","STATE_UT","NAME_1","state_name","State"];
  const dKeys = ["name","SUBDIV","SUBDIV_NAME","SUBDIVISION","Division","SUB_DIV","NAME_2","Name","DIVISION"];
  const sample = features[0]?.properties || {};
  const all = Object.keys(sample);
  STATE_KEY  = sKeys.find(k => k in sample) || all.find(k => /state/i.test(k)) || STATE_KEY;
  SUBDIV_KEY = dKeys.find(k => k in sample) || all.find(k => /(name|div|zone|region)/i.test(k)) || SUBDIV_KEY;
  console.log("[Map] keys:", { stateKey: STATE_KEY, subdivKey: SUBDIV_KEY });
}

function pickProjection(fc) {
  const [[minX,minY],[maxX,maxY]] = d3.geoBounds(fc);
  const w = maxX - minX, h = maxY - minY;
  const lonlat = w < 200 && h < 120 && minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
  return lonlat
    ? d3.geoMercator().fitExtent([[PAD,PAD],[W-PAD,H-PAD]], fc)
    : d3.geoIdentity().reflectY(true).fitExtent([[PAD,PAD],[W-PAD,H-PAD]], fc);
}

// Data sources
const GEO_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "weather_bulletin/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

async function fetchFirst(urls){
  for (const url of urls){
    try{
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      console.log("[Map] Loaded:", url);
      return j;
    }catch{}
  }
  throw new Error("No GeoJSON found");
}

// ---- draw one map ----
async function drawMap(svgId){
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // hatch
  const defs = svg.append("defs");
  defs.append("pattern")
    .attr("id","diagonalHatch").attr("patternUnits","userSpaceOnUse")
    .attr("width",6).attr("height",6)
    .append("path").attr("d","M0,0 l6,6").attr("stroke","#999").attr("stroke-width",1);

  // load features
  let features = [];
  try{
    const geo = await fetchFirst(GEO_URLS);
    features = (geo.type === "Topology")
      ? topojson.feature(geo, geo.objects[Object.keys(geo.objects)[0]]).features
      : (geo.features || []);
  }catch(e){
    alert("Could not load sub-division map data"); console.error(e); return;
  }
  if (!features.length){ alert("GeoJSON has 0 features"); return; }
  console.log("[Map] Features:", features.length);

  detectKeys(features);

  // projection
  const fc = { type:"FeatureCollection", features };
  const projection = pickProjection(fc);
  const path = d3.geoPath(projection);

  // draw shapes
  const g = svg.append("g").attr("class","subdivs");
  const paths = g.selectAll("path").data(features).join("path")
    .attr("class","subdiv")
    .attr("data-state", d => d.properties?.[STATE_KEY]  ?? "")
    .attr("data-name",  d => d.properties?.[SUBDIV_KEY] ?? "")
    .attr("d", path)
    .attr("fill", "url(#diagonalHatch)")
    .on("mouseover", function(){ d3.select(this).raise(); });

  // index polygons by normalized name
  const idx = new Map();
  const cents = {};
  paths.each(function(d){
    const raw = d.properties?.[SUBDIV_KEY];
    if (!raw) return;
    const k = aliasKey(raw);
    (idx.get(k) || idx.set(k, []).get(k)).push(this);
    cents[k] = path.centroid(d);
  });
  nameIndex[svgId] = idx;
  centroids[svgId] = cents;

  // after second map, build the fixed 20-row table and paint
  if (svgId === "#indiaMapDay2") {
    buildFixedTable();
    // Pre-select the first palette value so colors appear immediately
    document.querySelectorAll("#forecast-table-body select").forEach(sel => { if (sel.options.length) sel.selectedIndex = 0; });
    updateMapColors();
  }
}

// ---- table (fixed 20) ----
function buildFixedTable(){
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const opts = window.forecastOptions || [];
  let i = 1;

  (window.subdivisions || []).forEach(row => {
    const tr = document.createElement("tr");

    const s1 = document.createElement("select");
    const s2 = document.createElement("select");
    [s1,s2].forEach(sel=>{
      opts.forEach(o=>{ const op = document.createElement("option"); op.value=o; op.textContent=o; sel.appendChild(op); });
      sel.addEventListener("change", updateMapColors);
    });

    tr.innerHTML = `
      <td>${i++}</td>
      <td>${row.state}</td>
      <td>${row.name}</td>
    `;
    const td1 = document.createElement("td");
    const td2 = document.createElement("td");
    td1.appendChild(s1); td2.appendChild(s2);
    tr.appendChild(td1); tr.appendChild(td2);

    tr.addEventListener("mouseenter", () => highlight(row.name, true));
    tr.addEventListener("mouseleave", () => highlight(row.name, false));

    tbody.appendChild(tr);
  });
}

function highlight(name, on){
  const key = aliasKey(name);
  ["#indiaMapDay1","#indiaMapDay2"].forEach(svgId=>{
    const idx = nameIndex[svgId]; if (!idx) return;
    const nodes = idx.get(key); if (!nodes) return;
    nodes.forEach(n => {
      n.style.strokeWidth = on ? "2px" : "";
      n.style.filter = on ? "drop-shadow(0 0 4px rgba(0,0,0,0.4))" : "";
    });
  });
}

// ---- coloring ----
function updateMapColors(){
  const rows = Array.from(document.querySelectorAll("#forecast-table-body tr"));
  const selections = rows.map(tr => {
    const name = tr.children[2]?.textContent?.trim();
    const day1 = tr.children[3]?.querySelector("select")?.value || null;
    const day2 = tr.children[4]?.querySelector("select")?.value || null;
    return { key: aliasKey(name), day1, day2, raw: name };
  });

  const pal = window.forecastColors || {};

  ["#indiaMapDay1","#indiaMapDay2"].forEach((svgId,idx)=>{
    const dayKey = idx===0 ? "day1" : "day2";
    const idxMap = nameIndex[svgId]; if (!idxMap) return;
    const svg = d3.select(svgId);

    // reset to hatch
    svg.selectAll(".subdiv").attr("fill","url(#diagonalHatch)");
    svg.selectAll(".map-icon").remove();

    selections.forEach(rec=>{
      const nodes = idxMap.get(rec.key);
      if (!nodes) { console.warn("[No match]", rec.raw); return; }
      const color = pal[rec[dayKey]] || "#eee";
      nodes.forEach(n => n.setAttribute("fill", color));

      // place one icon per polygon centroid
      const c = centroids[svgId][rec.key];
      const icon = (window.forecastIcons || {})[rec[dayKey]];
      if (c && icon) {
        svg.append("text")
          .attr("class","map-icon")
          .attr("x", c[0]).attr("y", c[1])
          .attr("text-anchor","middle")
          .attr("alignment-baseline","middle")
          .attr("font-size",18)
          .text(icon);
      }
    });
  });
}

// ---- init ----
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
