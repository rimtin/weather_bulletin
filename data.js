// ---- COLORS + OPTIONS (global) ----
window.forecastColors = {
  "Clear Sky": "#A7D8EB",
  "Low Cloud Cover": "#C4E17F",
  "Medium Cloud Cover": "#FFF952",
  "High Cloud Cover": "#E69536",
  "Overcast Cloud Cover": "#FF4D4D"
};
window.forecastOptions = [
  "Clear Sky",
  "Low Cloud Cover",
  "Medium Cloud Cover",
  "High Cloud Cover",
  "Overcast Cloud Cover",
  "No Forecast Available"  // handled as hatch pattern
];

// (optional) simple emoji map if you ever want icons
window.forecastIcons = {
  "Clear Sky": "☀️",
  "Low Cloud Cover": "🌤️",
  "Medium Cloud Cover": "⛅",
  "High Cloud Cover": "🌥️",
  "Overcast Cloud Cover": "☁️"
};

// ---- SUBDIVISION ROWS (global) ----
// Keep names EXACTLY as in your GeoJSON ST_NM
window.subdivisions = [
  // 1–20 as requested (matching IMD sub-divisions)
  { state: "Punjab",            name: "Punjab" },

  { state: "Rajasthan",         name: "West Rajasthan" },
  { state: "Rajasthan",         name: "East Rajasthan" },

  { state: "Gujarat",           name: "Saurashtra & Kachh" },
  { state: "Gujarat",           name: "Gujarat region" },

  { state: "Uttar Pradesh",     name: "West Uttar Pradesh" },
  { state: "Uttar Pradesh",     name: "East Uttar Pradesh" },

  { state: "Madhya Pradesh",    name: "West Madhya Pradesh" },
  { state: "Madhya Pradesh",    name: "East Madhya Pradesh" },

  { state: "Chhattisgarh",      name: "Chhattisgarh" },

  { state: "Maharashtra",       name: "Madhya Maharashtra" },
  { state: "Maharashtra",       name: "Marathwada" },
  { state: "Maharashtra",       name: "Vidarbha" },

  { state: "Telangana",         name: "Telangana" },

  { state: "Andhra Pradesh",    name: "Coastal Andhra Pradesh" },
  { state: "Andhra Pradesh",    name: "Rayalaseema" },

  { state: "Karnataka",         name: "N.I. Karnataka" },
  { state: "Karnataka",         name: "S.I. Karnataka" },

  { state: "Tamil Nadu",        name: "Tamil Nadu & Puducherry" },

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
