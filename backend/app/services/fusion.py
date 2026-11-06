from math import hypot
from datetime import datetime, timezone

def fuse_observations(observations: list[dict], time_window_seconds: float=5.0, distance_tolerance: float=75.0) -> list[dict]:
    # Deterministic, explainable greedy correlation. Explicit target IDs take precedence.
    groups=[]
    for obs in sorted(observations,key=lambda x:x["timestamp"]):
        chosen=None
        for group in groups:
            first=group[0]
            explicit=obs.get("target_id") and obs.get("target_id")==first.get("target_id")
            dt=abs((obs["timestamp"]-first["timestamp"]).total_seconds())
            compatible=bool(obs.get("target_type") and first.get("target_type") and obs["target_type"]==first["target_type"])
            has_xy=all(v is not None for v in [obs.get("location_x"),obs.get("location_y"),first.get("location_x"),first.get("location_y")])
            spatial=has_xy and hypot(obs["location_x"]-first["location_x"],obs["location_y"]-first["location_y"])<=distance_tolerance
            if explicit or (dt<=time_window_seconds and compatible and spatial):
                chosen=group; break
        if chosen is None: groups.append([obs])
        else: chosen.append(obs)
    fused=[]
    for index,group in enumerate(groups,1):
        xs=[o["location_x"] for o in group if o.get("location_x") is not None]
        ys=[o["location_y"] for o in group if o.get("location_y") is not None]
        confidences=[float(o.get("confidence",0)) for o in group]
        speeds=[float(o.get("readings",{}).get("speed_kmh",o.get("readings",{}).get("speed",0))) for o in group if o.get("readings",{}).get("speed_kmh",o.get("readings",{}).get("speed")) is not None]
        headings=[float(o.get("readings",{}).get("heading_deg",o.get("readings",{}).get("heading",0))) for o in group if o.get("readings",{}).get("heading_deg",o.get("readings",{}).get("heading")) is not None]
        distances=[float(o.get("readings",{}).get("distance_m")) for o in group if o.get("readings",{}).get("distance_m") is not None]
        sensor_names=sorted({o["sensor_type"] for o in group})
        target_id=next((o.get("target_id") for o in group if o.get("target_id")),None) or f"FUSED-{int(group[0]['timestamp'].timestamp())}-{index}"
        shared_target_ids = {
            o.get("target_id")
            for o in group
            if o.get("target_id")
        }

        has_shared_id = any(
            sum(1 for o in group if o.get("target_id") == shared_id) >= 2
            for shared_id in shared_target_ids
        )

        if has_shared_id:
            correlation_reason = "Explicit shared target ID"
        elif len(group) > 1:
            correlation_reason = (
                "Timestamp, compatible type and coordinate proximity"
            )
        else:
            correlation_reason = (
                "Single observation; no cross-sensor correlation established"
            )
        fused.append({"target_id":target_id,"target_type":next((o.get("target_type") for o in group if o.get("target_type")),None),
            "x":sum(xs)/len(xs) if xs else None,"y":sum(ys)/len(ys) if ys else None,
            "confidence":round(sum(confidences)/len(confidences),4) if confidences else 0,
            "speed":sum(speeds)/len(speeds) if speeds else 0,"heading":sum(headings)/len(headings) if headings else 0,
            "distance":sum(distances)/len(distances) if distances else hypot((sum(xs)/len(xs)-50)*20,(sum(ys)/len(ys)-50)*20) if xs and ys else 0,
            "sensors":sensor_names,"observations":[{"id":o["id"],"sensor":o["sensor_type"],"timestamp":o["timestamp"].isoformat(),"readings":o["readings"]} for o in group],
            "correlation_reason": correlation_reason,
            "timestamp":max(o["timestamp"] for o in group).isoformat()})
    return fused
