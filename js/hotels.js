import { state } from "./state.js?v=40";
import { escapeHTML, safeImageURL, normalizeInterests, toast, trackAppError } from "./ui.js?v=40";
import { scheduleSave } from "./persistence.js?v=40";
import { requestAITrip, trackAppEvent } from "../firebase-client.js?v=40";
import { resolvePlaceCity, searchNearbyHotels } from "../maps.js?v=40";
import { currentDestination, tripOvernightStops, normalizeAITrip, addDaysToISODate, tripDateForDay } from "./trip-model.js?v=40";

export function automaticHotelDates(stop, trip = state.trip) {
  if (!stop) return { checkIn: "", checkOut: "" };
  return {
    checkIn: tripDateForDay(stop.startDay, trip),
    checkOut: tripDateForDay(Number(stop.endDay || stop.startDay) + 1, trip)
  };
}

export function reconcileHotelStayDates(trip, stops) {
  if (!trip) return {};
  trip.hotelStayDates ||= {};
  stops.forEach(stop => {
    if (!trip.hotelStayDates[stop.id]?.manualDates) trip.hotelStayDates[stop.id] = { ...automaticHotelDates(stop, trip), manualDates: false };
  });
  return trip.hotelStayDates;
}

export function createHotels({ showView, renderAll, bindViewLinks }) {
  const hotelPlaceCache = new Map();
  const hotelCurrencyRates = {
    USD: 1,
    EUR: 0.86,
    GBP: 0.74,
    CAD: 1.38,
    AUD: 1.51,
    JPY: 147.4,
    CHF: 0.80,
    MXN: 18.7,
    BRL: 5.43,
    INR: 88,
    ZAR: 17.3
  };
  const hotelCurrencyLiveRates = new Set(["USD"]);

  function selectedOvernightStop() {
    const stops = tripOvernightStops();
    let stop = stops.find(item => item.id === state.selectedOvernightLocation);
    if (!stop) stop = stops.find(item => item.location === state.selectedOvernightLocation);
    stop ||= stops[0];
    state.selectedOvernightLocation = stop?.id || "";
    return stop || null;
  }
  function selectedOvernightLocation() {
    return selectedOvernightStop()?.location || "";
  }
  function overnightStopLabel(stop) {
    if (!stop) return "";
    const nightCount = Math.max(1, stop.days.length);
    return `${stop.location} · ${nightCount} night${nightCount === 1 ? "" : "s"}`;
  }
  function hotelSearchKey(location = selectedOvernightLocation()) {
    return `${String(location).trim().toLocaleLowerCase()}::${state.hotelFilter}`;
  }
  function selectedHotelCurrency() {
    const currency = String(state.hotelStay.currency || "USD").toUpperCase();
    return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  }
  function formatHotelCurrency(valueUSD) {
    const currency = selectedHotelCurrency();
    const rate = Number(hotelCurrencyRates[currency] || (currency === "USD" ? 1 : 0));
    if (!rate) return "Updating currency…";
    return new Intl.NumberFormat(navigator.language || "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format((Number(valueUSD) || 0) * rate);
  }
  async function loadHotelCurrencyRate(currency = selectedHotelCurrency()) {
    if (currency === "USD" || hotelCurrencyLiveRates.has(currency) || state.hotelCurrencyLoading === currency) return;
    state.hotelCurrencyLoading = currency;
    renderHotels();
    try {
      const response = await fetch(`https://api.frankfurter.dev/v2/rate/USD/${encodeURIComponent(currency)}`);
      if (!response.ok) throw new Error("Currency service unavailable");
      const result = await response.json();
      const rate = Number(result?.rate);
      if (!rate) throw new Error("Currency rate unavailable");
      hotelCurrencyRates[currency] = rate;
      hotelCurrencyLiveRates.add(currency);
      trackAppEvent("hotel_currency_changed", { currency, source: "current_reference_rate" });
    } catch (error) {
      console.warn("Could not refresh hotel display currency", error);
      trackAppEvent("hotel_currency_changed", { currency, source: "built_in_reference_rate" });
      toast(`Showing a reference ${currency} conversion; confirm the final price with the booking provider`);
    } finally {
      state.hotelCurrencyLoading = "";
      scheduleSave();
      renderHotels();
    }
  }
  function estimatedHotelNightly(multiplier = 1) {
    const days = Math.max(1, Number(state.trip?.days || 1));
    const tripBudget = Math.max(300, Number(state.trip?.budget || state.profile.budget || 1500));
    const locationCount = Math.max(1, tripOvernightStops().length);
    const base = Math.max(75, Math.min(450, Math.round((tripBudget * .35) / Math.max(1, days - 1) * Math.min(1.15, locationCount))));
    return Math.round(base * multiplier);
  }
  function hotelStayDateStore() {
    if (!state.trip) return {};
    state.trip.hotelStayDates ||= {};
    return state.trip.hotelStayDates;
  }
  function storeCurrentHotelDates(stop = selectedOvernightStop(), manualDates = false) {
    if (!stop || !state.trip) return;
    const store = hotelStayDateStore();
    store[stop.id] = { checkIn: state.hotelStay.checkIn || "", checkOut: state.hotelStay.checkOut || "", manualDates: Boolean(manualDates || store[stop.id]?.manualDates) };
  }
  function loadHotelDatesForStop(stop, { allowLegacy = true } = {}) {
    if (!stop || !state.trip) return;
    const store = hotelStayDateStore();
    let dates = store[stop.id];
    const hasStoredDates = Object.keys(store).length > 0;
    if (!dates && allowLegacy && !hasStoredDates && (state.hotelStay.checkIn || state.hotelStay.checkOut)) {
      dates = { checkIn: state.hotelStay.checkIn || "", checkOut: state.hotelStay.checkOut || "", manualDates: true };
    }
    dates ||= { ...automaticHotelDates(stop), manualDates: false };
    if (!dates.manualDates) dates = { ...automaticHotelDates(stop), manualDates: false };
    store[stop.id] = dates;
    state.hotelStay.checkIn = dates.checkIn || "";
    state.hotelStay.checkOut = dates.checkOut || "";
  }
  function updateTripHotelDates() {
    if (!state.trip) return;
    const selected = selectedOvernightStop();
    if (selected) loadHotelDatesForStop(selected);
    const store = hotelStayDateStore();
    reconcileHotelStayDates(state.trip, tripOvernightStops());
    if (selected) loadHotelDatesForStop(selected, { allowLegacy: false });
  }
  function hotelStayNightCount(stop = selectedOvernightStop()) {
    const checkIn = String(state.hotelStay.checkIn || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const checkOut = String(state.hotelStay.checkOut || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (checkIn && checkOut) {
      const start = Date.UTC(Number(checkIn[1]), Number(checkIn[2]) - 1, Number(checkIn[3]));
      const end = Date.UTC(Number(checkOut[1]), Number(checkOut[2]) - 1, Number(checkOut[3]));
      const nights = Math.round((end - start) / 86400000);
      if (nights > 0) return nights;
    }
    return Math.max(1, stop?.days?.length || 1);
  }
  function autoPopulateHotelCheckout() {
    if (!state.hotelStay.checkIn) return;
    state.hotelStay.checkOut = addDaysToISODate(state.hotelStay.checkIn, Math.max(1, selectedOvernightStop()?.days?.length || 1));
  }
  function fallbackHotelRecommendations(stop) {
    const interests = normalizeInterests(state.profile.interests).toLowerCase();
    const styles = [
      { id: "central", icon: "⌂", name: "Central landmark hotel", area: "Historic center", multiplier: 1.18, reason: interests.includes("history") || interests.includes("architecture") ? "Puts historic sights and architecture close at hand." : "Keeps major sights and transit within easy reach.", amenity: "Planning fallback" },
      { id: "value", icon: "◇", name: "Well-rated value stay", area: "Transit-connected district", multiplier: .82, reason: "Balances a lower nightly estimate with straightforward public-transit access.", amenity: "Planning fallback" },
      { id: "quiet", icon: "≈", name: "Quiet neighborhood hotel", area: "Calmer residential area", multiplier: .96, reason: `Fits a ${state.profile.pace || "balanced"} pace with a calmer base away from the busiest blocks.`, amenity: "Planning fallback" }
    ];
    const ordered = state.hotelFilter === "best" ? styles : [...styles].sort((a,b) => Number(b.id === state.hotelFilter) - Number(a.id === state.hotelFilter));
    return ordered.map(hotel => ({ ...hotel, nightly: estimatedHotelNightly(hotel.multiplier), location: stop.location, stopId: stop.id, nights: stop.days.length, source: "planning" }));
  }
  function hotelRecommendations() {
    const stop = selectedOvernightStop();
    if (!stop?.location) return [];
    const entry = hotelPlaceCache.get(hotelSearchKey(stop.location));
    const realHotels = (entry?.places || []).slice(0, 3).map((place, index) => ({
      id: place.id,
      icon: ["⌂", "◇", "≈"][index] || "▤",
      name: place.name,
      area: place.address || stop.location,
      reason: place.rating ? `${place.rating.toFixed(1)} out of 5 from Google travelers.` : "A real property near this overnight stop.",
      amenity: place.reviewCount ? `${place.reviewCount.toLocaleString("en-US")} Google reviews` : "Google Places property",
      nightly: estimatedHotelNightly([1.08, .92, 1][index] || 1),
      location: stop.location,
      stopId: stop.id,
      nights: stop.days.length,
      source: "google_places",
      rating: place.rating,
      reviewCount: place.reviewCount,
      photoURL: safeImageURL(place.photoURL),
      mapsURL: safeImageURL(place.mapsURL)
    }));
    if (realHotels.length >= 3) return realHotels;
    const usedNames = new Set(realHotels.map(hotel => hotel.name.toLocaleLowerCase()));
    const fillers = fallbackHotelRecommendations(stop).filter(hotel => !usedNames.has(hotel.name.toLocaleLowerCase()));
    return [...realHotels, ...fillers].slice(0, 3);
  }
  async function loadRealHotelsForStop(stop) {
    if (!stop?.location) return;
    const key = hotelSearchKey(stop.location);
    if (hotelPlaceCache.has(key) || state.hotelPlacesLoadingKey === key) return;
    state.hotelPlacesLoadingKey = key;
    renderHotels();
    try {
      const places = await searchNearbyHotels(stop.location, state.hotelFilter, 9);
      hotelPlaceCache.set(key, { places, error: places.length ? "" : "No properties were returned." });
      trackAppEvent("hotel_properties_loaded", { count: Math.min(3, places.length), preference: state.hotelFilter });
    } catch (error) {
      console.error("Could not load real hotel properties", error);
      hotelPlaceCache.set(key, { places: [], error: error?.message || "Google Places is unavailable." });
      trackAppError("hotel_places", error);
    } finally {
      if (state.hotelPlacesLoadingKey === key) state.hotelPlacesLoadingKey = "";
      renderHotels();
    }
  }
  function affiliateSubId(hotel) {
    const raw = `aitd_${hotel.stopId || "stop"}_${hotel.id || "hotel"}`;
    return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80);
  }
  function fillAffiliateTemplate(template, hotel) {
    const query = `${hotel.name} in ${hotel.location}`;
    const values = {
      destination: encodeURIComponent(hotel.location),
      query: encodeURIComponent(query),
      subId: encodeURIComponent(affiliateSubId(hotel)),
      checkIn: encodeURIComponent(state.hotelStay.checkIn || ""),
      checkOut: encodeURIComponent(state.hotelStay.checkOut || ""),
      adults: encodeURIComponent(state.hotelStay.adults || 2),
      children: encodeURIComponent(state.hotelStay.children || 0),
      rooms: encodeURIComponent(state.hotelStay.rooms || 1)
    };
    return String(template || "").replace(/\{(destination|query|subId|checkIn|checkOut|adults|children|rooms)\}/g, (_, key) => values[key]);
  }
  function configuredAffiliateLinks(hotel) {
    const providers = Array.isArray(window.TRAVEL_AFFILIATE_CONFIG?.providers)
      ? window.TRAVEL_AFFILIATE_CONFIG.providers
      : [];
    return providers
      .filter(provider => provider && provider.id && provider.label && provider.urlTemplate)
      .map(provider => ({
        id: String(provider.id),
        label: String(provider.label),
        revenueModel: String(provider.revenueModel || "completed_booking"),
        url: fillAffiliateTemplate(provider.urlTemplate, hotel)
      }))
      .filter(provider => /^https:\/\//i.test(provider.url));
  }
  function hotelProviderQuery(hotel) {
    const name = String(hotel.name || "").trim();
    const address = String(hotel.area || "").trim();
    const location = String(hotel.location || "").trim();
    const tripDestination = String(state.trip?.destination || "").trim();
    const genericAreas = ["Historic center", "Transit-connected district", "Calmer residential area"];
    const geographicParts = hotel.source === "google_places" && address && !genericAreas.includes(address)
      ? [address]
      : [location, tripDestination];
    const queryParts = [name];
    geographicParts.forEach(part => {
      if (!part) return;
      const normalizedPart = part.toLocaleLowerCase();
      const alreadyIncluded = queryParts.some(existing => existing.toLocaleLowerCase().includes(normalizedPart) || normalizedPart.includes(existing.toLocaleLowerCase()));
      if (!alreadyIncluded) queryParts.push(part);
    });
    return queryParts.join(", ");
  }
  function hotelSearchLinks(hotel) {
    const query = hotelProviderQuery(hotel);
    const stay = state.hotelStay;
    const adults = Math.max(1, Number(stay.adults) || 2);
    const children = Math.max(0, Number(stay.children) || 0);
    const rooms = Math.max(1, Number(stay.rooms) || 1);
    const currency = selectedHotelCurrency();
    const hasDates = Boolean(stay.checkIn && stay.checkOut);
    const stayText = hasDates
      ? `${stay.checkIn} to ${stay.checkOut}, ${adults} adult${adults === 1 ? "" : "s"}, ${children} child${children === 1 ? "" : "ren"}, ${rooms} room${rooms === 1 ? "" : "s"}`
      : `${adults} adult${adults === 1 ? "" : "s"}, ${children} child${children === 1 ? "" : "ren"}, ${rooms} room${rooms === 1 ? "" : "s"}`;

    const google = new URL(`https://www.google.com/travel/hotels/${encodeURIComponent(hotel.location)}`);
    google.searchParams.set("q", `${query}; ${stayText}`);
    if (stay.checkIn) google.searchParams.set("checkin", stay.checkIn);
    if (stay.checkOut) google.searchParams.set("checkout", stay.checkOut);
    google.searchParams.set("adults", String(adults));
    google.searchParams.set("children", String(children));
    google.searchParams.set("rooms", String(rooms));
    google.searchParams.set("curr", currency);

    const booking = new URL("https://www.booking.com/searchresults.html");
    booking.searchParams.set("ss", query);
    if (stay.checkIn) booking.searchParams.set("checkin", stay.checkIn);
    if (stay.checkOut) booking.searchParams.set("checkout", stay.checkOut);
    booking.searchParams.set("group_adults", String(adults));
    booking.searchParams.set("group_children", String(children));
    booking.searchParams.set("no_rooms", String(rooms));
    booking.searchParams.set("selected_currency", currency);

    const expediaPath = hasDates
      ? `/go/hotel/search/Destination/${encodeURIComponent(stay.checkIn)}/${encodeURIComponent(stay.checkOut)}`
      : "/go/hotel/search/Destination";
    const expedia = new URL(expediaPath, "https://www.expedia.com");
    expedia.searchParams.set("SearchType", "Destination");
    expedia.searchParams.set("CityName", hotel.location);
    expedia.searchParams.set("ChainName", hotel.name);
    if (stay.checkIn) expedia.searchParams.set("InDate", stay.checkIn);
    if (stay.checkOut) expedia.searchParams.set("OutDate", stay.checkOut);
    expedia.searchParams.set("NumRoom", String(rooms));
    expedia.searchParams.set("NumAdult-Room1", String(adults));
    expedia.searchParams.set("NumChild-Room1", String(children));

    return {
      google: google.href,
      booking: booking.href,
      expedia: expedia.href,
      affiliates: configuredAffiliateLinks(hotel)
    };
  }
  function bookingLinksMarkup(hotel, links) {
    const affiliateLinks = links.affiliates.map((provider, index) =>
      `<a class="${index === 0 ? "primary-button" : ""}" href="${escapeHTML(provider.url)}" target="_blank" rel="sponsored noopener noreferrer" data-booking-provider="${escapeHTML(provider.label)}" data-revenue-model="${escapeHTML(provider.revenueModel)}" data-affiliate-link="true">${index === 0 ? "Compare & book with " : ""}${escapeHTML(provider.label)}</a>`
    ).join("");
    const directLinks = `<a class="${affiliateLinks ? "" : "primary-button"}" href="${links.google}" target="_blank" rel="noopener noreferrer" data-booking-provider="Google Hotels" data-revenue-model="none">Search Google Hotels with stay details</a><a href="${links.booking}" target="_blank" rel="noopener noreferrer" data-booking-provider="Booking.com" data-revenue-model="none">Search Booking.com with stay details</a><a href="${links.expedia}" target="_blank" rel="noopener noreferrer" data-booking-provider="Expedia" data-revenue-model="none">Continue to Expedia</a>`;
    return affiliateLinks + directLinks;
  }
  function selectHotelForOvernight(hotelName, nightly) {
    if (!state.trip) return showView("plannerView");
    const stop = selectedOvernightStop();
    if (!stop) return;
    state.trip.hotelSelections ||= {};
    const stayNights = hotelStayNightCount(stop);
    state.trip.hotelSelections[stop.id] = { name: hotelName, nightly: Number(nightly), location: stop.location, nights: stayNights, checkIn: state.hotelStay.checkIn, checkOut: state.hotelStay.checkOut, selectedAt: new Date().toISOString() };
    const day = (state.trip.itinerary || []).find(item => stop.days.includes(Number(item.day))) || state.trip.itinerary?.[0];
    if (day) {
      day.items = (day.items || []).filter(item => !(item.category === "Hotel" && item.hotelStopId === stop.id));
      day.items.push({ id: crypto.randomUUID(), time: "Overnight", name: hotelName, category: "Hotel", cost: Number(nightly) * stayNights, hotelStopId: stop.id, overnightLocation: stop.location, note: `Selected for a ${stayNights}-night stay in ${stop.location}. Nightly price is an estimate; confirm the final total and terms with the booking provider.`, done: false });
    }
    scheduleSave(); renderAll(); toast(`Hotel selected for ${stop.location}`);
  }
  function itineraryNeedsCityResolution() {
    if (!state.trip) return false;
    const fallback = currentDestination().toLocaleLowerCase();
    return (state.trip.itinerary || []).some(day => {
      const items = (day.items || []).filter(item => item.category !== "Hotel");
      const finalItem = items.at(-1);
      const location = String(finalItem?.location || finalItem?.city || day.overnightLocation || "").trim().toLocaleLowerCase();
      return !location || location === fallback;
    });
  }
  async function resolveHotelCitiesFromItinerary() {
    if (state.hotelLocationsResolving || !state.trip) return;
    state.hotelLocationsResolving = true;
    state.hotelLocationsAttempted = true;
    renderHotels();
    let previousCity = "";
    try {
      for (const day of state.trip.itinerary || []) {
        const items = (day.items || []).filter(item => item.category !== "Hotel");
        const finalItem = items.at(-1);
        if (!finalItem) continue;
        const existing = String(finalItem.location || finalItem.city || "").trim();
        const fallback = currentDestination();
        let city = existing && existing.toLocaleLowerCase() !== fallback.toLocaleLowerCase() ? existing : "";
        if (!city) {
          try { city = await resolvePlaceCity(`${finalItem.name}, ${fallback}`); }
          catch (error) { console.warn("Could not resolve final itinerary event with Maps", finalItem.name, error); }
        }
        city ||= previousCity;
        if (city) { finalItem.location = city; day.overnightLocation = city; previousCity = city; }
      }
      if (itineraryNeedsCityResolution() && state.user && state.cloudConfigured && navigator.onLine) {
        const finalEvents = (state.trip.itinerary || []).map((day, index) => {
          const event = (day.items || []).filter(item => item.category !== "Hotel").at(-1);
          return { day: Number(day.day || index + 1), event: String(event?.name || day.title || "Final event").slice(0, 100) };
        });
        const enrichmentRequest = `Identify only the city or town of each final event below. Return a ${finalEvents.length}-day itinerary in the same order, with one item per day. Copy each event name exactly, add its city in the item's location field, and set overnightLocation to the same city. Route: ${state.trip.destination}. Final events: ${JSON.stringify(finalEvents)}`;
        const result = await requestAITrip({ request: enrichmentRequest.slice(0, 1750), profile: state.profile, communityInsights: [] });
        const enriched = normalizeAITrip(result, enrichmentRequest);
        (state.trip.itinerary || []).forEach((day, dayIndex) => {
          const location = enriched.itinerary?.[dayIndex]?.items?.[0]?.location || enriched.itinerary?.[dayIndex]?.overnightLocation;
          const finalItem = (day.items || []).filter(item => item.category !== "Hotel").at(-1);
          if (location && finalItem) finalItem.location = location;
          if (location) day.overnightLocation = location;
        });
        state.trip.overnightLocations = [...new Set((state.trip.itinerary || []).map(day => day.overnightLocation).filter(Boolean))];
      }
      scheduleSave();
    } catch (error) {
      console.error("Could not enrich hotel cities", error);
    } finally {
      state.hotelLocationsResolving = false;
      renderHotels();
    }
  }
  function renderHotels() {
    const list = document.getElementById("hotelList");
    if (!list) return;
    const picker = document.getElementById("overnightLocationSelect");
    if (state.hotelLocationsResolving || (itineraryNeedsCityResolution() && !state.hotelLocationsAttempted)) {
      picker.innerHTML = "";
      picker.disabled = true;
      document.getElementById("hotelDestination").textContent = "Finding the overnight cities";
      document.getElementById("hotelIntroText").textContent = "Checking the final event on each itinerary day with Google Maps…";
      document.getElementById("overnightLocationSummary").textContent = "Hotel stops will appear automatically when the cities are ready.";
      list.innerHTML = `<div class="community-state"><span class="ai-pulse" aria-hidden="true">✦</span><strong>Matching itinerary events to cities…</strong></div>`;
      if (!state.hotelLocationsResolving) resolveHotelCitiesFromItinerary();
      return;
    }
    if (itineraryNeedsCityResolution()) {
      picker.innerHTML = "";
      picker.disabled = true;
      document.getElementById("hotelDestination").textContent = "City-level hotel stops are not ready";
      document.getElementById("hotelIntroText").textContent = "The app could not safely determine the final city for each itinerary day.";
      document.getElementById("overnightLocationSummary").textContent = "Retry to enrich this saved itinerary with the AI planner.";
      list.innerHTML = `<div class="empty-state"><span class="empty-icon">⌖</span><h2>Update overnight cities</h2><p>Your itinerary is safe. Retry city matching without changing its events.</p><button class="primary-button" type="button" data-retry-hotel-cities>Retry city matching</button></div>`;
      return;
    }
    const stops = tripOvernightStops();
    picker.innerHTML = stops.map(stop => `<option value="${escapeHTML(stop.id)}">${escapeHTML(overnightStopLabel(stop))}</option>`).join("");
    picker.disabled = !stops.length;
    const stop = selectedOvernightStop();
    const location = stop?.location || "";
    if (stop) {
      picker.value = stop.id;
      loadHotelDatesForStop(stop);
    }
    ["checkIn", "checkOut", "adults", "children", "rooms", "currency"].forEach(field => {
      const input = document.querySelector(`[data-hotel-stay-field="${field}"]`);
      if (input && String(input.value) !== String(state.hotelStay[field])) input.value = state.hotelStay[field];
    });
    document.getElementById("overnightLocationSummary").textContent = stop ? `${overnightStopLabel(stop)} · one hotel covers this stop` : "Plan a trip to generate recommended overnight locations.";
    document.getElementById("hotelDestination").textContent = location ? `Three real hotel options for ${location}` : "Plan a trip to personalize your stays";
    document.getElementById("hotelIntroText").textContent = location ? "Compare actual properties matched to this stop. Add dates and guests for more accurate booking-site results." : "Choose a destination and the app will identify each overnight stop before showing hotels.";
    if (!stop) {
      list.innerHTML = `<div class="empty-state"><span class="empty-icon">▤</span><h2>No overnight locations yet</h2><p>Create or regenerate the trip so the AI can populate its recommended overnight locations.</p><button class="primary-button" data-view-link="plannerView">Plan a trip</button></div>`;
      bindViewLinks(list);
      return;
    }
    const key = hotelSearchKey(location);
    const entry = hotelPlaceCache.get(key);
    if (!entry && state.hotelPlacesLoadingKey !== key) {
      list.innerHTML = `<div class="community-state"><span class="ai-pulse" aria-hidden="true">✦</span><strong>Finding real hotels in ${escapeHTML(location)}…</strong></div>`;
      loadRealHotelsForStop(stop);
      return;
    }
    if (state.hotelPlacesLoadingKey === key) {
      list.innerHTML = `<div class="community-state"><span class="ai-pulse" aria-hidden="true">✦</span><strong>Finding real hotels in ${escapeHTML(location)}…</strong></div>`;
      return;
    }
    const hotels = hotelRecommendations();
    const stayNights = hotelStayNightCount(stop);
    const displayCurrency = selectedHotelCurrency();
    const staySummary = document.getElementById("hotelStaySummary");
    if (staySummary) staySummary.textContent = state.hotelStay.checkIn && state.hotelStay.checkOut ? `${stayNights} night${stayNights === 1 ? "" : "s"} selected · hotel totals updated below` : `Choose check-in to automatically set checkout for this ${Math.max(1, stop.days.length)}-night stop.`;
    const currencyStatus = state.hotelCurrencyLoading ? `<div class="hotel-source-note"><strong>Updating currency…</strong><span>Converting planning estimates to ${escapeHTML(displayCurrency)}.</span></div>` : "";
    const fallbackNotice = entry?.error ? `<div class="hotel-source-note warning"><strong>Live property details are temporarily unavailable.</strong><span>Showing clearly labeled planning options instead. Price-check links still work.</span></div>` : `<div class="hotel-source-note"><strong>Real properties from Google Places</strong><span>Ratings and review counts can change. Estimates display in ${escapeHTML(displayCurrency)}; booking providers confirm final currency and price.</span></div>`;
    list.innerHTML = currencyStatus + fallbackNotice + hotels.map(hotel => {
      const links = hotelSearchLinks(hotel);
      const selected = state.trip?.hotelSelections?.[hotel.stopId]?.name === hotel.name;
      const media = hotel.photoURL ? `<img class="hotel-photo" src="${escapeHTML(hotel.photoURL)}" alt="${escapeHTML(hotel.name)}" loading="lazy" referrerpolicy="no-referrer">` : `<span class="hotel-icon" aria-hidden="true">${hotel.icon}</span>`;
      const sourceTag = hotel.source === "google_places" ? "Actual property" : "Planning option";
      return `<article class="hotel-card${selected ? " selected-hotel" : ""}">${media}<div class="hotel-card-top"><span class="hotel-icon compact" aria-hidden="true">${hotel.icon}</span><div><p class="eyebrow">${escapeHTML(sourceTag)} · ${escapeHTML(hotel.location)}</p><h2>${escapeHTML(hotel.name)}</h2></div></div><p class="hotel-address">${escapeHTML(hotel.area)}</p><p class="hotel-reason">${escapeHTML(hotel.reason)}</p><div class="hotel-facts"><span>Estimated stay total <strong>${formatHotelCurrency(hotel.nightly * stayNights)} for ${stayNights} night${stayNights === 1 ? "" : "s"}</strong></span><span>${formatHotelCurrency(hotel.nightly)}/night estimate · ${escapeHTML(hotel.amenity)}</span></div><div class="hotel-actions"><button class="secondary-button" type="button" data-hotel-map="${escapeHTML(hotel.name)}">View on map</button><button class="secondary-button" type="button" data-hotel-select="${escapeHTML(hotel.name)}" data-hotel-rate="${hotel.nightly}" ${selected ? "disabled" : ""}>${selected ? "✓ Selected" : "Select for this stop"}</button></div><div class="booking-links" aria-label="Compare hotel prices and booking providers">${bookingLinksMarkup(hotel, links)}</div></article>`;
    }).join("");
  }

  document.getElementById("overnightLocationSelect").addEventListener("change", event => {
    const previousStop = selectedOvernightStop();
    if (previousStop) storeCurrentHotelDates(previousStop);
    state.selectedOvernightLocation = event.target.value;
    loadHotelDatesForStop(selectedOvernightStop(), { allowLegacy: false });
    scheduleSave();
    renderHotels();
  });
  document.getElementById("hotelStayForm").addEventListener("change", event => {
    const field = event.target.dataset.hotelStayField;
    if (!field) return;
    const numeric = ["adults", "children", "rooms"].includes(field);
    state.hotelStay[field] = numeric ? Math.max(field === "children" ? 0 : 1, Number(event.target.value) || 0) : event.target.value;
    if (field === "checkIn") autoPopulateHotelCheckout();
    if (field === "currency") loadHotelCurrencyRate(state.hotelStay.currency);
    if (field === "checkOut" && state.hotelStay.checkIn && state.hotelStay.checkOut <= state.hotelStay.checkIn) {
      state.hotelStay.checkOut = "";
      event.target.value = "";
      toast("Check-out must be after check-in");
    }
    if (field === "checkIn" || field === "checkOut") storeCurrentHotelDates(selectedOvernightStop(), true);
    scheduleSave();
    renderHotels();
  });
  document.querySelector(".hotel-toolbar").addEventListener("click", event => { const button = event.target.closest("[data-hotel-filter]"); if (!button) return; state.hotelFilter = button.dataset.hotelFilter; document.querySelectorAll("[data-hotel-filter]").forEach(item => item.classList.toggle("active", item === button)); renderHotels(); });
  document.getElementById("hotelList").addEventListener("click", event => {
    const retryButton = event.target.closest("[data-retry-hotel-cities]");
    if (retryButton) { state.hotelLocationsAttempted = false; resolveHotelCitiesFromItinerary(); return; }
    const mapButton = event.target.closest("[data-hotel-map]");
    if (mapButton) { state.mapQuery = `${mapButton.dataset.hotelMap} in ${selectedOvernightLocation()}`; showView("exploreView"); return; }
    const selectButton = event.target.closest("[data-hotel-select]");
    if (selectButton) selectHotelForOvernight(selectButton.dataset.hotelSelect, selectButton.dataset.hotelRate);
    const bookingLink = event.target.closest("[data-booking-provider]");
    if (bookingLink) trackAppEvent("hotel_booking_link_opened", { provider: bookingLink.dataset.bookingProvider, revenue_model: bookingLink.dataset.revenueModel || "none", affiliate: bookingLink.dataset.affiliateLink === "true", nights: selectedOvernightStop()?.days?.length || 1, has_dates: Boolean(state.hotelStay.checkIn && state.hotelStay.checkOut), adults: Math.min(10, Number(state.hotelStay.adults || 2)), rooms: Math.min(5, Number(state.hotelStay.rooms || 1)) });
  });

  return { renderHotels, updateTripHotelDates };
}
