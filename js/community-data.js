import { state } from "./state.js?v=40";

export function communityItems() {
  const combined = new Map();
  state.communityPosts.forEach(item => combined.set(`shared:${String(item.id)}`, item));
  [...state.experiences].reverse().forEach(item => {
    const duplicate = state.communityPosts.some(shared => String(shared.id) === String(item.id));
    if (!duplicate) combined.set(`private:${String(item.id)}`, { ...item, isShared: false });
  });
  return [...combined.values()];
}

export function communityExperienceById(experienceId) {
  return communityItems().find(item => String(item.id) === String(experienceId));
}
