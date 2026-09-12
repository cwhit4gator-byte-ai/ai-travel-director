# AI Travel Director

A mobile-first personal travel app with AI trip planning, Google Maps exploration, live itinerary controls, traveler insights, photo-assisted experience sharing, cloud sync, and safety guidance.

## Included in this version

- Human-friendly Home, Plan, Explore, Trip, Safety, Experience, and Profile views
- Editable daily itineraries with clearly labeled activity actions, stop-to-stop directions, full-day routes, completion progress, and native sharing
- Current-location transit links that advance to the next unfinished stop as activities are completed
- One trip start date that labels every itinerary day and keeps automatic hotel dates aligned per consecutive-city stop
- A Today dashboard with the next unfinished stop, remaining activities, tonight's hotel, and Transit, Walk, and Drive shortcuts
- An itinerary-aware AI planner that answers questions about the active trip and preserves unaffected plans when revising it
- Interactive Google Maps search with category filters, directions, location lookup, and numbered options matched to map pins
- Smart Add to Trip recommendations with city-aware day selection, visit duration, travel buffers, conflict and duplicate warnings, and chronological insertion
- Secure Firebase Authentication, Firestore sync, Storage uploads, and callable Functions adapters
- Shared Community Insights feed with public posts, destination filters, pagination, helpful reactions, private reports, photo galleries, and Explore-map links
- OpenAI-powered `planTrip` and `analyzeExperiencePhoto` Functions with local trip-planning fallback
- Installable PWA and offline app shell
- Three real Google Places hotel properties per overnight stop, with photos, ratings, review counts, stay dates, guests, and rooms
- Provider-neutral hotel affiliate links for qualified-click and completed-booking programs, with privacy-safe attribution and traveler-facing disclosure

## Source organization

`app.js` handles startup, navigation, and connecting feature callbacks. Each feature owns its event handlers; shared state and trip helpers avoid circular imports.

| Area | Files |
| --- | --- |
| Directions and travel modes | `js/directions.js` |
| Activities, editing, and day sharing | `js/itinerary.js` |
| Hotel recommendations, dates, currency, and booking links | `js/hotels.js` |
| Insights, photos, traveler profiles, and collections | `js/community.js`, `js/community-data.js` |
| Installation and automatic updates | `js/pwa.js`, `service-worker.js` |
| AI planning and trip data | `js/planner.js`, `js/trip-model.js` |
| Home and current travel day | `js/home.js`, `js/today.js` |
| Explore and smart itinerary insertion | `js/explore.js`, `js/smart-add.js` |
| Account settings, safety, and onboarding | `js/profile.js`, `js/safety.js`, `js/onboarding.js` |
| Shared state, persistence, and UI helpers | `js/state.js`, `js/persistence.js`, `js/ui.js` |
| External services | `firebase-client.js`, `maps.js` |

Run `node --test tests/*.test.mjs` with Node 24. The tests exercise feature handlers with a small DOM adapter and mocked external responses; they do not make bookings, publish community posts, or contact Firebase. Preview and production workflows run these checks before deployment.

When adding a module, include its versioned URL in the service worker's app files. Keep the version in module imports, `js/pwa.js`, `index.html`, `manifest.json`, and `service-worker.js` aligned so installed apps receive one complete release. The asset test checks the full import graph and offline cache coverage.

## Firebase setup

1. Serve the app with Firebase Hosting so `/__/firebase/init.json` can provide the Web App configuration.
2. Enable Maps JavaScript API and Places API (New) for the restricted browser key used by the app.
3. Keep `OPENAI_API_KEY` only in Firebase Functions secret storage.
4. Install the Functions dependencies from `functions/`.
5. Deploy Hosting, Functions, Firestore rules, and Storage rules with the Firebase CLI.

## Automatic Firebase deployment

The GitHub Actions workflows deploy pull-request Hosting previews. Merges to `main` publish Firestore rules, indexes, Storage rules, and the live Firebase Hosting channel. Add the Firebase service-account JSON as the encrypted repository secret `FIREBASE_SERVICE_ACCOUNT_AI_TRAVEL_DIRECTOR`. Never commit that credential to the repository.

The deployment service account needs Firebase Hosting Admin, Firebase Rules Admin, and Cloud Datastore Index Admin permissions.

Affiliate provider IDs and approved deep-link templates belong in `affiliate-config.js`; API secrets must stay in Firebase Functions secret storage. Blank templates keep providers disabled.

The app never makes purchases. Live prices, availability, opening hours, accessibility, weather, and safety conditions must be verified before travel.
