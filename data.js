// === 20 sub-divisions (exact ST_NM values from your GeoJSON) ===
window.subdivisions = [
  { state: "Punjab",             name: "Punjab" },
  { state: "Rajasthan",          name: "West Rajasthan" },
  { state: "Rajasthan",          name: "East Rajasthan" },
  { state: "Gujarat",            name: "Saurashtra & Kachh" },
  { state: "Gujarat",            name: "Gujarat region" },
  { state: "Uttar Pradesh",      name: "West Uttar Pradesh" },
  { state: "Uttar Pradesh",      name: "East Uttar Pradesh" },
  //{ state: "Bihar",              name: "Bihar" },
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

// Palette → drives selects, map fills, and legend colors
window.forecastColors = {
  "Clear Sky": "#A7D8EB",
  "Low Cloud Cover": "#C4E17F",
  "Medium Cloud Cover": "#FFF952",
  "High Cloud Cover": "#E69536",
  "Overcast Cloud Cover": "#FF4D4D"
};
window.forecastOptions = Object.keys(window.forecastColors);

// Emoji overlay
window.forecastIcons = {
  "Clear Sky": "☀️",
  "Low Cloud Cover": "🌤️",
  "Medium Cloud Cover": "⛅",
  "High Cloud Cover": "🌥️",
  "Overcast Cloud Cover": "☁️"
};

// Colored cloud-table rows
window.cloudRows = [
  { cover: "0–10 %",   label: "Clear Sky",            type: "No Cloud" },
  { cover: "10–30 %",  label: "Low Cloud Cover",      type: "Few Clouds" },
  { cover: "30–50 %",  label: "Medium Cloud Cover",   type: "Scattered Clouds/Partly Cloudy" },
  { cover: "50–75 %",  label: "High Cloud Cover",     type: "Broken Clouds/Mostly Cloudy" },
  { cover: "75–100 %", label: "Overcast Cloud Cover", type: "Cloudy/ Overcast" }
];

// IST date helper
function updateISTDate() {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'long', year: 'numeric'
  }).format(now);
  document.getElementById('forecast-date').textContent = formatted;
}
