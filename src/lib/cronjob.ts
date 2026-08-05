const API_BASE = "https://api.cron-job.org";

function apiKey() {
  const key = process.env.CRONJOB_API_KEY;
  if (!key) throw new Error("Missing CRONJOB_API_KEY environment variable");
  return key;
}

async function callApi<T = unknown>(
  path: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`cron-job.org API ${method} ${path} failed: ${JSON.stringify(data)}`);
  }
  return data as T;
}

export type CronJobSchedule = {
  timezone: string;
  hours: number[];
  minutes: number[];
  mdays: number[];
  months: number[];
  wdays: number[];
};

export type CronJobSpec = {
  title: string;
  url: string;
  bearerSecret: string;
  schedule: CronJobSchedule;
};

function toJobPayload(spec: CronJobSpec) {
  return {
    enabled: true,
    title: spec.title,
    url: spec.url,
    requestMethod: 1, // POST
    extendedData: {
      headers: { Authorization: `Bearer ${spec.bearerSecret}` },
    },
    schedule: spec.schedule,
  };
}

export async function createCronJob(spec: CronJobSpec): Promise<number> {
  const data = await callApi<{ jobId: number }>("/jobs", "PUT", { job: toJobPayload(spec) });
  return data.jobId;
}

export function updateCronJob(jobId: number, spec: CronJobSpec) {
  return callApi(`/jobs/${jobId}`, "PATCH", { job: toJobPayload(spec) });
}

export function deleteCronJob(jobId: number) {
  return callApi(`/jobs/${jobId}`, "DELETE");
}
