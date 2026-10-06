export interface JobIdentity {
  jobId: string;
  sessionId: string;
  sourceRevision: number;
}

export function jobResultIsCurrent(
  started: JobIdentity,
  result: JobIdentity,
  live: { jobId: string | null; sessionId: string; sourceRevision: number },
): boolean {
  return (
    live.jobId === started.jobId &&
    live.sessionId === started.sessionId &&
    live.sourceRevision === started.sourceRevision &&
    result.jobId === started.jobId &&
    result.sessionId === started.sessionId &&
    result.sourceRevision === started.sourceRevision
  );
}
