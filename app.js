// === Sub-division coloring by ST_NM (exact 20) with aligned icons + per-map legends ===

const W = 860, H = 580, PAD = 18;
const MATCH_KEY = "ST_NM"; // your 20 labels live here
let STATE_KEY = "ST_NM";
let NAME_KEY  = "name";

// Per-map stores
const indexByGroup  = { "#indiaMapDay1": new Map(), "#indiaMapDay2": new Map() }; // norm(ST_NM) -> [paths]
const groupCentroid = { "#indiaMapDay1": {}, "#indiaMapDay2": {} };                // norm(ST_NM) -> [x,y]

// (optional) small nudges per group if any icon needs a tiny tweak
const ICON_OFFSETS = {
  // "tamil nadu and puducherry": { dx: 6, dy: -8 }
};

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

function ensureLayer(svg, className){
  let g = svg.select(`.${className}`);
  if (g.empty()) g = svg.append("g").attr("class", className);
  return g;
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

// ---------- legends ----------
function drawLegend(svg, title){
  svg.selectAll(".map-legend").remove();

  const pal = window.forecastColors || {};
  const labels = window.forecastOptions || Object.keys(pal);
  const pad = 10, sw = 18, gap = 18;
  const width = 200;
  const height = pad + 18 + labels.length * gap + pad;

  const g = svg.append("g")
    .attr("class", "map-legend")
    .attr("transform", `translate(${W - width - 12}, ${H - height - 12})`);

  g.append("rect")
    .attr("width", width).attr("height", height)
    .attr("rx", 10).attr("ry", 10)
    .attr("fill", "rgba(255,255,255,0.92)")
    .attr("stroke", "#cfcfcf");

  g.append("text")
    .attr("x", pad).attr("y", pad + 14)
    .attr("font-weight", 700).attr("font-size", 13)
    .text(title);

  labels.forEach((label, i) => {
    const y = pad + 28 + i * gap;
    g.append("rect")
      .attr("x", pad).attr("y", y - 12).attr("width", sw).attr("height", 12)
      .attr("fill", pal[label] || "#eee").attr("stroke", "#999");
    g.append("text")
      .attr("x", pad + sw + 8).attr("y", y - 2)
      .attr("font-size", 12)
      .text(label);
  });
}

// ---------- draw one map ----------
async function drawMap(svgId){
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // layers (order: fills -> icons -> legend)
  const defs = svg.append("defs");
  defs.append("pattern")
    .attr("id","diagonalHatch").attr("patternUnits","userSpaceOnUse")
    .attr("width",6).attr("height",6)
    .append("path").attr("d","M0,0 l6,6").attr("stroke","#999").attr("stroke-width",1);

  const fillLayer = ensureLayer(svg, "fill-layer");
  const iconLayer = ensureLayer(svg, "icon-layer").style("pointer-events","none");

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

  // draw
  const paths = fillLayer.selectAll("path").data(features).join("path")
    .attr("class","subdiv")
    .attr("data-st", d => d.properties?.[STATE_KEY] ?? "")
    .attr("data-d",  d => d.properties?.[NAME_KEY]  ?? "")
    .attr("d", path)
    .attr("fill", "url(#diagonalHatch)")
    .attr("stroke", "#666").attr("stroke-width", 0.7)
    .on("mouseover", function(){ d3.select(this).raise(); });

  // build group index & one centroid per ST_NM
  const idx = new Map();
  const groups = new Map();
  paths.each(function(d){
    const key = norm(String(d.properties?.[MATCH_KEY] ?? ""));
    if (!key) return;
    (idx.get(key) || idx.set(key, []).get(key)).push(this);
    (groups.get(key) || groups.set(key, []).get(key)).push(d);
  });
  indexByGroup[svgId] = idx;

  groupCentroid[svgId] = {};
  groups.forEach((arr, key) => {
    const groupFC = { type: "FeatureCollection", features: arr };
    // true geographic centroid → project to screen coords
    const lonLat = d3.geoCentroid(groupFC);
    let [x, y] = projection(lonLat);
    const off = ICON_OFFSETS[key];
    if (off) { x += off.dx || 0; y += off.dy || 0; }
    groupCentroid[svgId][key] = [x, y];
  });

  // legend
  drawLegend(svg, svgId === "#indiaMapDay1" ? "Index — Day 1" : "Index — Day 2");

  if (svgId === "#indiaMapDay2"){
    buildFixedTable();
    document.querySelectorAll("#forecast-table-body select").forEach(sel => {
      if (sel.options.length && sel.selectedIndex < 0) sel.selectedIndex = 0;
    });
    updateMapColors();
  }
}

// ---------- table: fixed 20 (from data.js) ----------
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
    const nodes = indexByGroup[svgId]?.get(key);
    if (!nodes) return;
    nodes.forEach(n => {
      n.style.strokeWidth = on ? "2px" : "";
      n.style.filter = on ? "drop-shadow(0 0 4px rgba(0,0,0,0.4))" : "";
    });
  });
}

// ---------- coloring + icons (always create/clear icon-layer safely) ----------
function updateMapColors(){
  const pal = window.forecastColors || {};
  const icons = window.forecastIcons || {};

  const rows = Array.from(document.querySelectorAll("#forecast-table-body tr")).map(tr => {
    const label = tr.children[2]?.textContent?.trim();   // this equals ST_NM
    const day1  = tr.children[3]?.querySelector("select")?.value || null;
    const day2  = tr.children[4]?.querySelector("select")?.value || null;
    return { key: norm(label), day1, day2, raw: label };
  });

  ["#indiaMapDay1","#indiaMapDay2"].forEach((svgId, idx) => {
    const dayKey = idx === 0 ? "day1" : "day2";
    const svg = d3.select(svgId);
    const idxMap = indexByGroup[svgId] || new Map();

    // reset fills
    svg.selectAll(".subdiv").attr("fill","url(#diagonalHatch)");

    // ensure + clear icon layer
    const gIcons = ensureLayer(svg, "icon-layer").style("pointer-events","none");
    gIcons.selectAll("*").remove();

    rows.forEach(rec => {
      const nodes = idxMap.get(rec.key);
      if (!nodes) { console.warn("[No match]", rec.raw); return; }
      const color = pal[rec[dayKey]] || "#eee";
      nodes.forEach(n => n.setAttribute("fill", color));

      const pos = groupCentroid[svgId][rec.key];
      if (!pos) return;
      const [x,y] = pos;

      // dot (always visible)
      gIcons.append("circle")
        .attr("cx", x).attr("cy", y).attr("r", 5.5)
        .attr("fill", "#f5a623").attr("stroke","#fff").attr("stroke-width",1.3);

      // emoji (on top of dot)
      const emoji = icons[rec[dayKey]];
      if (emoji) {
        gIcons.append("text")
          .attr("x", x).attr("y", y)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("font-size", 18)
          .attr("font-family", `"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`)
          .attr("paint-order", "stroke")
          .attr("stroke", "white").attr("stroke-width", 2)
          .text(emoji);
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
