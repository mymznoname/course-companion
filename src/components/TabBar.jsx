import { Link, useLocation, matchPath } from 'react-router-dom'

const TABS = [
  { to: '/', label: '今天', icon: '⦿' },
  { to: '/library', label: '课库', icon: '☰' },
  { to: '/notes', label: '笔记', icon: '✎' },
  { to: '/me', label: '我', icon: '◉' }
]

export default function TabBar() {
  return (
    <nav className="tab-bar">
      {TABS.map(t => (
        <TabLink key={t.to} {...t} />
      ))}
    </nav>
  )
}

function TabLink({ to, label, icon }) {
  const location = useLocation()
  const active = to === '/'
    ? location.pathname === '/'
    : !!matchPath({ path: to, end: false }, location.pathname)
  return (
    <Link to={to} className={`tab-item ${active ? 'active' : ''}`}>
      <div className="tab-icon">{icon}</div>
      <div>{label}</div>
    </Link>
  )
}
