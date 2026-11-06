import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import {
  AlertTriangle,
  Bell,
  Bird,
  Camera,
  Car,
  CheckCircle2,
  ClipboardList,
  Crosshair,
  Download,
  Eye,
  FileText,
  Footprints,
  Gauge,
  Info,
  Leaf,
  Map as MapIcon,
  PieChart,
  RadioTower,
  Send,
  ShieldAlert,
  Siren,
  Thermometer,
  UserRound,
} from "lucide-react";
import { Panel, Shell, StatusDot } from "@/components/sentinel/Shell";
import { Button } from "@/components/ui/button";
import { recordIncident } from "@/lib/incidents";
import { useFusionSimulation } from "@/hooks/useFusionSimulation";
import { SENSOR_LABEL, SENSOR_SHORT, type FusionTrack, type SensorKind } from "@/lib/fusion";
import { TYPE_COLOR, TYPE_LABEL, compass, geoOf, type TargetType } from "@/lib/radar";
import {
  assessTrack,
  buildIncident,
  THREAT_THRESHOLDS,
  THREAT_WEIGHTS,
  type IncidentRecord,
  type ThreatAssessment,
  type ThreatLevel,
} from "@/lib/threat";

export const Route = createFileRoute("/threat")({
  validateSearch: (search: Record<string, unknown>) => ({
    target: typeof search["target"] === "string" ? search["target"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Threat Assessment — Border Sentinel" },
      {
        name: "description",
        content:
          "Academic decision-support prototype that scores fused border surveillance targets and classifies threat levels for human review.",
      },
      { property: "og:title", content: "Threat Assessment — Border Sentinel" },
      {
        property: "og:description",
        content: "Analyze, evaluate, classify and prioritize fused surveillance targets for human review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ThreatPage,
});

const TARGET_ICON: Record<TargetType, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  human: UserRound,
  animal: Footprints,
  vehicle: Car,
  drone: Bird,
};

const SENSOR_ICON: Record<SensorKind, ComponentType<{ className?: string }>> = {
  cctv: Camera,
  radar: RadioTower,
  thermal: Thermometer,
  motion: Footprints,
  drone: Bird,
  environment: Leaf,
};

const SENSOR_ORDER: SensorKind[] = ["cctv", "radar", "thermal", "motion", "drone", "environment"];

const LEVEL_CLASS: Record<ThreatLevel, string> = {
  LOW: "border-online/60 text-online",
  MEDIUM: "border-warning/60 text-warning",
  HIGH: "border-critical/60 text-critical",
  CRITICAL: "border-critical text-critical",
};

const LEVEL_STROKE: Record<ThreatLevel, string> = {
  LOW: "var(--online)",
  MEDIUM: "var(--warning)",
  HIGH: "var(--critical)",
  CRITICAL: "var(--critical)",
};

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", { hour12: false });
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function LevelBadge({ level }: { level: ThreatLevel }) {
  return (
    <span className={`border px-1.5 py-0.5 font-display text-[9px] font-semibold uppercase tracking-widest ${LEVEL_CLASS[level]}`}>
      {level}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "critical" | "warning" | "online" | "primary";
  icon: ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "critical"
      ? "border-critical/50 text-critical"
      : tone === "warning"
        ? "border-warning/50 text-warning"
        : tone === "online"
          ? "border-online/50 text-online"
          : "border-primary/50 text-primary";
  return (
    <div className={`flex flex-1 items-center gap-3 border bg-panel px-3 py-2.5 ${toneClass}`}>
      <div className={`grid size-10 shrink-0 place-items-center border bg-accent/30 ${toneClass}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold leading-tight">{String(value).padStart(2, "0")}</p>
      </div>
    </div>
  );
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? "bg-critical" : value >= 40 ? "bg-warning" : "bg-online";
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[9px] uppercase text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1.5 bg-secondary">
        <div className={`h-full transition-all duration-500 ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ScoreDial({ score, level }: { score: number; level: ThreatLevel }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative grid size-32 place-items-center">
      <svg viewBox="0 0 100 100" className="size-32 -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--secondary)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={LEVEL_STROKE[level]}
          strokeWidth="9"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-3xl font-bold leading-none text-foreground">{score}</p>
        <p className="font-mono text-[9px] text-muted-foreground">/100</p>
      </div>
    </div>
  );
}

function DistributionDonut({ counts }: { counts: Record<"HIGH" | "MEDIUM" | "LOW", number> }) {
  const total = counts.HIGH + counts.MEDIUM + counts.LOW;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const segments: Array<[ThreatLevel, number]> = [
    ["HIGH", counts.HIGH],
    ["MEDIUM", counts.MEDIUM],
    ["LOW", counts.LOW],
  ];
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative grid size-28 shrink-0 place-items-center">
        <svg viewBox="0 0 100 100" className="size-28 -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--secondary)" strokeWidth="10" />
          {segments.map(([level, count]) => {
            if (!total || !count) return null;
            const length = (count / total) * circumference;
            const dash = <circle
              key={level}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={LEVEL_STROKE[level]}
              strokeWidth="10"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
            />;
            offset += length;
            return dash;
          })}
        </svg>
        <div className="absolute text-center">
          <p className="font-display text-xl font-bold leading-none">{total}</p>
          <p className="font-mono text-[8px] uppercase text-muted-foreground">Total</p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 font-mono text-[10px]">
        {segments.map(([level, count]) => (
          <li key={level} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 uppercase text-muted-foreground">
              <span className="size-2.5" style={{ background: LEVEL_STROKE[level] }} /> {level}
            </span>
            <span className="text-foreground">
              {count} ({total ? Math.round((count / total) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThreatMap({
  tracks,
  assessments,
  selectedId,
  onSelect,
}: {
  tracks: FusionTrack[];
  assessments: Map<string, ThreatAssessment>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative min-h-[380px] overflow-hidden border border-border bg-background sm:min-h-[460px]">
      <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-label="Threat map with assessed targets">
        <defs>
          <pattern id="threat-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border)" strokeOpacity="0.32" strokeWidth="1" />
          </pattern>
          <pattern id="threat-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="12" stroke="var(--critical)" strokeOpacity="0.42" strokeWidth="4" />
          </pattern>
        </defs>
        <g pointerEvents="none">
          <rect width="1000" height="620" fill="var(--panel-header)" />
          <path d="M0 90 C170 40 260 145 430 105 S720 42 1000 125 V0 H0Z" fill="var(--accent)" opacity="0.35" />
          <path d="M0 540 C190 450 330 570 530 515 S760 410 1000 485 V620 H0Z" fill="var(--accent)" opacity="0.25" />
          <rect width="1000" height="620" fill="url(#threat-grid)" />
        </g>
        {[200, 400, 600, 800].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="620" stroke="var(--border)" strokeDasharray="5 9" opacity="0.6" pointerEvents="none" />
        ))}
        {[
          ["SECTOR A", 95],
          ["SECTOR B", 290],
          ["SECTOR C", 490],
          ["SECTOR D", 690],
          ["SECTOR E", 890],
        ].map(([label, x]) => (
          <text key={String(label)} x={Number(x)} y={48} textAnchor="middle" fill="var(--muted-foreground)" fontSize="16" fontFamily="var(--font-display)" letterSpacing="2" pointerEvents="none">
            {label}
          </text>
        ))}
        <path d="M70 180 C220 225 300 130 460 195 S720 265 930 175" fill="none" stroke="var(--warning)" strokeWidth="3" strokeDasharray="10 8" opacity="0.85" pointerEvents="none" />
        <text x="75" y="165" fill="var(--warning)" fontSize="12" fontFamily="var(--font-mono)" pointerEvents="none">BORDER BOUNDARY</text>
        <polygon points="390,420 535,382 600,505 445,550" fill="url(#threat-hatch)" stroke="var(--critical)" strokeOpacity="0.75" pointerEvents="none" />
        <text x="490" y="470" textAnchor="middle" fill="var(--critical)" fontSize="12" fontFamily="var(--font-mono)" pointerEvents="none">RESTRICTED ZONE</text>

        {tracks.map((track) => {
          const assessment = assessments.get(track.id);
          const level = assessment?.level ?? "LOW";
          const color = LEVEL_STROKE[level];
          const typeColor = TYPE_COLOR[track.type];
          const x = track.x * 10;
          const y = track.y * 6.2;
          const selected = selectedId === track.id;
          return (
            <g key={track.id} className="cursor-pointer" onClick={() => onSelect(track.id)} role="button" aria-label={`Select ${track.id}`}>
              {track.trail.length > 1 ? (
                <polyline
                  points={track.trail.map((point) => `${point.x * 10},${point.y * 6.2}`).join(" ")}
                  fill="none"
                  stroke={typeColor}
                  strokeWidth="3"
                  strokeDasharray="6 6"
                  opacity="0.5"
                />
              ) : null}
              {selected ? <circle cx={x} cy={y} r="24" fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 4" /> : null}
              <circle cx={x} cy={y} r="14" fill="var(--background)" stroke={color} strokeWidth="2" className="blip-pulse" />
              <circle cx={x} cy={y} r="5" fill={typeColor} />
              <rect x={x + 22} y={y - 42} width="96" height="34" fill="var(--background)" stroke={color} />
              <text x={x + 30} y={y - 27} fill="var(--foreground)" fontSize="12" fontFamily="var(--font-mono)">{track.id}</text>
              <text x={x + 30} y={y - 14} fill={color} fontSize="10" fontFamily="var(--font-mono)">{level}</text>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-3 left-3 border border-border bg-background/90 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        Simulated terrain • Threat overlay
      </div>
    </div>
  );
}

function TargetLegend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-[9px] uppercase tracking-widest text-muted-foreground">
      {(Object.keys(TYPE_LABEL) as TargetType[]).map((type) => {
        const Icon = TARGET_ICON[type];
        return (
          <span key={type} className="flex items-center gap-1.5">
            <Icon className="size-3.5" style={{ color: TYPE_COLOR[type] }} /> {TYPE_LABEL[type]}
          </span>
        );
      })}
      <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-warning" /> Border Boundary</span>
      <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-primary" /> Track Path</span>
      <span className="flex items-center gap-1.5"><span className="size-3 border border-critical bg-critical/20" /> Restricted Zone</span>
    </div>
  );
}

function ThreatPage() {
  const { target: requestedTarget } = Route.useSearch();
  const { frame, running, threshold } = useFusionSimulation();
  const [selectedId, setSelectedId] = useState<string | null>(() => requestedTarget ?? "T-101");
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState(false);
  const [alertLevel, setAlertLevel] = useState<ThreatLevel>("HIGH");
  const [notice, setNotice] = useState<string | null>(null);
  const [showSensorData, setShowSensorData] = useState(false);

  const assessments = useMemo(() => {
    const map = new Map<string, ThreatAssessment>();
    frame.tracks.forEach((track) => map.set(track.id, assessTrack(track)));
    return map;
  }, [frame.tracks]);

  const counts = useMemo(() => {
    const result = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    assessments.forEach((assessment) => {
      if (assessment.level === "HIGH" || assessment.level === "CRITICAL") result.HIGH += 1;
      else if (assessment.level === "MEDIUM") result.MEDIUM += 1;
      else result.LOW += 1;
    });
    return result;
  }, [assessments]);

  const selectedTrack = frame.tracks.find((track) => track.id === selectedId) ?? frame.tracks[0] ?? null;
  const selected = selectedTrack ? assessments.get(selectedTrack.id) ?? null : null;
  const timestamp = selectedTrack?.timestamp ?? frame.environment.timestamp;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const alerts = useMemo(() => {
    const items = frame.tracks
      .map((track) => {
        const assessment = assessments.get(track.id)!;
        return {
          id: track.id,
          type: track.type,
          level: assessment.level,
          text:
            assessment.level === "LOW"
              ? `Target update in Sector ${track.sector}`
              : `${assessment.level === "MEDIUM" ? "Elevated activity" : "High threat detected"} in Sector ${track.sector}`,
          timestamp: track.timestamp,
          score: assessment.score,
        };
      })
      .sort((a, b) => b.score - a.score);
    return items;
  }, [assessments, frame.tracks]);

  function exportData() {
    const payload = frame.tracks.map((track) => ({ track, assessment: assessments.get(track.id) }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `threat-assessment-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Threat assessment data exported as JSON");
  }

  function generateReport() {
    if (!selectedTrack || !selected) return;
    setReport(
      [
        `BORDER SENTINEL — THREAT ASSESSMENT REPORT`,
        `Target: ${selectedTrack.id} (${TYPE_LABEL[selectedTrack.type]})`,
        `Time: ${formatTime(selected.timestamp)} ${formatDate(selected.timestamp)}`,
        `Sector ${selectedTrack.sector} · ${selectedTrack.distance} m · ${selectedTrack.speed.toFixed(0)} km/h · ${compass(selectedTrack.heading)}`,
        `Sensors: ${selected.sensors.map((sensor) => SENSOR_SHORT[sensor]).join(", ") || "None"}`,
        `Fusion confidence: ${selectedTrack.confidence}%`,
        `Risk score: ${selected.score}/100 · Level: ${selected.level}`,
        `Risk factors: ${selected.factors.join("; ")}`,
        `Recommendation: ${selected.recommendation}`,
        `Academic prototype — decision support only.`,
      ].join("\n"),
    );
  }

  function sendToIncidents() {
    if (!selectedTrack || !selected) return;
    const record = recordIncident(buildIncident(selectedTrack, selected));
    setIncidents((previous) => [record, ...previous.filter((item) => item.id !== record.id)].slice(0, 8));
    setNotice(`${record.id} · ${record.targetId} recorded in incident history`);
  }

  const geo = selectedTrack ? geoOf({ x: selectedTrack.x * 10, y: selectedTrack.y * 10 }) : null;

  return (
    <Shell moduleTitle="Threat Assessment" moduleSubtitle="Analyze • Evaluate • Classify • Prioritize">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-panel px-3 py-2 xl:hidden">
          <div>
            <h2 className="font-display text-lg font-bold uppercase tracking-[0.16em]">Threat Assessment</h2>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Analyze • Evaluate • Classify • Prioritize</p>
          </div>
          <div className="text-right font-mono text-[10px] uppercase text-muted-foreground">
            <p className="text-online">● System Online</p>
            <p>{formatTime(timestamp)} · {formatDate(timestamp)}</p>
          </div>
        </div>

        {notice ? (
          <p className="border border-online/50 bg-online/5 px-3 py-2 text-[10px] uppercase tracking-widest text-online">{notice}</p>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <SummaryCard label="High Threats" value={counts.HIGH} tone="critical" icon={ShieldAlert} />
              <SummaryCard label="Medium Threats" value={counts.MEDIUM} tone="warning" icon={AlertTriangle} />
              <SummaryCard label="Low Threats" value={counts.LOW} tone="online" icon={CheckCircle2} />
              <SummaryCard label="Total Threats" value={frame.tracks.length} tone="primary" icon={Crosshair} />
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Panel title="Threat Map" icon={MapIcon} right={<span className="text-online">Live • {formatTime(timestamp)}</span>}>
                <ThreatMap tracks={frame.tracks} assessments={assessments} selectedId={selectedTrack?.id ?? null} onSelect={setSelectedId} />
                <TargetLegend />
              </Panel>

              <Panel title="Target Details" icon={Eye} className="h-fit">
                {selectedTrack && selected ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 border border-border bg-card px-2 py-1.5">
                      <span className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest">
                        {(() => {
                          const Icon = TARGET_ICON[selectedTrack.type];
                          return <Icon className="size-4" style={{ color: TYPE_COLOR[selectedTrack.type] }} />;
                        })()}
                        {selectedTrack.id} · {TYPE_LABEL[selectedTrack.type]}
                      </span>
                      <LevelBadge level={selected.level} />
                    </div>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[10px]">
                      {[
                        ["Sector", selectedTrack.sector],
                        ["Distance", `${selectedTrack.distance} m`],
                        ["Speed", `${selectedTrack.speed.toFixed(0)} km/h`],
                        ["Direction", compass(selectedTrack.heading)],
                        ["Latitude", `${geo?.lat}° N`],
                        ["Longitude", `${geo?.lon}° E`],
                        ["Detected", formatTime(selected.timestamp)],
                        ["Tracking", "ACTIVE"],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-[9px] uppercase text-muted-foreground">{label}</dt>
                          <dd className="text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>

                    <div>
                      <p className="mb-1.5 text-[9px] uppercase tracking-widest text-muted-foreground">Detection Source</p>
                      <div className="flex flex-wrap gap-1.5">
                        {SENSOR_ORDER.filter((sensor) => sensor !== "environment").map((sensor) => {
                          const active = selected.sensors.includes(sensor);
                          const Icon = SENSOR_ICON[sensor];
                          return (
                            <span
                              key={sensor}
                              className={`flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] uppercase ${active ? "border-online/50 text-online" : "border-border text-muted-foreground opacity-60"}`}
                            >
                              <Icon className="size-3" /> {SENSOR_SHORT[sensor]} {active ? "✓" : "—"}
                            </span>
                          );
                        })}
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between font-mono text-[9px] uppercase text-muted-foreground">
                          <span>Fusion confidence</span>
                          <span className="text-foreground">{selectedTrack.confidence}%</span>
                        </div>
                        <div className="mt-1 h-1.5 bg-secondary">
                          <div className={`h-full ${selectedTrack.confidence >= threshold ? "bg-online" : "bg-warning"}`} style={{ width: `${selectedTrack.confidence}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border border-border bg-card px-2 py-1.5 text-[9px] uppercase tracking-widest">
                      <span className="text-muted-foreground">Threat Level</span>
                      <LevelBadge level={selected.level} />
                    </div>

                    <Button
                      onClick={sendToIncidents}
                      disabled={selected.level !== "HIGH" && selected.level !== "CRITICAL"}
                      className="w-full gap-2 uppercase tracking-widest"
                    >
                      <Send className="size-4" /> Send to Incident History
                    </Button>
                  </div>
                ) : (
                  <p className="text-[10px] uppercase text-muted-foreground">No target selected</p>
                )}
              </Panel>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Detailed Target Analysis" icon={ClipboardList}>
                <div className="flex flex-wrap gap-1.5">
                  {frame.tracks.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => setSelectedId(track.id)}
                      className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${selectedTrack?.id === track.id ? "border-primary bg-accent/50 text-foreground" : "border-border text-muted-foreground hover:bg-accent/30"}`}
                    >
                      {track.id}
                    </button>
                  ))}
                </div>
                {selectedTrack && selected ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <dl className="space-y-1.5 border border-border bg-card p-2.5 font-mono text-[10px]">
                      {[
                        ["Object Type", TYPE_LABEL[selectedTrack.type]],
                        ["Distance", `${selectedTrack.distance} m`],
                        ["Speed", `${selectedTrack.speed.toFixed(0)} km/h`],
                        ["Direction", compass(selectedTrack.heading)],
                        ["Sector", selectedTrack.sector],
                        ["Position", `${geo?.lat}° N, ${geo?.lon}° E`],
                        ["Detection Time", formatTime(selected.timestamp)],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="space-y-2 border border-border bg-card p-2.5">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Sensor Confirmation</p>
                      <ul className="space-y-1 font-mono text-[10px]">
                        {SENSOR_ORDER.filter((sensor) => sensor !== "environment").map((sensor) => {
                          const active = selected.sensors.includes(sensor);
                          const Icon = SENSOR_ICON[sensor];
                          return (
                            <li key={sensor} className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="size-3" /> {SENSOR_LABEL[sensor]}</span>
                              <span className={active ? "text-online" : "text-muted-foreground"}>{active ? "✓" : "—"}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <FactorBar label="Fusion Confidence" value={selectedTrack.confidence} />
                      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest">
                        <span className="text-muted-foreground">Threat Level</span>
                        <LevelBadge level={selected.level} />
                      </div>
                      <Button variant="secondary" size="sm" className="w-full uppercase tracking-widest" onClick={() => setShowSensorData((value) => !value)}>
                        {showSensorData ? "Hide Sensor Data" : "View Sensor Data"}
                      </Button>
                    </div>
                    {showSensorData ? (
                      <div className="sm:col-span-2 space-y-1.5 border border-border bg-card p-2.5 font-mono text-[9px]">
                        {selectedTrack.observations.map((observation) => (
                          <div key={observation.id} className="flex justify-between gap-3 border-b border-border pb-1 last:border-0">
                            <span className="text-foreground">{SENSOR_LABEL[observation.sensor]} · {observation.summary}</span>
                            <span className="text-muted-foreground">{observation.confidence}% · {formatTime(observation.timestamp)}</span>
                          </div>
                        ))}
                        {selectedTrack.observations.length === 0 ? <p className="text-muted-foreground">No raw observations in the current frame.</p> : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Panel>

              <Panel title="Threat Analysis" icon={Gauge}>
                {selectedTrack && selected ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-semibold uppercase tracking-widest">{selectedTrack.id} · {TYPE_LABEL[selectedTrack.type]}</span>
                      <LevelBadge level={selected.level} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="border border-border bg-card p-2.5">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Risk Factors</p>
                        <ul className="mt-1.5 space-y-1 text-[10px] text-foreground">
                          {selected.factors.map((factor) => (
                            <li key={factor} className="flex gap-2"><span className="text-primary">•</span>{factor}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col items-center justify-center border border-border bg-card p-2.5">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Risk Score</p>
                        <ScoreDial score={selected.score} level={selected.level} />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <FactorBar label="Location Risk" value={selected.breakdown.location} />
                      <FactorBar label="Movement Risk" value={selected.breakdown.movement} />
                      <FactorBar label="Object Risk" value={selected.breakdown.object} />
                      <FactorBar label="Sensor Agreement" value={selected.breakdown.sensorAgreement} />
                    </div>
                    <div className="flex gap-3 border border-warning/50 bg-warning/5 p-2.5">
                      <AlertTriangle className="size-4 shrink-0 text-warning" />
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-warning">Recommendation</p>
                        <p className="text-[10px] text-foreground">{selected.recommendation}</p>
                      </div>
                    </div>
                    <p className="text-[8px] uppercase leading-relaxed tracking-widest text-muted-foreground">
                      Prototype score = location {Math.round(THREAT_WEIGHTS.location * 100)}% + movement {Math.round(THREAT_WEIGHTS.movement * 100)}% + object context {Math.round(THREAT_WEIGHTS.object * 100)}% + sensor agreement {Math.round(THREAT_WEIGHTS.sensorAgreement * 100)}% + fusion confidence {Math.round(THREAT_WEIGHTS.fusionConfidence * 100)}%. Levels: {THREAT_THRESHOLDS.map((entry) => `${entry.level} ≥ ${entry.min}`).join(" · ")}.
                    </p>
                  </div>
                ) : null}
              </Panel>
            </div>

            {report ? (
              <Panel title="Assessment Report" icon={FileText} right={<button type="button" className="text-muted-foreground" onClick={() => setReport(null)}>Close</button>}>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-foreground">{report}</pre>
              </Panel>
            ) : null}

            {incidents.length > 0 ? (
              <Panel title="Recorded Incidents" icon={ClipboardList} right={<span className="text-muted-foreground">{incidents.length} stored</span>}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left font-mono text-[10px]">
                    <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="py-1.5">Incident</th><th>Target</th><th>Sector</th><th>Score</th><th>Level</th><th>Time</th><th>Recommendation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.map((incident) => (
                        <tr key={incident.id} className="border-b border-border/60 last:border-0">
                          <td className="py-1.5 text-foreground">{incident.id}</td>
                          <td>{incident.targetId} · {TYPE_LABEL[incident.type]}</td>
                          <td>{incident.sector}</td>
                          <td>{incident.score}</td>
                          <td><LevelBadge level={incident.level} /></td>
                          <td>{formatTime(incident.timestamp)}</td>
                          <td className="text-muted-foreground">{incident.recommendation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}
          </div>

          <div className="space-y-3">
            <Panel title="Threat Level Distribution" icon={PieChart}>
              <DistributionDonut counts={counts} />
            </Panel>

            <Panel title="Live Threat Alerts" icon={Siren} bodyClassName="p-0">
              <ul className="divide-y divide-border">
                {alerts.map((alert) => {
                  const Icon = TARGET_ICON[alert.type];
                  return (
                    <li key={alert.id} className="flex items-start gap-2 p-2.5">
                      <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: TYPE_COLOR[alert.type] }} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-widest text-foreground">
                          <span className="truncate">{alert.id} · {TYPE_LABEL[alert.type]}</span>
                          <span className="font-mono text-[9px] text-muted-foreground">{formatTime(alert.timestamp)}</span>
                        </p>
                        <p className="mt-0.5 flex items-center justify-between gap-2 text-[9px] text-muted-foreground">
                          <span className="truncate">{alert.text}</span>
                          <LevelBadge level={alert.level} />
                        </p>
                      </div>
                    </li>
                  );
                })}
                <li className="flex items-start gap-2 p-2.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-foreground">System</p>
                    <p className="mt-0.5 flex items-center justify-between gap-2 text-[9px] text-muted-foreground">
                      <span>Radar tracking stable</span>
                      <span className="border border-primary/50 px-1 py-0.5 text-[8px] uppercase tracking-widest text-primary">Info</span>
                    </p>
                  </div>
                </li>
              </ul>
            </Panel>

            <Panel title="Quick Actions" icon={Crosshair}>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" className="justify-start gap-2 text-[9px] uppercase tracking-widest" onClick={() => setNotice(incidents.length ? `${incidents.length} incident record(s) available below` : "No incidents recorded yet")}>
                  <ClipboardList className="size-3.5" /> View Incidents
                </Button>
                <Button size="sm" variant="secondary" className="justify-start gap-2 text-[9px] uppercase tracking-widest" onClick={generateReport}>
                  <FileText className="size-3.5" /> Generate Report
                </Button>
                <Button size="sm" variant="secondary" className="justify-start gap-2 text-[9px] uppercase tracking-widest" onClick={exportData}>
                  <Download className="size-3.5" /> Export Data
                </Button>
                <Button size="sm" variant="secondary" className="justify-start gap-2 text-[9px] uppercase tracking-widest" onClick={() => setAlertConfig((value) => !value)}>
                  <Bell className="size-3.5" /> Set Alerts
                </Button>
              </div>
              {alertConfig ? (
                <div className="mt-3 border border-border bg-card p-2.5">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Alert when level reaches</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as ThreatLevel[]).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setAlertLevel(level)}
                        className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-widest ${alertLevel === level ? "border-primary bg-accent/50 text-foreground" : "border-border text-muted-foreground"}`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-[9px] text-muted-foreground">Alerting at {alertLevel} and above.</p>
                </div>
              ) : null}
            </Panel>

            <Panel title="Sensor Status" icon={RadioTower} bodyClassName="p-0">
              <ul className="divide-y divide-border">
                {SENSOR_ORDER.map((sensor) => {
                  const Icon = SENSOR_ICON[sensor];
                  return (
                    <li key={sensor} className="flex items-center justify-between gap-2 px-2.5 py-2">
                      <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-foreground"><Icon className="size-3.5 text-primary" />{SENSOR_LABEL[sensor]}</span>
                      <span className={`flex items-center gap-1.5 text-[9px] uppercase tracking-widest ${running ? "text-online" : "text-warning"}`}>
                        <StatusDot tone={running ? "online" : "warning"} /> {running ? "Online" : "Standby"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-panel-header px-3 py-2 text-[8px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Academic prototype — decision support only. Does not replace trained personnel or make autonomous decisions.</span>
          <span>Fused target → Risk factors → Risk score → Threat level → Human review</span>
        </div>
      </div>
    </Shell>
  );
}
