from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from ..database import get_db
from ..models import MealCreate, MealUpdate

router = APIRouter(prefix="/api/meals", tags=["meals"])


def _row_to_dict(row) -> dict:
    d = dict(row)
    return d


def _get_tags(db, meal_id: int) -> List[str]:
    rows = db.execute("SELECT tag FROM meal_tags WHERE meal_id = ?", (meal_id,)).fetchall()
    return [r["tag"] for r in rows]


def _set_tags(db, meal_id: int, tags: List[str]):
    db.execute("DELETE FROM meal_tags WHERE meal_id = ?", (meal_id,))
    for tag in tags:
        if tag.strip():
            db.execute("INSERT INTO meal_tags (meal_id, tag) VALUES (?, ?)", (meal_id, tag.strip()))


@router.get("")
def list_meals(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    category: Optional[str] = None,
    restaurant: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    limit: int = 50,
):
    allowed_sort = {"created_at", "date", "meal_name", "rating", "calories", "repurchase", "price"}
    if sort_by not in allowed_sort:
        sort_by = "created_at"
    sort_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

    conditions = []
    params = []

    if date_from:
        conditions.append("m.date >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("m.date <= ?")
        params.append(date_to)
    if category:
        conditions.append("m.category = ?")
        params.append(category)
    if restaurant:
        conditions.append("m.restaurant LIKE ?")
        params.append(f"%{restaurant}%")
    if search:
        conditions.append("(m.meal_name LIKE ? OR m.restaurant LIKE ? OR m.notes LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
    if tag:
        conditions.append("EXISTS (SELECT 1 FROM meal_tags mt WHERE mt.meal_id = m.id AND mt.tag = ?)")
        params.append(tag)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * limit

    with get_db() as db:
        total = db.execute(
            f"SELECT COUNT(*) FROM meals m {where}", params
        ).fetchone()[0]

        rows = db.execute(
            f"SELECT m.* FROM meals m {where} ORDER BY m.{sort_by} {sort_dir} LIMIT ? OFFSET ?",
            params + [limit, offset]
        ).fetchall()

        meals = []
        for row in rows:
            d = _row_to_dict(row)
            d["tags"] = _get_tags(db, d["id"])
            meals.append(d)

    return {"total": total, "page": page, "limit": limit, "data": meals}


@router.get("/meta")
def get_meta():
    with get_db() as db:
        categories = [r[0] for r in db.execute(
            "SELECT DISTINCT category FROM meals WHERE category IS NOT NULL ORDER BY category"
        ).fetchall()]
        restaurants = [r[0] for r in db.execute(
            "SELECT DISTINCT restaurant FROM meals WHERE restaurant IS NOT NULL ORDER BY restaurant"
        ).fetchall()]
        tags = [r[0] for r in db.execute(
            "SELECT DISTINCT tag FROM meal_tags ORDER BY tag"
        ).fetchall()]
    return {"categories": categories, "restaurants": restaurants, "tags": tags}


@router.get("/{meal_id}")
def get_meal(meal_id: int):
    with get_db() as db:
        row = db.execute("SELECT * FROM meals WHERE id = ?", (meal_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Meal not found")
        d = _row_to_dict(row)
        d["tags"] = _get_tags(db, meal_id)
        return d


@router.post("", status_code=201)
def create_meal(meal: MealCreate):
    fields = meal.model_dump(exclude={"tags"})
    cols = [k for k, v in fields.items() if v is not None]
    vals = [fields[k] for k in cols]
    placeholders = ", ".join("?" * len(cols))
    col_str = ", ".join(cols)

    with get_db() as db:
        cur = db.execute(
            f"INSERT INTO meals ({col_str}) VALUES ({placeholders})", vals
        )
        meal_id = cur.lastrowid
        if meal.tags:
            _set_tags(db, meal_id, meal.tags)
        row = db.execute("SELECT * FROM meals WHERE id = ?", (meal_id,)).fetchone()
        d = _row_to_dict(row)
        d["tags"] = meal.tags or []
        return d


@router.put("/{meal_id}")
def update_meal(meal_id: int, meal: MealUpdate):
    with get_db() as db:
        existing = db.execute("SELECT id FROM meals WHERE id = ?", (meal_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Meal not found")

        fields = meal.model_dump(exclude={"tags"}, exclude_unset=True)
        if fields:
            sets = ", ".join(f"{k} = ?" for k in fields)
            db.execute(f"UPDATE meals SET {sets} WHERE id = ?", list(fields.values()) + [meal_id])

        if meal.tags is not None:
            _set_tags(db, meal_id, meal.tags)

        row = db.execute("SELECT * FROM meals WHERE id = ?", (meal_id,)).fetchone()
        d = _row_to_dict(row)
        d["tags"] = _get_tags(db, meal_id)
        return d


@router.delete("/{meal_id}", status_code=204)
def delete_meal(meal_id: int):
    with get_db() as db:
        existing = db.execute("SELECT id FROM meals WHERE id = ?", (meal_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Meal not found")
        db.execute("DELETE FROM meals WHERE id = ?", (meal_id,))
