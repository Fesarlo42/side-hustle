'use client'
/** Dev page: drive the core's inputs by hand to tune it. Not linked from the dashboard. */
import { Button, Card, Segment, Segmented, Text, Toggle } from '@iubenda/lumen-next'
import { useMemo, useState } from 'react'
import { Core, type CoreMember } from '@/components/Core/Core'
import { color } from '@/theme'
import type { Health } from '@/types'

const NAMES = [
  'Ana Silva',
  'Rita Ferreira',
  'Rui Carvalho',
  'João Pereira',
  'Bruno Costa',
  'Carla Nunes',
  'Diogo Lopes',
  'Helena Matos',
  'Miguel Sousa',
  'Marta Ribeiro',
  'Leo Martins',
  'Sofia Almeida',
  'Tiago Mendes',
  'Inês Rocha',
  'Pedro Santos',
]

function Slider(p: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}) {
  const id = `s-${p.label}`
  return (
    <label htmlFor={id} style={{ display: 'grid', gap: 4 }}>
      <span>
        {p.label}:{' '}
        <strong>
          {p.value}
          {p.unit ?? ''}
        </strong>
      </span>
      <input
        id={id}
        type="range"
        min={p.min}
        max={p.max}
        step={p.step ?? 1}
        value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))}
        style={{ accentColor: color.action }}
      />
    </label>
  )
}

export default function CoreDevPage() {
  const [hbpm, setHbpm] = useState(9)
  const [left, setLeft] = useState(57)
  const [health, setHealth] = useState<Health>('calm')
  const [count, setCount] = useState(15)
  const [owners, setOwners] = useState(4)
  const [particles, setParticles] = useState(3)
  const [ripple, setRipple] = useState(0)
  const [wobble, setWobble] = useState(false)
  const [faded, setFaded] = useState(false)
  const [offline, setOffline] = useState(1)
  const [reduced, setReduced] = useState(false)

  const members: CoreMember[] = useMemo(
    () =>
      NAMES.slice(0, count).map((name, i) => ({
        id: `m${i}`,
        name,
        // The last `owners` people are owners with work in progress (inner ring).
        ring: i >= count - owners ? 'inner' : i === 10 ? 'none' : 'outer',
        offline: i >= 1 && i <= offline,
        faded: faded && i === 4,
      })),
    [count, owners, offline, faded],
  )
  const flows = useMemo(() => {
    const pickers = members.filter((m) => m.ring === 'outer' && !m.offline)
    const ownersList = members.filter((m) => m.ring === 'inner')
    if (pickers.length === 0 || ownersList.length === 0) return []
    return Array.from({ length: particles }, (_, i) => ({
      taskId: `t${i}`,
      from: pickers[i % pickers.length]!.id,
      to: ownersList[i % ownersList.length]!.id,
    }))
  }, [members, particles])

  const label = `${health[0]!.toUpperCase()}${health.slice(1)} · ${particles} tasks · pool ${left}%`

  return (
    <main
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 380px) 1fr',
        gap: 24,
        padding: 24,
        minHeight: '100vh',
      }}
    >
      <Card heading="Core inputs">
        <div style={{ display: 'grid', gap: 16 }}>
          <Slider label="Heartbeats per minute" value={hbpm} min={0} max={40} onChange={setHbpm} />
          <Slider label="Pledge left" value={left} min={0} max={100} unit="%" onChange={setLeft} />
          <Segmented
            label="Health"
            value={health}
            onChange={({ value }) => setHealth(value as Health)}
          >
            <Segment value="calm">Calm</Segment>
            <Segment value="strained">Strained</Segment>
            <Segment value="critical">Critical</Segment>
          </Segmented>
          <Slider label="Members" value={count} min={0} max={15} onChange={setCount} />
          <Slider
            label="Owners with work in progress"
            value={owners}
            min={0}
            max={Math.min(6, count)}
            onChange={setOwners}
          />
          <Slider label="Offline members" value={offline} min={0} max={3} onChange={setOffline} />
          <Slider
            label="Tasks in Doing (particles)"
            value={particles}
            min={0}
            max={12}
            onChange={setParticles}
          />
          <Toggle
            label="Membrane wobble (needs attention)"
            checked={wobble}
            onChange={({ checked }) => setWobble(checked)}
          />
          <Toggle
            label="Faded dot (orphaned task)"
            checked={faded}
            onChange={({ checked }) => setFaded(checked)}
          />
          <Toggle
            label="Reduced motion"
            checked={reduced}
            onChange={({ checked }) => setReduced(checked)}
          />
          <Button variant="secondary" onClick={() => setRipple((r) => r + 1)}>
            Ripple
          </Button>
          <Text color="secondary">
            At 30 heartbeats/min the pulse is at its fastest (about one beat per second).
          </Text>
        </div>
      </Card>
      <section
        style={{
          display: 'grid',
          placeItems: 'center',
          background: color.surface,
          borderRadius: 16,
          border: `1px solid ${color.border}`,
        }}
      >
        <div style={{ width: 'min(100%, 520px)' }}>
          <Core
            heartbeatsPerMin={hbpm}
            poolLeft={left / 100}
            health={health}
            members={members}
            flows={flows}
            rippleSeq={ripple}
            wobble={wobble}
            reducedMotion={reduced}
            label={label}
          />
        </div>
      </section>
    </main>
  )
}
