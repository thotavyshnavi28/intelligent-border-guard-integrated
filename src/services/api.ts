
import type { DetectionClass } from "../lib/detections";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const TOKEN_KEY = "border_sentinel_access_token";

// Save login token
export function setAccessToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

// Get login token
export function getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

// Clear login token
export function clearAccessToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

export function getApiBaseUrl(): string {
    return API_BASE_URL;
}

export function resolveMediaUrl(path: string | null | undefined): string {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const base = API_BASE_URL.replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${cleanPath}`;
}

// Common API request
export async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getAccessToken();

    const headers = new Headers(options.headers);

    headers.set("Accept", "application/json");

    if (!(options.body instanceof FormData) && options.body !== undefined) {
        headers.set("Content-Type", "application/json");
    }

    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);

        throw new Error(
            errorData?.detail ||
            errorData?.message ||
            `Request failed: ${response.status}`
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

// GET request
export function apiGet<T>(endpoint: string): Promise<T> {
    return apiRequest<T>(endpoint, {
        method: "GET",
    });
}

// POST request
export function apiPost<T>(
    endpoint: string,
    data?: unknown
): Promise<T> {
    const options: RequestInit = {
        method: "POST",
    };

    if (data !== undefined) {
        options.body = data instanceof FormData ? data : JSON.stringify(data);
    }

    return apiRequest<T>(endpoint, options);
}

// PUT request
export function apiPut<T>(
    endpoint: string,
    data: unknown
): Promise<T> {
    return apiRequest<T>(endpoint, {
        method: "PUT",
        body: JSON.stringify(data),
    });
}

// PATCH request
export function apiPatch<T>(
    endpoint: string,
    data: unknown
): Promise<T> {
    return apiRequest<T>(endpoint, {
        method: "PATCH",
        body: JSON.stringify(data),
    });
}

// DELETE request
export function apiDelete<T>(endpoint: string): Promise<T> {
    return apiRequest<T>(endpoint, {
        method: "DELETE",
    });
}

export interface BackendDetectionRaw {
    id?: string;
    class_name?: string;
    label: DetectionClass;
    confidence: number;
    bbox?: number[];
    box: { x: number; y: number; w: number; h: number };
    camera?: string;
    time?: string;
    status?: "Detected" | "Tracking" | "Cleared";
    source?: "demo" | "backend";
    frame?: number;
}

export interface CctvImageUploadResponse {
    id: number;
    media_type: "image";
    filename: string;
    detections: BackendDetectionRaw[];
    count: number;
    annotated_image_url: string;
    created_at: string;
}

export interface CctvVideoUploadResponse {
    id: number;
    media_type: "video";
    filename: string;
    detections: BackendDetectionRaw[];
    count: number;
    frames_processed: number;
    processed_video_url: string;
    created_at: string;
}

export async function uploadCctvImage(file: File): Promise<CctvImageUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<CctvImageUploadResponse>("/api/v1/cctv/images", {
        method: "POST",
        body: formData,
    });
}

export async function uploadCctvVideo(file: File): Promise<CctvVideoUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<CctvVideoUploadResponse>("/api/v1/cctv/videos", {
        method: "POST",
        body: formData,
    });
}

// WebSocket connection helper
export function getWebSocketUrl(channel: string): string {
    const base = API_BASE_URL.replace(/^http/, "ws");
    const token = getAccessToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    return `${base}/ws/${channel}${tokenParam}`;
}

// User / Auth
export interface UserProfile {
    id: number;
    email: string;
    full_name: string;
    role: string;
    is_active?: boolean;
    created_at?: string;
}

export function getCurrentUser(): Promise<UserProfile> {
    return apiGet<UserProfile>("/api/v1/auth/me");
}

export function getUsers(): Promise<UserProfile[]> {
    return apiGet<UserProfile[]>("/api/v1/users");
}

export function setUserActive(userId: number, isActive: boolean): Promise<{ id: number; is_active: boolean }> {
    return apiPatch<{ id: number; is_active: boolean }>(`/api/v1/users/${userId}/active`, { is_active: isActive });
}

// Radar
export interface BackendRadarTarget {
    id: string;
    type: "human" | "animal" | "vehicle" | "drone";
    x: number;
    y: number;
    speed: number;
    heading: number;
    distance: number;
    sector: string;
    confidence: number;
    timestamp: string;
    simulated: boolean;
}

export interface RadarListResponse {
    source: string;
    targets: BackendRadarTarget[];
}

export function getRadarTargets(): Promise<RadarListResponse> {
    return apiGet<RadarListResponse>("/api/v1/radar/targets");
}

export function startRadarSimulation(count = 4): Promise<RadarListResponse> {
    return apiPost<RadarListResponse>(`/api/v1/radar/simulation/start?count=${count}`);
}

export function stopRadarSimulation(): Promise<{ status: string; note?: string }> {
    return apiPost<{ status: string; note?: string }>("/api/v1/radar/simulation/stop");
}

export function resetRadarSimulation(count = 4): Promise<RadarListResponse> {
    return apiPost<RadarListResponse>(`/api/v1/radar/simulation/reset?count=${count}`);
}

export function createRadarTarget(data: {
    target_id: string;
    target_type: "human" | "animal" | "vehicle" | "drone";
    x: number;
    y: number;
    speed: number;
    heading: number;
    confidence?: number;
    simulated?: boolean;
}): Promise<BackendRadarTarget> {
    return apiPost<BackendRadarTarget>("/api/v1/radar/targets", data);
}

// Sensors
export interface BackendSensorItem {
    sensor_id: string;
    sensor_type: string;
    last_seen: string;
    simulated: boolean;
}

export interface BackendSensorReading {
    id: number;
    sensor_id: string;
    sensor_type: string;
    target_id: string | null;
    target_type: string | null;
    location_x: number | null;
    location_y: number | null;
    readings: Record<string, unknown>;
    confidence: number;
    simulated: boolean;
    timestamp: string;
}

export function getSensors(): Promise<{ sensors: BackendSensorItem[] }> {
    return apiGet<{ sensors: BackendSensorItem[] }>("/api/v1/sensors");
}

export function getSensorReadings(limit = 100): Promise<BackendSensorReading[]> {
    return apiGet<BackendSensorReading[]>(`/api/v1/sensors/readings?limit=${limit}`);
}

export function simulateSensors(count = 4): Promise<{ source: string; readings: any[] }> {
    return apiPost<{ source: string; readings: any[] }>(`/api/v1/sensors/simulate?count=${count}`);
}

// Threat Assessment
export interface ThreatAssessmentResult {
    id?: number;
    target_id: string;
    score: number;
    level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    breakdown: {
        location: number;
        movement: number;
        object: number;
        sensorAgreement: number;
        fusionConfidence: number;
    };
    factors: string[];
    recommendation: string;
    timestamp?: string;
}

export function assessThreat(data: {
    target_id: string;
    target_type: string;
    distance: number;
    speed: number;
    heading: number;
    x: number;
    y: number;
    confidence: number;
    sensors?: string[] | undefined;
    conflict?: string | null | undefined;
}): Promise<ThreatAssessmentResult> {
    return apiPost<ThreatAssessmentResult>("/api/v1/threat/assess", data);
}

export function getThreatAssessments(limit = 100): Promise<{ assessments: ThreatAssessmentResult[] }> {
    return apiGet<{ assessments: ThreatAssessmentResult[] }>(`/api/v1/threat/assessments?limit=${limit}`);
}

// Data Fusion
export interface FusedTargetItem {
    target_id: string;
    target_type: string;
    x: number;
    y: number;
    distance: number;
    speed: number;
    heading: number;
    sector: string;
    confidence: number;
    sensors: string[];
    observations?: any[];
    timestamp?: string;
}

export interface FusionRunResult {
    count: number;
    targets: FusedTargetItem[];
    cctv_evidence: any[];
    cctv_spatial_matching: string;
    method: string;
}

export function runFusion(): Promise<FusionRunResult> {
    return apiPost<FusionRunResult>("/api/v1/fusion/run");
}

export function getFusedTargets(): Promise<{ targets: FusedTargetItem[] }> {
    return apiGet<{ targets: FusedTargetItem[] }>("/api/v1/fusion/targets");
}

// Incidents
export interface BackendIncidentItem {
    id: string;
    targetId: string;
    target_id?: string;
    type: "human" | "animal" | "vehicle" | "drone";
    timestamp: string;
    level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    score: number;
    status: "NEW" | "UNDER REVIEW" | "CONFIRMED" | "RESOLVED";
    location?: Record<string, any>;
    position?: string;
    mapX?: number;
    mapY?: number;
    sector?: string;
    description?: string;
    factors?: string[];
    sensors?: string[];
    recommendation?: string;
    reviewNotes?: string;
    timeline?: Array<{ timestamp: string | number; event: string }>;
}

export function getBackendIncidents(limit = 100): Promise<{ incidents: BackendIncidentItem[] }> {
    return apiGet<{ incidents: BackendIncidentItem[] }>(`/api/v1/incidents?limit=${limit}`);
}

export function createBackendIncident(targetId: string): Promise<BackendIncidentItem> {
    return apiPost<BackendIncidentItem>(`/api/v1/incidents?target_id=${encodeURIComponent(targetId)}`);
}

export function updateBackendIncident(
    incidentCode: string,
    updates: { status?: string | undefined; review_notes?: string | undefined }
): Promise<BackendIncidentItem> {
    return apiPatch<BackendIncidentItem>(`/api/v1/incidents/${encodeURIComponent(incidentCode)}`, updates);
}


