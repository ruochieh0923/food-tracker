from fastapi import APIRouter, Query
from datetime import date, timedelta
from typing import Optional
from ..database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_summary(target_date: Optional[str] = None):
    d = target_date or date.today().isoformat()
    with get_db() as db:
        summary = db.execute(
            "SELECT * FROM daily_summaries WHERE date = ?", (d,)
        ).fetchone()
        profile = db.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        meal_count_total = db.execute("SELECT COUNT(*) FROM meals").fetchone()[0]
        # Streak: consecutive days with meals
        streak = 0
        check = date.fromisoformat(d)
        while True:
            has = db.execute(
                "SELECT COUNT(*) FROM meals WHERE date = ?", (check.isoformat(),)
            ).fetchone()[0]
            if not has:
                break
            streak += 1
            check -= timedelta(days=1)

    s = dict(summary) if summary else {}
    p = dict(profile) if profile else {}
    return {
        "date": d,
        "total_calories": s.get("total_calories", 0),
        "total_protein_g": s.get("total_protein_g", 0),
        "total_carbs_g": s.get("total_carbs_g", 0),
        "total_fat_g": s.get("total_fat_g", 0),
        "total_sodium_mg": s.get("total_sodium_mg", 0),
        "meal_count": s.get("meal_count", 0),
        "avg_rating": s.get("avg_rating"),
        "fat_loss_score": s.get("fat_loss_score"),
        "water_risk_flag": s.get("water_risk_flag", 0),
        "target_calories": p.get("tdee_calories", 1800),
        "target_protein_g": p.get("target_protein_g", 120),
        "target_carbs_g": p.get("target_carbs_g", 150),
        "target_fat_g": p.get("target_fat_g", 55),
        "target_sodium_mg": p.get("target_sodium_mg", 2000),
        "goal": p.get("goal", "fat_loss"),
        "streak_days": streak,
        "total_meals_ever": meal_count_total,
    }


@router.get("/trends")
def get_trends(days: int = 30):
    days = min(max(days, 7), 365)
    end = date.today()
    start = end - timedelta(days=days - 1)

    with get_db() as db:
        rows = db.execute(
            """SELECT date, total_calories, total_protein_g, total_carbs_g,
                      total_fat_g, total_sodium_mg, avg_rating, fat_loss_score
               FROM daily_summaries
               WHERE date >= ? AND date <= ?
               ORDER BY date ASC""",
            (start.isoformat(), end.isoformat())
        ).fetchall()

    return {"days": days, "data": [dict(r) for r in rows]}


@router.get("/category-breakdown")
def category_breakdown(days: int = 30):
    start = (date.today() - timedelta(days=days)).isoformat()
    with get_db() as db:
        rows = db.execute(
            """SELECT category, COUNT(*) as count,
                      ROUND(AVG(rating), 1) as avg_rating,
                      ROUND(SUM(COALESCE(calories, 0)), 0) as total_calories
               FROM meals WHERE date >= ? AND category IS NOT NULL
               GROUP BY category ORDER BY count DESC""",
            (start,)
        ).fetchall()
        # By restaurant
        restaurants = db.execute(
            """SELECT restaurant, COUNT(*) as count,
                      ROUND(AVG(rating), 1) as avg_rating,
                      ROUND(AVG(price), 0) as avg_price
               FROM meals WHERE restaurant IS NOT NULL
               GROUP BY restaurant ORDER BY count DESC LIMIT 20""",
        ).fetchall()
    return {
        "categories": [dict(r) for r in rows],
        "top_restaurants": [dict(r) for r in restaurants],
    }


@router.get("/leaderboard")
def leaderboard():
    with get_db() as db:
        top_rated = db.execute(
            """SELECT meal_name, restaurant, category, rating, repurchase,
                      calories, notes
               FROM meals WHERE rating IS NOT NULL
               ORDER BY rating DESC, repurchase DESC LIMIT 20"""
        ).fetchall()
        most_visited = db.execute(
            """SELECT restaurant, COUNT(*) as visit_count,
                      ROUND(AVG(rating), 1) as avg_rating
               FROM meals WHERE restaurant IS NOT NULL
               GROUP BY restaurant ORDER BY visit_count DESC LIMIT 10"""
        ).fetchall()
        worst = db.execute(
            """SELECT meal_name, restaurant, rating, repurchase, notes
               FROM meals WHERE rating IS NOT NULL
               ORDER BY rating ASC, repurchase ASC LIMIT 5"""
        ).fetchall()
        high_cal = db.execute(
            """SELECT meal_name, restaurant, calories, rating
               FROM meals WHERE calories IS NOT NULL
               ORDER BY calories DESC LIMIT 10"""
        ).fetchall()

    return {
        "top_rated": [dict(r) for r in top_rated],
        "most_visited": [dict(r) for r in most_visited],
        "worst_rated": [dict(r) for r in worst],
        "highest_calorie": [dict(r) for r in high_cal],
    }


@router.get("/stats")
def overall_stats():
    with get_db() as db:
        stats = db.execute("""
            SELECT
              COUNT(*) as total_meals,
              COUNT(DISTINCT restaurant) as unique_restaurants,
              COUNT(DISTINCT category) as unique_categories,
              ROUND(AVG(rating), 2) as avg_rating,
              ROUND(AVG(price), 0) as avg_price,
              ROUND(AVG(calories), 0) as avg_calories,
              SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star_count,
              SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star_count
            FROM meals
        """).fetchone()
        satiety_dist = db.execute(
            """SELECT satiety, COUNT(*) as count FROM meals
               WHERE satiety IS NOT NULL GROUP BY satiety ORDER BY count DESC"""
        ).fetchall()
        rating_dist = db.execute(
            """SELECT rating_text, COUNT(*) as count FROM meals
               WHERE rating_text IS NOT NULL GROUP BY rating_text ORDER BY count DESC"""
        ).fetchall()

    return {
        "totals": dict(stats) if stats else {},
        "satiety_distribution": [dict(r) for r in satiety_dist],
        "rating_distribution": [dict(r) for r in rating_dist],
    }
