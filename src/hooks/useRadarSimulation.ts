import { useCallback, useEffect, useRef, useState } from "react";
import {
  RADAR_RANGE_M,
  TRAIL_LENGTH,
  type RadarTarget,
  type RadarTargetUpdate,
  type TargetType,
  sectorOf,
} from "@/lib/radar";
import {
  getRadarTargets,
  startRadarSimulation,
  stopRadarSimulation,
  resetRadarSimulation,
  createRadarTarget,
  getWebSocketUrl,
  type BackendRadarTarget,
} from "@/services/api";

export interface SimSettings {
  targetCount: number;
  simSpeed: number;
  noise: number;
  trackingEnabled: boolean;
}

const TYPE_SPEED: Record<TargetType, number> = {
  human: 12,
  animal: 7,
  vehicle: 35,
  drone: 28,
};

function normalizeConfidence(val: number | undefined): number {
  if (val === undefined || Number.isNaN(val)) return 85;
  if (val <= 1.0) return Math.min(99, Math.max(50, Math.round(val * 100)));
  return Math.min(99, Math.max(50, Math.round(val)));
}

function makeTarget(index: number, type: TargetType): RadarTarget {
  const bearing = Math.random() * 360;
  const dist = 250 + Math.random() * (RADAR_RANGE_M - 350);
  const rad = (bearing * Math.PI) / 180;
  const x = Math.sin(rad) * dist;
  const y = Math.cos(rad) * dist;
  return {
    id: `T-${101 + index}`,
    type,
    x,
    y,
    speed: TYPE_SPEED[type] * (0.8 + Math.random() * 0.4),
    heading: Math.random() * 360,
    sector: sectorOf({ x, y }),
    confidence: 82 + Math.round(Math.random() * 16),
    status: "TRACKING",
    timestamp: Date.now(),
    trail: [],
  };
}

const ORDER: TargetType[] = ["human", "animal", "vehicle", "drone"];

function seed(count: number): RadarTarget[] {
  return Array.from({ length: count }, (_, i) => makeTarget(i, ORDER[i % ORDER.length]!));
}

function mapBackendToRadarTarget(b: BackendRadarTarget, prev?: RadarTarget): RadarTarget {
  const confidence = normalizeConfidence(b.confidence);
  const ts = typeof b.timestamp === "string" ? new Date(b.timestamp).getTime() : (b.timestamp || Date.now());
  const trail = [...(prev?.trail ?? []), { x: b.x, y: b.y }].slice(-TRAIL_LENGTH);

  return {
    id: b.id,
    type: b.type,
    x: b.x,
    y: b.y,
    speed: b.speed,
    heading: b.heading,
    sector: b.sector || sectorOf({ x: b.x, y: b.y }),
    confidence,
    status: "TRACKING",
    timestamp: ts,
    trail,
  };
}

