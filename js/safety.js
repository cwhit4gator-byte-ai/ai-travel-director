import { state } from "./state.js?v=38";

export function initializeSafety({ showView }) {
  function setSafety(html) { document.getElementById("safetyOutput").innerHTML = html; }
  document.getElementById("shareLocationButton").addEventListener("click", () => {
    if (!navigator.geolocation) return setSafety("<strong>Location unavailable.</strong> This browser does not support geolocation.");
    setSafety("<strong>Requesting location permission…</strong>");
    navigator.geolocation.getCurrentPosition(position => {
      const coordinates = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
      setSafety(`<strong>Location found.</strong><br>${coordinates}<br><button id="openCurrentMap" class="text-button">Open this area on the map</button>`);
      document.getElementById("openCurrentMap").addEventListener("click", () => { state.mapQuery = coordinates; showView("exploreView"); });
    }, () => setSafety("<strong>Location permission was not granted.</strong> You can enable it in your browser settings."));
  });
  document.getElementById("lostButton").addEventListener("click", () => setSafety("<strong>If you are lost:</strong><br>Stay in a well-lit public place. Identify a nearby landmark. Ask staff at a hotel, station, or official venue for help. Use the location tool above to open your current area on the map."));
  document.getElementById("unsafeButton").addEventListener("click", () => setSafety("<strong>Immediate safety guidance:</strong><br>Move toward a staffed public place. Contact local emergency services if there is immediate danger. Tell a trusted contact where you are. This app is not an emergency-response service."));
  document.getElementById("checkInButton").addEventListener("click", () => setSafety(`<strong>Checked in safely.</strong><br>${new Date().toLocaleString("en-US")}`));
}
