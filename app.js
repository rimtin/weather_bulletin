// ===== Subdivision-only app: one table controls two subdivision maps =====

// centroids (by state) for icon placement
window.stateCentroids = {};

// property key helpers
const SUBDIV_KEYS = ["SUBDIV","SubDiv","Subdivision","SUBDIVISION","NAME","name","label","LABEL"];
const STATE_KEYS  = ["STATE","STATE_UT","State","STATEUT","STATE_NAME","st_nm","ST_NM","stname","STNAME"];

const pickKey = (obj, keys) => keys.find(k => Object.prototype.hasOwnProperty.call(obj, k));

/* ---------- MAP ---------- */
function drawMap(svgId){
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  // load your local subdivisions (repo root)
  const GEOJSON_PATH = "./indian_met_zones.geojson";

  d3.json(GEOJSON_PATH).then(raw=>{
    // normalize to FeatureCollection
    const fc = (raw && raw.type==="FeatureCollection")
      ? raw
      : { type:"FeatureCollection", features:(raw?.features || raw || []) };

    if(!fc.features?.length) throw new Error("Empty GeoJSON");

    // detect property keys
    const sample = fc.features[0].properties || {};
    const SUBDIV_PROP = pickKey(sample, SUBDIV_KEYS) || Object.keys(sample)[0];
    const STATE_PROP  = pickKey(sample, STATE_KEYS);

    // fit to svg
    const width  = Math.max(520, svg.node().getBoundingClientRect().width || 520);
    const height = 520;
    const projection = d3.geoMercator().fitSize([width,height], fc);
    const path = d3.geoPath(projection);

    // draw polygons (subdivisions)
    svg.append("g")
      .selectAll("path.subdiv")
      .data(fc.features)
      .enter()
      .append("path")
      .attr("class","subdiv")
      .attr("d", path)
      .attr("data-map", svgId.replace("#",""))
      .attr("data-state",  d => String(d.properties?.[STATE_PROP]   ?? ""))
      .attr("data-subdiv", d => String(d.properties?.[SUBDIV_PROP] ?? ""))
      .attr("fill", "#eee")
      .attr("stroke", "#333")
      .attr("stroke-width", 1)
      .on("mouseover", function(){ d3.select(this).attr("stroke-width", 2.5); })
      .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 1); });

    // compute averaged centroid per STATE for icons
    const accum = {};
    fc.features.forEach(f=>{
      const st = String(f.properties?.[STATE_PROP] ?? "");
      const c  = path.centroid(f);
      if(!st || !isFinite(c[0]) || !isFinite(c[1])) return;
      (accum[st] ||= {x:0,y:0,n:0});
      accum[st].x += c[0]; accum[st].y += c[1]; accum[st].n += 1;
    });
    window.stateCentroids = Object.fromEntries(
      Object.entries(accum).map(([k,v])=>[k,[v.x/v.n, v.y/v.n]])
    );

    // after second map draws, color with current selections
    if (svgId==="#indiaMapDay2"){ updateMapColors(); updateMapIcons(); }
  }).catch(err=>{
    console.error("GeoJSON load error:", err);
    alert("Could not load ./indian_met_zones.geojson (check filename and path).");
  });
}
window.drawMap = drawMap;

