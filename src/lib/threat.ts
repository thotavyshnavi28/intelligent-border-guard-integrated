// Transparent prototype threat-scoring model for the academic demo.
// Not a validated real-world threat prediction system.

import type { FusionTrack, SensorKind } from "@/lib/fusion";
import { compass, geoOf, type TargetType } from "@/lib/radar";

export type ThreatLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Configurable thresholds — used everywhere instead of inline numbers. */
export const THREAT_THRESHOLDS: Array<{ level: ThreatLevel; min: number }> = [
  { level: "CRITICAL", min: 90 },
  { level: "HIGH", min: 70 },
  { level: "MEDIUM", min: 40 },
  { level: "LOW", min: 0 },
];

/** Configurable weights for the prototype formula (must total 1). */
export const THREAT_WEIGHTS = {
  location: 0.3,
  movement: 0.25,
  object: 0.2,
  sensorAgreement: 0.15,
  fusionConfidence: 0.1,
} as const;

export const THREAT_TONE: Record<ThreatLevel, string> = {
  LOW: "online",
  MEDIUM: "warning",
  HIGH: "critical",
  CRITICAL: "critical",
};

/** Restricted zone polygon in 0-100 track space (mirrors the map overlay). */
const RESTRICTED_ZONE: Array<[number, number]> = [
  [39, 67.7],
  [53.5, 61.6],
  [60, 81.5],
  [44.5, 88.7],
];

/** Border boundary runs across the upper part of the map. */
const BORDER_Y = 30;

function inRestrictedZone(x: number, y: number) {
  let inside = false;
  for (let i = 0, j = RESTRICTED_ZONE.length - 1; i < RESTRICTED_ZONE.length; j = i++) {
    const a = RESTRICTED_ZONE[i]!;
    const b = RESTRICTED_ZONE[j]!;
    const intersects = a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

const OBJECT_BASE: Record<TargetType, number> = {
  animal: 15,
  human: 55,
  vehicle: 50,
  drone: 60,
};

const EXPECTED_SENSOR_COUNT = 4;

export interface ThreatBreakdown {
  location: number;
  movement: number;
  object: number;
  sensorAgreement: number;
  fusionConfidence: number;
}

export interface ThreatAssessment {
  targetId: string;
  type: TargetType;
  score: number;
  level: ThreatLevel;
  breakdown: ThreatBreakdown;
  factors: string[];
  recommendation: string;
  inRestrictedZone: boolean;
  movingTowardBorder: boolean;
  sensors: SensorKind[];
  timestamp: number;
}

export function levelForScore(score: number): ThreatLevel {
  return THREAT_THRESHOLDS.find((entry) => score >= entry.min)?.level ?? "LOW";
}

function recommendationFor(level: ThreatLevel): string {
  if (level === "CRITICAL") return "Escalate immediately for human review.";
  if (level === "HIGH") return "Monitor closely and prepare a human review.";
  if (level === "MEDIUM") return "Request human review of the observation.";
  return "Continue routine monitoring.";
}

export function assessTrack(track: FusionTrack): ThreatAssessment {
  const restricted = inRestrictedZone(track.x, track.y);
  const distanceToBorder = Math.abs(track.y - BORDER_Y);
  const nearBorder = distanceToBorder < 18;

  const location = Math.round(
    restricted ? 90 : nearBorder ? 70 - distanceToBorder : Math.max(15, 45 - distanceToBorder * 0.6),
  );

  const radians = (track.heading * Math.PI) / 180;
  const towardBorder = Math.sin(radians) < -0.25 && track.y > BORDER_Y;
  const speedRisk = Math.min(60, (track.speed / 40) * 60);
  const movement = Math.round(Math.min(98, speedRisk + (towardBorder ? 35 : 5)));

  const object = OBJECT_BASE[track.type];
  const sensorAgreement = Math.round(Math.min(100, (track.sensors.length / EXPECTED_SENSOR_COUNT) * 100));
  const fusionConfidence = track.confidence;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        location * THREAT_WEIGHTS.location +
          movement * THREAT_WEIGHTS.movement +
          object * THREAT_WEIGHTS.object +
          sensorAgreement * THREAT_WEIGHTS.sensorAgreement +
          fusionConfidence * THREAT_WEIGHTS.fusionConfidence,
      ),
    ),
  );

  const level = levelForScore(score);

  const factors: string[] = [];
  if (restricted) factors.push("Inside restricted zone");
  else if (nearBorder) factors.push("Close to border boundary");
  else factors.push("Within routine patrol area");
  if (towardBorder) factors.push("Moving toward the border");
  if (track.speed > 25) factors.push(`Elevated speed (${track.speed.toFixed(0)} km/h)`);
  if (track.sensors.length >= 3) factors.push(`Confirmed by ${track.sensors.length} independent sensors`);
  else factors.push(`Limited sensor agreement (${track.sensors.length} sensor${track.sensors.length === 1 ? "" : "s"})`);
  if (track.confidence >= 90) factors.push(`High fusion confidence (${track.confidence}%)`);
  if (track.conflict) factors.push("Conflicting sensor observations");

  return {
    targetId: track.id,
    type: track.type,
    score,
    level,
    breakdown: { location, movement, object, sensorAgreement, fusionConfidence },
    factors,
    recommendation: recommendationFor(level),
    inRestrictedZone: restricted,
    movingTowardBorder: towardBorder,
    sensors: track.sensors,
    timestamp: track.timestamp,
  };
}

export interface IncidentRecord {
  id: string;
  targetId: string;
  type: TargetType;
  timestamp: number;
  sector: string;
  position: string;
  score: number;
  level: ThreatLevel;
  sensors: SensorKind[];
  factors: string[];
  recommendation: string;
  distance?: number;
  speed?: number;
  direction?: string;
  fusionConfidence?: number;
  latitude?: string;
  longitude?: string;
  mapX?: number;
  mapY?: number;
  breakdown?: ThreatBreakdown;
  status?: IncidentStatus;
  reviewNotes?: string;
  timeline?: Array<{ timestamp: number; event: string }>;
}

export type IncidentStatus = "NEW" | "UNDER REVIEW" | "CONFIRMED" | "RESOLVED";

export function buildIncident(track: FusionTrack, assessment: ThreatAssessment): IncidentRecord {
  const geo = geoOf({ x: track.x * 10, y: track.y * 10 });
  const timestamp = Date.now();
  const timeline = track.observations
    .filter((observation) => observation.targetId === track.id || observation.sector === track.sector)
    .map((observation) => ({ timestamp: observation.timestamp, event: observation.summary }))
    .sort((left, right) => left.timestamp - right.timestamp);
  timeline.push({ timestamp: track.timestamp, event: "Multi-sensor fusion correlation completed." });
  timeline.push({ timestamp: assessment.timestamp, event: `Prototype threat assessment generated ${assessment.level} (${assessment.score}/100).` });
  timeline.push({ timestamp, event: "Incident record created for human review." });
  return {
    id: "",
    targetId: track.id,
    type: track.type,
    timestamp,
    sector: track.sector,
    position: `${geo.lat}° N, ${geo.lon}° E · ${compass(track.heading)}`,
    score: assessment.score,
    level: assessment.level,
    sensors: assessment.sensors,
    factors: assessment.factors,
    recommendation: assessment.recommendation,
    distance: track.distance,
    speed: track.speed,
    direction: compass(track.heading),
    fusionConfidence: track.confidence,
    latitude: geo.lat,
    longitude: geo.lon,
    mapX: track.x,
    mapY: track.y,
    breakdown: assessment.breakdown,
    status: "NEW",
    reviewNotes: "",
    timeline,
  };
}
