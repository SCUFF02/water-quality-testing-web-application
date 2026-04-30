from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.db import create_tables, get_db
from app.routers import login, multisensor, dosing, exports, users, anomaly, merged
from app.models import User, UserRole
from app.settings import settings
from passlib.context import CryptContext
import os

limiter = Limiter(key_func=get_remote_address)
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

HARDCODED_ADMIN = {
    "username": "certe_admin",
    "email":    "certe26@certe.tn",
    "password": "12fgmz36mr!!55",
}

app = FastAPI(title="WaterLab API", version="1.0.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # ── Add your actual domain here ──
        "https://waterlab.certe.tn",       # change to your real domain
        "https://api.waterlab.certe.tn",   # if backend is on a subdomain
        # ── Keep these for local development ──
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",
        "http://192.168.1.50:4173",
        "http://192.168.1.50:5173",
        "http://ladven-certe.tn",
        "https://ladven-certe.tn",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(login.router)
app.include_router(multisensor.router)
app.include_router(dosing.router)
app.include_router(exports.router)
app.include_router(users.router)
app.include_router(anomaly.router)
app.include_router(merged.router)

# Serve uploaded images with CORS support via API endpoint
from fastapi.responses import FileResponse
from fastapi import HTTPException as _HTTPException

@app.get("/uploads/{filename}")
def serve_upload(filename: str):
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise _HTTPException(404, "File not found")
    return FileResponse(filepath)

@app.on_event("startup")
def startup():
    create_tables()
    # Ensure hardcoded admin always exists with correct credentials
    db = next(get_db())
    try:
        admin = db.query(User).filter(User.email == HARDCODED_ADMIN["email"]).first()
        hashed = pwd_ctx.hash(HARDCODED_ADMIN["password"])
        if not admin:
            admin = User(
                username    = HARDCODED_ADMIN["username"],
                email       = HARDCODED_ADMIN["email"],
                hashed_pw   = hashed,
                role        = UserRole.admin,
                is_approved = True,
            )
            db.add(admin)
            db.commit()
            print("[App] Hardcoded admin created")
        else:
            admin.hashed_pw   = hashed
            admin.role        = UserRole.admin
            admin.is_approved = True
            db.commit()
            print("[App] Hardcoded admin verified")
    finally:
        db.close()
    print("[App] Started — DB tables ready")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/system/settings")
def get_system_settings():
    return {"camera_ip": settings.CAMERA_IP}

@app.patch("/system/settings")
def update_system_settings(body: dict):
    if "camera_ip" in body:
        settings.CAMERA_IP = body["camera_ip"].strip()
    return {"camera_ip": settings.CAMERA_IP}

import requests as req_lib
from fastapi.responses import StreamingResponse

@app.get("/camera/stream")
def proxy_camera_stream():
    """Proxy the ESP-CAM MJPEG stream through the backend to avoid CORS issues."""
    if not settings.CAMERA_IP:
        from fastapi import HTTPException
        raise HTTPException(404, "Camera IP not configured")
    
    cam_url = f"http://{settings.CAMERA_IP}/stream"
    
    try:
        r = req_lib.get(cam_url, stream=True, timeout=10)
        content_type = r.headers.get("Content-Type", "multipart/x-mixed-replace;boundary=123456789000000000000987654321")
        
        def generate():
            try:
                for chunk in r.iter_content(chunk_size=4096):
                    if chunk:
                        yield chunk
            except Exception as e:
                print(f"[camera proxy] stream ended: {e}")
        
        return StreamingResponse(generate(), media_type=content_type)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(503, f"Cannot reach camera: {e}")
