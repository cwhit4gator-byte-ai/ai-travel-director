# AI Travel Director

A mobile-first personal travel app with AI trip planning, Google Maps exploration, live itinerary controls, traveler insights, photo-assisted experience sharing, cloud sync, and safety guidance.

## Included in this version

- Human-friendly Home, Plan, Explore, Trip, Safety, Experience, and Profile views
- Interactive Google Maps search with category filters, directions, location lookup, and “add to trip” actions
- Secure Firebase Authentication, Firestore sync, Storage uploads, and callable Functions adapters
- OpenAI-powered `planTrip` and `analyzeExperiencePhoto` Functions with local trip-planning fallback
- Installable PWA and offline app shell

## Firebase setup

1. Serve the app with Firebase Hosting so `/__/firebase/init.json` can provide the Web App configuration.
2. Keep `OPENAI_API_KEY` only in Firebase Functions secret storage.
3. Install the Functions dependencies from `functions/`.
4. Deploy Hosting, Functions, Firestore rules, and Storage rules with the Firebase CLI.

## Automatic Hosting deployment

The GitHub Actions workflows deploy pull-request previews and publish `main` to the live Firebase Hosting channel. Add the Firebase service-account JSON as the encrypted repository secret `FIREBASE_SERVICE_ACCOUNT_AI_TRAVEL_DIRECTOR`. Never commit that credential to the repository.

The app never makes purchases. Live prices, availability, opening hours, accessibility, weather, and safety conditions must be verified before travel.
