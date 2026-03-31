from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.db import create_tables
from app.routers import auth, multisensor, dosing, exports, names, users

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="WaterLab API", version="1.0.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
    print("[App] Started — DB tables ready")

@app.get("/health")
def health():
    return {"status": "ok"}