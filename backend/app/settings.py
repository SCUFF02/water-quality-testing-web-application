from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://root:@localhost:3306/waterlab"
    SECRET_KEY: str = "clientesp32@"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    MQTT_BROKER_HOST: str = "localhost"
    MQTT_BROKER_PORT: int = 1883
    MQTT_USERNAME: str = ""
    MQTT_PASSWORD: str = ""
    MQTT_TOPIC_COMMAND: str = "waterlab/device/{device_id}/command"

    UPLOAD_DIR: str = "uploads"
    DEVICE_API_KEY: str = "clientesp32@"

    class Config:
        env_file = ".env"

settings = Settings()