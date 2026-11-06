import type { TargetType } from "@/lib/radar";

export type SensorKind = "cctv" | "radar" | "thermal" | "motion" | "drone" | "environment";

export interface SensorObservation {
  id: string;
  sensor: SensorKind;
  targetId?: string;
  type?: TargetType;
  sector?: string;
  x?: number;
  y?: number;
  speed?: number;
  heading?: number;
  confidence: number;
  timestamp: number;
  summary: string;
  conflict?: string | undefined;
}

export interface FusionTrack {
  id: string;
  type: TargetType;
  sector: string;
  x: number;
  y: number;
  distance: number;
  speed: number;
  heading: number;
  confidence: number;
  timestamp: number;
  sensors: SensorKind[];
  observations: SensorObservation[];
  trail: Array<{ x: number; y: number }>;
  conflict?: string | undefined;
}

export interface FusionFrame {
  tracks: FusionTrack[];
  observations: SensorObservation[];
  environment: {
    temperature: number;
    humidity: number;
    wind: number;
    visibility: number;
    timestamp: number;
  };
}

export const SENSOR_LABEL: Record<SensorKind, string> = {
  cctv: "CCTV AI",
  radar: "Radar Tracking",
  thermal: "Thermal Camera",
  motion: "Motion Sensor",
  drone: "Drone Detection",
  environment: "Environment Sensor",
};

export const SENSOR_SHORT: Record<SensorKind, string> = {
  cctv: "CCTV",
  radar: "Radar",
  thermal: "Thermal",
  motion: "Motion",
  drone: "Drone",
  environment: "Environment",
};

const EXPECTED_SENSORS: Record<TargetType, SensorKind[]> = {
  human: ["cctv", "radar", "thermal", "motion"],
  animal: ["cctv", "thermal", "motion"],
  vehicle: ["radar", "cctv", "motion"],
  drone: ["radar", "drone"],
};

/** Transparent prototype score, not an operational threat algorithm. */
export function calculateFusionConfidence(observations: SensorObservation[], type: TargetType) {
  if (observations.length === 0) return 0;
  const expected = EXPECTED_SENSORS[type].length;
  const average = observations.reduce((sum, item) => sum + item.confidence, 0) / observations.length;
  const agreement = Math.min(1, observations.length / expected);
  const spatialAgreement = observations.every((item) => item.sector === observations[0]?.sector) ? 1 : 0.55;
  const newest = Math.max(...observations.map((item) => item.timestamp));
  const oldest = Math.min(...observations.map((item) => item.timestamp));
  const temporalAgreement = newest - oldest <= 3500 ? 1 : 0.6;
  return Math.round(Math.min(99, average * 0.65 + agreement * 20 + spatialAgreement * 8 + temporalAgreement * 7));
}

export function correlateObservations(
  observations: SensorObservation[],
  prior: FusionTrack[],
): FusionTrack[] {
  return prior.map((track) => {
    const matches = observations.filter((item) => {
      if (item.targetId === track.id) return true;
      const closeInTime = Math.abs(item.timestamp - track.timestamp) < 5000;
      const typeCompatible = !item.type || item.type === track.type;
      const locationCompatible = !item.sector || item.sector === track.sector;
      return closeInTime && typeCompatible && locationCompatible;
    });
    const conflict = matches.find((item) => item.conflict)?.conflict;
    return {
      ...track,
      sensors: [...new Set(matches.map((item) => item.sensor))],
      observations: matches,
      confidence: calculateFusionConfidence(matches, track.type),
      conflict,
    };
  });
}