export function useRadarSimulation() {
  const [settings, setSettings] = useState<SimSettings>({
    targetCount: 4,
    simSpeed: 1,
    noise: 0.35,
    trackingEnabled: true,
  });
  const [running, setRunning] = useState(true);
  const [targets, setTargets] = useState<RadarTarget[]>(() => seed(4));
  const [connected, setConnected] = useState(false);
  const nextIndex = useRef(4);
  const wsRef = useRef<WebSocket | null>(null);

  // Ingest updates from external backend sources
  const ingest = useCallback((updates: RadarTargetUpdate[]) => {
    setTargets((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const u of updates) {
        const old = map.get(u.id);
        const trail = [...(old?.trail ?? []), { x: u.x, y: u.y }].slice(-TRAIL_LENGTH);
        map.set(u.id, {
          id: u.id,
          type: u.type,
          x: u.x,
          y: u.y,
          speed: u.speed ?? old?.speed ?? 0,
          heading: u.heading ?? old?.heading ?? 0,
          sector: u.sector ?? sectorOf(u),
          confidence: normalizeConfidence(u.confidence ?? old?.confidence),
          status: u.status ?? "TRACKING",
          timestamp: u.timestamp ?? Date.now(),
          trail,
        });
      }
      return Array.from(map.values());
    });
  }, []);

  // Fetch initial targets from backend
  useEffect(() => {
    getRadarTargets()
      .then((res) => {
        if (res && Array.isArray(res.targets) && res.targets.length > 0) {
          setTargets((prev) => {
            const map = new Map(prev.map((p) => [p.id, p]));
            return res.targets.map((bt) => mapBackendToRadarTarget(bt, map.get(bt.id)));
          });
        }
      })
      .catch((err) => {
        console.warn("Could not fetch backend radar targets:", err);
      });
  }, []);

  // Authenticated WebSocket for live backend radar tracking
  useEffect(() => {
    let reconnectTimeout: number | undefined;
    let isDisposed = false;

    function connectWs() {
      if (isDisposed) return;
      try {
        const url = getWebSocketUrl("radar");
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isDisposed) {
            ws.close();
            return;
          }
          setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "target_update" && message.data) {
              const u = message.data as BackendRadarTarget;
              setTargets((prev) => {
                const old = prev.find((p) => p.id === u.id);
                if (old) {
                  return prev.map((p) => (p.id === u.id ? mapBackendToRadarTarget(u, p) : p));
                }
                return [...prev, mapBackendToRadarTarget(u)];
              });
            } else if (message.type === "targets_frame" && Array.isArray(message.data)) {
              const frameList = message.data as BackendRadarTarget[];
              setTargets((prev) => {
                const map = new Map(prev.map((p) => [p.id, p]));
                return frameList.map((bt) => mapBackendToRadarTarget(bt, map.get(bt.id)));
              });
            } else if (message.type === "simulation_seed" && message.data?.targets) {
              const seedList = message.data.targets as BackendRadarTarget[];
              setTargets(seedList.map((bt) => mapBackendToRadarTarget(bt)));
            } else if (message.type === "simulation_status") {
              if (message.status === "stopped") {
                setRunning(false);
              } else if (message.status === "running") {
                setRunning(true);
              }
            }
          } catch (e) {
            console.error("Radar WebSocket message parse error:", e);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;
          if (!isDisposed) {
            reconnectTimeout = window.setTimeout(connectWs, 3000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        setConnected(false);
        if (!isDisposed) {
          reconnectTimeout = window.setTimeout(connectWs, 3000);
        }
      }
    }

    connectWs();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Local fallback simulation loop when WebSocket is disconnected or in standalone mode
  useEffect(() => {
    if (!running || connected) return;
    const id = window.setInterval(() => {
      setTargets((prev) =>
        prev.map((t) => {
          const drift = (Math.random() - 0.5) * 14 * settings.noise;
          const heading = (t.heading + drift + 360) % 360;
          const metres = (t.speed / 3.6) * settings.simSpeed;
          const rad = (heading * Math.PI) / 180;
          let x = t.x + Math.sin(rad) * metres;
          let y = t.y + Math.cos(rad) * metres;
          let nextHeading = heading;
          if (Math.hypot(x, y) > RADAR_RANGE_M - 30) {
            nextHeading = (Math.atan2(-x, -y) * 180) / Math.PI;
            x = t.x;
            y = t.y;
          }
          return {
            ...t,
            x,
            y,
            heading: (nextHeading + 360) % 360,
            sector: sectorOf({ x, y }),
            status: settings.trackingEnabled ? "TRACKING" : "ACQUIRING",
            confidence: Math.max(
              60,
              Math.min(99, t.confidence + Math.round((Math.random() - 0.5) * 4)),
            ),
            timestamp: Date.now(),
            trail: [...t.trail, { x, y }].slice(-TRAIL_LENGTH),
          };
        }),
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, connected, settings.simSpeed, settings.noise, settings.trackingEnabled]);

  const handleStart = useCallback(async () => {
    setRunning(true);
    try {
      await startRadarSimulation(settings.targetCount);
    } catch (e) {
      console.warn("Backend start radar simulation call failed, running locally:", e);
    }
  }, [settings.targetCount]);

  const handlePause = useCallback(async () => {
    setRunning(false);
    try {
      await stopRadarSimulation();
    } catch (e) {
      console.warn("Backend stop radar simulation call failed:", e);
    }
  }, []);

  const reset = useCallback(async () => {
    nextIndex.current = settings.targetCount;
    try {
      const res = await resetRadarSimulation(settings.targetCount);
      if (res && res.targets) {
        setTargets(res.targets.map((bt) => mapBackendToRadarTarget(bt)));
        setRunning(true);
        return;
      }
    } catch (e) {
      console.warn("Backend reset radar simulation call failed, resetting locally:", e);
    }
    setTargets(seed(settings.targetCount));
  }, [settings.targetCount]);

  const addTarget = useCallback(
    async (spec: { type: TargetType; distance: number; bearing: number; speed: number; heading: number }) => {
      const rad = (spec.bearing * Math.PI) / 180;
      const x = Math.sin(rad) * spec.distance;
      const y = Math.cos(rad) * spec.distance;
      const tid = `T-${101 + nextIndex.current}`;
      nextIndex.current += 1;

      try {
        const created = await createRadarTarget({
          target_id: tid,
          target_type: spec.type,
          x,
          y,
          speed: spec.speed,
          heading: spec.heading,
          confidence: 0.88,
          simulated: true,
        });
        if (created) {
          const radarT = mapBackendToRadarTarget(created);
          setTargets((prev) => [...prev, radarT]);
          setSettings((s) => ({ ...s, targetCount: s.targetCount + 1 }));
          return radarT.id;
        }
      } catch (err) {
        console.warn("Failed to create radar target on backend, using local fallback:", err);
      }

      const created: RadarTarget = {
        id: tid,
        type: spec.type,
        x,
        y,
        speed: spec.speed,
        heading: spec.heading,
        sector: sectorOf({ x, y }),
        confidence: 88,
        status: "ACQUIRING",
        timestamp: Date.now(),
        trail: [],
      };
      setTargets((prev) => [...prev, created]);
      setSettings((s) => ({ ...s, targetCount: s.targetCount + 1 }));
      return created.id;
    },
    [],
  );

  return {
    targets,
    settings,
    setSettings,
    running,
    setRunning,
    handleStart,
    handlePause,
    reset,
    addTarget,
    ingest,
    connected,
  };
}
