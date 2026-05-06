import asyncio
import hashlib
import json
import re
from datetime import datetime, timedelta
from typing import Optional
import anthropic
from ..config import settings
from ..database import get_db

_client: Optional[anthropic.Anthropic] = None

# Fallback nutrition estimates for common Taiwanese food keywords (kcal)
_KEYWORD_FALLBACK = [
    (["雞胸", "舒肥雞"], {"calories": 220, "protein_g": 40, "carbs_g": 2, "fat_g": 5, "sodium_mg": 500}),
    (["雞腿飯", "雞腿"], {"calories": 550, "protein_g": 35, "carbs_g": 60, "fat_g": 15, "sodium_mg": 800}),
    (["沙拉", "生菜"], {"calories": 180, "protein_g": 12, "carbs_g": 15, "fat_g": 8, "sodium_mg": 400}),
    (["蛋餅"], {"calories": 280, "protein_g": 14, "carbs_g": 32, "fat_g": 10, "sodium_mg": 600}),
    (["燒餅"], {"calories": 320, "protein_g": 10, "carbs_g": 50, "fat_g": 8, "sodium_mg": 550}),
    (["拌麵", "乾麵"], {"calories": 500, "protein_g": 18, "carbs_g": 70, "fat_g": 14, "sodium_mg": 900}),
    (["豚骨", "拉麵", "沾麵"], {"calories": 680, "protein_g": 28, "carbs_g": 75, "fat_g": 22, "sodium_mg": 1400}),
    (["水餃", "煎餃"], {"calories": 400, "protein_g": 18, "carbs_g": 50, "fat_g": 14, "sodium_mg": 700}),
    (["刈包", "割包"], {"calories": 380, "protein_g": 16, "carbs_g": 42, "fat_g": 16, "sodium_mg": 600}),
    (["咖哩飯", "咖喱飯"], {"calories": 650, "protein_g": 22, "carbs_g": 85, "fat_g": 18, "sodium_mg": 900}),
    (["烤肉飯"], {"calories": 580, "protein_g": 25, "carbs_g": 70, "fat_g": 18, "sodium_mg": 800}),
    (["三明治"], {"calories": 300, "protein_g": 16, "carbs_g": 34, "fat_g": 10, "sodium_mg": 650}),
    (["鬆餅", "漢堡"], {"calories": 580, "protein_g": 22, "carbs_g": 65, "fat_g": 22, "sodium_mg": 900}),
    (["捲餅"], {"calories": 260, "protein_g": 14, "carbs_g": 30, "fat_g": 8, "sodium_mg": 550}),
    (["潤餅"], {"calories": 350, "protein_g": 12, "carbs_g": 48, "fat_g": 12, "sodium_mg": 600}),
    (["飯糰"], {"calories": 320, "protein_g": 8, "carbs_g": 55, "fat_g": 8, "sodium_mg": 500}),
    (["丼飯", "親子丼", "海南雞飯"], {"calories": 580, "protein_g": 28, "carbs_g": 72, "fat_g": 14, "sodium_mg": 850}),
    (["健康餐盒", "餐盒", "便當"], {"calories": 480, "protein_g": 35, "carbs_g": 45, "fat_g": 12, "sodium_mg": 700}),
]


def _api_key_ok() -> bool:
    k = settings.anthropic_api_key
    return bool(k and k != "your_api_key_here" and k.startswith("sk-"))


def _keyword_fallback(meal_name: str) -> dict:
    name = meal_name.lower()
    for keywords, vals in _KEYWORD_FALLBACK:
        if any(kw in name for kw in keywords):
            return {**vals, "fiber_g": 3.0, "confidence": 0.3,
                    "notes": "關鍵字估算（無 API Key 或 AI 失敗）", "from_cache": False, "is_fallback": True}
    return {"calories": 450, "protein_g": 20, "carbs_g": 55, "fat_g": 14, "sodium_mg": 700,
            "fiber_g": 3.0, "confidence": 0.1, "notes": "預設估算", "from_cache": False, "is_fallback": True}


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _hash_meal(meal_name: str) -> str:
    return hashlib.sha256(meal_name.strip().lower().encode()).hexdigest()


def _get_cached(meal_name: str) -> Optional[dict]:
    with get_db() as db:
        row = db.execute(
            "SELECT response_json, expires_at FROM ai_analysis_cache WHERE meal_name_hash = ?",
            (_hash_meal(meal_name),)
        ).fetchone()
        if row:
            if row["expires_at"] and datetime.fromisoformat(row["expires_at"]) < datetime.now():
                return None
            return json.loads(row["response_json"])
    return None


