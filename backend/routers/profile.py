from fastapi import APIRouter
from ..database import get_db
from ..models import ProfileUpdate

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
def get_profile():
    with get_db() as db:
        row = db.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        return dict(row) if row else {}


@router.put("")
def update_profile(update: ProfileUpdate):
    fields = update.model_dump(exclude_unset=True)
    if not fields:
        with get_db() as db:
            row = db.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
            return dict(row) if row else {}

    fields["updated_at"] = "datetime('now')"
    sets = ", ".join(f"{k} = ?" for k in fields if k != "updated_at")
    sets += ", updated_at = datetime('now')"
    vals = [v for k, v in fields.items() if k != "updated_at"]

    with get_db() as db:
        db.execute(f"UPDATE user_profile SET {sets} WHERE id = 1", vals)
        row = db.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        return dict(row)
