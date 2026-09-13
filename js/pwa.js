import { toast } from "./ui.js?v=46";
import { trackAppEvent } from "../firebase-client.js?v=46";

export function initializePWA() {
  let deferredInstallPrompt = null;
  const installButton = document.getElementById("installButton");
  const connectionBanner = document.getElementById("connectionBanner");
  function updateConnectionState() { connectionBanner.hidden = navigator.onLine; }
  window.addEventListener("online", updateConnectionState);
  window.addEventListener("offline", updateConnectionState);
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; installButton.hidden = false; trackAppEvent("pwa_install_prompt", { status: "available" }); });
  installButton.addEventListener("click", async () => { if (!deferredInstallPrompt) return toast("Use your browser menu to add this app to your home screen"); deferredInstallPrompt.prompt(); const choice = await deferredInstallPrompt.userChoice; trackAppEvent("pwa_install_result", { result: choice.outcome }); deferredInstallPrompt = null; installButton.hidden = true; });
  const APP_VERSION = "46";
  async function registerServiceWorker() {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      const reloadKey = `aitd_app_reloaded_${APP_VERSION}`;
      if (sessionStorage.getItem(reloadKey)) return;
      sessionStorage.setItem(reloadKey, "true");
      window.location.reload();
    });
    try {
      const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`, { updateViaCache: "none" });
      await registration.update();
    } catch (error) {
      console.warn("Service worker unavailable", error);
    }
  }
  if ("serviceWorker" in navigator) window.addEventListener("load", registerServiceWorker);

  updateConnectionState();
}