def _set_cache(meal_name: str, data: dict, model: str):
    expires = (datetime.now() + timedelta(days=settings.ai_cache_days)).isoformat()
    with get_db() as db:
        db.execute(
            """INSERT OR REPLACE INTO ai_analysis_cache
               (meal_name_hash, meal_name, response_json, model_version, expires_at)
               VALUES (?, ?, ?, ?, ?)""",
            (_hash_meal(meal_name), meal_name, json.dumps(data, ensure_ascii=False), model, expires)
        )


def _extract_json_obj(text: str) -> dict:
    match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if match:
        return json.loads(match.group())
    # Try full text
    return json.loads(text.strip())


async def estimate_nutrition(
    meal_name: str,
    restaurant: Optional[str] = None,
    portion_note: Optional[str] = None,
) -> dict:
    cache_key = f"{restaurant or ''} {meal_name} {portion_note or ''}".strip()

    cached = _get_cached(cache_key)
    if cached:
        cached["from_cache"] = True
        return cached

    if not _api_key_ok():
        result = _keyword_fallback(meal_name)
        result["error"] = "API Key 未設定，使用關鍵字估算。請在 .env 填入 ANTHROPIC_API_KEY。"
        return result

    context = meal_name
    if restaurant:
        context = f"{restaurant} 的 {meal_name}"
    if portion_note:
        context += f"（{portion_note}）"

    prompt = (
        f'請估算以下台灣食物的營養成分（一人份標準大小）：「{context}」\n\n'
        '只回傳以下 JSON，不要加任何說明文字：\n'
        '{"calories":數字,"protein_g":數字,"carbs_g":數字,"fat_g":數字,'
        '"sodium_mg":數字,"fiber_g":數字,"confidence":0到1,"notes":"說明"}'
    )

    model = settings.claude_fast_model
    client = _get_client()

    try:
        response = await asyncio.to_thread(
            client.messages.create,
            model=model,
            max_tokens=350,
            temperature=0.1,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        try:
            data = _extract_json_obj(text)
        except Exception:
            # One retry asking for clean JSON
            fix = await asyncio.to_thread(
                client.messages.create,
                model=model,
                max_tokens=350,
                temperature=0,
                messages=[
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": text},
                    {"role": "user", "content": "只回傳合法 JSON，不要其他文字。"},
                ],
            )
            data = _extract_json_obj(fix.content[0].text)

        # Ensure all numeric fields exist
        for field in ["calories", "protein_g", "carbs_g", "fat_g", "sodium_mg", "fiber_g"]:
            if field not in data or not isinstance(data[field], (int, float)):
                data[field] = None
        data.setdefault("confidence", 0.7)
        data.setdefault("notes", "")
        data["from_cache"] = False
        data["is_fallback"] = False
        _set_cache(cache_key, {k: v for k, v in data.items() if k != "from_cache"}, model)
        return data

    except anthropic.AuthenticationError:
        result = _keyword_fallback(meal_name)
        result["error"] = "API Key 無效，請確認 .env 中的 ANTHROPIC_API_KEY。"
        return result
    except Exception as e:
        result = _keyword_fallback(meal_name)
        result["error"] = f"AI 服務暫時無法使用，已改用關鍵字估算：{str(e)[:80]}"
        return result


async def autocomplete_meal(user_input: str) -> dict:
    """
    Takes free-form text like "麥當勞 雞塊 可樂" or "鹹水雞 雞胸 龍鬚菜 木耳"
    and returns a fully structured meal record.
    Falls back to keyword estimation when API key is missing.
    """
    if not user_input.strip():
        raise ValueError("輸入不能為空")

    # Always try keyword fallback first as a base
    base = _keyword_fallback(user_input)

    if not _api_key_ok():
        # Lightweight local parse: first word is likely restaurant, rest is dish
        parts = user_input.strip().split()
        restaurant = parts[0] if len(parts) > 1 else ""
        meal_name = " ".join(parts[1:]) if len(parts) > 1 else user_input.strip()
        sodium = base.get("sodium_mg", 700)
        water_risk = "HIGH" if sodium > 1200 else ("MEDIUM" if sodium > 800 else "LOW")
        cal = base.get("calories", 450)
        fat_loss_score = max(0, min(100, int(80 - cal / 30)))
        return {
            **base,
            "restaurant": restaurant,
            "meal_name": meal_name,
            "category": _guess_category(user_input),
            "water_risk": water_risk,
            "fat_loss_score": fat_loss_score,
            "fat_loss_label": _fat_loss_label(fat_loss_score, water_risk),
            "satiety": _guess_satiety(user_input),
            "rating": 3,
            "rating_text": "還行",
            "notes": f"（關鍵字估算）鈉攝取{'偏高，水腫風險' if water_risk != 'LOW' else '正常，'}{'適中' if water_risk == 'LOW' else water_risk}。建議設定 API Key 以獲得 AI 智能分析。",
        }

    prompt = (
        "你是台灣飲食營養師。使用者輸入了一段簡短的飲食描述，請幫助解析並補全所有欄位。\n\n"
        f"使用者輸入：「{user_input}」\n\n"
        "請根據台灣常見份量與外食習慣，回傳以下 JSON（只回傳 JSON，不要其他說明）：\n"
        "{\n"
        '  "restaurant": "店家名稱（沒有就空字串）",\n'
        '  "category": "類別（如：速食/早餐店/健康餐盒/日式/台式/滷味/超商/自煮等）",\n'
        '  "meal_name": "完整餐點名稱（結構化整理）",\n'
        '  "calories": 數字,\n'
        '  "protein_g": 數字,\n'
        '  "carbs_g": 數字,\n'
        '  "fat_g": 數字,\n'
        '  "sodium_mg": 數字,\n'
        '  "fiber_g": 數字,\n'
        '  "satiety": "很飽/微飽/適中/偏少",\n'
        '  "rating": 1到5的整數,\n'
        '  "rating_text": "神極好吃/滿好吃/還行/普通/難吃",\n'
        '  "water_risk": "LOW/MEDIUM/HIGH",\n'
        '  "fat_loss_score": 0到100的整數（100最佳減脂效果）,\n'
        '  "fat_loss_label": "一句話評語（例：高蛋白低卡，減脂首選）",\n'
        '  "notes": "詳細分析：包含食材特色、水腫風險原因、減脂友善度說明、建議調整方式（2-3句）",\n'
        '  "confidence": 0到1\n'
        "}\n"
        "注意：\n"
        "- 台灣常見份量（雞塊通常6塊/10塊、便當約600-800kcal、蛋餅約250-350kcal）\n"
        "- 水腫風險 HIGH=鈉>1500mg 或高加工食品，MEDIUM=鈉800-1500mg，LOW=<800mg\n"
        "- 減脂分數 80+高蛋白低卡佳，60-79中等，40-59偏差，<40高油高糖不推\n"
        "- rating 基於減脂目標給建議：5=非常推薦，1=不建議"
    )

    client = _get_client()
    try:
        response = await asyncio.to_thread(
            client.messages.create,
            model=settings.claude_smart_model,
            max_tokens=700,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
        )
        data = _extract_json_obj(response.content[0].text)

        # Validate / fill missing numeric fields
        for f in ["calories", "protein_g", "carbs_g", "fat_g", "sodium_mg", "fiber_g"]:
            if f not in data or not isinstance(data[f], (int, float)):
                data[f] = base.get(f)

        data.setdefault("water_risk", "LOW")
        data.setdefault("fat_loss_score", 50)
        data.setdefault("confidence", 0.8)
        data["is_fallback"] = False
        return data

    except anthropic.AuthenticationError:
        return {**base, "is_fallback": True,
                "error": "API Key 無效，已改用關鍵字估算",
                "restaurant": "", "meal_name": user_input,
                "category": _guess_category(user_input)}
    except Exception as e:
        return {**base, "is_fallback": True,
                "error": f"AI 暫時無法使用：{str(e)[:60]}",
                "restaurant": "", "meal_name": user_input,
                "category": _guess_category(user_input)}


def _guess_category(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ["麥當勞", "肯德基", "kfc", "burger", "速食"]):
        return "速食"
    if any(k in t for k in ["711", "全家", "萊爾富", "ok超商", "超商"]):
        return "超商"
    if any(k in t for k in ["蛋餅", "燒餅", "豆漿", "饅頭", "早餐"]):
        return "早餐店"
    if any(k in t for k in ["雞胸", "健康餐盒", "低卡", "減脂"]):
        return "健康餐盒"
    if any(k in t for k in ["鹹水雞", "滷味", "鹵"]):
        return "滷味/鹹水雞"
    if any(k in t for k in ["拉麵", "沾麵", "日式", "壽司", "定食"]):
        return "日式"
    if any(k in t for k in ["炒飯", "便當", "排骨", "雞腿飯"]):
        return "台式便當"
    return "其他"


def _guess_satiety(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ["飯", "麵", "便當", "炒飯", "水餃"]):
        return "很飽"
    if any(k in t for k in ["沙拉", "輕食", "優格"]):
        return "微飽"
    return "適中"


def _fat_loss_label(score: int, water_risk: str) -> str:
    if score >= 80:
        return "✅ 高蛋白低卡，減脂首選"
    if score >= 60:
        return "👍 尚可接受，注意份量"
    if score >= 40:
        return "⚠️ 熱量偏高，偶爾解饞可以"
    if water_risk == "HIGH":
        return "🚫 高鈉高油，建議少吃"
    return "❌ 減脂不友善，建議替換"


async def analyze_day(date: str, meals: list, profile: dict) -> dict:
    total_cal = sum(m.get("calories") or 0 for m in meals)
    total_prot = sum(m.get("protein_g") or 0 for m in meals)
    total_sodium = sum(m.get("sodium_mg") or 0 for m in meals)
    tdee = profile.get("tdee_calories", 1800)
    target_prot = profile.get("target_protein_g", 120)
    target_sodium = profile.get("target_sodium_mg", 2000)

    deficit = tdee - total_cal
    fat_loss_score = min(max(deficit / 500 * 40, 0), 40)
    prot_ratio = min(total_prot / target_prot, 1.0) if target_prot else 0
    fat_loss_score += prot_ratio * 25
    sodium_risk = "HIGH" if total_sodium > 3000 else ("MEDIUM" if total_sodium > target_sodium else "LOW")

    # Rule-based fallback (no API needed)
    rule_result = {
        "fat_loss_verdict": f"{'熱量赤字' if deficit > 0 else '超出熱量'} {abs(deficit):.0f}kcal，蛋白質達標率 {prot_ratio*100:.0f}%",
        "water_risk": sodium_risk,
        "water_risk_reason": f"今日鈉攝取 {total_sodium:.0f}mg / 目標 {target_sodium}mg",
        "improvements": [
            "增加蛋白質攝取（目標 " + str(int(target_prot)) + "g）" if prot_ratio < 0.8 else "蛋白質達標，繼續保持",
            "注意鈉攝取" if sodium_risk != "LOW" else "鈉攝取正常",
        ],
        "fat_loss_score": round(fat_loss_score + (15 if total_sodium < target_sodium else 0), 1),
        "calorie_deficit": round(deficit, 0),
        "rule_sodium_risk": sodium_risk,
    }

    if not _api_key_ok():
        rule_result["note"] = "API Key 未設定，使用規則計算"
        return rule_result

    meal_list = "\n".join(
        f"- {m.get('restaurant', '')}{m.get('meal_name', '')} "
        f"({m.get('calories', '?')}kcal, 蛋白{m.get('protein_g', '?')}g, "
        f"鈉{m.get('sodium_mg', '?')}mg)"
        for m in meals
    )

    prompt = (
        f"我的 {date} 飲食：\n{meal_list}\n\n"
        f"總計：{total_cal:.0f}/{tdee}kcal，蛋白{total_prot:.0f}/{target_prot}g，"
        f"鈉{total_sodium:.0f}/{target_sodium}mg，目標：{profile.get('goal','fat_loss')}\n\n"
        '只回傳 JSON：{"fat_loss_verdict":"一句話","water_risk":"LOW/MEDIUM/HIGH",'
        '"water_risk_reason":"原因","improvements":["建議1","建議2"]}'
    )

    try:
        client = _get_client()
        response = await asyncio.to_thread(
            client.messages.create,
            model=settings.claude_smart_model,
            max_tokens=500,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt}],
        )
        analysis = _extract_json_obj(response.content[0].text)
        analysis["fat_loss_score"] = rule_result["fat_loss_score"]
        analysis["calorie_deficit"] = rule_result["calorie_deficit"]
        analysis["rule_sodium_risk"] = sodium_risk
        return analysis
    except Exception:
        return rule_result


