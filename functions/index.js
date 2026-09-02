import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import OpenAI from "openai";

const openaiApiKey = defineSecret("OPENAI_API_KEY");

function clean(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(number, max)) : fallback;
}

function parseJSON(text) {
  return JSON.parse(clean(text, 50000).replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
}

function requireUser(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before using secure AI features.");
}

function validateProfile(profile = {}) {
  return {
    name: clean(profile.name, 100),
    language: clean(profile.language, 60) || "English",
    interests: clean(Array.isArray(profile.interests) ? profile.interests.join(", ") : profile.interests, 400),
    travelStyles: Array.isArray(profile.travelStyles) ? profile.travelStyles.slice(0, 8).map(value => clean(value, 60)) : [],
    budget: boundedNumber(profile.budget, 1500, 0, 100000),
    pace: ["relaxed", "balanced", "active"].includes(profile.pace) ? profile.pace : "balanced",
    diet: clean(profile.diet, 200),
    walking: boundedNumber(profile.walking, 20, 5, 180),
    aiPreference: clean(profile.aiPreference, 100) || "Suggestions only"
  };
}

export const planTrip = onCall(
  { region: "us-central1", secrets: [openaiApiKey], timeoutSeconds: 75, memory: "512MiB", enforceAppCheck: false },
  async request => {
    requireUser(request);
    const travelerRequest = clean(request.data?.request, 1800);
    if (travelerRequest.length < 5) throw new HttpsError("invalid-argument", "Please describe the trip you want.");

    const profile = validateProfile(request.data?.profile);
    const communityInsights = Array.isArray(request.data?.communityInsights)
      ? request.data.communityInsights.slice(0, 8).map(item => ({ place: clean(item.place, 120), rating: boundedNumber(item.rating, 3, 1, 5), text: clean(item.text, 400), audience: clean(item.audience, 100) }))
      : [];

    const client = new OpenAI({ apiKey: openaiApiKey.value() });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      instructions: `You are the AI Tour Director for a personal travel app. Build a practical, geographically coherent draft itinerary in the traveler's preferred language. Respect budget, pace, walking limit, food restrictions, stated transportation preferences, interests, and desired AI autonomy. Never make a booking or claim that live prices, availability, opening hours, accessibility, weather, safety conditions, or reservations are verified. Avoid alcohol-centered activities whenever the profile says the traveler does not drink. Treat community insights as subjective traveler reports. Return only valid JSON with this shape:
{"message":"brief summary and important limitation","trip":{"destination":"city or route","days":4,"budget":1500,"itinerary":[{"day":1,"title":"theme","items":[{"time":"9:30 AM","name":"activity","reason":"why it fits","category":"History","cost":20}]}]}}
Limit the trip to 10 days and 5 items per day. Use numeric estimated costs only when useful and label uncertainty in the message.`,
      input: JSON.stringify({ travelerRequest, profile, communityInsights })
    });

    let result;
    try { result = parseJSON(response.output_text); }
    catch (error) {
      console.error("Invalid trip JSON", error);
      throw new HttpsError("internal", "The AI returned an invalid itinerary. Please try again.");
    }
    if (!result?.trip?.destination || !Array.isArray(result.trip.itinerary)) throw new HttpsError("internal", "The AI returned an incomplete itinerary.");
    return result;
  }
);

export const analyzeExperiencePhoto = onCall(
  { region: "us-central1", secrets: [openaiApiKey], timeoutSeconds: 60, memory: "512MiB", enforceAppCheck: false },
  async request => {
    requireUser(request);
    const photoURL = clean(request.data?.photoURL, 2000);
    if (!/^https:\/\//i.test(photoURL)) throw new HttpsError("invalid-argument", "A valid uploaded photo is required.");

    const client = new OpenAI({ apiKey: openaiApiKey.value() });
    const response = await client.responses.create({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
      instructions: "Analyze this travel photo conservatively. Do not identify people, infer sensitive traits, or invent a precise location. Return only JSON with: description, placeSuggestion, experienceDraft, tags. Keep the draft factual and invite the traveler to correct it.",
      input: [{ role: "user", content: [{ type: "input_text", text: "Help draft a traveler experience from this photo." }, { type: "input_image", image_url: photoURL, detail: "low" }] }]
    });

    try { return parseJSON(response.output_text); }
    catch { return { description: clean(response.output_text, 600), placeSuggestion: "", experienceDraft: "", tags: [] }; }
  }
);
