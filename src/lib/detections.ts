// Detection domain model for Feature 1 (CCTV AI Object Detection).
// All values below are SAMPLE/DEMO data used purely to demonstrate the UI.
// A Python YOLO/OpenCV backend can replace `DEMO_DETECTIONS` by pushing
// `Detection` objects (same shape) through `onDetections` in the CCTV panel.

export type DetectionClass = "person" | "animal" | "bird" | "vehicle" | "drone" | "other";

export interface Detection {
  id: string;
  label: DetectionClass;
  confidence: number; // 0-100
  camera: string;
  time: string;
  status: "Detected" | "Tracking" | "Cleared";
  /** normalised bounding box, 0-1 relative to the video frame */
  box: { x: number; y: number; w: number; h: number };
  source: "demo" | "backend";
}

export const CLASS_LABEL: Record<DetectionClass, string> = {
  person: "Person",
  animal: "Animal",
  bird: "Bird",
  vehicle: "Vehicle",
  drone: "Drone",
  other: "Other",
};

export const CLASS_COLOR: Record<DetectionClass, string> = {
  person: "var(--track-human)",
  animal: "var(--track-animal)",
  bird: "var(--track-drone)",
  vehicle: "var(--track-vehicle)",
  drone: "var(--online)",
  other: "var(--muted-foreground)",
};

export const DEMO_DETECTIONS: Detection[] = [
  {
    id: "DET-1024",
    label: "person",
    confidence: 94,
    camera: "CAM-04",
    time: "16:47:32",
    status: "Detected",
    box: { x: 0.18, y: 0.34, w: 0.14, h: 0.44 },
    source: "demo",
  },
  {
    id: "DET-1025",
    label: "animal",
    confidence: 87,
    camera: "CAM-04",
    time: "16:47:35",
    status: "Detected",
    box: { x: 0.4, y: 0.62, w: 0.12, h: 0.2 },
    source: "demo",
  },
  {
    id: "DET-1026",
    label: "bird",
    confidence: 81,
    camera: "CAM-04",
    time: "16:47:36",
    status: "Detected",
    box: { x: 0.72, y: 0.14, w: 0.1, h: 0.12 },
    source: "demo",
  },
  {
    id: "DET-1027",
    label: "vehicle",
    confidence: 92,
    camera: "CAM-04",
    time: "16:47:37",
    status: "Detected",
    box: { x: 0.62, y: 0.44, w: 0.24, h: 0.26 },
    source: "demo",
  },
  {
    id: "DET-1028",
    label: "drone",
    confidence: 89,
    camera: "CAM-04",
    time: "16:47:40",
    status: "Detected",
    box: { x: 0.45, y: 0.12, w: 0.1, h: 0.1 },
    source: "demo",
  },
];
