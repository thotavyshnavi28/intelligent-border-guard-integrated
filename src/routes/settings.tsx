import { createFileRoute } from "@tanstack/react-router";
import { RadioTower, Settings2, ShieldCheck } from "lucide-react";
import { Panel, Shell, StatusDot } from "@/components/sentinel/Shell";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useFusionSimulation } from "@/hooks/useFusionSimulation";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "System Settings — Border Sentinel" },
    { name: "description", content: "Configure shared prototype simulation mode and multi-sensor confirmation threshold." },
    { property: "og:title", content: "System Settings — Border Sentinel" },
    { property: "og:description", content: "Shared simulation and target confirmation settings for the Border Sentinel academic prototype." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { frame, running, setRunning, mode, setMode, threshold, setThreshold } = useFusionSimulation();
  return <Shell moduleTitle="System Settings" moduleSubtitle="Prototype Configuration">
    <div className="space-y-3">
      <div className="border-b border-border pb-3"><h2 className="font-display text-lg font-bold uppercase tracking-widest">System Settings</h2><p className="mt-1 text-[9px] uppercase tracking-widest text-muted-foreground">Changes apply to all modules sharing the simulated sensor feed</p></div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Simulation State" icon={RadioTower}>
          <div className="flex items-center justify-between gap-3 border border-border bg-card p-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest">Shared sensor feed</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">{frame.tracks.length} targets · all modules</p></div><span className={`flex items-center gap-2 text-[9px] uppercase ${running ? "text-online" : "text-warning"}`}><StatusDot tone={running ? "online" : "warning"} />{running ? "Running" : "Paused"}</span></div>
          <Button className="mt-3 w-full uppercase tracking-widest" variant={running ? "secondary" : "default"} onClick={() => setRunning(!running)}>{running ? "Pause shared simulation" : "Resume shared simulation"}</Button>
        </Panel>
        <Panel title="Fusion Parameters" icon={Settings2}>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Target confirmation threshold</p><p className="mt-2 font-display text-2xl font-bold">{threshold}%</p><Slider aria-label="Fusion confidence threshold" className="mt-3" min={50} max={95} step={1} value={[threshold]} onValueChange={(value) => setThreshold(value[0] ?? threshold)} />
          <div className="mt-4 border-t border-border pt-3"><p className="mb-2 text-[9px] uppercase tracking-widest text-muted-foreground">Simulation update mode</p><div className="grid grid-cols-2 gap-2">{(["auto", "manual"] as const).map((value) => <Button key={value} size="sm" variant={mode === value ? "default" : "secondary"} className="uppercase" onClick={() => setMode(value)}>{value}</Button>)}</div></div>
        </Panel>
      </div>
      <Panel title="Prototype Notice" icon={ShieldCheck}><p className="text-[10px] leading-relaxed text-muted-foreground">These settings adjust a simulated academic demonstration. The fusion threshold controls target confirmation only; it is not a threat threshold and does not initiate an operational response. Assessment classifications are intended for human review.</p></Panel>
    </div>
  </Shell>;
}