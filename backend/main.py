import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .database import init_db
from .routers import meals, analysis, dashboard, import_data, profile

app = FastAPI(title="AI 美食評分 + 熱量管理", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meals.router)
app.include_router(analysis.router)
app.include_router(dashboard.router)
app.include_router(import_data.router)
app.include_router(profile.router)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.on_event("startup")
def startup():
    os.makedirs("data/imports", exist_ok=True)
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
