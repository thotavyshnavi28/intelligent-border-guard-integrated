import { apiGet } from "./api";

export interface DashboardStats {
    cctv_uploads: number;
    radar_targets: number;
    sensor_readings: number;
    fused_targets: number;
    open_incidents: number;
    threat_levels: {
        LOW: number;
        MEDIUM: number;
        HIGH: number;
        CRITICAL: number;
    };
    system_mode: string;
}

export function getDashboardStats() {
    return apiGet<DashboardStats>("/api/v1/dashboard/stats");
}