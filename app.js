/***********************
 * CONFIG — Sub-division GeoJSON only
 ***********************/
const SUBDIV_GEO_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

/***********************
 * HELPERS
 ***********************/
const cssEscape = s =>
  (window.CSS && CSS.escape) ? CSS.escape(String(s ?? "")) : String(s ?? "").replace(/'/g,"\\'").replace(/"/g,'\\"');

function canonical(input) {
  let s = String(input || "")
    .replace(/[\u2010-\u2015]/g, "-")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/north *interior *karnataka|n *i *karnataka/, "ni karnataka");
  s = s.replace(/south *interior *karnataka|s *i *karnataka/, "si karnataka");
  s = s.replace(/saurashtra *and *(kutch|kachchh|kachh)/, "saurashtra and kachh");
  s = s.replace(/gujarat *region/, "gujarat region");
  s = s.replace(/tamil *nadu *and *puducherry/, "tamil nadu and puducherry");
  s = s.replace(/konkan *and *goa/, "konkan and goa");
  return s.replace(/[^\w]+/g, "-");
}

function pickNameKey(features){
  const pref = ["ST_NM","st_nm","NAME","name","SUBDIV","subdiv","ST_NAME","st_name"];
  const seen = new Set();
  features.forEach(f => Object.keys(f.properties||{}).forEach(k => seen.add(k)));
  for (const k of pref) if (seen.has(k)) return k;
  for (const f of features) for (const k of Object.keys(f.properties||{}))
    if (typeof f.properties[k] === "string") return k;
  return "ST_NM";
}

async function loadGeoJSON(urls){
  let last;
  for (const u of urls){
    try{
      const url = u + (u.includes("?")?"&":"?") + "v=" + Date.now();
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const gj = await r.json();
      const feats = (gj.features||[]).filter(f => f && f.geometry);
      if (!feats.length) throw new Error("Empty/invalid features");
      return { type: "FeatureCollection", features: feats };
    }catch(e){ console.warn("[GeoJSON] failed:", u, e); last = e; }
  }
  throw last || new Error("All subdivision URLs failed");
}

function ensureHatch(svg){
  const id="noForecast";
  if (!svg.select("#"+id).empty()) return id;
  let defs = svg.select("defs"); if (defs.empty()) defs = svg.append("defs");
  const p = defs.append("pattern").attr("id",id)
    .attr("patternUnits","userSpaceOnUse").attr("width",6).attr("height",6)
    .attr("patternTransform","rotate(45)");
  p.append("rect").attr("width",6).attr("height",6).attr("fill","#f2f2f2");
  p.append("path").attr("d","M0,0 L0,6").attr("stroke","#999").attr("stroke-width",1);
  return id;
}

function setRowHover(norm, on){
  const row = document.querySelector(`#subdivision-table-body tr[data-norm='${cssEscape(norm)}']`);
  if (row) row.style.backgroundColor = on ? "#e9f2ff" : "";
}

/***********************
 * TABLE
 ***********************/
