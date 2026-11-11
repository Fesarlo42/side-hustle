'use client'
/**
 * The core: an abstract, techy cell. A chart that happens to breathe.
 *
 * Every visual maps to a number (spec: "The core"):
 * - pulse rate      ← heartbeats per minute (smoothed: never jitters)
 * - nucleus size    ← share of all pledges still free
 * - tint and pulse  ← health (calm / strained / critical)
 * - orbiting dots   ← members: outer ring = pledge left, inner ring = owner with work in progress
 * - particles       ← pledge being used: picker → core → owner, per task in Doing
 * - ripple          ← rippleSeq changes (Done, joined, pledge answered, insight resolved)
 * - wobble          ← an open "needs attention" insight
 * - faded dot       ← that member's task is orphaned
 */
import { useEffect, useId, useRef, useState } from 'react'
import { breath, motion } from '@/motion'
import { color, healthTint } from '@/theme'
import type { Health } from '@/types'

export interface CoreMember {
  id: string
  name: string
  /** Shown in the dot instead of initials when present. */
  avatarUrl?: string
  ring: 'outer' | 'inner' | 'none'
  offline: boolean
  faded: boolean
}

export interface CoreFlow {
  taskId: string
  from: string
  to: string
}

export interface CoreProps {
  heartbeatsPerMin: number
  /** 0–1 share of all pledges still free. */
  poolLeft: number
  health: Health
  members: CoreMember[]
  flows: CoreFlow[]
  rippleSeq: number
  wobble: boolean
  reducedMotion: boolean
  /** Text alternative, also shown under the core in reduced motion. */
  label: string
  selectedMemberId?: string
  /** Heartbeats per minute that count as "peak" (fastest pulse). */
  busyHeartbeatsPerMin?: number
}

const VIEW = 246
const MEMBRANE_R = 108
const INNER_RING = 152
const OUTER_RING = 208
const DOT_R = 24
const MAX_PARTICLES = 60
const PARTICLE_EVERY_S = 1.4
const PARTICLE_LIFE_S = 2.4
const RIPPLE_LIFE_S = motion.slow.duration * 2
const ORBIT_RAD_PER_S = 0.025

const HEALTH_WORD: Record<Health, string> = {
  calm: 'Calm',
  strained: 'Strained',
  critical: 'Critical',
}

interface DotState {
  r: number
  a: number
  opacity: number
}
interface Particle {
  id: number
  from: string
  to: string
  age: number
}
interface Ripple {
  id: number
  age: number
}

/** Round SVG numbers so server and client render the same markup. */
const r2 = (n: number) => Math.round(n * 100) / 100
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
  ).toUpperCase()
}

/** Pulse shape per health state, 0–1 over one cycle. */
export function beat(phase: number, health: Health): number {
  const p = phase - Math.floor(phase)
  if (health === 'calm') return 0.5 - 0.5 * Math.cos(2 * Math.PI * p)
  if (health === 'strained') return Math.sin(Math.PI * p) ** 4
  // Critical: a double beat (strong, then a weaker echo).
  const a = Math.exp(-(((p - 0.18) / 0.07) ** 2))
  const b = 0.55 * Math.exp(-(((p - 0.42) / 0.06) ** 2))
  return Math.min(1, a + b)
}

/** Seconds per cycle from activity and health. */
export function targetPeriod(heartbeatsPerMin: number, health: Health, busy = 30): number {
  const k = clamp(heartbeatsPerMin / busy)
  const base = lerp(breath.idle, breath.busy, k)
  const factor = health === 'calm' ? 1 : health === 'strained' ? 0.85 : 0.75
  return Math.max(breath.busy * 0.75, base * factor)
}

function ringRadius(ring: CoreMember['ring']): number {
  return ring === 'inner' ? INNER_RING : OUTER_RING
}

/** Even slots per ring, in a stable order. */
function layout(members: CoreMember[]): Map<string, { r: number; a: number }> {
  const out = new Map<string, { r: number; a: number }>()
  const inner = members.filter((m) => m.ring === 'inner')
  const outer = members.filter((m) => m.ring !== 'inner')
  inner.forEach((m, i) =>
    out.set(m.id, { r: INNER_RING, a: (i / Math.max(1, inner.length)) * 2 * Math.PI + 0.35 }),
  )
  outer.forEach((m, i) =>
    out.set(m.id, {
      r: ringRadius(m.ring),
      a: (i / Math.max(1, outer.length)) * 2 * Math.PI - Math.PI / 2,
    }),
  )
  return out
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return d
}

