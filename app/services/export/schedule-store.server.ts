import fs from "node:fs/promises";
import path from "node:path";
import type { ExportConfig } from "./export.server";

export type ScheduledExportRecord = {
  id: string;
  shop: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
  nextRunAt: string | null;
  runCount: number;
  remainingRuns: number | null;
  config: ExportConfig;
  lastStatus?: "idle" | "running" | "completed" | "failed" | null;
  lastMessage?: string | null;
  lastResultFilePath?: string | null;
  lastResultFileName?: string | null;
  lastResultContentType?: string | null;
  lastBulkJobId?: string | null;
};

type ScheduleStore = {
  schedules: ScheduledExportRecord[];
};

const DATA_DIR = path.join(process.cwd(), "app-data");
const SCHEDULES_FILE = path.join(DATA_DIR, "export-schedules.json");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(SCHEDULES_FILE);
  } catch {
    await fs.writeFile(
      SCHEDULES_FILE,
      JSON.stringify({ schedules: [] }, null, 2),
      "utf8",
    );
  }
}

async function readStore(): Promise<ScheduleStore> {
  await ensureStore();
  const raw = await fs.readFile(SCHEDULES_FILE, "utf8");
  return JSON.parse(raw) as ScheduleStore;
}

async function writeStore(data: ScheduleStore) {
  await ensureStore();
  await fs.writeFile(SCHEDULES_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function parseDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function parseTime(timeStr: string) {
  const [hour, minute] = timeStr.split(":").map(Number);
  return { hour, minute };
}

function toUtcFromZoned(
  input: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string,
) {
  const second = input.second ?? 0;

  let utc = new Date(
    Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, second),
  );

  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(utc, timeZone);

    const desiredMinutes =
      Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, second) /
      60000;

    const actualMinutes =
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      ) / 60000;

    const diffMinutes = desiredMinutes - actualMinutes;
    if (diffMinutes === 0) break;

    utc = new Date(utc.getTime() + diffMinutes * 60_000);
  }

  return utc;
}

function addIntervalInZone(
  date: Date,
  timeZone: string,
  repeatEvery: number,
  repeatUnit: "days" | "weeks" | "months",
) {
  const parts = getZonedParts(date, timeZone);

  const base = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );

  if (repeatUnit === "days") {
    base.setUTCDate(base.getUTCDate() + repeatEvery);
  } else if (repeatUnit === "weeks") {
    base.setUTCDate(base.getUTCDate() + repeatEvery * 7);
  } else {
    base.setUTCMonth(base.getUTCMonth() + repeatEvery);
  }

  return toUtcFromZoned(
    {
      year: base.getUTCFullYear(),
      month: base.getUTCMonth() + 1,
      day: base.getUTCDate(),
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    },
    timeZone,
  );
}

export function computeInitialNextRun(config: ExportConfig, now = new Date()) {
  if (!config.scheduleOnDate || !config.scheduleOnTime || !config.timezone) {
    return null;
  }

  const dateParts = parseDate(config.scheduleOnDate);
  const timeParts = parseTime(config.scheduleOnTime);

  let next = toUtcFromZoned(
    {
      ...dateParts,
      ...timeParts,
      second: 0,
    },
    config.timezone,
  );

  while (next.getTime() <= now.getTime()) {
    next = addIntervalInZone(
      next,
      config.timezone,
      Math.max(1, config.repeatEvery || 1),
      config.repeatUnit || "days",
    );
  }

  return next.toISOString();
}

export function computeFollowingRun(schedule: ScheduledExportRecord) {
  if (!schedule.nextRunAt) return null;

  const next = addIntervalInZone(
    new Date(schedule.nextRunAt),
    schedule.config.timezone,
    Math.max(1, schedule.config.repeatEvery || 1),
    schedule.config.repeatUnit || "days",
  );

  return next.toISOString();
}

export async function listScheduledExports(shop?: string) {
  const store = await readStore();
  if (!shop) return store.schedules;
  return store.schedules.filter((s) => s.shop === shop);
}

export async function getScheduledExport(id: string) {
  const store = await readStore();
  return store.schedules.find((s) => s.id === id) || null;
}

export async function createScheduledExport(
  input: Omit<
    ScheduledExportRecord,
    "createdAt" | "updatedAt" | "runCount" | "lastStatus" | "lastMessage"
  >,
) {
  const store = await readStore();
  const now = new Date().toISOString();

  const record: ScheduledExportRecord = {
    ...input,
    createdAt: now,
    updatedAt: now,
    runCount: 0,
    lastStatus: "idle",
    lastMessage: null,
  };

  store.schedules.unshift(record);
  await writeStore(store);
  return record;
}

export async function updateScheduledExport(
  id: string,
  updater: (schedule: ScheduledExportRecord) => ScheduledExportRecord,
) {
  const store = await readStore();
  const idx = store.schedules.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const next = updater(store.schedules[idx]);
  next.updatedAt = new Date().toISOString();
  store.schedules[idx] = next;
  await writeStore(store);
  return next;
}

export async function deleteScheduledExport(id: string) {
  const store = await readStore();
  const before = store.schedules.length;
  store.schedules = store.schedules.filter((s) => s.id !== id);
  if (store.schedules.length === before) return false;
  await writeStore(store);
  return true;
}

export async function listDueScheduledExports(now = new Date()) {
  const store = await readStore();
  return store.schedules.filter(
    (s) =>
      s.enabled &&
      s.nextRunAt &&
      new Date(s.nextRunAt).getTime() <= now.getTime() &&
      s.lastStatus !== "running",
  );
}