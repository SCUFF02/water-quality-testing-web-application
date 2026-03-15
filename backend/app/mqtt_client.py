"""
MQTT Client — runs in a background thread when the server starts.

How it works:
1. Server starts → mqtt_client.connect() is called
2. A background thread runs client.loop_forever() — this listens 24/7
3. When ESP32 publishes sensor data → _on_message fires → saves to DB
4. When frontend clicks start/stop → publish() sends command to ESP32

MQTT topics used:
  ESP32 → backend:  waterlab/multisensor/{project_id}/data
  ESP32 → backend:  waterlab/dosing/{project_id}/data
  backend → ESP32:  waterlab/device/{project_id}/command
"""
import json
import threading
import paho.mqtt.client as mqtt
from app.settings import settings

class WaterlabMQTTClient:
    def __init__(self):
        self.client = mqtt.Client(client_id="waterlab-backend", clean_session=True)
        self._db_factory = None

    def set_db_factory(self, factory):
        """Give the MQTT client access to the database. Called at startup."""
        self._db_factory = factory

    def connect(self):
        if settings.MQTT_USERNAME:
            self.client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)

        self.client.on_connect    = self._on_connect
        self.client.on_message    = self._on_message
        self.client.on_disconnect = self._on_disconnect

        # Auto-reconnect if connection drops (e.g. XAMPP restart)
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)

        try:
            self.client.connect(
                settings.MQTT_BROKER_HOST,
                settings.MQTT_BROKER_PORT,
                keepalive=60
            )
            # Run in background thread so it doesn't block the web server
            t = threading.Thread(target=self.client.loop_forever, daemon=True)
            t.start()
            print(f"[MQTT] Connecting to {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}")
        except Exception as e:
            print(f"[MQTT] Could not connect: {e} — server will run without MQTT")

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print("[MQTT] Connected to broker")
            # Subscribe to all sensor data from all ESP32 devices
            client.subscribe("waterlab/multisensor/+/data")
            client.subscribe("waterlab/dosing/+/data")
            client.subscribe("waterlab/device/+/status")
        else:
            print(f"[MQTT] Connection failed rc={rc}")

    def _on_disconnect(self, client, userdata, rc):
        print(f"[MQTT] Disconnected rc={rc} — will auto-reconnect")

    def _on_message(self, client, userdata, msg):
        """
        Called every time the ESP32 sends data.

        Expected JSON payload from ESP32:
        {
          "project_id": "uuid-of-the-project",
          "sample_id":  "uuid-of-the-sample",   <- optional
          "parameter":  "pH",
          "value":      7.2,
          "unit":       ""
        }
        """
        try:
            payload = json.loads(msg.payload.decode())
            if "/multisensor/" in msg.topic or "/dosing/" in msg.topic:
                self._save_reading(payload, source="mqtt")
        except Exception as e:
            print(f"[MQTT] Error on {msg.topic}: {e}")

    def _save_reading(self, payload: dict, source: str):
        """Saves an incoming ESP32 reading to the database."""
        if not self._db_factory:
            return
        from app.models import SensorReading
        db = self._db_factory()
        try:
            reading = SensorReading(
                project_id = payload.get("project_id"),
                sample_id  = payload.get("sample_id"),
                parameter  = payload.get("parameter", "unknown"),
                value      = float(payload.get("value", 0)),
                unit       = payload.get("unit", ""),
                source     = source,
            )
            db.add(reading)
            db.commit()
        except Exception as e:
            print(f"[MQTT] DB save error: {e}")
            db.rollback()
        finally:
            db.close()

    def publish(self, topic: str, payload: dict):
        """Send a command to the ESP32."""
        self.client.publish(topic, json.dumps(payload), qos=1)

mqtt_client = WaterlabMQTTClient()