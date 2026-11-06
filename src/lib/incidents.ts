import type { IncidentRecord, IncidentStatus } from "@/lib/threat";

const STORAGE_KEY = "border-sentinel-incidents";
const CHANGE_EVENT = "border-sentinel:incidents";

export function readIncidentRecords(): IncidentRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? (parsed as IncidentRecord[]) : [];
  } catch {
    return [];
  }
}

export function nextIncidentId(records: IncidentRecord[]) {
  const highest = records.reduce((max, item) => {
    const match = /^INC-(\d+)$/.exec(item.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `INC-${String(highest + 1).padStart(5, "0")}`;
}

function saveRecords(records: IncidentRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function recordIncident(incident: IncidentRecord): IncidentRecord {
  const existing = readIncidentRecords();
  const record = { ...incident, id: nextIncidentId(existing), status: incident.status ?? "NEW" as const };
  saveRecords([record, ...existing]);
  return record;
}

export function updateIncident(id: string, updates: { status?: IncidentStatus; reviewNotes?: string }): IncidentRecord | undefined {
  const records = readIncidentRecords();
  let updated: IncidentRecord | undefined;
  const next = records.map((record) => {
    if (record.id !== id) return record;
    const status = updates.status ?? record.status ?? "NEW";
    const changedStatus = status !== (record.status ?? "NEW");
    const updatedTimeline = changedStatus
      ? [...(record.timeline ?? []), { timestamp: Date.now(), event: `Status updated to ${status} during human review.` }]
      : record.timeline;
    updated = updatedTimeline
      ? { ...record, ...updates, status, timeline: updatedTimeline }
      : { ...record, ...updates, status };
    return updated;
  });
  if (updated) saveRecords(next.filter((record): record is IncidentRecord => record !== undefined));
  return updated;
}

export function subscribeIncidentRecords(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}