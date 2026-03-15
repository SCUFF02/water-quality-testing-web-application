from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Your XAMPP MySQL connection
    # Format: mysql+pymysql://username:password@host:port/database_name
    # XAMPP default: username=root, password=empty, host=localhost, port=3306
    DATABASE_URL: str = "mysql+pymysql://root:@localhost:3306/waterlab"

    # JWT Secret — used to sign login tokens
    # IMPORTANT: change this to any long random string in production
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # tokens last 24 hours

    # MQTT broker (Mosquitto) settings
    MQTT_BROKER_HOST: str = "localhost"
    MQTT_BROKER_PORT: int = 1883
    MQTT_USERNAME: str = ""
    MQTT_PASSWORD: str = ""
    MQTT_TOPIC_COMMAND: str = "waterlab/device/{device_id}/command"

    # Where uploaded ESP-CAM images are saved on disk
    UPLOAD_DIR: str = "uploads"

    # API key for ESP-CAM device (it can't use JWT so we use a simple key)
    # Set this to any secret string and put the same value in the ESP-CAM sketch
    DEVICE_API_KEY: str = "esp-device-secret-key"

    class Config:
        env_file = ".env"

settings = Settings()