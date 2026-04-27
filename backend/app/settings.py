from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL:                str = "mysql+pymysql://root:@localhost:3306/waterlab"
    SECRET_KEY:                  str = "3214a5377cab768ab8fdef4077bd7506c3e527c5900cc0ecff82c1acf525baad"
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 180  # 3 hours

    UPLOAD_DIR:     str = "uploads"
    DEVICE_API_KEY: str = "espclient@"
    CAMERA_IP:      str = ""  # Set this to your ESP-CAM IP e.g. 192.168.1.45

    class Config:
        env_file = ".env"

settings = Settings()