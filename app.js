/****************************
 * CONFIG (STATE-LEVEL MAP)
 ****************************/
const TOPO_URLS = [
  "india.json",
  "assets/india.json",
  "https://rimtin.github.io/weather_bulletin/india.json",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/india.json",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/india.json"
];

/****************************
 * GLOBALS (runtime caches)
 ****************************/
let __topoFC = null;                       // GeoJSON FeatureCollection (states)
window.stateCentroids = window.stateCentroids || {};    // { "State Name": [cx, cy] }
window.actualStateList = (window.states || []).slice(); // clone of allowed states

/****************************
 * HELPERS
 ****************************/
const cssEscape = s =>
  (window.CSS && CSS.escape) ? CSS.escape(String(s ?? "")) : String(s ?? "").replace(/'/g,"\\'").replace(/"/g,'\\"');

function byId(id){ return document.getElementById(id); }

async function loadStatesTopo() {
  if (__topoFC) return __topoFC;
  let last;
  for (const u of TOPO_URLS) {
    try {
      const url = u + (u.includes("?") ? "&" : "?") + "v=" + Date.now();
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const topo = await res.json();
      const obj = topo.objects?.states || Object.values(topo.objects || {})[0];
      if (!obj) throw new Error("No 'states' object in TopoJSON");
      const fc = topojson.feature(topo, obj);
      if (!Array.isArray(fc.features) || !fc.features.length) throw new Error("Empty features");
      __topoFC = { type: "FeatureCollection", features: fc.features };
      console.info("[TopoJSON] Loaded states:", fc.features.length);
      return __topoFC;
    } catch (e) {
      console.warn("[TopoJSON] failed:", u, e);
      last = e;
    }
  }
  throw last || new Error("All 'india.json' URLs failed");
}

function ensureDiagonalHatch(svg){
  const id = "diagonalHatch";
  if (!svg.select(`#${id}`).empty()) return id;
  let defs = svg.select("defs");
  if (defs.empty()) defs = svg.append("defs");
  const p = defs.append("pattern")
    .attr("id", id)
    .attr("patternUnits","userSpaceOnUse")
    .attr("width",6).attr("height",6);
  p.append("path").attr("d","M0,0 l6,6")
    .attr("stroke","#999").attr("stroke-width",1);
  return id;
}

/****************************
 * DRAW (one map)
 * - svgId: "indiaMapDay1" or "indiaMapDay2"
 * - dayTag: same string saved in data-map (helps us target the right copy)
 ****************************/
async function drawIndiaMap(svgId, dayTag) {
  const svg = d3.select("#" + svgId);
  if (svg.empty()) return;
  svg.selectAll("*").remove();

  // hatch pattern
  const hatchId = ensureDiagonalHatch(svg);

  // ----- projection: EXACT numbers you specified -----
  const projection = d3.geoMercator()
    .scale(850)
    .center([89.8, 21.5])
    .translate([430, 290]);
  const path = d3.geoPath().projection(projection);

  try {
    const fc = await loadStatesTopo();
    const features = fc.features;

    // root group
    const root = svg.append("g").attr("class","viewport");

    // FILLS + OUTLINES
    const g = root.append("g").attr("class","states");
    const daySel = `[data-map='${cssEscape(dayTag)}']`;

    g.selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class","state")
      .attr("d", path)
      .attr("id", d => d.properties?.st_nm ?? "")        // per-state id: *state name*
      .attr("data-map", dayTag)                           // day tag so both maps can coexist
      .attr("stroke", "#333").attr("stroke-width", 1)
      .attr("fill", d => {
        const nm = d.properties?.st_nm ?? "";
        return (window.actualStateList || []).includes(nm) ? "#ccc" : `url(#${hatchId})`;
      })
      .on("mouseover", function(){ d3.select(this).attr("stroke-width", 2.5); })
      .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 1); });

    // cache centroids for icon overlay
    features.forEach(f => {
      const nm = f.properties?.st_nm; if (!nm) return;
      const [cx, cy] = path.centroid(f);
      window.stateCentroids[nm] = [cx, cy];
    });

    // done: on day 2 draw completion, bootstrap tables + sync + first paint
    if (svgId === "indiaMapDay2") {
      initializeForecastTable();   // main table for allowed states
      addTableHoverSync();         // table ↔ maps hover
      updateMapColors();           // apply dropdown colors
      updateMapIcons();            // place icons
      renderSubdivisionTable();    // chart-only subdivision list
    }
  } catch (e) {
    console.error("[Map] draw error:", e);
    alert("Could not load India map (TopJSON). Please try again or check console.");
  }
}

