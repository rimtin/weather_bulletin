// === Sub-division coloring with robust matching (aliases + fuzzy) ===

window._nameIndex = {};   // { svgId: Map<normName -> [DOM nodes]> }
window._centroids = {};   // { svgId: { normName -> [x,y] } }
const W = 860, H = 580, PAD = 18;

// ---------- helpers ----------
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

const getProp = (o, keys) => {
  if (!o) return "";
  for (const k of keys) if (o[k] != null && String(o[k]).trim() !== "") return String(o[k]);
  return "";
};

// detect keys from sample feature
function detectKeys(features) {
  const sKeys = ["ST_NM","st_nm","STATE","STATE_UT","NAME_1","state_name","State"];
  const dKeys = ["SUBDIV","SUBDIV_NAME","SUBDIVISION","SubDiv","SUBDIV_N","NAME_2","name","Name","Division","DIVISION","SUB_DIV","SUBDIVISION_NM","SUBDIV_NM"];
  const sample = features[0]?.properties || {};
  const all = Object.keys(sample);
  const stateKey = sKeys.find(k => k in sample) || all.find(k => /state/i.test(k)) || "STATE";
  const subdivKey = dKeys.find(k => k in sample) || all.find(k => /(sub|div|zone|region|name)/i.test(k)) || "name";
  return { stateKey, subdivKey };
}

// aliases for common short forms → IMD names
function aliasName(s) {
  let t = norm(s);
  t = t.replace(/\bup\b/g, "uttar pradesh");
  if (t === "rest of gujarat") t = "gujarat region";
  if (t === "north karnataka") t = "north interior karnataka";
  if (t === "south karnataka") t = "south interior karnataka";
  if (t === "north konkan" || t === "south konkan") t = "konkan and goa";
  if (t === "andhra pradesh") t = "coastal andhra pradesh";
  if (t.startsWith("rayalaseema")) t = "rayalaseema";
  if (t === "tamil nadu") t = "tamil nadu puducherry and karaikal";
  t = t.replace(/saurashtra\s*and\s*kutch/g, "saurashtra and kutch");
  return t;
}

// simple token Jaccard for fuzzy fallback
function jaccard(a, b) {
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size || 1;
  return inter / uni;
}
function bestMatch(key, idxMap, min = 0.5) {
  let bestK = null, best = 0;
  idxMap.forEach((_, k) => {
    const s = jaccard(key, k);
    if (s > best) { best = s; bestK = k; }
  });
  return best >= min ? bestK : null;
}

// fit projection that always works
function pickProjection(fc) {
  const [[minX,minY],[maxX,maxY]] = d3.geoBounds(fc);
  const w = maxX - minX, h = maxY - minY;
  const lonlat = w < 200 && h < 120 && minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
  return lonlat
    ? d3.geoMercator().fitExtent([[PAD,PAD],[W-PAD,H-PAD]], fc)
    : d3.geoIdentity().reflectY(true).fitExtent([[PAD,PAD],[W-PAD,H-PAD]], fc);
}

