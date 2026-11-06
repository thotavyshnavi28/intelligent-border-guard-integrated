import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  ClipboardList,
  LayoutGrid,
  Radar,
  ShieldCheck,
  Video,
  Waypoints,
  RadioTower,
  Network,
  Settings,
  Lock,
  Cpu,
  Eye,
  Link2,
  Database,
  Clock,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/radar";

type NavItem = {
  label: string;
  icon: typeof Radar;
  to?: "/dashboard" | "/" | "/radar" | "/simulation" | "/fusion" | "/threat" | "/incidents" | "/settings";
};

const NAV: NavItem[] = [
  { label: "Command Dashboard", icon: LayoutGrid, to: "/dashboard" },
  { label: "CCTV AI Detection", icon: Video, to: "/" },
  { label: "Radar Tracking", icon: Radar, to: "/radar" },
  { label: "Multi-Sensor Simulation", icon: RadioTower, to: "/simulation" },
  { label: "Multi-Sensor Fusion", icon: Network, to: "/fusion" },
  { label: "Threat Assessment", icon: ShieldCheck, to: "/threat" },
  { label: "Incident History", icon: ClipboardList, to: "/incidents" },
  { label: "System Settings", icon: Settings, to: "/settings" },
];

export function StatusDot({ tone = "online" }: { tone?: "online" | "warning" | "critical" | "idle" }) {
  const color =
    tone === "online"
      ? "bg-online"
      : tone === "warning"
        ? "bg-warning"
        : tone === "critical"
          ? "bg-critical"
          : "bg-muted-foreground";
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", color)} />;
}

export function Panel({
  title,
  icon: Icon,
  right,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  icon?: typeof Radar;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("flex flex-col border border-border bg-panel", className)}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-panel-header px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="size-4 shrink-0 text-primary" /> : null}
          <h2 className="truncate font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
            {title}
          </h2>
        </div>
        {right ? <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest">{right}</div> : null}
      </header>
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function Shell({
  children,
  moduleTitle,
  moduleSubtitle,
}: {
  children: ReactNode;
  moduleTitle?: string;
  moduleSubtitle?: string;
}) {
  const now = useClock();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border bg-panel px-4 py-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-3">
          <ShieldCheck className="size-8 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold uppercase tracking-[0.18em] sm:text-2xl">
              Border Sentinel
            </h1>
            <p className="truncate text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px]">
              AI Surveillance Command System
            </p>
          </div>
        </div>
        {moduleTitle ? (
          <div className="hidden min-w-0 border-x border-border px-5 xl:block">
            <p className="truncate font-display text-lg font-semibold uppercase tracking-[0.16em] text-foreground">
              {moduleTitle}
            </p>
            {moduleSubtitle ? (
              <p className="truncate text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                {moduleSubtitle}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-4 text-[11px] uppercase tracking-widest">
          <span className="hidden items-center gap-2 text-online md:flex">
            <StatusDot /> System Online
          </span>
          <span className="hidden items-center gap-2 font-mono text-foreground lg:flex">
            <Clock className="size-4 text-muted-foreground" />
            <span>
              {now ? formatClock(now) : "--:--:--"}
              <span className="ml-2 text-muted-foreground">
                {now
                  ? now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                  : "-- --- ----"}
              </span>
            </span>
          </span>
          <span className="hidden items-center gap-2 text-muted-foreground xl:flex">
            <Lock className="size-4" /> Secure Channel
            <span className="text-online">Encrypted</span>
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <nav className="border-b border-border bg-sidebar lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
          <ul className="flex overflow-x-auto lg:flex-col lg:overflow-visible">
            {NAV.map((item) => {
              const active = item.to ? pathname === item.to : false;
              const content = (
                <span
                  className={cn(
                    "flex items-center gap-3 border-l-2 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap transition-colors",
                    active
                      ? "border-primary bg-sidebar-accent text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </span>
              );
              return (
                <li key={item.label} className="lg:border-b lg:border-sidebar-border/60">
                  {item.to ? (
                    <Link to={item.to}>{content}</Link>
                  ) : (
                    <span title="Module pending" className="block cursor-not-allowed opacity-60">
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 p-3">{children}</main>
      </div>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <Lock className="size-3.5" /> Secure Channel: <span className="text-online">Encrypted</span>
        </span>
        <span className="flex items-center gap-2">
          <Cpu className="size-3.5" /> AI Model: <span className="text-foreground">YOLOv8</span>
        </span>
        <span className="flex items-center gap-2">
          <Eye className="size-3.5" /> Vision Processing: <span className="text-online">Active</span>
        </span>
        <span className="flex items-center gap-2">
          <Link2 className="size-3.5" /> Camera Link: <span className="text-online">Stable</span>
        </span>
        <span className="flex items-center gap-2">
          <Database className="size-3.5" /> Data Stream: <span className="text-online">Secure</span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Activity className="size-3.5" /> Detect / Track / Analyze / Protect
        </span>
      </footer>
    </div>
  );
}
