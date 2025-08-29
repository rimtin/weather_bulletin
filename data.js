// States list used for grouping (Bihar removed)
const states = [
  "Punjab","Rajasthan","Gujarat","Uttar Pradesh",
  "Madhya Pradesh","Chhattisgarh","Maharashtra",
  "Telangana","Andhra Pradesh","Karnataka","Tamil Nadu"
];

// Exact Excel-style palette
const forecastColors = {
  "Clear Sky": "#A7D8EB",
  "Low Cloud Cover": "#C4E17F",
  "Medium Cloud Cover": "#FFF952",
  "High Cloud Cover": "#E69536",
  "Overcast Cloud Cover": "#FF4D4D"
};
const forecastOptions = Object.keys(forecastColors);

const forecastIcons = {
  "Clear Sky": "☀️",
  "Low Cloud Cover": "🌤️",
  "Medium Cloud Cover": "⛅",
  "High Cloud Cover": "☁️",
  "Overcast Cloud Cover": "🌫️"
};

// Subdivision list (Bihar excluded)
const subdivisions = [
  { subNo:1,  state:"Punjab",            name:"Punjab" },
  { subNo:2,  state:"Rajasthan",         name:"W-Raj" },
  { subNo:3,  state:"Rajasthan",         name:"E-Raj" },
  { subNo:4,  state:"Gujarat",           name:"W-Gujarat (Saurashtra & Kachh)" },
  { subNo:5,  state:"Gujarat",           name:"E-Gujarat Region" },
  { subNo:6,  state:"Uttar Pradesh",     name:"W-UP" },
  { subNo:7,  state:"Uttar Pradesh",     name:"E-UP" },
  { subNo:9,  state:"Madhya Pradesh",    name:"W-MP" },
  { subNo:10, state:"Madhya Pradesh",    name:"E-MP" },
  { subNo:11, state:"Chhattisgarh",      name:"Chhattisgarh" },
  { subNo:12, state:"Maharashtra",       name:"Madhya -MH" },
  { subNo:13, state:"Maharashtra",       name:"Marathwada" },
  { subNo:14, state:"Maharashtra",       name:"Vidarbha" },
  { subNo:15, state:"Telangana",         name:"Telangana" },
  { subNo:16, state:"Andhra Pradesh",    name:"Andhra Pradesh" },
  { subNo:17, state:"Andhra Pradesh",    name:"SW-AP (Rayalaseema)" },
  { subNo:18, state:"Karnataka",         name:"North-Karnataka" },
  { subNo:19, state:"Karnataka",         name:"South- Karnataka" },
  { subNo:20, state:"Tamil Nadu",        name:"Tamil Nadu" }
];

// Date (IST)
function updateISTDate(){
  const formatted = new Date().toLocaleDateString("en-IN", {
    day:"2-digit", month:"long", year:"numeric", timeZone:"Asia/Kolkata"
  });
  const el = document.getElementById("forecast-date");
  if (el) el.textContent = formatted;
}
