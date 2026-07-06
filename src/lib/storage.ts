// Storage utilities - Tour completed tracking only
// All other data is now stored in Supabase

const KEYS = {
  TOUR_COMPLETED: 'vulnerix_tour_completed',
  CERTIN_TOGGLE: 'vulnerix_certin_toggle'
};

// Tour completed
export const hasTourCompleted = (): boolean => {
  return localStorage.getItem(KEYS.TOUR_COMPLETED) === 'true';
};

export const setTourCompleted = (): void => {
  localStorage.setItem(KEYS.TOUR_COMPLETED, 'true');
};

// CERT-In toggle preference
export const getCertInToggle = (): boolean => {
  const stored = localStorage.getItem(KEYS.CERTIN_TOGGLE);
  return stored !== 'false'; // Default to true
};

export const setCertInToggle = (enabled: boolean): void => {
  localStorage.setItem(KEYS.CERTIN_TOGGLE, String(enabled));
};
