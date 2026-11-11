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
import type { DataSource } from '@/data/source'
import { useDash } from '@/store/store'

/**
 * The page, read top-down: how things are (core and numbers), who is involved
 * (members), what is happening (work and flow), what needs attention
 * (insights) and what happened (log). Every panel reads from the store.
 */
export function Dashboard({ source }: { source: DataSource }) {
  const connect = useDash((s) => s.connect)
  const loaded = useDash((s) => s.loaded)
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
      <main>
        {/* Above the fold: the core and the key numbers. */}
        <Hero />
        {/* Below the fold: the detail, as cards. */}
        <div className="sh-page" id="details">
          <div className="sh-two">
            <Members />
            <WorkCards />
          </div>
          <Flow />
          <div className="sh-two">
            <PledgeFlow />
            <Quality />
          </div>
          <div className="sh-two">
            <Insights />
            <Leaderboard />
          </div>
          <ActivityLog />
        </div>
      </main>
      <DevBar />
    </>
  )
}
