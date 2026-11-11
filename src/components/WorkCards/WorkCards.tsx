'use client'
import { Icon } from '@iubenda/lumen-next'
import { AnimatePresence, motion as m } from 'framer-motion'
import { useMemo } from 'react'
import { Avatar, Bar, Empty, Panel } from '@/components/ui/ui'
import { SECTION_LABEL } from '@/data/mock/text'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { duration, firstName, pct } from '@/lib/format'
import { nowOf, overBudget, tasksForMember, workCards } from '@/store/selectors'
import { useData, useDash } from '@/store/store'
import { color } from '@/theme'
import type { Section, Task } from '@/types'

/** One accent per section (the section name is always written too). */
const ACCENT: Partial<Record<Section, string>> = {
  doing: color.action,
  to_review: color.warning,
  qa_review: color.borderStrong,
  needs_info: color.dangerStrong,
  done: color.success,
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
      className={`sh-card ${dim ? 'sh-dim' : 'sh-lit'}`}
      style={{ borderLeftColor: task.flag ? color.danger : (ACCENT[task.section] ?? color.border) }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}
      >
        <h3 style={{ margin: 0, fontSize: 16, lineHeight: 1.3 }}>{task.title}</h3>
        <span className="sh-chip sh-num">
          {SECTION_LABEL[task.section]} · {duration(now - Date.parse(since))}
        </span>
      </div>

      <div
        className="sh-muted"
        style={{ fontSize: 13, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <span>{project?.name ?? task.projectId}</span>
        <a href={task.asanaUrl} target="_blank" rel="noreferrer">
          Open in Asana<span className="sh-sr"> (opens in a new tab)</span>
        </a>
        {task.flag && (
          <strong style={{ color: color.dangerStrong }}>
            <Icon name="warning" size="sm" /> {task.flag === 'orphaned' ? 'Orphaned' : 'Stalled'}
          </strong>
        )}
      </div>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}
      >
        <Avatar member={owner} size={24} title={`Owner: ${owner?.name ?? 'unknown'}`} />
        <Icon name="arrow-right" size="sm" label="picked up by" />
        <Avatar
          member={picker}
          size={24}
          title={picker ? `Picker: ${picker.name}` : 'No picker yet'}
        />
        <span>
          {firstName(owner?.name)}’s task{picker ? `, on ${firstName(picker.name)}’s pledge` : ''}
        </span>
        {pickerAgent && <span className="sh-muted">· {pickerAgent.name}</span>}
        {reviewer && <span className="sh-muted">· Checked by {reviewer.name}</span>}
      </div>

      {prev && prev.id !== picker?.id && (
        <div className="sh-handover">
          <Icon name="arrows-vertical" size="sm" /> Taken over from {firstName(prev.name)}
        </div>
      )}

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
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
          height={6}
          label={`${pct(task.usedPct, 1)} of ${pct(task.budgetPct)} budget used`}
        />
      </div>
    </article>
  )
}

const GROUPS: Section[] = ['doing', 'to_review', 'qa_review', 'needs_info', 'done']

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
  const groups = GROUPS.map((section) => ({
    section,
    tasks: cards.filter((t) => t.section === section),
  })).filter((g) => g.tasks.length > 0)

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
          style={{ display: 'grid', gap: 14, alignContent: 'start', paddingRight: 4 }}
        >
          {groups.map(({ section, tasks }) => (
            <section
              key={section}
              role="group"
              aria-label={`${SECTION_LABEL[section]}: ${tasks.length}`}
            >
              <h3 className="sh-lane" style={{ ['--accent' as string]: ACCENT[section] }}>
                {SECTION_LABEL[section]} <span className="sh-num">{tasks.length}</span>
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 10,
                }}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {tasks.map((t) => (
                    <m.div
                      key={t.id}
                      layout={!reduced}
                      initial={reduced ? false : { opacity: 0, scale: 0.92, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={
                        reduced
                          ? { opacity: 0, transition: { duration: 0 } }
                          : { opacity: 0, scale: 0.9 }
                      }
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    >
                      <Card task={t} now={now} dim={!!mine && !mine.has(t.id)} />
                    </m.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      )}
    </Panel>
  )
}
