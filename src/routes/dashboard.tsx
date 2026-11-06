import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowRight, Bell, Bird, Camera, Car,
  CheckCircle2, ChevronRight, ClipboardList, Crosshair, Database, FileText,
  Footprints, Gauge, Info, LayoutGrid, Map as MapIcon, Network, Pause, Play,
  RadioTower, ShieldAlert, ShieldCheck, Siren, UserRound, Video, Eye,
} from "lucide-react";
import { Panel, Shell, StatusDot } from "@/components/sentinel/Shell";
import { Button } from "@/components/ui/button";
import { useFusionSimulation } from "@/hooks/useFusionSimulation";
import { readIncidentRecords, subscribeIncidentRecords } from "@/lib/incidents";
import { SENSOR_LABEL, SENSOR_SHORT, type FusionTrack, type SensorKind } from "@/lib/fusion";
import { TYPE_COLOR, TYPE_LABEL, compass, geoOf, type TargetType } from "@/lib/radar";
import { assessTrack, type ThreatAssessment, type ThreatLevel } from "@/lib/threat";
import { getDashboardStats, type DashboardStats } from "@/services/dashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Command Dashboard — Border Sentinel" },
      { name: "description", content: "Integrated academic prototype dashboard for simulated CCTV, radar, sensor fusion and human-reviewed threat assessment." },
      { property: "og:title", content: "Command Dashboard — Border Sentinel" },
      { property: "og:description", content: "Monitor simulated border targets, sensor activity and transparent prototype risk assessments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ]
  }),
  component: CommandDashboard,
});

const TYPE_ICON: Record<TargetType, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  human: UserRound, animal: Footprints, vehicle: Car, drone: Bird,
};
const SENSOR_ICON: Record<SensorKind, ComponentType<{ className?: string }>> = {
  cctv: Camera, radar: RadioTower, thermal: Activity, motion: Footprints, drone: Bird, environment: Gauge,
};
const SENSORS: SensorKind[] = ["cctv", "radar", "thermal", "motion", "drone", "environment"];
const LEVEL_COLOR: Record<ThreatLevel, string> = {
  LOW: "var(--online)", MEDIUM: "var(--warning)", HIGH: "var(--critical)", CRITICAL: "var(--critical)",
};

function timeOf(value: number) {
  return value ? new Date(value).toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--";
}

const TONE_ICON: Record<string, string> = {
  primary: "border-primary/40 bg-primary/10 text-primary",
  critical: "border-critical/40 bg-critical/10 text-critical",
  warning: "border-warning/40 bg-warning/10 text-warning",
  online: "border-online/40 bg-online/10 text-online",
};

function Summary({ label, value, tone, icon: Icon }: { label: string; value: string | number; tone: string; icon: ComponentType<{ className?: string }> }) {
  const toneIcon = TONE_ICON[tone] ?? TONE_ICON["primary"]!;
  return <div className="flex min-w-0 items-center gap-3 border border-border bg-panel px-3 py-3">
    <span className={`grid size-10 shrink-0 place-items-center border ${toneIcon}`}><Icon className="size-5" /></span>
    <div className="min-w-0"><p className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className={`font-display text-2xl font-bold leading-tight ${toneIcon.split(" ")[2]}`}>{value}</p></div>
  </div>;
}