async def get_recommendations(today_meals: list, profile: dict, top_meals: list, recent_meals: list) -> list:
    total_cal = sum(m.get("calories") or 0 for m in today_meals)
    total_prot = sum(m.get("protein_g") or 0 for m in today_meals)
    tdee = profile.get("tdee_calories", 1800)
    target_prot = profile.get("target_protein_g", 120)
    remaining_cal = max(tdee - total_cal, 0)
    remaining_prot = max(target_prot - total_prot, 0)

    if not _api_key_ok() or not top_meals:
        return []

    top_str = "\n".join(
        f"- {m.get('restaurant','')} {m['meal_name']}（{m.get('rating','')}星）"
        for m in top_meals[:10]
    )
    recent_str = "\n".join(f"- {m['meal_name']}" for m in recent_meals[:5])

    prompt = (
        f"剩餘預算：{remaining_cal:.0f}kcal，還需蛋白質{remaining_prot:.0f}g\n"
        f"目標：{profile.get('goal','fat_loss')}\n\n"
        f"我的最愛：\n{top_str}\n\n最近已吃（避免重複）：\n{recent_str}\n\n"
        '回傳 JSON 陣列：[{"name":"餐點（含店家）","estimated_calories":數字,'
        '"estimated_protein_g":數字,"why":"原因一句話"}]'
    )

    try:
        client = _get_client()
        response = await asyncio.to_thread(
            client.messages.create,
            model=settings.claude_smart_model,
            max_tokens=600,
            temperature=0.5,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        match = re.search(r'\[.*\]', text, re.DOTALL)
        return json.loads(match.group()) if match else []
    except Exception:
        return []
