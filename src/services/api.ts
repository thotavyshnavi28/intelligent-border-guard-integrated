
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

