# AI Travel Director PWA

This is an installable, mobile-first personal prototype. It works in Chrome on Android, stores profile/trip/community data in the browser, and keeps the core interface available offline after the first load.

## Fastest phone-only setup: GitHub Pages

1. On your Android phone, download and extract `ai_travel_pwa.zip` using the Files app.
2. Create a free GitHub account or sign in at github.com in Chrome.
3. Create a new public repository named `ai-travel-director`.
4. Choose **Add file → Upload files** and upload the contents of the extracted folder. Upload the files themselves, not the outer folder.
5. Open **Settings → Pages** in the repository.
6. Under **Build and deployment**, choose **Deploy from a branch**.
7. Select branch **main**, folder **/(root)**, and save.
8. Return to the Pages screen after deployment and open the displayed site address.
9. In Chrome, tap **Install app** when offered. If the button does not appear, open Chrome’s three-dot menu and tap **Add to Home screen** or **Install app**.

GitHub Pages supplies HTTPS, which Android requires for service workers, offline mode, installation, and browser location permission.

## Test without publishing

Opening `index.html` directly allows most screens to work, but installation, offline caching, and location can be restricted because the page is not served through HTTPS.

## Current prototype capabilities

- Simulated conversational trip planning
- Draft itineraries based on destination, duration, budget, and profile preferences
- Locally stored traveler profile and trip
- Personalized recommendation cards
- Traveler experience and suggestion sharing
- Safety check-in and location-permission demonstration
- Installable Android home-screen app
- Offline app shell after first successful load

## Important limitations

- AI responses are simulated; no OpenAI API is connected.
- Search results, prices, bookings, weather, maps, and emergency services are not live.
- Data is stored only in the current browser. Clearing site data removes it.
- This prototype is not an emergency-response service.

## Files

- `index.html` — interface
- `styles.css` — mobile design
- `app.js` — prototype behavior and local storage
- `manifest.json` — Android installation metadata
- `service-worker.js` — offline caching
- `icons/` — installation icons