/****************************
 * TABLE (MAIN FORECAST)
 ****************************/
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
      <td>
        <select class="sel day1">
          <option value="">— Select —</option>${options}
        </select>
      </td>
      <td>
        <select class="sel day2">
          <option value="">— Select —</option>${options}
        </select>
      </td>
    `;
    fresh.appendChild(tr);
  });

  // change listeners -> recolor + redraw icons
  fresh.querySelectorAll("select.sel").forEach(sel => {
    sel.addEventListener("change", () => {
      updateMapColors();
      updateMapIcons();
    });
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
 * COLOR APPLICATION
 ****************************/
function updateMapColors(){
  const tbd = byId("forecast-table-body");
  if (!tbd) return;

  const colorOf = name => (window.forecastColors || {})[name] || null;

  tbd.querySelectorAll("tr").forEach(tr => {
    const st = tr.getAttribute("data-state");
    const v1 = tr.querySelector(".day1")?.value || "";
    const v2 = tr.querySelector(".day2")?.value || "";

    const c1 = colorOf(v1) || "#ccc";
    const c2 = colorOf(v2) || "#ccc";

    // Day 1
    d3.selectAll(`[id='${cssEscape(st)}'][data-map='indiaMapDay1']`).attr("fill", c1);
    // Day 2
    d3.selectAll(`[id='${cssEscape(st)}'][data-map='indiaMapDay2']`).attr("fill", c2);
  });
}

/****************************
 * ICON OVERLAY (EMOJI TEXT)
 ****************************/
function updateMapIcons(){
  const icons = window.forecastIcons || {}; // { "Clear Sky": "☀️", ... }
  const read = (tr, cls) => tr.querySelector(cls)?.value || "";

  // clear old
  d3.selectAll(".forecast-icon").remove();

  // draw new for both day 1 & day 2
  const tbd = byId("forecast-table-body"); if(!tbd) return;

  tbd.querySelectorAll("tr").forEach(tr => {
    const st = tr.getAttribute("data-state");
    const [cx, cy] = window.stateCentroids[st] || [];
    if (cx == null) return;

    const v1 = read(tr, ".day1");
    const v2 = read(tr, ".day2");
    const i1 = icons[v1] || "";
    const i2 = icons[v2] || "";

    if (i1) {
      d3.select("#indiaMapDay1 .viewport")
        .append("text").attr("class","forecast-icon")
        .attr("x", cx).attr("y", cy)
        .attr("text-anchor","middle").attr("alignment-baseline","middle")
        .attr("font-size", 18).text(i1);
    }
    if (i2) {
      d3.select("#indiaMapDay2 .viewport")
        .append("text").attr("class","forecast-icon")
        .attr("x", cx).attr("y", cy)
        .attr("text-anchor","middle").attr("alignment-baseline","middle")
        .attr("font-size", 18).text(i2);
    }
  });
}

/****************************
 * SUBDIVISION “CHART-ONLY” TABLE
 ****************************/
function renderSubdivisionTable(){
  const body = byId("subdivision-table-body");
  if (!body) return;

  // reset
  const fresh = body.cloneNode(false);
  body.parentNode.replaceChild(fresh, body);

  // group by parent state
  const groups = {};
  (window.subdivisions || []).forEach(r => (groups[r.state] ||= []).push(r));

  let serial = 1;
  Object.keys(groups).sort().forEach(st => {
    const rows = groups[st];
    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${serial++}</td>
        ${i === 0 ? `<td rowspan="${rows.length}">${st}</td>` : ""}
        <td>${r.name}</td>
        <td contenteditable="true"></td>
      `;
      fresh.appendChild(tr);
    });
  });
}

/****************************
 * BOOTSTRAP
 ****************************/
window.addEventListener("load", () => {
  if (typeof updateISTDate === "function") updateISTDate();

  // draw both maps; when Day 2 completes it bootstraps the tables & colors
  drawIndiaMap("indiaMapDay1", "indiaMapDay1").then(() => {
    drawIndiaMap("indiaMapDay2", "indiaMapDay2");
  }).catch(e => {
    console.error(e);
    alert("India map could not be drawn. See console for details.");
  });
});

