// === Map coloring that works with your district GeoJSON ===
// If a district→subdivision CSV is found, we color by your 20 sub-divisions.
// Otherwise we fall back to coloring each district directly (so you see colors now).

// Globals
const W = 860, H = 580, PAD = 18;
let g_features = [];                 // GeoJSON features
let g_stateKey = "ST_NM";            // detected state field
let g_nameKey  = "name";             // detected district (feature name) field
let g_hasMapping = false;            // true if CSV was found
let g_map = new Map();               // (state||district) -> subdivision label (normalized)
let g_centroids = { "#indiaMapDay1": {}, "#indiaMapDay2": {} }; // per map, centroid by (state||district)
let g_index     = { "#indiaMapDay1": new Map(), "#indiaMapDay2": new Map() }; // per map, norm(name)->[nodes]

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

// detect keys from a sample feature
function detectKeys(features) {
  const sKeys = ["ST_NM","st_nm","STATE","STATE_UT","NAME_1","state_name","State"];
  const dKeys = ["SUBDIV","SUBDIV_NAME","SUBDIVISION","SubDiv","SUBDIV_N","NAME_2","name","Name","Division","DIVISION","SUB_DIV","SUBDIVISION_NM","SUBDIV_NM"];
  const sample = features[0]?.properties || {};
  const all = Object.keys(sample);
  g_stateKey = sKeys.find(k => k in sample) || all.find(k => /state/i.test(k)) || "STATE";
  g_nameKey  = dKeys.find(k => k in sample) || all.find(k => /(name|district|sub|div|zone|region)/i.test(k)) || "name";
  console.log("[Map] keys:", { stateKey: g_stateKey, subdivKey: g_nameKey });
}

