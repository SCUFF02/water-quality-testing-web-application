from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.db import create_tables, get_db
from app.routers import login, multisensor, dosing, exports, users, anomaly, merged
from app.models import User, UserRole
from passlib.context import CryptContext

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
        "http://localhost:5173",
        "http://localhost:3000",
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
                username  = HARDCODED_ADMIN["username"],
                email     = HARDCODED_ADMIN["email"],
                hashed_pw = hashed,
                role      = UserRole.admin,
            )
            db.add(admin)
            db.commit()
            print("[App] Hardcoded admin created")
        else:
            # Always keep password and role in sync
            admin.hashed_pw = hashed
            admin.role      = UserRole.admin
            db.commit()
            print("[App] Hardcoded admin verified")
    finally:
        db.close()
    print("[App] Started — DB tables ready")

@app.get("/health")
def health():
    return {"status": "ok"}