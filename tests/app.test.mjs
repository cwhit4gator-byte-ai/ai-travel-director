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
window.google = { maps: { importLibrary: async library => ({
  maps: { Map: class { fitBounds() {} } },
  marker: { AdvancedMarkerElement: class {} },
  geocoding: { Geocoder: class { async geocode({ address: query }) { return { results: [{ formatted_address: query, geometry: { viewport: {}, location: {} }, address_components: [{ types: ["locality"], long_name: "Prague" }] }] }; } } },
  places: { Place: { searchByText: async () => ({ places: ["Four Seasons Hotel Prague", "Prague Hotel Two", "Prague Hotel Three"].map((name, index) => ({ id: String(index + 1), displayName: name, formattedAddress: "Veleslavínova 2a, Prague, Czechia", rating: 4.5, userRatingCount: 100 })) }) } }
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
const element = id => document.getElementById(id);
const navigate = async view => document.querySelector(`[data-view-link="${view}"]`).emit("click");
const target = (attributes, parent) => new Element("button", attributes, parent);
const itineraryHTML = () => element("itineraryContent").innerHTML;
const dayHTML = number => itineraryHTML().split(`id="tripDay${number}"`)[1].split("</section>")[0];
const toggle = async id => element("itineraryContent").emit("click", { target: target({ "data-trip-action": "toggle" }, target({ "data-item-id": id })) });
const transitURL = number => new URL(dayHTML(number).match(/class="day-transit-button" href="([^"]+)"/)[1].replaceAll("&amp;", "&"));

test("app modules preserve startup and feature interactions", async t => {
  await t.test("startup loads all modules, uses existing saved data, and binds handlers once", () => {
    assert.equal(state.trip.destination, "Czechia");
    assert.match(element("homeHeading").textContent, /Czechia/);
    assert.match(element("communityList").innerHTML, /Charles Bridge/);
    assert.equal(element("itineraryContent").handlers.get("click").length, 1);
    assert.equal(element("hotelList").handlers.get("click").length, 1);
    assert.equal(startupErrors.length, 1);
    assert.equal(startupErrors[0][0], "Firebase configuration is incomplete:");
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
    assert.match(element("todayDashboard").innerHTML, /data-today-route="walking"/);
    assert.match(element("todayDashboard").innerHTML, /data-today-route="driving"/);
    assert.match(element("todayHeading").textContent, /Day 1 is ready/);
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
    await navigate("exploreView");
    await settle();
    assert.match(element("placeList").innerHTML, /data-add-place/);
    assert.match(element("communityMapList").innerHTML, /Charles Bridge/);
    await element("profileButton").emit("click");
    assert.equal(state.currentView, "profileView");
    element("profileName").value = "Test Traveler";
    element("publicProfilePrivate").checked = true;
    await element("profileForm").emit("submit");
    assert.equal(state.profile.name, "Test Traveler");
    assert.equal(state.profile.publicProfileVisible, false);
    assert.equal(state.currentView, "homeView");
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
