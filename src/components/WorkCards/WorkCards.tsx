'use client'
import { Badge, Icon } from '@iubenda/lumen-next'
import type { BadgeVariant } from '@iubenda/lumen'
import { AnimatePresence, motion as m } from 'framer-motion'
import { useMemo } from 'react'
import { Avatar, Bar, Empty, Panel } from '@/components/ui/ui'
import { SECTION_LABEL } from '@/data/mock/text'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { duration, firstName, pct } from '@/lib/format'
import { motion } from '@/motion'
import { nowOf, overBudget, tasksForMember, workCards } from '@/store/selectors'
import { useData, useDash } from '@/store/store'
import { color } from '@/theme'
import type { Section, Task } from '@/types'

const SECTION_BADGE: Partial<Record<Section, BadgeVariant>> = {
  doing: 'info',
  to_review: 'promo',
  qa_review: 'neutral',
  needs_info: 'warning',
  done: 'success',
}

function Card({ task, now, dim }: { task: Task; now: number; dim: boolean }) {
  const data = useData()
  const owner = data.members[task.ownerId]
  const picker = task.pickerId ? data.members[task.pickerId] : undefined
  const prev = task.previousPickerId ? data.members[task.previousPickerId] : undefined
  const project = data.projects[task.projectId]
  const pickerAgent = task.pickerAgentId ? data.agents[task.pickerAgentId] : undefined
  const reviewer =
    task.section === 'to_review' && task.reviewerAgentId
      ? data.agents[task.reviewerAgentId]
      : undefined
  const over = overBudget(task)
  const since = task.section === 'done' && task.doneAt ? task.doneAt : task.sectionSince

  return (
    <article
      id={`task-${task.id}`}
      className={dim ? 'sh-dim' : 'sh-lit'}
      style={{
        border: `1px solid ${task.flag ? color.dangerStrong : color.border}`,
        borderRadius: 12,
        padding: 14,
        display: 'grid',
        gap: 10,
        background: color.surface,
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, lineHeight: 1.3 }}>{task.title}</h3>
          <div className="sh-muted" style={{ fontSize: 14 }}>
            {project?.name ?? task.projectId} ·{' '}
            <a href={task.asanaUrl} target="_blank" rel="noreferrer">
              Open in Asana<span className="sh-sr"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'end' }}>
          <Badge variant={SECTION_BADGE[task.section] ?? 'neutral'}>
            {SECTION_LABEL[task.section]} · {duration(now - Date.parse(since))}
          </Badge>
          {task.flag && (
            <Badge variant="destructive">
              <Icon name="warning" size="sm" /> {task.flag === 'orphaned' ? 'Orphaned' : 'Stalled'}
            </Badge>
          )}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Avatar member={owner} size={28} title={`Owner: ${owner?.name ?? 'unknown'}`} />
        <Icon name="arrow-right" size="sm" label="picked up by" />
        <Avatar
          member={picker}
          size={28}
          title={picker ? `Picker: ${picker.name}` : 'No picker yet'}
        />
        <span style={{ fontSize: 14 }}>
          {firstName(owner?.name)}’s task{picker ? `, on ${firstName(picker.name)}’s pledge` : ''}
        </span>
      </div>

      {(pickerAgent || reviewer || prev) && (
        <div
          className="sh-muted"
          style={{ fontSize: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}
        >
          {pickerAgent && <span>{pickerAgent.name}</span>}
          {reviewer && <span>Checked by {reviewer.name}</span>}
          {prev && prev.id !== picker?.id && (
            <span style={{ color: color.action, fontWeight: 600 }}>
              <Icon name="arrows-vertical" size="sm" /> Taken over from {firstName(prev.name)}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span className="sh-num">
            {pct(task.usedPct, 1)} of {pct(task.budgetPct)} budget ({task.size})
          </span>
          <span>
            {over && (
              <strong style={{ color: color.warningStrong, marginRight: 8 }}>
                <Icon name="warning-circle" size="sm" /> Over budget
              </strong>
            )}
            {task.reviewAttempts > 0 && task.section !== 'done' && (
              <span>
                Review {task.reviewAttempts} of {task.maxReviewAttempts}
              </span>
            )}
          </span>
        </div>
        <Bar
          value={task.usedPct}
          max={task.budgetPct}
          over={over}
          label={`${pct(task.usedPct, 1)} of ${pct(task.budgetPct)} budget used`}
        />
      </div>
    </article>
  )
}

export function WorkCards() {
  const data = useData()
  const selected = useDash((s) => s.selectedMemberId)
  const reduced = useReducedMotionPref()
  const cards = useMemo(() => workCards(data), [data])
  const mine = useMemo(
    () => (selected ? tasksForMember(data, selected) : undefined),
    [data, selected],
  )
  const now = nowOf(data)

  return (
    <Panel
      id="work"
      title="Work in progress"
      aside={<span className="sh-muted">{cards.length} tasks · title and project only</span>}
    >
      {cards.length === 0 ? (
        <Empty>
          Nothing in progress right now. New tasks show up here as soon as an agent claims them.
        </Empty>
      ) : (
        <div
          data-testid="work-scroll"
          className="sh-fill"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 12,
            alignContent: 'start',
            paddingRight: 4,
          }}
        >
          <AnimatePresence initial={false}>
            {cards.map((t) => (
              <m.div
                key={t.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reduced
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { opacity: 0, scale: 0.97 }
                }
                transition={motion.base}
              >
                <Card task={t} now={now} dim={!!mine && !mine.has(t.id)} />
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Panel>
  )
}
