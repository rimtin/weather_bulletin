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

// build table from GeoJSON on first load (ensures 1:1 with map)
const AUTO_BUILD_FROM_GEO = true;

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
function pickNameKey(features){
  const pref = ["ST_NM","st_nm","ST_NAME","st_name","STNAME","NAME","name","SUBDIV","subdiv","SUBDIVISION","subdivision","SUB_DIV","sub_div"];
  const seen=new Set(); features.forEach(f=>Object.keys(f?.properties||{}).forEach(k=>seen.add(k)));
  for(const k of pref) if(seen.has(k)) return k;
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
    }catch(e){ console.warn("[GeoJSON] failed:", u, e); last=e; }
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
// fit uses only “near India” centroids to ignore far outliers during fit
function featuresNearIndia(features){
  const LON_MIN=60, LON_MAX=100, LAT_MIN=-5, LAT_MAX=40;
  return features.filter(f=>{
    try{ const [x,y]=d3.geoCentroid(f); return isFinite(x)&&isFinite(y)&&x>=LON_MIN&&x<=LON_MAX&&y>=LAT_MIN&&y<=LAT_MAX; }
    catch{ return false; }
  });
}
const tip = (()=>{ const el=document.createElement('div'); el.className='map-tip'; document.body.appendChild(el);
  return { show(html,x,y){ el.innerHTML=html; el.style.display='block'; const pad=12; el.style.left=Math.max(8,x+pad)+'px'; el.style.top=Math.max(8,y+pad)+'px';},
           hide(){ el.style.display='none'; } };
})();
function setRowActive(norm,on){ const row=document.querySelector(`#subdivision-table-body tr[data-norm='${cssEscape(norm)}']`); if(row) row.classList.toggle('active-row',!!on); }
function readSelections(norm){
  const row=document.querySelector(`#subdivision-table-body tr[data-norm='${cssEscape(norm)}']`);
  return row ? { d1: row.querySelector('.day1')?.value?.trim()||null, d2: row.querySelector('.day2')?.value?.trim()||null } : {d1:null,d2:null};
}
function toPaint(v,hatchId){ const no=!v||/select|no\s*forecast/i.test(v); return no ? (hatchId?`url(#${hatchId})`:'#f2f2f2') : ((window.forecastColors||{})[v]||'#e6e6e6'); }
function addZoomUI(svg, zoom){
  const wrap = svg.node().parentNode; if(!wrap || wrap.querySelector('.zoom-ui')) return;
  const ui=document.createElement('div'); ui.className='zoom-ui';
  ui.innerHTML=`<button data-act="in">+</button><button data-act="out">−</button><button data-act="reset">⟲</button>`;
  wrap.appendChild(ui); const k=1.4;
  ui.addEventListener('click',e=>{ const a=e.target.getAttribute('data-act'); if(!a) return;
    const s=d3.select(svg.node());
    if(a==='in') s.transition().duration(200).call(zoom.scaleBy,k);
    if(a==='out') s.transition().duration(200).call(zoom.scaleBy,1/k);
    if(a==='reset') s.transition().duration(220).call(zoom.transform,d3.zoomIdentity);
  });
}

/***********************
 * TABLE
 ***********************/
