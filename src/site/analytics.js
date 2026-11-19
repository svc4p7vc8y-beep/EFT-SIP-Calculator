export const METRIKA_ID = 114361880;

export function trackLeadSubmission() {
  if (typeof window !== 'undefined' && typeof window.ym === 'function') {
    window.ym(METRIKA_ID, 'reachGoal', 'lead_submit');
  }
}
