import { createRandomId } from '../utils/randomId';

export const STABLE_ANALYTICS_ID_KEY = 'openscad-studio:analytics-id';

export function getOrCreateStableId(): string {
  const existing = localStorage.getItem(STABLE_ANALYTICS_ID_KEY);
  if (existing) return existing;
  const id = createRandomId();
  localStorage.setItem(STABLE_ANALYTICS_ID_KEY, id);
  return id;
}

export function clearStableId(): void {
  localStorage.removeItem(STABLE_ANALYTICS_ID_KEY);
}
