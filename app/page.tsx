'use client'
import { useEffect } from 'react'
import { DevBar } from '@/components/DevBar/DevBar'
import { HttpSource } from '@/data/source'
import { SECTION_LABEL } from '@/data/mock/text'
import { useDash } from '@/store/store'
import { kpis, sectionCounts, sortedMembers, leftPct, workCards } from '@/store/selectors'
import { color } from '@/theme'
import type { Section } from '@/types'

/** Step 1 view: proves the data pipeline end to end. Real panels come in step 3. */
export default function Page() {
  const connect = useDash((s) => s.connect)
  useEffect(() => connect(new HttpSource()), [connect])
  const state = useDash()
  if (!state.loaded || !state.pulse)
    return <main style={{ padding: 24 }}>Connecting to Side hustle…</main>
  const k = kpis(state)
  const counts = sectionCounts(state)
  const card = {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: 16,
    padding: 16,
  }
  return (
    <main style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 1600, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>
          Side hustle{' '}
          <small style={{ fontWeight: 400, color: color.textSecondary }}>
            · data pipeline check
          </small>
        </h1>
        <span>
          {state.connection === 'live' ? '● Live' : '○ ' + state.connection} · health{' '}
          <strong>{state.pulse.health}</strong> · {state.pulse.heartbeatsPerMin} heartbeats/min ·
          sim {new Date(state.pulse.at).toUTCString().slice(0, 22)} UTC
        </span>
      </header>
      <section style={{ ...card, fontSize: 20 }} aria-label="Status line">
        {state.pulse.statusLine}
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {[
          ['People in the pool', `${k.people} (${k.giving} giving)`],
          ['Pledge left', `${k.pledgeLeftSeatWeeks.toFixed(2)} seat-weeks`],
          ['Pledge used', `${k.pledgeUsedSeatWeeks.toFixed(2)} seat-weeks`],
          ['Tasks in flight', String(k.tasksInFlight)],
          ['Left at reset', `${k.leftAtResetPct}% of pool`],
        ].map(([label, value]) => (
          <div key={label} style={card}>
            <div style={{ color: color.textSecondary }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </section>
      <section style={{ ...card, display: 'flex', gap: 24 }} aria-label="Flow">
        {(
          ['open', 'doing', 'to_review', 'qa_review', 'done', 'next', 'needs_info'] as Section[]
        ).map((s) => (
          <span key={s}>
            {SECTION_LABEL[s]}: <strong>{counts[s]}</strong>
          </span>
        ))}
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <section style={card} aria-label="Members">
          <h2 style={{ marginTop: 0 }}>Members</h2>
          {sortedMembers(state).map((m) => (
            <div key={m.id}>
              {m.name} · {m.team} · {m.pledgePct}% pledge · {leftPct(m).toFixed(1)}% left ·{' '}
              {m.pledgeSource} · {m.status}
            </div>
          ))}
        </section>
        <section style={card} aria-label="Work in progress">
          <h2 style={{ marginTop: 0 }}>Work in progress</h2>
          {workCards(state).map((t) => (
            <div key={t.id}>
              <strong>{SECTION_LABEL[t.section]}</strong> · {t.title} ·{' '}
              {state.members[t.ownerId]?.name.split(' ')[0]} →{' '}
              {t.pickerId ? state.members[t.pickerId]?.name.split(' ')[0] : '—'} ·{' '}
              {t.usedPct.toFixed(1)}/{t.budgetPct}% {t.flag ? `· ${t.flag}` : ''}
            </div>
          ))}
        </section>
        <section style={card} aria-label="Activity log">
          <h2 style={{ marginTop: 0 }}>Activity log</h2>
          {state.events
            .slice(-18)
            .reverse()
            .map((e) => (
              <div key={e.id} style={{ fontSize: 14 }}>
                {new Date(e.at).toISOString().slice(11, 16)} {e.text}
              </div>
            ))}
        </section>
      </div>
      <DevBar />
    </main>
  )
}
