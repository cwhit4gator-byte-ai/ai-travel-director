import { trackAppEvent } from "../firebase-client.js?v=47";

export function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

export function safeImageURL(value) {
  try {
    const rawValue = String(value || "").trim();
    if (!rawValue) return "";
    const url = new URL(rawValue, window.location.href);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function setCloudBanner(text, mode = "") {
  const banner = document.getElementById("cloudBanner");
  const label = document.getElementById("cloudBannerText");
  if (label) label.textContent = text;
  else banner.textContent = text;
  banner.className = `banner cloud ${mode}`.trim();
}

export function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 2300);
}

export function trackAppError(surface, error) {
  trackAppEvent("app_error", { source: surface, status: error?.name || "error", online: navigator.onLine });
}

export function normalizeInterests(value) {
  return Array.isArray(value) ? value.join(", ") : String(value || "history, architecture, local culture");
}
