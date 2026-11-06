from datetime import datetime,timezone,timedelta
from app.services.fusion import fuse_observations
from app.services.threat import assess

def test_fusion_matches_explicit_target_id():
    now=datetime.now(timezone.utc)
    obs=[{"id":"1","sensor_type":"radar","target_id":"T-1","target_type":"human","location_x":2,"location_y":3,"confidence":.9,"timestamp":now,"readings":{}},
         {"id":"2","sensor_type":"thermal","target_id":"T-1","target_type":"human","location_x":3,"location_y":4,"confidence":.8,"timestamp":now+timedelta(seconds=1),"readings":{}}]
    result=fuse_observations(obs)
    assert len(result)==1 and result[0]["sensors"]==["radar","thermal"]

def test_fusion_does_not_match_distant_observations_without_id():
    now=datetime.now(timezone.utc)
    obs=[{"id":"1","sensor_type":"radar","target_type":"human","location_x":0,"location_y":0,"confidence":.9,"timestamp":now,"readings":{}},
         {"id":"2","sensor_type":"thermal","target_type":"human","location_x":500,"location_y":500,"confidence":.8,"timestamp":now,"readings":{}}]
    assert len(fuse_observations(obs))==2

def test_threat_returns_explanation_and_level():
    result=assess({"target_id":"T-9","distance":100,"speed":12,"heading":180,"x":50,"y":70,"target_type":"human","confidence":.8,"sensors":["radar","cctv"]})
    assert result["level"] in {"LOW","MEDIUM","HIGH","CRITICAL"}
    assert result["factors"] and result["breakdown"]
