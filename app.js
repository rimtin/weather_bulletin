// === Sub-division coloring keyed by ST_NM (exact 20 items) ===

const W = 860, H = 580, PAD = 18;

// The field we match against in your GeoJSON:
const MATCH_KEY = "ST_NM";      // << your 20 labels are here
let STATE_KEY = "ST_NM";        // still useful to display
let NAME_KEY  = "name";         // district name (not used for matching)

// Per-map stores: normalized ST_NM -> nodes / centroid
const indexByName = { "#indiaMapDay1": new Map(), "#indiaMapDay2": new Map() };
const centroids   = { "#indiaMapDay1": {},         "#indiaMapDay2": {} };

// ---------- helpers ----------
const norm = s => String(s || "")
  .toLowerCase()
  .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .replace(/\s*&\s*/g, " and ")
  .replace(/\s*\([^)]*\)\s*/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function detectKeys(features){
  const sKeys = ["ST_NM","st_nm","STATE","STATE_UT","NAME_1","state_name","State"];
  const dKeys = ["name","NAME_2","Name","district","DISTRICT","dist_name"];
  const sample = features[0]?.properties || {};
  const all = Object.keys(sample);
  STATE_KEY = sKeys.find(k => k in sample) || STATE_KEY;
  NAME_KEY  = dKeys.find(k => k in sample) || NAME_KEY;
  console.log("[Map] keys:", { stateKey: STATE_KEY, districtKey: NAME_KEY, matchKey: MATCH_KEY });
}

function pickProjection(fc){
  const [[minX,minY],[maxX,maxY]] = d3.geoBounds(fc);
  const w = maxX - minX, h = maxY - minY;
  const lonlat = w < 200 && h < 120 && minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
  return lonlat
    ? d3.geoMercator().fitExtent([[PAD,PAD],[W-PAD,H-PAD]], fc)
    : d3.geoIdentity().reflectY(true).fitExtent([[PAD,PAD],[W-PAD,H-PAD]], fc);
}

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

// ---------- draw one map ----------
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
    const geo = await fetchFirst(GEO_URLS);
    features = (geo.type === "Topology")
      ? topojson.feature(geo, geo.objects[Object.keys(geo.objects)[0]]).features
      : (geo.features || []);
  }catch(e){
    alert("Could not load GeoJSON"); console.error(e); return;
  }
  if (!features.length){ alert("GeoJSON has 0 features"); return; }
  console.log("[Map] Features:", features.length);

  detectKeys(features);

  // projection
  const fc = { type:"FeatureCollection", features };
  const projection = pickProjection(fc);
  const path = d3.geoPath(projection);

  // draw districts (they all belong to some ST_NM "sub-division")
  const g = svg.append("g").attr("class","subdivs");
  const paths = g.selectAll("path").data(features).join("path")
    .attr("class","subdiv")
    .attr("data-st", d => d.properties?.[STATE_KEY] ?? "")
    .attr("data-name", d => d.properties?.[NAME_KEY]  ?? "")
    .attr("d", path)
    .attr("fill", "url(#diagonalHatch)")
    .on("mouseover", function(){ d3.select(this).raise(); });

  // index polygons by normalized ST_NM (this is the key we color by)
  const idx = new Map();
  const cents = {};
  paths.each(function(d){
    const key = norm(String(d.properties?.[MATCH_KEY] ?? ""));
    if (!key) return;
    (idx.get(key) || idx.set(key, []).get(key)).push(this);
    // Keep last centroid; (optional) could average if you prefer one icon per group.
    cents[key] = path.centroid(d);
  });
  indexByName[svgId] = idx;
  centroids[svgId]   = cents;

  if (svgId === "#indiaMapDay2"){
    buildFixedTable();                 // 20 rows from data.js (already matches ST_NM)
    document.querySelectorAll("#forecast-table-body select").forEach(sel => {
      if (sel.options.length && sel.selectedIndex < 0) sel.selectedIndex = 0;
    });
    updateMapColors();
  }
}

// ---------- table: fixed 20 ----------
function buildFixedTable(){
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const options = window.forecastOptions || [];
  let i = 1;

  (window.subdivisions || []).forEach(row => {
    const tr = document.createElement("tr");

    const s1 = document.createElement("select");
    const s2 = document.createElement("select");
    [s1,s2].forEach(sel=>{
      options.forEach(opt => {
        const o = document.createElement("option");
        o.value = opt; o.textContent = opt;
        sel.appendChild(o);
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

function highlight(label, on){
  const key = norm(label);
  ["#indiaMapDay1","#indiaMapDay2"].forEach(svgId=>{
    const nodes = indexByName[svgId]?.get(key);
    if (!nodes) return;
    nodes.forEach(n => {
      n.style.strokeWidth = on ? "2px" : "";
      n.style.filter = on ? "drop-shadow(0 0 4px rgba(0,0,0,0.4))" : "";
    });
  });
}

// ---------- coloring ----------
function updateMapColors(){
  const pal = window.forecastColors || {};
  const rows = Array.from(document.querySelectorAll("#forecast-table-body tr")).map(tr => {
    const label = tr.children[2]?.textContent?.trim();   // this must equal ST_NM
    const day1  = tr.children[3]?.querySelector("select")?.value || null;
    const day2  = tr.children[4]?.querySelector("select")?.value || null;
    return { key: norm(label), day1, day2, raw: label };
  });

  ["#indiaMapDay1","#indiaMapDay2"].forEach((svgId, idx) => {
    const dayKey = idx === 0 ? "day1" : "day2";
    const svg = d3.select(svgId);
    const idxMap = indexByName[svgId] || new Map();

    // reset
    svg.selectAll(".subdiv").attr("fill","url(#diagonalHatch)");
    svg.selectAll(".map-icon").remove();

    rows.forEach(rec => {
      const nodes = idxMap.get(rec.key);
      if (!nodes) { console.warn("[No match]", rec.raw); return; }
      const color = pal[rec[dayKey]] || "#eee";
      nodes.forEach(n => n.setAttribute("fill", color));

      // optional: one icon per (last) centroid
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

// ---------- init ----------
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
