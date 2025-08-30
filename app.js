// Build ONE combined table with Day1/Day2 per subdivision
function renderSubdivisionForecastTable() {
  const tbody = document.getElementById("subdivision-forecast-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  let serial = 1;

  states.forEach(stateName => {
    const rows = subdivisions.filter(s => s.state === stateName);
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");

      // Serial + State only on the first row of each state
      if (i === 0) {
        const tdSerial = document.createElement("td");
        tdSerial.textContent = serial++;
        tdSerial.rowSpan = rows.length;

        const tdState = document.createElement("td");
        tdState.textContent = stateName;
        tdState.rowSpan = rows.length;

        tr.appendChild(tdSerial);
        tr.appendChild(tdState);
      }

      // Subdivision
      const tdSub = document.createElement("td"); tdSub.textContent = row.name; tr.appendChild(tdSub);

      // No. Solar Site (editable)
      const tdSites = document.createElement("td"); tdSites.contentEditable = "true"; tr.appendChild(tdSites);

      // Day 1 / Day 2 selects
      const mkSel = () => `<select>${forecastOptions.map(o=>`<option>${o}</option>`).join("")}</select>`;
      const tdD1 = document.createElement("td"); tdD1.innerHTML = mkSel(); tr.appendChild(tdD1);
      const tdD2 = document.createElement("td"); tdD2.innerHTML = mkSel(); tr.appendChild(tdD2);

      tbody.appendChild(tr);
    });
  });
}

// Two Leaflet maps with IMD WMS overlays
function initLeafletWms() {
  const view = [22.5, 80], zoom = 5;
  const base = () => L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:7,minZoom:4,attribution:"© OpenStreetMap"});
  const wms  = day => L.tileLayer.wms("https://reactjs.imd.gov.in/geoserver/imd/wms",{
    service:"WMS",layers:"imd:Warnings_StateDistrict_Merged",format:"image/png",transparent:true,version:"1.1.1",srs:"EPSG:4326",env:`day:${day}`
  });

  const m1 = L.map("leafletDay1").setView(view, zoom); base().addTo(m1); wms("Day1_Color").addTo(m1);
  const m2 = L.map("leafletDay2").setView(view, zoom); base().addTo(m2); wms("Day2_Color").addTo(m2);
}

// Init
window.onload = () => {
  updateISTDate?.();
  renderSubdivisionForecastTable();
  initLeafletWms();
};
