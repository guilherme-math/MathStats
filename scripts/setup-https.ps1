$ErrorActionPreference = "Stop"

Write-Host "MathStats - configuracao de HTTPS local confiavel" -ForegroundColor Cyan

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Host "mkcert nao foi encontrado." -ForegroundColor Yellow
    Write-Host "Instale pelo Windows Package Manager e rode este script novamente:" -ForegroundColor Yellow
    Write-Host "winget install --id FiloSottile.mkcert -e" -ForegroundColor White
    exit 1
}

Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

Write-Host "Instalando a autoridade certificadora local do mkcert..." -ForegroundColor Cyan
mkcert -install

Write-Host "Gerando key.pem e cert.pem confiaveis para localhost..." -ForegroundColor Cyan
mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1

Write-Host "Concluido. Reinicie o servidor MathStats e feche/abra novamente o Chrome." -ForegroundColor Green
Write-Host "Acesse: https://localhost:3443" -ForegroundColor Green