import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL:                str = "mysql+pymysql://root:@localhost:3306/waterlab"
    SECRET_KEY:                  str = "3214a5377cab768ab8fdef4077bd7506c3e527c5900cc0ecff82c1acf525baad"
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 180  # 3 hours

    UPLOAD_DIR:     str = "uploads"
    DEVICE_API_KEY: str = "espclient@"
    CAMERA_IP:      str = ""  # Persisted in .env file

    class Config:
        env_file = os.path.join(os.path.dirname(__file__), "..", ".env")

settings = Settings()