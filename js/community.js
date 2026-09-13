import { state } from "./state.js?v=46";
import { escapeHTML, safeImageURL, toast } from "./ui.js?v=46";
import { scheduleSave } from "./persistence.js?v=46";
import { loadCommunityFeed, publishCommunityExperience, loadCommunityActions, setCommunityHelpful, reportCommunityExperience, loadPublicTravelerProfile, requestAITrip, uploadExperiencePhotos, requestPhotoAnalysis, trackAppEvent } from "../firebase-client.js?v=46";
import { normalizeAITrip, communityTripItems } from "./trip-model.js?v=46";
import { communityItems, communityExperienceById } from "./community-data.js?v=46";

export function createCommunity({ showView, renderAll, renderItinerary }) {
  function filteredCommunityItems() {
    const search = state.communitySearch.trim().toLocaleLowerCase();
    return communityItems().filter(item => {
      const matchesSearch = !search || `${item.place || ""} ${item.text || ""}`.toLocaleLowerCase().includes(search);
      const matchesAudience = state.communityAudience === "All travelers" || item.audience === state.communityAudience;
      return matchesSearch && matchesAudience;
    });
  }

  function renderCommunity() {
    const list = document.getElementById("communityList");
    const items = filteredCommunityItems();
    if (state.communityLoading && !communityItems().length) {
      list.innerHTML = `<div class="community-state"><span class="ai-pulse" aria-hidden="true">✦</span><strong>Loading traveler insights…</strong></div>`;
      return;
    }
    if (!items.length) {
      list.innerHTML = `<div class="community-state"><span class="metric-icon" aria-hidden="true">◇</span><strong>No matching insights yet</strong><p>Adjust the filters or share the first experience for this destination.</p></div>`;
    } else list.innerHTML = items.map(item => {
      const photos = (Array.isArray(item.photoURLs) ? item.photoURLs : []).map(safeImageURL).filter(Boolean);
      const description = String(item.photoAnalysis?.description || item.text || `${item.place || "Travel experience"} photo`);
      const helpful = state.helpfulIds.has(String(item.id));
      const reported = state.reportedIds.has(String(item.id));
      const savedInTrip = Boolean(state.trip?.itinerary?.some(day => (day.items || []).some(tripItem => String(tripItem.communityPostId || "") === String(item.id))));
      const savedInCollection = state.collections.some(collection => (collection.items || []).some(savedItem => String(savedItem.postId) === String(item.id)));
      const createdDate = item.createdAt ? new Date(item.createdAt) : null;
      const dateLabel = createdDate && !Number.isNaN(createdDate.valueOf()) ? createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recent insight";
      const gallery = photos.length ? `
        <div class="community-photo-grid photo-count-${Math.min(photos.length, 3)}" aria-label="${photos.length} traveler photo${photos.length === 1 ? "" : "s"}">
          ${photos.map((photoURL, photoIndex) => `
            <button class="community-photo-button" type="button" data-experience-id="${escapeHTML(item.id)}" data-photo-index="${photoIndex}" aria-label="Open photo ${photoIndex + 1} of ${photos.length} from ${escapeHTML(item.place)}">
              <img src="${escapeHTML(photoURL)}" alt="${escapeHTML(description)}" loading="lazy" />
            </button>
          `).join("")}
        </div>
      ` : "";
      return `
        <article class="info-card community-card">
          ${gallery}
          <div class="community-card-copy">
            <h3>${escapeHTML(item.place)} · ${"★".repeat(Math.max(1, Number(item.rating) || 1))}</h3>
            <div class="community-byline">${!item.anonymous && item.ownerId ? `<button class="traveler-profile-link" type="button" data-traveler-profile="${escapeHTML(item.id)}">${escapeHTML(item.authorName || "Traveler")}</button>` : `<span>${escapeHTML(item.authorName || "Anonymous traveler")}</span>`}<span aria-hidden="true">·</span><time>${escapeHTML(dateLabel)}</time></div>
            <p>${escapeHTML(item.text)}</p>
            <div class="tag-row"><span class="tag">${escapeHTML(item.audience)}</span><span class="tag">${item.isShared ? "Traveler-reported" : "Saved on this device"}</span></div>
            <div class="community-actions">
              <button class="insight-action primary-insight-action${savedInTrip ? " selected" : ""}" type="button" data-community-save="${escapeHTML(item.id)}" ${savedInTrip ? "disabled" : ""}>${savedInTrip ? "✓ In your trip" : state.trip ? "＋ Add to trip" : "✦ Plan with this"}</button>
              <button class="insight-action${savedInCollection ? " selected" : ""}" type="button" data-save-collection="${escapeHTML(item.id)}">${savedInCollection ? "★ Saved" : "☆ Save"}</button>
              <button class="insight-action${helpful ? " selected" : ""} type="button" data-community-helpful="${escapeHTML(item.id)}" aria-pressed="${helpful}" ${item.isShared ? "" : "disabled"}>${helpful ? "✓ Helpful" : "♡ Helpful"}</button>
              <button class="insight-action" type="button" data-community-map="${escapeHTML(item.place)}">⌖ View on map</button>
              <button class="insight-action report" type="button" data-community-report="${escapeHTML(item.id)}" ${!item.isShared || reported ? "disabled" : ""}>${reported ? "Reported" : "Report"}</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    const loadMore = document.getElementById("communityLoadMore");
    loadMore.hidden = !state.communityLoaded || !state.communityHasMore || Boolean(state.communitySearch) || state.communityAudience !== "All travelers";
    loadMore.disabled = state.communityLoading;
    const sharedCount = items.filter(item => item.isShared).length;
    const privateCount = items.length - sharedCount;
    document.getElementById("communityResultSummary").textContent = state.communityLoaded
      ? [sharedCount ? `${sharedCount} shared` : "", privateCount ? `${privateCount} saved privately` : ""].filter(Boolean).join(" · ") || "No insights yet"
      : "Showing saved insights while the shared feed connects";
  }

  function collectionById(collectionId) {
    return state.collections.find(collection => String(collection.id) === String(collectionId));
  }

  function openCollectionDialog(experienceId = "") {
    state.activeCollectionPostId = String(experienceId || "");
    const experience = experienceId ? communityExperienceById(experienceId) : null;
    const dialog = document.getElementById("collectionDialog");
    document.getElementById("collectionDialogTitle").textContent = experience ? "Choose a collection" : "Create a collection";
    document.getElementById("collectionDialogPlace").textContent = experience ? experience.place : "Create a private list for places you want to remember.";
    const select = document.getElementById("collectionSelect");
    select.innerHTML = state.collections.length ? state.collections.map(collection => `<option value="${escapeHTML(collection.id)}">${escapeHTML(collection.name)} · ${(collection.items || []).length}</option>`).join("") : '<option value="">Saved places</option>';
    document.getElementById("existingCollectionLabel").hidden = !experience || !state.collections.length;
    document.getElementById("newCollectionName").value = "";
    if (!dialog.open) dialog.showModal();
  }

  function savedCommunitySnapshot(experience) {
    const photos = (Array.isArray(experience.photoURLs) ? experience.photoURLs : []).map(safeImageURL).filter(Boolean);
    return { postId: String(experience.id), place: String(experience.place || "Travel recommendation"), text: String(experience.text || ""), rating: Math.max(1, Number(experience.rating) || 1), audience: String(experience.audience || "Everyone"), authorName: String(experience.authorName || (experience.anonymous ? "Anonymous traveler" : "Traveler")), ownerId: experience.anonymous ? "" : String(experience.ownerId || ""), photoURL: photos[0] || experience.photoURL || "", savedAt: new Date().toISOString() };
  }

  function renderCollections() {
    const list = document.getElementById("collectionsList");
    if (!list) return;
    if (!state.collections.length) {
      list.innerHTML = '<div class="empty-state"><span class="empty-icon">☆</span><h2>No collections yet</h2><p>Save a Community insight or create a collection for a future trip.</p><button class="primary-button" type="button" data-create-collection>Create a collection</button></div>';
      return;
    }
    list.innerHTML = state.collections.map(collection => `
      <section class="collection-card">
        <div class="collection-heading"><div><p class="eyebrow">PRIVATE COLLECTION</p><h2>${escapeHTML(collection.name)}</h2></div><span>${(collection.items || []).length} place${(collection.items || []).length === 1 ? "" : "s"}</span></div>
        ${(collection.items || []).length ? `<div class="collection-items">${collection.items.map(item => `
          <article class="collection-item">
            ${safeImageURL(item.photoURL) ? `<img src="${escapeHTML(safeImageURL(item.photoURL))}" alt="" loading="lazy" />` : '<span class="collection-placeholder" aria-hidden="true">⌖</span>'}
            <div><strong>${escapeHTML(item.place)}</strong><small>${escapeHTML(item.authorName)} · ${"★".repeat(item.rating)}</small><p>${escapeHTML(item.text)}</p></div>
            <div class="collection-item-actions"><button class="mini-button" type="button" data-collection-trip="${escapeHTML(item.postId)}" data-collection-id="${escapeHTML(collection.id)}" title="Add to trip">＋</button><button class="mini-button" type="button" data-collection-map="${escapeHTML(item.place)}" title="View on map">⌖</button><button class="mini-button danger-text" type="button" data-collection-remove="${escapeHTML(item.postId)}" data-collection-id="${escapeHTML(collection.id)}" title="Remove from collection">×</button></div>
          </article>`).join("")}</div>` : '<p class="collection-empty">This collection is ready for your first saved place.</p>'}
      </section>
    `).join("");
  }

  async function openTravelerProfile(experienceId) {
    const experience = communityExperienceById(experienceId);
    if (!experience || experience.anonymous || !experience.ownerId) return;
    const dialog = document.getElementById("travelerProfileDialog");
    const content = document.getElementById("travelerProfileContent");
    content.innerHTML = '<div class="community-state"><span class="ai-pulse" aria-hidden="true">✦</span><strong>Loading traveler profile…</strong></div>';
    if (!dialog.open) dialog.showModal();
    let profile = null;
    try { profile = await loadPublicTravelerProfile(String(experience.ownerId)); } catch (error) { console.info("Public traveler profile is not available.", error); }
    const recentInsights = communityItems().filter(item => !item.anonymous && String(item.ownerId || "") === String(experience.ownerId)).slice(0, 4);
    const displayName = profile?.displayName || experience.authorName || "Traveler";
    const photoURL = safeImageURL(profile?.photoURL);
    const initials = displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
    content.innerHTML = `
      <header class="traveler-profile-header">
        ${photoURL ? `<img src="${escapeHTML(photoURL)}" alt="" />` : `<span class="traveler-profile-avatar">${escapeHTML(initials || "T")}</span>`}
        <div><p class="eyebrow">TRAVELER PROFILE</p><h2 id="travelerProfileName">${escapeHTML(displayName)}</h2><p>${escapeHTML(profile?.travelStyle || "Community contributor")}</p></div>
      </header>
      ${profile ? `<div class="traveler-profile-details">${profile.homeBase ? `<span>⌖ ${escapeHTML(profile.homeBase)}</span>` : ""}${profile.interests ? `<span>✦ ${escapeHTML(profile.interests)}</span>` : ""}</div><p class="traveler-profile-bio">${escapeHTML(profile.bio || "This traveler has not added a public bio yet.")}</p>` : '<p class="profile-private-note">This traveler keeps their profile private. Their non-anonymous Community insights are still shown below.</p>'}
      <div class="profile-insights"><p class="eyebrow">RECENT INSIGHTS</p>${recentInsights.map(item => `<button type="button" data-profile-map="${escapeHTML(item.place)}"><strong>${escapeHTML(item.place)}</strong><span>${escapeHTML(item.text)}</span></button>`).join("") || "<p>No recent insights are loaded.</p>"}</div>
    `;
  }

  async function hydrateCommunityActions(items = state.communityPosts) {
    if (!state.user || !items.length) return;
    try {
      const actions = await loadCommunityActions(items.map(item => String(item.id)), state.user.uid);
      actions.helpfulIds.forEach(id => state.helpfulIds.add(String(id)));
      actions.reportedIds.forEach(id => state.reportedIds.add(String(id)));
      renderCommunity();
    } catch (error) {
      console.warn("Community reactions could not be loaded.", error);
    }
  }

  async function refreshCommunityFeed({ reset = false } = {}) {
    if (!state.cloudConfigured || state.communityLoading) return;
    state.communityLoading = true;
    if (reset) {
      state.communityCursor = null;
      state.communityHasMore = false;
    }
    renderCommunity();
    try {
      const page = await loadCommunityFeed({ cursor: reset ? null : state.communityCursor, pageSize: 8 });
      const known = new Map((reset ? [] : state.communityPosts).map(item => [String(item.id), item]));
      page.items.forEach(item => known.set(String(item.id), item));
      state.communityPosts = [...known.values()];
      state.communityCursor = page.cursor;
      state.communityHasMore = page.hasMore;
      state.communityLoaded = true;
      await hydrateCommunityActions(page.items);
    } catch (error) {
      console.warn("Shared community feed is not available yet.", error);
    } finally {
      state.communityLoading = false;
      renderCommunity();
      renderCommunityMapPicks(state.mapQuery);
    }
  }

  const communityPhotoDialog = document.getElementById("communityPhotoDialog");
  let activeCommunityPhoto = { experienceId: "", index: 0 };

  function openCommunityPhoto(experienceId, photoIndex) {
    const experience = communityItems().find(item => String(item.id) === String(experienceId));
    const photos = (Array.isArray(experience?.photoURLs) ? experience.photoURLs : []).map(safeImageURL).filter(Boolean);
    if (!experience || !photos.length) return;

    const index = Math.max(0, Math.min(Number(photoIndex) || 0, photos.length - 1));
    const description = String(experience.photoAnalysis?.description || experience.text || `${experience.place || "Travel experience"} photo`);
    activeCommunityPhoto = { experienceId: String(experience.id), index };

    const fullPhoto = document.getElementById("communityPhotoFull");
    fullPhoto.src = photos[index];
    fullPhoto.alt = description;
    document.getElementById("communityPhotoTitle").textContent = experience.place || "Traveler photo";
    document.getElementById("communityPhotoDescription").textContent = description;
    const travelerNote = document.getElementById("communityPhotoTravelerNote");
    travelerNote.textContent = description === experience.text ? "" : experience.text || "";
    travelerNote.hidden = !travelerNote.textContent;
    document.getElementById("communityPhotoTags").innerHTML = `<span class="tag">${escapeHTML(experience.audience || "Everyone")}</span><span class="tag">${"★".repeat(Math.max(1, Number(experience.rating) || 1))}</span>`;
    document.getElementById("communityPhotoPosition").textContent = photos.length > 1 ? `Photo ${index + 1} of ${photos.length}` : "Traveler-uploaded photo";
    document.getElementById("previousCommunityPhoto").hidden = photos.length < 2;
    document.getElementById("nextCommunityPhoto").hidden = photos.length < 2;

    if (!communityPhotoDialog.open) communityPhotoDialog.showModal();
  }

  function moveCommunityPhoto(direction) {
    const experience = communityItems().find(item => String(item.id) === activeCommunityPhoto.experienceId);
    const photoCount = (Array.isArray(experience?.photoURLs) ? experience.photoURLs : []).map(safeImageURL).filter(Boolean).length;
    if (!photoCount) return;
    openCommunityPhoto(activeCommunityPhoto.experienceId, (activeCommunityPhoto.index + direction + photoCount) % photoCount);
  }

  function addCommunityExperienceToTrip(experience) {
    if (!state.trip) {
      const prompt = `Plan a trip that includes ${experience.place}. A traveler shared this advice: ${experience.text || "Include this community recommendation."}`;
      document.getElementById("chatInput").value = prompt;
      showView("plannerView");
      document.getElementById("chatInput").focus();
      toast("Tell the AI your dates and budget to plan with this insight");
      return;
    }

    const existing = state.trip.itinerary?.some(day => (day.items || []).some(item => String(item.communityPostId || "") === String(experience.id)));
    if (existing) {
      toast("This community pick is already in your trip");
      return;
    }

    if (!Array.isArray(state.trip.itinerary) || !state.trip.itinerary.length) {
      state.trip.itinerary = [{ day: 1, title: "Community discoveries", items: [] }];
      state.trip.days = Math.max(1, Number(state.trip.days || 1));
    }

    const targetDay = state.trip.itinerary.reduce((best, day) => (day.items || []).length < (best.items || []).length ? day : best, state.trip.itinerary[0]);
    if (!Array.isArray(targetDay.items)) targetDay.items = [];
    targetDay.items.push({
      id: crypto.randomUUID(),
      time: "Flexible",
      name: String(experience.place || "Community recommendation"),
      location: String(experience.place || ""),
      note: String(experience.text || "Recommended by a traveler in the community."),
      category: "Community pick",
      photoURL: (Array.isArray(experience.photoURLs) ? experience.photoURLs : []).map(safeImageURL).find(Boolean) || "",
      cost: 0,
      done: false,
      communityPostId: String(experience.id),
      communityRating: Math.max(1, Number(experience.rating) || 1),
      communityAudience: String(experience.audience || "Everyone")
    });

    scheduleSave();
    renderCommunity();
    renderItinerary();
    showView("itineraryView");
    toast(`${experience.place} was added to Day ${targetDay.day}`);
  }

  async function replanCommunityPicks() {
    const picks = communityTripItems();
    if (!picks.length || state.isReplanningCommunity) return;
    if (!state.user || !state.cloudConfigured || !navigator.onLine) {
      toast("Connect your account and go online to fit picks with AI");
      if (!state.user) showView("profileView");
      return;
    }

    state.isReplanningCommunity = true;
    renderItinerary();
    try {
      const existingPlan = (state.trip.itinerary || []).map(day => ({
        day: day.day,
        title: day.title,
        items: (day.items || []).map(item => ({ time: item.time, name: item.name, note: item.note, cost: item.cost }))
      }));
      const request = `Revise my existing ${state.trip.days}-day itinerary for ${state.trip.destination}. Keep suitable existing activities, include every community pick, and place each on the most geographically and practically appropriate day and time. Keep the working budget at ${state.trip.budget}. Existing itinerary: ${JSON.stringify(existingPlan).slice(0, 950)}`;
      const communityInsights = picks.map(item => ({
        place: item.name,
        rating: item.communityRating,
        text: item.note,
        audience: item.communityAudience
      }));
      const result = await requestAITrip({ request, profile: state.profile, communityInsights });
      const originalRequest = state.trip.sourceRequest || request;
      const startDate = state.trip.startDate || "";
      const hotelStayDates = state.trip.hotelStayDates || {};
      state.trip = { ...normalizeAITrip(result, originalRequest), startDate, hotelStayDates };
      scheduleSave();
      renderAll();
      showView("itineraryView");
      toast("AI fitted your community picks into the trip");
    } catch (error) {
      console.error(error);
      toast(error.message || "AI could not replan the trip");
    } finally {
      state.isReplanningCommunity = false;
      renderItinerary();
    }
  }

  function renderCommunityMapPicks(query) {
    const list = document.getElementById("communityMapList");
    if (!list) return;
    const queryText = String(query || "").toLocaleLowerCase();
    const items = communityItems()
      .map(item => ({ item, matches: `${item.place || ""} ${item.text || ""}`.toLocaleLowerCase().includes(queryText) }))
      .sort((a, b) => Number(b.matches) - Number(a.matches))
      .slice(0, 3)
      .map(entry => entry.item);
    if (!items.length) {
      list.innerHTML = `<div class="map-community-empty">Community locations will appear here as travelers publish insights.</div>`;
      return;
    }
    list.innerHTML = items.map(item => {
      const photo = (Array.isArray(item.photoURLs) ? item.photoURLs : []).map(safeImageURL).find(Boolean);
      return `<article class="place-card community-map-card">
        ${photo ? `<img src="${escapeHTML(photo)}" alt="" loading="lazy" />` : `<span class="place-pin">◇</span>`}
        <div><strong>${escapeHTML(item.place)}</strong><p>${"★".repeat(Math.max(1, Number(item.rating) || 1))} · ${escapeHTML(item.audience || "Everyone")}</p></div>
        <div class="place-actions"><button class="icon-action" type="button" data-map-community="${escapeHTML(item.place)}" title="Show on map">⌖</button></div>
      </article>`;
    }).join("");
  }

  document.getElementById("communitySearch").addEventListener("input", event => { state.communitySearch = event.target.value; renderCommunity(); });
  document.getElementById("communityAudienceFilter").addEventListener("change", event => { state.communityAudience = event.target.value; renderCommunity(); });
  document.getElementById("communityLoadMore").addEventListener("click", () => refreshCommunityFeed({ reset: false }));

  document.getElementById("experiencePhotos").addEventListener("change", event => {
    const files = [...event.target.files].slice(0, 3);
    document.getElementById("photoStatus").textContent = files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} ready to upload.` : "Up to 3 photos. AI can help describe the experience when cloud mode is connected.";
  });

  document.getElementById("communityList").addEventListener("click", async event => {
    const button = event.target.closest(".community-photo-button");
    if (button) {
      openCommunityPhoto(button.dataset.experienceId, button.dataset.photoIndex);
      return;
    }
    const mapButton = event.target.closest("[data-community-map]");
    if (mapButton) {
      trackAppEvent("community_viewed_on_map", { source: "community" });
      state.mapQuery = mapButton.dataset.communityMap;
      showView("exploreView");
      return;
    }
    const saveButton = event.target.closest("[data-community-save]");
    if (saveButton) {
      const experience = communityExperienceById(saveButton.dataset.communitySave);
      if (experience) { trackAppEvent("community_added_to_trip", { source: "community" }); addCommunityExperienceToTrip(experience); }
      return;
    }
    const collectionButton = event.target.closest("[data-save-collection]");
    if (collectionButton) { trackAppEvent("community_saved", { source: "community" }); openCollectionDialog(collectionButton.dataset.saveCollection); return; }
    const profileButton = event.target.closest("[data-traveler-profile]");
    if (profileButton) { openTravelerProfile(profileButton.dataset.travelerProfile); return; }
    const helpfulButton = event.target.closest("[data-community-helpful]");
    const reportButton = event.target.closest("[data-community-report]");
    if (!helpfulButton && !reportButton) return;
    if (!state.user) {
      toast("Connect your account to interact with community posts");
      showView("profileView");
      return;
    }
    const actionButton = helpfulButton || reportButton;
    actionButton.disabled = true;
    try {
      if (helpfulButton) {
        const postId = String(helpfulButton.dataset.communityHelpful);
        const helpful = !state.helpfulIds.has(postId);
        await setCommunityHelpful(postId, state.user.uid, helpful);
        if (helpful) state.helpfulIds.add(postId); else state.helpfulIds.delete(postId);
        toast(helpful ? "Marked as helpful" : "Helpful reaction removed");
      } else {
        const postId = String(reportButton.dataset.communityReport);
        await reportCommunityExperience(postId, state.user.uid);
        state.reportedIds.add(postId);
        toast("Report received for moderation review");
      }
      renderCommunity();
    } catch (error) {
      console.error(error);
      toast(error.message || "Community action could not be saved");
      actionButton.disabled = false;
    }
  });
  const collectionDialog = document.getElementById("collectionDialog");
  document.getElementById("newCollectionButton").addEventListener("click", () => openCollectionDialog());
  document.getElementById("closeCollectionDialog").addEventListener("click", () => collectionDialog.close());
  document.getElementById("collectionForm").addEventListener("submit", event => {
    event.preventDefault();
    const newName = document.getElementById("newCollectionName").value.trim();
    let collection = newName ? null : collectionById(document.getElementById("collectionSelect").value);
    if (!collection) { collection = { id: crypto.randomUUID(), name: newName || "Saved places", createdAt: new Date().toISOString(), items: [] }; state.collections.unshift(collection); }
    const experience = state.activeCollectionPostId ? communityExperienceById(state.activeCollectionPostId) : null;
    if (experience && !(collection.items || []).some(item => String(item.postId) === String(experience.id))) collection.items = [...(collection.items || []), savedCommunitySnapshot(experience)];
    scheduleSave(); renderAll(); collectionDialog.close(); toast(experience ? `Saved to ${collection.name}` : `${collection.name} created`);
  });
  document.getElementById("collectionsList").addEventListener("click", event => {
    if (event.target.closest("[data-create-collection]")) return openCollectionDialog();
    const mapButton = event.target.closest("[data-collection-map]");
    if (mapButton) { state.mapQuery = mapButton.dataset.collectionMap; showView("exploreView"); return; }
    const tripButton = event.target.closest("[data-collection-trip]");
    if (tripButton) {
      const collection = collectionById(tripButton.dataset.collectionId);
      const item = (collection?.items || []).find(savedItem => String(savedItem.postId) === String(tripButton.dataset.collectionTrip));
      if (item) addCommunityExperienceToTrip({ ...item, id: item.postId });
      return;
    }
    const removeButton = event.target.closest("[data-collection-remove]");
    if (removeButton) {
      const collection = collectionById(removeButton.dataset.collectionId);
      if (collection) collection.items = (collection.items || []).filter(item => String(item.postId) !== String(removeButton.dataset.collectionRemove));
      scheduleSave(); renderAll(); toast("Removed from collection");
    }
  });
  document.getElementById("closeTravelerProfile").addEventListener("click", () => document.getElementById("travelerProfileDialog").close());
  document.getElementById("travelerProfileContent").addEventListener("click", event => {
    const button = event.target.closest("[data-profile-map]");
    if (button) { document.getElementById("travelerProfileDialog").close(); state.mapQuery = button.dataset.profileMap; showView("exploreView"); }
  });

  document.getElementById("closeCommunityPhoto").addEventListener("click", () => communityPhotoDialog.close());
  document.getElementById("previousCommunityPhoto").addEventListener("click", () => moveCommunityPhoto(-1));
  document.getElementById("nextCommunityPhoto").addEventListener("click", () => moveCommunityPhoto(1));
  communityPhotoDialog.addEventListener("click", event => {
    if (event.target === communityPhotoDialog) communityPhotoDialog.close();
  });

  document.getElementById("experienceForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!state.user || !state.cloudConfigured) {
      toast("Connect your account before publishing a community insight");
      showView("profileView");
      return;
    }
    const submit = event.submitter;
    submit.disabled = true;
    const files = [...document.getElementById("experiencePhotos").files].slice(0, 3);
    try {
      let photoURLs = [];
      let photoAnalysis = null;
      if (files.length && state.user && state.cloudConfigured) {
        document.getElementById("photoStatus").textContent = "Uploading and analyzing photos…";
        photoURLs = await uploadExperiencePhotos(state.user.uid, files);
        if (photoURLs[0]) photoAnalysis = await requestPhotoAnalysis(photoURLs[0]);
      }
      const experience = {
        id: crypto.randomUUID(),
        authorName: state.user.displayName || state.profile.name || "Traveler",
        place: document.getElementById("experiencePlace").value.trim(),
        rating: Number(document.getElementById("experienceRating").value),
        text: document.getElementById("experienceText").value.trim(),
        audience: document.getElementById("experienceAudience").value,
        anonymous: document.getElementById("experienceAnonymous").checked,
        photoURLs,
        photoAnalysis,
        createdAt: new Date().toISOString()
      };
      const sharedExperience = await publishCommunityExperience(state.user.uid, experience);
      state.communityPosts = [sharedExperience, ...state.communityPosts.filter(item => String(item.id) !== String(sharedExperience.id))];
      state.communityLoaded = true;
      event.target.reset();
      document.getElementById("experienceAnonymous").checked = true;
      document.getElementById("photoStatus").textContent = "Up to 3 photos. AI can help describe the experience when cloud mode is connected.";
      renderCommunity();
      renderCommunityMapPicks(state.mapQuery);
      toast("Community insight published");
      showView("homeView");
    } catch (error) { console.error(error); toast(error.message || "The experience could not be saved"); }
    finally { submit.disabled = false; }
  });

  return { renderCommunity, renderCollections, renderCommunityMapPicks, refreshCommunityFeed, hydrateCommunityActions, replanCommunityPicks };
}
