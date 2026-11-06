import { useCallback, useEffect, useRef, useState } from "react";
import {
  RADAR_RANGE_M,
  TRAIL_LENGTH,
  type RadarTarget,
  type RadarTargetUpdate,
  type TargetType,
  sectorOf,
} from "@/lib/radar";

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

export function useRadarSimulation() {
  const [settings, setSettings] = useState<SimSettings>({
    targetCount: 4,
    simSpeed: 1,
    noise: 0.35,
    trackingEnabled: true,
  });
  const [running, setRunning] = useState(true);
  const [targets, setTargets] = useState<RadarTarget[]>(() => seed(4));
  const nextIndex = useRef(4);

  // Match the live target list to the requested target count.
  useEffect(() => {
    setTargets((prev) => {
      if (prev.length === settings.targetCount) return prev;
      if (prev.length > settings.targetCount) return prev.slice(0, settings.targetCount);
      const added = Array.from({ length: settings.targetCount - prev.length }, () => {
        const t = makeTarget(nextIndex.current, ORDER[nextIndex.current % ORDER.length]!);
        nextIndex.current += 1;
        return t;
      });
      return [...prev, ...added];
    });
  }, [settings.targetCount]);

  /** Backend hook: apply an external radar frame (websocket / polling). */
  const ingest = useCallback((updates: RadarTargetUpdate[]) => {
    setTargets((prev) =>
      updates.map((u) => {
        const old = prev.find((p) => p.id === u.id);
        const trail = [...(old?.trail ?? []), { x: u.x, y: u.y }].slice(-TRAIL_LENGTH);
        return {
          id: u.id,
          type: u.type,
          x: u.x,
          y: u.y,
          speed: u.speed ?? old?.speed ?? 0,
          heading: u.heading ?? old?.heading ?? 0,
          sector: u.sector ?? sectorOf(u),
          confidence: u.confidence ?? old?.confidence ?? 90,
          status: u.status ?? "TRACKING",
          timestamp: u.timestamp ?? Date.now(),
          trail,
        };
      }),
    );
  }, []);

  // Local simulation loop (1 Hz update rate).
  useEffect(() => {
    if (!running) return;
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
          // Keep targets inside the scope: reflect back toward the centre.
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
  }, [running, settings.simSpeed, settings.noise, settings.trackingEnabled]);

  const reset = useCallback(() => {
    nextIndex.current = settings.targetCount;
    setTargets(seed(settings.targetCount));
  }, [settings.targetCount]);

  const addTarget = useCallback(
    (spec: { type: TargetType; distance: number; bearing: number; speed: number; heading: number }) => {
      const rad = (spec.bearing * Math.PI) / 180;
      const x = Math.sin(rad) * spec.distance;
      const y = Math.cos(rad) * spec.distance;
      const created: RadarTarget = {
        id: `T-${101 + nextIndex.current}`,
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
      nextIndex.current += 1;
      setTargets((prev) => [...prev, created]);
      setSettings((s) => ({ ...s, targetCount: s.targetCount + 1 }));
      return created.id;
    },
    [],
  );

  return { targets, settings, setSettings, running, setRunning, reset, addTarget, ingest };
}
