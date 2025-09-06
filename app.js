/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

// alias map (unused now; we canonicalize)
const TableToGeoName = {};

/***********************
 * HELPERS
 ***********************/
const cssEscape = s => (window.CSS && CSS.escape ? CSS.escape(String(s ?? "")) : String(s ?? "").replace(/'/g,"\\'").replace(/"/g,'\\"'));

function canonical(input){
  let s = String(input||"")
    .replace(/[\u2010-\u2015]/g,"-").toLowerCase()
    .replace(/\./g,"").replace(/&/g,"and").replace(/\s+/g," ").trim();
  s = s.replace(/north *interior *karnataka|n *i *karnataka/,"ni karnataka");
  s = s.replace(/south *interior *karnataka|s *i *karnataka/,"si karnataka");
  s = s.replace(/saurashtra *and *(kutch|kachchh|kachh)/,"saurashtra and kachh");
  s = s.replace(/gujarat *region/,"gujarat region");
  s = s.replace(/tamil *nadu *and *puducherry/,"tamil nadu and puducherry");
  return s.replace(/[^\w]+/g,"-");
}

function showInlineError(svg, msg){
  const W=860,H=580;
  svg.attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet");
  svg.append("text").attr("x",W/2).attr("y",H/2).attr("text-anchor","middle").attr("font-size",16).attr("fill","#a00").text(msg);
}

function pickNameKey(features){
  const priority=["ST_NM","st_nm","ST_NAME","st_name","STNAME","NAME","name","SUBDIV","subdiv","SUBDIVISION","subdivision","SUB_DIV","sub_div"];
  const seen=new Set(); features.forEach(f=>Object.keys(f?.properties||{}).forEach(k=>seen.add(k)));
  for(const k of priority) if(seen.has(k)) return k;
  for(const f of features){ for(const k of Object.keys(f?.properties||{})) if(typeof f.properties[k]==="string"&&f.properties[k]) return k; }
  return "ST_NM";
}

function toFeatureCollection(j){
  if(j?.type==="Topology"||j?.objects){
    const k = Object.keys(j.objects).find(x=>j.objects[x]?.geometries?.length)||Object.keys(j.objects)[0];
    const fc = (window.topojson||topojson).feature(j,j.objects[k]);
    return {type:"FeatureCollection", features:(fc.features||[]).filter(f=>f&&f.geometry)};
  }
  return {type:"FeatureCollection", features:(j.features||[]).filter(f=>f&&f.geometry)};
}

async function loadGeoJSON(urls){
  let last;
  for(const u of urls){
    try{
      const r = await fetch(u+(u.includes("?")?"&":"?")+"v="+Date.now(), {cache:"no-store"});
      if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const fc = toFeatureCollection(await r.json());
      if(!fc.features.length) throw new Error("Empty features");
      console.info("[GeoJSON] OK:", u, "features:", fc.features.length);
      return fc;
    }catch(e){ console.warn("[GeoJSON] failed:", u, e); last = e; }
  }
  throw last||new Error("All URLs failed");
}

function ensureNoForecastPattern(svg){
  const id=(svg.attr("id")||"map")+"_noForecast";
  let defs=svg.select("defs"); if(defs.empty()) defs=svg.append("defs");
  if(svg.select("#"+cssEscape(id)).empty()){
    const p=defs.append("pattern").attr("id",id)
      .attr("patternUnits","userSpaceOnUse").attr("width",8).attr("height",8)
      .attr("patternTransform","rotate(45)");
    p.append("rect").attr("width",8).attr("height",8).attr("fill","#f2f2f2");
    p.append("path").attr("d","M 0 0 L 0 8").attr("stroke","#999").attr("stroke-width",1);
  }
  svg.attr("data-nf-pattern",id);
  return id;
}

// generous India centroid bounds (for fitting only)
function featuresNearIndia(features){
  const LON_MIN=60, LON_MAX=100, LAT_MIN=-5, LAT_MAX=40;
  return features.filter(f=>{
    try{ const [x,y]=d3.geoCentroid(f); return isFinite(x)&&isFinite(y)&&x>=LON_MIN&&x<=LON_MAX&&y>=LAT_MIN&&y<=LAT_MAX; }
    catch{ return false; }
  });
}

/** floating tooltip (shared) */
const tip = (() => {
  const el = document.createElement('div');
  el.className = 'map-tip';
  document.body.appendChild(el);
  return {
    show(html, x, y) {
      el.innerHTML = html;
      el.style.display = 'block';
      const pad = 12;
      el.style.left = Math.max(8, x + pad) + 'px';
      el.style.top  = Math.max(8, y + pad) + 'px';
    },
    hide(){ el.style.display = 'none'; }
  };
})();

