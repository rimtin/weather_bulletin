// === States shown in the main forecast (Bihar removed) ===
window.states = [
  "Punjab", "Rajasthan", "Gujarat", "Uttar Pradesh",
  "Madhya Pradesh", "Chhattisgarh", "Maharashtra",
  "Telangana", "Andhra Pradesh", "Karnataka", "Tamil Nadu"
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

// Subdivision registry (Bihar intentionally excluded)
// (Display-only chart below; map coloring is driven by STATES.)
window.subdivisions = [
  { subNo:  1, state: "Punjab",            name: "Punjab" },
  { subNo:  2, state: "Rajasthan",         name: "West Rajasthan" },
  { subNo:  3, state: "Rajasthan",         name: "East Rajasthan" },
  { subNo:  4, state: "Gujarat",           name: "Saurashtra & Kutch" },
  { subNo:  5, state: "Gujarat",           name: "Rest of Gujarat" },
  { subNo:  6, state: "Uttar Pradesh",     name: "West UP" },
  { subNo:  7, state: "Uttar Pradesh",     name: "East UP" },
  { subNo:  8, state: "Madhya Pradesh",    name: "West Madhya Pradesh" },
  { subNo:  9, state: "Madhya Pradesh",    name: "East Madhya Pradesh" },
  { subNo: 10, state: "Chhattisgarh",      name: "Chhattisgarh" },
  { subNo: 11, state: "Maharashtra",       name: "North Konkan" },
  { subNo: 12, state: "Maharashtra",       name: "South Konkan" },
  { subNo: 13, state: "Maharashtra",       name: "Madhya Maharashtra" },
  { subNo: 14, state: "Maharashtra",       name: "Marathwada" },
  { subNo: 15, state: "Telangana",         name: "Telangana" },
  { subNo: 16, state: "Andhra Pradesh",    name: "Andhra Pradesh" },
  { subNo: 17, state: "Andhra Pradesh",    name: "Rayalaseema (SW-AP)" },
  { subNo: 18, state: "Karnataka",         name: "North Karnataka" },
  { subNo: 19, state: "Karnataka",         name: "South Karnataka" },
  { subNo: 20, state: "Tamil Nadu",        name: "Tamil Nadu" }
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
