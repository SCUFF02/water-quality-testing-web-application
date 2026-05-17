# WaterLab Backend

## Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env         # fill in your values
uvicorn app.main:app --reload --port 8000
```

## MQTT broker (local dev)
```bash
# Install Mosquitto then:
mosquitto -v
```

## Architecture
- ESP32 (MultiSensor) → MQTT → backend saves readings to DB
- ESP-CAM (Dosing)    → HTTP POST /dosing/{id}/capture → image processing → DB
- Frontend            → HTTP REST API


## ESP-CAM HTTP upload
```
POST /dosing/{project_id}/capture
Content-Type: multipart/form-data
Fields: source_name, liquid, image (JPEG file)
Authorization: Bearer {token}
```
