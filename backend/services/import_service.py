import csv
import re
import io
import uuid
import os
import json
from datetime import datetime
from typing import Optional

RATING_MAP = {
    "神極好吃": 5, "滿好吃": 4, "還行": 3, "普通": 2, "難吃": 1,
    "超好吃": 5, "好吃": 4, "普": 2,
}

COLUMN_MAP = {
    "種類": "category", "类别": "category", "category": "category",
    "店家": "restaurant", "店名": "restaurant", "restaurant": "restaurant",
    "品項": "meal_name", "品项": "meal_name", "餐點": "meal_name",
    "餐点名称": "meal_name", "名稱": "meal_name", "meal_name": "meal_name", "item": "meal_name",
    "簡單評級": "rating_text", "评级": "rating_text", "評分": "rating_text",
    "饱足感": "satiety", "飽足感": "satiety", "satiety": "satiety",
    "價格": "price", "价格": "price", "price": "price",
    "心得": "notes", "备注": "notes", "備註": "notes", "notes": "notes",
    "熱量": "calories", "热量": "calories", "calories": "calories",
    "回購意願": "repurchase", "回购意愿": "repurchase", "repurchase": "repurchase",
    "食物照": "photo_url", "photo": "photo_url",
    "蛋白質": "protein_g", "蛋白质": "protein_g", "protein": "protein_g",
    "碳水": "carbs_g", "碳水化合物": "carbs_g", "carbs": "carbs_g",
    "脂肪": "fat_g", "fat": "fat_g",
    "鈉": "sodium_mg", "sodium": "sodium_mg",
    "日期": "date", "date": "date",
    "標籤": "tags", "标签": "tags", "tags": "tags",
}

IMPORTS_DIR = "data/imports"


def _parse_calories(val: str) -> tuple[Optional[float], Optional[float], Optional[float]]:
    if not val or not val.strip():
        return None, None, None
    val = val.strip().replace("kl", "").replace("kcal", "").replace("卡", "").strip()
    # Range: "210-260" or "650~750"
    m = re.match(r'^(\d+(?:\.\d+)?)\s*[~\-~–]\s*(\d+(?:\.\d+)?)$', val)
    if m:
        lo, hi = float(m.group(1)), float(m.group(2))
        return (lo + hi) / 2, lo, hi
    # Single number
    try:
        v = float(val)
        return v, None, None
    except ValueError:
        return None, None, None


def _parse_price(val: str) -> Optional[float]:
    if not val:
        return None
    val = re.sub(r'[NT$,\s]', '', val)
    try:
        return float(val)
    except ValueError:
        return None


def _parse_repurchase(val: str) -> Optional[int]:
    if not val or not val.strip():
        return None
    try:
        v = int(float(val.strip()))
        return max(0, min(5, v))
    except ValueError:
        return None


def map_headers(headers: list[str]) -> dict[str, str]:
    mapping = {}
    for h in headers:
        key = h.strip()
        if key in COLUMN_MAP:
            mapping[h] = COLUMN_MAP[key]
        else:
            # fuzzy: check if any known key is contained in header
            for known, field in COLUMN_MAP.items():
                if known in key or key in known:
                    mapping[h] = field
                    break
    return mapping


def parse_csv_bytes(content: bytes) -> tuple[list[dict], list[str]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    col_map = map_headers(list(headers))
    rows = []
    for raw in reader:
        row = {}
        for h, field in col_map.items():
            val = raw.get(h)
            row[field] = val.strip() if val is not None else ""
        # Skip rows with no meal name
        if not row.get("meal_name"):
            continue
        rows.append(row)
    return rows, list(headers)


def normalize_row(row: dict, assign_date: Optional[str] = None) -> dict:
    cal, cal_min, cal_max = _parse_calories(row.get("calories", ""))
    rating_text = row.get("rating_text", "").strip()
    rating_num = RATING_MAP.get(rating_text)
    if not rating_num and row.get("repurchase"):
        r = _parse_repurchase(row.get("repurchase", ""))
        rating_num = r if r and r > 0 else None

    return {
        "date": row.get("date") or assign_date,
        "category": row.get("category") or None,
        "restaurant": row.get("restaurant") or None,
        "meal_name": row.get("meal_name", "").strip(),
        "rating_text": rating_text or None,
        "rating": rating_num,
        "repurchase": _parse_repurchase(row.get("repurchase", "")),
        "satiety": row.get("satiety") or None,
        "price": _parse_price(row.get("price", "")),
        "notes": row.get("notes") or None,
        "calories": cal,
        "calories_min": cal_min,
        "calories_max": cal_max,
        "protein_g": None,
        "carbs_g": None,
        "fat_g": None,
        "sodium_mg": None,
        "fiber_g": None,
        "photo_url": row.get("photo_url") or None,
        "source": "csv_import",
        "tags": [t.strip() for t in row.get("tags", "").split(",") if t.strip()],
    }


def save_staged(rows: list[dict]) -> str:
    session_id = uuid.uuid4().hex
    os.makedirs(IMPORTS_DIR, exist_ok=True)
    path = os.path.join(IMPORTS_DIR, f"{session_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    return session_id


def load_staged(session_id: str) -> list[dict]:
    path = os.path.join(IMPORTS_DIR, f"{session_id}.json")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Session {session_id} not found")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cleanup_staged(session_id: str):
    path = os.path.join(IMPORTS_DIR, f"{session_id}.json")
    if os.path.exists(path):
        os.remove(path)
