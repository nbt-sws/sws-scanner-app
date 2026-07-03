# scripts/push-env-to-vercel.ps1
# Reads .env.local and uploads every KEY=VALUE pair to the linked Vercel project
# across Production, Preview, and Development environments.
#
# Run from project root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\push-env-to-vercel.ps1

$ErrorActionPreference = "Stop"

$envFile = ".\.env.local"
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: $envFile not found. Run from project root." -ForegroundColor Red
    exit 1
}

# Check vercel CLI is available
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'vercel' CLI not found. Install: npm install -g vercel" -ForegroundColor Red
    exit 1
}

Write-Host "`nReading $envFile..." -ForegroundColor Cyan

$lines = Get-Content $envFile
$pairs = @()
foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
    if ($trimmed -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
        $pairs += @{ Name = $matches[1]; Value = $matches[2] }
    }
}

Write-Host "Found $($pairs.Count) variables. Uploading to Vercel..." -ForegroundColor Cyan

foreach ($p in $pairs) {
    foreach ($envTarget in @("production", "preview", "development")) {
        Write-Host "  + $($p.Name) [$envTarget]" -ForegroundColor DarkGray
        # `vercel env rm` first (silently) so we can overwrite without conflict
        $null = & vercel env rm $p.Name $envTarget --yes 2>$null
        # `vercel env add` reads the value from stdin
        $p.Value | & vercel env add $p.Name $envTarget 2>$null | Out-Null
    }
}

Write-Host "`nDone. Verify at https://vercel.com → your project → Settings → Environment Variables.`n" -ForegroundColor Green