// alias your short labels → IMD official names (so CSV & table align)
function aliasSubdivLabel(s) {
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
const GEO_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "weather_bulletin/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];
// CSV: state,district,subdivision  (see example below)
const CSV_URLS = [
  "district_to_subdiv.csv",
  "assets/district_to_subdiv.csv",
  "weather_bulletin/district_to_subdiv.csv",
  "https://rimtin.github.io/weather_bulletin/district_to_subdiv.csv",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/district_to_subdiv.csv",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/district_to_subdiv.csv"
];

async function fetchFirstJSON(urls){
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
async function fetchFirstCSV(urls){
  for (const url of urls){
    try{
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const txt = await r.text();
      const rows = d3.csvParse(txt);
      console.log("[Map] Mapping CSV:", url, `(${rows.length} rows)`);
      return rows;
    }catch{}
  }
  return null; // mapping is optional
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
    const geo = await fetchFirstJSON(GEO_URLS);
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

  // detect keys
  detectKeys(features);
  g_features = features;

  // projection
  const fc = { type: "FeatureCollection", features };
  const projection = pickProjection(fc);
  const path = d3.geoPath(projection);

  // draw shapes
  const g = svg.append("g").attr("class","subdivs");
  const paths = g.selectAll("path").data(features).join("path")
    .attr("class","subdiv")
    .attr("data-state",  d => d.properties?.[g_stateKey] ?? "")
    .attr("data-name",   d => d.properties?.[g_nameKey]  ?? "")
    .attr("d", path)
    .attr("fill", "url(#diagonalHatch)")
    .on("mouseover", function(){ d3.select(this).raise(); });

  // index + centroids (by "state||district")
  const idx = new Map();
  const cents = {};
  paths.each(function(d){
    const state = String(d.properties?.[g_stateKey] ?? "");
    const name  = String(d.properties?.[g_nameKey]  ?? "");
    const key = `${norm(state)}||${norm(name)}`;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(this);
    cents[key] = path.centroid(d);
  });
  g_index[svgId] = idx;
  g_centroids[svgId] = cents;

  // after second map: load optional CSV, build table, paint
  if (svgId === "#indiaMapDay2"){
    await loadMappingCSV();        // sets g_hasMapping & g_map
    buildControlsTable();          // table from mapping or from GeoJSON
    // default selects to first option (so colors appear immediately)
    document.querySelectorAll("#forecast-table-body select").forEach(sel => { if (sel.options.length) sel.selectedIndex = 0; });
    updateMapColors();
  }
}

// ---------- optional CSV mapping (district -> sub-division) ----------
async function loadMappingCSV() {
  const rows = await fetchFirstCSV(CSV_URLS);
  g_map.clear();
  g_hasMapping = !!rows && rows.length > 0;

  if (!g_hasMapping) {
    console.warn("[Map] No district_to_subdiv.csv found — fallback to district-level coloring.");
    return;
  }
  // Expect columns: state, district, subdivision
  rows.forEach(r => {
    const s = norm(r.state);
    const d = norm(r.district);
    const sub = aliasSubdivLabel(r.subdivision); // normalize user/IMD names
    if (!s || !d || !sub) return;
    g_map.set(`${s}||${d}`, sub);
  });
}

// ---------- table (controls) ----------
function buildControlsTable(){
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const opts = window.forecastOptions || [];

  if (g_hasMapping) {
    // use the desired sub-division list from data.js, normalized via aliasSubdivLabel
    let i = 1;
    (window.subdivisions || []).forEach(row => {
      const label = row.name;                       // e.g., "West UP"
      const imd   = aliasSubdivLabel(label);       // e.g., "West Uttar Pradesh"
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
        <td>${label}</td>
      `;
      const td1 = document.createElement("td");
      const td2 = document.createElement("td");
      td1.appendChild(s1); td2.appendChild(s2);
      tr.appendChild(td1); tr.appendChild(td2);

      tr.dataset.group = imd; // store normalized IMD label for fast lookup
      tbody.appendChild(tr);
    });

  } else {
    // CSV not present: build a table from the GeoJSON districts so colors work immediately
    let i = 1;
    // make a unique list of (state, district) pairs
    const seen = new Set();
    g_features.forEach(f => {
      const s = String(f.properties?.[g_stateKey] ?? "");
      const n = String(f.properties?.[g_nameKey]  ?? "");
      const k = `${s}||${n}`;
      if (seen.has(k)) return;
      seen.add(k);

      const tr = document.createElement("tr");
      const s1 = document.createElement("select");
      const s2 = document.createElement("select");
      [s1,s2].forEach(sel=>{
        opts.forEach(o=>{ const op = document.createElement("option"); op.value=o; op.textContent=o; sel.appendChild(op); });
        sel.addEventListener("change", updateMapColors);
      });

      tr.innerHTML = `
        <td>${i++}</td>
        <td>${s}</td>
        <td>${n}</td>
      `;
      const td1 = document.createElement("td");
      const td2 = document.createElement("td");
      td1.appendChild(s1); td2.appendChild(s2);
      tr.appendChild(td1); tr.appendChild(td2);
      // store the exact key this row controls
      tr.dataset.state = s;
      tr.dataset.name  = n;
      tbody.appendChild(tr);
    });
  }
}

// ---------- coloring ----------
function updateMapColors(){
  const pal = window.forecastColors || {};

  if (g_hasMapping) {
    // Build group selections from table rows (IMD labels)
    const selections = Array.from(document.querySelectorAll("#forecast-table-body tr")).map(tr => {
      const group = tr.dataset.group; // normalized IMD name
      const day1 = tr.children[3]?.querySelector("select")?.value || null;
      const day2 = tr.children[4]?.querySelector("select")?.value || null;
      return { group, day1, day2 };
    });

    ["#indiaMapDay1","#indiaMapDay2"].forEach((svgId,idx)=>{
      const dayKey = idx===0 ? "day1" : "day2";
      // reset to hatch
      d3.select(svgId).selectAll(".subdiv").attr("fill","url(#diagonalHatch)");

      // color districts whose mapping falls into each selected group
      const idxMap = g_index[svgId];
      const cents = g_centroids[svgId];
      const svg = d3.select(svgId);
      svg.selectAll(".map-icon").remove();

      selections.forEach(sel=>{
        const color = pal[sel[dayKey]] || "#eee";
        // paint all districts mapped to this group
        g_map.forEach((subdiv, key) => {
          if (subdiv !== sel.group) return;
          const nodes = idxMap.get(key);
          if (!nodes) return;
          nodes.forEach(n => n.setAttribute("fill", color));
          // icon (one per district centroid)
          const c = cents[key];
          if (c && window.forecastIcons && window.forecastIcons[sel[dayKey]]) {
            svg.append("text")
              .attr("class","map-icon")
              .attr("x", c[0]).attr("y", c[1])
              .attr("text-anchor","middle")
              .attr("alignment-baseline","middle")
              .attr("font-size",18)
              .text(window.forecastIcons[sel[dayKey]]);
          }
        });
      });
    });

  } else {
    // No CSV mapping: color districts directly from rows
    const selections = Array.from(document.querySelectorAll("#forecast-table-body tr")).map(tr => {
      const s = tr.dataset.state || tr.children[1]?.textContent?.trim() || "";
      const n = tr.dataset.name  || tr.children[2]?.textContent?.trim() || "";
      const day1 = tr.children[3]?.querySelector("select")?.value || null;
      const day2 = tr.children[4]?.querySelector("select")?.value || null;
      return { key: `${norm(s)}||${norm(n)}`, day1, day2 };
    });

    ["#indiaMapDay1","#indiaMapDay2"].forEach((svgId,idx)=>{
      const dayKey = idx===0 ? "day1" : "day2";
      const idxMap = g_index[svgId];
      const svg = d3.select(svgId);
      svg.selectAll(".map-icon").remove();
      d3.select(svgId).selectAll(".subdiv").attr("fill","url(#diagonalHatch)");

      selections.forEach(sel=>{
        const nodes = idxMap.get(sel.key);
        if (!nodes) return;
        const color = pal[sel[dayKey]] || "#eee";
        nodes.forEach(n => n.setAttribute("fill", color));
        const c = g_centroids[svgId][sel.key];
        if (c && window.forecastIcons && window.forecastIcons[sel[dayKey]]) {
          svg.append("text")
            .attr("class","map-icon")
            .attr("x", c[0]).attr("y", c[1])
            .attr("text-anchor","middle")
            .attr("alignment-baseline","middle")
            .attr("font-size",18)
            .text(window.forecastIcons[sel[dayKey]]);
        }
      });
    });
  }
}

// ---------- init ----------
window.onload = async () => {
  if (typeof updateISTDate === "function") updateISTDate();
  await drawMap("#indiaMapDay1");
  await drawMap("#indiaMapDay2");
};
