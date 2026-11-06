import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  correlateObservations,
  type FusionFrame,
  type FusionTrack,
  type SensorKind,
  type SensorObservation,
} from "@/lib/fusion";
import type { TargetType } from "@/lib/radar";

const BASE: Array<{
  id: string;
  type: TargetType;
  sector: string;
  x: number;
  y: number;
  distance: number;
  speed: number;
  heading: number;
  confidence: number;
  sensors: SensorKind[];
}> = [
  { id: "T-101", type: "human", sector: "B", x: 38, y: 31, distance: 420, speed: 12, heading: 45, confidence: 96, sensors: ["cctv", "radar", "thermal", "motion"] },
  { id: "T-102", type: "animal", sector: "A", x: 17, y: 56, distance: 650, speed: 7, heading: 0, confidence: 88, sensors: ["cctv", "thermal", "motion"] },
  { id: "T-103", type: "vehicle", sector: "C", x: 73, y: 48, distance: 820, speed: 35, heading: 90, confidence: 84, sensors: ["radar", "cctv", "motion"] },
  { id: "T-104", type: "drone", sector: "E", x: 69, y: 78, distance: 510, speed: 28, heading: 225, confidence: 92, sensors: ["radar", "drone"] },
];

function observationSummary(sensor: SensorKind, track: FusionTrack) {
  if (sensor === "cctv") return `${track.type.toUpperCase()} object detected`;
  if (sensor === "radar") return `${track.id} at ${track.distance} m / ${track.speed.toFixed(0)} km/h`;
  if (sensor === "thermal") return `${track.type === "human" ? "Human" : track.type} heat signature`;
  if (sensor === "motion") return `Movement detected — Sector ${track.sector}`;
  return `Aerial target ${track.id}`;
}

function makeObservations(tracks: FusionTrack[], tick: number, now: number): SensorObservation[] {
  return tracks.flatMap((track, trackIndex) => {
    const sensors = track.sensors.filter((_, sensorIndex) => (tick + trackIndex + sensorIndex) % 13 !== 0);
    return sensors.map((sensor, sensorIndex) => {
      const disagreement = tick % 11 === 0 && trackIndex === 2 && sensor === "motion";
      return {
        id: `${sensor}-${track.id}-${tick}`,
        sensor,
        targetId: track.id,
        type: track.type,
        sector: disagreement ? "D" : track.sector,
        x: track.x + (sensorIndex - 1) * 0.35,
        y: track.y + (sensorIndex - 1) * 0.25,
        speed: track.speed + (sensorIndex - 1) * 0.4,
        heading: track.heading,
        confidence: Math.max(72, Math.min(98, track.confidence - 3 + ((tick + sensorIndex) % 5))),
        timestamp: now - sensorIndex * 180,
        summary: observationSummary(sensor, track),
        conflict: disagreement ? "Motion reports Sector D while other sensors report Sector C" : undefined,
      } satisfies SensorObservation;
    });
  });
}

function seedFrame(): FusionFrame {
  const now = 0;
  const tracks: FusionTrack[] = BASE.map((item) => ({ ...item, timestamp: now, observations: [], trail: [] }));
  const observations = makeObservations(tracks, 1, now);
  return {
    tracks: correlateObservations(observations, tracks),
    observations,
    environment: { temperature: 28.6, humidity: 62, wind: 12, visibility: 8.5, timestamp: now },
  };
}

type FusionSimulation = ReturnType<typeof useFusionSimulationState>;
const FusionSimulationContext = createContext<FusionSimulation | null>(null);

export function FusionSimulationProvider({ children }: { children: ReactNode }) {
  const simulation = useFusionSimulationState();
  return <FusionSimulationContext.Provider value={simulation}>{children}</FusionSimulationContext.Provider>;
}

export function useFusionSimulation() {
  const simulation = useContext(FusionSimulationContext);
  if (!simulation) throw new Error("useFusionSimulation must be used inside FusionSimulationProvider");
  return simulation;
}

function useFusionSimulationState() {
  const [frame, setFrame] = useState<FusionFrame>(() => seedFrame());
  const [running, setRunning] = useState(true);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [threshold, setThreshold] = useState(70);
  const tick = useRef(1);

  useEffect(() => {
    const now = Date.now();
    setFrame((previous) => {
      const tracks = previous.tracks.map((track) => ({ ...track, timestamp: now }));
      const observations = makeObservations(tracks, tick.current, now);
      return {
        tracks: correlateObservations(observations, tracks),
        observations,
        environment: { ...previous.environment, timestamp: now },
      };
    });
  }, []);

  useEffect(() => {
    if (!running || mode === "manual") return;
    const interval = window.setInterval(() => {
      tick.current += 1;
      setFrame((previous) => {
        const now = Date.now();
        let activeTracks = previous.tracks;
        if (tick.current % 20 === 0 && !activeTracks.some((track) => track.id === "T-105")) {
          activeTracks = [
            ...activeTracks,
            {
              id: "T-105",
              type: "human",
              sector: "D",
              x: 84,
              y: 66,
              distance: 730,
              speed: 9,
              heading: 200,
              confidence: 83,
              timestamp: now,
              sensors: ["radar", "motion"],
              observations: [],
              trail: [],
            },
          ];
        } else if (tick.current % 20 === 8) {
          activeTracks = activeTracks.filter((track) => track.id !== "T-105");
        }
        const moved = activeTracks.map((track, index) => {
          const radians = (track.heading * Math.PI) / 180;
          const nextX = Math.max(7, Math.min(93, track.x + Math.cos(radians) * track.speed * 0.012));
          const nextY = Math.max(8, Math.min(90, track.y + Math.sin(radians) * track.speed * 0.009));
          const heading = nextX <= 7 || nextX >= 93 || nextY <= 8 || nextY >= 90 ? (track.heading + 170) % 360 : track.heading;
          return {
            ...track,
            x: nextX,
            y: nextY,
            heading,
            distance: Math.max(120, Math.round(track.distance + Math.sin(tick.current + index) * 5)),
            timestamp: now,
            trail: [...track.trail, { x: track.x, y: track.y }].slice(-8),
          };
        });
        const observations = makeObservations(moved, tick.current, now);
        return {
          tracks: correlateObservations(observations, moved),
          observations,
          environment: {
            temperature: 28.6 + Math.sin(tick.current / 5) * 0.4,
            humidity: Math.round(62 + Math.sin(tick.current / 4) * 2),
            wind: Math.round(12 + Math.cos(tick.current / 3) * 2),
            visibility: 8.5 + Math.sin(tick.current / 6) * 0.2,
            timestamp: now,
          },
        };
      });
    }, 1500);
    return () => window.clearInterval(interval);
  }, [mode, running]);

  const reset = useCallback(() => {
    tick.current = 1;
    setFrame(seedFrame());
  }, []);

  const ingest = useCallback((nextFrame: FusionFrame) => setFrame(nextFrame), []);

  const confirmedCount = useMemo(
    () => frame.tracks.filter((track) => track.confidence >= threshold && !track.conflict).length,
    [frame.tracks, threshold],
  );

  return { frame, running, setRunning, mode, setMode, threshold, setThreshold, reset, ingest, confirmedCount };
}