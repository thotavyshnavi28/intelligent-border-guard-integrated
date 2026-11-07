import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Radar as RadarIcon,
  Crosshair,
  ListTree,
  SlidersHorizontal,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Waypoints,
} from "lucide-react";
import { Panel, Shell, StatusDot } from "@/components/sentinel/Shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRadarSimulation } from "@/hooks/useRadarSimulation";
import {
  RADAR_RANGE_M,
  TYPE_COLOR,
  TYPE_LABEL,
  compass,
  distanceOf,
  formatClock,
  geoOf,
  type TargetType,
} from "@/lib/radar";

export const Route = createFileRoute("/radar")({
  head: () => ({
    meta: [
      { title: "Radar Simulation & Target Tracking — Border Sentinel" },
      {
        name: "description",
        content:
          "Simulated radar scope with live target tracking, movement trails and sector monitoring for the Border Sentinel surveillance command system.",
      },
      { property: "og:title", content: "Radar Simulation & Target Tracking — Border Sentinel" },
      {
        property: "og:description",
        content:
          "Real-time surveillance sector monitoring: radar sweep, tracked targets, trails and simulation controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RadarPage,
});

const SCOPE = 520; // svg viewbox units
const CENTER = SCOPE / 2;
const R = CENTER - 10;

/** metres -> scope units */
function toScope(v: number) {
  return (v / RADAR_RANGE_M) * R;
}

const SENSORS: Array<{ name: string; state: string; tone: "online" | "idle"; active?: boolean }> = [
  { name: "Radar Simulation", state: "Online", tone: "online", active: true },
  { name: "CCTV AI", state: "Online", tone: "online" },
  { name: "Thermal", state: "Simulated", tone: "idle" },
  { name: "Motion Sensor", state: "Simulated", tone: "idle" },
  { name: "Drone Detection", state: "Simulated", tone: "idle" },
];

function RadarPage() {
  const {
    targets,
    settings,
    setSettings,
    running,
    handleStart,
    handlePause,
    reset,
    addTarget,
    connected,
  } = useRadarSimulation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    type: "human" as TargetType,
    distance: 500,
    bearing: 45,
    speed: 12,
    heading: 90,
  });

  const selected = useMemo(
    () => targets.find((t) => t.id === selectedId) ?? targets[0] ?? null,
    [targets, selectedId],
  );

  const stamp = targets[0]?.timestamp ? new Date(targets[0].timestamp) : null;

  return (
    <Shell>
      <div className="space-y-3">
        <div className="border border-border bg-panel px-3 py-2">
          <h1 className="font-display text-lg font-bold uppercase tracking-[0.18em] text-foreground sm:text-xl">
            Radar Simulation &amp; Target Tracking
          </h1>
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Real-Time Surveillance Sector Monitoring
          </p>
        </div>

        {/* 1. STATUS BAR */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-border bg-panel-header px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="flex items-center gap-2">
            Radar Status: <StatusDot /> <span className="text-online">Online</span>
          </span>
          <span>
            Simulation: <span className={running ? "text-online" : "text-warning"}>{running ? "Active" : "Paused"}</span>
          </span>
          <span>
            Tracking Engine:{" "}
            <span className={settings.trackingEnabled ? "text-online" : "text-warning"}>
              {settings.trackingEnabled ? "Active" : "Standby"}
            </span>
          </span>
          <span>
            Feed:{" "}
            <span className={connected ? "text-online" : "text-primary"}>
              {connected ? "Live Backend (WS)" : "Local Simulation"}
            </span>
          </span>
          <span>
            Targets: <span className="font-mono text-foreground">{String(targets.length).padStart(2, "0")}</span>
          </span>
          <span>
            Update Rate: <span className="font-mono text-foreground">1 Hz</span>
          </span>
          <span className="font-mono text-foreground">{stamp ? formatClock(stamp) : "--:--:--"}</span>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* 2. RADAR SCOPE */}
          <Panel
            title="Radar Scope — Sector Sweep"
            icon={RadarIcon}
            right={
              <span className="flex items-center gap-2 text-muted-foreground">
                Range <span className="font-mono text-foreground">{RADAR_RANGE_M} m</span>
              </span>
            }
            bodyClassName="p-3"
          >
            <div className="mx-auto w-full max-w-[560px]">
              <svg viewBox={`0 0 ${SCOPE} ${SCOPE}`} className="w-full">
                <defs>
                  <radialGradient id="scopeBg">
                    <stop offset="0%" stopColor="var(--panel-header)" />
                    <stop offset="100%" stopColor="var(--background)" />
                  </radialGradient>
                  <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--online)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--online)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <circle cx={CENTER} cy={CENTER} r={R} fill="url(#scopeBg)" stroke="var(--border)" />

                {/* grid */}
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <circle
                    key={f}
                    cx={CENTER}
                    cy={CENTER}
                    r={R * f}
                    fill="none"
                    stroke="var(--border)"
                    strokeOpacity="0.7"
                  />
                ))}
                {[0, 45, 90, 135].map((a) => {
                  const rad = (a * Math.PI) / 180;
                  return (
                    <line
                      key={a}
                      x1={CENTER - Math.cos(rad) * R}
                      y1={CENTER - Math.sin(rad) * R}
                      x2={CENTER + Math.cos(rad) * R}
                      y2={CENTER + Math.sin(rad) * R}
                      stroke="var(--border)"
                      strokeOpacity={a % 90 === 0 ? "1" : "0.45"}
                    />
                  );
                })}

                {/* distance markers */}
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <text
                    key={f}
                    x={CENTER + 4}
                    y={CENTER - R * f + 12}
                    fontSize="10"
                    fill="var(--muted-foreground)"
                    fontFamily="var(--font-mono)"
                  >
                    {Math.round(RADAR_RANGE_M * f)}m
                  </text>
                ))}

                {/* sector labels */}
                {[
                  { l: "SECTOR A", x: CENTER - R * 0.55, y: CENTER - R * 0.6 },
                  { l: "SECTOR B", x: CENTER + R * 0.3, y: CENTER - R * 0.6 },
                  { l: "SECTOR C", x: CENTER + R * 0.3, y: CENTER + R * 0.66 },
                  { l: "SECTOR D", x: CENTER - R * 0.55, y: CENTER + R * 0.66 },
                ].map((s) => (
                  <text
                    key={s.l}
                    x={s.x}
                    y={s.y}
                    fontSize="10"
                    letterSpacing="2"
                    fill="var(--muted-foreground)"
                    fontFamily="var(--font-display)"
                  >
                    {s.l}
                  </text>
                ))}

                {/* sweep */}
                {running ? (
                  <g className="radar-sweep" style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}>
                    <path
                      d={`M ${CENTER} ${CENTER} L ${CENTER + R} ${CENTER} A ${R} ${R} 0 0 0 ${
                        CENTER + R * Math.cos(-0.6)
                      } ${CENTER + R * Math.sin(-0.6)} Z`}
                      fill="url(#sweep)"
                    />
                    <line
                      x1={CENTER}
                      y1={CENTER}
                      x2={CENTER + R}
                      y2={CENTER}
                      stroke="var(--online)"
                      strokeOpacity="0.8"
                    />
                  </g>
                ) : null}

                {/* targets + trails */}
                {targets.map((t) => {
                  const color = TYPE_COLOR[t.type];
                  const px = CENTER + toScope(t.x);
                  const py = CENTER - toScope(t.y);
                  const isSel = selected?.id === t.id;
                  return (
                    <g key={t.id} onClick={() => setSelectedId(t.id)} className="cursor-pointer">
                      {t.trail.map((p, i) => (
                        <circle
                          key={i}
                          cx={CENTER + toScope(p.x)}
                          cy={CENTER - toScope(p.y)}
                          r={1.6}
                          fill={color}
                          opacity={((i + 1) / t.trail.length) * 0.55}
                        />
                      ))}
                      {t.trail.length > 1 ? (
                        <polyline
                          points={t.trail
                            .map((p) => `${CENTER + toScope(p.x)},${CENTER - toScope(p.y)}`)
                            .join(" ")}
                          fill="none"
                          stroke={color}
                          strokeOpacity="0.35"
                        />
                      ) : null}
                      {isSel ? (
                        <circle cx={px} cy={py} r={11} fill="none" stroke={color} strokeOpacity="0.8" />
                      ) : null}
                      <circle cx={px} cy={py} r={5} fill={color} className="blip-pulse" />
                      <text
                        x={px + 9}
                        y={py - 7}
                        fontSize="9"
                        fill="var(--foreground)"
                        fontFamily="var(--font-mono)"
                      >
                        {t.id}
                      </text>
                    </g>
                  );
                })}

                <circle cx={CENTER} cy={CENTER} r={3} fill="var(--primary)" />
              </svg>

              {/* legend */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {(Object.keys(TYPE_LABEL) as TargetType[]).map((k) => (
                  <span key={k} className="flex items-center gap-2">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: TYPE_COLOR[k] }}
                    />
                    {TYPE_LABEL[k]}
                  </span>
                ))}
              </div>
            </div>
          </Panel>

          <div className="space-y-3">
            {/* 4. SELECTED TARGET */}
            <Panel title={selected ? `Target ${selected.id}` : "No Target Selected"} icon={Crosshair}>
              {selected ? (
                <div className="space-y-3">
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                    {[
                      ["Object Type", TYPE_LABEL[selected.type]],
                      ["Distance", `${distanceOf(selected)} m`],
                      ["Speed", `${selected.speed.toFixed(1)} km/h`],
                      ["Direction", compass(selected.heading)],
                      ["Sector", selected.sector],
                      ["Latitude", geoOf(selected).lat],
                      ["Longitude", geoOf(selected).lon],
                      ["Tracking", selected.status],
                    ].map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="uppercase tracking-[0.16em] text-muted-foreground">{k}</dt>
                        <dd className="truncate font-mono text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div>
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      <span>Track Confidence</span>
                      <span className="font-mono text-foreground">{selected.confidence}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-secondary">
                      <div
                        className="h-full bg-online transition-all"
                        style={{ width: `${selected.confidence}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Select a target on the scope.
                </p>
              )}
            </Panel>

            {/* 8. SENSOR INPUTS */}
            <Panel title="Surveillance Inputs" icon={Waypoints} bodyClassName="p-0">
              <ul className="divide-y divide-border">
                {SENSORS.map((s) => (
                  <li
                    key={s.name}
                    className={`flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.14em] ${
                      s.active ? "bg-sidebar-accent/60 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {s.name}
                      {s.active ? <span className="text-[9px] text-primary">[ACTIVE MODULE]</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusDot tone={s.tone} />
                      <span className={s.tone === "online" ? "text-online" : ""}>{s.state}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* 5. TARGET LIST */}
          <Panel title="Tracked Targets" icon={ListTree} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[11px]">
                <thead className="bg-panel-header text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    {["Target ID", "Type", "Distance", "Speed", "Direction", "Sector", "Status"].map(
                      (h) => (
                        <th key={h} className="px-3 py-2 font-semibold">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {targets.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={`cursor-pointer transition-colors hover:bg-sidebar-accent/50 ${
                        selected?.id === t.id ? "bg-sidebar-accent/70" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-foreground">{t.id}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-2 rounded-full"
                            style={{ background: TYPE_COLOR[t.type] }}
                          />
                          {TYPE_LABEL[t.type]}
                        </span>
                      </td>
                      <td className="px-3 py-2">{distanceOf(t)} m</td>
                      <td className="px-3 py-2">{t.speed.toFixed(1)} km/h</td>
                      <td className="px-3 py-2">{compass(t.heading)}</td>
                      <td className="px-3 py-2">{t.sector}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 uppercase">
                          <StatusDot tone={t.status === "TRACKING" ? "online" : "warning"} />
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Simulated track data — backend radar feed replaces this stream without UI changes.
            </p>
          </Panel>

          {/* 6. CONTROLS */}
          <div className="space-y-3">
            <Panel title="Radar Simulation" icon={SlidersHorizontal}>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" variant={running ? "secondary" : "default"} onClick={handleStart}>
                    <Play className="size-3.5" /> Start
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handlePause}>
                    <Pause className="size-3.5" /> Pause
                  </Button>
                  <Button size="sm" variant="secondary" onClick={reset}>
                    <RotateCcw className="size-3.5" /> Reset
                  </Button>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span>Number of Targets</span>
                    <span className="font-mono text-foreground">{settings.targetCount}</span>
                  </div>
                  <Slider
                    className="mt-2"
                    min={1}
                    max={12}
                    step={1}
                    value={[settings.targetCount]}
                    onValueChange={(v) => setSettings((s) => ({ ...s, targetCount: v[0] ?? s.targetCount }))}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span>Simulation Speed</span>
                    <span className="font-mono text-foreground">{settings.simSpeed.toFixed(1)}x</span>
                  </div>
                  <Slider
                    className="mt-2"
                    min={0.5}
                    max={4}
                    step={0.5}
                    value={[settings.simSpeed]}
                    onValueChange={(v) => setSettings((s) => ({ ...s, simSpeed: v[0] ?? s.simSpeed }))}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span>Detection Noise</span>
                    <span className="font-mono text-foreground">{Math.round(settings.noise * 100)}%</span>
                  </div>
                  <Slider
                    className="mt-2"
                    min={0}
                    max={1}
                    step={0.05}
                    value={[settings.noise]}
                    onValueChange={(v) => setSettings((s) => ({ ...s, noise: v[0] ?? s.noise }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Tracking Enabled
                  </Label>
                  <Switch
                    checked={settings.trackingEnabled}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, trackingEnabled: v }))}
                  />
                </div>
              </div>
            </Panel>

            <Panel title="Add Target" icon={Plus}>
              <div className="space-y-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <div>
                  <Label className="text-[10px] uppercase tracking-[0.16em]">Target Type</Label>
                  <Select
                    value={draft.type}
                    onValueChange={(v) => setDraft((d) => ({ ...d, type: v as TargetType }))}
                  >
                    <SelectTrigger className="mt-1 h-8 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_LABEL) as TargetType[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {TYPE_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["distance", "Distance (m)"],
                    ["bearing", "Bearing (°)"],
                    ["speed", "Speed (km/h)"],
                    ["heading", "Heading (°)"],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <Label className="text-[10px] uppercase tracking-[0.16em]">{label}</Label>
                      <Input
                        type="number"
                        className="mt-1 h-8 font-mono text-[11px]"
                        value={draft[key]}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    const id = await addTarget(draft);
                    if (id) setSelectedId(id);
                  }}
                >
                  <Plus className="size-3.5" /> Deploy Demo Target
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </Shell>
  );
}
