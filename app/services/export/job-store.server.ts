import fs from "node:fs/promises";
import path from "node:path";

export type ExportJobStatus =
  | "queued"
  | "running"
  | "transforming"
  | "completed"
  | "failed";

export type ExportEntityStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type ExportJobRecord = {
  id: string;
  shop: string;
  createdAt: string;
  updatedAt: string;
  status: ExportJobStatus;
  message?: string;
  config: any;
  entities: Record<
    string,
    {
      status: ExportEntityStatus;
      bulkOperationId?: string | null;
      url?: string | null;
      partialDataUrl?: string | null;
      errorCode?: string | null;
      objectCount?: string | null;
    }
  >;
  finalFilePath?: string | null;
  finalFileName?: string | null;
  finalContentType?: string | null;
};

const DATA_DIR = path.join(process.cwd(), "app-data");
const JOBS_FILE = path.join(DATA_DIR, "export-jobs.json");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(JOBS_FILE);
  } catch {
    await fs.writeFile(JOBS_FILE, JSON.stringify({ jobs: [] }, null, 2), "utf8");
  }
}

async function readStore(): Promise<{ jobs: ExportJobRecord[] }> {
  await ensureStore();
  const raw = await fs.readFile(JOBS_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeStore(data: { jobs: ExportJobRecord[] }) {
  await ensureStore();
  await fs.writeFile(JOBS_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function createExportJob(
  input: Omit<ExportJobRecord, "createdAt" | "updatedAt">,
) {
  const store = await readStore();
  const now = new Date().toISOString();

  const job: ExportJobRecord = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  store.jobs.unshift(job);
  await writeStore(store);
  return job;
}

export async function getExportJob(id: string) {
  const store = await readStore();
  return store.jobs.find((j) => j.id === id) || null;
}

export async function listExportJobs(shop?: string) {
  const store = await readStore();
  if (!shop) return store.jobs;
  return store.jobs.filter((j) => j.shop === shop);
}

export async function updateExportJob(
  id: string,
  updater: (job: ExportJobRecord) => ExportJobRecord,
) {
  const store = await readStore();
  const idx = store.jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;

  const next = updater(store.jobs[idx]);
  next.updatedAt = new Date().toISOString();
  store.jobs[idx] = next;
  await writeStore(store);
  return next;
}