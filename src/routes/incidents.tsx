import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  Bird,
  Camera,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3 as ClockIcon,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Footprints,
  MapPin,
  Radio,
  Search,
  ShieldCheck,
  Thermometer,
  UserRound,
  X,
} from "lucide-react";
import { Panel, Shell } from "@/components/sentinel/Shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SENSOR_LABEL, SENSOR_SHORT, type SensorKind } from "@/lib/fusion";
import { readIncidentRecords, subscribeIncidentRecords, updateIncident } from "@/lib/incidents";
import { TYPE_LABEL, type TargetType } from "@/lib/radar";
import type { IncidentRecord, IncidentStatus, ThreatLevel } from "@/lib/threat";

export const Route = createFileRoute("/incidents")({
  head: () => ({ meta: [
    { title: "Incident History & Reporting — Border Sentinel" },
    { name: "description", content: "Search, review, and report stored surveillance simulation incidents for human review." },
    { property: "og:title", content: "Incident History & Reporting — Border Sentinel" },
    { property: "og:description", content: "Historical records and review tools for the Border Sentinel academic prototype." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: IncidentHistory,
});

type Filters = { query: string; from: string; to: string; level: string; type: string; sector: string; status: string };
const EMPTY_FILTERS: Filters = { query: "", from: "", to: "", level: "ALL", type: "ALL", sector: "ALL", status: "ALL" };
const LEVELS: ThreatLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUSES: IncidentStatus[] = ["NEW", "UNDER REVIEW", "CONFIRMED", "RESOLVED"];
const SENSOR_ICONS: Record<SensorKind, typeof Camera> = {
  cctv: Camera,
  radar: Radio,
  thermal: Thermometer,
  motion: Footprints,
  drone: Bird,
  environment: BarChart3,
};
const TYPE_ICONS: Record<TargetType, typeof UserRound> = {
  human: UserRound,
  animal: Bird,
  vehicle: Car,
  drone: Radio,
};

function stamp(value: number) {
  return Number.isFinite(value) ? new Date(value).toLocaleString("en-GB", { hour12: false }) : "Unknown time";
}

function clock(value: number) {
  return Number.isFinite(value) ? new Date(value).toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--";
}

function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCsv(records: IncidentRecord[], filename: string) {
  const columns: Array<[string, (record: IncidentRecord) => unknown]> = [
    ["Incident ID", (record) => record.id],
    ["Time", (record) => new Date(record.timestamp).toISOString()],
    ["Target", (record) => record.targetId],
    ["Type", (record) => TYPE_LABEL[record.type]],
    ["Sector", (record) => record.sector],
    ["Threat level", (record) => record.level],
    ["Risk score", (record) => record.score],
    ["Source", (record) => record.sensors.map((sensor) => SENSOR_SHORT[sensor]).join(" + ")],
    ["Status", (record) => record.status ?? "NEW"],
    ["Recommendation", (record) => record.recommendation],
    ["Risk factors", (record) => record.factors.join("; ")],
    ["Review notes", (record) => record.reviewNotes ?? ""],
  ];
  const content = [columns.map(([name]) => csvCell(name)).join(","), ...records.map((record) => columns.map(([, value]) => csvCell(value(record))).join(","))].join("\n");
  downloadFile(filename, content, "text/csv;charset=utf-8");
}

function IncidentHistory() {
  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<"timestamp" | "level" | "id" | "sector" | "status">("timestamp");
  const [ascending, setAscending] = useState(false);
  const [statusDraft, setStatusDraft] = useState<IncidentStatus>("NEW");
  const [notesDraft, setNotesDraft] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const refresh = () => setRecords(readIncidentRecords());
    refresh();
    return subscribeIncidentRecords(refresh);
  }, []);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const from = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    const result = records.filter((record) => {
      const searchable = [record.id, record.targetId, TYPE_LABEL[record.type], record.sector, record.position, record.factors.join(" "), record.recommendation].join(" ").toLowerCase();
      return (!query || searchable.includes(query))
        && record.timestamp >= from && record.timestamp <= to
        && (filters.level === "ALL" || record.level === filters.level)
        && (filters.type === "ALL" || record.type === filters.type)
        && (filters.sector === "ALL" || record.sector === filters.sector)
        && (filters.status === "ALL" || (record.status ?? "NEW") === filters.status);
    });
    const levelOrder: Record<ThreatLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...result].sort((left, right) => {
      let compared = 0;
      if (sortKey === "timestamp") compared = left.timestamp - right.timestamp;
      if (sortKey === "id") compared = left.id.localeCompare(right.id, undefined, { numeric: true });
      if (sortKey === "sector") compared = left.sector.localeCompare(right.sector);
      if (sortKey === "status") compared = (left.status ?? "NEW").localeCompare(right.status ?? "NEW");
      if (sortKey === "level") compared = levelOrder[left.level] - levelOrder[right.level];
      return compared * (ascending ? 1 : -1);
    });
  }, [records, filters, sortKey, ascending]);

  useEffect(() => setPage(1), [filters, sortKey, ascending, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRecords = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = records.find((record) => record.id === selectedId) ?? null;
  const counts = useMemo(() => ({
    critical: records.filter((record) => record.level === "HIGH" || record.level === "CRITICAL").length,
    resolved: records.filter((record) => (record.status ?? "NEW") === "RESOLVED").length,
    pending: records.filter((record) => (record.status ?? "NEW") === "NEW" || (record.status ?? "NEW") === "UNDER REVIEW").length,
  }), [records]);
  const levelCounts = useMemo(() => Object.fromEntries(LEVELS.map((level) => [level, records.filter((record) => record.level === level).length])) as Record<ThreatLevel, number>, [records]);
  const typeCounts = useMemo(() => Object.fromEntries((Object.keys(TYPE_LABEL) as TargetType[]).map((type) => [type, records.filter((record) => record.type === type).length])) as Record<TargetType, number>, [records]);
  const sectorCounts = useMemo(() => Object.fromEntries(["A", "B", "C", "D", "E"].map((sector) => [sector, records.filter((record) => record.sector === sector).length])) as Record<string, number>, [records]);
  const maxLevel = Math.max(1, ...LEVELS.map((level) => levelCounts[level]));
  const maxType = Math.max(1, ...Object.values(typeCounts));
  const maxSector = Math.max(1, ...Object.values(sectorCounts));
  const dailyCounts = useMemo(() => {
    const byDay = new Map<string, number>();
    records.forEach((record) => {
      const day = new Date(record.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    });
    return [...byDay.entries()].slice(0, 7).reverse();
  }, [records]);
  const maxDaily = Math.max(1, ...dailyCounts.map(([, count]) => count));

  useEffect(() => {
    if (!selected) return;
    setStatusDraft(selected.status ?? "NEW");
    setNotesDraft(selected.reviewNotes ?? "");
  }, [selected?.id, selected?.status, selected?.reviewNotes]);

  function changeSort(key: typeof sortKey) {
    if (key === sortKey) setAscending((value) => !value);
    else { setSortKey(key); setAscending(key !== "timestamp"); }
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function exportJson(selection: IncidentRecord[]) {
    downloadFile(`border-sentinel-incidents-${Date.now()}.json`, JSON.stringify({ classification: "Academic Prototype — Decision Support Only", records: selection }, null, 2), "application/json");
  }

  function reportText(record: IncidentRecord) {
    return [
      "BORDER SENTINEL | INCIDENT REVIEW REPORT",
      "Academic Prototype — Decision Support Only",
      "",
      `Incident ID: ${record.id}`,
      `Target: ${record.targetId} · ${TYPE_LABEL[record.type]}`,
      `Detection time: ${stamp(record.timestamp)}`,
      `Location: Sector ${record.sector} · ${record.position}`,
      `Distance / speed / direction: ${record.distance ?? "—"} m / ${record.speed?.toFixed(0) ?? "—"} km/h / ${record.direction ?? "—"}`,
      `Sensor sources: ${record.sensors.map((sensor) => SENSOR_LABEL[sensor]).join(", ") || "Not available"}`,
      `Fusion confidence: ${record.fusionConfidence === undefined ? "Not available" : `${record.fusionConfidence}%`}`,
      `Risk score: ${record.score}/100`,
      `Threat level: ${record.level}`,
      `Risk factors: ${record.factors.join("; ") || "Not available"}`,
      `Recommendation: ${record.recommendation}`,
      `Incident status: ${record.status ?? "NEW"}`,
      `Review notes: ${record.reviewNotes || "No human review notes recorded."}`,
      "",
      "INCIDENT TIMELINE",
      ...(record.timeline ?? []).slice().sort((left, right) => left.timestamp - right.timestamp).map((item) => `${clock(item.timestamp)}  ${item.event}`),
      "",
      "This report contains simulated/project-generated data and is not an operational security record.",
    ].join("\n");
  }

  function exportReport() {
    const content = selected
      ? reportText(selected)
      : [
          "BORDER SENTINEL | INCIDENT HISTORY REPORT",
          "Academic Prototype — Decision Support Only",
          `Generated: ${stamp(Date.now())}`,
          `Records included: ${filtered.length}`,
          "",
          ...filtered.map((record) => reportText(record)),
        ].join("\n\n----------------------------------------\n\n");
    downloadFile(`border-sentinel-incident-report-${Date.now()}.txt`, content, "text/plain;charset=utf-8");
  }

  function saveReview() {
    if (!selected) return;
    updateIncident(selected.id, { status: statusDraft, reviewNotes: notesDraft });
    setNotice(`${selected.id} review saved`);
  }

  return (
    <Shell moduleTitle="Incident History" moduleSubtitle="Review • Analyze • Report • Export">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
          <div>
            <h2 className="font-display text-lg font-bold uppercase tracking-widest">Incident History</h2>
            <p className="mt-1 text-[9px] uppercase tracking-widest text-muted-foreground">Historical event review / academic prototype records</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary"><Link to="/dashboard"><Eye className="size-3.5" />View dashboard</Link></Button>
            <Button size="sm" variant="secondary" onClick={() => exportJson(filtered)} disabled={!filtered.length}><Download className="size-3.5" />Export filtered data</Button>
            <Button size="sm" variant="secondary" onClick={() => exportCsv(filtered, `border-sentinel-incidents-${Date.now()}.csv`)} disabled={!filtered.length}><Download className="size-3.5" />Export CSV</Button>
            <Button size="sm" variant="secondary" onClick={exportReport} disabled={!filtered.length}><FileText className="size-3.5" />Generate report</Button>
          </div>
        </div>

        <section aria-label="Incident summary" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <SummaryCard label="Total incidents" value={records.length} detail="Stored review records" icon={ClipboardList} />
          <SummaryCard label="High / critical" value={counts.critical} detail="Requires human review" icon={AlertTriangle} tone="critical" />
          <SummaryCard label="Resolved" value={counts.resolved} detail="Closed records" icon={ShieldCheck} tone="online" />
          <SummaryCard label="Pending review" value={counts.pending} detail="New or under review" icon={Eye} tone="warning" />
        </section>

        <Panel title="Incident Search" icon={Search} right={<span>{filtered.length} matching</span>}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-[8px] uppercase tracking-widest text-muted-foreground sm:col-span-2">Search records
              <div className="mt-1 flex h-8 items-center gap-2 border border-input bg-background px-2"><Search className="size-3.5 shrink-0" /><input aria-label="Search incidents" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="ID, target, type, sector, description" className="min-w-0 flex-1 bg-transparent text-[10px] text-foreground outline-none placeholder:text-muted-foreground" /></div>
            </label>
            <FilterSelect label="Threat level" value={filters.level} onChange={(value) => setFilters({ ...filters, level: value })} options={[["ALL", "All levels"], ...LEVELS.map((level) => [level, level] as [string, string])]} />
            <FilterSelect label="Object type" value={filters.type} onChange={(value) => setFilters({ ...filters, type: value })} options={[["ALL", "All types"], ...Object.entries(TYPE_LABEL).map(([key, label]) => [key, label] as [string, string]), ["other", "Other"]]} />
            <FilterSelect label="Sector" value={filters.sector} onChange={(value) => setFilters({ ...filters, sector: value })} options={[["ALL", "All sectors"], ...["A", "B", "C", "D", "E"].map((sector) => [sector, `Sector ${sector}`] as [string, string])]} />
            <FilterSelect label="Incident status" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={[["ALL", "All statuses"], ...STATUSES.map((status) => [status, status] as [string, string])]} />
            <label className="text-[8px] uppercase tracking-widest text-muted-foreground">From<input aria-label="Date from" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="mt-1 block h-8 w-full border border-input bg-background px-2 text-[10px] text-foreground" /></label>
            <label className="text-[8px] uppercase tracking-widest text-muted-foreground">To<input aria-label="Date to" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="mt-1 block h-8 w-full border border-input bg-background px-2 text-[10px] text-foreground" /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <p className="text-[8px] uppercase tracking-widest text-muted-foreground">Filters update as criteria change</p>
            <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={resetFilters}>Reset filters</Button><Button size="sm" onClick={() => setPage(1)}><Search className="size-3.5" />Search</Button></div>
          </div>
        </Panel>

        <Panel title="Incident Records" icon={ClipboardList} right={<div className="flex items-center gap-2"><span>Rows</span><select aria-label="Rows per page" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-7 border border-border bg-background px-1 text-[9px] text-foreground"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></div>} bodyClassName="p-0">
          {visibleRecords.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left font-mono text-[9px]"><thead className="bg-panel-header text-[8px] uppercase tracking-widest text-muted-foreground"><tr>
            <SortableHead label="Incident ID" active={sortKey === "id"} ascending={ascending} onClick={() => changeSort("id")} />
            <SortableHead label="Time" active={sortKey === "timestamp"} ascending={ascending} onClick={() => changeSort("timestamp")} />
            <th className="px-2 py-2">Target</th><th className="px-2 py-2">Type</th>
            <SortableHead label="Sector" active={sortKey === "sector"} ascending={ascending} onClick={() => changeSort("sector")} />
            <SortableHead label="Threat" active={sortKey === "level"} ascending={ascending} onClick={() => changeSort("level")} />
            <th className="px-2 py-2">Source</th>
            <SortableHead label="Status" active={sortKey === "status"} ascending={ascending} onClick={() => changeSort("status")} />
            <th className="px-2 py-2">Action</th>
          </tr></thead><tbody>{visibleRecords.map((record) => {
            const TypeIcon = TYPE_ICONS[record.type];
            return <tr key={record.id} className="border-t border-border/70 hover:bg-accent/30">
              <td className="px-2 py-2 text-foreground">{record.id}</td><td className="px-2 py-2 text-muted-foreground">{clock(record.timestamp)}</td><td className="px-2 py-2">{record.targetId}</td>
              <td className="px-2 py-2"><span className="flex items-center gap-1.5"><TypeIcon className="size-3.5 text-primary" />{TYPE_LABEL[record.type]}</span></td>
              <td className="px-2 py-2">{record.sector}</td><td className="px-2 py-2"><LevelBadge level={record.level} /></td>
              <td className="px-2 py-2">{record.sensors.map((sensor) => SENSOR_SHORT[sensor]).join(" + ") || "—"}</td>
              <td className="px-2 py-2"><StatusBadge status={record.status ?? "NEW"} /></td>
              <td className="px-2 py-2"><Button size="sm" variant="ghost" className="h-6 px-2 text-[8px]" onClick={() => setSelectedId(record.id)}><Eye className="size-3" />View</Button></td>
            </tr>;
          })}</tbody></table></div> : <div className="grid min-h-36 place-content-center justify-items-center p-5 text-center"><FileText className="size-7 text-muted-foreground" /><p className="mt-2 text-[10px] font-semibold uppercase tracking-widest">{records.length ? "No matching records" : "No incidents recorded"}</p><p className="mt-1 max-w-md text-[9px] text-muted-foreground">{records.length ? "Adjust the filters to broaden your search." : "High or critical prototype assessments can be sent to Incident History from Threat Assessment. No sample records have been invented."}</p>{!records.length && <Button asChild size="sm" variant="secondary" className="mt-3"><Link to="/threat" search={{ target: undefined }}>Open threat assessment</Link></Button>}</div>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 font-mono text-[9px] text-muted-foreground"><span>{filtered.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}` : "0 records"}</span><div className="flex items-center gap-1"><Button size="icon" variant="ghost" className="size-7" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="size-4" /></Button>{Array.from({ length: Math.min(pageCount, 5) }, (_, index) => <Button key={index} size="sm" variant={page === index + 1 ? "secondary" : "ghost"} className="h-7 min-w-7 px-2" onClick={() => setPage(index + 1)}>{index + 1}</Button>)}<Button size="icon" variant="ghost" className="size-7" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight className="size-4" /></Button></div></div>
        </Panel>

        {selected ? <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          <Panel title="Incident Details" icon={Eye} right={<div className="flex items-center gap-2"><span className="font-mono">{selected.id}</span><Button size="icon" variant="ghost" className="size-6" aria-label="Close incident details" onClick={() => setSelectedId(null)}><X className="size-3" /></Button></div>}>
            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><DetailField label="Target / type" value={`${selected.targetId} · ${TYPE_LABEL[selected.type]}`} /><DetailField label="Threat level / score" value={<><LevelBadge level={selected.level} /> <span className="ml-1">{selected.score}/100</span></>} /><DetailField label="Status" value={<StatusBadge status={selected.status ?? "NEW"} />} /><DetailField label="Sector / distance" value={`Sector ${selected.sector} · ${selected.distance ?? "—"} m`} /><DetailField label="Speed / direction" value={`${selected.speed?.toFixed(0) ?? "—"} km/h · ${selected.direction ?? "—"}`} /><DetailField label="Detection time" value={stamp(selected.timestamp)} /><DetailField label="Latitude / longitude" value={selected.latitude && selected.longitude ? `${selected.latitude}°, ${selected.longitude}°` : selected.position} /><DetailField label="Fusion confidence" value={selected.fusionConfidence === undefined ? "Not recorded" : `${selected.fusionConfidence}%`} /></div>
                <section className="border-t border-border pt-3"><h3 className="font-display text-[10px] font-semibold uppercase tracking-widest">Sensor evidence</h3><div className="mt-2 flex flex-wrap gap-2">{selected.sensors.length ? selected.sensors.map((sensor) => { const Icon = SENSOR_ICONS[sensor]; return <span key={sensor} className="flex items-center gap-1.5 border border-border px-2 py-1 text-[9px] text-online"><Check className="size-3" /><Icon className="size-3" />{SENSOR_LABEL[sensor]}</span>; }) : <span className="text-[9px] text-muted-foreground">No sensor sources recorded</span>}</div><div className="mt-3 flex items-center gap-3"><span className="text-[8px] uppercase tracking-widest text-muted-foreground">Fusion confidence</span><Progress value={selected.fusionConfidence ?? 0} className="max-w-40" /><span className="font-mono text-[9px]">{selected.fusionConfidence ?? "—"}%</span></div></section>
                <section className="border-t border-border pt-3"><h3 className="font-display text-[10px] font-semibold uppercase tracking-widest">Threat assessment record</h3><p className="mt-1 text-[9px] text-muted-foreground">Original Feature 5 assessment · displayed as stored, not recalculated.</p>{selected.breakdown ? <div className="mt-2 grid grid-cols-2 gap-1.5">{Object.entries(selected.breakdown).map(([name, value]) => <div key={name} className="flex justify-between border border-border px-2 py-1 text-[8px] uppercase"><span className="text-muted-foreground">{name.replace(/([A-Z])/g, " $1")}</span><span className="font-mono text-foreground">{value}/100</span></div>)}</div> : null}<div className="mt-2 flex flex-wrap gap-1.5">{selected.factors.map((factor) => <span key={factor} className="border border-border px-2 py-1 text-[8px] uppercase text-foreground">{factor}</span>)}</div><p className="mt-2 text-[10px] text-foreground"><span className="text-muted-foreground">Recommendation · </span>{selected.recommendation}</p></section>
                <section className="border-t border-border pt-3"><h3 className="font-display text-[10px] font-semibold uppercase tracking-widest">Review & notes</h3><div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-[8px] uppercase tracking-widest text-muted-foreground">Incident status<select aria-label="Update incident status" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as IncidentStatus)} className="mt-1 block h-8 w-full border border-input bg-background px-2 text-[10px] text-foreground">{STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><Button className="self-end" size="sm" onClick={saveReview}>Update status & save notes</Button></div><label className="mt-2 block text-[8px] uppercase tracking-widest text-muted-foreground">Review notes<textarea aria-label="Review notes" value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Add human review notes…" className="mt-1 min-h-16 w-full border border-input bg-background px-2 py-2 text-[10px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" /></label></section>
              </div>
              <div className="space-y-3">
                <IncidentMap record={selected} />
                <Panel title="Incident Timeline" icon={ClipboardList} bodyClassName="max-h-64 space-y-0 overflow-y-auto">
                  {(selected.timeline ?? []).slice().sort((left, right) => left.timestamp - right.timestamp).map((event, index) => <div key={`${event.timestamp}-${index}`} className="flex gap-2 border-l border-primary/50 pb-3 pl-3 last:border-0"><span className="font-mono text-[9px] text-primary">{clock(event.timestamp)}</span><span className="text-[9px] text-foreground">{event.event}</span></div>)}
                  {!(selected.timeline?.length) && <p className="text-[9px] text-muted-foreground">Detailed source event times were not recorded. Incident creation time is shown above.</p>}
                </Panel>
                <Panel title="Evidence" icon={FileText}>
                  <span className="inline-flex border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-primary">Simulation data</span>
                  <ul className="mt-2 space-y-1 text-[9px] text-foreground">{selected.sensors.map((sensor) => <li key={sensor} className="flex items-center gap-2"><Check className="size-3 text-online" />{SENSOR_LABEL[sensor]} observation reference · {selected.targetId}</li>)}<li className="flex items-center gap-2"><ShieldCheck className="size-3 text-primary" />Stored threat assessment · {selected.score}/100</li></ul>
                  <p className="mt-2 text-[8px] text-muted-foreground">No real image, video, or surveillance file is attached to this prototype record.</p>
                </Panel>
                <Button className="w-full" variant="secondary" onClick={() => downloadFile(`${selected.id}-report.txt`, reportText(selected), "text/plain;charset=utf-8")}><FileText className="size-3.5" />Generate incident report</Button>
                <div className="flex gap-2"><Button className="flex-1" variant="secondary" onClick={() => exportJson([selected])}><Download className="size-3.5" />Export JSON</Button><Button className="flex-1" variant="secondary" onClick={() => exportCsv([selected], `${selected.id}.csv`)}><Download className="size-3.5" />Export CSV</Button></div>
              </div>
            </div>
          </Panel>
          <div className="space-y-3">
            <Panel title="Incident Statistics" icon={BarChart3}>
              <ChartBars title="By threat level" entries={LEVELS.map((level) => ({ label: level, value: levelCounts[level], tone: level === "HIGH" || level === "CRITICAL" ? "critical" : level === "MEDIUM" ? "warning" : "online" }))} max={maxLevel} />
              <ChartBars title="By object type" entries={(Object.keys(TYPE_LABEL) as TargetType[]).map((type) => ({ label: TYPE_LABEL[type], value: typeCounts[type], tone: "primary" }))} max={maxType} />
              <ChartBars title="By sector" entries={Object.entries(sectorCounts).map(([sector, value]) => ({ label: `Sector ${sector}`, value, tone: "primary" }))} max={maxSector} />
              <ChartBars title="Incidents over time" entries={dailyCounts.map(([label, value]) => ({ label, value, tone: "primary" }))} max={maxDaily} />
            </Panel>
            <Panel title="Recent Incidents" icon={ClockIcon} right={<span>{Math.min(10, records.length)} latest</span>}>
              {records.length ? <div className="space-y-2">{records.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).map((record) => <button type="button" key={record.id} onClick={() => setSelectedId(record.id)} className="flex w-full items-center justify-between gap-2 border-b border-border/70 pb-2 text-left last:border-0"><span><span className="block font-mono text-[9px] text-foreground">{clock(record.timestamp)} · {record.id} · {record.targetId}</span><span className="mt-1 block text-[8px] text-muted-foreground">Sector {record.sector} · {TYPE_LABEL[record.type]}</span></span><span className="flex flex-col items-end gap-1"><LevelBadge level={record.level} /><StatusBadge status={record.status ?? "NEW"} /></span></button>)}</div> : <p className="text-[9px] text-muted-foreground">No stored records.</p>}
              <Button asChild size="sm" variant="ghost" className="mt-2 w-full"><Link to="/dashboard">View dashboard</Link></Button>
            </Panel>
          </div>
        </div> : <div className="grid gap-3 xl:grid-cols-2"><Panel title="Incident Statistics" icon={BarChart3}><ChartBars title="By threat level" entries={LEVELS.map((level) => ({ label: level, value: levelCounts[level], tone: level === "HIGH" || level === "CRITICAL" ? "critical" : level === "MEDIUM" ? "warning" : "online" }))} max={maxLevel} /><ChartBars title="By object type" entries={(Object.keys(TYPE_LABEL) as TargetType[]).map((type) => ({ label: TYPE_LABEL[type], value: typeCounts[type], tone: "primary" }))} max={maxType} /><ChartBars title="By sector" entries={Object.entries(sectorCounts).map(([sector, value]) => ({ label: `Sector ${sector}`, value, tone: "primary" }))} max={maxSector} /><ChartBars title="Incidents over time" entries={dailyCounts.map(([label, value]) => ({ label, value, tone: "primary" }))} max={maxDaily} /></Panel><Panel title="Recent Incidents" icon={ClipboardList}>{records.length ? records.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).map((record) => <button type="button" key={record.id} onClick={() => setSelectedId(record.id)} className="flex w-full justify-between border-b border-border py-2 text-left font-mono text-[9px]"><span>{clock(record.timestamp)} · {record.id} · {record.targetId}</span><LevelBadge level={record.level} /></button>) : <p className="text-[9px] text-muted-foreground">No stored records.</p>}</Panel></div>}

        {notice && <p role="status" className="border border-primary/40 bg-primary/10 px-3 py-2 text-[9px] text-primary">{notice}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-panel-header px-3 py-2 text-[8px] uppercase tracking-widest text-muted-foreground"><span>BORDER SENTINEL | AI SURVEILLANCE COMMAND SYSTEM</span><span>DETECT / TRACK / ANALYZE / PROTECT</span><span>Academic Prototype — Decision Support Only</span></div>
      </div>
    </Shell>
  );
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "primary" }: { label: string; value: number; detail: string; icon: typeof ClipboardList; tone?: "primary" | "online" | "warning" | "critical" }) {
  const color = tone === "critical" ? "text-critical" : tone === "warning" ? "text-warning" : tone === "online" ? "text-online" : "text-primary";
  return <div className="border border-border bg-panel px-3 py-2"><div className="flex items-center justify-between gap-2"><p className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p><Icon className={`size-4 ${color}`} /></div><p className={`mt-1 font-mono text-2xl font-semibold ${color}`}>{String(value).padStart(2, "0")}</p><p className="mt-1 text-[8px] text-muted-foreground">{detail}</p></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="text-[8px] uppercase tracking-widest text-muted-foreground">{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-8 w-full border border-input bg-background px-2 text-[10px] text-foreground">{options.map(([option, name]) => <option key={option} value={option}>{name}</option>)}</select></label>;
}

function SortableHead({ label, active, ascending, onClick }: { label: string; active: boolean; ascending: boolean; onClick: () => void }) {
  return <th className="px-2 py-2"><button type="button" onClick={onClick} className={`inline-flex items-center gap-1 ${active ? "text-primary" : ""}`}>{label}<ArrowDownUp className={`size-3 ${active ? "opacity-100" : "opacity-50"}`} />{active ? <span className="sr-only">{ascending ? "ascending" : "descending"}</span> : null}</button></th>;
}

function LevelBadge({ level }: { level: ThreatLevel }) {
  const tone = level === "LOW" ? "online" : level === "MEDIUM" ? "warning" : "critical";
  return <span className={`inline-flex border px-1.5 py-0.5 text-[8px] font-semibold ${tone === "online" ? "border-online/40 bg-online/10 text-online" : tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : "border-critical/40 bg-critical/10 text-critical"}`}>{level}</span>;
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  const tone = status === "RESOLVED" || status === "CONFIRMED" ? "online" : status === "UNDER REVIEW" ? "warning" : "primary";
  return <span className={`inline-flex border px-1.5 py-0.5 text-[8px] uppercase ${tone === "online" ? "border-online/40 bg-online/10 text-online" : tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : "border-primary/40 bg-primary/10 text-primary"}`}>{status}</span>;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 border-b border-border/70 pb-1.5"><p className="text-[7px] uppercase tracking-widest text-muted-foreground">{label}</p><p className="mt-1 break-words font-mono text-[9px] text-foreground">{value}</p></div>;
}

function IncidentMap({ record }: { record: IncidentRecord }) {
  const targetX = Math.max(8, Math.min(92, record.mapX ?? 51));
  const targetY = Math.max(20, Math.min(88, record.mapY ?? 55));
  return <Panel title="Incident Map" icon={MapPin} right={<span>Sector {record.sector}</span>} bodyClassName="p-0">
    <div className="relative aspect-[1.8/1] overflow-hidden bg-background" role="img" aria-label={`Simulated map of sector ${record.sector} showing target ${record.targetId}`}>
      <svg viewBox="0 0 100 56" className="absolute inset-0 size-full" preserveAspectRatio="none">
        <defs><pattern id="incident-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 L 0 0 0 5" fill="none" className="stroke-border" strokeWidth=".18" /></pattern></defs>
        <rect width="100" height="56" fill="url(#incident-grid)" />
        <path d="M0 19 C15 17 26 21 39 18 S68 20 100 16" fill="none" className="stroke-warning" strokeWidth=".45" strokeDasharray="2 1" />
        <path d="M 18 0 V56 M 38 0 V56 M 58 0 V56 M 78 0 V56" fill="none" className="stroke-border" strokeWidth=".25" />
        <path d="M39 41 L48 33 L61 39 L55 51 L43 49 Z" className="fill-critical/10 stroke-critical/70" strokeWidth=".35" />
        <path d={`M${Math.max(4, targetX - 8)} ${Math.min(52, targetY + 7)} L${targetX} ${targetY}`} fill="none" className="stroke-primary" strokeWidth=".55" strokeDasharray="1.5 1" />
        <circle cx={targetX} cy={targetY} r="2.2" className="fill-critical stroke-background" strokeWidth=".5" />
        <circle cx={targetX} cy={targetY} r="4" fill="none" className="stroke-critical" strokeWidth=".35" />
        {["A", "B", "C", "D", "E"].map((sector, index) => <text key={sector} x={10 + index * 20} y="8" className="fill-muted-foreground" fontSize="3">SEC {sector}</text>)}
        <text x="3" y="17" className="fill-warning" fontSize="2.4">BORDER BOUNDARY</text>
        <text x="40" y="46" className="fill-critical" fontSize="2.4">RESTRICTED ZONE</text>
      </svg>
      <span className="absolute bottom-2 right-2 flex items-center gap-1 border border-border bg-panel/90 px-1.5 py-1 font-mono text-[8px]"><MapPin className="size-3 text-critical" />{record.targetId}</span>
    </div>
    <div className="flex flex-wrap gap-3 border-t border-border px-2 py-1.5 text-[7px] uppercase text-muted-foreground"><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-critical" />Target</span><span className="flex items-center gap-1"><span className="w-4 border-t border-dashed border-warning" />Border</span><span className="flex items-center gap-1"><span className="w-4 border-t border-dashed border-primary" />Track path</span></div>
  </Panel>;
}

function ChartBars({ title, entries, max }: { title: string; entries: Array<{ label: string; value: number; tone: string }>; max: number }) {
  const color = (tone: string) => tone === "critical" ? "bg-critical" : tone === "warning" ? "bg-warning" : tone === "online" ? "bg-online" : "bg-primary";
  return <section className="mt-3 border-t border-border pt-2 first:mt-0 first:border-0 first:pt-0"><h3 className="mb-2 text-[8px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3><div className="space-y-1.5">{entries.map((entry) => <div key={entry.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_1.25rem] items-center gap-2 text-[8px]"><span className="truncate text-muted-foreground">{entry.label}</span><div className="h-1.5 bg-background"><div className={`h-full ${color(entry.tone)}`} style={{ width: `${Math.max(entry.value ? 5 : 0, (entry.value / max) * 100)}%` }} /></div><span className="text-right font-mono text-foreground">{entry.value}</span></div>)}</div></section>;
}