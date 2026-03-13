from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Infynd AI Studio"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Supabase Configuration
    # These should be read from the .env file
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    USER_API_KEY_SECRET: str = ""
    DATABASE_URL: str = ""
    BACKEND_PUBLIC_URL: str = "http://localhost:8000"
    SCHEDULER_WEBHOOK_BASE_URL: str = ""
    BACKEND_CORS_ORIGINS: list[str] = ["*"]
    
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

settings = Settings()
