# 啟動 Food Tracker
Set-Location $PSScriptRoot

# 建立 .env（若不存在）
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "已建立 .env，請填入 ANTHROPIC_API_KEY" -ForegroundColor Yellow
}

# 建立虛擬環境（若不存在）
if (-not (Test-Path ".venv")) {
    Write-Host "建立虛擬環境…" -ForegroundColor Cyan
    python -m venv .venv
}

# 啟動虛擬環境並安裝依賴
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt -q

# 啟動後端
Write-Host "啟動中：http://localhost:8000" -ForegroundColor Green
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
