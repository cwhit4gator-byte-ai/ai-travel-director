const state = {
  profile: JSON.parse(localStorage.getItem('aitd_profile') || 'null') || {
    interests: 'history, local food, quiet places',
    budget: 1500,
    pace: 'balanced',
    diet: '',
    walking: 20
  },
  trip: JSON.parse(localStorage.getItem('aitd_trip') || 'null'),
  experiences: JSON.parse(localStorage.getItem('aitd_experiences') || 'null') || [
    {
      place: 'Edinburgh Castle', rating: 5,
      text: 'Go before 10 AM. The entrance area gets crowded, and the uphill approach can take longer than expected.',
      audience: 'Travelers with mobility needs', anonymous: true
    },
    {
      place: 'Chicago Riverwalk', rating: 4,
      text: 'Sunset is beautiful, but weekday mornings are quieter. Several cafés have easy seating and restroom access.',
      audience: 'Everyone', anonymous: true
    }
  ]
};

const views = [...document.querySelectorAll('.view')];
const navItems = [...document.querySelectorAll('.nav-item')];

function saveState() {
  localStorage.setItem('aitd_profile', JSON.stringify(state.profile));
  localStorage.setItem('aitd_trip', JSON.stringify(state.trip));
  localStorage.setItem('aitd_experiences', JSON.stringify(state.experiences));
}

