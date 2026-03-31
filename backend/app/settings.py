from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL:                str = "mysql+pymysql://root:@localhost:3306/waterlab"
    SECRET_KEY:                  str = "change-me-run-python-secrets-token-hex-32"
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    UPLOAD_DIR:     str = "uploads"
    DEVICE_API_KEY: str = "esp-device-secret-key"

    class Config:
        env_file = ".env"

settings = Settings()