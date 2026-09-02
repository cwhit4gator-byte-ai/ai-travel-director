# AI Travel Director

A mobile-first personal travel app with AI trip planning, Google Maps exploration, live itinerary controls, traveler insights, photo-assisted experience sharing, cloud sync, and safety guidance.

## Included in this version

- Human-friendly Home, Plan, Explore, Trip, Safety, Experience, and Profile views
- Google Maps search, category filters, directions, and “add to trip” actions without requiring a Maps API key
- Secure Firebase Authentication, Firestore sync, Storage uploads, and callable Functions adapters
- OpenAI-powered `planTrip` and `analyzeExperiencePhoto` Functions with local trip-planning fallback
- Installable PWA and offline app shell

## Firebase setup

1. Copy the Firebase Web App values into `firebase-config.js`.
2. Keep `OPENAI_API_KEY` only in Firebase Functions secret storage.
3. Install the Functions dependencies from `functions/`.
4. Deploy Hosting, Functions, Firestore rules, and Storage rules with the Firebase CLI.

The app never makes purchases. Live prices, availability, opening hours, accessibility, weather, and safety conditions must be verified before travel.
