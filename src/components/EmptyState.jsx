export default function EmptyState({ icon = '🪴', text = '空空如也', children }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-text">{text}</div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
