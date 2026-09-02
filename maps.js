import { googleMapsConfig } from "./firebase-config.js";

let map = null;
let marker = null;
let geocoder = null;
let librariesPromise = null;
let renderSequence = 0;

function installGoogleMapsLoader({ apiKey, version = "weekly" }) {
  window.google ||= {};
  window.google.maps ||= {};

  if (window.google.maps.importLibrary) return;

  const requestedLibraries = new Set();
  const callbackName = "__travelAIMapsReady__";
  let loaderPromise;

  window.google.maps.importLibrary = (libraryName, ...args) => {
    requestedLibraries.add(libraryName);

    loaderPromise ||= new Promise((resolve, reject) => {
      queueMicrotask(() => {
        const script = document.createElement("script");
        const parameters = new URLSearchParams({
          key: apiKey,
          v: version,
          callback: `google.maps.${callbackName}`
        });

        parameters.set("libraries", [...requestedLibraries].join(","));
        window.google.maps[callbackName] = resolve;
        script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`;
        script.async = true;
        script.nonce = document.querySelector("script[nonce]")?.nonce || "";
        script.onerror = () => reject(new Error("Google Maps could not load."));
        document.head.append(script);
      });
    });

    return loaderPromise.then(() => window.google.maps.importLibrary(libraryName, ...args));
  };
}

async function loadLibraries() {
  if (!googleMapsConfig?.apiKey || !googleMapsConfig?.mapId) {
    throw new Error("Google Maps is not configured.");
  }

  installGoogleMapsLoader(googleMapsConfig);
  librariesPromise ||= Promise.all([
    window.google.maps.importLibrary("maps"),
    window.google.maps.importLibrary("marker"),
    window.google.maps.importLibrary("geocoding")
  ]);
  return librariesPromise;
}

export async function renderGoogleMap(element, query) {
  if (!element) throw new Error("The map container is missing.");
  const sequence = ++renderSequence;

  const [{ Map }, { AdvancedMarkerElement }, { Geocoder }] = await loadLibraries();

  map ||= new Map(element, {
    center: { lat: 40.7128, lng: -74.006 },
    zoom: 11,
    mapId: googleMapsConfig.mapId,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });
  geocoder ||= new Geocoder();

  const response = await geocoder.geocode({ address: query });
  const result = response.results?.[0];
  if (!result) throw new Error("No map result was found.");
  if (sequence !== renderSequence) return result.formatted_address || query;

  map.fitBounds(result.geometry.viewport);
  if (marker) marker.map = null;
  marker = new AdvancedMarkerElement({
    map,
    position: result.geometry.location,
    title: result.formatted_address || query
  });

  return result.formatted_address || query;
}
