# OpSoul — Self-hosted Setup (Windows PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "OpSoul — Self-hosted Setup"
Write-Host "--------------------------"

# Check docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed. Install Docker Desktop from https://docker.com/products/docker-desktop"
    exit 1
}

# First run: copy template
if (-not (Test-Path ".env")) {
    Copy-Item ".env.template" ".env"
    Write-Host "Created .env — please fill in your API key and other settings, then run this script again."
    Start-Process notepad ".env"
    exit 0
}

# Load .env vars
Get-Content ".env" | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

# Check required vars
$hasAiKey = (
    ($env:OPENROUTER_API_KEY -and $env:OPENROUTER_API_KEY -ne "") -or
    ($env:ANTHROPIC_API_KEY -and $env:ANTHROPIC_API_KEY -ne "") -or
    ($env:OPENAI_API_KEY -and $env:OPENAI_API_KEY -ne "")
)

if (-not $hasAiKey) {
    Write-Host "Add at least one AI model API key to .env (OPENROUTER_API_KEY recommended), then run again."
    exit 1
}

if (-not $env:JWT_SECRET -or $env:JWT_SECRET -eq "") {
    Write-Host "JWT_SECRET is not set."
    Write-Host "Generate one by running in PowerShell:  -join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })"
    Write-Host "Then add it to .env and run again."
    exit 1
}

docker compose pull 2>$null
docker compose up -d --build

$port = if ($env:PORT) { $env:PORT } else { "3001" }
Write-Host ""
Write-Host "OpSoul is running at http://localhost:$port"
Write-Host "Open that URL in your browser to complete setup."
