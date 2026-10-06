import { describe, expect, it } from "vitest";
import { jobResultIsCurrent, type JobIdentity } from "./jobIdentity";

const started: JobIdentity = {
  jobId: "job_1",
  sessionId: "session_1",
  sourceRevision: 4,
};

describe("jobResultIsCurrent", () => {
  it("accepts a result that still matches the job, session, and source revision", () => {
    expect(
      jobResultIsCurrent(started, started, {
        jobId: "job_1",
        sessionId: "session_1",
        sourceRevision: 4,
      }),
    ).toBe(true);
  });

  it("rejects an older result after a newer job or source revision is current", () => {
    expect(
      jobResultIsCurrent(started, started, {
        jobId: "job_2",
        sessionId: "session_1",
        sourceRevision: 4,
      }),
    ).toBe(false);
    expect(
      jobResultIsCurrent(started, started, {
        jobId: "job_1",
        sessionId: "session_1",
        sourceRevision: 5,
      }),
    ).toBe(false);
    expect(
      jobResultIsCurrent(started, { ...started, sourceRevision: 9 }, {
        jobId: "job_1",
        sessionId: "session_1",
        sourceRevision: 4,
      }),
    ).toBe(false);
  });
});
