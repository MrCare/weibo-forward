interface ActorRunLogState {
  lines: string[];
  running: boolean;
  dryRun: boolean;
  updatedAt: number;
}

const actorRuns = new Map<string, ActorRunLogState>();
const MAX_LINES = 2000;
const RETAIN_MS = 30 * 60 * 1000;

function cleanupStaleRuns(now = Date.now()): void {
  for (const [actorId, state] of actorRuns) {
    if (!state.running && now - state.updatedAt > RETAIN_MS) {
      actorRuns.delete(actorId);
    }
  }
}

export function startActorRun(actorId: string, dryRun = false): void {
  cleanupStaleRuns();
  actorRuns.set(actorId, {
    lines: [],
    running: true,
    dryRun,
    updatedAt: Date.now(),
  });
}

export function appendActorRunLog(actorId: string, line: string): void {
  const state = actorRuns.get(actorId);
  if (!state || !line) return;
  state.lines.push(line);
  if (state.lines.length > MAX_LINES) {
    state.lines.splice(0, state.lines.length - MAX_LINES);
  }
  state.updatedAt = Date.now();
}

export function finishActorRun(actorId: string): void {
  const state = actorRuns.get(actorId);
  if (!state) return;
  state.running = false;
  state.updatedAt = Date.now();
}

export function getActorRunLogSnapshot(actorId: string, offset = 0) {
  cleanupStaleRuns();
  const state = actorRuns.get(actorId);
  if (!state) {
    return { running: false, dryRun: false, lines: [], nextOffset: 0 };
  }

  const safeOffset = Math.max(0, Math.min(offset, state.lines.length));
  return {
    running: state.running,
    dryRun: state.dryRun,
    lines: state.lines.slice(safeOffset),
    nextOffset: state.lines.length,
  };
}
