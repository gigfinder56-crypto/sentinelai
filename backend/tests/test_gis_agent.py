import json

from app.agents import gis_agent as gis_module


def test_register_resource_adds_new_entry(tmp_path, monkeypatch):
    monkeypatch.setattr(gis_module, "DATA_DIR", str(tmp_path))

    hospitals_file = tmp_path / "hospitals.json"
    hospitals_file.write_text(json.dumps([]), encoding="utf-8")
    police_file = tmp_path / "police_stations.json"
    police_file.write_text(json.dumps([]), encoding="utf-8")
    ambulances_file = tmp_path / "ambulances.json"
    ambulances_file.write_text(json.dumps([]), encoding="utf-8")

    agent = gis_module.GISAgent()
    resource = agent.register_resource(
        "hospital",
        "City General",
        17.4,
        78.4,
        phone="+911234567890",
    )

    assert resource["name"] == "City General"
    assert resource["lat"] == 17.4
    assert resource["lng"] == 78.4
    assert resource["phone"] == "+911234567890"
    assert resource["id"].startswith("H")
    assert agent.hospitals[0]["id"] == resource["id"]
