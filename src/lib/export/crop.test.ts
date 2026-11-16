import { describe, expect, it } from 'vitest'
import { visibleBand } from './crop'

describe('visibleBand', () => {
  it('captures the viewport when the node starts at the top of the screen', () => {
    expect(
      visibleBand({ nodeTopPage: 100, nodeHeight: 4_000, scrollY: 100, viewportHeight: 800 }),
    ).toEqual({ offsetY: 0, height: 800 })
  })

  it('offsets by the scroll distance into the node', () => {
    // Scrolled 500px past the node's top.
    expect(
      visibleBand({ nodeTopPage: 100, nodeHeight: 4_000, scrollY: 600, viewportHeight: 800 }),
    ).toEqual({ offsetY: 500, height: 800 })
  })

  it('captures only what is left when the viewport runs past the node bottom', () => {
    expect(
      visibleBand({ nodeTopPage: 100, nodeHeight: 1_000, scrollY: 600, viewportHeight: 800 }),
    ).toEqual({ offsetY: 500, height: 500 })
  })

  it('captures the whole node when it fits on screen', () => {
    expect(
      visibleBand({ nodeTopPage: 300, nodeHeight: 400, scrollY: 200, viewportHeight: 800 }),
    ).toEqual({ offsetY: 0, height: 400 })
  })

  it('falls back to the whole node when it is below the viewport', () => {
    expect(
      visibleBand({ nodeTopPage: 2_000, nodeHeight: 900, scrollY: 0, viewportHeight: 800 }),
    ).toEqual({ offsetY: 0, height: 900 })
  })

  it('falls back to the whole node when it is scrolled past', () => {
    expect(
      visibleBand({ nodeTopPage: 0, nodeHeight: 500, scrollY: 2_000, viewportHeight: 800 }),
    ).toEqual({ offsetY: 0, height: 500 })
  })

  it('treats an unknown viewport as "capture everything"', () => {
    expect(
      visibleBand({ nodeTopPage: 100, nodeHeight: 4_000, scrollY: 0, viewportHeight: 0 }),
    ).toEqual({ offsetY: 0, height: 4_000 })
  })

  it('reports an empty band for a node with no height', () => {
    expect(
      visibleBand({ nodeTopPage: 100, nodeHeight: 0, scrollY: 100, viewportHeight: 800 }),
    ).toEqual({ offsetY: 0, height: 0 })
  })
})