function buildSubdivisionTableFromList(names){
  const tbody=document.getElementById("subdivision-table-body");
  tbody.innerHTML="";
  const opts=["— Select —", ...(window.forecastOptions||[])];
  let serial=1;
  // we don’t have reliable “state” groups from Geo, so display ST_NM in both cols
  names.sort((a,b)=>a.localeCompare(b)).forEach(name=>{
    const tr=document.createElement("tr");
    tr.dataset.state=name;               // harmless; shown in 2nd column
    tr.dataset.subdiv=name;
    tr.dataset.norm=canonical(name);
    tr.innerHTML=`
      <td>${serial++}</td>
      <td>${name}</td>
      <td>${name}</td>
      <td contenteditable="true"></td>
      <td><select class="day1">${opts.map(o=>`<option>${o}</option>`).join("")}</select></td>
      <td><select class="day2">${opts.map(o=>`<option>${o}</option>`).join("")}</select></td>
    `;
    tbody.appendChild(tr);
  });

  // interactions
  tbody.querySelectorAll("select").forEach(sel=>sel.addEventListener("change", paintMapsFromTable));
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
 * MAPS (centered fit + clamped pan/zoom)
 ***********************/
async function drawSubdivisionMap(svgSelector, onReady){
  const svg = d3.select(svgSelector); svg.selectAll("*").remove();
  const W=860,H=580,PAD=14;
  svg.attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet");
  const hatch = ensureNoForecastPattern(svg);

  try{
    const fc = await loadGeoJSON(SUBDIV_GEO_URLS);
    const feats = fc.features || [];
    if(!feats.length) throw new Error("No features");
    const NAME = pickNameKey(feats);

    // Proportion-correct projection; fit to near-India set
    const proj = d3.geoConicEqualArea().parallels([12,33]).center([82.5,22]);
    const path = d3.geoPath().projection(proj);
    const fitSet = featuresNearIndia(feats);
    const fitFC = { type:"FeatureCollection", features: fitSet.length?fitSet:feats };
    proj.fitExtent([[PAD,PAD],[W-PAD,H-PAD]], fitFC);

    // Clamp zoom/pan to projected bounds
    const b = path.bounds(fitFC);
    const clamp = [[Math.max(0,b[0][0]-8), Math.max(0,b[0][1]-8)],
                   [Math.min(W,b[1][0]+8), Math.min(H,b[1][1]+8)]];

    // Root g
    const root = svg.append("g").attr("class","viewport");

    // FILLS (default hatch)
    root.append("g").attr("class","fills")
      .selectAll("path.state").data(feats).enter().append("path")
      .attr("class","state").attr("d",path)
      .attr("data-name",d=>d.properties?.[NAME]??"")
      .attr("data-norm",d=>canonical(d.properties?.[NAME]))
      .attr("fill", `url(#${hatch})`).attr("stroke","none")
      .attr("vector-effect","non-scaling-stroke")
      .on("mousemove",(ev,d)=>{
        const norm=canonical(d.properties?.[NAME]); const {d1,d2}=readSelections(norm);
        tip.show(`<div style="font-weight:700;margin-bottom:4px">${d.properties?.[NAME]??""}</div>
                  <div>Day 1: ${d1||"<em>—</em>"}</div><div>Day 2: ${d2||"<em>—</em>"}</div>`, ev.clientX, ev.clientY);
      })
      .on("mouseenter",(ev,d)=>{
        const id=canonical(d.properties?.[NAME]);
        d3.selectAll(`#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],
                      #indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`)
          .attr("stroke-width",1.6).attr("stroke","#000");
        setRowActive(id,true);
      })
      .on("mouseleave",(ev,d)=>{
        tip.hide(); const id=canonical(d.properties?.[NAME]);
        d3.selectAll(`#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],
                      #indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`)
          .attr("stroke-width",0.6).attr("stroke","#666");
        setRowActive(id,false);
      })
      .on("click",(ev,d)=>{
        const id=canonical(d.properties?.[NAME]);
        const row=document.querySelector(`#subdivision-table-body tr[data-norm='${cssEscape(id)}']`);
        if(row){ row.scrollIntoView({behavior:'smooth',block:'center'}); row.animate([{background:'#fffa9e'},{background:''}],{duration:800}); }
      })
      .append("title").text(d=>d.properties?.[NAME]??"");

    // BORDERS overlay
    root.append("g").attr("class","borders")
      .selectAll("path.border").data(feats).enter().append("path")
      .attr("class","border").attr("d",path)
      .attr("fill","none").attr("stroke","#666").attr("stroke-width",0.6)
      .attr("vector-effect","non-scaling-stroke").attr("pointer-events","none")
      .attr("data-name",d=>d.properties?.[NAME]??"")
      .attr("data-norm",d=>canonical(d.properties?.[NAME]));

    // Pan/zoom clamped to India
    const zoom = d3.zoom().scaleExtent([1,8]).translateExtent(clamp)
      .on("zoom", ev => root.attr("transform", ev.transform));
    svg.call(zoom).on("dblclick.zoom", null);
    addZoomUI(svg, zoom);

    // (1) FIRST RUN: build table from Geo so colors will work for every feature
    if (AUTO_BUILD_FROM_GEO && svgSelector === "#indiaSubMapDay1") {
      const names = feats.map(f => f.properties?.[NAME]).filter(Boolean);
      buildSubdivisionTableFromList([...new Set(names)]);
    }

    onReady?.();
  }catch(e){
    console.error("[Map] Error:", e);
    svg.selectAll("*").remove();
    const W=860,H=580;
    svg.attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet");
    svg.append("text").attr("x",W/2).attr("y",H/2).attr("text-anchor","middle")
      .attr("font-size",16).attr("fill","#a00").text("Failed to load subdivision map data.");
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
    const v1=row.querySelector(".day1")?.value?.trim()||null;
    const v2=row.querySelector(".day2")?.value?.trim()||null;
    d3.selectAll(`#indiaSubMapDay1 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", toPaint(v1,patt1));
    d3.selectAll(`#indiaSubMapDay2 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", toPaint(v2,patt2));
  });
}

/***********************
 * INIT
 ***********************/
window.addEventListener("load", ()=>{
  if(typeof updateISTDate==="function") updateISTDate();

  // If you want to keep your hand-written table instead, comment the next line:
  if (!AUTO_BUILD_FROM_GEO) buildSubdivisionTableFromList((window.subdivisions||[]).map(r=>r.name));

  // Draw maps then paint (so color shows immediately)
  drawSubdivisionMap("#indiaSubMapDay1", ()=>{
    drawSubdivisionMap("#indiaSubMapDay2", ()=>{
      paintMapsFromTable();
    });
  });
});
