import { state } from "./state.js?v=40";
import { trackAppEvent } from "../firebase-client.js?v=40";

export function createOnboarding() {
  const ONBOARDING_KEY = "aitd_onboarding_v1";
  const onboardingDialog = document.getElementById("onboardingDialog");
  const onboardingSteps = [...document.querySelectorAll("[data-onboarding-step]")];
  const onboardingBack = document.getElementById("onboardingBack");
  const onboardingNext = document.getElementById("onboardingNext");
  const onboardingProgress = document.getElementById("onboardingProgress");

  function renderOnboardingStep() {
    onboardingSteps.forEach((step, index) => { step.hidden = index !== state.onboardingStep; });
    onboardingBack.hidden = state.onboardingStep === 0;
    onboardingNext.textContent = state.onboardingStep === onboardingSteps.length - 1 ? "Start exploring" : "Next";
    onboardingProgress.textContent = `Step ${state.onboardingStep + 1} of ${onboardingSteps.length}`;
  }

  function finishOnboarding(result) {
    localStorage.setItem(ONBOARDING_KEY, result);
    trackAppEvent(result === "completed" ? "onboarding_completed" : "onboarding_skipped", { step: state.onboardingStep + 1 });
    onboardingDialog.close();
  }

  onboardingBack.addEventListener("click", () => { state.onboardingStep = Math.max(0, state.onboardingStep - 1); renderOnboardingStep(); });
  onboardingNext.addEventListener("click", () => {
    if (state.onboardingStep < onboardingSteps.length - 1) { state.onboardingStep += 1; renderOnboardingStep(); return; }
    finishOnboarding("completed");
  });
  document.getElementById("onboardingSkip").addEventListener("click", () => finishOnboarding("skipped"));

  function showOnboardingIfNeeded() {
    if (localStorage.getItem(ONBOARDING_KEY)) return;
    state.onboardingStep = 0;
    renderOnboardingStep();
    onboardingDialog.showModal();
    trackAppEvent("onboarding_started", { step: 1 });
  }

  return { showOnboardingIfNeeded };
}
