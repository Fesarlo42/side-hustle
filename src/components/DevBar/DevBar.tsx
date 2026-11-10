'use client'
import { useDash } from '@/store/store'
import { color } from '@/theme'

/** Demo controls. The only controls on the page; hidden with the toggle. */
export function DevBar() {
  const demo = useDash((s) => s.demo)
  const hidden = useDash((s) => s.devBarHidden)
  const toggle = useDash((s) => s.toggleDevBar)
  const command = useDash((s) => s.command)
  if (!demo) return null
  if (hidden)
    return (
      <button
        onClick={toggle}
        style={{ position: 'fixed', right: 8, bottom: 8, fontSize: 12, opacity: 0.6 }}
        aria-label="Show demo controls"
      >
        Demo
      </button>
    )
  const mm = Math.floor(demo.demoSeconds / 60)
  const ss = Math.floor(demo.demoSeconds % 60)
    .toString()
    .padStart(2, '0')
  return (
    <div
      role="toolbar"
      aria-label="Demo controls"
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '6px 10px',
        fontSize: 14,
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 8,
      }}
    >
      <strong>Demo</strong>
      <span aria-label="Demo time">{`${mm}:${ss}`} (10× timeline)</span>
      {([1, 10, 60] as const).map((v) => (
        <button
          key={v}
          aria-pressed={demo.speed === v}
          onClick={() => void command({ action: 'speed', value: v })}
          style={{ fontWeight: demo.speed === v ? 700 : 400 }}
        >
          {v}×
        </button>
      ))}
      <button onClick={() => void command({ action: demo.running ? 'pause' : 'resume' })}>
        {demo.running ? 'Pause' : 'Resume'}
      </button>
      <button onClick={() => void command({ action: 'restart' })}>Restart</button>
      <span>seed {demo.seed}</span>
      <button onClick={toggle} aria-label="Hide demo controls">
        Hide
      </button>
    </div>
  )
}
