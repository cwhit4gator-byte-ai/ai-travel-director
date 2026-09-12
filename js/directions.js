import { state } from "./state.js?v=36";

export function preferredTripTravelMode() {
  const styles = (state.profile.travelStyles || []).map(value => String(value).toLocaleLowerCase());
  if (styles.some(value => value.includes("driv") || value.includes("road trip"))) return "driving";
  if (styles.some(value => value.includes("walk"))) return "walking";
  return "transit";
}

export function itineraryItemQuery(item, day) {
  const name = String(item?.name || "").trim();
  const location = String(item?.location || day?.overnightLocation || state.trip?.destination || "").trim();
  if (!name) return location;
  return location && !name.toLocaleLowerCase().includes(location.toLocaleLowerCase()) ? `${name}, ${location}` : name;
}

export function itemDirectionsURL(day, itemIndex) {
  const items = day?.items || [];
  const item = items[itemIndex];
  if (!item) return "";
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", itineraryItemQuery(item, day));
  const travelMode = preferredTripTravelMode();
  // Let Google offer available modes when transit is the general preference.
  if (travelMode !== "transit") url.searchParams.set("travelmode", travelMode);
  if (itemIndex > 0) url.searchParams.set("origin", itineraryItemQuery(items[itemIndex - 1], day));
  return url.href;
}

export function nextIncompleteTripStop(day) {
  return (day?.items || []).find(item => !item.done) || null;
}

export function currentLocationDirectionsURL(day, item = nextIncompleteTripStop(day), travelMode = "transit") {
  if (!item) return "";
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", itineraryItemQuery(item, day));
  if (["transit", "walking", "driving"].includes(travelMode)) url.searchParams.set("travelmode", travelMode);
  // Omitting origin lets Google use the device location or ask for a start.
  return url.href;
}

export function currentLocationTransitURL(day) {
  return currentLocationDirectionsURL(day, nextIncompleteTripStop(day), "transit");
}

export function dayRouteURL(day) {
  const stops = (day?.items || []).map(item => itineraryItemQuery(item, day)).filter(Boolean);
  if (!stops.length) return "";
  if (stops.length === 1) {
    const search = new URL("https://www.google.com/maps/search/");
    search.searchParams.set("api", "1");
    search.searchParams.set("query", stops[0]);
    return search.href;
  }
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", stops[0]);
  url.searchParams.set("destination", stops.at(-1));
  const travelMode = preferredTripTravelMode();
  // Let Google offer available modes when transit is the general preference.
  if (travelMode !== "transit") url.searchParams.set("travelmode", travelMode);
  if (stops.length > 2) url.searchParams.set("waypoints", stops.slice(1, -1).join("|"));
  return url.href;
}
