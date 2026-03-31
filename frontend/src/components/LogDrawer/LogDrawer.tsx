import { useEffect, useRef, useState } from 'react';
import { useRunStore } from '../../store/runStore';
import type { RunEvent } from '../../types';
import { CustomSelect } from '../CustomSelect/CustomSelect';

const EVENT_COLORS: Record<string, string> = {
  agent_message: 'var(--text-muted)',
  tool_call: 'var(--warning)',
  tool_result: 'var(--success)',
  response: 'var(--accent)',
  error: 'var(--error)',
  run_complete: 'var(--success)',
  handoff: 'var(--accent)',
};

function shortContent(event: RunEvent): string {
  const p = event.payload;
  if (event.event === 'handoff') {
    const toName = typeof p.to_agent_name === 'string' ? p.to_agent_name : '?';
    const msg = typeof p.message === 'string' ? p.message.slice(0, 80) : '';
    return `→ ${toName}${msg ? `: ${msg}` : ''}`;
  }
  if (typeof p.text === 'string') return p.text.slice(0, 120);
  if (typeof p.message === 'string') return p.message.slice(0, 120);
  if (typeof p.tool === 'string') return `${p.tool}(${JSON.stringify(p.args ?? p.result ?? '').slice(0, 80)})`;
  if (typeof p.summary === 'string') return p.summary;
  return JSON.stringify(p).slice(0, 120);
}

interface AgentSpan {
  name: string;
  color: string;
  startMs: number;
  endMs: number;
  tools: { name: string; startMs: number; endMs: number }[];
}

const LANE_COLORS = ['#2563eb', '#9333ea', '#16a34a', '#b45309', '#0e7490', '#be123c'];

function buildTimeline(events: RunEvent[]): { spans: AgentSpan[]; minMs: number; maxMs: number } {
  if (events.length === 0) return { spans: [], minMs: 0, maxMs: 0 };

  const agentOrder: string[] = [];
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  const toolStarts = new Map<string, number[]>();
  const toolSpans = new Map<string, AgentSpan['tools']>();

  for (const ev of events) {
    const { agent_name, event, timestamp, payload } = ev;
    if (!agent_name) continue;
    const ms = new Date(timestamp).getTime();
    if (isNaN(ms)) continue;

    if (!starts.has(agent_name)) {
      starts.set(agent_name, ms);
      agentOrder.push(agent_name);
      toolSpans.set(agent_name, []);
    }
    ends.set(agent_name, ms);

    if (event === 'tool_call') {
      const toolName = typeof payload.tool === 'string' ? payload.tool : 'tool';
      const key = `${agent_name}:${toolName}`;
      if (!toolStarts.has(key)) toolStarts.set(key, []);
      toolStarts.get(key)!.push(ms);
    }
    if (event === 'tool_result') {
      const toolName = typeof payload.tool === 'string' ? payload.tool : 'tool';
      const key = `${agent_name}:${toolName}`;
      const queue = toolStarts.get(key);
      if (queue && queue.length > 0) {
        const tStart = queue.shift()!;
        toolSpans.get(agent_name)!.push({ name: toolName, startMs: tStart, endMs: ms });
      }
    }
  }

  const allMs = [...starts.values(), ...ends.values()];
  const minMs = Math.min(...allMs);
  const maxMs = Math.max(...allMs);

  const spans: AgentSpan[] = agentOrder.map((name, i) => ({
    name,
    color: LANE_COLORS[i % LANE_COLORS.length],
    startMs: starts.get(name)!,
    endMs: ends.get(name)!,
    tools: toolSpans.get(name) ?? [],
  }));

  return { spans, minMs, maxMs };
}

