import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    # MongoDB
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "sherlock_ai")

    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "sherlock-ai-secret-key-2026")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # Local Model (Ollama)
    LOCAL_MODEL_BASE_URL: str = os.getenv("LOCAL_MODEL_BASE_URL", "http://localhost:11434")
    LOCAL_MODEL_NAME: str = os.getenv("LOCAL_MODEL_NAME", "hf.co/wincode/kerala-crime-detective-gemma")

    # Hugging Face (legacy - kept for backward compatibility)
    HF_TOKEN: str = os.getenv("HF_TOKEN", "")
    HF_MODEL: str = os.getenv("HF_MODEL", "wincode/kerala-crime-detective-gemma")

    # ElevenLabs
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")
    ELEVENLABS_VOICE_ID: str = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

    # Google OAuth
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_ANDROID_CLIENT_ID: str = os.getenv(
        "GOOGLE_ANDROID_CLIENT_ID",
        "173709998730-fdnsjq0dgbrrv5k8rc33tsj8e54lgco3.apps.googleusercontent.com"
    )
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

    # Server
    SERVER_HOST: str = os.getenv("SERVER_HOST", "0.0.0.0")
    SERVER_PORT: int = int(os.getenv("SERVER_PORT", "8000"))
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "*")

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
