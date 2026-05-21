// ─── DateJumpControl.tsx ──────────────────────────────────────────────────
// Date picker control that pans the amCharts date axis to a specific date.
// Ported from thirdPrj/src/components/DateJumpControl.jsx

import { Calendar } from 'lucide-react'
import { useState } from 'react'

interface DateJumpControlProps {
  onJump: (targetMs: number) => void
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function DateJumpControl({ onJump }: DateJumpControlProps) {
  const [date, setDate] = useState(todayStr())

  const handleGo = () => {
    const d = new Date(date)
    d.setHours(9, 15, 0, 0)   // 9:15 AM start of session
    if (!isNaN(d.getTime())) onJump(d.getTime())
  }

  const handleToday = () => {
    const t = todayStr()
    setDate(t)
    const d = new Date(t)
    d.setHours(9, 15, 0, 0)
    onJump(d.getTime())
  }

  return (
    <div className="onc-date-jump">
      <Calendar size={13} className="onc-date-jump__icon" />
      <input
        id="date-jump-input"
        type="date"
        className="onc-date-jump__input"
        value={date}
        onChange={e => setDate(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleGo() }}
      />
      <button
        id="date-jump-go-btn"
        className="onc-date-jump__btn onc-date-jump__btn--go"
        onClick={handleGo}
      >
        Go
      </button>
      <button
        id="date-jump-today-btn"
        className="onc-date-jump__btn onc-date-jump__btn--today"
        onClick={handleToday}
      >
        Today
      </button>
    </div>
  )
}
