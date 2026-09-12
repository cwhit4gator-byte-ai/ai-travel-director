import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate as settle } from "node:timers/promises";
import { createDocument, Element, memoryStorage } from "./support/dom.mjs";

const version = new URL(JSON.parse(await readFile(new URL("../manifest.json", import.meta.url))).start_url, "https://test.local").searchParams.get("app_version");
const moduleURL = name => new URL(`../js/${name}.js?v=${version}`, import.meta.url);
const address = "Václavské nám. 68, 110 00 Prague, Czechia";
const trip = {
  destination: "Czechia", days: 2, budget: 1500, generatedBy: "openai",
  itinerary: [
    { day: 1, title: "Prague — historic sights", overnightLocation: "Prague", items: [
      { id: "museum", name: "National Museum", location: address, time: "9:00 AM", cost: 15, done: false },
      { id: "tower", name: "The Powder Tower", location: "Nám. Republiky 5, Prague, Czechia", time: "1:00 PM", cost: 10, done: false },
      { id: "dinner", name: "Dinner & a walk", location: "Prague", time: "6:00 PM", cost: 20, done: false }
    ] },
    { day: 2, title: "Prague — castle", overnightLocation: "Prague", items: [
      { id: "castle", name: "Prague Castle", location: "Prague", time: "10:00 AM", cost: 20, done: false }
    ] }
  ]
};
const experience = { id: "insight", place: "Charles Bridge", text: "Visit early", rating: 5, audience: "Everyone", anonymous: true, photoURLs: ["https://example.test/bridge.jpg"], photoAnalysis: { description: "Morning view of Charles Bridge" } };
const document = createDocument(await readFile(new URL("../index.html", import.meta.url), "utf8"));
globalThis.document = document;
globalThis.localStorage = memoryStorage({ aitd_v3_state: JSON.stringify({ trip, experiences: [experience] }), aitd_onboarding_v1: "completed" });
globalThis.sessionStorage = memoryStorage();
// Timers are registered but not run; tests exercise persistence directly via clicks.
globalThis.setTimeout = () => 1;
globalThis.clearTimeout = () => {};
const window = new Element();
let reloads = 0;
Object.assign(window, { location: { href: "https://test.local/", reload: () => reloads++ }, scrollTo() {}, matchMedia: () => ({ matches: false }), confirm: () => true });
globalThis.window = window;
const worker = new Element();
let registration = null;
worker.register = async (url, options) => { registration = { url, options, updates: 0 }; return { update: async () => registration.updates++ }; };
let sharedText = "";
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true, language: "en-US", serviceWorker: worker, clipboard: { writeText: async text => { sharedText = text; } } } });
// Mock only the external Maps boundary, leaving feature modules and data intact.
const geocodedAddresses = [];
const placeSearchQueries = [];
const mapCenters = [];
const mapZooms = [];
let placeSearchFails = false;
let markerCount = 0;
let routeLineCount = 0;
window.google = { maps: { importLibrary: async library => ({
  maps: { Map: class { fitBounds() {} panTo(position) { mapCenters.push(position); } setCenter(position) { mapCenters.push(position); } setZoom(zoom) { mapZooms.push(zoom); } }, LatLngBounds: class { extend() {} }, Polyline: class { constructor() { routeLineCount++; } setMap() {} } },
  marker: { AdvancedMarkerElement: class { constructor() { markerCount++; } }, PinElement: class { constructor() { this.element = {}; } } },
  geocoding: { Geocoder: class { geocode({ address: query }, callback) { geocodedAddresses.push(query); const results = [{ formatted_address: query, geometry: { viewport: {}, location: {} }, address_components: [{ types: ["locality"], long_name: "Prague" }] }]; queueMicrotask(() => callback(results, "OK")); } } },
  places: { Place: { searchByText: async request => {
    placeSearchQueries.push(request.textQuery);
    if (placeSearchFails) throw new Error("Places unavailable in test");
    const hotelSearch = request.includedType === "lodging";
    const placeCity = request.textQuery.match(/ in (.+)$/)?.[1] || "Brno";
    const names = hotelSearch ? ["Four Seasons Hotel Prague", "Prague Hotel Two", "Prague Hotel Three"] : [`${placeCity} Castle`, `${placeCity} Museum`, `${placeCity} Old Town Hall`];
    return { places: names.map((name, index) => ({
      id: `${hotelSearch ? "hotel" : "place"}-${index + 1}`,
      displayName: name,
      formattedAddress: hotelSearch ? "Veleslavínova 2a, Prague, Czechia" : `${index + 1} Historic Square, Brno, Czechia`,
      rating: 4.5,
      userRatingCount: 100 + index,
      primaryTypeDisplayName: hotelSearch ? "Hotel" : "Historical landmark",
      location: { lat: () => 49.19 + index * .01, lng: () => 16.60 + index * .01 },
      photos: [{
        getURI: ({ maxWidth = 0, maxHeight = 0 }) => `https://example.test/${encodeURIComponent(name)}-${maxWidth}x${maxHeight}.jpg`,
        authorAttributions: [{ displayName: "Test Photographer", uri: "https://example.test/photographer" }]
      }]
    })) };
  } } }
}[library]) } };
const startupErrors = [];
const originalError = console.error;
console.error = (...args) => startupErrors.push(args);
globalThis.fetch = async url => {
  if (url === "/__/firebase/init.json") return { ok: true, json: async () => ({}) };
  if (String(url).includes("frankfurter.dev")) return { ok: true, json: async () => ({ rate: 0.9 }) };
  throw new Error(`Unexpected network request: ${url}`);
};
await import(new URL(`../app.js?v=${version}`, import.meta.url));
await settle();
console.error = originalError;
const { state } = await import(moduleURL("state"));
const directions = await import(moduleURL("directions"));
const model = await import(moduleURL("trip-model"));
const featuredPlaceModel = await import(moduleURL("featured-place"));
const itineraryPhotoModel = await import(moduleURL("itinerary-photos"));
const smartAddModel = await import(moduleURL("smart-add"));
const tripAdjustmentModel = await import(moduleURL("trip-adjustments"));
const ui = await import(moduleURL("ui"));
const element = id => document.getElementById(id);
const navigate = async view => {
  const links = document.querySelectorAll(`[data-view-link="${view}"]`);
  const navigationLink = links.find(link => link.classList.contains("nav-item")) || links[0];
  return navigationLink.emit("click");
};
const target = (attributes, parent) => new Element("button", attributes, parent);
const itineraryHTML = () => element("itineraryContent").innerHTML;
const dayHTML = number => itineraryHTML().split(`id="tripDay${number}"`)[1].split("</section>")[0];
const toggle = async id => element("itineraryContent").emit("click", { target: target({ "data-trip-action": "toggle" }, target({ "data-item-id": id })) });
const transitURL = number => new URL(dayHTML(number).match(/class="day-transit-button" href="([^"]+)"/)[1].replaceAll("&amp;", "&"));

