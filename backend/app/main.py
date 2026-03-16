from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import create_tables, SessionLocal
from app.mqtt_client import mqtt_client
from app.routers import auth, multisensor, dosing, exports, names, users

app = FastAPI(title="WaterLab API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(multisensor.router)
app.include_router(dosing.router)
app.include_router(exports.router)
app.include_router(names.router)
app.include_router(users.router)

@app.on_event("startup")
def startup():
    create_tables()
    mqtt_client.set_db_factory(SessionLocal)
    mqtt_client.connect()
    print("[App] Started")

@app.get("/health")
def health():
    return {"status": "ok"}