/* ---------- TABLE (ONE TABLE, LIKE YOUR IMAGE) ---------- */
function renderSubdivisionForecastTable(){
  const tbody = document.getElementById("subdivision-forecast-body");
  if(!tbody) return;
  tbody.innerHTML = "";

  let serial = 1;
  states.forEach(stateName=>{
    const rows = (window.subdivisions||[]).filter(s=>s.state===stateName);
    rows.forEach((row, idx)=>{
      const tr = document.createElement("tr");
      tr.setAttribute("data-state", stateName);
      tr.setAttribute("data-subdivision", row.name);

      // first row in the group prints serial+state with rowspan
      if(idx===0){
        const tdSerial = document.createElement("td");
        tdSerial.textContent = serial++;
        tdSerial.rowSpan = rows.length;

        const tdState = document.createElement("td");
        tdState.textContent = stateName;
        tdState.rowSpan = rows.length;

        tr.appendChild(tdSerial);
        tr.appendChild(tdState);
      }

      // subdivision name
      const tdSub = document.createElement("td");
      tdSub.textContent = row.name;
      tr.appendChild(tdSub);

      // No. Solar Site (editable)
      const tdSites = document.createElement("td");
      tdSites.contentEditable = "true";
      tr.appendChild(tdSites);

      // Day 1 / Day 2 selects
      const mkSel = () => `<select>${forecastOptions.map(o=>`<option>${o}</option>`).join("")}</select>`;
      const tdD1 = document.createElement("td"); tdD1.innerHTML = mkSel(); tr.appendChild(tdD1);
      const tdD2 = document.createElement("td"); tdD2.innerHTML = mkSel(); tr.appendChild(tdD2);

      tbody.appendChild(tr);
    });
  });

  // handlers
  tbody.querySelectorAll("select").forEach(sel=>{
    sel.addEventListener("change", ()=>{ updateMapColors(); updateMapIcons(); });
  });

  // hover: bold all polygons of that state
  tbody.querySelectorAll("tr[data-state]").forEach(tr=>{
    const st = tr.getAttribute("data-state");
    tr.addEventListener("mouseenter", ()=> d3.selectAll(`[data-state='${CSS.escape(st)}']`).attr("stroke-width",2.5));
    tr.addEventListener("mouseleave", ()=> d3.selectAll(`[data-state='${CSS.escape(st)}']`).attr("stroke-width",1));
  });
}

/* ---------- COLOR + ICONS ---------- */
function updateMapColors(){
  const rows = document.querySelectorAll("#subdivision-forecast-body tr[data-state]");
  rows.forEach(tr=>{
    const st  = tr.getAttribute("data-state");
    const selects = tr.querySelectorAll("select");
    const d1  = selects[0]?.value; // Day 1
    const d2  = selects[1]?.value; // Day 2
    const c1  = forecastColors[d1] || "#eee";
    const c2  = forecastColors[d2] || "#eee";
    d3.selectAll(`#indiaMapDay1 [data-state='${CSS.escape(st)}']`).attr("fill", c1);
    d3.selectAll(`#indiaMapDay2 [data-state='${CSS.escape(st)}']`).attr("fill", c2);
  });
}

function updateMapIcons(){
  const size = 18;
  d3.selectAll(".forecast-icon").remove();

  document.querySelectorAll("#subdivision-forecast-body tr[data-state]").forEach(tr=>{
    const st  = tr.getAttribute("data-state");
    const selects = tr.querySelectorAll("select");
    const d1  = selects[0]?.value;
    const d2  = selects[1]?.value;
    const p   = window.stateCentroids[st];
    const i1  = forecastIcons[d1], i2 = forecastIcons[d2];

    if(p && i1) d3.select("#indiaMapDay1").append("text")
      .attr("class","forecast-icon").attr("x",p[0]).attr("y",p[1])
      .attr("text-anchor","middle").attr("alignment-baseline","middle")
      .attr("font-size",size).text(i1);

    if(p && i2) d3.select("#indiaMapDay2").append("text")
      .attr("class","forecast-icon").attr("x",p[0]).attr("y",p[1])
      .attr("text-anchor","middle").attr("alignment-baseline","middle")
      .attr("font-size",size).text(i2);
  });
}

/* ---------- INIT ---------- */
window.onload = () => {
  if (typeof updateISTDate === "function") updateISTDate();

  // Build the single combined table first
  renderSubdivisionForecastTable();

  // Then draw both maps
  drawMap("#indiaMapDay1");
  drawMap("#indiaMapDay2");
};
