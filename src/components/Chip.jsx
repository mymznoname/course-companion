export default function Chip({ children, kind = 'default', className = '' }) {
  return <span className={`chip chip-${kind} ${className}`}>{children}</span>
}
