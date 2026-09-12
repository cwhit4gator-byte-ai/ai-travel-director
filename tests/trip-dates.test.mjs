import test from "node:test";
import assert from "node:assert/strict";
import { memoryStorage } from "./support/dom.mjs";

globalThis.localStorage = memoryStorage();
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "en-US" } });

const version = "28";
const model = await import(new URL(`../js/trip-model.js?v=${version}`, import.meta.url));
const hotels = await import(new URL(`../js/hotels.js?v=${version}`, import.meta.url));
const today = await import(new URL(`../js/today.js?v=${version}`, import.meta.url));
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
