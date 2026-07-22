import { describe, expect, it } from 'vitest'
import { computeVirtualWindow, shouldVirtualize } from './virtualWindow'

describe('computeVirtualWindow', () => {
  it('returns an empty window for empty lists', () => {
    expect(computeVirtualWindow({
      itemCount: 0,
      itemHeight: 21,
      scrollTop: 0,
      viewportHeight: 400,
    })).toEqual({ start: 0, end: 0, offsetTop: 0, totalHeight: 0 })
  })

  it('windows a long list with overscan', () => {
    const window = computeVirtualWindow({
      itemCount: 1_000,
      itemHeight: 20,
      scrollTop: 400,
      viewportHeight: 200,
      overscan: 5,
    })
    // floor(400/20)=20, start=15; visible=10+10=20 → end=35
    expect(window.start).toBe(15)
    expect(window.end).toBe(35)
    expect(window.offsetTop).toBe(300)
    expect(window.totalHeight).toBe(20_000)
  })

  it('clamps to the end of the list', () => {
    const window = computeVirtualWindow({
      itemCount: 12,
      itemHeight: 10,
      scrollTop: 100,
      viewportHeight: 50,
      overscan: 2,
    })
    expect(window.end).toBe(12)
    expect(window.start).toBeLessThan(window.end)
  })

  it('shouldVirtualize uses a threshold', () => {
    expect(shouldVirtualize(79, 80)).toBe(false)
    expect(shouldVirtualize(80, 80)).toBe(true)
  })
})
