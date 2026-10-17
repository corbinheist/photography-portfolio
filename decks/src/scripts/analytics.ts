/**
 * Starts umami-kit (scroll depth and time-on-page heartbeat) on a deck.
 * The Umami page-view script loads from BaseLayout.
 */
export {};

declare global {
  interface Window {
    UmamiTracker?: new (opts: Record<string, unknown>) => { destroy: () => void };
  }
}

function initUmamiKit() {
  if (!window.UmamiTracker) return;
  new window.UmamiTracker({
    scrollDepthThresholds: [25, 50, 75, 100],
    heartbeatInterval: 30000,
    autoTrackClicks: false,
  });
}

// umami-kit.js loads with `defer` and runs before module scripts, but wait
// for the load event if it is not ready yet.
if (window.UmamiTracker) initUmamiKit();
else window.addEventListener('load', initUmamiKit, { once: true });