function showView(viewId) {
  views.forEach(v => v.classList.toggle('active', v.id === viewId));
  navItems.forEach(item => item.classList.toggle('active', item.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (viewId === 'itineraryView') renderItinerary();
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2200);
}

function renderRecommendations() {
  const interests = state.profile.interests.split(',').map(s => s.trim()).filter(Boolean);
  const recommendations = [
    {
      title: 'Quiet museum morning',
      text: `A low-crowd cultural stop matched to your ${state.profile.pace} pace and ${state.profile.walking}-minute walking preference.`,
      tags: ['Personalized', interests[0] || 'Culture']
    },
    {
      title: 'Local food with easy transit',
      text: `Traveler tips favor neighborhoods where restaurants are close to transit${state.profile.diet ? ` and offer ${state.profile.diet} choices` : ''}.`,
      tags: ['Community insight', 'Low walking']
    },
    {
      title: 'Flexible afternoon plan',
      text: 'A weather-friendly block with one indoor and one outdoor option, both free to change.',
      tags: ['AI suggestion', 'Flexible']
    }
  ];
  document.getElementById('recommendationList').innerHTML = recommendations.map(r => `
    <article class="info-card">
      <h4>${r.title}</h4>
      <p>${r.text}</p>
      <div class="tag-row">${r.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
    </article>
  `).join('');
}

function renderCommunity() {
  document.getElementById('communityList').innerHTML = state.experiences.slice().reverse().map(item => `
    <article class="info-card">
      <h4>${item.place} · ${'★'.repeat(item.rating)}</h4>
      <p>${item.text}</p>
      <div class="tag-row"><span class="tag">${item.audience}</span><span class="tag">Traveler-reported</span></div>
    </article>
  `).join('');
}

function addMessage(text, type = 'ai') {
  const message = document.createElement('div');
  message.className = `message ${type}`;
  message.textContent = text;
  document.getElementById('chatMessages').appendChild(message);
  message.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function parseDestination(text) {
  const match = text.match(/(?:in|to|visit)\s+([A-Z][a-zA-Z\s]+?)(?:\s+(?:under|for|with|on)|[,.]|$)/i);
  return match ? match[1].trim() : 'Your destination';
}

function parseDays(text) {
  const match = text.match(/(\d+)\s*[- ]?day/i);
  return match ? Math.min(Number(match[1]), 7) : 3;
}

function parseBudget(text) {
  const match = text.match(/\$?([\d,]+)\s*(?:budget|under|maximum|max)?/i);
  return match ? Number(match[1].replace(',', '')) : state.profile.budget;
}

function buildMockTrip(text) {
  const destination = parseDestination(text);
  const days = parseDays(text);
  const budget = parseBudget(text);
  const interests = state.profile.interests.split(',').map(s => s.trim()).filter(Boolean);
  const itinerary = Array.from({ length: days }, (_, index) => ({
    day: index + 1,
    title: index === 0 ? 'Arrival and easy orientation' : index === days - 1 ? 'Flexible final day' : `${interests[index % Math.max(interests.length, 1)] || 'Local'} discovery`,
    items: [
      { time: '9:30 AM', name: index === 0 ? 'Arrival and hotel check-in' : 'Top-rated morning experience' },
      { time: '12:30 PM', name: state.profile.diet ? `${state.profile.diet} lunch recommendation` : 'Local lunch recommendation' },
      { time: '3:00 PM', name: 'Low-stress neighborhood activity' },
      { time: '7:00 PM', name: 'Flexible dinner and evening plan' }
    ]
  }));
  state.trip = { destination, days, budget, itinerary, sourceRequest: text };
  saveState();
  return state.trip;
}

function renderItinerary() {
  const content = document.getElementById('itineraryContent');
  if (!state.trip) {
    content.innerHTML = '<div class="empty-state"><h3>No trip yet</h3><p>Use the AI planner to create a personal itinerary.</p></div>';
    return;
  }
  content.innerHTML = `
    <article class="info-card" style="margin-bottom:12px">
      <h3>${state.trip.destination}</h3>
      <p>${state.trip.days} days · working budget $${state.trip.budget.toLocaleString('en-US')}</p>
      <div class="tag-row"><span class="tag">Draft itinerary</span><span class="tag">Approval required for purchases</span></div>
    </article>
    ${state.trip.itinerary.map(day => `
      <section class="day-card">
        <p class="eyebrow">DAY ${day.day}</p>
        <h3>${day.title}</h3>
        ${day.items.map(item => `<div class="timeline-item"><div class="timeline-time">${item.time}</div><strong>${item.name}</strong></div>`).join('')}
      </section>
    `).join('')}
  `;
  document.getElementById('tripTitle').textContent = state.trip.destination;
  document.getElementById('tripSummary').textContent = `${state.trip.days}-day draft itinerary · $${state.trip.budget.toLocaleString('en-US')} working budget`;
}

function initializeChat() {
  const chat = document.getElementById('chatMessages');
  if (!chat.children.length) {
    addMessage(`Tell me where you want to go, how many days you have, and your budget. I’ll use your preferences: ${state.profile.interests}.`);
  }
}

navItems.forEach(item => item.addEventListener('click', () => {
  showView(item.dataset.view);
  if (item.dataset.view === 'plannerView') initializeChat();
}));

document.querySelectorAll('.back-button').forEach(button => button.addEventListener('click', () => showView(button.dataset.target)));
document.getElementById('startPlanningButton').addEventListener('click', () => { showView('plannerView'); initializeChat(); });
document.getElementById('profileButton').addEventListener('click', () => showView('profileView'));
document.getElementById('shareExperienceButton').addEventListener('click', () => showView('communityView'));
document.getElementById('refreshRecommendations').addEventListener('click', () => { renderRecommendations(); toast('Recommendations refreshed'); });

document.getElementById('chatForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  input.value = '';
  setTimeout(() => {
    const trip = buildMockTrip(text);
    addMessage(`I created a ${trip.days}-day draft for ${trip.destination} with a working budget of $${trip.budget.toLocaleString('en-US')}. I prioritized ${state.profile.interests}, a ${state.profile.pace} pace, and walking segments under ${state.profile.walking} minutes. No bookings were made.`);
    renderItinerary();
    renderRecommendations();
  }, 450);
});

document.getElementById('profileForm').addEventListener('submit', event => {
  event.preventDefault();
  state.profile = {
    interests: document.getElementById('profileInterests').value || 'general sightseeing',
    budget: Number(document.getElementById('profileBudget').value || 1500),
    pace: document.getElementById('profilePace').value,
    diet: document.getElementById('profileDiet').value,
    walking: Number(document.getElementById('profileWalking').value)
  };
  saveState();
  renderRecommendations();
  toast('Preferences saved');
  showView('homeView');
});

document.getElementById('experienceForm').addEventListener('submit', event => {
  event.preventDefault();
  state.experiences.push({
    place: document.getElementById('experiencePlace').value.trim(),
    rating: Number(document.getElementById('experienceRating').value),
    text: document.getElementById('experienceText').value.trim(),
    audience: document.getElementById('experienceAudience').value,
    anonymous: document.getElementById('experienceAnonymous').checked
  });
  saveState();
  event.target.reset();
  document.getElementById('experienceAnonymous').checked = true;
  renderCommunity();
  toast('Experience saved locally');
  showView('homeView');
});

document.getElementById('clearTripButton').addEventListener('click', () => {
  state.trip = null;
  saveState();
  renderItinerary();
  document.getElementById('tripTitle').textContent = 'Plan your next journey';
  document.getElementById('tripSummary').textContent = 'Tell the AI where you want to go, your budget, and what you enjoy.';
  toast('Trip cleared');
});

function setSafety(html) { document.getElementById('safetyOutput').innerHTML = html; }

document.getElementById('shareLocationButton').addEventListener('click', () => {
  if (!navigator.geolocation) return setSafety('<strong>Location unavailable:</strong> This browser does not support geolocation.');
  setSafety('<strong>Requesting permission…</strong> Your location is not stored or transmitted by this prototype.');
  navigator.geolocation.getCurrentPosition(
    pos => setSafety(`<strong>Location session active.</strong><br>Approximate coordinates: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}.<br><small>This demo keeps the result only on this screen.</small>`),
    () => setSafety('<strong>Permission denied.</strong> Enable location access in your browser to use this demo.')
  );
});

document.getElementById('lostButton').addEventListener('click', () => {
  setSafety('<strong>Lost traveler steps:</strong><br>1. Stay in a well-lit public place.<br>2. Open your map and identify a nearby landmark.<br>3. Ask staff at a hotel, station, or official venue for help.<br>4. Use the location button above to view your coordinates.');
});

document.getElementById('unsafeButton').addEventListener('click', () => {
  setSafety('<strong>Immediate safety guidance:</strong><br>Move toward a staffed public place. Contact local emergency services when there is immediate danger. Tell a trusted contact where you are. This prototype is not an emergency-response service.');
});

document.getElementById('checkInButton').addEventListener('click', () => {
  setSafety(`<strong>Checked in safely.</strong><br>${new Date().toLocaleString('en-US')}`);
});

function hydrateProfileForm() {
  document.getElementById('profileInterests').value = state.profile.interests;
  document.getElementById('profileBudget').value = state.profile.budget;
  document.getElementById('profilePace').value = state.profile.pace;
  document.getElementById('profileDiet').value = state.profile.diet;
  document.getElementById('profileWalking').value = String(state.profile.walking);
}

hydrateProfileForm();
renderRecommendations();
renderCommunity();
renderItinerary();


// Progressive Web App installation and offline support.
let deferredInstallPrompt = null;
const installButton = document.getElementById('installButton');
const connectionBanner = document.getElementById('connectionBanner');

function updateConnectionState() {
  connectionBanner.hidden = navigator.onLine;
}

window.addEventListener('online', updateConnectionState);
window.addEventListener('offline', updateConnectionState);
updateConnectionState();

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    toast('Open Chrome menu and choose Add to Home screen');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installButton.hidden = true;
  toast('AI Travel Director installed');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      console.warn('Offline service worker could not be registered.');
    });
  });
}
