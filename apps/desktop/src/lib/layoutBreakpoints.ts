/** Viewport breakpoints for the three-pane desktop shell. */

/** Below this width, review pane auto-closes unless the user forced it open. */
export const REVIEW_AUTO_CLOSE_MAX_PX = 1_200

/** Below this width, CSS uses a compact sidebar. */
export const SIDEBAR_COMPACT_MAX_PX = 980

/** Absolute minimum shell width (CSS body min-width). */
export const APP_MIN_WIDTH_PX = 720

export function shouldDefaultReviewOpen(width: number): boolean {
  return width >= REVIEW_AUTO_CLOSE_MAX_PX
}

export function shouldAutoCloseReview(width: number): boolean {
  return width < REVIEW_AUTO_CLOSE_MAX_PX
}
