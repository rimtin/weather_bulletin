// === EXACT sub-division set (20) — names from GeoJSON ST_NM ===
window.subdivisions = [
  { state: "Punjab",             name: "Punjab" },
  { state: "Rajasthan",          name: "West Rajasthan" },
  { state: "Rajasthan",          name: "East Rajasthan" },
  { state: "Gujarat",            name: "Saurashtra & Kachh" },
  { state: "Gujarat",            name: "Gujarat region" },
  { state: "Uttar Pradesh",      name: "West Uttar Pradesh" },
  { state: "Uttar Pradesh",      name: "East Uttar Pradesh" },
  { state: "Bihar",              name: "Bihar" },
  { state: "Madhya Pradesh",     name: "West Madhya Pradesh" },
  { state: "Madhya Pradesh",     name: "East Madhya Pradesh" },
  { state: "Chhattisgarh",       name: "Chhattisgarh" },
  { state: "Maharashtra",        name: "Madhya Maharashtra" },
  { state: "Maharashtra",        name: "Marathwada" },
  { state: "Maharashtra",        name: "Vidarbha" },
  { state: "Telangana",          name: "Telangana" },
  { state: "Andhra Pradesh",     name: "Coastal Andhra Pradesh" },
  { state: "Andhra Pradesh",     name: "Rayalaseema" },
  { state: "Karnataka",          name: "N.I. Karnataka" },
  { state: "Karnataka",          name: "S.I. Karnataka" },
  { state: "Tamil Nadu",         name: "Tamil Nadu & Puducherry" }
];

// Central palette (drives selects, legend swatches, map fills)
window.forecastColors = {
  "Clear Sky": "#A7D8EB",           // 0–10%
  "Low Cloud Cover": "#C4E17F",     // 10–30%
  "Medium Cloud Cover": "#FFF952",  // 30–50%
  "High Cloud Cover": "#E69536",    // 50–75%
  "Overcast Cloud Cover": "#FF4D4D" // 75–100%
};

// Options list auto-derived from palette
window.forecastOptions = Object.keys(window.forecastColors);

// Optional emoji overlay
window.forecastIcons = {
  "Clear Sky": "☀️",
  "Low Cloud Cover": "🌤️",
  "Medium Cloud Cover": "⛅",
  "High Cloud Cover": "🌥️",
  "Overcast Cloud Cover": "☁️"
};

// IST date helper
function updateISTDate() {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'long', year: 'numeric'
  }).format(now);
  document.getElementById('forecast-date').textContent = formatted;
}
