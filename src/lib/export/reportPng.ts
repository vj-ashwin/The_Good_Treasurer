/**
 * PNG export of the on-screen report.
 *
 * Captures a DOM node with `html-to-image`, so the image is exactly what the
 * organiser sees. Loaded on demand from the Report panel.
 *
 * Two things are handled here that a naive `toBlob(node)` gets wrong:
 *
 * - A long report becomes one extremely tall canvas, and browsers refuse to
 *   allocate past a certain size. The pixel ratio is scaled down so the output
 *   stays within that limit instead of failing with a blank image.
 * - "Visible area" exports crop to the part of the report currently on screen,
 *   which is usually the part worth sharing. `visibleBand` does the arithmetic.
 */

import { toBlob } from 'html-to-image'
import { visibleBand } from './crop'
import type { PngScope } from './shared'

const EXPORT_IGNORE = 'exportIgnore'

/** Browsers cap canvas dimensions well below this; 16384 is the safe common floor. */
const MAX_OUTPUT_EDGE = 16_384

/** Renders one DOM node to a PNG blob. */
export async function buildReportPng(
  node: HTMLElement,
  scope: PngScope = 'full',
): Promise<Blob> {
  const rect = node.getBoundingClientRect()
  const width = Math.ceil(rect.width)
  const fullHeight = Math.ceil(rect.height)

  let height = fullHeight
  let offsetY = 0
  if (scope === 'visible') {
    const band = visibleBand({
      nodeTopPage: rect.top + window.scrollY,
      nodeHeight: fullHeight,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
    })
    height = Math.ceil(band.height)
    offsetY = band.offsetY
  }

  // Scale down rather than overflow: 1× on a huge report still beats a blank
  // image. Small reports keep the crisp 2× capture.
  const pixelRatio = Math.min(2, MAX_OUTPUT_EDGE / Math.max(height, 1))

  const blob = await toBlob(node, {
    backgroundColor: '#ffffff',
    width,
    height,
    pixelRatio,
    cacheBust: true,
    style: offsetY > 0 ? { transform: `translateY(-${String(offsetY)}px)` } : undefined,
    filter: (child) =>
      !(child instanceof HTMLElement && child.dataset[EXPORT_IGNORE] === 'true'),
  })

  if (!blob) {
    throw new Error('The browser could not render the report image. Try the PDF instead.')
  }
  return blob
}