test("app modules preserve startup and feature interactions", async t => {
  await t.test("startup loads all modules, uses existing saved data, and binds handlers once", async () => {
    await settle();
    assert.equal(state.trip.destination, "Czechia");
    assert.match(element("homeHeading").textContent, /Czechia/);
    assert.equal(element("startPlanningButton").textContent, "Ask AI about this trip");
    assert.equal(element("tripHeroFeatured").hidden, false);
    assert.equal(element("tripHero").classList.contains("has-active-trip"), true);
    assert.equal(element("tripHeroEyebrow").textContent, "TRIP COMMAND CENTER");
    assert.equal(element("tripHeroPlace").textContent, "Prague Old Town Hall");
    assert.match(element("tripHeroImage").src, /1400x900/);
    assert.equal(element("tripHeroAttribution").textContent, "Photo: Test Photographer");
    assert.equal(element("featuredPlaceButton").textContent, "View featured place");
    assert.match(itineraryHTML(), /data-itinerary-photo="true"/);
    assert.match(itineraryHTML(), /class="timeline-photo"/);
    assert.match(element("communityList").innerHTML, /Charles Bridge/);
    assert.ok(document.querySelector(".home-community-panel"));
    assert.equal(document.querySelectorAll(".metric-card").length, 4);
    assert.equal(element("itineraryContent").handlers.get("click").length, 1);
    assert.equal(element("hotelList").handlers.get("click").length, 1);
    assert.equal(startupErrors.length, 1);
    assert.equal(startupErrors[0][0], "Firebase configuration is incomplete:");
    assert.equal(ui.safeImageURL(""), "");
  });
  await t.test("bottom navigation uses consistent icons and announces the active page", async () => {
    const navItems = document.querySelectorAll(".nav-item");
    const scrollSurface = document.querySelector(".app-scroll");
    const home = navItems.find(item => item.dataset.viewLink === "homeView");
    const itinerary = navItems.find(item => item.dataset.viewLink === "itineraryView");
    assert.ok(scrollSurface);
    assert.equal(navItems.length, 5);
    assert.equal(document.querySelectorAll(".nav-icon").length, 5);
    assert.equal(document.querySelectorAll(".nav-label").length, 5);
    assert.equal(home.attributes["aria-current"], "page");
    await navigate("itineraryView");
    assert.equal(home.classList.contains("active"), false);
    assert.equal("aria-current" in home.attributes, false);
    assert.equal(itinerary.classList.contains("active"), true);
    assert.equal(itinerary.attributes["aria-current"], "page");
    assert.deepEqual(scrollSurface.scrollPosition, { top: 0, behavior: "smooth" });
    await navigate("homeView");
  });
  await t.test("transit advances, skips completed stops, restores an unchecked stop, and completes each day", async () => {
    await navigate("itineraryView");
    assert.equal(transitURL(1).searchParams.get("destination"), `National Museum, ${address}`);
    assert.equal(transitURL(1).searchParams.has("origin"), false);
    assert.equal(transitURL(1).searchParams.get("travelmode"), "transit");
    await toggle("museum");
    assert.match(transitURL(1).searchParams.get("destination"), /^The Powder Tower/);
    assert.match(dayHTML(1), /Next stop: The Powder Tower/);
    await toggle("dinner");
    assert.match(transitURL(1).searchParams.get("destination"), /^The Powder Tower/);
    await toggle("tower");
    assert.doesNotMatch(dayHTML(1), /class="day-transit-button"/);
    assert.match(dayHTML(1), /All stops complete for this day/);
    assert.match(transitURL(2).searchParams.get("destination"), /^Prague Castle/);
    await toggle("museum");
    assert.match(transitURL(1).searchParams.get("destination"), /^National Museum/);
    const savedTrip = JSON.parse(localStorage.getItem("aitd_v3_state")).trip;
    assert.equal(savedTrip.itinerary[0].items[0].done, false);
    assert.equal(savedTrip.itinerary[0].items[1].done, true);
    await toggle("dinner");
    await toggle("museum");
    assert.match(dayHTML(1), /Next stop: Dinner &amp; a walk/);
  });
  await t.test("directions retain travel modes and handle empty days", async () => {
    const originalTravelStyles = [...state.profile.travelStyles];
    assert.equal(directions.currentLocationTransitURL({ items: [] }), "");
    assert.equal(directions.dayRouteURL({ items: [] }), "");
    state.profile.travelStyles = ["Public transit"];
    assert.equal(new URL(directions.dayRouteURL(state.trip.itinerary[0])).searchParams.has("travelmode"), false);
    for (const [style, mode] of [["Walking", "walking"], ["Driving", "driving"]]) {
      state.profile.travelStyles = [style];
      assert.equal(new URL(directions.itemDirectionsURL(state.trip.itinerary[0], 1)).searchParams.get("travelmode"), mode);
      assert.equal(new URL(directions.dayRouteURL(state.trip.itinerary[0])).searchParams.get("travelmode"), mode);
    }
    state.trip.itinerary.push({ day: 3, title: "Free day", items: [] });
    await navigate("itineraryView");
    assert.doesNotMatch(dayHTML(3), /day-transit-button|All stops complete/);
    state.trip.itinerary.pop();
    state.profile.travelStyles = originalTravelStyles;
  });
  await t.test("activities can be added, edited, moved, deleted, and shared", async () => {
    await navigate("itineraryView");
    assert.match(dayHTML(1), />Complete</);
    assert.match(dayHTML(1), />Directions</);
    assert.match(dayHTML(1), />Edit</);
    assert.match(dayHTML(1), />Earlier</);
    await element("itineraryContent").emit("click", { target: target({ "data-day-action": "add", "data-day-number": "1" }) });
    assert.equal(element("tripItemDialog").open, true);
    element("tripItemName").value = "Evening garden";
    element("tripItemLocation").value = "Prague";
    await element("tripItemForm").emit("submit");
    const added = state.trip.itinerary[0].items.at(-1);
    assert.equal(added.name, "Evening garden");
    await element("itineraryContent").emit("click", { target: target({ "data-trip-action": "edit" }, target({ "data-item-id": added.id })) });
    element("tripItemName").value = "Garden & river";
    await element("tripItemForm").emit("submit");
    assert.equal(added.name, "Garden & river");
    await element("itineraryContent").emit("click", { target: target({ "data-trip-action": "up" }, target({ "data-item-id": added.id })) });
    assert.equal(directions.nextIncompleteTripStop(state.trip.itinerary[0]), added);
    assert.match(transitURL(1).searchParams.get("destination"), /^Garden & river/);
    await element("itineraryContent").emit("click", { target: target({ "data-day-action": "share", "data-day-number": "1" }) });
    assert.match(sharedText, /Garden & river/);
    assert.match(sharedText, /Route: https:\/\/www.google.com\/maps\/dir/);
    await element("deleteTripItem").emit("click");
    assert.equal(model.findTripItem(added.id), null);
    assert.match(transitURL(1).searchParams.get("destination"), /^Dinner & a walk/);
  });
  await t.test("one trip date labels each day, fills grouped hotel dates, and powers Today routes", async () => {
    await navigate("itineraryView");
    await element("itineraryContent").emit("change", { target: Object.assign(target({ "data-trip-start-date": "" }), { value: "2027-06-10" }) });
    assert.equal(state.trip.startDate, "2027-06-10");
    assert.match(dayHTML(1), /Jun 10/);
    assert.match(dayHTML(2), /Jun 11/);
    assert.match(element("tripSummary").textContent, /Jun 10–Jun 11, 2027/);
    assert.deepEqual(state.trip.hotelStayDates["Prague::1-2"], { checkIn: "2027-06-10", checkOut: "2027-06-12", manualDates: false });
    assert.match(element("todayDashboard").innerHTML, /data-today-route="transit"/);
    assert.match(element("todayDashboard").innerHTML, /class="today-quick-actions"/);
    assert.match(element("todayDashboard").innerHTML, /data-today-action="complete"/);
    assert.match(element("todayDashboard").innerHTML, /data-today-action="change"/);
    assert.match(element("todayDashboard").innerHTML, /data-today-photo="true"/);
    assert.match(element("todayDashboard").innerHTML, /class="today-next-photo"/);
    assert.match(element("todayDashboard").innerHTML, /class="today-next-photo-credit"/);
    assert.match(element("todayDashboard").innerHTML, /class="today-progress"/);
    assert.match(element("todayDashboard").innerHTML, /class="today-mini-timeline"/);
    assert.match(element("todayDashboard").innerHTML, /scheduled activities complete/);
    assert.equal(element("todayStatusBadge").attributes["data-phase"], "upcoming");
    assert.match(element("todayHeading").textContent, /Day 1 is ready/);
  });
  await t.test("Today adjustments preview one protected change before applying it", async () => {
    await navigate("homeView");
    const next = directions.nextIncompleteTripStop(state.trip.itinerary[0]);
    const originalStop = structuredClone(next);
    const originalHotels = structuredClone(state.trip.hotelSelections || {});
    state.trip.hotelSelections = { ...originalHotels, "Prague::1-2": { name: "Protected Hotel" } };
    const protectedHotels = structuredClone(state.trip.hotelSelections);
    const completedStops = state.trip.itinerary[0].items.filter(item => item.done).map(item => item.id);
    assert.equal(tripAdjustmentModel.shiftTime("11:30 PM"), "12:30 AM");
    await element("todayDashboard").emit("click", { target: target({ "data-today-action": "change" }) });
    assert.equal(element("tripAdjustmentDialog").open, true);
    assert.match(element("tripAdjustmentContext").textContent, new RegExp(next.name));
    await element("tripAdjustmentReasons").emit("click", { target: target({ "data-adjustment-reason": "weather" }) });
    assert.equal(element("tripAdjustmentReasonStep").hidden, true);
    assert.equal(element("tripAdjustmentReviewStep").hidden, false);
    assert.match(element("tripAdjustmentAfterName").textContent, /Indoor highlight/);
    assert.equal(next.name, originalStop.name);
    await element("applyTripAdjustment").emit("click");
    assert.match(next.name, /Indoor highlight/);
    assert.equal(element("tripAdjustmentDialog").open, false);
    assert.deepEqual(state.trip.itinerary[0].items.filter(item => item.done).map(item => item.id), completedStops);
    assert.deepEqual(state.trip.hotelSelections, protectedHotels);
    assert.match(element("toast").textContent, /rest of your trip is unchanged/);

    for (const key of Object.keys(next)) delete next[key];
    Object.assign(next, originalStop);
    state.trip.hotelSelections = originalHotels;
    await navigate("homeView");
    await element("todayDashboard").emit("click", { target: target({ "data-today-action": "change" }) });
    await element("tripAdjustmentReasons").emit("click", { target: target({ "data-adjustment-reason": "custom" }) });
    assert.equal(state.currentView, "plannerView");
    assert.equal(element("chatInput").value, `Change ${next.name} on Day 1: `);

    await navigate("homeView");
    await element("todayDashboard").emit("click", { target: target({ "data-today-action": "complete" }) });
    assert.equal(next.done, true);
    assert.match(element("toast").textContent, /marked complete/);
    assert.match(element("todayDashboard").innerHTML, /Prague Castle/);
    await navigate("itineraryView");
    await toggle(next.id);
    await navigate("homeView");
  });
  await t.test("hotels retain grouped nights, dates, country, booking links, and currency", async () => {
    await navigate("hotelsView");
    await settle();
    assert.equal(model.tripOvernightStops().length, 1);
    assert.match(element("overnightLocationSelect").innerHTML, /Prague · 2 nights/);
    assert.equal((element("hotelList").innerHTML.match(/<article class="hotel-card/g) || []).length, 3);
    await element("hotelStayForm").emit("change", { target: Object.assign(target({ "data-hotel-stay-field": "checkIn" }), { value: "2027-06-10" }) });
    assert.equal(state.hotelStay.checkOut, "2027-06-12");
    await element("hotelStayForm").emit("change", { target: Object.assign(target({ "data-hotel-stay-field": "currency" }), { value: "EUR" }) });
    await settle();
    assert.match(element("hotelList").innerHTML, /€/);
    const html = element("hotelList").innerHTML;
    const booking = new URL(html.match(/href="(https:\/\/www.booking.com[^\"]+)"/)[1]);
    assert.equal(booking.searchParams.get("checkin"), "2027-06-10");
    assert.equal(booking.searchParams.get("checkout"), "2027-06-12");
    assert.match(booking.searchParams.get("ss"), /Czechia/);
    assert.equal(booking.searchParams.get("selected_currency"), "EUR");
  });
  await t.test("community photo descriptions, collections, and add-to-trip remain connected", async () => {
    await element("communityList").emit("click", { target: target({ class: "community-photo-button", "data-experience-id": "insight", "data-photo-index": "0" }) });
    assert.equal(element("communityPhotoDialog").open, true);
    assert.equal(element("communityPhotoDescription").textContent, "Morning view of Charles Bridge");
    await element("closeCommunityPhoto").emit("click");
    await element("communityList").emit("click", { target: target({ "data-save-collection": "insight" }) });
    element("newCollectionName").value = "Prague favorites";
    await element("collectionForm").emit("submit");
    assert.equal(state.collections[0].items[0].postId, "insight");
    assert.match(element("collectionsList").innerHTML, /Charles Bridge/);
    await element("communityList").emit("click", { target: target({ "data-community-save": "insight" }) });
    assert.equal(model.communityTripItems().length, 1);
    assert.equal(state.currentView, "itineraryView");
    await element("communityList").emit("click", { target: target({ "data-community-save": "insight" }) });
    assert.equal(model.communityTripItems().length, 1);
  });
  await t.test("Explore and profile navigation still work", async () => {
    const originalDestination = state.trip.destination;
    const originalMapQuery = state.mapQuery;
    state.trip.destination = "Prague → Brno → Vienna";
    state.trip.itinerary.push(
      { day: 3, title: "Brno", overnightLocation: "Brno", items: [{ id: "brno-afternoon", name: "Brno afternoon", location: "Brno", time: "1:00 PM", durationMinutes: 90, cost: 0, done: false }] },
      { day: 4, title: "Vienna", overnightLocation: "Vienna", items: [] }
    );
    state.mapQuery = state.trip.destination;
    await navigate("exploreView");
    await settle();
    assert.doesNotMatch(element("routeStopList").innerHTML, /Full route/);
    assert.match(element("routeStopList").innerHTML, /Brno/);
    assert.deepEqual(geocodedAddresses.slice(-3), ["Prague", "Brno", "Vienna"]);
    assert.equal(markerCount >= 3, true);
    assert.equal(routeLineCount >= 1, true);
    assert.match(element("mapLabelText").textContent, /3 itinerary stops mapped/);
    await element("routeStopList").emit("click", { target: target({ "data-route-stop-index": "1" }) });
    await settle();
    assert.equal(element("mapSearchInput").value, "Brno");
    assert.match(element("routeStopList").innerHTML, /route-stop-button active[^>]*data-route-stop-index="1"/);
    assert.equal(element("mapResultsSection").hidden, true);
    await document.querySelector('[data-map-filter="historic architecture"]').emit("click");
    await settle();
    await settle();
    assert.equal(element("mapResultsSection").hidden, false);
    assert.match(element("mapResultsHeading").textContent, /History near Brno/);
    assert.match(placeSearchQueries.at(-1), /historic sites and architecture in Brno/);
    assert.match(element("placeList").innerHTML, /Brno Castle/);
    assert.match(element("placeList").innerHTML, /aria-label="Option 1 matches map marker 1"/);
    assert.match(element("placeList").innerHTML, /aria-label="Option 3 matches map marker 3"/);
    assert.match(element("placeList").innerHTML, />Show on map</);
    assert.match(element("placeList").innerHTML, /data-add-place/);
    assert.match(element("placeList").innerHTML, />Add to trip</);
    assert.match(element("placeList").innerHTML, />Directions</);
    assert.match(element("mapLabelText").textContent, /3 History options in Brno/);
    await element("placeList").emit("click", { target: target({ "data-show-place-index": "0" }) });
    await settle();
    assert.deepEqual(mapCenters.at(-1), { lat: 49.19, lng: 16.6 });
    assert.equal(mapZooms.at(-1), 16);
    assert.match(element("mapLabelText").textContent, /Selected · Brno Castle/);

    await element("placeList").emit("click", { target: target({ "data-add-place": "Brno Castle", "data-add-place-index": "0" }) });
    assert.equal(element("smartAddDialog").open, true);
    assert.equal(element("smartAddDay").value, "3");
    assert.equal(element("smartAddTime").value, "10:00");
    assert.equal(element("smartAddDuration").value, "120");
    assert.equal(element("smartAddTitle").textContent, "Brno Castle");
    assert.match(element("smartAddPlaceContext").textContent, /Map option 1.*1 Historic Square, Brno, Czechia/);
    assert.match(element("smartAddRecommendation").textContent, /Best fit: Day 3/);
    element("smartAddTime").value = "12:30";
    await element("smartAddForm").emit("change");
    assert.match(element("smartAddWarnings").innerHTML, /Time conflict with Brno afternoon/);
    element("smartAddTime").value = "10:00";
    await element("smartAddForm").emit("change");
    assert.equal(element("smartAddWarnings").hidden, true);
    await element("smartAddForm").emit("submit");
    const smartPlace = state.trip.itinerary[2].items[0];
    assert.equal(smartPlace.name, "Brno Castle");
    assert.equal(smartPlace.placeId, "place-1");
    assert.equal(smartPlace.durationMinutes, 120);
    assert.equal(state.trip.itinerary[2].items[1].id, "brno-afternoon");
    assert.equal(element("smartAddDialog").open, false);
    assert.equal(state.currentView, "exploreView");
    await element("placeList").emit("click", { target: target({ "data-add-place": "Brno Castle", "data-add-place-index": "0" }) });
    assert.match(element("smartAddWarnings").innerHTML, /Already in your trip on Day 3/);
    assert.equal(element("smartAddSubmit").disabled, true);
    await element("closeSmartAddDialog").emit("click");

    placeSearchFails = true;
    await document.querySelector('[data-map-filter="local restaurants no alcohol"]').emit("click");
    await settle();
    await settle();
    assert.match(element("mapResultsHeading").textContent, /Food map searches near Brno/);
    assert.match(element("placeList").innerHTML, /Top-rated local restaurants in Brno/);
    assert.doesNotMatch(element("placeList").innerHTML, /Old town architecture walk/);
    assert.match(element("placeList").innerHTML, />Show map search</);
    assert.doesNotMatch(element("placeList").innerHTML, />Add to trip</);
    await element("placeList").emit("click", { target: target({ "data-show-place-index": "0" }) });
    await settle();
    await settle();
    assert.match(geocodedAddresses.at(-1), /Top-rated local restaurants in Brno/);
    placeSearchFails = false;
    assert.match(element("communityMapList").innerHTML, /Charles Bridge/);
    state.trip.itinerary.splice(2, 2);
    state.trip.destination = originalDestination;
    state.mapQuery = originalMapQuery;
    await element("profileButton").emit("click");
    assert.equal(state.currentView, "profileView");
    element("profileName").value = "Test Traveler";
    element("publicProfilePrivate").checked = true;
    await element("profileForm").emit("submit");
    assert.equal(state.profile.name, "Test Traveler");
    assert.equal(state.profile.publicProfileVisible, false);
    assert.equal(state.currentView, "homeView");
    assert.equal(element("cloudConnectButton").hidden, true);
  });
  await t.test("local planner recognizes the active itinerary without replacing it", async () => {
    const activeTrip = state.trip;
    await navigate("plannerView");
    assert.equal(element("plannerTripContext").hidden, false);
    assert.match(element("plannerTripContext").textContent, /Active trip: Czechia · 2 days/);
    assert.equal(element("chatInput").placeholder, "Ask about or change your active trip");
    assert.match(element("chatMessages").children[0].textContent, /active Czechia itinerary/);
    element("chatInput").value = "Which activity is next?";
    await element("chatForm").emit("submit", { submitter: target({}) });
    await settle();
    assert.equal(state.trip, activeTrip);
    assert.equal(state.trip.destination, "Czechia");
  });
  await t.test("planner still creates a new local trip", async () => {
    await navigate("plannerView");
    element("chatInput").value = "Plan 3 days in Vienna for $1500";
    await element("chatForm").emit("submit", { submitter: target({}) });
    await settle();
    assert.equal(state.trip.destination, "Vienna");
    assert.equal(state.trip.itinerary.length, 3);
    assert.equal(state.trip.generatedBy, "local");
    assert.match(element("homeHeading").textContent, /Vienna/);
  });
  await t.test("PWA installation and update detection use the new version", async () => {
    await window.emit("load");
    assert.equal(registration.url, `./service-worker.js?v=${version}`);
    assert.equal(registration.options.updateViaCache, "none");
    assert.equal(registration.updates, 1);
    await worker.emit("controllerchange");
    await worker.emit("controllerchange");
    assert.equal(reloads, 1);
    let prompted = false;
    await window.emit("beforeinstallprompt", { prompt: () => { prompted = true; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
    assert.equal(element("installButton").hidden, false);
    await element("installButton").emit("click");
    assert.equal(prompted, true);
    assert.equal(element("installButton").hidden, true);
  });
});

test("Smart Add scheduling helpers select the least crowded matching city and keep time order", () => {
  const plan = {
    startDate: "2027-07-01",
    itinerary: [
      { day: 1, title: "Brno arrival", overnightLocation: "Brno", items: [{ id: "one", name: "Old Town", location: "Brno", time: "9:00 AM" }, { id: "two", name: "Lunch", location: "Brno", time: "12:00 PM" }] },
      { day: 2, title: "Brno", overnightLocation: "Brno", items: [{ id: "late", name: "Evening walk", location: "Brno", time: "6:00 PM" }] },
      { day: 3, title: "Vienna", overnightLocation: "Vienna", items: [] }
    ]
  };
  const place = { id: "castle", name: "Špilberk Castle", address: "Špilberk 210/1, Brno, Czechia" };
  assert.equal(smartAddModel.recommendTripDay(plan, place, "Brno").day, 2);
  assert.equal(smartAddModel.parseClockMinutes("1:15 PM"), 795);
  assert.equal(smartAddModel.formatClockTime(795), "1:15 PM");
  const assessment = smartAddModel.assessSmartAddSchedule(plan, { place, dayNumber: 2, time: "14:00", durationMinutes: 120, contextLocation: "Brno" });
  assert.equal(assessment.duplicate, undefined);
  assert.equal(assessment.conflicts.length, 0);
  const added = { id: "added", name: place.name, location: place.address, time: "2:00 PM" };
  smartAddModel.insertTripItemChronologically(plan.itinerary[1], added);
  assert.deepEqual(plan.itinerary[1].items.map(item => item.id), ["added", "late"]);
});

test("featured destination banner follows the active trip day and ranks popular photographed places", () => {
  const route = {
    destination: "Prague → Brno → Vienna",
    startDate: "2027-07-01",
    itinerary: [
      { day: 1, overnightLocation: "Prague", items: [] },
      { day: 2, overnightLocation: "Brno", items: [] },
      { day: 3, overnightLocation: "Vienna", items: [] }
    ]
  };
  assert.equal(featuredPlaceModel.featuredTripLocation(route, new Date(2027, 6, 2, 12)), "Brno");
  assert.equal(featuredPlaceModel.featuredTripLocation(route, new Date(2027, 5, 20, 12)), "Prague");
  const ranked = featuredPlaceModel.rankFeaturedPlaces([
    { name: "No photo", rating: 5, reviewCount: 100000 },
    { name: "Local favorite", rating: 4.9, reviewCount: 800, heroPhotoURL: "https://example.test/local.jpg" },
    { name: "Popular landmark", rating: 4.7, reviewCount: 18000, heroPhotoURL: "https://example.test/popular.jpg" }
  ]);
  assert.deepEqual(ranked.map(place => place.name), ["Popular landmark", "Local favorite"]);
  const fallback = featuredPlaceModel.selectWikimediaPage([
    { index: 1, title: "List of landmarks", pageimage: "List.jpg", thumbnail: { source: "https://example.test/list.jpg" } },
    { index: 3, title: "Later landmark", pageimage: "Later.jpg", thumbnail: { source: "https://example.test/later.jpg" } },
    { index: 2, title: "City landmark", pageimage: "City.jpg", thumbnail: { source: "https://example.test/city.jpg" } }
  ]);
  assert.equal(fallback.title, "City landmark");
});

test("itinerary photo lookup uses the activity and its overnight location", () => {
  assert.equal(
    itineraryPhotoModel.itineraryPhotoKey({ name: "Prague Castle", location: "Hradčany, Prague" }, { overnightLocation: "Prague" }),
    "prague castle | hradčany, prague"
  );
  assert.equal(
    itineraryPhotoModel.itineraryPhotoKey({ name: "Evening walk" }, { overnightLocation: "Vienna" }),
    "evening walk | vienna"
  );
  assert.deepEqual(
    featuredPlaceModel.activityPhotoSearch({ name: "Central market lunch", category: "Local culture" }, { overnightLocation: "Prague" }),
    { query: "Prague cuisine", terms: ["cuisine", "food", "market"] }
  );
  assert.equal(
    featuredPlaceModel.activityPhotoSearch({ name: "Prague Castle", location: "Hradčany, Prague" }, { overnightLocation: "Prague" }).query,
    "Prague Castle, Hradčany, Prague"
  );
});
