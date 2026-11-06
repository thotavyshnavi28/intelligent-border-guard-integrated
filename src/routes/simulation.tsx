import { createFileRoute } from "@tanstack/react-router";
import { Activity, Pause, Play, RotateCcw } from "lucide-react";
import { Panel, Shell, StatusDot } from "@/components/sentinel/Shell";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useFusionSimulation } from "@/hooks/useFusionSimulation";
import { SENSOR_LABEL, type SensorKind } from "@/lib/fusion";
import { TYPE_LABEL } from "@/lib/radar";

export const Route = createFileRoute("/simulation")({
  head: () => ({ meta: [
    { title: "Multi-Sensor Simulation — Border Sentinel" },
    { name: "description", content: "Controls for simulated Border Sentinel multi-sensor observations and target movement." },
    { property: "og:title", content: "Multi-Sensor Simulation — Border Sentinel" },
    { property: "og:description", content: "Inspect the prototype's moving targets, sensor observations and shared simulation controls." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SimulationPage,
});

function SimulationPage() {
  const { frame, running, setRunning, mode, setMode, threshold, setThreshold, reset } = useFusionSimulation();
  const sensors: SensorKind[] = ["cctv", "radar", "thermal", "motion", "drone", "environment"];
  return <Shell moduleTitle="Multi-Sensor Simulation" moduleSubtitle="Simulated Inputs · Shared Live State">
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"><div><h2 className="font-display text-lg font-bold uppercase tracking-widest">Multi-Sensor Simulation</h2><p className="mt-1 text-[9px] uppercase tracking-widest text-muted-foreground">Prototype data source feeding fusion, threat assessment and command overview</p></div><span className={`flex items-center gap-2 text-[9px] uppercase ${running ? "text-online" : "text-warning"}`}><StatusDot tone={running ? "online" : "warning"} />{running ? "Simulation active" : "Simulation paused"}</span></div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Simulated Targets" icon={Activity} right={<span>{frame.tracks.length} TRACKED</span>}>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left font-mono text-[9px]"><thead className="text-[8px] uppercase tracking-widest text-muted-foreground"><tr className="border-b border-border"><th className="py-2">Target</th><th>Sector</th><th>Distance</th><th>Speed</th><th>Heading</th><th>Sensors</th></tr></thead><tbody>{frame.tracks.map((track) => <tr key={track.id} className="border-b border-border/60"><td className="py-2 text-foreground">{track.id} · {TYPE_LABEL[track.type]}</td><td>{track.sector}</td><td>{track.distance} m</td><td>{track.speed.toFixed(0)} km/h</td><td>{Math.round(track.heading)}°</td><td>{track.sensors.length}</td></tr>)}</tbody></table></div>
        </Panel>
        <Panel title="Simulation Controls" icon={Activity}>
          <div className="grid grid-cols-3 gap-2"><Button size="sm" onClick={() => setRunning(true)} variant={running ? "default" : "secondary"}><Play className="size-3.5" />Start</Button><Button size="sm" variant="secondary" onClick={() => setRunning(false)}><Pause className="size-3.5" />Pause</Button><Button size="sm" variant="secondary" onClick={reset}><RotateCcw className="size-3.5" />Reset</Button></div>
          <div className="mt-4"><p className="mb-2 text-[9px] uppercase tracking-widest text-muted-foreground">Operating Mode</p><div className="grid grid-cols-2 gap-2">{(["auto", "manual"] as const).map((value) => <Button key={value} size="sm" variant={mode === value ? "default" : "secondary"} className="uppercase" onClick={() => setMode(value)}>{value}</Button>)}</div></div>
          <div className="mt-4"><div className="flex justify-between gap-2 text-[9px] uppercase tracking-widest text-muted-foreground"><span>Fusion confirmation threshold</span><span className="font-mono text-foreground">{threshold}%</span></div><Slider aria-label="Fusion confirmation threshold" className="mt-3" min={50} max={95} step={1} value={[threshold]} onValueChange={(value) => setThreshold(value[0] ?? threshold)} /></div>
        </Panel>
      </div>
      <Panel title="Sensor Inputs" icon={Activity}><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{sensors.map((sensor) => { const observations = sensor === "environment" ? [] : frame.observations.filter((item) => item.sensor === sensor); return <div key={sensor} className="border border-border bg-card p-3"><p className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-widest">{SENSOR_LABEL[sensor]}<span className="text-online">● SIMULATED</span></p>{sensor === "environment" ? <p className="mt-2 font-mono text-[9px] text-muted-foreground">{frame.environment.temperature.toFixed(1)}°C · {frame.environment.humidity}% RH · Wind {frame.environment.wind} km/h · Visibility {frame.environment.visibility.toFixed(1)} km</p> : <p className="mt-2 font-mono text-[9px] text-muted-foreground">{observations.length} observations · {observations.map((item) => item.targetId).filter(Boolean).join(", ") || "No current targets"}</p>}</div>; })}</div></Panel>
      <p className="border border-border bg-panel-header px-3 py-2 text-[8px] uppercase tracking-widest text-muted-foreground">Academic simulation only · Simulated targets and sensor observations · Not operational equipment</p>
    </div>
  </Shell>;
}