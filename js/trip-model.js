import { state } from "./state.js?v=27";

export const activityCatalog = [
  { name: "Old town architecture walk", category: "Architecture", time: "9:00 AM", cost: 0, icon: "⌂", note: "Begin early for quiet streets and softer light." },
  { name: "City history museum", category: "History", time: "11:00 AM", cost: 22, icon: "▥", note: "A focused introduction to the city and its people." },
  { name: "Central market lunch", category: "Local culture", time: "1:00 PM", cost: 24, icon: "◇", note: "Local food choices close to public transportation." },
  { name: "Riverside neighborhood", category: "Quiet places", time: "3:30 PM", cost: 0, icon: "≈", note: "A flexible, low-pressure afternoon stop." },
  { name: "Landmark interior tour", category: "Architecture", time: "10:00 AM", cost: 18, icon: "△", note: "Reserve enough time to study the building details." },
  { name: "Public square and civic district", category: "History", time: "2:00 PM", cost: 0, icon: "□", note: "Easy to reach by transit and simple to shorten." },
  { name: "Independent local restaurant", category: "Food", time: "6:30 PM", cost: 32, icon: "○", note: "Food-focused option with no alcohol-centered activity." },
  { name: "Flexible indoor alternative", category: "Backup", time: "4:00 PM", cost: 12, icon: "✦", note: "Use this when weather or energy changes the plan." }
];

export function inferOvernightLocation(day, fallback = "") {
  const items = Array.isArray(day?.items) ? day.items : [];
  const finalEventLocation = [...items].reverse().map(item => String(item?.location || item?.city || "").trim()).find(Boolean);
  if (finalEventLocation) return finalEventLocation;
  const explicit = String(day?.location || day?.overnightLocation || "").trim();
  if (explicit && explicit.toLocaleLowerCase() !== String(fallback).toLocaleLowerCase()) return explicit;
  const title = String(day?.title || "").trim();
  const prefix = String(title.match(/^(?:day\s*\d+\s*[:—–-]\s*)?([^:—–|]{2,60})\s*[:—–|]/iu)?.[1] || "").trim();
  const words = prefix.split(/\s+/).filter(Boolean);
  const actionWords = /\b(after|before|pick|picking|rental|car|drive|driving|travel|traveling|journey|arrival|arrive|departure|depart|explore|exploring|visit|visiting|tour|touring|scenic|flexible|final|morning|afternoon|evening|day)\b/i;
  if (prefix && words.length <= 4 && !actionWords.test(prefix)) return prefix;
  return "";
}
export function tripOvernightStops() {
  if (!state.trip) return [];
  const fallback = currentDestination();
  const stops = [];
  let currentLocation = "";
  (state.trip.itinerary || []).forEach((day, index) => {
    const detected = inferOvernightLocation(day, fallback);
    if (detected) currentLocation = detected;
    if (!currentLocation) currentLocation = fallback;
    const location = currentLocation;
    if (!location) return;
    const dayNumber = Number(day.day || index + 1);
    const previous = stops.at(-1);
    if (previous && previous.location.toLocaleLowerCase() === location.toLocaleLowerCase()) {
      previous.days.push(dayNumber);
      previous.endDay = dayNumber;
      previous.id = `${previous.location}::${previous.startDay}-${previous.endDay}`;
    } else {
      stops.push({ id: `${location}::${dayNumber}-${dayNumber}`, location, days: [dayNumber], startDay: dayNumber, endDay: dayNumber });
    }
  });
  if (stops.length) return stops;
  return (state.trip.overnightLocations || []).map((location, index) => ({ id: `${location}::${index + 1}`, location: String(location), days: [], startDay: index + 1, endDay: index + 1 }));
}

function parseDestination(text) {
  const patterns = [/(?:in|to|visit|for)\s+([A-Z][\p{L}' -]+?)(?:\s+(?:under|for|with|from|on|by|and)\b|[,.]|$)/iu, /^([A-Z][\p{L}' -]+?)(?:\s+for\s+|,|$)/u];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "Your destination";
}

function parseDays(text) {
  const match = text.match(/(\d+)\s*(?:-| )?(?:day|night)/i);
  return Math.max(1, Math.min(Number(match?.[1] || 4), 10));
}

