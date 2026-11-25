/**
 * iOS Safari ignores user-scalable=no (an accessibility choice by Apple), so pinch and double-tap zoom are stopped
 * here as well. Two-finger gestures on the page are cancelled; single-finger scrolling of lists is untouched.
 */
export function lockViewport(): void {
  if (typeof document === 'undefined') return;
  const stop = (event: Event) => event.preventDefault();
  /* Safari's pinch events. */
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });
  /* Any browser: a second finger on the screen means a pinch. */
  document.addEventListener(
    'touchmove',
    (event) => {
      if ((event as TouchEvent).touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );
  /* Double-tap zoom is stopped by touch-action: manipulation in index.css (cancelling the second tap here would
     also swallow fast taps on the PIN pad and quantity buttons). */
}
