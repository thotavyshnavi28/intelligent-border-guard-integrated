import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  Bird,
  Camera,
  Car,
  CheckCircle2,
  Crosshair,
  Database,
  Eye,
  Footprints,
  Gauge,
  Leaf,
  Network,
  Pause,
  Play,
  RadioTower,
  RotateCcw,
  ScanLine,
  Send,
  ShieldAlert,
  Thermometer,
  UserRound,
  Waves,
} from "lucide-react";
import { Panel, Shell, StatusDot } from "@/components/sentinel/Shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFusionSimulation } from "@/hooks/useFusionSimulation";
import {
  SENSOR_LABEL,
  SENSOR_SHORT,
  type FusionTrack,
  type SensorKind,
} from "@/lib/fusion";
import { TYPE_COLOR, TYPE_LABEL, compass, type TargetType } from "@/lib/radar";

export const Route = createFileRoute("/fusion")({
  head: () => ({
    meta: [
      { title: "Multi-Sensor Fusion — Border Sentinel" },
      {
        name: "description",
        content:
          "Live academic prototype for correlating CCTV, radar, thermal, motion, drone and environment observations into unified targets.",
      },
      { property: "og:title", content: "Multi-Sensor Fusion — Border Sentinel" },
      {
        property: "og:description",
        content: "Correlate multiple surveillance sensor observations into unified target records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FusionPage,
});

const SENSOR_ICON: Record<SensorKind, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  cctv: Camera,
  radar: RadioTower,
  thermal: Thermometer,
  motion: Footprints,
  drone: Bird,
  environment: Leaf,
};

const TARGET_ICON: Record<TargetType, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  human: UserRound,
  animal: Footprints,
  vehicle: Car,
  drone: Bird,
};

const SENSOR_ORDER: SensorKind[] = ["cctv", "radar", "thermal", "motion", "drone", "environment"];

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", { hour12: false });
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function trackStatus(track: FusionTrack, threshold: number) {
  return track.confidence >= threshold && !track.conflict ? "CONFIRMED" : "UNCONFIRMED";
}

function ConfidenceBar({ value, threshold }: { value: number; threshold: number }) {
  const confirmed = value >= threshold;
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[9px] uppercase text-muted-foreground">
        <span>Fusion confidence</span>
        <span className={confirmed ? "text-online" : "text-warning"}>{value}%</span>
      </div>
      <div className="mt-1 h-1.5 bg-secondary">
        <div
          className={`h-full transition-all duration-500 ${confirmed ? "bg-online" : "bg-warning"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function SensorStatusCard({ sensor, running }: { sensor: SensorKind; running: boolean }) {
  const Icon = SENSOR_ICON[sensor];
  return (
    <div className="flex min-w-[155px] flex-1 items-center gap-3 border border-border bg-panel px-3 py-2">
      <div className="grid size-9 shrink-0 place-items-center border border-primary/50 bg-accent/40 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
          {SENSOR_LABEL[sensor]}
        </p>
        <p className={`flex items-center gap-1.5 text-[9px] uppercase tracking-widest ${running ? "text-online" : "text-warning"}`}>
          <StatusDot tone={running ? "online" : "warning"} /> {running ? "Online" : "Standby"}
        </p>
      </div>
    </div>
  );
}

function TerrainMap({
  tracks,
  selectedId,
  onSelect,
}: {
  tracks: FusionTrack[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative min-h-[430px] overflow-hidden border border-border bg-background sm:min-h-[520px]">
      <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-label="Simulated border terrain map with tracked targets">
        <defs>
          <pattern id="fusion-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border)" strokeOpacity="0.32" strokeWidth="1" />
          </pattern>
          <pattern id="restricted-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="12" stroke="var(--critical)" strokeOpacity="0.42" strokeWidth="4" />
          </pattern>
        </defs>
        <g pointerEvents="none">
          <rect width="1000" height="620" fill="var(--panel-header)" />
          <path d="M0 90 C170 40 260 145 430 105 S720 42 1000 125 V0 H0Z" fill="var(--accent)" opacity="0.35" />
          <path d="M0 540 C190 450 330 570 530 515 S760 410 1000 485 V620 H0Z" fill="var(--accent)" opacity="0.25" />
          <path d="M-40 465 C180 405 250 330 410 350 S670 450 1040 300" fill="none" stroke="var(--muted-foreground)" strokeOpacity="0.18" strokeWidth="25" />
          <rect width="1000" height="620" fill="url(#fusion-grid)" />
        </g>

        {[200, 400, 600, 800].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="620" stroke="var(--border)" strokeDasharray="5 9" opacity="0.65" />
        ))}
        {[
          ["SECTOR A", 95, 48],
          ["SECTOR B", 290, 48],
          ["SECTOR C", 490, 48],
          ["SECTOR D", 690, 48],
          ["SECTOR E", 890, 48],
        ].map(([label, x, y]) => (
          <text key={String(label)} x={Number(x)} y={Number(y)} textAnchor="middle" fill="var(--muted-foreground)" fontSize="16" fontFamily="var(--font-display)" letterSpacing="2">
            {label}
          </text>
        ))}

        <path d="M70 180 C220 225 300 130 460 195 S720 265 930 175" fill="none" stroke="var(--warning)" strokeWidth="3" strokeDasharray="10 8" opacity="0.85" />
        <text x="75" y="165" fill="var(--warning)" fontSize="12" fontFamily="var(--font-mono)">BORDER BOUNDARY</text>
        <polygon points="390,420 535,382 600,505 445,550" fill="url(#restricted-hatch)" stroke="var(--critical)" strokeOpacity="0.75" />
        <text x="490" y="470" textAnchor="middle" fill="var(--critical)" fontSize="12" fontFamily="var(--font-mono)">RESTRICTED ZONE</text>

        {tracks.map((track) => {
          const color = TYPE_COLOR[track.type];
          const x = track.x * 10;
          const y = track.y * 6.2;
          const selected = selectedId === track.id;
          return (
            <g key={track.id} className="cursor-pointer" onClick={() => onSelect(track.id)} role="button" aria-label={`Select ${track.id}`}>
              {track.trail.length > 1 ? (
                <polyline
                  points={track.trail.map((point) => `${point.x * 10},${point.y * 6.2}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth="3"
                  strokeDasharray="6 6"
                  opacity="0.55"
                />
              ) : null}
              {track.trail.map((point, index) => (
                <circle key={`${point.x}-${point.y}-${index}`} cx={point.x * 10} cy={point.y * 6.2} r="3" fill={color} opacity={(index + 1) / (track.trail.length + 2)} />
              ))}
              {selected ? <circle cx={x} cy={y} r="22" fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 4" /> : null}
              <circle cx={x} cy={y} r="14" fill="var(--background)" stroke={color} strokeWidth="2" className="blip-pulse" />
              <circle cx={x} cy={y} r="5" fill={color} />
              <line x1={x + 13} y1={y - 13} x2={x + 31} y2={y - 31} stroke={color} strokeWidth="1" />
              <rect x={x + 30} y={y - 45} width="82" height="27" fill="var(--background)" stroke={color} />
              <text x={x + 39} y={y - 28} fill="var(--foreground)" fontSize="12" fontFamily="var(--font-mono)">{track.id}</text>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-3 left-3 border border-border bg-background/90 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        Simulated geospatial display • Live correlation overlay
      </div>
      <div className="absolute right-3 top-3 grid size-14 place-items-center border border-border bg-background/80 font-mono text-[10px] text-foreground">
        <span className="absolute top-1">N</span>
        <span className="text-primary">+</span>
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

function FusionPage() {
  const { frame, running, setRunning, mode, setMode, threshold, setThreshold, reset, confirmedCount } = useFusionSimulation();
  const [selectedId, setSelectedId] = useState<string | null>("T-101");
  const [sentTarget, setSentTarget] = useState<string | null>(null);
  const [rawTab, setRawTab] = useState<SensorKind>("cctv");

  const selected = useMemo(
    () => frame.tracks.find((track) => track.id === selectedId) ?? frame.tracks[0] ?? null,
    [frame.tracks, selectedId],
  );
  const hasConflict = frame.tracks.some((track) => Boolean(track.conflict));
  const timestamp = frame.tracks[0]?.timestamp ?? frame.environment.timestamp;

  useEffect(() => {
    if (sentTarget === null) return;
    const timer = window.setTimeout(() => setSentTarget(null), 3500);
    return () => window.clearTimeout(timer);
  }, [sentTarget]);

  function sendToAssessment(track: FusionTrack) {
    const payload = {
      targetId: track.id,
      objectType: track.type,
      sector: track.sector,
      distance: track.distance,
      speed: track.speed,
      direction: compass(track.heading),
      sensors: track.sensors,
      fusionConfidence: track.confidence,
      detectionTimestamp: track.timestamp,
    };
    void payload;
    setSentTarget(track.id);
  }

  return (
    <Shell moduleTitle="Multi-Sensor Fusion" moduleSubtitle="Correlate • Analyze • Identify • Assess">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-panel px-3 py-2 xl:hidden">
          <div>
            <h2 className="font-display text-lg font-bold uppercase tracking-[0.16em]">Multi-Sensor Fusion</h2>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Correlate • Analyze • Identify • Assess</p>
          </div>
          <div className="text-right font-mono text-[10px] uppercase text-muted-foreground">
            <p className="text-online">● System Online</p>
            <p>{formatTime(timestamp)} · {formatDate(timestamp)}</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {SENSOR_ORDER.map((sensor) => <SensorStatusCard key={sensor} sensor={sensor} running={running} />)}
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px_260px]">
          <Panel title="Sensor Data Visualization" icon={ScanLine} right={<span className="text-online">Live • {formatTime(timestamp)}</span>}>
            <TerrainMap tracks={frame.tracks} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            <TargetLegend />
          </Panel>

          <Panel title="Fused Targets" icon={Network} bodyClassName="p-2" className="h-fit">
            <div className="space-y-2">
              {frame.tracks.map((track) => {
                const Icon = TARGET_ICON[track.type];
                const status = trackStatus(track, threshold);
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => setSelectedId(track.id)}
                    className={`w-full border bg-card p-2.5 text-left transition-colors ${selected?.id === track.id ? "border-primary bg-accent/50" : "border-border hover:bg-accent/30"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest">
                        <Icon className="size-4" style={{ color: TYPE_COLOR[track.type] }} /> {track.id} · {TYPE_LABEL[track.type]}
                      </span>
                      <span className={`border px-1 py-0.5 text-[8px] uppercase tracking-widest ${status === "CONFIRMED" ? "border-online/50 text-online" : "border-warning/50 text-warning"}`}>{status}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[9px] uppercase text-muted-foreground">
                      <span>Sector: <b className="font-normal text-foreground">{track.sector}</b></span>
                      <span>Distance: <b className="font-normal text-foreground">{track.distance} m</b></span>
                      <span>Speed: <b className="font-normal text-foreground">{track.speed.toFixed(0)} km/h</b></span>
                      <span>Direction: <b className="font-normal text-foreground">{compass(track.heading)}</b></span>
                    </div>
                    <p className="mt-2 truncate text-[9px] uppercase tracking-wider text-muted-foreground">
                      Sensors: <span className="text-foreground">{track.sensors.map((sensor) => SENSOR_SHORT[sensor]).join(" + ") || "No agreement"}</span>
                    </p>
                    <div className="mt-2"><ConfidenceBar value={track.confidence} threshold={threshold} /></div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Sensor Inputs" icon={RadioTower} right={<span className="text-muted-foreground">Individual Detections</span>} bodyClassName="p-0" className="h-fit">
            <div className="divide-y divide-border">
              {SENSOR_ORDER.filter((sensor) => sensor !== "environment").map((sensor) => {
                const Icon = SENSOR_ICON[sensor];
                const observations = frame.observations.filter((item) => item.sensor === sensor);
                return (
                  <div key={sensor} className="p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest"><Icon className="size-3.5 text-primary" />{SENSOR_LABEL[sensor]}</span>
                      <span className="flex items-center gap-1 text-[8px] uppercase text-online"><StatusDot /> Confirmed</span>
                    </div>
                    <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                      {observations.length} {sensor === "radar" ? "targets tracked" : sensor === "thermal" ? "heat signatures" : sensor === "motion" ? "movements detected" : sensor === "drone" ? "aerial targets" : "objects detected"}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[9px] text-foreground">{observations.map((item) => item.targetId).join(", ") || "Awaiting input"}</p>
                  </div>
                );
              })}
              <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest"><Leaf className="size-3.5 text-primary" />Environment Sensor</span>
                  <span className="flex items-center gap-1 text-[8px] uppercase text-online"><StatusDot /> Optimal</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 font-mono text-[9px] text-muted-foreground">
                  <span>Temp: {frame.environment.temperature.toFixed(1)}°C</span><span>Humidity: {frame.environment.humidity}%</span>
                  <span>Wind: {frame.environment.wind} km/h</span><span>Visibility: {frame.environment.visibility.toFixed(1)} km</span>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)_300px]">
          <Panel title="Raw Sensor Data" icon={Database} bodyClassName="p-0">
            <Tabs value={rawTab} onValueChange={(value) => setRawTab(value as SensorKind)}>
              <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-border bg-panel-header p-0">
                {SENSOR_ORDER.map((sensor) => <TabsTrigger key={sensor} value={sensor} className="rounded-none px-3 py-2 text-[9px] uppercase tracking-widest">{SENSOR_SHORT[sensor]}</TabsTrigger>)}
              </TabsList>
              {SENSOR_ORDER.map((sensor) => (
                <TabsContent key={sensor} value={sensor} className="m-0 max-h-64 overflow-y-auto p-3">
                  {sensor === "environment" ? (
                    <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground">
                      <span>Temperature <b className="font-normal text-foreground">{frame.environment.temperature.toFixed(1)}°C</b></span>
                      <span>Humidity <b className="font-normal text-foreground">{frame.environment.humidity}%</b></span>
                      <span>Wind <b className="font-normal text-foreground">{frame.environment.wind} km/h</b></span>
                      <span>Visibility <b className="font-normal text-foreground">{frame.environment.visibility.toFixed(1)} km</b></span>
                      <span className="col-span-2">Observed {formatTime(frame.environment.timestamp)}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {frame.observations.filter((item) => item.sensor === sensor).map((item) => (
                        <div key={item.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border pb-2 font-mono text-[9px] last:border-0">
                          <div><p className="text-foreground">{item.summary}</p><p className="text-muted-foreground">Sector {item.sector} · Confidence {item.confidence}%</p></div>
                          <time className="text-muted-foreground">{formatTime(item.timestamp)}</time>
                          {item.conflict ? <p className="col-span-2 text-warning">Conflict: {item.conflict}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </Panel>

          <Panel title="Fusion Process" icon={Waves}>
            <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
              {[
                { icon: RadioTower, title: "Sensor Data Collection", body: "CCTV · Radar · Thermal · Motion · Drone · Environment" },
                { icon: Network, title: "Data Correlation", body: "Object · Location · Timestamp · Movement" },
                { icon: Crosshair, title: "Target Identification", body: "Type · Position · Sensor agreement" },
                { icon: ShieldAlert, title: "Fused Target", body: "Unified record ready for Feature 5" },
              ].map((step, index) => (
                <div key={step.title} className="contents">
                  <div className="flex min-h-28 flex-col items-center justify-center border border-border bg-card p-3 text-center">
                    <step.icon className="size-5 text-primary" />
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-foreground">{index + 1}. {step.title}</p>
                    <p className="mt-1 text-[8px] uppercase leading-relaxed tracking-wider text-muted-foreground">{step.body}</p>
                  </div>
                  {index < 3 ? <ArrowRight className="mx-auto hidden size-4 self-center text-primary sm:block" /> : null}
                </div>
              ))}
            </div>
            <div className={`mt-3 flex items-center gap-3 border px-3 py-2 ${hasConflict ? "border-warning/50 bg-warning/5" : "border-online/50 bg-online/5"}`}>
              {hasConflict ? <Activity className="size-5 shrink-0 text-warning" /> : <CheckCircle2 className="size-5 shrink-0 text-online" />}
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-widest ${hasConflict ? "text-warning" : "text-online"}`}>{hasConflict ? "Correlation Uncertain" : "Fusion Complete"}</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{frame.tracks.length} targets correlated · {confirmedCount} above threshold · Ready for threat assessment</p>
                {hasConflict ? <p className="mt-1 text-[9px] text-warning">{frame.tracks.find((track) => track.conflict)?.conflict}</p> : null}
              </div>
            </div>
            <p className="mt-2 text-[8px] uppercase leading-relaxed tracking-widest text-muted-foreground">
              Prototype confidence = 65% sensor confidence + 20% sensor agreement + 8% spatial consistency + 7% temporal consistency. Demonstration model only.
            </p>
          </Panel>

          <Panel title="Simulation Controls" icon={Gauge} className="h-fit">
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" onClick={() => setRunning(true)} variant={running ? "default" : "secondary"}><Play className="size-3.5" />Start</Button>
              <Button size="sm" variant="secondary" onClick={() => setRunning(false)}><Pause className="size-3.5" />Pause</Button>
              <Button size="sm" variant="secondary" onClick={reset}><RotateCcw className="size-3.5" />Reset</Button>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[9px] uppercase tracking-widest text-muted-foreground">Sensor Fusion Mode</p>
              <RadioGroup value={mode} onValueChange={(value) => setMode(value as "auto" | "manual")} className="grid grid-cols-2 gap-2">
                {(["auto", "manual"] as const).map((value) => (
                  <Label key={value} htmlFor={`fusion-${value}`} className={`flex cursor-pointer items-center gap-2 border p-2 text-[9px] uppercase tracking-widest ${mode === value ? "border-primary bg-accent/50 text-foreground" : "border-border text-muted-foreground"}`}>
                    <RadioGroupItem id={`fusion-${value}`} value={value} /> {value}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-[9px] uppercase tracking-widest text-muted-foreground"><span>Fusion Confidence Threshold</span><span className="font-mono text-foreground">{threshold}%</span></div>
              <Slider className="mt-3" min={50} max={95} step={1} value={[threshold]} onValueChange={(value) => setThreshold(value[0] ?? threshold)} />
            </div>
          </Panel>
        </div>

        {selected ? (
          <Panel title={`Selected Fused Target — ${selected.id}`} icon={Eye} right={<span className={trackStatus(selected, threshold) === "CONFIRMED" ? "text-online" : "text-warning"}>{trackStatus(selected, threshold)}</span>}>
            <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr_auto]">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] uppercase tracking-wider">
                {[
                  ["Object Type", TYPE_LABEL[selected.type]], ["Position", `${selected.x.toFixed(1)}, ${selected.y.toFixed(1)}`],
                  ["Distance", `${selected.distance} m`], ["Speed", `${selected.speed.toFixed(1)} km/h`],
                  ["Direction", compass(selected.heading)], ["Sector", selected.sector],
                  ["Detection Time", formatTime(selected.timestamp)], ["Sensors", selected.sensors.map((sensor) => SENSOR_SHORT[sensor]).join(", ")],
                ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-mono text-foreground">{value}</dd></div>)}
              </dl>
              <div>
                <p className="mb-2 text-[9px] uppercase tracking-widest text-muted-foreground">Individual Sensor Observations</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selected.observations.map((observation) => (
                    <div key={observation.id} className="border border-border bg-card px-2 py-1.5 font-mono text-[9px]">
                      <p className="uppercase text-primary">{SENSOR_LABEL[observation.sensor]} · {observation.confidence}%</p>
                      <p className="text-muted-foreground">{observation.summary}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3"><ConfidenceBar value={selected.confidence} threshold={threshold} /></div>
                {selected.conflict ? <p className="mt-2 text-[9px] text-warning">Conflict: {selected.conflict}</p> : null}
              </div>
              <div className="flex min-w-56 flex-col justify-end">
                <Button onClick={() => sendToAssessment(selected)} disabled={trackStatus(selected, threshold) !== "CONFIRMED"} className="w-full gap-2 uppercase tracking-widest">
                  <Send className="size-4" /> Send to Threat Assessment
                </Button>
                <p className="mt-2 text-[8px] uppercase leading-relaxed tracking-widest text-muted-foreground">Transfers fused observations only. Final threat scoring is performed in Feature 5.</p>
                {sentTarget === selected.id ? <p className="mt-2 border border-online/50 bg-online/5 p-2 text-center text-[9px] uppercase tracking-widest text-online">{selected.id} queued for assessment</p> : null}
              </div>
            </div>
          </Panel>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-panel-header px-3 py-2 text-[8px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Academic prototype · Simulated multi-sensor data · Not an operational military system</span>
          <span>Multiple observations → Correlation → Unified target → Confidence → Threat assessment</span>
        </div>
      </div>
    </Shell>
  );
}