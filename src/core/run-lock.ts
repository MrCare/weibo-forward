const activeActors = new Set<string>();

export class RunInProgressError extends Error {
  constructor(message = "已有转发任务正在执行，请等待完成后再试") {
    super(message);
    this.name = "RunInProgressError";
  }
}

export function isRunInProgress(actorId: string): boolean {
  return activeActors.has(actorId);
}

export async function withRunLock<T>(actorId: string, fn: () => Promise<T>): Promise<T> {
  if (activeActors.has(actorId)) {
    throw new RunInProgressError();
  }
  activeActors.add(actorId);
  try {
    return await fn();
  } finally {
    activeActors.delete(actorId);
  }
}
