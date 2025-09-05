// ---- COLORS + OPTIONS (global) ----
window.forecastColors = {
  "Clear Sky": "#A7D8EB",
  "Low Cloud Cover": "#C4E17F",
  "Medium Cloud Cover": "#FFF952",
  "High Cloud Cover": "#E69536",
  "Overcast Cloud Cover": "#FF4D4D"
};

// Extra labels that map to the hatched "No Forecast" fill in app.js
window.noForecastLabel = "No Forecast";
window.placeholderLabel = "— Select —";

// Order: placeholder (default) → color options → explicit No Forecast
window.forecastOptions = [
  window.placeholderLabel,
  ...Object.keys(window.forecastColors),
  window.noForecastLabel
];

// ---- SUBDIVISION ROWS (global) ----
// IMPORTANT: Keep names EXACTLY as in your GeoJSON ST_NM (case & spelling).
window.subdivisions = [
  // Punjab
  { state: "Punjab",            name: "Punjab" },

  // Rajasthan
  { state: "Rajasthan",         name: "West Rajasthan" },
  { state: "Rajasthan",         name: "East Rajasthan" },

  // Gujarat
  { state: "Gujarat",           name: "Saurashtra & Kachh" },     // exact ST_NM
  { state: "Gujarat",           name: "Gujarat region" },         // exact case

  // Uttar Pradesh
  { state: "Uttar Pradesh",     name: "West Uttar Pradesh" },
  { state: "Uttar Pradesh",     name: "East Uttar Pradesh" },

  // Bihar
  { state: "Bihar",             name: "Bihar" },

  // Madhya Pradesh
  { state: "Madhya Pradesh",    name: "West Madhya Pradesh" },
  { state: "Madhya Pradesh",    name: "East Madhya Pradesh" },

  // Chhattisgarh
  { state: "Chhattisgarh",      name: "Chhattisgarh" },

  // Maharashtra
  { state: "Maharashtra",       name: "Madhya Maharashtra" },
  { state: "Maharashtra",       name: "Marathwada" },
  { state: "Maharashtra",       name: "Vidarbha" },

  // Telangana
  { state: "Telangana",         name: "Telangana" },

  // Andhra Pradesh
  { state: "Andhra Pradesh",    name: "Coastal Andhra Pradesh" },
  { state: "Andhra Pradesh",    name: "Rayalaseema" },

  // Karnataka
  { state: "Karnataka",         name: "N.I. Karnataka" },         // exact ST_NM
  { state: "Karnataka",         name: "S.I. Karnataka" },         // exact ST_NM

  // Tamil Nadu
  { state: "Tamil Nadu",        name: "Tamil Nadu & Puducherry" }
];

// ---- Date header (IST) ----
function updateISTDate() {
  const formatted = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  });
  const el = document.getElementById("forecast-date");
  if (el) el.textContent = formatted;
}
