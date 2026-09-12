"""MQTT connection + Home Assistant discovery entities for the BP monitor.

Creates one HA device "RBP1711150377" with:
  sensor.bp_systolic (mmHg)   sensor.bp_diastolic (mmHg)
  sensor.bp_pulse (bpm)       sensor.bp_last_reading (timestamp)
  sensor.bp_status (guided step)   sensor.bp_source
  binary_sensor.bp_connected
"""
from __future__ import annotations

import json
import logging
import time

log = logging.getLogger("hamqtt")

NODE = "bp"


class HaMqtt:
    def __init__(self, engine, host, port, user, password, discovery_prefix="homeassistant",
                 device_address=""):
        import paho.mqtt.client as mqtt
        self.engine = engine
        self.prefix = discovery_prefix
        self.uid = (device_address or "bp").replace(":", "").lower()
        self.base = f"{NODE}/{self.uid}"
        self.avail = f"{self.base}/availability"
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"bp_monitor_{self.uid}")
        if user:
            self.client.username_pw_set(user, password or "")
        self.client.will_set(self.avail, "offline", retain=True)
        self.client.on_connect = self._on_connect
        self.host, self.port = host, int(port)
        self.connected = False
        self._last_pub = 0.0
        self._last_state = None
        self.on_connect_hooks = []
        engine.on_status_change.append(self.publish_state)
        engine.on_reading.append(lambda r: self.publish_state(engine.status, force=True))

    def start(self):
        self.client.connect_async(self.host, self.port, keepalive=30)
        self.client.loop_start()

    def _on_connect(self, client, userdata, flags, rc, props=None):
        self.connected = True
        log.info("MQTT connected to %s:%s", self.host, self.port)
        self._publish_discovery()
        client.publish(self.avail, "online", retain=True)
        for h in self.on_connect_hooks:
            h()
        self.publish_state(self.engine.status, force=True)

    def _device(self):
        st = self.engine.status
        dev = {
            "identifiers": [f"bp_{self.uid}"],
            "name": "RBP1711150377",
            "manufacturer": st.manufacturer or "ISSC",
            "model": st.model or "BT5050",
        }
        if st.firmware:
            dev["sw_version"] = st.firmware
        if st.hardware:
            dev["hw_version"] = st.hardware
        return dev

    def _publish_discovery(self):
        dev = self._device()
        common = {"device": dev, "availability_topic": self.avail, "state_topic": f"{self.base}/state"}
        ents = {
            ("sensor", "systolic"): {"name": "Systolic", "unit_of_measurement": "mmHg", "icon": "mdi:heart-pulse",
                                     "state_class": "measurement", "value_template": "{{ value_json.systolic }}"},
            ("sensor", "diastolic"): {"name": "Diastolic", "unit_of_measurement": "mmHg", "icon": "mdi:heart-pulse",
                                      "state_class": "measurement", "value_template": "{{ value_json.diastolic }}"},
            ("sensor", "pulse"): {"name": "Pulse", "unit_of_measurement": "bpm", "icon": "mdi:pulse",
                                  "state_class": "measurement", "value_template": "{{ value_json.pulse }}"},
            ("sensor", "last_reading"): {"name": "Last reading", "device_class": "timestamp", "icon": "mdi:clock-outline",
                                        "value_template": "{{ value_json.reading_time }}"},
            ("sensor", "status"): {"name": "Status", "icon": "mdi:progress-check",
                                   "value_template": "{{ value_json.step }}"},
            ("sensor", "source"): {"name": "Source", "icon": "mdi:source-branch",
                                   "value_template": "{{ value_json.source }}"},
            ("binary_sensor", "connected"): {"name": "Connected", "device_class": "connectivity",
                                             "payload_on": "ON", "payload_off": "OFF",
                                             "value_template": "{{ 'ON' if value_json.connected else 'OFF' }}"},
        }
        for (comp, key), cfg in ents.items():
            cfg = {**common, **cfg, "unique_id": f"bp_{self.uid}_{key}", "object_id": f"bp_{key}"}
            if comp == "sensor" and key in ("status", "source", "last_reading"):
                cfg.pop("state_class", None)
            self.client.publish(f"{self.prefix}/{comp}/{NODE}_{self.uid}/{key}/config", json.dumps(cfg), retain=True)
        log.info("Published %d discovery configs", len(ents))

    def publish_state(self, status, force: bool = False):
        if not self.connected:
            return
        now = time.time()
        reading_iso = None
        if status.reading_time:
            reading_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(status.reading_time))
        payload = {
            "systolic": status.systolic,
            "diastolic": status.diastolic,
            "pulse": status.pulse,
            "reading_time": reading_iso,
            "step": status.step,
            "source": self.engine._active_source,
            "connected": status.connected,
        }
        if not force and payload == self._last_state and now - self._last_pub < 30:
            return
        if not force and now - self._last_pub < 1.0:
            return
        self._last_state = payload
        self._last_pub = now
        self.client.publish(f"{self.base}/state", json.dumps(payload), retain=False)
