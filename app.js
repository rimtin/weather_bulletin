/* =======================
   Cloud Bulletin – Subdivision maps (local GeoJSON)
   - Loads indian_met_zones.geojson from repo root
   - Per‑subdivision Day‑1/Day‑2 controls drive both maps
   - Auto‑detects GeoJSON property names; NAME_MAP bridges label differences
   ======================= */

// ---------- Utilities ----------
const norm = s => (s || "").toString().toLowerCase().replace(/[^a-z0-9]+/g, "");
const pickExistingKey = (obj, candidates) => {
  for (const k of candidates) if (obj && k in obj) return k;
  return null;
};

// centroids for icons
let SUBDIV_CENTROIDS = new Map();

// Table‑label → GeoJSON‑label mapping (tweak right‑hand values if needed)
const NAME_MAP = new Map([
  ["W-Raj","West Rajasthan"],
  ["E-Raj","East Rajasthan"],
  ["W-Gujarat (Saurashtra & Kachh)","Saurashtra & Kachh"],
  ["E-Gujarat Region","Gujarat region"],
  ["W-UP","West Uttar Pradesh"],
  ["E-UP","East Uttar Pradesh"],
  ["W-MP","West Madhya Pradesh"],
  ["E-MP","East Madhya Pradesh"],
  ["Madhya -MH","Madhya Maharashtra"],
  ["North-Karnataka","N.I. Karnataka"],
  ["South- Karnataka","S.I. Karnataka"],
  ["SW-AP (Rayalaseema)","Rayalaseema"],
  ["Andhra Pradesh","Coastal Andhra Pradesh"],
  ["Tamil Nadu","Tamil Nadu & Puducherry"],

  // passthroughs
  ["Punjab","Punjab"],
  ["Chhattisgarh","Chhattisgarh"],
  ["Marathwada","Marathwada"],
  ["Vidarbha","Vidarbha"],
  ["Telangana","Telangana"]
]);

// common property names seen in IMD files
const SUBDIV_KEYS = ["SUBDIV","SubDiv","Subdivision","SUBDIVISION","NAME","name","label","LABEL"];
const STATE_KEYS  = ["STATE","STATE_UT","State","STATEUT","STATE_NAME","st_nm","ST_NM","stname","STNAME"];

