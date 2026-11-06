import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Camera,
  Filter,
  SlidersHorizontal,
  Table2,
  Upload,
  Video as VideoIcon,
  ScanLine,
} from "lucide-react";
import { Panel, Shell, StatusDot } from "@/components/sentinel/Shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  CLASS_COLOR,
  CLASS_LABEL,
  DEMO_DETECTIONS,
  type Detection,
  type DetectionClass,
} from "@/lib/detections";
import { formatClock } from "@/lib/radar";
import {
  getAccessToken,
  resolveMediaUrl,
  uploadCctvImage,
  uploadCctvVideo,
} from "@/services/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CCTV AI Detection — Border Sentinel" },
      {
        name: "description",
        content:
          "AI-assisted CCTV object detection module of the Border Sentinel surveillance command system: live feed, detection filters and analysis.",
      },
      { property: "og:title", content: "CCTV AI Detection — Border Sentinel" },
      {
        property: "og:description",
        content:
          "Military-style command console for AI-assisted CCTV object detection and situational awareness.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CctvPage,
});

const FILTER_CLASSES: DetectionClass[] = ["person", "animal", "bird", "vehicle", "drone", "other"];
const FILTER_LABEL: Record<DetectionClass, string> = {
  ...CLASS_LABEL,
  person: "Person / Human",
  other: "Other Supported Objects",
};

function CctvPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<"idle" | "live" | "file">("idle");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [annotatedMediaUrl, setAnnotatedMediaUrl] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [clock, setClock] = useState<string>("--:--:--");

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [draftFilters, setDraftFilters] = useState<Record<DetectionClass, boolean>>({
    person: true,
    animal: true,
    bird: true,
    vehicle: true,
    drone: true,
    other: true,
  });
  const [draftMode, setDraftMode] = useState<"all" | "selected">("all");
  const [applied, setApplied] = useState({ filters: draftFilters, mode: draftMode });

  // Detections rendered. Default to DEMO_DETECTIONS in idle mode,
  // replaced by actual YOLO detection results on upload.
  const [detections, setDetections] = useState<Detection[]>(DEMO_DETECTIONS);

  useEffect(() => {
    const tick = () => setClock(formatClock(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (fileUrl && fileUrl.startsWith("blob:")) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const visible = useMemo(
    () =>
      applied.mode === "all"
        ? detections
        : detections.filter((d) => applied.filters[d.label]),
    [detections, applied],
  );

  async function startCamera() {
    setCameraError(null);
    setUploadError(null);
    setAnnotatedMediaUrl(null);
    setMediaType(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMode("live");
    } catch {
      setCameraError("Camera access denied or unavailable on this device.");
    }
  }

  async function handleFileUpload(file: File | undefined) {
    if (!file) return;

    // Stop live stream if active
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setCameraError(null);
    setUploadError(null);

    const token = getAccessToken();
    if (!token) {
      setUploadError("Authentication required. Please sign in to upload and analyze CCTV footage with YOLOv8.");
      return;
    }

    const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv)$/i.test(file.name);

    if (!isImage && !isVideo) {
      setUploadError("Unsupported media type. Please upload a JPEG/PNG/WebP image or MP4/WebM/MOV video.");
      return;
    }

    setIsUploading(true);
    setUploadFileName(file.name);

    try {
      if (isImage) {
        setMediaType("image");
        const res = await uploadCctvImage(file);
        const resolvedUrl = resolveMediaUrl(res.annotated_image_url);
        setAnnotatedMediaUrl(resolvedUrl);
        setFileUrl(resolvedUrl);
        setMode("file");

        const mapped: Detection[] = (res.detections || []).map((d, idx) => ({
          id: d.id || `DET-${String(idx + 1).padStart(4, "0")}`,
          label: (d.label as DetectionClass) || "other",
          confidence: Math.round(d.confidence),
          camera: d.camera || "CAM-04",
          time: d.time || clock,
          status: d.status || "Detected",
          box: d.box || { x: 0, y: 0, w: 0, h: 0 },
          source: "backend",
        }));
        setDetections(mapped);
      } else {
        setMediaType("video");
        const res = await uploadCctvVideo(file);
        const resolvedUrl = resolveMediaUrl(res.processed_video_url);
        setAnnotatedMediaUrl(resolvedUrl);
        setFileUrl(resolvedUrl);
        setMode("file");

        const mapped: Detection[] = (res.detections || []).map((d, idx) => ({
          id: d.id || `DET-${String(idx + 1).padStart(4, "0")}`,
          label: (d.label as DetectionClass) || "other",
          confidence: Math.round(d.confidence),
          camera: d.camera || "CAM-04",
          time: d.time || clock,
          status: d.status || "Detected",
          box: d.box || { x: 0, y: 0, w: 0, h: 0 },
          source: "backend",
        }));
        setDetections(mapped);

        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = resolvedUrl;
          void videoRef.current.play().catch(() => {});
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Inference failed.";
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  }

  const isBackend = detections.some((d) => d.source === "backend");

  return (
    <Shell>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px_260px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Panel
            title="Live CCTV Surveillance"
            icon={VideoIcon}
            right={
              <>
                <span className="hidden font-mono text-muted-foreground sm:inline">
                  {mode === "file" ? (uploadFileName || "UPLOAD-01") : "CAM-04"}
                </span>
                <span className="hidden font-mono text-muted-foreground sm:inline">Sector B</span>
                <span className="flex items-center gap-1.5 text-critical">
                  <StatusDot tone={mode === "file" ? "online" : "critical"} /> {mode === "file" ? "Analyzed" : "Live"}
                </span>
              </>
            }
          >
            <div className="mb-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={startCamera} className="gap-2 rounded-none uppercase tracking-widest">
                <Camera className="size-4" /> Start Live Camera
              </Button>
              <Button
                size="sm"
                variant="outline"
                asChild
                disabled={isUploading}
                className="gap-2 rounded-none uppercase tracking-widest"
              >
                <label className={isUploading ? "pointer-events-none opacity-50" : "cursor-pointer"}>
                  <Upload className="size-4" /> {isUploading ? "Processing..." : "Upload CCTV Footage"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/x-msvideo"
                    className="sr-only"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>

            <div className="relative aspect-video w-full overflow-hidden border border-border bg-black">
              {mode === "file" && mediaType === "image" && annotatedMediaUrl ? (
                <img
                  src={annotatedMediaUrl}
                  alt="AI Annotated CCTV Detection"
                  className="size-full object-contain bg-black"
                />
              ) : (
                <video
                  ref={videoRef}
                  className="size-full object-cover"
                  muted
                  playsInline
                  loop
                  controls={mode === "file"}
                />
              )}

              {/* Uploading loading overlay */}
              {isUploading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 p-6 text-center backdrop-blur-sm">
                  <div className="size-10 animate-spin border-2 border-primary border-t-transparent" />
                  <p className="mt-4 font-display text-sm uppercase tracking-[0.2em] text-foreground">
                    Uploading & Running YOLOv8 Inference...
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Analyzing frame objects with deep learning engine
                  </p>
                </div>
              )}

              {/* Error notification banner */}
              {uploadError && (
                <div className="absolute inset-x-3 top-3 z-30 flex items-center justify-between border border-critical/80 bg-critical/20 px-3 py-2 text-xs backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <StatusDot tone="critical" />
                    <span className="font-mono text-critical text-[11px] uppercase tracking-wide">
                      {uploadError}
                    </span>
                  </div>
                  {uploadError.toLowerCase().includes("auth") ? (
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                      className="ml-3 h-6 rounded-none border-primary bg-primary/20 text-[10px] uppercase tracking-widest text-foreground hover:bg-primary/30"
                    >
                      <Link to="/login">Sign In</Link>
                    </Button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setUploadError(null)}
                      className="ml-3 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )}

              {mode === "idle" && !isUploading && (
                <div className="absolute inset-0 grid place-items-center bg-[repeating-linear-gradient(0deg,transparent,transparent_14px,rgba(255,255,255,0.03)_15px)] text-center">
                  <div className="px-6">
                    <ScanLine className="mx-auto size-8 text-primary" />
                    <p className="mt-3 font-display text-sm uppercase tracking-[0.2em] text-muted-foreground">
                      No feed selected — start live camera or upload footage
                    </p>
                    {cameraError && (
                      <p className="mt-2 text-xs uppercase tracking-widest text-warning">{cameraError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* AI overlay: bounding boxes drawn for demo mode or live camera */}
              {(mode !== "file" || !annotatedMediaUrl) && (
                <div className="pointer-events-none absolute inset-0">
                  {visible.map((d) => (
                    <div
                      key={d.id}
                      className="absolute border-2"
                      style={{
                        left: `${d.box.x * 100}%`,
                        top: `${d.box.y * 100}%`,
                        width: `${d.box.w * 100}%`,
                        height: `${d.box.h * 100}%`,
                        borderColor: CLASS_COLOR[d.label],
                      }}
                    >
                      <span
                        className="absolute -top-6 left-0 px-1 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-background"
                        style={{ backgroundColor: CLASS_COLOR[d.label] }}
                      >
                        {CLASS_LABEL[d.label]} {d.confidence}%
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="absolute left-3 top-3 flex items-center gap-2 border border-primary/60 bg-background/80 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-primary">
                <ScanLine className="size-3.5" /> {isUploading ? "Inference Active" : isBackend ? "YOLOv8 Detection Active" : "AI Detection Active"}
              </div>

              <dl className="absolute bottom-3 left-3 space-y-0.5 border border-border bg-background/85 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <div>
                  Camera ID : <span className="text-foreground">{mode === "file" ? (uploadFileName || "UPLOAD-01") : "CAM-04"}</span>
                </div>
                <div>
                  Sector : <span className="text-foreground">Sector B</span>
                </div>
                <div>
                  Timestamp : <span className="text-foreground">{clock}</span>
                </div>
                <div>
                  FPS : <span className="text-foreground">{mode === "file" ? "30.0" : "24.7"}</span>
                </div>
                <div className="flex items-center gap-2 pt-1 text-critical">
                  <StatusDot tone={isUploading ? "warning" : mode === "file" ? "online" : "critical"} /> {isUploading ? "Processing" : mode === "file" ? "Verified" : "Recording"}
                </div>
              </dl>
            </div>
          </Panel>

          <Panel
            title="Recent Detections"
            icon={Table2}
            right={
              <span className={isBackend ? "font-mono text-online" : "text-muted-foreground"}>
                {isBackend ? "YOLOv8 Live Detections" : "Sample Data"}
              </span>
            }
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <thead>
                  <tr className="bg-panel-header text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {["Detection ID", "Object", "Confidence", "Camera", "Time", "Status"].map((h) => (
                      <th key={h} className="border-b border-border px-3 py-2 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground uppercase text-[11px]">
                        No objects detected matching current filter
                      </td>
                    </tr>
                  ) : (
                    visible.map((d) => (
                      <tr key={d.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                        <td className="px-3 py-2" style={{ color: CLASS_COLOR[d.label] }}>
                          {d.id}
                        </td>
                        <td className="px-3 py-2" style={{ color: CLASS_COLOR[d.label] }}>
                          {CLASS_LABEL[d.label]}
                        </td>
                        <td className="px-3 py-2">{d.confidence}%</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.camera}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.time}</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2 text-online">
                            <StatusDot /> {d.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel title="AI Detection Filters" icon={Filter} className="h-fit">
          <ul className="space-y-2.5">
            {FILTER_CLASSES.map((c) => (
              <li key={c} className="flex items-center gap-2.5">
                <Checkbox
                  id={`f-${c}`}
                  checked={draftFilters[c]}
                  onCheckedChange={(v) =>
                    setDraftFilters((prev) => ({ ...prev, [c]: v === true }))
                  }
                  className="rounded-none"
                />
                <Label htmlFor={`f-${c}`} className="text-xs font-normal">
                  {FILTER_LABEL[c]}
                </Label>
              </li>
            ))}
          </ul>

          <hr className="my-4 border-border" />
          <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Detection Mode
          </p>
          <RadioGroup value={draftMode} onValueChange={(v) => setDraftMode(v as "all" | "selected")}>
            <div className="flex items-center gap-2.5">
              <RadioGroupItem value="all" id="m-all" />
              <Label htmlFor="m-all" className="text-xs font-normal">
                All Objects
              </Label>
            </div>
            <div className="flex items-center gap-2.5">
              <RadioGroupItem value="selected" id="m-sel" />
              <Label htmlFor="m-sel" className="text-xs font-normal">
                Selected Objects
              </Label>
            </div>
          </RadioGroup>

          <Button
            className="mt-4 w-full gap-2 rounded-none uppercase tracking-widest"
            size="sm"
            onClick={() => setApplied({ filters: draftFilters, mode: draftMode })}
          >
            <SlidersHorizontal className="size-4" /> Apply Filters
          </Button>
        </Panel>

        <Panel title="AI Analysis" icon={Brain} className="h-fit">
          <ul className="space-y-2">
            {visible.map((d) => (
              <li
                key={d.id}
                className="border-l-2 border border-border bg-card px-3 py-2"
                style={{ borderLeftColor: CLASS_COLOR[d.label] }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-display text-sm font-semibold uppercase tracking-widest"
                    style={{ color: CLASS_COLOR[d.label] }}
                  >
                    {CLASS_LABEL[d.label]}
                  </span>
                  <span className="border border-online/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-online">
                    Detected
                  </span>
                </div>
                <dl className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <div>
                    Confidence: <span className="text-foreground">{d.confidence}%</span>
                  </div>
                  <div>Time: {d.time}</div>
                  <div>ID: {d.id}</div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="mt-4 border border-border bg-card p-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <p>Total Objects Detected</p>
            <p className="font-display text-3xl font-bold tracking-normal text-foreground">
              {String(visible.length).padStart(2, "0")}
            </p>
            <p className="mt-3">
              AI Status: <span className="text-online">Active</span>
            </p>
            <p>
              Processing: <span className="text-online">{isBackend ? "YOLOv8 Inference" : "Live"}</span>
            </p>
          </div>
          <p className="mt-2 text-[9px] uppercase leading-relaxed tracking-widest text-muted-foreground">
            {isBackend
              ? `* Live inference results from YOLOv8 model (${detections.length} objects detected).`
              : "* Sample / demo data for UI demonstration. Integration with the AI backend is active."}
          </p>
        </Panel>
      </div>
    </Shell>
  );
}
