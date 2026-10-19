import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import TabBar from './components/TabBar.jsx'
import ToastHost from './components/ToastHost.jsx'
import ConfettiFx from './components/ConfettiFx.jsx'
import ImportBanner from './components/ImportBanner.jsx'
import Today from './pages/Today.jsx'
import Library from './pages/Library.jsx'
import AddCourse from './pages/AddCourse.jsx'
import CourseDetail from './pages/CourseDetail.jsx'
import Notes from './pages/Notes.jsx'
import Review from './pages/Review.jsx'
import Settings from './pages/Settings.jsx'
import { useProfile } from './store/profile.js'

export default function App() {
  const load = useProfile((s) => s.load)
  const loaded = useProfile((s) => s.loaded)

  useEffect(() => { load() }, [load])

  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--c-text-muted)' }}>
        加载中…
      </div>
    )
  }

  return (
    <>
      <div className="app">
        <ImportBanner />
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/today" element={<Today />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/new" element={<AddCourse />} />
          <Route path="/course/:id" element={<CourseDetail />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/review" element={<Review />} />
          <Route path="/me" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <TabBar />
      <ToastHost />
      <ConfettiFx />
    </>
  )
}
