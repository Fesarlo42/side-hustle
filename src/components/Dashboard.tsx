'use client'
import { useEffect } from 'react'
import { ActivityLog } from '@/components/ActivityLog/ActivityLog'
import { DevBar } from '@/components/DevBar/DevBar'
import { Flow } from '@/components/Flow/Flow'
import { Header } from '@/components/Header/Header'
import { Hero } from '@/components/Hero/Hero'
import { Insights } from '@/components/Insights/Insights'
import { Leaderboard } from '@/components/Leaderboard/Leaderboard'
import { Members } from '@/components/Members/Members'
import { PledgeFlow } from '@/components/PledgeFlow/PledgeFlow'
import { Quality } from '@/components/Quality/Quality'
import { WorkCards } from '@/components/WorkCards/WorkCards'
import { Section } from '@/components/ui/Section'
import keepOn from '@/assets/brand/keep-on-token.png'
import lookWhos from '@/assets/brand/look-whos-token.png'
import nowWere from '@/assets/brand/now-were-token.png'
import type { DataSource } from '@/data/source'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { useDash } from '@/store/store'

/**
 * The page, read top-down: how things are (core and numbers), who is involved
 * (members), what is happening (work and flow), what needs attention
 * (insights) and what happened (log). Every panel reads from the store.
 */
export function Dashboard({ source }: { source: DataSource }) {
  const connect = useDash((s) => s.connect)
  const loaded = useDash((s) => s.loaded)
  const reduced = useReducedMotionPref()
  useEffect(() => connect(source), [connect, source])

  if (!loaded)
    return (
      <main className="sh-page">
        <p role="status">Connecting to Side hustle…</p>
      </main>
    )

  return (
    <>
      <Header />
      <main className={reduced ? 'sh-reduced' : undefined}>
        {/* Above the fold: the core and the key numbers. */}
        <Hero />
        {/* Below the fold: the detail, as cards. */}
        <div className="sh-page" id="details">
          {/* Who is in the pool, and where their pledges go. */}
          <Section banner={lookWhos} alt="Look who’s Token">
            <div className="sh-split">
              <Members />
              <PledgeFlow />
            </div>
          </Section>
          {/* What the agents are doing, left to right through the sections. */}
          <Section banner={nowWere} alt="Now we’re Token">
            <WorkCards />
          </Section>
          {/* How well it flows. */}
          <Section banner={keepOn} alt="Keep on Token">
            <Flow />
            <div className="sh-two">
              <Quality />
              <Leaderboard />
            </div>
          </Section>
          <div className="sh-two">
            <Insights />
            <ActivityLog />
          </div>
        </div>
      </main>
      <DevBar />
    </>
  )
}
