from fastapi import APIRouter, UploadFile, File, HTTPException
from ..database import get_db
from ..models import ImportConfirmRequest
from ..services.import_service import (
    parse_csv_bytes, normalize_row, save_staged, load_staged, cleanup_staged
)

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/csv/preview")
async def preview_csv(file: UploadFile = File(...), assign_date: str = None):
    content = await file.read()
    try:
        raw_rows, headers = parse_csv_bytes(content)
    except Exception as e:
        raise HTTPException(400, f"CSV 解析失敗：{e}")

    normalized = [normalize_row(r, assign_date) for r in raw_rows]

    with get_db() as db:
        new_rows, duplicate_rows, invalid_rows = [], [], []
        for row in normalized:
            if not row.get("meal_name"):
                invalid_rows.append({**row, "_reason": "缺少餐點名稱"})
                continue
            exists = db.execute(
                "SELECT id FROM meals WHERE meal_name = ? AND restaurant IS ?",
                (row["meal_name"], row.get("restaurant"))
            ).fetchone()
            if exists:
                duplicate_rows.append(row)
            else:
                new_rows.append(row)

    session_id = save_staged(normalized)
    return {
        "session_id": session_id,
        "headers_detected": headers,
        "total_rows": len(normalized),
        "new_count": len(new_rows),
        "duplicate_count": len(duplicate_rows),
        "invalid_count": len(invalid_rows),
        "preview_new": new_rows[:20],
        "preview_duplicates": duplicate_rows[:10],
        "preview_invalid": invalid_rows[:5],
    }


@router.post("/csv/confirm")
def confirm_import(req: ImportConfirmRequest):
    try:
        staged = load_staged(req.session_id)
    except FileNotFoundError:
        raise HTTPException(404, "Session 不存在或已過期，請重新上傳")

    imported = skipped = ai_needed = 0

    with get_db() as db:
        for row in staged:
            if not row.get("meal_name"):
                skipped += 1
                continue

            exists = db.execute(
                "SELECT id FROM meals WHERE meal_name = ? AND restaurant IS ?",
                (row["meal_name"], row.get("restaurant"))
            ).fetchone()

            if exists and req.skip_duplicates:
                skipped += 1
                continue

            tags = row.pop("tags", [])
            cols = [k for k, v in row.items() if v is not None]
            vals = [row[k] for k in cols]
            placeholders = ", ".join("?" * len(cols))
            col_str = ", ".join(cols)

            cur = db.execute(
                f"INSERT OR IGNORE INTO meals ({col_str}) VALUES ({placeholders})", vals
            )
            meal_id = cur.lastrowid
            if meal_id and tags:
                for tag in tags:
                    db.execute("INSERT INTO meal_tags (meal_id, tag) VALUES (?, ?)", (meal_id, tag))

            if meal_id:
                imported += 1
                if not row.get("calories"):
                    ai_needed += 1

    cleanup_staged(req.session_id)
    return {
        "imported": imported,
        "skipped": skipped,
        "ai_estimation_needed": ai_needed,
        "message": f"成功匯入 {imported} 筆，跳過 {skipped} 筆",
    }


@router.get("/gsheets-guide")
def gsheets_guide():
    return {
        "steps": [
            "1. 開啟 Google Sheet",
            "2. 點選「檔案」→「下載」→「逗號分隔值 (.csv)」",
            "3. 在匯入頁面上傳下載的 CSV 檔案",
        ],
        "note": "系統會自動識別欄位：種類、店家、品項、簡單評級、飽足感、價格、心得、熱量、回購意願",
    }
