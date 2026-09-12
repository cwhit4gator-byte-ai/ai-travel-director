import test from "node:test";
import assert from "node:assert/strict";
import { memoryStorage } from "./support/dom.mjs";

globalThis.localStorage = memoryStorage();
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "en-US" } });

const version = "30";
const model = await import(new URL(`../js/trip-model.js?v=${version}`, import.meta.url));
const hotels = await import(new URL(`../js/hotels.js?v=${version}`, import.meta.url));
const today = await import(new URL(`../js/today.js?v=${version}`, import.meta.url));
const planner = await import(new URL(`../js/planner.js?v=${version}`, import.meta.url));
const { state } = await import(new URL(`../js/state.js?v=${version}`, import.meta.url));

test("trip calendar groups consecutive cities and keeps manual hotel dates", () => {
  const trip = {
    startDate: "2027-09-03",
    days: 4,
    destination: "Czechia and Austria",
    itinerary: [
      { day: 1, overnightLocation: "Prague", items: [{ location: "Prague" }] },
      { day: 2, overnightLocation: "Prague", items: [{ location: "Prague" }] },
      { day: 3, overnightLocation: "Vienna", items: [{ location: "Vienna" }] },
      { day: 4, overnightLocation: "Vienna", items: [{ location: "Vienna" }] }
    ],
    hotelStayDates: {
      "Vienna::3-4": { checkIn: "2027-09-10", checkOut: "2027-09-12", manualDates: true }
    }
  };
  state.trip = trip;
  const stops = model.tripOvernightStops();
  assert.deepEqual(stops.map(stop => [stop.location, stop.startDay, stop.endDay]), [["Prague", 1, 2], ["Vienna", 3, 4]]);
  hotels.reconcileHotelStayDates(trip, stops);
  assert.deepEqual(trip.hotelStayDates["Prague::1-2"], { checkIn: "2027-09-03", checkOut: "2027-09-05", manualDates: false });
  assert.deepEqual(trip.hotelStayDates["Vienna::3-4"], { checkIn: "2027-09-10", checkOut: "2027-09-12", manualDates: true });

  trip.startDate = "2027-10-01";
  hotels.reconcileHotelStayDates(trip, stops);
  assert.equal(trip.hotelStayDates["Prague::1-2"].checkIn, "2027-10-01");
  assert.equal(trip.hotelStayDates["Prague::1-2"].checkOut, "2027-10-03");
  assert.equal(trip.hotelStayDates["Vienna::3-4"].checkIn, "2027-09-10");
});

test("Today advances to the current or next unfinished itinerary day", () => {
  const trip = {
    startDate: "2027-04-10",
    itinerary: [
      { day: 1, items: [{ name: "Museum", done: true }] },
      { day: 2, items: [{ name: "Old Town", done: false }] },
      { day: 3, items: [{ name: "Castle", done: false }] }
    ]
  };
  assert.equal(today.tripTodayContext(trip, "2027-04-09").phase, "upcoming");
  assert.equal(today.tripTodayContext(trip, "2027-04-10").day.day, 2);
  assert.equal(today.tripTodayContext(trip, "2027-04-11").phase, "today");
  assert.equal(today.tripTodayContext(trip, "2027-04-14").phase, "overdue");
});

test("AI context excludes managed hotels and revisions preserve active trip details", () => {
  const activeTrip = {
    destination: "Czechia",
    days: 2,
    startDate: "2027-04-10",
    budget: 1500,
    hotelStayDates: { "Prague::1-2": { checkIn: "2027-04-10", checkOut: "2027-04-12", manualDates: true } },
    hotelSelections: { "Prague::1-2": { name: "Hotel One" } },
    itinerary: [
      { day: 1, title: "Prague — history", overnightLocation: "Prague", items: [
        { id: "museum", name: "National Museum", location: "Prague", time: "9:00 AM", category: "History", done: true },
        { id: "hotel", name: "Hotel One", location: "Prague", time: "Overnight", category: "Hotel", hotelStopId: "Prague::1-2", done: false }
      ] },
      { day: 2, title: "Prague — architecture", overnightLocation: "Prague", items: [{ id: "castle", name: "Prague Castle", location: "Prague", done: false }] }
    ]
  };
  const context = model.tripForAIContext(activeTrip);
  assert.equal(context.destination, "Czechia");
  assert.equal(context.itinerary[0].items.length, 1);
  assert.equal(context.itinerary[0].items[0].done, true);

  const revised = {
    destination: "Czechia",
    days: 2,
    startDate: "",
    itinerary: [
      { day: 1, title: "Prague — history", overnightLocation: "Prague", items: [{ id: "new-museum", name: "National Museum", location: "Prague", done: false }] },
      { day: 2, title: "Prague — quieter architecture", overnightLocation: "Prague", items: [{ id: "new-castle", name: "Prague Castle", location: "Prague", done: false }] }
    ]
  };
  model.preserveActiveTripDetails(revised, activeTrip);
  assert.equal(revised.startDate, "2027-04-10");
  assert.equal(revised.itinerary[0].items[0].id, "museum");
  assert.equal(revised.itinerary[0].items[0].done, true);
  assert.equal(revised.itinerary[0].items[1].name, "Hotel One");
  assert.equal(revised.hotelSelections["Prague::1-2"].name, "Hotel One");
  assert.equal(revised.hotelStayDates["Prague::1-2"].manualDates, true);
  assert.equal(planner.resolvePlannerTripAction({ trip: revised }, activeTrip), "keep");
  assert.equal(planner.resolvePlannerTripAction({ tripAction: "revise", trip: revised }, activeTrip), "revise");
});
