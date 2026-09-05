export default function Logomark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill="#5B2EE5" />
      <path d="M78 12 L92 30 L26 72 Z" fill="#fff" />
      <path d="M38 78 L54 78 L22 98 Z" fill="#fff" />
    </svg>
  )
}