function setRowActive(norm, on){
  const row=document.querySelector(`#subdivision-table-body tr[data-norm='${cssEscape(norm)}']`);
  if(row) row.classList.toggle("active-row", !!on);
}

function readSelections(norm){
  const row=document.querySelector(`#subdivision-table-body tr[data-norm='${cssEscape(norm)}']`);
  if(!row) return { d1:null, d2:null };
  return {
    d1: row.querySelector('select.day1')?.value?.trim() || null,
    d2: row.querySelector('select.day2')?.value?.trim() || null
  };
}

function toPaint(value, hatchId){
  const no = !value || /select|no\s*forecast/i.test(value);
  return no ? (hatchId ? `url(#${hatchId})` : '#f2f2f2')
            : ((window.forecastColors||{})[value] || '#e6e6e6');
}

function addZoomUI(svg, zoom){
  const wrap = svg.node().parentNode;
  if(!wrap || wrap.querySelector('.zoom-ui')) return;
  const ui = document.createElement('div');
  ui.className='zoom-ui';
  ui.innerHTML = `
    <button type="button" data-act="in">+</button>
    <button type="button" data-act="out">−</button>
    <button type="button" data-act="reset">⟲</button>`;
  wrap.appendChild(ui);
  const kStep = 1.4;
  ui.addEventListener('click', e=>{
    const act=e.target?.getAttribute('data-act'); if(!act) return;
    const sel=d3.select(svg.node());
    if(act==='in')    sel.transition().duration(250).call(zoom.scaleBy, kStep);
    if(act==='out')   sel.transition().duration(250).call(zoom.scaleBy, 1/kStep);
    if(act==='reset') sel.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
  });
}

/***********************
 * TABLE
 ***********************/
function buildSubdivisionTable(){
  const tbody=document.getElementById("subdivision-table-body");
  if(!tbody){ console.error("[Table] Missing #subdivision-table-body"); return; }
  tbody.innerHTML="";

  const groups={};
  (window.subdivisions||[]).forEach(r => (groups[r.state]??=[]).push(r));

  // placeholder so blank = hatch
  const opts = ["— Select —", ...(window.forecastOptions||[])];

  let serial=1;
  Object.keys(groups).forEach(state=>{
    const rows=groups[state];
    rows.forEach((row,i)=>{
      const tr=document.createElement("tr");
      tr.dataset.state=state;
      tr.dataset.subdiv=row.name;
      tr.dataset.norm=canonical(TableToGeoName[row.name]||row.name);
      tr.innerHTML=`
        <td>${serial++}</td>
        ${i===0?`<td rowspan="${rows.length}">${state}</td>`:""}
        <td>${row.name}</td>
        <td contenteditable="true"></td>
        <td><select class="day1">${opts.map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${opts.map(o=>`<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    });
  });

  tbody.querySelectorAll("select").forEach(sel=>sel.addEventListener("change", paintMapsFromTable));

  // table → map hover
  tbody.querySelectorAll("tr").forEach(tr=>{
    const id=tr.dataset.norm;
    tr.addEventListener("mouseenter",()=>{
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke-width",1.6).attr("stroke","#000");
    });
    tr.addEventListener("mouseleave",()=>{
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke-width",0.6).attr("stroke","#666");
    });
  });
}

/***********************
 * MAPS (clamped pan/zoom, centered fit)
 ***********************/
