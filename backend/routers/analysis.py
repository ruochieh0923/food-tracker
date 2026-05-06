from fastapi import APIRouter, HTTPException
from ..database import get_db
from ..models import AIEstimateRequest, AnalyzeDayRequest, RecommendRequest, AutocompleteRequest
from ..services import claude_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/autocomplete")
async def autocomplete_meal(req: AutocompleteRequest):
    """Free-form input → full structured meal data with AI analysis."""
    if not req.user_input.strip():
        raise HTTPException(400, "user_input 不能為空")
    result = await claude_service.autocomplete_meal(req.user_input)
    return result


@router.post("/estimate")
async def estimate_nutrition(req: AIEstimateRequest):
    if not req.meal_name.strip():
        raise HTTPException(400, "meal_name is required")
    result = await claude_service.estimate_nutrition(
        req.meal_name, req.restaurant, req.portion_note
    )
    return result


@router.post("/analyze-day")
async def analyze_day(req: AnalyzeDayRequest):
    with get_db() as db:
        meals = [dict(r) for r in db.execute(
            "SELECT * FROM meals WHERE date = ?", (req.date,)
        ).fetchall()]
        profile = dict(db.execute("SELECT * FROM user_profile WHERE id = 1").fetchone() or {})

    if not meals:
        raise HTTPException(404, f"No meals found for {req.date}")

    result = await claude_service.analyze_day(req.date, meals, profile)

    # Persist scores back to daily_summaries
    with get_db() as db:
        db.execute(
            """INSERT OR REPLACE INTO daily_summaries
               (date, fat_loss_score, water_risk_flag, total_calories, total_protein_g,
                total_carbs_g, total_fat_g, total_sodium_mg, meal_count, avg_rating)
               SELECT ?, ?, ?,
                 COALESCE(SUM(calories),0), COALESCE(SUM(protein_g),0),
                 COALESCE(SUM(carbs_g),0), COALESCE(SUM(fat_g),0),
                 COALESCE(SUM(sodium_mg),0), COUNT(*), AVG(rating)
               FROM meals WHERE date = ?""",
            (
                req.date,
                result.get("fat_loss_score", 0),
                {"LOW": 0, "MEDIUM": 1, "HIGH": 2}.get(result.get("water_risk", "LOW"), 0),
                req.date,
            )
        )
    return result


@router.post("/recommend")
async def recommend(req: RecommendRequest):
    from datetime import date
    target_date = req.date or date.today().isoformat()

    with get_db() as db:
        today_meals = [dict(r) for r in db.execute(
            "SELECT * FROM meals WHERE date = ?", (target_date,)
        ).fetchall()]
        profile = dict(db.execute("SELECT * FROM user_profile WHERE id = 1").fetchone() or {})
        top_meals = [dict(r) for r in db.execute(
            """SELECT restaurant, meal_name, rating FROM meals
               WHERE rating IS NOT NULL ORDER BY rating DESC, repurchase DESC LIMIT 15"""
        ).fetchall()]
        recent_meals = [dict(r) for r in db.execute(
            """SELECT meal_name FROM meals WHERE date < ? ORDER BY date DESC LIMIT 10""",
            (target_date,)
        ).fetchall()]

    result = await claude_service.get_recommendations(today_meals, profile, top_meals, recent_meals)
    return {"date": target_date, "recommendations": result}


@router.get("/cache/status")
def cache_status():
    with get_db() as db:
        total = db.execute("SELECT COUNT(*) FROM ai_analysis_cache").fetchone()[0]
        expired = db.execute(
            "SELECT COUNT(*) FROM ai_analysis_cache WHERE expires_at < datetime('now')"
        ).fetchone()[0]
    return {"total_entries": total, "expired_entries": expired, "active_entries": total - expired}


@router.delete("/cache")
def clear_cache():
    with get_db() as db:
        db.execute("DELETE FROM ai_analysis_cache")
    return {"message": "Cache cleared"}
