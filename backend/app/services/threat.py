import math

DEFAULT_WEIGHTS={"location":0.30,"movement":0.25,"object":0.20,"sensor_agreement":0.15,"confidence":0.10}
DEFAULT_THRESHOLDS={"LOW":0,"MEDIUM":40,"HIGH":70,"CRITICAL":90}
OBJECT_BASE={"animal":15,"human":55,"vehicle":50,"drone":60}
RESTRICTED_ZONE=[(39,67.7),(53.5,61.6),(60,81.5),(44.5,88.7)]
BORDER_Y=30

def in_restricted_zone(x,y):
    inside=False
    j=len(RESTRICTED_ZONE)-1
    for i,(xi,yi) in enumerate(RESTRICTED_ZONE):
        xj,yj=RESTRICTED_ZONE[j]
        if (yi>y)!=(yj>y) and x < (xj-xi)*(y-yi)/(yj-yi)+xi: inside=not inside
        j=i
    return inside

def assess(payload: dict, weights: dict|None=None, thresholds: dict|None=None) -> dict:
    w=weights or DEFAULT_WEIGHTS; t=thresholds or DEFAULT_THRESHOLDS
    if abs(sum(w.values())-1)>1e-6: raise ValueError("Threat weights must sum to 1")
    x,y=payload["x"],payload["y"]
    restricted=in_restricted_zone(x,y)
    distance_to_border=abs(y-BORDER_Y)
    near_border=distance_to_border<18
    location=round(90 if restricted else 70-distance_to_border if near_border else max(15,45-distance_to_border*.6))
    toward=math.sin(math.radians(payload["heading"])) < -.25 and y>BORDER_Y
    movement=min(98,min(60,(payload["speed"]/40)*60)+(35 if toward else 5))
    obj=OBJECT_BASE[payload["target_type"]]
    agreement=min(100,len(set(payload.get("sensors",[])))/4*100)
    confidence=payload["confidence"]*100
    parts={"location":round(location),"movement":round(movement),"object":obj,"sensor_agreement":round(agreement),"confidence":round(confidence)}
    score=round(sum(parts[k]*w[k] for k in w)); level="LOW"
    for name in ("CRITICAL","HIGH","MEDIUM","LOW"):
        if score>=t[name]: level=name; break
    factors=["Inside configured restricted zone" if restricted else "Close to configured border boundary" if near_border else "Within routine map area",
             "Movement vector points toward configured boundary" if toward else "No boundary-directed movement inferred",
             f"Speed input: {payload['speed']:.1f} km/h",f"Contributing sensor types: {len(set(payload.get('sensors',[])))}",
             f"Detection/fusion confidence: {confidence:.1f}%"]
    if payload.get("conflict"): factors.append("Conflicting sensor observations: "+payload["conflict"])
    return {"target_id":payload["target_id"],"score":max(0,min(100,score)),"level":level,"breakdown":parts,"weights":w,
            "factors":factors,"recommendation":{"LOW":"Continue routine monitoring.","MEDIUM":"Request human review of the observation.","HIGH":"Prioritize human review and verify sensor evidence.","CRITICAL":"Escalate immediately for authorized human review."}[level],
            "disclaimer":"Prototype decision support only; not a determination of hostile intent or attack prediction."}