// ---------- Build per‑subdivision control table ----------
function buildSubdivisionControlTable(){
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody || tbody.dataset.built === "1") return;
  tbody.dataset.built = "1";
  tbody.innerHTML = "";

  let serial = 1;
  states.forEach(state => {
    (subdivisions || []).filter(s => s.state === state).forEach(row => {
      const mapped = NAME_MAP.get(row.name) || row.name;
      const key = norm(mapped);
      const tr = document.createElement("tr");
      tr.setAttribute("data-subkey", key);
      tr.setAttribute("data-raw", row.name);
      tr.setAttribute("data-mapped", mapped);
      tr.innerHTML = `
        <td>${serial++}</td>
        <td>${state}</td>
        <td>${row.subNo}</td>
        <td>${row.name}</td>
        <td><select class="sel-day1">${forecastOptions.map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="sel-day2">${forecastOptions.map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td contenteditable="true"></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // events
  tbody.querySelectorAll("select").forEach(sel=>{
    sel.addEventListener("change", ()=>{ applyColorsFromTable(); stampIconsFromTable(); });
  });

  // hover highlight
  tbody.querySelectorAll("tr").forEach(tr=>{
    const key = tr.getAttribute("data-subkey");
    tr.addEventListener("mouseenter", ()=> d3.selectAll(`[data-subkey='${CSS.escape(key)}']`).attr("stroke-width",2.5));
    tr.addEventListener("mouseleave", ()=> d3.selectAll(`[data-subkey='${CSS.escape(key)}']`).attr("stroke-width",1));
  });
}

// ---------- Draw map from local GeoJSON ----------
async function drawMap(svgId){
  const svg = d3.select(svgId); svg.selectAll("*").remove();

  // try both filenames
  const candidates = ["indian_met_zones.geojson", "indian_met_zones (1).geojson"];
  let geo = null;
  for (const url of candidates){
    try{ const r = await fetch(url, {cache:"no-store"}); if(r.ok){ geo = await r.json(); break; } }catch(_){}
  }
  if(!geo || !geo.features){
    showWarn("Could not load indian_met_zones.geojson (place it next to index.html).");
    return;
  }

  // detect property names
  const sampleProps = (geo.features[0] || {}).properties || {};
  const SUBDIV_PROP = pickExistingKey(sampleProps, SUBDIV_KEYS) || Object.keys(sampleProps)[0];
  const STATE_PROP  = pickExistingKey(sampleProps, STATE_KEYS); // may be null
  console.log("[Using properties]", { SUBDIV_PROP, STATE_PROP });

  // fit projection to file
  const box = svg.node().getBoundingClientRect();
  const size = [Math.max(720, box.width || 720), 520];
  const projection = d3.geoMercator().fitSize(size, geo);
  const path = d3.geoPath().projection(projection);

  // features with normalized keys
  SUBDIV_CENTROIDS = new Map();
  const feats = geo.features.map(f=>{
    const p = f.properties || {};
    const raw = (p[SUBDIV_PROP] ?? "").toString();
    const mapped = NAME_MAP.get(raw) || raw;
    const key = norm(mapped);
    const state = STATE_PROP ? (p[STATE_PROP] ?? "").toString() : "";
    return {f, raw, mapped, key, state};
  });

  svg.selectAll("path.subdiv")
    .data(feats)
    .enter()
    .append("path")
    .attr("class","subdiv")
    .attr("data-map", svgId.replace("#",""))
    .attr("data-subdiv", d=>d.raw)
    .attr("data-mapped", d=>d.mapped)
    .attr("data-state", d=>d.state)
    .attr("data-subkey", d=>d.key)
    .attr("d", d=>path(d.f))
    .attr("fill","#ccc")
    .attr("stroke","#333")
    .attr("stroke-width",1)
    .on("mouseover", function(){ d3.select(this).attr("stroke-width",2.5); })
    .on("mouseout",  function(){ d3.select(this).attr("stroke-width",1); })
    .each(d=> SUBDIV_CENTROIDS.set(d.key, path.centroid(d.f)) );

  if(svgId==="#indiaMapDay2"){ applyColorsFromTable(); stampIconsFromTable(); }
}

// ---------- Apply colors/icons from table ----------
function applyColorsFromTable(){
  d3.selectAll("#indiaMapDay1 .subdiv, #indiaMapDay2 .subdiv").attr("fill","#ccc");
  document.querySelectorAll("#subdivision-table-body tr").forEach(tr=>{
    const key = tr.getAttribute("data-subkey");
    const d1  = tr.querySelector(".sel-day1")?.value;
    const d2  = tr.querySelector(".sel-day2")?.value;
    const c1 = forecastColors[d1] || "#ccc";
    const c2 = forecastColors[d2] || "#ccc";
    d3.selectAll(`#indiaMapDay1 [data-subkey='${CSS.escape(key)}']`).attr("fill", c1);
    d3.selectAll(`#indiaMapDay2 [data-subkey='${CSS.escape(key)}']`).attr("fill", c2);
  });
}

function stampIconsFromTable(){
  d3.selectAll(".forecast-icon").remove();
  const size = 16;
  document.querySelectorAll("#subdivision-table-body tr").forEach(tr=>{
    const key = tr.getAttribute("data-subkey");
    const d1  = tr.querySelector(".sel-day1")?.value;
    const d2  = tr.querySelector(".sel-day2")?.value;
    const i1 = forecastIcons[d1], i2 = forecastIcons[d2];
    const c = SUBDIV_CENTROIDS.get(key);
    if(!c) return;
    if(i1) d3.select("#indiaMapDay1").append("text").attr("class","forecast-icon")
      .attr("x",c[0]).attr("y",c[1]).attr("text-anchor","middle").attr("alignment-baseline","middle")
      .attr("font-size",size).text(i1);
    if(i2) d3.select("#indiaMapDay2").append("text").attr("class","forecast-icon")
      .attr("x",c[0]).attr("y",c[1]).attr("text-anchor","middle").attr("alignment-baseline","middle")
      .attr("font-size",size).text(i2);
  });
}

// ---------- Warning banner ----------
function showWarn(msg){
  let el=document.getElementById("warn-banner");
  if(!el){ el=document.createElement("div"); el.id="warn-banner"; document.querySelector(".container").prepend(el); }
  el.textContent = msg;
  el.className = ""; // allow CSS to style via #warn-banner
}

// ---------- Init ----------
window.addEventListener("DOMContentLoaded", ()=>{
  if (typeof updateISTDate === "function") updateISTDate();
  buildSubdivisionControlTable();   // table always visible
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
});
