import { describe, expect, it } from 'vitest'
import {
  shouldAutoCloseReview,
  shouldDefaultReviewOpen,
  REVIEW_AUTO_CLOSE_MAX_PX,
} from './layoutBreakpoints'

describe('layoutBreakpoints', () => {
  it('defaults review open only on wide viewports', () => {
    expect(shouldDefaultReviewOpen(REVIEW_AUTO_CLOSE_MAX_PX)).toBe(true)
    expect(shouldDefaultReviewOpen(REVIEW_AUTO_CLOSE_MAX_PX - 1)).toBe(false)
    expect(shouldAutoCloseReview(900)).toBe(true)
    expect(shouldAutoCloseReview(1_400)).toBe(false)
  })
})
