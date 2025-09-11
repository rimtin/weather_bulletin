// === Sub-divisions master list (Bihar excluded) ===
// IMPORTANT: The 'name' must match your GeoJSON sub-division label.
window.subdivisions = [
  { state: "Punjab",            name: "Punjab" },
  { state: "Rajasthan",         name: "West Rajasthan" },
  { state: "Rajasthan",         name: "East Rajasthan" },
  { state: "Gujarat",           name: "Saurashtra & Kutch" },
  { state: "Gujarat",           name: "Rest of Gujarat" },
  { state: "Uttar Pradesh",     name: "West UP" },
  { state: "Uttar Pradesh",     name: "East UP" },
  { state: "Madhya Pradesh",    name: "West Madhya Pradesh" },
  { state: "Madhya Pradesh",    name: "East Madhya Pradesh" },
  { state: "Chhattisgarh",      name: "Chhattisgarh" },
  { state: "Maharashtra",       name: "North Konkan" },
  { state: "Maharashtra",       name: "South Konkan" },
  { state: "Maharashtra",       name: "Madhya Maharashtra" },
  { state: "Maharashtra",       name: "Marathwada" },
  { state: "Telangana",         name: "Telangana" },
  { state: "Andhra Pradesh",    name: "Andhra Pradesh" },
  { state: "Andhra Pradesh",    name: "Rayalaseema (SW-AP)" },
  { state: "Karnataka",         name: "North Karnataka" },
  { state: "Karnataka",         name: "South Karnataka" },
  { state: "Tamil Nadu",        name: "Tamil Nadu" }
];

// Excel-style palette
window.forecastColors = {
  "Clear Sky": "#A7D8EB",           // 0–10%
  "Low Cloud Cover": "#C4E17F",     // 10–30%
  "Medium Cloud Cover": "#FFF952",  // 30–50%
  "High Cloud Cover": "#E69536",    // 50–75%
  "Overcast Cloud Cover": "#FF4D4D" // 75–100%
};
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
