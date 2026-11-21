import { useId, useMemo, useState, type CSSProperties } from 'react';
import type { DesiredOutcome, QuestRecord } from '../types';
import { OUTCOME_META, OUTCOME_ORDER, primaryOutcome } from '../outcome-meta';
import type { ThreadRoute, ThreadStop } from '../thread-map';
import { buildThreadGraph } from '../thread-graph';
import { appUrl } from '../paths';

function OutcomeGlyph({ outcome }: { outcome: DesiredOutcome }) {
  const paths: Record<DesiredOutcome, string> = {
    relax: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z',
    surprise: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
    express: 'm5 15 10-10 4 4L9 19H5v-4Zm8-8 4 4M4 22h16',
    connect: 'M9 14a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-2 2M15 10a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l2-2',
    grow: 'M12 21v-9M12 15C6 15 3 11 3 5c6 0 9 4 9 10Zm0-4c0-5 3-8 9-8 0 6-3 9-9 9M8 21h8',
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={paths[outcome]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function RecordMark({ record }: { record: QuestRecord }) {
  const photo = record.stepDetails?.find(step => step.evidence?.photoUrl)?.evidence?.photoUrl;
  const outcome = primaryOutcome(record);
  return <span className="thread-node-mark" style={{ '--node-color': OUTCOME_META[outcome].color } as CSSProperties}>
    {photo ? <img src={appUrl(photo)} alt="" loading="lazy" /> : <OutcomeGlyph outcome={outcome} />}
    <i aria-hidden="true">✓</i>
  </span>;
}

export function ThreadGraph({ records, routes, selectedId, onRecord, onRoute }: {
  records: QuestRecord[]; routes: ThreadRoute[]; selectedId: string | null;
  onRecord: (id: string) => void; onRoute: (route: ThreadRoute) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const graph = useMemo(() => buildThreadGraph(routes, records, { limit: expanded ? Infinity : 20 }), [records, routes, expanded]);
  const points = new Map(graph.nodes.map(node => [node.id, node]));
  const selected = points.get(selectedId || '');
  const relatedRoutes = new Set(selected?.routeIds || []);
  return <div className="thread-graph" aria-label="已完成任务关系图">
    <div className="thread-graph-lanes">{OUTCOME_ORDER.map(outcome => {
      const route = routes.find(item => item.outcome === outcome)!;
      return <button type="button" key={outcome} style={{ color: OUTCOME_META[outcome].color }} aria-label={`查看支线：${route.title}`} onClick={() => onRoute(route)}>
        <OutcomeGlyph outcome={outcome} /><span>{OUTCOME_META[outcome].label}</span>
      </button>;
    })}</div>
    <div className="thread-graph-canvas" style={{ height: records.length ? graph.height : 208 }}>
      <svg className="thread-graph-lines" viewBox={`0 0 1000 ${records.length ? graph.height : 208}`} preserveAspectRatio="none" aria-hidden="true">
        {OUTCOME_ORDER.map((outcome, index) => <path key={outcome} className="thread-lane-guide" d={`M${index * 200 + 100} 0V${records.length ? graph.height : 160}`} />)}
        {graph.edges.map(edge => {
          const from = points.get(edge.from)!, to = points.get(edge.to)!;
          const custom = edge.kinds.includes('custom');
          const direction = routes.find(route => route.kind === 'category' && edge.sourceIds.includes(route.id));
          const lit = !!selected && edge.sourceIds.some(id => relatedRoutes.has(id));
          return <path key={`${edge.from}:${edge.to}`} data-from={edge.from} data-to={edge.to} data-kinds={edge.kinds.join(' ')}
            className={`thread-graph-edge ${custom ? 'is-theme' : ''} ${lit ? 'is-lit' : ''}`}
            style={{ color: custom ? 'var(--moss-deep)' : direction?.color || OUTCOME_META[from.outcome].color }}
            d={`M${from.x * 1000} ${from.y} C${from.x * 1000} ${(from.y + to.y) / 2} ${to.x * 1000} ${(from.y + to.y) / 2} ${to.x * 1000} ${to.y}`} />;
        })}
      </svg>
      {graph.nodes.map(node => <button type="button" key={node.id} className={`thread-graph-node ${node.id === selectedId ? 'is-selected' : ''}`}
        data-record-id={node.id} style={{ left: `${node.x * 100}%`, top: node.y }}
        aria-label={`查看已完成任务：${node.record.title}`} aria-description={`${OUTCOME_META[node.outcome].label} · ${node.record.date.slice(0, 10)}`} aria-pressed={node.id === selectedId} onClick={() => onRecord(node.id)}>
        <RecordMark record={node.record} /><span className="thread-node-label">{node.record.title}</span>
      </button>)}
      {!records.length && <div className="thread-graph-empty"><span aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" stroke="currentColor" strokeWidth="1.5" /></svg></span><p>完成一次探索，点亮第一个节点</p></div>}
    </div>
    {!!records.length && <div className="thread-graph-legend"><span>↓ 时间</span><span><i />同方向</span><span><i className="is-theme" />我的主题</span></div>}
    {!!graph.hiddenCount && <button type="button" className="thread-graph-more" onClick={() => setExpanded(true)}>展开更早的 {graph.hiddenCount} 次探索 ↓</button>}
  </div>;
}

const statusNames = { done: '已完成', next: '下一站', active: '进行中', locked: '待解锁', planned: '待确认' };
export function RouteJourney({ route, selectedId, onSelect }: { route: ThreadRoute; selectedId: string | null; onSelect: (stop: ThreadStop) => void }) {
  const marker = useId().replace(/:/g, '');
  const positions = route.stops.map((stop, index) => ({ stop, x: (Math.floor(index / 2) % 2 ? (index % 2 ? 24 : 76) : (index % 2 ? 76 : 24)), y: 32 + Math.floor(index / 2) * 128 }));
  const height = Math.ceil(route.stops.length / 2) * 128;
  return <ol className="thread-timeline thread-journey" style={{ height, '--route-color': route.color } as CSSProperties} aria-label={route.kind === 'goal' ? '心愿章节发展路线' : '按完成时间排列的探索路线'}>
    <li className="thread-journey-lines" aria-hidden="true"><svg viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none">
      <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="m1 1 5 3-5 3" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
      {positions.slice(1).map((point, index) => {
        const previous = positions[index];
        const sameRow = previous.y === point.y;
        const direction = sameRow ? (point.x > previous.x ? 1 : -1) : (point.x > 50 ? 1 : -1);
        const x1 = previous.x * 10 + 68 * direction;
        const x2 = point.x * 10 + 68 * direction * (sameRow ? -1 : 1);
        const outside = point.x > 50 ? 980 : 20;
        const middle = (previous.y + point.y) / 2;
        return <path key={point.stop.id} className={point.stop.status === 'done' ? 'is-done' : 'is-future'} markerEnd={`url(#${marker})`}
          d={sameRow ? `M${x1} ${previous.y}H${x2}` : `M${x1} ${previous.y}C${outside} ${previous.y} ${outside} ${previous.y} ${outside} ${middle}C${outside} ${point.y} ${outside} ${point.y} ${x2} ${point.y}`} />;
      })}
    </svg></li>
    {positions.map(({ stop, x, y }, index) => <li key={stop.id} data-status={stop.status} className="thread-journey-stop" style={{ left: `${x}%`, top: y }}>
      <button type="button" data-stop-id={stop.id} aria-label={`查看任务：${stop.title}`} aria-pressed={selectedId === stop.id} onClick={() => onSelect(stop)}>
        <span className="thread-journey-dot" aria-hidden="true">{stop.status === 'done' ? '✓' : stop.status === 'locked' ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Z" stroke="currentColor" strokeWidth="1.5" /></svg> : index + 1}</span>
        <span className="thread-journey-label">{stop.title}</span><small>{statusNames[stop.status]}</small>
      </button>
    </li>)}
  </ol>;
}
