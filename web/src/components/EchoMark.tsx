/**
 * The Echo wing.
 *
 * The source art is a white silhouette on transparency, which can only ever
 * be white — so it is used as a CSS MASK rather than as an image. The element
 * is a coloured box and the wing decides which parts of it show, which means
 * one file tints to any division's accent with no per-colour asset and no
 * filter hacks.
 *
 * `half` clips it. The two wings meet at 70% of the mark's height (measured
 * off the art: the thinnest row of the middle band), so the top wing is the
 * first 70% and the lower wing the last 30%. The welcome animation flies them
 * in separately.
 */

/** Intrinsic aspect of the trimmed art, 428 x 339. */
const RATIO = 428 / 339

/** Where the upper wing ends and the lower one begins. */
export const SPLIT = 0.7

const src = `${import.meta.env.BASE_URL}brand/echo-mark.png`

export default function EchoMark({
  color = 'currentColor',
  height = 20,
  half,
  className = '',
  style,
  title,
}: {
  color?: string
  /** Height in px; width follows the artwork's aspect. */
  height?: number
  half?: 'top' | 'bottom'
  className?: string
  style?: React.CSSProperties
  title?: string
}) {
  const mask = `url("${src}") center / contain no-repeat`
  // Clipping the box would crop the mask's scaling too, so the box keeps its
  // full size and inset() hides the part that belongs to the other wing.
  const clip =
    half === 'top'
      ? `inset(0 0 ${(1 - SPLIT) * 100}% 0)`
      : half === 'bottom'
        ? `inset(${SPLIT * 100}% 0 0 0)`
        : undefined

  return (
    <span
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`echo-mark ${className}`}
      style={{
        height,
        width: height * RATIO,
        backgroundColor: color,
        WebkitMask: mask,
        mask,
        clipPath: clip,
        ...style,
      }}
    />
  )
}