function membranePath(r: number, wobble: number, t: number, phase: number): string {
  const n = 72
  let d = ''
  for (let i = 0; i < n; i++) {
    const th = (i / n) * 2 * Math.PI
    // A faint organic edge always; a clearly irregular one while wobbling.
    const organic = 0.006 * Math.sin(4 * th + phase * 2 * Math.PI)
    const irregular =
      wobble *
      (0.05 * Math.sin(3 * th + t * 1.7) +
        0.035 * Math.sin(5 * th - t * 1.1) +
        0.025 * Math.sin(9 * th + t * 2.9))
    const rr = r * (1 + organic + irregular)
    const x = rr * Math.cos(th)
    const y = rr * Math.sin(th)
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return `${d}Z`
}

interface DotView {
  x: number
  y: number
  opacity: number
}

/** Everything the SVG needs for one frame. */
interface View {
  beat: number
  nucleusLeft: number
  wobble: number
  t: number
  phase: number
  dots: Record<string, DotView>
  particles: {
    id: number
    x: number
    y: number
    opacity: number
    trail: { x: number; y: number }[]
  }[]
  ripples: { id: number; k: number }[]
}

const goalOpacity = (m: CoreMember) =>
  m.faded ? 0.3 : m.offline ? 0.55 : m.ring === 'none' ? 0.7 : 1

function staticView(p: CoreProps): View {
  const slots = layout(p.members)
  const dots: Record<string, DotView> = {}
  for (const m of p.members) {
    const slot = slots.get(m.id)
    if (slot)
      dots[m.id] = {
        x: slot.r * Math.cos(slot.a),
        y: slot.r * Math.sin(slot.a),
        opacity: goalOpacity(m),
      }
  }
  return {
    beat: 0.5,
    nucleusLeft: p.poolLeft,
    wobble: p.wobble ? 0.6 : 0,
    t: 0,
    phase: 0,
    dots,
    particles: [],
    ripples: [],
  }
}

export interface Sim {
  t: number
  phase: number
  period: number
  wobble: number
  nucleus: number
  dots: Map<string, DotState>
  particles: Particle[]
  nextSpawn: Map<string, number>
  ripples: Ripple[]
  seq: number
}

/** Fresh animation state for a core. */
export function newSim(p: CoreProps): Sim {
  return {
    t: 0,
    phase: 0,
    period: targetPeriod(p.heartbeatsPerMin, p.health, p.busyHeartbeatsPerMin),
    wobble: p.wobble ? 1 : 0,
    nucleus: p.poolLeft,
    dots: new Map(),
    particles: [],
    nextSpawn: new Map(),
    ripples: [],
    seq: 0,
  }
}

/** One animation step. Pure apart from mutating `s`; exported for tests. */
export function stepSim(s: Sim, p: CoreProps, dt: number): View {
  s.t += dt
  // Smooth the rate so the pulse never jumps.
  const target = targetPeriod(p.heartbeatsPerMin, p.health, p.busyHeartbeatsPerMin ?? 30)
  s.period += (target - s.period) * clamp(dt / 2)
  s.phase += dt / s.period
  s.wobble += ((p.wobble ? 1 : 0) - s.wobble) * clamp(dt / motion.slow.duration)
  s.nucleus += (p.poolLeft - s.nucleus) * clamp(dt / 0.8)

  // Dots glide to their slot and orbit slowly.
  const slots = layout(p.members)
  const k = clamp(dt / motion.slow.duration)
  for (const m of p.members) {
    const slot = slots.get(m.id)
    if (!slot) continue
    const goal = goalOpacity(m)
    const d = s.dots.get(m.id) ?? { r: slot.r, a: slot.a, opacity: goal }
    d.r += (slot.r - d.r) * k
    d.a += shortestAngle(d.a, slot.a + s.t * ORBIT_RAD_PER_S) * k
    d.opacity += (goal - d.opacity) * k
    s.dots.set(m.id, d)
  }
  for (const id of [...s.dots.keys()]) if (!slots.has(id)) s.dots.delete(id)

  // Particles: one every PARTICLE_EVERY_S per task in Doing.
  const active = new Set(p.flows.map((f) => f.taskId))
  for (const f of p.flows) {
    const next = s.nextSpawn.get(f.taskId)
    if (next === undefined) s.nextSpawn.set(f.taskId, s.t + Math.random() * PARTICLE_EVERY_S)
    else if (s.t >= next && s.particles.length < MAX_PARTICLES) {
      s.particles.push({ id: ++s.seq, from: f.from, to: f.to, age: 0 })
      s.nextSpawn.set(f.taskId, s.t + PARTICLE_EVERY_S)
    }
  }
  for (const id of [...s.nextSpawn.keys()]) if (!active.has(id)) s.nextSpawn.delete(id)
  s.particles = s.particles.filter((pt) => (pt.age += dt) < PARTICLE_LIFE_S)
  s.ripples = s.ripples.filter((r) => (r.age += dt) < RIPPLE_LIFE_S)

  const dots: Record<string, DotView> = {}
  for (const [id, d] of s.dots)
    dots[id] = { x: d.r * Math.cos(d.a), y: d.r * Math.sin(d.a), opacity: d.opacity }
  const particles: View['particles'] = []
  for (const pt of s.particles) {
    const a = dots[pt.from]
    const z = dots[pt.to]
    if (!a || !z) continue
    // Picker → centre → owner; the trail is the same path a moment earlier.
    const at = (k: number) => {
      const kk = clamp(k)
      const seg = kk < 0.5 ? easeInOut(kk * 2) : easeInOut((kk - 0.5) * 2)
      return {
        x: kk < 0.5 ? lerp(a.x, 0, seg) : lerp(0, z.x, seg),
        y: kk < 0.5 ? lerp(a.y, 0, seg) : lerp(0, z.y, seg),
      }
    }
    const kk = pt.age / PARTICLE_LIFE_S
    particles.push({
      id: pt.id,
      ...at(kk),
      opacity: 0.9 * Math.min(1, kk * 6, (1 - kk) * 6),
      trail: [at(kk - 0.02), at(kk - 0.04), at(kk - 0.06)],
    })
  }
  return {
    beat: beat(s.phase, p.health),
    nucleusLeft: s.nucleus,
    wobble: s.wobble,
    t: s.t,
    phase: s.phase,
    dots,
    particles,
    ripples: s.ripples.map((r) => ({ id: r.id, k: r.age / RIPPLE_LIFE_S })),
  }
}

export function Core(props: CoreProps) {
  const { health, members, rippleSeq, reducedMotion, label, selectedMemberId } = props
  const tint = healthTint[health]
  const [view, setView] = useState<View | null>(null)

  // Animation state lives in refs and is only touched from effects.
  const sim = useRef<Sim>(newSim(props))

  const inputs = useRef(props)
  useEffect(() => {
    inputs.current = props
  })

  // Ripple whenever rippleSeq changes (not on first render).
  const lastSeq = useRef(rippleSeq)
  useEffect(() => {
    if (rippleSeq === lastSeq.current) return
    lastSeq.current = rippleSeq
    if (!reducedMotion) sim.current.ripples.push({ id: ++sim.current.seq, age: 0 })
  }, [rippleSeq, reducedMotion])

  useEffect(() => {
    if (reducedMotion) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      setView(stepSim(sim.current, inputs.current, dt))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion])

  const uid = useId().replace(/:/g, '')
  const v = reducedMotion || !view ? staticView(props) : view
  const membraneR = MEMBRANE_R * (1 + 0.04 * v.beat)
  const nucleusR = (24 + 48 * clamp(v.nucleusLeft)) * (1 + 0.05 * v.beat)

  return (
    <figure style={{ margin: 0, display: 'grid', justifyItems: 'center', gap: 8 }}>
      <svg
        viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
        role="img"
        aria-label={label}
        style={{ width: '100%', maxWidth: 460, height: 'auto', overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="core-nucleus">
            <stop offset="0%" stopColor={tint.fill} stopOpacity={0.95} />
            <stop offset="100%" stopColor={tint.fill} stopOpacity={0.55} />
          </radialGradient>
          {/* Each member group is translated, so one clip at the origin fits every photo. */}
          <clipPath id={`${uid}-face`}>
            <circle r={DOT_R - 2} />
          </clipPath>
          <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={4} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`${uid}-grey`}>
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>

        {/* Orbit guides */}
        <circle r={INNER_RING} fill="none" stroke={color.borderSubtle} strokeDasharray="2 6" />
        <circle r={OUTER_RING} fill="none" stroke={color.borderSubtle} strokeDasharray="2 6" />

        {/* Ripples */}
        {v.ripples.map((r) => (
          <circle
            key={r.id}
            r={r2(MEMBRANE_R * (1 + 1.1 * easeInOut(r.k)))}
            fill="none"
            stroke={tint.fill}
            strokeWidth={r2(5 * (1 - r.k))}
            opacity={r2(0.7 * (1 - r.k))}
            filter={`url(#${uid}-glow)`}
          />
        ))}

        {/* Membrane */}
        <path
          d={membranePath(membraneR, v.wobble, v.t, v.phase)}
          fill={tint.soft}
          stroke={tint.stroke}
          strokeWidth={2.5}
          opacity={0.95}
        />

        {/* Circuit inside the membrane */}
        <g opacity={0.5} transform={`rotate(${r2((v.t * 4) % 360)})`}>
          <circle
            r={MEMBRANE_R * 0.78}
            fill="none"
            stroke={tint.stroke}
            strokeWidth={1}
            strokeDasharray="10 5 2 5"
          />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * 2 * Math.PI
            const ra = MEMBRANE_R * 0.62
            const rb = MEMBRANE_R * (i % 3 === 0 ? 0.74 : 0.69)
            return (
              <line
                key={i}
                x1={r2(ra * Math.cos(a))}
                y1={r2(ra * Math.sin(a))}
                x2={r2(rb * Math.cos(a))}
                y2={r2(rb * Math.sin(a))}
                stroke={tint.stroke}
                strokeWidth={1.5}
              />
            )
          })}
        </g>

        {/* Nucleus: size = pledge left */}
        <circle
          r={r2(nucleusR)}
          fill="url(#core-nucleus)"
          stroke={tint.stroke}
          strokeWidth={2}
          filter={`url(#${uid}-glow)`}
        />
        <circle
          r={r2(nucleusR * 0.4)}
          fill="none"
          stroke={color.surface}
          strokeOpacity={0.5}
          strokeWidth={1.5}
        />
        {/* The state as a word too: colour never carries meaning alone. */}
        <text
          y={r2(Math.max(nucleusR, 30) + 22)}
          textAnchor="middle"
          fontSize={16}
          fontWeight={700}
          fill={tint.stroke}
        >
          {HEALTH_WORD[health]}
        </text>

        {/* Particles: pledge flowing picker → core → owner */}
        <g filter={`url(#${uid}-glow)`}>
          {v.particles.map((pt) => (
            <g key={pt.id} opacity={r2(pt.opacity)}>
              {pt.trail.map((tr, i) => (
                <circle
                  key={i}
                  cx={r2(tr.x)}
                  cy={r2(tr.y)}
                  r={r2(2.8 - i * 0.7)}
                  fill={color.action}
                  opacity={r2(0.5 - i * 0.14)}
                />
              ))}
              <circle cx={r2(pt.x)} cy={r2(pt.y)} r={3.6} fill={color.action} />
            </g>
          ))}
        </g>

        {/* Members */}
        {members.map((m) => {
          const d = v.dots[m.id]
          if (!d) return null
          const selected = m.id === selectedMemberId
          return (
            <g
              key={m.id}
              transform={`translate(${d.x.toFixed(2)} ${d.y.toFixed(2)})`}
              opacity={r2(d.opacity)}
            >
              <title>{`${m.name}${m.offline ? ' · offline' : ''}${m.faded ? ' · task orphaned' : ''}`}</title>
              <circle r={DOT_R} fill={m.offline ? color.mutedSubtle : color.surface} />
              {m.avatarUrl ? (
                <image
                  href={m.avatarUrl}
                  x={-(DOT_R - 2)}
                  y={-(DOT_R - 2)}
                  width={(DOT_R - 2) * 2}
                  height={(DOT_R - 2) * 2}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${uid}-face)`}
                  filter={m.offline || m.faded ? `url(#${uid}-grey)` : undefined}
                />
              ) : (
                <text y={6} textAnchor="middle" fontSize={16} fontWeight={700} fill={color.text}>
                  {initials(m.name)}
                </text>
              )}
              <circle
                r={DOT_R}
                fill="none"
                stroke={
                  selected ? color.action : m.ring === 'inner' ? tint.stroke : color.borderStrong
                }
                strokeWidth={selected ? 4 : m.ring === 'inner' ? 3 : 2}
                strokeDasharray={m.faded || m.offline ? '4 4' : undefined}
              />
            </g>
          )
        })}
      </svg>
      {reducedMotion && (
        <figcaption style={{ fontWeight: 700, fontSize: 18 }} aria-hidden>
          {label}
        </figcaption>
      )}
    </figure>
  )
}
