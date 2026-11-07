import type { IncidentRecord, IncidentStatus, ThreatLevel } from "@/lib/threat";
import type { TargetType } from "@/lib/radar";
import type { SensorKind } from "@/lib/fusion";
import {
  getBackendIncidents,
  createBackendIncident as apiCreateIncident,
  updateBackendIncident as apiUpdateIncident,
  getWebSocketUrl,
  type BackendIncidentItem,
} from "@/services/api";

const STORAGE_KEY = "border-sentinel-incidents";
const CHANGE_EVENT = "border-sentinel:incidents";

let memoryCache: IncidentRecord[] | null = null;
let wsInstance: WebSocket | null = null;
let isSyncing = false;

function normalizeBackendIncident(b: BackendIncidentItem): IncidentRecord {
  const ts = typeof b.timestamp === "string" ? new Date(b.timestamp).getTime() : (b.timestamp || Date.now());
  const normalizedTimeline = (b.timeline || []).map((t) => ({
    timestamp: typeof t.timestamp === "string" ? new Date(t.timestamp).getTime() : (t.timestamp || ts),
    event: t.event,
  }));

  const loc = b.location;
  const mapX = b.mapX ?? (loc && typeof loc["map_x"] === "number" ? (loc["map_x"] as number) : undefined);
  const mapY = b.mapY ?? (loc && typeof loc["map_y"] === "number" ? (loc["map_y"] as number) : undefined);

  return {
    id: b.id,
    targetId: b.targetId || b.target_id || "UNKNOWN",
    type: (b.type || "human") as TargetType,
    timestamp: ts,
    sector: b.sector && b.sector !== "—" ? b.sector : "B",
    position: b.position || (mapX && mapY ? `Map (${mapX.toFixed(1)}, ${mapY.toFixed(1)})` : "Border Area"),
    score: b.score ?? 50,
    level: (b.level || "MEDIUM") as ThreatLevel,
    sensors: (b.sensors || ["radar"]) as SensorKind[],
    factors: b.factors || [],
    recommendation: b.recommendation || "Review incident observations.",
    mapX,
    mapY,
    status: (b.status || "NEW") as IncidentStatus,
    reviewNotes: b.reviewNotes || "",
    timeline: normalizedTimeline,
  };
}

export function readIncidentRecords(): IncidentRecord[] {
  if (memoryCache !== null) {
    return memoryCache;
  }
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    memoryCache = Array.isArray(parsed) ? (parsed as IncidentRecord[]) : [];
    return memoryCache;
  } catch {
    return [];
  }
}

function saveRecords(records: IncidentRecord[]) {
  memoryCache = records;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore local storage quota errors
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export async function syncIncidentsFromBackend(): Promise<IncidentRecord[]> {
  if (isSyncing || typeof window === "undefined") return readIncidentRecords();
  isSyncing = true;
  try {
    const response = await getBackendIncidents(200);
    if (response && Array.isArray(response.incidents)) {
      const records = response.incidents.map(normalizeBackendIncident);
      saveRecords(records);
      return records;
    }
  } catch (err) {
    console.warn("Backend incidents fetch failed, using cached records:", err);
  } finally {
    isSyncing = false;
  }
  return readIncidentRecords();
}

function initIncidentWebSocket() {
  if (typeof window === "undefined" || wsInstance) return;
  try {
    const url = getWebSocketUrl("incidents");
    wsInstance = new WebSocket(url);

    wsInstance.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "incident_created" && msg.data) {
          const newRecord = normalizeBackendIncident(msg.data);
          const current = readIncidentRecords().filter((r) => r.id !== newRecord.id);
          saveRecords([newRecord, ...current]);
        } else if (msg.type === "incident_updated" && msg.data) {
          const updatedRecord = normalizeBackendIncident(msg.data);
          const current = readIncidentRecords().map((r) => (r.id === updatedRecord.id ? updatedRecord : r));
          saveRecords(current);
        }
      } catch (e) {
        console.error("Error parsing incident websocket message", e);
      }
    };

    wsInstance.onclose = () => {
      wsInstance = null;
      window.setTimeout(initIncidentWebSocket, 5000);
    };

    wsInstance.onerror = () => {
      if (wsInstance) {
        wsInstance.close();
      }
    };
  } catch {
    // Ignore initial socket failure
  }
}

// Auto-sync on module execution in browser
if (typeof window !== "undefined") {
  syncIncidentsFromBackend();
  initIncidentWebSocket();
}

export function nextIncidentId(records: IncidentRecord[]) {
  const highest = records.reduce((max, item) => {
    const match = /^INC-(\d+)$/.exec(item.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `INC-${String(highest + 1).padStart(5, "0")}`;
}

export function recordIncident(incident: IncidentRecord): IncidentRecord {
  const existing = readIncidentRecords();
  const id = incident.id || nextIncidentId(existing);
  const record: IncidentRecord = {
    ...incident,
    id,
    status: incident.status ?? "NEW",
  };
  saveRecords([record, ...existing]);

  // Attempt backend persistence
  if (incident.targetId) {
    apiCreateIncident(incident.targetId)
      .then((created) => {
        const normalized = normalizeBackendIncident(created);
        const current = readIncidentRecords().map((r) => (r.id === record.id ? normalized : r));
        saveRecords(current);
      })
      .catch((err) => {
        console.warn("Failed to create incident on backend:", err);
      });
  }

  return record;
}

export async function createBackendIncidentDirect(targetId: string): Promise<IncidentRecord> {
  const created = await apiCreateIncident(targetId);
  const normalized = normalizeBackendIncident(created);
  const current = readIncidentRecords().filter((r) => r.id !== normalized.id);
  saveRecords([normalized, ...current]);
  return normalized;
}

export function updateIncident(
  id: string,
  updates: { status?: IncidentStatus; reviewNotes?: string }
): IncidentRecord | undefined {
  const records = readIncidentRecords();
  let updated: IncidentRecord | undefined;
  const next = records.map((record) => {
    if (record.id !== id) return record;
    const status = updates.status ?? record.status ?? "NEW";
    const changedStatus = status !== (record.status ?? "NEW");
    const updatedTimeline = changedStatus
      ? [
          ...(record.timeline ?? []),
          { timestamp: Date.now(), event: `Status updated to ${status} during human review.` },
        ]
      : record.timeline;
    updated = {
      ...record,
      ...updates,
      status,
      timeline: updatedTimeline,
    };
    return updated;
  });

  if (updated) {
    saveRecords(next.filter((record): record is IncidentRecord => record !== undefined));
    apiUpdateIncident(id, {
      status: updates.status,
      review_notes: updates.reviewNotes,
    }).catch((err) => console.warn("Failed to persist incident update to backend:", err));
  }

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
