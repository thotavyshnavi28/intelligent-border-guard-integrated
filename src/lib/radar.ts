// Shared radar domain types + helpers.
// The UI is driven entirely by RadarTarget objects, so a backend feed can
// replace the local simulator without any component changes.

export type TargetType = "human" | "animal" | "vehicle" | "drone";

export interface RadarTarget {
  id: string;
  type: TargetType;
  /** metres, east-positive */
  x: number;
  /** metres, north-positive */
  y: number;
  /** km/h */
  speed: number;
  /** compass degrees, 0 = north */
  heading: number;
  sector: string;
  confidence: number;
  status: "TRACKING" | "ACQUIRING" | "LOST";
  timestamp: number;
  /** most recent positions, oldest first */
  trail: Array<{ x: number; y: number }>;
}

/** Payload shape expected from the backend radar simulation service. */
export interface RadarTargetUpdate {
  id: string;
  type: TargetType;
  x: number;
  y: number;
  speed?: number;
  heading?: number;
  sector?: string;
  confidence?: number;
  status?: RadarTarget["status"];
  timestamp?: number;
}

export const RADAR_RANGE_M = 1000;
export const TRAIL_LENGTH = 14;

export const TYPE_LABEL: Record<TargetType, string> = {
  human: "Human",
  animal: "Animal",
  vehicle: "Vehicle",
  drone: "Drone",
};

/** Tailwind-safe token names registered in styles.css. */
export const TYPE_COLOR: Record<TargetType, string> = {
  human: "var(--track-human)",
  animal: "var(--track-animal)",
  vehicle: "var(--track-vehicle)",
  drone: "var(--track-drone)",
};

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function compass(heading: number): string {
  const idx = Math.round((((heading % 360) + 360) % 360) / 45) % 8;
  return COMPASS[idx] ?? "N";
}

export function distanceOf(t: { x: number; y: number }): number {
  return Math.round(Math.hypot(t.x, t.y));
}

export function sectorOf(t: { x: number; y: number }): string {
  const bearing = (((Math.atan2(t.x, t.y) * 180) / Math.PI) + 360) % 360;
  if (bearing < 90) return "B";
  if (bearing < 180) return "C";
  if (bearing < 270) return "D";
  return "A";
}

/** Approximate geo position around the demo command post. */
export function geoOf(t: { x: number; y: number }) {
  const baseLat = 17.4321;
  const baseLon = 78.5678;
  return {
    lat: (baseLat + t.y / 111_320).toFixed(4),
    lon: (baseLon + t.x / (111_320 * Math.cos((baseLat * Math.PI) / 180))).toFixed(4),
  };
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour12: false });
}
