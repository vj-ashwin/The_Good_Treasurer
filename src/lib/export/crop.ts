/**
 * Cropping math for the "visible area" PNG export.
 *
 * `html-to-image` can only capture a DOM node from its own top edge. To export
 * just what the organiser can currently see, we need the band of the node that
 * overlaps the viewport, expressed as an offset from the node's top plus a
 * height. Pure arithmetic, so the edge cases are unit-tested rather than
 * discovered by producing a blank PNG.
 */

export interface CropBand {
  /** Pixels to shift the captured content up before clipping. */
  offsetY: number
  /** Height of the band to capture. */
  height: number
}

export interface CropInput {
  /** The node's top edge in page coordinates (rect.top + window.scrollY). */
  nodeTopPage: number
  /** The node's full rendered height. */
  nodeHeight: number
  /** window.scrollY. */
  scrollY: number
  /** window.innerHeight. */
  viewportHeight: number
}

/**
 * The part of `[nodeTopPage, nodeTopPage + nodeHeight)` that is on screen.
 *
 * Falls back to the whole node when the viewport is unknown or the node is not
 * visible at all. Exporting the full report is a useful result; exporting an
 * empty image is not.
 */
export function visibleBand({ nodeTopPage, nodeHeight, scrollY, viewportHeight }: CropInput): CropBand {
  if (!Number.isFinite(nodeHeight) || nodeHeight <= 0) {
    return { offsetY: 0, height: 0 }
  }
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return { offsetY: 0, height: nodeHeight }
  }

  const top = Math.max(scrollY - nodeTopPage, 0)
  const bottom = Math.min(scrollY + viewportHeight - nodeTopPage, nodeHeight)

  if (bottom <= top) {
    // Fully off screen: the full report is more useful than nothing.
    return { offsetY: 0, height: nodeHeight }
  }

  return { offsetY: top, height: bottom - top }
}
