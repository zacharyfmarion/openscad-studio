export function shouldCaptureBootstrapAnalytics(
  posthogReady: boolean,
  analyticsEnabled: boolean
): boolean {
  return posthogReady && analyticsEnabled;
}
