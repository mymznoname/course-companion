import { useFeedbackFx } from '../utils/feedback.js'

export default function ToastHost() {
  const toasts = useFeedbackFx((s) => s.toasts)
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className="toast">{t.text}</div>
      ))}
    </div>
  )
}
