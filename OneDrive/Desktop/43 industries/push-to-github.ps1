# Push 43 Industries to https://github.com/43industries/43_INDUSTRIES
# Run in PowerShell: right-click this folder -> Open in Terminal, then: .\push-to-github.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Setting up Git and pushing to GitHub..." -ForegroundColor Cyan

if (-not (Test-Path .git)) {
    git init
    git branch -M main
}

git add index.html vercel.json .gitignore
git commit -m "Initial commit: 43 Industries website and Vercel config"
git remote add origin https://github.com/43industries/43_INDUSTRIES.git 2>$null
if ($LASTEXITCODE -ne 0) { git remote set-url origin https://github.com/43industries/43_INDUSTRIES.git }
git push -u origin main

Write-Host "`nDone! Repo: https://github.com/43industries/43_INDUSTRIES" -ForegroundColor Green