function TimelineChart({ events }: { events: RunEvent[] }) {
  const { spans, minMs, maxMs } = buildTimeline(events);

  if (spans.length === 0) {
    return <span className="log-drawer__empty">No events yet</span>;
  }

  const duration = maxMs - minMs || 1;
  const pct = (ms: number) => ((ms - minMs) / duration) * 100;
  const spanWidth = (s: number, e: number) => Math.max(pct(e) - pct(s), 0.5);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    pct: f * 100,
    label: `${((duration * f) / 1000).toFixed(1)}s`,
  }));

  return (
    <div className="timeline-chart">
      <div className="timeline-axis">
        {ticks.map((t) => (
          <span key={t.pct} className="timeline-tick" style={{ left: `${t.pct}%` }}>{t.label}</span>
        ))}
      </div>
      {spans.map((span) => (
        <div key={span.name} className="timeline-agent">
          <div className="timeline-row">
            <div
              className="timeline-bar"
              title={`${span.name}  ${((span.endMs - span.startMs) / 1000).toFixed(1)}s`}
              style={{
                left: `${pct(span.startMs)}%`,
                width: `${spanWidth(span.startMs, span.endMs)}%`,
                background: span.color + '28',
                borderColor: span.color,
              }}
            >
              <span className="timeline-bar__lbl" style={{ color: span.color }}>
                {span.name} · {((span.endMs - span.startMs) / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
          {span.tools.length > 0 && (
            <div className="timeline-row timeline-row--tools">
              {span.tools.map((t, i) => (
                <div
                  key={i}
                  className="timeline-bar"
                  title={`${t.name}  ${((t.endMs - t.startMs) / 1000).toFixed(1)}s`}
                  style={{
                    left: `${pct(t.startMs)}%`,
                    width: `${spanWidth(t.startMs, t.endMs)}%`,
                    background: span.color + '55',
                    borderColor: span.color,
                  }}
                >
                  <span className="timeline-bar__lbl" style={{ color: span.color, fontSize: 8 }}>{t.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EventRow({ event }: { event: RunEvent }) {
  const [expanded, setExpanded] = useState(false);
  const color = EVENT_COLORS[event.event] ?? 'var(--text-muted)';
  const ts = new Date(event.timestamp).toLocaleTimeString();
  const isBold = event.event === 'response';

  return (
    <div className="log-row" onClick={() => setExpanded((e) => !e)}>
      <div className="log-row__summary">
        <span className="log-row__ts">{ts}</span>
        {event.agent_name && <span className="log-row__agent">{event.agent_name}</span>}
        <span className="log-row__badge" style={{ color, borderColor: color }}>{event.event}</span>
        <span className="log-row__content" style={{ fontWeight: isBold ? 'bold' : undefined }}>
          {shortContent(event)}
        </span>
      </div>
      {expanded && (
        <pre className="log-row__json">{JSON.stringify(event.payload, null, 2)}</pre>
      )}
    </div>
  );
}

export function LogDrawer() {
  const currentEvents = useRunStore((s) => s.events);
  const currentTask = useRunStore((s) => s.task);
  const status = useRunStore((s) => s.status);
  const history = useRunStore((s) => s.history);
  const selectedHistoryIndex = useRunStore((s) => s.selectedHistoryIndex);
  const selectHistory = useRunStore((s) => s.selectHistory);

  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'log' | 'timeline'>('log');
  const [drawerHeight, setDrawerHeight] = useState(240);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = drawerHeight;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartY.current - ev.clientY;
      setDrawerHeight(Math.max(80, dragStartHeight.current + delta));
    };
    const onMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const isViewingHistory = selectedHistoryIndex !== null;
  const visibleEvents = isViewingHistory ? history[selectedHistoryIndex].events : currentEvents;
  const visibleTask = isViewingHistory ? history[selectedHistoryIndex].task : currentTask;

  // Auto-open when run starts
  useEffect(() => {
    if (status === 'running') setExpanded(true);
  }, [status]);

  // Auto-scroll to bottom (only for live run)
  useEffect(() => {
    if (!isViewingHistory && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [visibleEvents, expanded, isViewingHistory]);

  const label = isViewingHistory
    ? `Run ${history.length - selectedHistoryIndex} of ${history.length + 1} — ${visibleTask.slice(0, 40)}`
    : `Event Log (${currentEvents.length})`;

  return (
    <div
      className={`log-drawer${expanded ? ' log-drawer--expanded' : ''}`}
      style={expanded ? { height: drawerHeight + 32 } : undefined}
    >
      {expanded && (
        <div className="log-drawer__resize-handle" onMouseDown={handleDragStart} />
      )}
      <div className="log-drawer__header">
        <div className="log-drawer__header-left" onClick={() => setExpanded((e) => !e)}>
          <span className="log-drawer__label">{label}</span>
        </div>
        {expanded && (
          <div className="log-drawer__tabs">
            <button
              className={`log-drawer__tab${view === 'log' ? ' log-drawer__tab--active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setView('log'); }}
            >Event Log</button>
            <button
              className={`log-drawer__tab${view === 'timeline' ? ' log-drawer__tab--active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setView('timeline'); }}
            >Timeline</button>
          </div>
        )}
        <div className="log-drawer__header-right">
          {history.length > 0 && (
            <CustomSelect
              className="custom-select--compact"
              value={selectedHistoryIndex === null ? '' : String(selectedHistoryIndex)}
              options={[
                { value: '', label: 'Current run' },
                ...history.map((rec, i) => ({
                  value: String(i),
                  label: `Run ${history.length - i} — ${rec.task.slice(0, 30)}`,
                })),
              ]}
              onChange={(val) => selectHistory(val === '' ? null : Number(val))}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <span className="log-drawer__toggle" onClick={() => setExpanded((e) => !e)}>
            {expanded ? '▼' : '▲'}
          </span>
        </div>
      </div>
      {expanded && (
        <div className="log-drawer__body" ref={bodyRef} style={{ height: drawerHeight }}>
          {view === 'log' ? (
            visibleEvents.length === 0
              ? <span className="log-drawer__empty">No events yet</span>
              : visibleEvents.map((ev, i) => <EventRow key={i} event={ev} />)
          ) : (
            <TimelineChart events={visibleEvents} />
          )}
        </div>
      )}
    </div>
  );
}