function ThreatMap({ tracks, assessments, selectedId, select }: {
  tracks: FusionTrack[];
  assessments: Map<string, ThreatAssessment>;
  selectedId: string | null;
  select: (id: string) => void;
}) {
  return <div className="relative min-h-[340px] overflow-hidden border border-border bg-background sm:min-h-[440px]">
    <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-label="Live simulated border map">
      <defs>
        <pattern id="dashboard-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="var(--border)" strokeOpacity=".36" /></pattern>
        <pattern id="dashboard-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12" stroke="var(--critical)" strokeOpacity=".42" strokeWidth="4" /></pattern>
      </defs>
      <g pointerEvents="none">
        <rect width="1000" height="620" fill="var(--panel-header)" />
        <path d="M0 90C170 40 260 145 430 105S720 42 1000 125V0H0Z" fill="var(--accent)" opacity=".46" />
        <path d="M0 540C190 450 330 570 530 515S760 410 1000 485V620H0Z" fill="var(--accent)" opacity=".3" />
        <path d="M-40 465C180 405 250 330 410 350S670 450 1040 300" fill="none" stroke="var(--muted-foreground)" strokeOpacity=".2" strokeWidth="20" />
        <rect width="1000" height="620" fill="url(#dashboard-grid)" />
        {[200, 400, 600, 800].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="620" stroke="var(--border)" strokeDasharray="5 9" />)}
        {[["A", 95], ["B", 290], ["C", 490], ["D", 690], ["E", 890]].map(([label, x]) => <text key={String(label)} x={Number(x)} y="48" textAnchor="middle" fill="var(--muted-foreground)" fontSize="16" fontFamily="var(--font-display)">SECTOR {label}</text>)}
        <path d="M70 180C220 225 300 130 460 195S720 265 930 175" fill="none" stroke="var(--warning)" strokeWidth="3" strokeDasharray="10 8" />
        <text x="75" y="165" fill="var(--warning)" fontSize="12" fontFamily="var(--font-mono)">BORDER BOUNDARY</text>
        <polygon points="390,420 535,382 600,505 445,550" fill="url(#dashboard-hatch)" stroke="var(--critical)" strokeOpacity=".8" />
        <text x="490" y="470" textAnchor="middle" fill="var(--critical)" fontSize="12" fontFamily="var(--font-mono)">RESTRICTED ZONE</text>
      </g>
      {tracks.map((track) => {
        const assessment = assessments.get(track.id);
        const color = LEVEL_COLOR[assessment?.level ?? "LOW"];
        const typeColor = TYPE_COLOR[track.type];
        const x = track.x * 10;
        const y = track.y * 6.2;
        return <g key={track.id} role="button" tabIndex={0} aria-label={`Select ${track.id}`} className="cursor-pointer" onClick={() => select(track.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") select(track.id); }}>
          {track.trail.length > 1 ? <polyline points={track.trail.map((p) => `${p.x * 10},${p.y * 6.2}`).join(" ")} fill="none" stroke={typeColor} strokeWidth="3" strokeDasharray="6 6" opacity=".65" /> : null}
          {selectedId === track.id ? <circle cx={x} cy={y} r="23" fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 4" /> : null}
          <circle cx={x} cy={y} r="14" fill="var(--background)" stroke={color} strokeWidth="2" className="blip-pulse" />
          <circle cx={x} cy={y} r="5" fill={typeColor} />
          <path d={`M${x} ${y}l${Math.cos(track.heading * Math.PI / 180) * 26} ${Math.sin(track.heading * Math.PI / 180) * 26}`} stroke={typeColor} strokeWidth="2" />
          <rect x={x + 21} y={y - 43} width="98" height="35" fill="var(--background)" stroke={color} />
          <text x={x + 29} y={y - 28} fill="var(--foreground)" fontSize="12" fontFamily="var(--font-mono)">{track.id}</text>
          <text x={x + 29} y={y - 14} fill={color} fontSize="9" fontFamily="var(--font-mono)">{assessment?.level ?? "LOW"}</text>
        </g>;
      })}
    </svg>
    <div className="absolute bottom-2 left-2 border border-border bg-background/90 px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Simulated terrain · prototype threat overlay</div>
    <div className="absolute right-2 top-2 grid size-11 place-items-center border border-border bg-background/90 font-mono text-xs text-primary"><span className="absolute top-0.5 text-[8px]">N</span>+</div>
    <span className="absolute bottom-2 right-2 border border-border bg-background/90 px-2 py-1 font-mono text-[8px] text-muted-foreground">0 ─── 500 m</span>
  </div>;
}

function CommandDashboard() {
  const { frame, running, setRunning } = useFusionSimulation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardStats()
      .then((data) => {
        setStats(data);
        setStatsError(null);
      })
      .catch((error) => {
        setStatsError(error.message);
      });
  }, []); const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>("T-101");
  const [incidents, setIncidents] = useState(() => readIncidentRecords());
  const [report, setReport] = useState<string | null>(null);
  const [alertsOn, setAlertsOn] = useState(true);
  const [exportType, setExportType] = useState<"json" | "csv">("json");

  useMemo(() => subscribeIncidentRecords(() => setIncidents(readIncidentRecords())), []);

  const assessments = useMemo(() => new Map(frame.tracks.map((track) => [track.id, assessTrack(track)])), [frame.tracks]);
  const counts = useMemo(() => {
    const result = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    assessments.forEach(({ level }) => {
      if (level === "HIGH" || level === "CRITICAL") result.HIGH += 1;
      else if (level === "MEDIUM") result.MEDIUM += 1;
      else result.LOW += 1;
    });
    return result;
  }, [assessments]);
  const selected = frame.tracks.find((track) => track.id === selectedId) ?? frame.tracks[0] ?? null;
  const selectedAssessment = selected ? assessments.get(selected.id) : undefined;
  const timestamp = frame.environment.timestamp || frame.tracks[0]?.timestamp || 0;
  const highTargets = frame.tracks.filter((track) => {
    const level = assessments.get(track.id)?.level;
    return level === "HIGH" || level === "CRITICAL";
  }).length;
  const latestEvents = useMemo(() => frame.tracks.map((track) => ({
    track,
    assessment: assessments.get(track.id),
    timestamp: track.timestamp,
  })).sort((a, b) => b.timestamp - a.timestamp || (b.assessment?.score ?? 0) - (a.assessment?.score ?? 0)), [frame.tracks, assessments]);

  function exportData() {
    const rows = frame.tracks.map((track) => ({ ...track, assessment: assessments.get(track.id) }));
    const content = exportType === "json" ? JSON.stringify(rows, null, 2) : [
      "target_id,type,sector,distance_m,speed_kmh,direction,confidence,threat_level,threat_score,sensors",
      ...rows.map((row) => [row.id, row.type, row.sector, row.distance, row.speed.toFixed(1), compass(row.heading), row.confidence, row.assessment?.level, row.assessment?.score, row.sensors.join("+")].join(",")),
    ].join("\n");
    const blob = new Blob([content], { type: exportType === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `border-sentinel-${Date.now()}.${exportType}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function generateReport() {
    setReport([
      "BORDER SENTINEL — COMMAND SUMMARY",
      `Generated: ${new Date().toLocaleString("en-GB")}`,
      `Simulation: ${running ? "ACTIVE" : "PAUSED"} · Targets: ${frame.tracks.length} · Sensors: ${SENSORS.length}/6 online`,
      `Assessed: ${frame.tracks.length} · High/Critical: ${counts.HIGH} · Medium: ${counts.MEDIUM} · Low: ${counts.LOW}`,
      "",
      ...frame.tracks.map((track) => {
        const assessment = assessments.get(track.id);
        return `${track.id} ${TYPE_LABEL[track.type]} · Sector ${track.sector} · ${track.distance} m · ${track.speed.toFixed(0)} km/h · ${assessment?.level ?? "LOW"} (${assessment?.score ?? 0}/100)`;
      }),
      "",
      "Academic prototype — decision support only.",
    ].join("\n"));
  }

  const totalForDonut = Math.max(1, frame.tracks.length);
  const donutSegments: Array<{ label: string; value: number; color: string }> = [
    { label: "HIGH", value: counts.HIGH, color: "var(--critical)" },
    { label: "MEDIUM", value: counts.MEDIUM, color: "var(--warning)" },
    { label: "LOW", value: counts.LOW, color: "var(--online)" },
  ];
  let offset = 0;
  const circumference = Math.PI * 2 * 34;

  return <Shell moduleTitle="Command Dashboard" moduleSubtitle="Integrated Multi-Sensor Surveillance & Threat Analysis">
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-panel px-3 py-2 xl:hidden">
        <div><h2 className="font-display text-lg font-bold uppercase tracking-[.14em]">Command Dashboard</h2><p className="text-[9px] uppercase tracking-widest text-muted-foreground">Integrated multi-sensor surveillance & threat analysis</p></div>
        <span className={`flex items-center gap-1.5 text-[9px] uppercase ${running ? "text-online" : "text-warning"}`}><StatusDot tone={running ? "online" : "warning"} />{running ? "System Online" : "Live Data Paused"}<time className="ml-2 font-mono text-muted-foreground">{timeOf(timestamp)}</time></span>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Summary label="Total Targets" value={frame.tracks.length.toString().padStart(2, "0")} tone="primary" icon={Crosshair} />
        <Summary label="Threats Detected" value={highTargets.toString().padStart(2, "0")} tone="critical" icon={ShieldAlert} />
        <Summary label="Active Alerts" value={latestEvents.filter(({ assessment }) => (assessment?.level === "HIGH" || assessment?.level === "CRITICAL" || assessment?.level === "MEDIUM") && alertsOn).length.toString().padStart(2, "0")} tone="warning" icon={Bell} />
        <Summary label="Sensors Online" value={`${SENSORS.length.toString().padStart(2, "0")}/06`} tone="online" icon={RadioTower} />
      </div>

      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0 space-y-3">
          <Panel title="Live Border Surveillance" icon={MapIcon} right={<span className={`flex items-center gap-1.5 ${running ? "text-online" : "text-warning"}`}><StatusDot tone={running ? "online" : "warning"} />{running ? "LIVE" : "LIVE DATA PAUSED"}<span className="font-mono text-muted-foreground">· {timeOf(timestamp)}</span></span>}>
            <ThreatMap tracks={frame.tracks} assessments={assessments} selectedId={selected?.id ?? null} select={setSelectedId} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-[8px] uppercase tracking-widest text-muted-foreground">
              {(Object.keys(TYPE_LABEL) as TargetType[]).map((type) => { const Icon = TYPE_ICON[type]; return <span key={type} className="flex items-center gap-1.5"><Icon className="size-3.5" style={{ color: TYPE_COLOR[type] }} />{TYPE_LABEL[type]}</span>; })}
              <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-warning" />Border boundary</span>
              <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-primary" />Track path</span>
              <span className="flex items-center gap-1.5"><span className="size-3 border border-critical bg-critical/20" />Restricted zone</span>
            </div>
          </Panel>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(270px,.75fr)]">
            <Panel title="Active Targets" icon={Crosshair} right={<span>{frame.tracks.length} TRACKED</span>} bodyClassName="p-0">
              <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left font-mono text-[9px]">
                <thead className="bg-panel-header text-[8px] uppercase tracking-widest text-muted-foreground"><tr><th className="px-2 py-2">ID / Type</th><th>Distance</th><th>Speed</th><th>Direction</th><th>Sector</th><th>Status</th></tr></thead>
                <tbody>{frame.tracks.map((track) => {
                  const Icon = TYPE_ICON[track.type]; const level = assessments.get(track.id)?.level ?? "LOW"; return <tr key={track.id} onClick={() => setSelectedId(track.id)} className={`cursor-pointer border-t border-border/70 ${selected?.id === track.id ? "bg-accent/40" : "hover:bg-accent/20"}`}>
                    <td className="px-2 py-2"><span className="flex items-center gap-1.5 text-foreground"><Icon className="size-3.5" style={{ color: TYPE_COLOR[track.type] }} />{track.id}</span><span className="ml-5 text-[8px] uppercase text-muted-foreground">{TYPE_LABEL[track.type]}</span></td><td>{track.distance} m</td><td>{track.speed.toFixed(0)} km/h</td><td>{compass(track.heading)}</td><td>{track.sector}</td><td><span className="flex items-center gap-1.5" style={{ color: LEVEL_COLOR[level] }}><StatusDot tone={level === "LOW" ? "online" : level === "MEDIUM" ? "warning" : "critical"} />{level}</span></td>
                  </tr>;
                })}</tbody>
              </table></div>
              {selected ? <div className="grid gap-3 border-t border-border bg-card p-3 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0"><p className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest"><Eye className="size-4 text-primary" />{selected.id} · {TYPE_LABEL[selected.type]} <span className="text-muted-foreground">/ Sector {selected.sector}</span></p>
                  <p className="mt-1 font-mono text-[9px] text-muted-foreground">{selected.distance} m · {selected.speed.toFixed(0)} km/h · {compass(selected.heading)} · {geoOf({ x: selected.x * 10, y: selected.y * 10 }).lat}° N, {geoOf({ x: selected.x * 10, y: selected.y * 10 }).lon}° E</p>
                  <p className="mt-1 text-[8px] uppercase tracking-widest text-muted-foreground">Sources: <span className="text-foreground">{selected.sensors.map((sensor) => SENSOR_SHORT[sensor]).join(" + ")}</span> · Fusion {selected.confidence}% · Tracking Active</p>
                </div>
                <Button size="sm" variant="secondary" className="self-center uppercase tracking-widest" onClick={() => void navigate({ to: "/threat", search: { target: selected.id } })}>View assessment <ChevronRight className="size-3.5" /></Button>
              </div> : null}
            </Panel>

            <div className="space-y-3">
              <Panel title="Threat Summary" icon={ShieldCheck}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative size-28 shrink-0">
                    <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-label="Threat level distribution">
                      <circle cx="50" cy="50" r="34" fill="none" stroke="var(--secondary)" strokeWidth="10" />
                      {donutSegments.map((segment) => { const length = segment.value / totalForDonut * circumference; const currentOffset = offset; offset += length; return segment.value ? <circle key={segment.label} cx="50" cy="50" r="34" fill="none" stroke={segment.color} strokeWidth="10" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-currentOffset} /> : null; })}
                    </svg><div className="absolute inset-0 grid place-content-center text-center"><b className="font-display text-xl">{frame.tracks.length}</b><span className="text-[8px] uppercase text-muted-foreground">Assessed</span></div>
                  </div>
                  <div className="min-w-[130px] flex-1 space-y-2">{donutSegments.map(({ label, value, color }) => <div key={label} className="flex items-center justify-between font-mono text-[9px]"><span className="flex items-center gap-2 text-muted-foreground"><span className="size-2" style={{ backgroundColor: color }} />{label}</span><b style={{ color }}>{value}</b></div>)}</div>
                </div>
                {frame.tracks.length ? <div className="mt-3 border border-critical/40 bg-critical/5 p-2.5">
                  <div className="flex items-center justify-between gap-2"><span className="text-[8px] uppercase tracking-widest text-muted-foreground">Top assessed target</span><span className="font-mono text-[8px] text-critical">{[...frame.tracks].sort((a, b) => (assessments.get(b.id)?.score ?? 0) - (assessments.get(a.id)?.score ?? 0))[0]?.id}</span></div>
                  {(() => { const top = [...frame.tracks].sort((a, b) => (assessments.get(b.id)?.score ?? 0) - (assessments.get(a.id)?.score ?? 0))[0]; if (!top) return null; const assessment = assessments.get(top.id); return <><p className="mt-1 font-display text-sm font-bold uppercase">{TYPE_LABEL[top.type]} · Sector {top.sector}</p><p className="font-mono text-[9px] text-muted-foreground">{top.distance} m · {top.speed.toFixed(0)} km/h · Score {assessment?.score}/100</p><Button size="sm" variant="secondary" className="mt-2 w-full justify-between text-[9px] uppercase tracking-widest" onClick={() => void navigate({ to: "/threat", search: { target: top.id } })}>View full assessment <ArrowRight className="size-3" /></Button></>; })()}
                </div> : <p className="mt-3 text-[9px] text-muted-foreground">No active targets to assess.</p>}
              </Panel>

              <Panel title="Sensor Status" icon={RadioTower} bodyClassName="p-0"><ul className="divide-y divide-border">{SENSORS.map((sensor) => { const Icon = SENSOR_ICON[sensor]; const inputCount = sensor === "environment" ? 1 : frame.observations.filter((observation) => observation.sensor === sensor).length; return <li key={sensor} className="flex items-center justify-between gap-2 px-3 py-2"><span className="flex items-center gap-2 text-[9px] uppercase tracking-widest"><Icon className="size-3.5 text-primary" />{SENSOR_LABEL[sensor]}</span><span className="flex items-center gap-1.5 font-mono text-[8px] uppercase text-online"><StatusDot />Online · {inputCount}</span></li>; })}</ul></Panel>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <Panel title="Live Feed & Alerts" icon={Siren} right={<span className="text-online">{alertsOn ? "MONITORING" : "MUTED"}</span>} bodyClassName="p-0">
            <ul className="divide-y divide-border">
              {latestEvents.slice(0, 5).map(({ track, assessment }) => { const level = assessment?.level ?? "LOW"; const Icon = TYPE_ICON[track.type]; const event = level === "HIGH" || level === "CRITICAL" ? "High threat assessment" : level === "MEDIUM" ? "Elevated risk factors" : track.type === "drone" ? "Drone detected" : "Target update"; return <li key={track.id} className="flex items-start gap-2.5 px-3 py-2.5"><Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: TYPE_COLOR[track.type] }} /><div className="min-w-0 flex-1"><p className="flex justify-between gap-2 text-[9px] font-semibold uppercase tracking-wider"><span className="truncate">{track.id} · {event}</span><time className="font-mono text-muted-foreground">{timeOf(track.timestamp)}</time></p><p className="mt-0.5 flex justify-between gap-2 text-[8px] text-muted-foreground"><span>Sector {track.sector} · Score {assessment?.score ?? 0}/100</span><span style={{ color: LEVEL_COLOR[level] }}>{level}</span></p></div></li>; })}
              <li className="flex items-start gap-2.5 px-3 py-2.5"><Info className="mt-0.5 size-3.5 text-primary" /><div><p className="text-[9px] font-semibold uppercase">System</p><p className="text-[8px] text-muted-foreground">Sensor network {running ? "operational" : "simulation paused"} · {SENSORS.length}/6 online</p></div></li>
            </ul>
          </Panel>

          <Panel title="Quick Actions" icon={Activity}>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" className="justify-start text-[8px] uppercase tracking-widest" onClick={() => void navigate({ to: "/incidents" })}><ClipboardList className="size-3.5" />View incidents</Button>
              <Button size="sm" variant="secondary" className="justify-start text-[8px] uppercase tracking-widest" onClick={generateReport}><FileText className="size-3.5" />Generate report</Button>
              <Button size="sm" variant="secondary" className="justify-start text-[8px] uppercase tracking-widest" onClick={exportData}><ArrowDownToLine className="size-3.5" />Export {exportType.toUpperCase()}</Button>
              <Button size="sm" variant="secondary" className="justify-start text-[8px] uppercase tracking-widest" onClick={() => setAlertsOn((value) => !value)}><Bell className="size-3.5" />Alerts {alertsOn ? "On" : "Off"}</Button>
            </div>
            <label className="mt-3 flex items-center justify-between border-t border-border pt-2 font-mono text-[8px] uppercase text-muted-foreground"><span>Export format</span><select aria-label="Export format" value={exportType} onChange={(event) => setExportType(event.target.value as "json" | "csv")} className="border border-border bg-background px-2 py-1 text-foreground"><option value="json">JSON</option><option value="csv">CSV</option></select></label>
          </Panel>

          <Panel title="System Health" icon={CheckCircle2} bodyClassName="p-0"><ul className="divide-y divide-border">{[["CCTV AI", Video], ["Radar Engine", RadioTower], ["Fusion Engine", Network], ["Threat Engine", ShieldCheck], ["Database", Database], ["API Feed", Activity]].map(([label, Icon]) => { const HealthIcon = Icon as ComponentType<{ className?: string }>; return <li key={label as string} className="flex items-center justify-between px-3 py-2"><span className="flex items-center gap-2 text-[9px] uppercase tracking-widest"><HealthIcon className="size-3.5 text-muted-foreground" />{label as string}</span><span className="flex items-center gap-1.5 text-[8px] uppercase text-online"><StatusDot />Operational</span></li>; })}</ul></Panel>
        </aside>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
        <Panel title="Recent Incidents" icon={ClipboardList} right={<Button asChild size="sm" variant="ghost" className="h-6 px-1.5 text-[8px] uppercase tracking-widest"><Link to="/incidents">View all <ChevronRight className="size-3" /></Link></Button>} bodyClassName="p-0">
          {incidents.length ? <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left font-mono text-[9px]"><thead className="text-[8px] uppercase tracking-widest text-muted-foreground"><tr className="border-b border-border"><th className="px-3 py-2">Time</th><th>Type</th><th>Target</th><th>Status</th></tr></thead><tbody>{incidents.slice(0, 4).map((incident) => <tr key={incident.id} className="border-b border-border/60 last:border-0"><td className="px-3 py-2">{timeOf(incident.timestamp)}</td><td>{TYPE_LABEL[incident.type]}</td><td>{incident.targetId}</td><td className="text-critical">{incident.level}</td></tr>)}</tbody></table></div> : <p className="px-3 py-4 text-[9px] uppercase tracking-widest text-muted-foreground">No incidents recorded. High and critical assessments can be sent to Incident History.</p>}
        </Panel>
        <Panel title="Real-Time System Flow" icon={Network}>
          <div className="flex flex-wrap items-center gap-1.5">{[{ label: "CCTV AI", icon: Camera, to: "/" as const }, { label: "Radar", icon: RadioTower, to: "/radar" as const }, { label: "Simulation", icon: Activity, to: "/simulation" as const }, { label: "Sensor Fusion", icon: Network, to: "/fusion" as const }, { label: "Threat Assessment", icon: ShieldCheck, to: "/threat" as const }, { label: "Command", icon: LayoutGrid, to: "/dashboard" as const }].map((step, index, all) => <span key={step.label} className="contents"><Link to={step.to} className="flex items-center gap-1.5 border border-border bg-card px-2 py-2 text-[8px] uppercase tracking-wide text-foreground hover:bg-accent"><step.icon className="size-3.5 text-primary" />{step.label}</Link>{index < all.length - 1 ? <ArrowRight className="size-3 shrink-0 text-muted-foreground" /> : null}</span>)}</div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><span className="text-[8px] uppercase tracking-widest text-muted-foreground">Simulation controls · all modules share this feed</span><div className="flex gap-2"><Button size="sm" variant={running ? "secondary" : "default"} onClick={() => setRunning(!running)}><span className="sr-only">{running ? "Pause live data" : "Resume live data"}</span>{running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{running ? "Pause" : "Resume"}</Button><Button size="sm" variant="ghost" onClick={() => void navigate({ to: "/simulation" })}>Controls <ChevronRight className="size-3" /></Button></div></div>
        </Panel>
      </div>

      {report ? <Panel title="System Status Report" icon={FileText} right={<Button variant="ghost" size="sm" onClick={() => setReport(null)}>Close</Button>}><pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[9px] leading-relaxed text-foreground">{report}</pre></Panel> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-panel-header px-3 py-2 text-[8px] uppercase tracking-[.16em] text-muted-foreground"><span>Academic prototype — decision support only</span><span>DETECT → TRACK → FUSE → ASSESS → ALERT</span></div>
    </div>
  </Shell>;
}