// ---------- data sources ----------
const SUBDIV_GEO_URLS = [
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

// ---------- map draw ----------
async function drawMap(svgId){
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // hatch for excluded
  const defs = svg.append("defs");
  defs.append("pattern")
    .attr("id","diagonalHatch").attr("patternUnits","userSpaceOnUse")
    .attr("width",6).attr("height",6)
    .append("path").attr("d","M0,0 l6,6").attr("stroke","#999").attr("stroke-width",1);

  // load features
  let features = [];
  try{
    const geo = await fetchFirst(SUBDIV_GEO_URLS);
    if (geo.type === "Topology"){
      const key = Object.keys(geo.objects)[0];
      features = topojson.feature(geo, geo.objects[key]).features;
    } else {
      features = geo.features || [];
    }
  }catch(e){
    alert("Could not load sub-division map data");
    console.error(e);
    return;
  }
  if (!features.length){ alert("GeoJSON has 0 features"); return; }
  console.log("[Map] Features:", features.length);

  const { stateKey, subdivKey } = detectKeys(features);
  console.log("[Map] keys:", { stateKey, subdivKey });

  // projection
  const fc = { type: "FeatureCollection", features };
  const projection = pickProjection(fc);
  const path = d3.geoPath(projection);

  // draw shapes
  const g = svg.append("g").attr("class","subdivs");
  const paths = g.selectAll("path").data(features).join("path")
    .attr("class","subdiv")
    .attr("data-subdiv", d => d.properties?.[subdivKey] ?? "")
    .attr("data-state",  d => d.properties?.[stateKey]  ?? "")
    .attr("d", path)
    .attr("fill", "url(#diagonalHatch)")
    .on("mouseover", function(){ d3.select(this).raise(); });

  // index by normalized name
  const idx = new Map();
  const cents = {};
  paths.each(function(d){
    const raw = d.properties?.[subdivKey];
    if (!raw) return;
    const k = norm(raw);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(this);
    cents[k] = path.centroid(d);
  });
  window._nameIndex[svgId] = idx;
  window._centroids[svgId] = cents;

  // after second map: build table + paint
  if (svgId === "#indiaMapDay2"){
    initializeForecastTable();
    // default selects to first option (so colors appear immediately)
    document.querySelectorAll("#forecast-table-body select").forEach(sel => { if (sel.options.length) sel.selectedIndex = 0; });
    updateMapColors();
  }
}

// ---------- table (controls) ----------
function initializeForecastTable(){
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
      opts.forEach(o=>{
        const op = document.createElement("option");
        op.value = o; op.textContent = o;
        sel.appendChild(op);
      });
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
  const key = aliasName(name);
  ["#indiaMapDay1","#indiaMapDay2"].forEach(svgId=>{
    const idx = window._nameIndex[svgId]; if (!idx) return;
    let nodes = idx.get(key) || idx.get(bestMatch(key, idx));
    if (!nodes) return;
    nodes.forEach(n => {
      n.style.strokeWidth = on ? "2px" : "";
      n.style.filter = on ? "drop-shadow(0 0 4px rgba(0,0,0,0.4))" : "";
    });
  });
}

// ---------- coloring ----------
function updateMapColors(){
  const rows = Array.from(document.querySelectorAll("#forecast-table-body tr"));
  const selections = rows.map(tr => {
    const name = tr.children[2]?.textContent?.trim();
    const day1 = tr.children[3]?.querySelector("select")?.value || null;
    const day2 = tr.children[4]?.querySelector("select")?.value || null;
    return { key: aliasName(name), day1, day2, raw: name };
  });

  const pal = window.forecastColors || {};

  ["#indiaMapDay1","#indiaMapDay2"].forEach((svgId,idx)=>{
    const dayKey = idx===0 ? "day1" : "day2";
    const idxMap = window._nameIndex[svgId]; if (!idxMap) return;

    // reset all to hatch
    d3.select(svgId).selectAll(".subdiv").attr("fill", "url(#diagonalHatch)");

    // color selections
    selections.forEach(rec=>{
      let nodes = idxMap.get(rec.key);
      if (!nodes) {
        const candidate = bestMatch(rec.key, idxMap);
        if (candidate) nodes = idxMap.get(candidate);
      }
      if (!nodes) { console.warn("[No match]", rec.raw); return; }
      const color = pal[rec[dayKey]] || "#eee";
      nodes.forEach(n => n.setAttribute("fill", color));
    });

    // icons
    drawIcons(svgId, selections, dayKey, idxMap);
  });
}

function drawIcons(svgId, selections, dayKey, idxMap){
  const icons = window.forecastIcons || {};
  const cents = window._centroids[svgId] || {};
  const svg = d3.select(svgId);
  svg.selectAll(".map-icon").remove();

  selections.forEach(rec=>{
    const icon = icons[rec[dayKey]];
    if (!icon) return;
    const k = idxMap.has(rec.key) ? rec.key : bestMatch(rec.key, idxMap);
    if (!k) return;
    const c = cents[k]; if (!c) return;
    svg.append("text")
      .attr("class","map-icon")
      .attr("x", c[0]).attr("y", c[1])
      .attr("text-anchor","middle")
      .attr("alignment-baseline","middle")
      .attr("font-size",18)
      .text(icon);
  });
}

// ---------- init ----------
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