async function drawSubdivisionMap(svgSelector, onReady){
  if(!window.d3){ console.error("[Map] D3 not loaded."); return onReady?.(); }
  const svg=d3.select(svgSelector);
  if(svg.empty()){ console.error("[Map] SVG not found:", svgSelector); return onReady?.(); }
  svg.selectAll("*").remove();

  const W=860, H=580, PAD=14; // visual padding
  svg.attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet"); // no fixed width/height

  const nfPatternId=ensureNoForecastPattern(svg);

  try{
    const fc=await loadGeoJSON(SUBDIV_GEO_URLS);
    const features=fc.features||[];
    if(!features.length){ showInlineError(svg,"No features found in GeoJSON."); return onReady?.(); }

    const NAME=pickNameKey(features);

    // proportion-correct projection + padded fit
    const projection=d3.geoConicEqualArea().parallels([12,33]).center([82.5,22]);
    const path=d3.geoPath().projection(projection);
    const fit=featuresNearIndia(features);
    const fitFC = {type:"FeatureCollection", features: fit.length?fit:features};
    projection.fitExtent([[PAD,PAD],[W-PAD,H-PAD]], fitFC);

    // clamp translate extent to projected bounds (+ small margin)
    const b = path.bounds(fitFC);
    const clamp = [[Math.max(0, b[0][0]-8), Math.max(0, b[0][1]-8)],
                   [Math.min(W, b[1][0]+8), Math.min(H, b[1][1]+8)]];

    // Root group for zoom/pan
    const root = svg.append("g").attr("class","viewport");

    // FILLS (default hatch)
    root.append("g").attr("class","fills")
      .selectAll("path.state").data(features).enter().append("path")
      .attr("class","state").attr("d",path)
      .attr("data-name",d=>d.properties?.[NAME]??"")
      .attr("data-norm",d=>canonical(d.properties?.[NAME]))
      .attr("fill", `url(#${nfPatternId})`)
      .attr("stroke","none").attr("vector-effect","non-scaling-stroke")
      .on("mousemove", (ev,d)=>{
        const norm = canonical(d.properties?.[NAME]);
        const {d1,d2} = readSelections(norm);
        tip.show(
          `<div style="font-weight:700;margin-bottom:4px">${d.properties?.[NAME]??""}</div>
           <div>Day 1: ${d1 || "<em>—</em>"}</div>
           <div>Day 2: ${d2 || "<em>—</em>"}</div>`,
          ev.clientX, ev.clientY
        );
      })
      .on("mouseenter", (ev,d)=>{
        const id=canonical(d.properties?.[NAME]);
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke-width",1.6).attr("stroke","#000");
        setRowActive(id,true);
      })
      .on("mouseleave", (ev,d)=>{
        tip.hide();
        const id=canonical(d.properties?.[NAME]);
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke-width",0.6).attr("stroke","#666");
        setRowActive(id,false);
      })
      .on("click", (ev,d)=>{
        const id=canonical(d.properties?.[NAME]);
        const row=document.querySelector(`#subdivision-table-body tr[data-norm='${cssEscape(id)}']`);
        if(row){ row.scrollIntoView({behavior:'smooth',block:'center'}); row.animate([{background:'#fffa9e'},{background:''}],{duration:800}); }
      })
      .append("title").text(d=>d.properties?.[NAME]??"");

    // BORDERS overlay
    root.append("g").attr("class","borders")
      .selectAll("path.border").data(features).enter().append("path")
      .attr("class","border").attr("d",path)
      .attr("fill","none").attr("stroke","#666").attr("stroke-width",0.6)
      .attr("vector-effect","non-scaling-stroke").attr("pointer-events","none")
      .attr("data-name",d=>d.properties?.[NAME]??"")
      .attr("data-norm",d=>canonical(d.properties?.[NAME]));

    // Zoom/pan clamped to bounds
    const zoom = d3.zoom()
      .scaleExtent([1,8])
      .translateExtent(clamp)
      .on("zoom", ev => root.attr("transform", ev.transform));
    svg.call(zoom).on("dblclick.zoom", null);
    addZoomUI(svg, zoom);

    onReady?.();
  }catch(e){
    console.error("[Map] Geo load error:", e);
    showInlineError(svg,"Failed to load subdivision map data.");
    onReady?.();
  }
}

/***********************
 * COLOR FROM TABLE
 ***********************/
function paintMapsFromTable(){
  const rows=document.querySelectorAll("#subdivision-table-body tr");
  const patt1=document.getElementById("indiaSubMapDay1")?.getAttribute("data-nf-pattern");
  const patt2=document.getElementById("indiaSubMapDay2")?.getAttribute("data-nf-pattern");

  rows.forEach(row=>{
    const id=row.dataset.norm;
    const v1=row.querySelector("select.day1")?.value?.trim() || null;
    const v2=row.querySelector("select.day2")?.value?.trim() || null;

    const c1 = toPaint(v1, patt1);
    const c2 = toPaint(v2, patt2);

    d3.selectAll(`#indiaSubMapDay1 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c1);
    d3.selectAll(`#indiaSubMapDay2 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c2);
  });
}

/***********************
 * INIT
 ***********************/
window.addEventListener("unhandledrejection", e => console.error("[Global] Unhandled promise rejection:", e.reason || e));

window.addEventListener("load", ()=>{
  if(typeof updateISTDate==="function") updateISTDate();
  buildSubdivisionTable();

  drawSubdivisionMap("#indiaSubMapDay1", ()=>{
    drawSubdivisionMap("#indiaSubMapDay2", ()=>{
      paintMapsFromTable();
    });
  });

  // keep fit centered if wrapper resizes
  const wrap = document.querySelector(".map-wrapper") || document.body;
  new ResizeObserver(() => {
    drawSubdivisionMap("#indiaSubMapDay1", () =>
      drawSubdivisionMap("#indiaSubMapDay2", () => paintMapsFromTable())
    );
  }).observe(wrap);
});
