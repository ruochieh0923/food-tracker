from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    db_path: str = "data/food_tracker.db"
    claude_fast_model: str = "claude-haiku-4-5-20251001"
    claude_smart_model: str = "claude-sonnet-4-6"
    ai_cache_days: int = 30
    max_concurrent_ai_calls: int = 3

    model_config = {"env_file": "../.env", "extra": "ignore"}


settings = Settings()
