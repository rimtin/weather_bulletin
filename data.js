// States (Bihar removed)
const states = [
  "Punjab","Rajasthan","Gujarat","Uttar Pradesh",
  "Madhya Pradesh","Chhattisgarh","Maharashtra",
  "Telangana","Andhra Pradesh","Karnataka","Tamil Nadu"
];

// Excel palette (used only for table dropdowns UI)
const forecastColors = {
  "Clear Sky":"#A7D8EB","Low Cloud Cover":"#C4E17F","Medium Cloud Cover":"#FFF952",
  "High Cloud Cover":"#E69536","Overcast Cloud Cover":"#FF4D4D"
};
const forecastOptions = Object.keys(forecastColors);

// Subdivisions (Bihar excluded)
const subdivisions = [
  { state:"Punjab",         name:"Punjab" },
  { state:"Rajasthan",      name:"W-Raj" },
  { state:"Rajasthan",      name:"E-Raj" },
  { state:"Gujarat",        name:"W-Gujarat (Saurashtra & Kachh)" },
  { state:"Gujarat",        name:"E-Gujarat Region" },
  { state:"Uttar Pradesh",  name:"W-UP" },
  { state:"Uttar Pradesh",  name:"E-UP" },
  { state:"Madhya Pradesh", name:"W-MP" },
  { state:"Madhya Pradesh", name:"E-MP" },
  { state:"Chhattisgarh",   name:"Chhattisgarh" },
  { state:"Maharashtra",    name:"Madhya -MH" },
  { state:"Maharashtra",    name:"Marathwada" },
  { state:"Maharashtra",    name:"Vidarbha" },
  { state:"Telangana",      name:"Telangana" },
  { state:"Andhra Pradesh", name:"Andhra Pradesh" },
  { state:"Andhra Pradesh", name:"SW-AP (Rayalaseema)" },
  { state:"Karnataka",      name:"North-Karnataka" },
  { state:"Karnataka",      name:"South- Karnataka" },
  { state:"Tamil Nadu",     name:"Tamil Nadu" }
];

// Date (IST)
function updateISTDate(){
  const d = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric",timeZone:"Asia/Kolkata"});
  const el = document.getElementById("forecast-date"); if(el) el.textContent = d;
}
