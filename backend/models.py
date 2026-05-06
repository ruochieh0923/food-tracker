from pydantic import BaseModel
from typing import Optional, List


class MealCreate(BaseModel):
    date: Optional[str] = None
    category: Optional[str] = None
    restaurant: Optional[str] = None
    meal_name: str
    rating_text: Optional[str] = None
    rating: Optional[int] = None
    repurchase: Optional[int] = None
    satiety: Optional[str] = None
    price: Optional[float] = None
    notes: Optional[str] = None
    calories: Optional[float] = None
    calories_min: Optional[float] = None
    calories_max: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    fiber_g: Optional[float] = None
    photo_url: Optional[str] = None
    tags: Optional[List[str]] = None
    source: Optional[str] = "manual"


class MealUpdate(BaseModel):
    date: Optional[str] = None
    category: Optional[str] = None
    restaurant: Optional[str] = None
    meal_name: Optional[str] = None
    rating_text: Optional[str] = None
    rating: Optional[int] = None
    repurchase: Optional[int] = None
    satiety: Optional[str] = None
    price: Optional[float] = None
    notes: Optional[str] = None
    calories: Optional[float] = None
    calories_min: Optional[float] = None
    calories_max: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    fiber_g: Optional[float] = None
    photo_url: Optional[str] = None
    tags: Optional[List[str]] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    tdee_calories: Optional[float] = None
    goal: Optional[str] = None
    target_protein_g: Optional[float] = None
    target_carbs_g: Optional[float] = None
    target_fat_g: Optional[float] = None
    target_sodium_mg: Optional[float] = None


class AIEstimateRequest(BaseModel):
    meal_name: str
    restaurant: Optional[str] = None
    portion_note: Optional[str] = None


class AnalyzeDayRequest(BaseModel):
    date: str


class RecommendRequest(BaseModel):
    date: Optional[str] = None


class AutocompleteRequest(BaseModel):
    user_input: str


class ImportConfirmRequest(BaseModel):
    session_id: str
    skip_duplicates: bool = True
    assign_date: Optional[str] = None
