import { findTripItem } from "./trip-model.js?v=37";
import { loadActivityPhoto } from "./featured-place.js?v=37";
import { safeImageURL } from "./ui.js?v=37";

const activityPhotoCache = new Map();
let hydrationSequence = 0;

export function itineraryPhotoKey(item, day = {}) {
  return [item?.name, item?.location || day?.overnightLocation].map(value => String(value || "").trim().toLocaleLowerCase()).filter(Boolean).join(" | ");
}

async function loadInBatches(tasks, batchSize = 3) {
  for (let index = 0; index < tasks.length; index += batchSize) {
    await Promise.allSettled(tasks.slice(index, index + batchSize).map(task => task()));
  }
}

function applyPhoto(card, photo, sequence) {
  if (sequence !== hydrationSequence || !card.isConnected) return;
  const image = card.querySelector(".timeline-photo");
  const credit = card.querySelector(".timeline-photo-credit");
  const photoURL = safeImageURL(photo?.photoURL || photo?.heroPhotoURL);
  if (!image || !photoURL) return;
  image.onload = () => {
    if (sequence === hydrationSequence && card.isConnected) card.classList.add("has-photo");
  };
  image.onerror = () => {
    card.classList.remove("has-photo");
    image.hidden = true;
    image.removeAttribute("src");
  };
  image.src = photoURL;
  image.hidden = false;
  const attribution = photo.photoAttribution || {};
  const attributionURL = safeImageURL(attribution.uri || photo.mapsURL);
  if (credit && attribution.displayName) {
    credit.textContent = `Photo: ${attribution.displayName}`;
    if (attributionURL) credit.href = attributionURL;
    else credit.removeAttribute("href");
    credit.hidden = false;
  }
}

export async function hydrateItineraryPhotos(root = document) {
  const sequence = ++hydrationSequence;
  const cards = [...root.querySelectorAll("[data-itinerary-photo]")];
  const tasks = cards.map(card => async () => {
    const image = card.querySelector(".timeline-photo");
    if (!image) return;
    const found = findTripItem(card.dataset.itemId);
    if (!found) return;
    const key = itineraryPhotoKey(found.item, found.day);
    if (!key) return;
    if (!activityPhotoCache.has(key)) activityPhotoCache.set(key, loadActivityPhoto(found.item, found.day).catch(() => null));
    const photo = await activityPhotoCache.get(key);
    if (photo) applyPhoto(card, photo, sequence);
  });
  await loadInBatches(tasks);
}
