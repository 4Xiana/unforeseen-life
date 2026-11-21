import type { ThreadRoute } from './thread-map';
import type { DesiredOutcome, QuestCategory, QuestRecord } from './types';
import { OUTCOME_META, OUTCOME_ORDER, primaryOutcome, recordOutcomes } from './outcome-meta';

export type ThreadGraphRelation = 'category' | 'custom';
export interface ThreadGraphLane {
  outcome: DesiredOutcome;
  label: string;
  color: string;
  /** Fraction of the drawing surface width, measured at the node center. */
  x: number;
}
export interface ThreadGraphNode {
  id: string;
  record: QuestRecord;
  category: QuestCategory;
  outcome: DesiredOutcome;
  lane: number;
  x: number;
  y: number;
  routeIds: string[];
}
export interface ThreadGraphEdge {
  id: string;
  from: string;
  to: string;
  /** The legacy category kind means chronological order in an outcome direction, never causality. */
  kinds: ThreadGraphRelation[];
  sourceIds: string[];
  sources: { id: string; kind: ThreadGraphRelation }[];
}
export interface ThreadGraph {
  lanes: ThreadGraphLane[];
  nodes: ThreadGraphNode[];
  edges: ThreadGraphEdge[];
  height: number;
  totalCount: number;
  hiddenCount: number;
  /** All known completed records in each route, independent of the visible limit. */
  routeRecordIds: Record<string, string[]>;
  visibleRouteRecordIds: Record<string, string[]>;
}

const ROW_HEIGHT = 64;
const TOP_INSET = 48;
const BOTTOM_INSET = 48;
const DEFAULT_LIMIT = 20;

function timestamp(record: QuestRecord): number {
  const value = Date.parse(record.date);
  // Undated legacy entries remain visible when expanded; no completion date is invented.
  return Number.isNaN(value) ? -Infinity : value;
}
function compareRecords(a: QuestRecord, b: QuestRecord): number {
  const difference = timestamp(a) - timestamp(b);
  return (Number.isNaN(difference) ? 0 : difference) || a.id.localeCompare(b.id);
}

/**
 * Layout of completed handbook records only. A record is one node even when it
 * belongs to several themes. Theme membership comes from explicit custom routes;
 * direction links merely trace chronological order within a desired outcome. Goal chapter
 * records have a separate identity and remain in the goal route detail: matching
 * a title or date is insufficient evidence that two records are the same task.
 *
 * The caller owns the width. Five lane centers are 20% apart, leaving room for
 * 44px hit targets in the 288px content width of a 320px phone with 16px gutters.
 */
export function buildThreadGraph(
  routes: ThreadRoute[],
  quests: QuestRecord[],
  options: { limit?: number } = {},
): ThreadGraph {
  const lanes: ThreadGraphLane[] = OUTCOME_ORDER.map((outcome, index) => ({
    outcome, label: OUTCOME_META[outcome].label, color: OUTCOME_META[outcome].color,
    x: (index + 0.5) / OUTCOME_ORDER.length,
  }));
  // Duplicate transport entries cannot create duplicate nodes. Keep the canonical
  // first entry rather than merging evidence from potentially conflicting copies.
  const byId = new Map<string, QuestRecord>();
  quests.forEach(record => { if (!byId.has(record.id)) byId.set(record.id, record); });
  const all = [...byId.values()].sort(compareRecords);
  const requested = options.limit ?? DEFAULT_LIMIT;
  const limit = requested === Infinity ? all.length
    : Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : DEFAULT_LIMIT;
  const visible = all.slice(Math.max(0, all.length - limit));
  const visibleIds = new Set(visible.map(record => record.id));
  const routeRecordIds: Record<string, string[]> = {};
  const visibleRouteRecordIds: Record<string, string[]> = {};
  const memberships = new Map<string, string[]>();
  const edgeByPair = new Map<string, ThreadGraphEdge>();

  for (const route of [...routes].sort((a, b) => Number(a.kind !== 'category') - Number(b.kind !== 'category') || a.id.localeCompare(b.id))) {
    const ids = route.kind === 'goal' ? [] : [...new Set(route.stops
      .filter(stop => stop.status === 'done' && !!stop.record && byId.has(stop.record.id))
      .map(stop => stop.record!.id))]
      .filter(id => route.kind !== 'category' || !!route.outcome && recordOutcomes(byId.get(id)!).includes(route.outcome))
      .sort((a, b) => compareRecords(byId.get(a)!, byId.get(b)!));
    routeRecordIds[route.id] = ids;
    const shown = ids.filter(id => visibleIds.has(id));
    visibleRouteRecordIds[route.id] = shown;
    for (const id of ids) {
      const memberIds = memberships.get(id) || [];
      if (!memberIds.includes(route.id)) memberships.set(id, [...memberIds, route.id]);
    }
    if (route.kind === 'goal') continue;
    const kind = route.kind;
    for (let i = 1; i < shown.length; i++) {
      const from = shown[i - 1], to = shown[i];
      const key = JSON.stringify([from, to]);
      let edge = edgeByPair.get(key);
      if (!edge) {
        edge = { id: key, from, to, kinds: [], sourceIds: [], sources: [] };
        edgeByPair.set(key, edge);
      }
      if (!edge.kinds.includes(kind)) edge.kinds.push(kind);
      if (!edge.sourceIds.includes(route.id)) {
        edge.sourceIds.push(route.id);
        edge.sources.push({ id: route.id, kind });
      }
    }
  }

  const nodes: ThreadGraphNode[] = visible.map((record, index) => {
    const outcome = primaryOutcome(record);
    const lane = OUTCOME_ORDER.indexOf(outcome);
    return { id: record.id, record, category: record.category, outcome, lane, x: lanes[lane].x,
      y: TOP_INSET + index * ROW_HEIGHT, routeIds: memberships.get(record.id) || [] };
  });
  return {
    lanes, nodes, edges: [...edgeByPair.values()],
    height: nodes.length ? TOP_INSET + (nodes.length - 1) * ROW_HEIGHT + BOTTOM_INSET : 160,
    totalCount: all.length, hiddenCount: all.length - visible.length,
    routeRecordIds, visibleRouteRecordIds,
  };
}
