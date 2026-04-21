from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL:                str = "mysql+pymysql://root:https://ladven-certe.tn/esp32"
    SECRET_KEY:                  str = "3214a5377cab768ab8fdef4077bd7506c3e527c5900cc0ecff82c1acf525baad"
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    UPLOAD_DIR:     str = "uploads"
    DEVICE_API_KEY: str = "esp-device-secret-key"

    class Config:
        env_file = ".env"

settings = Settings()