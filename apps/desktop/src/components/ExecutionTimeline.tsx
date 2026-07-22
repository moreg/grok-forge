import { useEffect, useRef, useState } from 'react'
import { Activity, Check, ChevronDown, ChevronRight, CircleDot, Code2, Play, X } from 'lucide-react'
import type { PlanStep } from '../lib/tasks'
import { formatStepDuration, formatStepsTotalDuration } from '../lib/tasks'

export function ExecutionTimeline({ steps }: { steps: PlanStep[] }) {
  const doneCount = steps.filter((step) => step.status === 'completed').length
  const failedCount = steps.filter((step) => step.status === 'failed').length
  const running = steps.some((step) => step.status === 'in_progress')
  const finished = steps.length > 0
    && !running
    && steps.every((step) => step.status === 'completed' || step.status === 'failed')

  // Collapsed by default during generation and after finish; user expands when they want detail.
  const [open, setOpen] = useState(false)
  const manualRef = useRef(false)
  const prevRunningRef = useRef(running)

  useEffect(() => {
    if (steps.length === 0) return
    // New run starting: reset to collapsed unless the user already toggled this session.
    if (running && !prevRunningRef.current && !manualRef.current) {
      setOpen(false)
    }
    prevRunningRef.current = running
    // After a run finishes, keep collapsed (or re-fold if user had left it open without locking).
    if (finished && !manualRef.current) {
      setOpen(false)
    }
  }, [running, finished, steps.length])

  if (steps.length === 0) return null

  const toggle = () => {
    manualRef.current = true
    setOpen((value) => !value)
  }

  const lastStep = steps[steps.length - 1]
  const totalDuration = formatStepsTotalDuration(steps)
  const preview = running
    ? (lastStep?.content || '执行中…')
    : failedCount > 0
      ? `${doneCount}/${steps.length} 已完成 · ${failedCount} 失败`
      : `${doneCount}/${steps.length} 已完成`
  const countLabel = totalDuration
    ? `${doneCount}/${steps.length} · ${totalDuration}`
    : `${doneCount}/${steps.length} 已完成`

  return (
    <div
      className={`timeline-card ${open ? 'is-open' : 'is-collapsed'}`}
      aria-label="执行时间线"
      role="region"
    >
      <button
        type="button"
        className="timeline-heading"
        aria-expanded={open}
        aria-label={open ? '折叠执行过程' : '展开执行过程'}
        onClick={toggle}
      >
        <Activity size={13} />
        <span className="timeline-heading-label">执行过程</span>
        {!open && <em className="timeline-preview">{preview}</em>}
        <span className="timeline-heading-count">{countLabel}</span>
        {open
          ? <ChevronDown size={13} className="timeline-chevron" />
          : <ChevronRight size={13} className="timeline-chevron" />}
      </button>
      {open && steps.map((step, index) => {
        const className = step.status === 'completed'
          ? 'done'
          : step.status === 'in_progress'
            ? 'running'
            : step.status === 'failed'
              ? 'failed'
              : ''
        const duration = formatStepDuration(step)
        return (
          <div className={`timeline-step ${className}`} key={`${step.toolCallId ?? step.content}-${index}`}>
            <div className="step-rail">
              <div className="step-icon">
                {step.status === 'completed' ? <Check size={11} /> : step.status === 'in_progress' ? <Play size={10} /> : step.status === 'failed' ? <X size={11} /> : <CircleDot size={10} />}
              </div>
              {index < steps.length - 1 && <div className="step-line" />}
            </div>
            <div className="step-copy">
              <strong>{step.content}</strong>
              {step.detail && <small>{step.detail}</small>}
            </div>
            {step.status === 'in_progress' ? (
              <div className="running-pill"><span />执行中</div>
            ) : duration ? (
              <div className="running-pill muted">{duration}</div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
