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

function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const succeed = response => { if (!settled) { settled = true; resolve(response); } };
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    try {
      const possiblePromise = geocoder.geocode({ address }, (results, status) => {
        if (status === "OK" && results?.length) succeed({ results });
        else fail(new Error(`Google Maps could not resolve ${address}.`));
      });
      if (possiblePromise?.then) possiblePromise.then(succeed, fail);
    } catch (error) {
      fail(error);
    }
  });
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
    geocodeAddress(query),
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

export async function renderGooglePlaceResultsMap(element, places) {
  if (!element) throw new Error("The map container is missing.");
  const sequence = ++renderSequence;
  const [mapsLibrary, markerLibrary] = await loadLibraries();
  const { Map, LatLngBounds } = mapsLibrary;
  const { AdvancedMarkerElement, PinElement } = markerLibrary;
  const usable = (places || []).map((place, cardIndex) => ({ place, cardIndex })).filter(({ place }) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
  if (!usable.length) throw new Error("No mapped place results were found.");

  map ||= new Map(element, {
    center: { lat: usable[0].place.latitude, lng: usable[0].place.longitude },
    zoom: 13,
    mapId: googleMapsConfig.mapId,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });
  if (sequence !== renderSequence) return `${usable.length} options found`;
  markers.forEach(existing => { existing.map = null; });
  if (routeLine) routeLine.setMap(null);
  routeLine = null;
  markers = usable.map(({ place, cardIndex }) => {
    const markerNumber = cardIndex + 1;
    const pin = PinElement ? new PinElement({ glyph: String(markerNumber), glyphColor: "#ffffff", background: "#246bfd", borderColor: "#0b1830" }) : null;
    return new AdvancedMarkerElement({ map, position: { lat: place.latitude, lng: place.longitude }, title: `${markerNumber}. ${place.name}`, ...(pin?.element ? { content: pin.element } : {}) });
  });
  if (usable.length > 1 && LatLngBounds) {
    const bounds = new LatLngBounds();
    usable.forEach(({ place }) => bounds.extend({ lat: place.latitude, lng: place.longitude }));
    map.fitBounds(bounds, 54);
  } else {
    map.setCenter?.({ lat: usable[0].place.latitude, lng: usable[0].place.longitude });
    map.setZoom?.(14);
  }
  return `${usable.length} options found`;
}

export async function focusGooglePlaceResult(element, place) {
  if (!element) throw new Error("The map container is missing.");
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("This place does not include a map location.");
  if (!map) await renderGooglePlaceResultsMap(element, [place]);
  const position = { lat: latitude, lng: longitude };
  if (typeof map.panTo === "function") map.panTo(position);
  else map.setCenter?.(position);
  map.setZoom?.(16);
  return place.name || place.address || "Selected place";
}

export async function searchNearbyPlaces(location, category = "top sights", maximum = 6) {
  await loadLibraries();
  const searchIntent = {
    "top sights": "top tourist attractions",
    "historic architecture": "historic sites and architecture",
    "local restaurants no alcohol": "well-rated local restaurants",
    "train station": "train stations and public transit",
    "quiet parks": "quiet parks and gardens"
  }[category] || String(category || "top tourist attractions");
  const { Place } = await window.google.maps.importLibrary("places");
  const response = await Promise.race([
    Place.searchByText({
      textQuery: `${searchIntent} in ${location}`,
      fields: ["id", "displayName", "formattedAddress", "shortFormattedAddress", "location", "rating", "userRatingCount", "photos", "googleMapsURI", "priceLevel", "primaryTypeDisplayName"],
      maxResultCount: Math.max(3, Math.min(10, Number(maximum) || 6)),
      language: "en-US"
    }),
    watchForAuthenticationFailure()
  ]);
  return (response.places || []).map(place => ({
    id: place.id || "",
    name: place.displayName || "Place",
    address: place.formattedAddress || place.shortFormattedAddress || location,
    category: place.primaryTypeDisplayName || searchIntent,
    rating: Number(place.rating || 0),
    reviewCount: Number(place.userRatingCount || 0),
    priceLevel: String(place.priceLevel || ""),
    latitude: typeof place.location?.lat === "function" ? place.location.lat() : Number(place.location?.lat),
    longitude: typeof place.location?.lng === "function" ? place.location.lng() : Number(place.location?.lng),
    photoURL: place.photos?.[0]?.getURI ? place.photos[0].getURI({ maxWidth: 400, maxHeight: 300 }) : "",
    mapsURL: place.googleMapsURI || ""
  })).filter(place => place.id && place.name);
}


export async function resolvePlaceCity(query) {
  const libraries = await loadLibraries();
  const Geocoder = libraries[2]?.Geocoder || window.google.maps.Geocoder;
  geocoder ||= new Geocoder();
  const response = await Promise.race([geocodeAddress(query), watchForAuthenticationFailure()]);
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