function parseBudget(text) {
  const dollar = text.match(/\$\s*([\d,]+)/);
  const phrased = text.match(/(?:under|budget(?:\s+of)?|maximum|max)\s*\$?\s*([\d,]+)/i);
  return Number((dollar?.[1] || phrased?.[1] || state.profile.budget || 1500).replace?.(/,/g, "") || state.profile.budget);
}

export function buildLocalTrip(text) {
  const destination = parseDestination(text);
  const days = parseDays(text);
  const budget = parseBudget(text);
  const itinerary = Array.from({ length: days }, (_, dayIndex) => {
    const offset = (dayIndex * 2) % activityCatalog.length;
    const dayActivities = [activityCatalog[offset], activityCatalog[(offset + 1) % activityCatalog.length], activityCatalog[(offset + 2) % activityCatalog.length]];
    return {
      day: dayIndex + 1,
      title: dayIndex === 0 ? "Arrival and orientation" : dayIndex === days - 1 ? "Flexible final day" : `${dayActivities[0].category} and local discovery`,
      overnightLocation: destination,
      items: dayActivities.map((activity, index) => ({ ...activity, id: crypto.randomUUID(), time: index === 0 ? "9:30 AM" : index === 1 ? "1:00 PM" : "4:00 PM", done: false }))
    };
  });
  return { destination, days, budget, overnightLocations: [destination], itinerary, sourceRequest: text, generatedBy: "local", createdAt: new Date().toISOString() };
}

export function normalizeAITrip(result, sourceRequest) {
  const raw = result?.trip || result;
  const days = Array.isArray(raw?.itinerary) ? raw.itinerary.slice(0, 10) : [];
  const destination = String(raw?.destination || parseDestination(sourceRequest));
  const itinerary = days.map((day, dayIndex) => {
    const rawItems = Array.isArray(day.items) ? day.items : [];
    const items = rawItems.slice(0, 5).map((item, itemIndex) => ({
      id: crypto.randomUUID(), time: String(item.time || `${9 + itemIndex * 2}:00`), name: String(item.name || "Planned activity"), location: String(item.location || item.city || ""), note: String(item.reason || item.note || "Matched to your travel preferences."), category: String(item.category || "AI plan"), cost: Number(item.cost || 0), done: false
    }));
    const overnightLocation = [...items].reverse().map(item => item.location.trim()).find(Boolean) || inferOvernightLocation(day, destination) || destination;
    return { day: Number(day.day || dayIndex + 1), title: String(day.title || `Day ${dayIndex + 1}`), overnightLocation, items };
  });
  return { destination, days: Math.max(1, Math.min(Number(raw?.days || days.length || parseDays(sourceRequest)), 10)), budget: Number(raw?.budget || parseBudget(sourceRequest)), sourceRequest, generatedBy: "openai", createdAt: new Date().toISOString(), overnightLocations: [...new Set(itinerary.map(day => day.overnightLocation).filter(Boolean))], itinerary };
}

export function tripTotals() {
  const items = state.trip?.itinerary?.flatMap(day => day.items || []) || [];
  return { items: items.length, completed: items.filter(item => item.done).length, planned: items.reduce((sum, item) => sum + Number(item.cost || 0), 0) };
}

export function refreshTripOvernightLocations(day) {
  const latestLocation = [...(day.items || [])].reverse().map(item => String(item.location || "").trim()).find(Boolean);
  if (latestLocation) day.overnightLocation = latestLocation;
  state.trip.overnightLocations = [...new Set((state.trip.itinerary || []).map(item => item.overnightLocation).filter(Boolean))];
  state.hotelLocationsAttempted = false;
}

export function findTripItem(itemId) {
  for (const day of state.trip?.itinerary || []) {
    const index = day.items.findIndex(item => item.id === itemId);
    if (index >= 0) return { day, index, item: day.items[index] };
  }
  return null;
}

export function currentDestination() {
  return state.trip?.destination && state.trip.destination !== "Your destination" ? state.trip.destination : "your destination";
}

export function communityTripItems() {
  return (state.trip?.itinerary || []).flatMap(day => (day.items || []).filter(item => item.communityPostId));
}
