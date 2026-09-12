import { googleMapsConfig } from "./firebase-config.js";

let map = null;
let markers = [];
let routeLine = null;
let geocoder = null;
let librariesPromise = null;
let renderSequence = 0;
let authenticationFailure = null;

function watchForAuthenticationFailure() {
  if (!authenticationFailure) {
    authenticationFailure = new Promise((resolve, reject) => {
      window.gm_authFailure = () => reject(new Error("Google Maps authentication was rejected."));
    });
  }
  return authenticationFailure;
}

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

  const authFailure = watchForAuthenticationFailure();
  installGoogleMapsLoader(googleMapsConfig);
  librariesPromise ||= Promise.all([
    window.google.maps.importLibrary("maps"),
    window.google.maps.importLibrary("marker"),
    window.google.maps.importLibrary("geocoding")
  ]);
  return Promise.race([librariesPromise, authFailure]);
}

export async function renderGoogleRouteMap(element, queries) {
  if (!element) throw new Error("The map container is missing.");
  const sequence = ++renderSequence;
  const requestedLocations = [...new Set((Array.isArray(queries) ? queries : [queries]).map(query => String(query || "").trim()).filter(Boolean))].slice(0, 10);
  if (!requestedLocations.length) throw new Error("A map location is required.");

  const [mapsLibrary, markerLibrary, geocodingLibrary] = await loadLibraries();
  const { Map, LatLngBounds, Polyline } = mapsLibrary;
  const { AdvancedMarkerElement, PinElement } = markerLibrary;
  const Geocoder = geocodingLibrary?.Geocoder || window.google.maps.Geocoder;

  map ||= new Map(element, {
    center: { lat: 40.7128, lng: -74.006 },
    zoom: 11,
    mapId: googleMapsConfig.mapId,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });
  geocoder ||= new Geocoder();

  const responses = await Promise.allSettled(requestedLocations.map(query => Promise.race([
    geocoder.geocode({ address: query }),
    watchForAuthenticationFailure()
  ]).then(response => ({ query, result: response.results?.[0] }))));
  const resolved = responses.filter(response => response.status === "fulfilled" && response.value.result).map(response => response.value);
  if (!resolved.length) throw new Error("No map result was found.");
  if (sequence !== renderSequence) return resolved.length === 1 ? (resolved[0].result.formatted_address || resolved[0].query) : `${resolved.length} itinerary stops mapped`;

  markers.forEach(existing => { existing.map = null; });
  if (routeLine) routeLine.setMap(null);
  routeLine = null;
  markers = resolved.map(({ query, result }, index) => {
    const pin = PinElement ? new PinElement({ glyph: String(index + 1), glyphColor: "#ffffff", background: "#246bfd", borderColor: "#0b1830" }) : null;
    return new AdvancedMarkerElement({
      map,
      position: result.geometry.location,
      title: `${index + 1}. ${result.formatted_address || query}`,
      ...(pin?.element ? { content: pin.element } : {})
    });
  });

  if (resolved.length === 1 || !LatLngBounds) {
    map.fitBounds(resolved[0].result.geometry.viewport);
  } else {
    const bounds = new LatLngBounds();
    resolved.forEach(({ result }) => bounds.extend(result.geometry.location));
    if (Polyline) routeLine = new Polyline({ map, path: resolved.map(({ result }) => result.geometry.location), geodesic: true, strokeColor: "#246bfd", strokeOpacity: .82, strokeWeight: 4 });
    map.fitBounds(bounds, 54);
  }

  return resolved.length === 1 ? (resolved[0].result.formatted_address || resolved[0].query) : `${resolved.length} itinerary stops mapped`;
}

export async function renderGoogleMap(element, query) {
  return renderGoogleRouteMap(element, [query]);
}


export async function resolvePlaceCity(query) {
  const libraries = await loadLibraries();
  const Geocoder = libraries[2]?.Geocoder || window.google.maps.Geocoder;
  geocoder ||= new Geocoder();
  const response = await Promise.race([geocoder.geocode({ address: query }), watchForAuthenticationFailure()]);
  const result = response.results?.[0];
  if (!result) throw new Error("No location was found for this itinerary event.");
  const preferredTypes = ["locality", "postal_town", "administrative_area_level_2", "administrative_area_level_1"];
  for (const type of preferredTypes) {
    const component = result.address_components?.find(item => item.types?.includes(type));
    if (component?.long_name) return component.long_name;
  }
  throw new Error("Google Maps did not return a city for this itinerary event.");
}


export async function searchNearbyHotels(location, preference = "best", maximum = 9) {
  await loadLibraries();
  const searchIntent = {
    value: "affordable well-rated hotels",
    central: "hotels in the city center",
    quiet: "quiet well-rated hotels",
    best: "best well-rated hotels"
  }[preference] || "best well-rated hotels";
  const { Place } = await window.google.maps.importLibrary("places");
  const response = await Promise.race([
    Place.searchByText({
      textQuery: `${searchIntent} in ${location}`,
      fields: ["id", "displayName", "formattedAddress", "shortFormattedAddress", "location", "rating", "userRatingCount", "photos", "googleMapsURI", "priceLevel"],
      includedType: "lodging",
      maxResultCount: Math.max(3, Math.min(20, Number(maximum) || 9)),
      language: "en-US"
    }),
    watchForAuthenticationFailure()
  ]);
  return (response.places || []).map(place => ({
    id: place.id || "",
    name: place.displayName || "Hotel",
    address: place.formattedAddress || place.shortFormattedAddress || location,
    rating: Number(place.rating || 0),
    reviewCount: Number(place.userRatingCount || 0),
    priceLevel: String(place.priceLevel || ""),
    latitude: typeof place.location?.lat === "function" ? place.location.lat() : Number(place.location?.lat || 0),
    longitude: typeof place.location?.lng === "function" ? place.location.lng() : Number(place.location?.lng || 0),
    photoURL: place.photos?.[0]?.getURI ? place.photos[0].getURI({ maxWidth: 900, maxHeight: 600 }) : "",
    mapsURL: place.googleMapsURI || ""
  })).filter(place => place.id && place.name);
}
