'use client'
import { Button } from '@iubenda/lumen-next'
import { useDash } from '@/store/store'
import { color } from '@/theme'

const SPEEDS = [1, 10, 60] as const

/** Demo controls: the only controls on the page. Hidden for real sources and with the toggle. */
export function DevBar() {
  const demo = useDash((s) => s.demo)
  const hidden = useDash((s) => s.devBarHidden)
  const toggle = useDash((s) => s.toggleDevBar)
  const command = useDash((s) => s.command)
  if (!demo) return null
  const box = { position: 'fixed', right: 12, bottom: 12, zIndex: 10 } as const
  if (hidden)
    return (
      <div style={box}>
        <Button variant="ghost" size="xs" onClick={toggle} label="Show demo controls">
          Demo
        </Button>
      </div>
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
        ...box,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '8px 12px',
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 16,
        boxShadow: 'var(--lumen-shadow-lg)',
      }}
    >
      <strong>Demo</strong>
      <span className="sh-num" title="Time on the scripted 3-minute demo (10× timeline)">
        {`${mm}:${ss}`}
      </span>
      {SPEEDS.map((v) => (
        <Button
          key={v}
          // Lumen's Button has no aria-pressed prop; set it on the element.
          ref={(el) => el?.setAttribute('aria-pressed', String(demo.speed === v))}
          variant={demo.speed === v ? 'primary' : 'secondary'}
          size="xs"
          onClick={() => void command({ action: 'speed', value: v })}
        >
          {`${v}×`}
        </Button>
      ))}
      <Button
        variant="secondary"
        size="xs"
        onClick={() => void command({ action: demo.running ? 'pause' : 'resume' })}
      >
        {demo.running ? 'Pause' : 'Resume'}
      </Button>
      <Button variant="secondary" size="xs" onClick={() => void command({ action: 'restart' })}>
        Restart
      </Button>
      <span className="sh-muted">seed {demo.seed}</span>
      <Button variant="ghost" size="xs" onClick={toggle} label="Hide demo controls">
        Hide
      </Button>
    </div>
  )
}
