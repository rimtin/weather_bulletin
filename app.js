// === Subdivision map from local GeoJSON; colors driven by state forecast table ===

// store averaged centroids (for icons)
window.stateCentroids = {};
window.actualStateList = [];

// property name helpers
const SUBDIV_KEYS = ["SUBDIV","SubDiv","Subdivision","SUBDIVISION","NAME","name","label","LABEL"];
const STATE_KEYS  = ["STATE","STATE_UT","State","STATEUT","STATE_NAME","st_nm","ST_NM","stname","STNAME"];

const pickExistingKey = (obj, keys) => {
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return k;
  return null;
};

// draw a map into a given SVG
function drawMap(svgId) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // optional hatch pattern (unused now)
  const defs = svg.append("defs");
  defs.append("pattern")
    .attr("id", "diagonalHatch").attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6).attr("height", 6)
    .append("path").attr("d", "M0,0 l6,6").attr("stroke", "#999").attr("stroke-width", 1);

  // 👇 your file is in the repo root
  const GEOJSON_PATH = "./indian_met_zones.geojson";

  d3.json(GEOJSON_PATH).then(raw => {
    // accept FeatureCollection or plain array
    const fc = (raw && raw.type === "FeatureCollection")
      ? raw
      : { type: "FeatureCollection", features: (raw?.features || raw || []) };

    if (!fc.features || !fc.features.length) throw new Error("GeoJSON missing or empty");

    // detect property names
    const sample = (fc.features[0] || {}).properties || {};
    const SUBDIV_PROP = pickExistingKey(sample, SUBDIV_KEYS) || Object.keys(sample)[0];
    const STATE_PROP  = pickExistingKey(sample, STATE_KEYS);

    // fit to SVG (height 520 per CSS)
    const width = Math.max(520, svg.node().getBoundingClientRect().width || 520);
    const height = 520;
    const projection = d3.geoMercator().fitSize([width, height], fc);
    const path = d3.geoPath(projection);

    // use your states array from data.js (Bihar already excluded)
    const allowedStates = states.slice();
    actualStateList = allowedStates;

    // compute average centroid per state for icons
    const sum = {}; // {state: {x,y,n}}
    fc.features.forEach(f => {
      const st = String(f.properties?.[STATE_PROP] ?? "");
      const c = path.centroid(f);
      if (!st || !c || !isFinite(c[0]) || !isFinite(c[1])) return;
      (sum[st] ||= {x:0,y:0,n:0});
      sum[st].x += c[0]; sum[st].y += c[1]; sum[st].n += 1;
    });
    window.stateCentroids = Object.fromEntries(
      Object.entries(sum).map(([k, s]) => [k, [s.x/s.n, s.y/s.n]])
    );

    // draw all sub-division polygons
    svg.append("g")
      .selectAll("path.subdiv")
      .data(fc.features)
      .enter()
      .append("path")
      .attr("class","subdiv")
      .attr("d", path)
      .attr("data-map", svgId.replace("#",""))
      .attr("data-state", d => String(d.properties?.[STATE_PROP] ?? ""))
      .attr("data-subdiv", d => String(d.properties?.[SUBDIV_PROP] ?? ""))
      .attr("fill", "#eee")
      .attr("stroke", "#333")
      .attr("stroke-width", 1)
      .on("mouseover", function(){ d3.select(this).attr("stroke-width", 2.5); })
      .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 1); });

    // after second map draws, build/attach tables and paint once
    if (svgId === "#indiaMapDay2") {
      initializeForecastTable();   // builds the state forecast rows (Day1/Day2)
      renderSubdivisionTable();    // fills the listing table below
      addTableHoverSync();         // hover a row -> bold its polygons
      updateMapColors();           // initial paint
      updateMapIcons();            // initial icons
    }
  }).catch(err => {
    console.error("Map load error:", err);
    alert("Could not load ./indian_met_zones.geojson. Check the filename/case in the repo.");
  });
}
window.drawMap = drawMap;

/* ====== TABLES & INTERACTION ====== */

function initializeForecastTable() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return; // if you didn't include the small 'Forecast' table, skip

  tbody.innerHTML = "";
  actualStateList.forEach((state, i) => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-state", state);
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${state}</td>
      <td><select>${forecastOptions.map(o=>`<option>${o}</option>`).join("")}</select></td>
      <td><select>${forecastOptions.map(o=>`<option>${o}</option>`).join("")}</select></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("select").forEach(sel=>{
    sel.addEventListener("change", ()=>{ updateMapColors(); updateMapIcons(); });
  });
}

function addTableHoverSync() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;
  const fresh = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(fresh, tbody);
  fresh.querySelectorAll("tr").forEach(tr=>{
    const st = tr.getAttribute("data-state");
    tr.addEventListener("mouseenter", ()=> d3.selectAll(`[data-state='${CSS.escape(st)}']`).attr("stroke-width",2.5));
    tr.addEventListener("mouseleave", ()=> d3.selectAll(`[data-state='${CSS.escape(st)}']`).attr("stroke-width",1));
    tr.querySelectorAll("select").forEach(s=> s.addEventListener("change", ()=>{ updateMapColors(); updateMapIcons(); }));
  });
}

function updateMapColors() {
  const rows = document.querySelectorAll("#forecast-table-body tr");
  rows.forEach(row=>{
    const st = row.getAttribute("data-state") || row.children[1]?.textContent?.trim();
    const d1 = row.children[2]?.querySelector("select")?.value;
    const d2 = row.children[3]?.querySelector("select")?.value;
    const c1 = forecastColors[d1] || "#eee";
    const c2 = forecastColors[d2] || "#eee";
    d3.selectAll(`#indiaMapDay1 [data-state='${CSS.escape(st)}']`).attr("fill", c1);
    d3.selectAll(`#indiaMapDay2 [data-state='${CSS.escape(st)}']`).attr("fill", c2);
  });
}

function updateMapIcons() {
  const size = 18;
  d3.selectAll(".forecast-icon").remove();

  document.querySelectorAll("#forecast-table-body tr").forEach(row=>{
    const st = row.getAttribute("data-state") || row.children[1]?.textContent?.trim();
    const d1 = row.children[2]?.querySelector("select")?.value;
    const d2 = row.children[3]?.querySelector("select")?.value;
    const p  = window.stateCentroids[st];
    const i1 = forecastIcons[d1], i2 = forecastIcons[d2];
    if (p && i1) d3.select("#indiaMapDay1").append("text").attr("class","forecast-icon")
      .attr("x",p[0]).attr("y",p[1]).attr("text-anchor","middle").attr("alignment-baseline","middle")
      .attr("font-size",size).text(i1);
    if (p && i2) d3.select("#indiaMapDay2").append("text").attr("class","forecast-icon")
      .attr("x",p[0]).attr("y",p[1]).attr("text-anchor","middle").attr("alignment-baseline","middle")
      .attr("font-size",size).text(i2);
  });
}

function renderSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  let serial = 1;
  states.forEach(state=>{
    (window.subdivisions||[]).filter(s=>s.state===state).forEach(row=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${serial++}</td><td>${state}</td><td>${row.subNo}</td><td>${row.name}</td><td contenteditable="true"></td>`;
      tbody.appendChild(tr);
    });
  });
}

// init
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