function buildSubdivisionTable(){
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const groups = {};
  (window.subdivisions || []).forEach(r => (groups[r.state] ||= []).push(r));

  let serial = 1;
  Object.keys(groups).forEach(state => {
    const rows = groups[state];
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.dataset.state = state;
      tr.dataset.subdiv = row.name;
      tr.dataset.norm = canonical(row.name);
      tr.innerHTML = `
        <td>${serial++}</td>
        ${i === 0 ? `<td rowspan="${rows.length}">${state}</td>` : ""}
        <td>${row.name}</td>
        <td contenteditable="true"></td>
        <td><select class="day1">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // repaint on change
  tbody.querySelectorAll("select").forEach(sel => sel.addEventListener("change", paintMapsFromTable));

  // table → map hover
  tbody.querySelectorAll("tr").forEach(tr=>{
    const id = tr.dataset.norm;
    tr.addEventListener("mouseenter", ()=>{
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke-width", 1.6).attr("stroke", "#000");
    });
    tr.addEventListener("mouseleave", ()=>{
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke-width", .6).attr("stroke", "#666");
    });
  });
}

/***********************
 * MAP (GeoJSON-only, always fit)
 ***********************/
async function drawSubdivisionMap(svgSelector, onReady){
  const svg = d3.select(svgSelector);
  if (svg.empty()) return onReady?.();
  svg.selectAll("*").remove();

  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`)
     .attr("preserveAspectRatio", "xMidYMid meet")
     .attr("width", null).attr("height", null);

  const hatchId = ensureHatch(svg);

  try{
    const fc = await loadGeoJSON(SUBDIV_GEO_URLS);
    const features = fc.features;
    const NAME = pickNameKey(features);

    // projection: conic equal-area, fitted to data -> no tiny/off-center maps
    const projection = d3.geoConicEqualArea().parallels([12,33]).rotate([-82.5,0]).center([0,22]);
    const path = d3.geoPath().projection(projection);
    projection.fitSize([W - 12, H - 12], fc);

    // fills
    const gF = svg.append("g").attr("class","fills");
    gF.selectAll("path.state").data(features).enter().append("path")
      .attr("class","state")
      .attr("d", path)
      .attr("data-name", d => d.properties?.[NAME] ?? "")
      .attr("data-norm", d => canonical(d.properties?.[NAME] ?? ""))
      .attr("fill", "#e6e6e6")
      .attr("stroke", "none")
      .on("mouseenter", (e,d)=>{
        const id = canonical(d.properties?.[NAME] ?? "");
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke-width", 1.6).attr("stroke","#000");
        setRowHover(id, true);
      })
      .on("mouseleave", (e,d)=>{
        const id = canonical(d.properties?.[NAME] ?? "");
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke-width", .6).attr("stroke","#666");
        setRowHover(id, false);
      })
      .append("title").text(d => d.properties?.[NAME] ?? "");

    // borders overlay
    const gB = svg.append("g").attr("class","borders");
    gB.selectAll("path.border").data(features).enter().append("path")
      .attr("class","border").attr("d", path)
      .attr("fill","none").attr("stroke","#666").attr("stroke-width", .6)
      .attr("pointer-events","none").attr("vector-effect","non-scaling-stroke")
      .attr("data-name", d => d.properties?.[NAME] ?? "")
      .attr("data-norm", d => canonical(d.properties?.[NAME] ?? ""));

    svg.attr("data-nf-pattern", hatchId);
    onReady?.();
  }catch(e){
    console.error("[Map] load error:", e);
    svg.append("text").attr("x", 20).attr("y", 40).attr("fill","#b00").text("Failed to load sub-division map.");
    onReady?.();
  }
}

/***********************
 * COLORING from table
 ***********************/
function paintMapsFromTable(){
  const rows = document.querySelectorAll("#subdivision-table-body tr");
  const patt1 = document.getElementById("indiaSubMapDay1")?.getAttribute("data-nf-pattern");
  const patt2 = document.getElementById("indiaSubMapDay2")?.getAttribute("data-nf-pattern");

  rows.forEach(row=>{
    const id = row.dataset.norm;
    const v1 = row.querySelector("select.day1")?.value?.trim();
    const v2 = row.querySelector("select.day2")?.value?.trim();

    const isNo1 = !v1 || /select|no\s*forecast/i.test(v1);
    const isNo2 = !v2 || /select|no\s*forecast/i.test(v2);

    const c1 = isNo1 ? (patt1 ? `url(#${patt1})` : "#f2f2f2") : ((window.forecastColors||{})[v1] || "#e6e6e6");
    const c2 = isNo2 ? (patt2 ? `url(#${patt2})` : "#f2f2f2") : ((window.forecastColors||{})[v2] || "#e6e6e6");

    d3.selectAll(`#indiaSubMapDay1 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c1);
    d3.selectAll(`#indiaSubMapDay2 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c2);
  });
}

/***********************
 * INIT
 ***********************/
window.addEventListener("load", ()=>{
  if (typeof updateISTDate === "function") updateISTDate();

  buildSubdivisionTable();

  drawSubdivisionMap("#indiaSubMapDay1", () => {
    drawSubdivisionMap("#indiaSubMapDay2", () => {
      paintMapsFromTable(); // initial paint
    });
  });
});
