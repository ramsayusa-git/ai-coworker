"""MQTT connection + Home Assistant discovery entities for the ecg2.

Creates one HA device "ikinloop ecg2" with:
  sensor.ecg2_heart_rate (bpm)   sensor.ecg2_rr_interval (ms)
  sensor.ecg2_battery (%)        binary_sensor.ecg2_skin_contact
  binary_sensor.ecg2_connected   sensor.ecg2_signal_quality
  sensor.ecg2_status (guided step) switch.ecg2_recording
"""
from __future__ import annotations

import json
import logging
import time

log = logging.getLogger("hamqtt")

NODE = "ecg2"


class HaMqtt:
    def __init__(self, engine, host, port, user, password, discovery_prefix="homeassistant",
                 device_address="", on_recording_cmd=None):
        import paho.mqtt.client as mqtt
        self.engine = engine
        self.prefix = discovery_prefix
        self.on_recording_cmd = on_recording_cmd
        self.uid = (device_address or "ecg2").replace(":", "").lower()
        self.base = f"{NODE}/{self.uid}"
        self.avail = f"{self.base}/availability"
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"ecg2_monitor_{self.uid}")
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
        engine.on_beat.append(lambda hr: self.publish_state(engine.status, force=True))

    def start(self):
        self.client.connect_async(self.host, self.port, keepalive=30)
        self.client.loop_start()

    def _on_connect(self, client, userdata, flags, rc, props=None):
        self.connected = True
        log.info("MQTT connected to %s:%s", self.host, self.port)
        self._publish_discovery()
        client.publish(self.avail, "online", retain=True)
        client.message_callback_add(f"{self.base}/recording/set", self._on_rec_cmd)
        client.subscribe(f"{self.base}/recording/set")
        for h in self.on_connect_hooks:
            h()
        self.publish_state(self.engine.status, force=True)

    def _on_rec_cmd(self, _c, _u, msg):
        if self.on_recording_cmd:
            self.on_recording_cmd(msg.payload == b"ON")

    def _device(self):
        st = self.engine.status
        dev = {
            "identifiers": [f"ecg2_{self.uid}"],
            "name": "ikinloop ecg2",
            "manufacturer": "ikinloop",
            "model": st.model or "Z3518A",
        }
        # HA discovery rejects null values — only include versions once known.
        if st.firmware:
            dev["sw_version"] = st.firmware
        if st.hardware:
            dev["hw_version"] = st.hardware
        return dev

    def _publish_discovery(self):
        dev = self._device()
        common = {"device": dev, "availability_topic": self.avail, "state_topic": f"{self.base}/state"}
        ents = {
            ("sensor", "heart_rate"): {"name": "Heart rate", "unit_of_measurement": "bpm", "icon": "mdi:heart-pulse",
                                       "state_class": "measurement", "value_template": "{{ value_json.hr }}"},
            ("sensor", "heart_rate_device"): {"name": "Heart rate (device)", "unit_of_measurement": "bpm",
                                              "icon": "mdi:heart", "state_class": "measurement",
                                              "value_template": "{{ value_json.hr_device }}"},
            ("sensor", "rr_interval"): {"name": "RR interval", "unit_of_measurement": "ms", "icon": "mdi:sine-wave",
                                        "state_class": "measurement", "value_template": "{{ value_json.rr_ms }}"},
            ("sensor", "battery"): {"name": "Battery", "unit_of_measurement": "%", "device_class": "battery",
                                    "state_class": "measurement", "value_template": "{{ value_json.battery }}"},
            ("sensor", "signal_quality"): {"name": "Signal quality", "icon": "mdi:waveform",
                                           "value_template": "{{ value_json.quality }}"},
            ("sensor", "status"): {"name": "Status", "icon": "mdi:progress-check",
                                   "value_template": "{{ value_json.step }}"},
            ("sensor", "source"): {"name": "Source", "icon": "mdi:source-branch",
                                   "value_template": "{{ value_json.source }}"},
            ("binary_sensor", "skin_contact"): {"name": "Skin contact", "device_class": "connectivity",
                                                "icon": "mdi:hand-back-right", "payload_on": "ON", "payload_off": "OFF",
                                                "value_template": "{{ 'ON' if value_json.contact else 'OFF' }}"},
            ("binary_sensor", "connected"): {"name": "Connected", "device_class": "connectivity",
                                             "payload_on": "ON", "payload_off": "OFF",
                                             "value_template": "{{ 'ON' if value_json.connected else 'OFF' }}"},
            ("switch", "recording"): {"name": "Recording", "icon": "mdi:record-rec",
                                      "command_topic": f"{self.base}/recording/set",
                                      "payload_on": "ON", "payload_off": "OFF",
                                      "value_template": "{{ 'ON' if value_json.recording else 'OFF' }}"},
        }
        for (comp, key), cfg in ents.items():
            cfg = {**common, **cfg, "unique_id": f"ecg2_{self.uid}_{key}", "object_id": f"ecg2_{key}"}
            if comp == "sensor" and key in ("signal_quality", "status", "source"):
                cfg.pop("state_class", None)
            self.client.publish(f"{self.prefix}/{comp}/{NODE}_{self.uid}/{key}/config", json.dumps(cfg), retain=True)
        log.info("Published %d discovery configs", len(ents))

    def publish_state(self, status, force: bool = False):
        if not self.connected:
            return
        now = time.time()
        payload = {
            "hr": round(status.hr) if status.hr else None,
            "hr_device": status.hr_device,
            "rr_ms": status.rr_ms,
            "battery": status.battery,
            "quality": status.quality,
            "step": status.step,
            "source": self.engine._active_source,
            "contact": status.contact,
            "connected": status.connected,
            "recording": status.recording,
        }
        if not force and payload == self._last_state and now - self._last_pub < 30:
            return
        if not force and now - self._last_pub < 1.0:
            return
        self._last_state = payload
        self._last_pub = now
        self.client.publish(f"{self.base}/state", json.dumps(payload), retain=False)
