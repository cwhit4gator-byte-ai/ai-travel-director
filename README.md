# AI Travel Director

A mobile-first personal travel app with AI trip planning, Google Maps exploration, live itinerary controls, traveler insights, photo-assisted experience sharing, cloud sync, and safety guidance.

## Included in this version

- Human-friendly Home, Plan, Explore, Trip, Safety, Experience, and Profile views
- Interactive Google Maps search with category filters, directions, location lookup, and “add to trip” actions
- Secure Firebase Authentication, Firestore sync, Storage uploads, and callable Functions adapters
- Shared Community Insights feed with public posts, destination filters, pagination, helpful reactions, private reports, photo galleries, and Explore-map links
- OpenAI-powered `planTrip` and `analyzeExperiencePhoto` Functions with local trip-planning fallback
- Installable PWA and offline app shell
- Three real Google Places hotel properties per overnight stop, with photos, ratings, review counts, stay dates, guests, and rooms
- Provider-neutral hotel affiliate links for qualified-click and completed-booking programs, with privacy-safe attribution and traveler-facing disclosure

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
