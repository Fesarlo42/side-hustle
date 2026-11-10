'use client'
import { Icon, Segment, Segmented } from '@iubenda/lumen-next'
import type { IconName } from '@iubenda/lumen'
import { useMemo, useState } from 'react'
import { Empty, Panel } from '@/components/ui/ui'
import { clock } from '@/lib/format'
import { focusRef, useData, useDash } from '@/store/store'
import { color } from '@/theme'
import type { EventType } from '@/types'

type Filter = 'all' | 'tasks' | 'reviews' | 'people' | 'insights'

const GROUP: Record<EventType, Exclude<Filter, 'all'>> = {
  'task.published': 'tasks',
  'task.claimed': 'tasks',
  'task.section_changed': 'tasks',
  'task.heartbeat': 'tasks',
  'task.released': 'tasks',
  'task.flagged': 'tasks',
  'task.approved': 'reviews',
  'task.rejected': 'reviews',
  'review.passed': 'reviews',
  'review.failed': 'reviews',
  'member.joined': 'people',
  'member.left': 'people',
  'member.status': 'people',
  'pledge.answered': 'people',
  'pledge.changed': 'people',
  'week.reset': 'people',
  'insight.opened': 'insights',
  'insight.updated': 'insights',
  'insight.resolved': 'insights',
  'service.status': 'insights',
}

const ICON: Partial<Record<EventType, IconName>> = {
  'task.published': 'plus',
  'task.claimed': 'play',
  'task.section_changed': 'arrow-right',
  'task.released': 'arrow-counter-clockwise',
  'task.flagged': 'warning',
  'task.approved': 'check-circle',
  'task.rejected': 'thumbs-down',
  'review.passed': 'shield-check',
  'review.failed': 'x-circle',
  'member.joined': 'user',
  'member.status': 'monitor',
  'pledge.answered': 'chart-line',
  'pledge.changed': 'chart-line',
  'insight.opened': 'info',
  'insight.updated': 'info',
  'insight.resolved': 'check',
  'service.status': 'globe',
}

const SHOWN = 80

/** Every event, live. The single source of truth the other panels link back to. */
export function ActivityLog() {
  const data = useData()
  const select = useDash((s) => s.selectMember)
  const [filter, setFilter] = useState<Filter>('all')
  const rows = useMemo(
    () =>
      data.events
        .filter(
          (e) => e.type !== 'task.heartbeat' && (filter === 'all' || GROUP[e.type] === filter),
        )
        .slice(-SHOWN)
        .reverse(),
    [data.events, filter],
  )

  return (
    <Panel
      id="log"
      title="Activity log"
      aside={
        <Segmented
          label="Show"
          size="sm"
          value={filter}
          onChange={({ value }) => setFilter(value as Filter)}
        >
          <Segment value="all">All</Segment>
          <Segment value="tasks">Tasks</Segment>
          <Segment value="reviews">Reviews</Segment>
          <Segment value="people">Pledges & people</Segment>
          <Segment value="insights">Insights</Segment>
        </Segmented>
      }
    >
      {rows.length === 0 ? (
        <Empty>No events yet.</Empty>
      ) : (
        <ol
          aria-label="Events, newest first"
          style={{ margin: 0, padding: 0, maxHeight: 420, overflowY: 'auto', display: 'grid' }}
        >
          {rows.map((e) => {
            const people = e.related
              .filter((r) => r.type === 'member')
              .map((r) => data.members[r.id])
              .filter((m) => !!m)
            const taskRef = e.related.find((r) => r.type === 'task' && data.tasks[r.id])
            return (
              <li
                key={e.id}
                id={`event-${e.id}`}
                style={{
                  listStyle: 'none',
                  display: 'grid',
                  gridTemplateColumns: '56px 24px 1fr',
                  gap: 8,
                  alignItems: 'start',
                  padding: '6px 0',
                  borderBottom: `1px solid ${color.borderSubtle}`,
                }}
              >
                <time dateTime={e.at} className="sh-muted sh-num">
                  {clock(e.at)}
                </time>
                <span aria-hidden style={{ color: color.action, paddingTop: 2 }}>
                  <Icon name={ICON[e.type] ?? 'dots-three'} size="sm" />
                </span>
                <span>
                  {e.text}
                  {(people.length > 0 || taskRef) && (
                    <span style={{ display: 'inline-flex', gap: 10, marginLeft: 10, fontSize: 14 }}>
                      {people.map((m) => (
                        <button
                          key={m.id}
                          className="sh-linkbtn"
                          style={{ color: color.action }}
                          onClick={() => select(m.id)}
                        >
                          {m.name}
                        </button>
                      ))}
                      {taskRef && (
                        <button
                          className="sh-linkbtn"
                          style={{ color: color.action }}
                          onClick={() => focusRef(taskRef)}
                          aria-label="Show the task"
                        >
                          task
                        </button>
                      )}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
