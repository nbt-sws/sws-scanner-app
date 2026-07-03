# preflight.ps1 — SwibSwap deployment preflight check
# ------------------------------------------------------------
# Run this BEFORE `vercel --prod` to catch missing keys, broken
# auth, mis-deployed rules, or dead external APIs.
#
# Compatible with:
#   - Windows PowerShell 5.1 (the one built into Windows — invoke as `powershell`)
#   - PowerShell 7+         (cross-platform Core — invoke as `pwsh`)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\preflight.ps1
#   pwsh ./preflight.ps1                               # if you have PS7
#   powershell .\preflight.ps1 -SkipNetwork            # offline checks only
#   powershell .\preflight.ps1 -ProdUrl 'https://...'  # alternate URL
#   powershell .\preflight.ps1 -Verbose                # list every api/ file
#
# Exit code: 0 if everything passes, 1 if any BLOCKER fails.
# WARN issues print yellow but don't change the exit code.
# ------------------------------------------------------------

[CmdletBinding()]
param(
    [switch]$SkipNetwork = $false,
    [string]$ProdUrl = 'https://boboa-v13.vercel.app',
    [switch]$VerboseList = $false
)

$ErrorActionPreference = 'Stop'
# IE-style automatic HTTPS-only check on Windows PowerShell — force TLS 1.2 so
# api.anthropic.com / vision.googleapis.com handshakes don't fail on older OSes.
# TLS 1.3 may be missing on older Windows PowerShell — TLS 1.2 alone is fine.
try {
    [Net.ServicePointManager]::SecurityProtocol = `
        [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
} catch {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    } catch {
        # Both fail-throughs are non-fatal — keep going.
    }
}

# ─── Globals + counters ─────────────────────────────────────
$script:Blockers = 0
$script:Warnings = 0
$script:Passes   = 0
$EnvLocal        = Join-Path $PSScriptRoot '.env.local'
$IsPS7           = $PSVersionTable.PSVersion.Major -ge 7

# ─── Output helpers ─────────────────────────────────────────
function Write-Ok($msg)   { Write-Host "  [OK]    " -ForegroundColor Green   -NoNewline; Write-Host $msg; $script:Passes++ }
function Write-Warn2($msg){ Write-Host "  [WARN]  " -ForegroundColor Yellow  -NoNewline; Write-Host $msg; $script:Warnings++ }
function Write-Block($msg){ Write-Host "  [BLOCK] " -ForegroundColor Red     -NoNewline; Write-Host $msg; $script:Blockers++ }
function Write-Info($msg) { Write-Host "  [INFO]  " -ForegroundColor Cyan    -NoNewline; Write-Host $msg }
function Write-Section($title) {
    Write-Host ""
    Write-Host ('=== ' + $title + ' ===') -ForegroundColor Magenta
}

# Cross-version HTTP wrapper. Returns @{ StatusCode = N; Body = '...' } and
# NEVER throws on 4xx/5xx. Both PS 5.1 and PS 7+ produce identical output.
function Invoke-Http {
    param(
        [string]$Url,
        [string]$Method = 'GET',
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [string]$ContentType = 'application/json',
        [int]$TimeoutSec = 12
    )
    try {
        $params = @{
            Uri             = $Url
            Method          = $Method
            Headers         = $Headers
            TimeoutSec      = $TimeoutSec
            UseBasicParsing = $true
            ErrorAction     = 'Stop'
        }
        if ($Body) {
            $params['Body']        = $Body
            $params['ContentType'] = $ContentType
        }
        $r = Invoke-WebRequest @params
        return @{ StatusCode = [int]$r.StatusCode; Body = [string]$r.Content; Error = $null }
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($null -ne $resp) {
            $code = 0
            try { $code = [int]$resp.StatusCode } catch {}
            $body = ''
            try {
                $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
                $body = $sr.ReadToEnd(); $sr.Close()
            } catch {}
            return @{ StatusCode = $code; Body = $body; Error = $_.Exception.Message }
        }
        return @{ StatusCode = 0; Body = ''; Error = $_.Exception.Message }
    } catch {
        # PS 7's Invoke-WebRequest throws HttpResponseException, not WebException.
        $resp = $null
        try { $resp = $_.Exception.Response } catch {}
        if ($null -ne $resp) {
            $code = 0
            try { $code = [int]$resp.StatusCode } catch {}
            $body = ''
            try {
                if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message }
            } catch {}
            return @{ StatusCode = $code; Body = $body; Error = $_.Exception.Message }
        }
        return @{ StatusCode = 0; Body = ''; Error = $_.Exception.Message }
    }
}

# ─── Read .env.local into a hashtable ──────────────────────
# Hardened against:
#   - UTF-8 BOM on the first line (PS 5.1's Get-Content keeps it as a
#     character on the first key name, breaking exact-match lookups)
#   - Stray non-printable characters in key names
#   - bash-style `export KEY=value` prefixes from some env-pull tools
#   - quoted values with either single or double quotes
function Get-DotEnv($path) {
    # Plain Hashtable on purpose — PowerShell 5.1 Hashtables are
    # case-insensitive by default (uses the case-INsensitive String comparer).
    # OrderedDictionary defaults to case-sensitive ordinal compare, which
    # caused 11 false-negative lookups even when the keys printed identically
    # in the diagnostic output. Hashtable + .ContainsKey() is the boring
    # reliable choice here; we trade away insertion-order tracking (not
    # needed for our lookups) for matching predictability.
    $kv = @{}
    if (-not (Test-Path $path)) { return $kv }
    # ReadAllText with explicit UTF8 encoding strips the BOM when present.
    $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    # Belt-and-suspenders: drop any leading BOM character.
    if ($raw.Length -gt 0 -and [int]$raw[0] -eq 0xFEFF) {
        $raw = $raw.Substring(1)
    }
    foreach ($line in ($raw -split "\r?\n")) {
        $t = $line.Trim()
        if ($t -eq '' -or $t.StartsWith('#')) { continue }
        # Strip optional `export ` prefix (some env-pull tools use it).
        if ($t -match '^export\s+(.+)$') { $t = $Matches[1].Trim() }
        $idx = $t.IndexOf('=')
        if ($idx -lt 1) { continue }
        # Strip non-ASCII / non-printable chars from the key name so a stray
        # BOM / zero-width space can't make `ANTHROPIC_API_KEY` not equal
        # `ANTHROPIC_API_KEY` on lookup.
        $key = ($t.Substring(0, $idx).Trim() -replace '[^\x20-\x7E]', '').Trim()
        $val = $t.Substring($idx + 1).Trim()
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or
            ($val.StartsWith("'") -and $val.EndsWith("'"))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        if ($key.Length -gt 0) { $kv[$key] = $val }
    }
    return $kv
}

# ─── Required env-var catalog ──────────────────────────────
$RequiredVars = @(
    @{ Name = 'ANTHROPIC_API_KEY';                       Required = $true;  Description = 'Claude Haiku card recognition' }
    @{ Name = 'GOOGLE_VISION_API_KEY';                   Required = $true;  Description = 'Vision reverse-image + DON ranking' }
    @{ Name = 'EBAY_APP_ID';                             Required = $true;  Description = 'eBay Browse + Finding API auth' }
    @{ Name = 'EBAY_CERT_ID';                            Required = $true;  Description = 'eBay Browse API OAuth client secret' }
    @{ Name = 'FIREBASE_SERVICE_ACCOUNT_B64';            Required = $true;  Description = 'Firebase Admin SDK (server-side)' }
    @{ Name = 'REACT_APP_FIREBASE_API_KEY';              Required = $true;  Description = 'Firebase client SDK (public)' }
    @{ Name = 'REACT_APP_FIREBASE_AUTH_DOMAIN';          Required = $true;  Description = 'Firebase Auth domain' }
    @{ Name = 'REACT_APP_FIREBASE_PROJECT_ID';           Required = $true;  Description = 'Firebase project ID' }
    @{ Name = 'REACT_APP_FIREBASE_STORAGE_BUCKET';       Required = $true;  Description = 'Firebase Storage bucket' }
    @{ Name = 'REACT_APP_FIREBASE_MESSAGING_SENDER_ID';  Required = $true;  Description = 'Firebase messaging sender ID' }
    @{ Name = 'REACT_APP_FIREBASE_APP_ID';               Required = $true;  Description = 'Firebase web-app ID' }
    @{ Name = 'CRON_SECRET';                             Required = $true;  Description = 'Auction tick cron auth (B1) — random 32+ byte secret' }
)

Write-Host ""
Write-Host "SwibSwap Preflight" -ForegroundColor Magenta
Write-Host ("PowerShell {0}.{1} · project: {2}" -f `
    $PSVersionTable.PSVersion.Major, $PSVersionTable.PSVersion.Minor, $PSScriptRoot) -ForegroundColor DarkGray

# ─── 1. Local file presence ────────────────────────────────
Write-Section 'Local files'

$projectFiles = @(
    @{ Path = '.env.local';        Block = $true;  Note = 'Local env vars for dev + vercel pull' }
    @{ Path = 'firestore.rules';   Block = $true;  Note = 'Firestore security rules' }
    @{ Path = 'storage.rules';     Block = $true;  Note = 'Storage security rules' }
    @{ Path = 'firebase.json';     Block = $true;  Note = 'Firebase CLI config' }
    @{ Path = 'package.json';      Block = $true;  Note = 'Node project manifest' }
    @{ Path = 'vercel.json';       Block = $false; Note = 'Vercel routing (optional)' }
)
foreach ($f in $projectFiles) {
    $full = Join-Path $PSScriptRoot $f.Path
    if (Test-Path $full) {
        Write-Ok "$($f.Path) found"
    } elseif ($f.Block) {
        Write-Block "$($f.Path) MISSING - $($f.Note)"
    } else {
        Write-Warn2 "$($f.Path) missing - $($f.Note)"
    }
}

# ─── 2. .env.local contents ────────────────────────────────
Write-Section '.env.local contents'

$envMap = Get-DotEnv $EnvLocal
if ($envMap.Count -eq 0) {
    Write-Block "No keys parsed from .env.local - file empty or unreadable?"
} else {
    Write-Info "$($envMap.Count) keys parsed from .env.local"
    foreach ($v in $RequiredVars) {
        $present = $envMap.ContainsKey($v.Name)
        $val     = if ($present) { $envMap[$v.Name] } else { $null }
        $valLen  = if ($val) { $val.Length } else { 0 }

        if ($present -and $valLen -gt 0) {
            if ($valLen -gt 14) {
                $masked = $val.Substring(0, 6) + '...' + $val.Substring($valLen - 4)
            } else {
                $masked = '***'
            }
            Write-Ok "$($v.Name) set ($masked, len=$valLen)"
        } elseif ($present -and $valLen -eq 0) {
            # Key exists in the file but its value is empty — this is what
            # happens when Vercel's stored env var is blank, or when a manual
            # edit left `KEY=` with nothing after the equals sign.
            Write-Block "$($v.Name) PRESENT BUT EMPTY - $($v.Description)"
        } elseif ($v.Required) {
            Write-Block "$($v.Name) NOT IN FILE - $($v.Description)"
        } else {
            Write-Warn2 "$($v.Name) not in file - $($v.Description)"
        }
    }
    # If anything was missing or empty, dump the full sorted key list so we
    # can see exactly what IS in the file. Values stay hidden.
    $missing = $RequiredVars | Where-Object {
        $n = $_.Name
        -not $envMap.ContainsKey($n) -or -not $envMap[$n] -or $envMap[$n].Length -eq 0
    }
    if ($missing) {
        $allKeys = @($envMap.Keys) | Sort-Object
        Write-Info "All parsed key names (sorted): $($allKeys -join ', ')"
    }
}

# ─── 3. Firebase service account decodes + parses ──────────
Write-Section 'Firebase Admin SDK service account'

if ($envMap.ContainsKey('FIREBASE_SERVICE_ACCOUNT_B64') -and $envMap['FIREBASE_SERVICE_ACCOUNT_B64'].Length -gt 100) {
    try {
        $bytes = [Convert]::FromBase64String($envMap['FIREBASE_SERVICE_ACCOUNT_B64'])
        $json  = [System.Text.Encoding]::UTF8.GetString($bytes)
        $sa    = $json | ConvertFrom-Json
        if ($sa.type -ne 'service_account') {
            Write-Block "Service account JSON 'type' field is '$($sa.type)' (expected 'service_account')"
        } else {
            Write-Ok "Service account decoded - project_id: $($sa.project_id), client_email: $($sa.client_email)"
            if ($envMap.ContainsKey('REACT_APP_FIREBASE_PROJECT_ID')) {
                if ($sa.project_id -eq $envMap['REACT_APP_FIREBASE_PROJECT_ID']) {
                    Write-Ok "Project ID matches client SDK + admin SDK ($($sa.project_id))"
                } else {
                    Write-Block "Project ID MISMATCH: client='$($envMap['REACT_APP_FIREBASE_PROJECT_ID'])' vs admin='$($sa.project_id)'"
                }
            }
        }
    } catch {
        Write-Block "Service account base64 decode failed: $($_.Exception.Message)"
    }
} else {
    Write-Block "FIREBASE_SERVICE_ACCOUNT_B64 missing - server-side Firestore + Storage writes will fail"
}

# ─── 4. Firebase rules sanity check ────────────────────────
Write-Section 'Firebase security rules'

$rulesChecks = @(
    @{ File = 'firestore.rules'; Needle = '/verified_cards'; Note = 'community-DB rules present' }
    @{ File = 'firestore.rules'; Needle = '/vault';          Note = 'vault rules present' }
    @{ File = 'firestore.rules'; Needle = '/users';          Note = 'user-doc rules present' }
    @{ File = 'firestore.rules'; Needle = '/scans';          Note = 'scan-cache rules present' }
    @{ File = 'firestore.rules'; Needle = '/transactions';   Note = 'transactions rules present' }
    @{ File = 'storage.rules';   Needle = '/cards';          Note = 'card-photo storage rules present' }
    @{ File = 'storage.rules';   Needle = '/verified_cards'; Note = 'verified-cards storage rules present' }
)
foreach ($r in $rulesChecks) {
    $p = Join-Path $PSScriptRoot $r.File
    if (Test-Path $p) {
        $contents = Get-Content -LiteralPath $p -Raw
        if ($contents -match [regex]::Escape($r.Needle)) {
            Write-Ok "$($r.File): $($r.Note)"
        } else {
            Write-Warn2 "$($r.File) does not reference '$($r.Needle)' - $($r.Note)"
        }
    }
}

Write-Info "Reminder: run 'firebase deploy --only firestore:rules,storage' if you edited rules locally"

# ─── 5. Vercel routes — Pro plan, soft warning only ──────────
Write-Section 'Vercel route budget'

$apiDir = Join-Path $PSScriptRoot 'api'
if (Test-Path $apiDir) {
    $allJs = Get-ChildItem -LiteralPath $apiDir -Filter *.js | Where-Object { -not $_.PSIsContainer }
    $routes  = $allJs | Where-Object { -not $_.Name.StartsWith('_') }
    $helpers = $allJs | Where-Object {       $_.Name.StartsWith('_') }
    Write-Info "api/ has $($allJs.Count) .js files: $($routes.Count) public routes + $($helpers.Count) private helpers"
    # On Vercel Pro the 12-function Hobby cap is gone — Pro allows up to 1000
    # serverless functions per deployment. The previous BLOCK check is
    # downgraded to an informational ceiling-watch at 100 so we still notice
    # if we accidentally explode the function count from a bad include.
    if ($routes.Count -le 100) {
        Write-Ok "Public routes ($($routes.Count)) within healthy range (Pro plan ceiling ~1000)"
    } else {
        Write-Warn2 "Public routes ($($routes.Count)) over 100 - large deploy footprint, consider consolidating"
    }
    if ($VerboseList) {
        $routes  | ForEach-Object { Write-Info "  route:  $($_.Name)" }
        $helpers | ForEach-Object { Write-Info "  helper: $($_.Name)" }
    }
} else {
    Write-Block "api/ directory missing"
}

# ─── 6. External API smoke tests (skip if -SkipNetwork) ────
if (-not $SkipNetwork) {
    Write-Section 'External API smoke tests'

    # Anthropic — minimal /v1/models call
    if ($envMap['ANTHROPIC_API_KEY']) {
        $h = @{ 'x-api-key' = $envMap['ANTHROPIC_API_KEY']; 'anthropic-version' = '2023-06-01' }
        $r = Invoke-Http -Url 'https://api.anthropic.com/v1/models' -Method GET -Headers $h -TimeoutSec 10
        if ($r.StatusCode -eq 200) {
            Write-Ok "Anthropic API key valid (HTTP 200)"
        } elseif ($r.StatusCode -eq 401) {
            Write-Block "Anthropic API key REJECTED (HTTP 401 - invalid or expired)"
        } elseif ($r.StatusCode -eq 0) {
            Write-Warn2 "Anthropic unreachable: $($r.Error)"
        } else {
            Write-Warn2 "Anthropic returned HTTP $($r.StatusCode)"
        }
    }

    # Google Vision — 1x1 red pixel test image
    if ($envMap['GOOGLE_VISION_API_KEY']) {
        $tinyPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
        $body = @{
            requests = @(@{
                image    = @{ content = $tinyPixel }
                features = @(@{ type = 'LABEL_DETECTION'; maxResults = 1 })
            })
        } | ConvertTo-Json -Depth 10 -Compress
        $url = 'https://vision.googleapis.com/v1/images:annotate?key=' + [uri]::EscapeDataString($envMap['GOOGLE_VISION_API_KEY'])
        $r = Invoke-Http -Url $url -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 10
        if ($r.StatusCode -eq 200) {
            Write-Ok "Google Vision API key valid (HTTP 200)"
        } elseif ($r.StatusCode -eq 403) {
            Write-Block "Vision API key REJECTED or Vision API not enabled (HTTP 403)"
        } elseif ($r.StatusCode -eq 0) {
            Write-Warn2 "Vision unreachable: $($r.Error)"
        } else {
            Write-Warn2 "Vision returned HTTP $($r.StatusCode)"
        }
    }

    # eBay — OAuth token request (client_credentials grant)
    if ($envMap['EBAY_APP_ID'] -and $envMap['EBAY_CERT_ID']) {
        $creds = "$($envMap['EBAY_APP_ID']):$($envMap['EBAY_CERT_ID'])"
        $b64   = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($creds))
        $r = Invoke-Http `
            -Url 'https://api.ebay.com/identity/v1/oauth2/token' `
            -Method POST `
            -Headers @{ Authorization = "Basic $b64" } `
            -Body 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope' `
            -ContentType 'application/x-www-form-urlencoded' `
            -TimeoutSec 10
        if ($r.StatusCode -eq 200) {
            try {
                $tok = $r.Body | ConvertFrom-Json
                Write-Ok "eBay OAuth issued ($($tok.expires_in)s lifetime) - App ID + Cert ID valid"
            } catch {
                Write-Ok "eBay OAuth HTTP 200 - keys valid"
            }
        } elseif ($r.StatusCode -eq 401) {
            Write-Block "eBay OAuth REJECTED (HTTP 401 - App ID or Cert ID wrong)"
        } elseif ($r.StatusCode -eq 0) {
            Write-Warn2 "eBay unreachable: $($r.Error)"
        } else {
            $preview = $r.Body
            if ($preview.Length -gt 120) { $preview = $preview.Substring(0, 120) }
            Write-Warn2 "eBay OAuth returned HTTP $($r.StatusCode): $preview"
        }
    }

    # Frankfurter FX (free, no auth) - sanity check
    $r = Invoke-Http -Url 'https://api.frankfurter.app/latest?from=THB&to=USD' -TimeoutSec 8
    if ($r.StatusCode -eq 200) { Write-Ok 'Frankfurter FX reachable' }
    elseif ($r.StatusCode -eq 0) { Write-Warn2 "Frankfurter unreachable - /api/fx will fall back to DEFAULT_FX" }
    else                       { Write-Warn2 "Frankfurter HTTP $($r.StatusCode)" }
}

# ─── 7. Vercel env var presence (parses `vercel env ls`) ───
Write-Section 'Vercel env vars (production)'

$vercelOk = $true
$vercelOut = ''

# First, locate `vercel` on PATH without invoking it (Get-Command returns
# $null instead of throwing, which is friendlier than try/catch around &).
$vercelCmd = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelCmd) {
    Write-Warn2 "Vercel CLI not on PATH. Install with 'npm i -g vercel' to enable this check."
    $vercelOk = $false
} else {
    # Wrap the actual invocation with $ErrorActionPreference=Continue so any
    # stderr noise from `vercel env ls` doesn't get promoted to a terminating
    # error by the script's global 'Stop' policy.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $vercelOut = (& vercel env ls production 2>&1 | Out-String)
        if ($LASTEXITCODE -ne 0) {
            Write-Warn2 "vercel env ls returned exit $LASTEXITCODE. Project may not be linked - run 'vercel link'."
            $vercelOk = $false
        }
    } catch {
        Write-Warn2 "vercel env ls failed: $($_.Exception.Message)"
        $vercelOk = $false
    } finally {
        $ErrorActionPreference = $prevEAP
    }
}

if ($vercelOk) {
    foreach ($v in $RequiredVars) {
        $needle = "(?m)^\s*$([regex]::Escape($v.Name))\s"
        if ($vercelOut -match $needle) {
            Write-Ok "Vercel prod has $($v.Name)"
        } elseif ($v.Required) {
            Write-Block "Vercel prod MISSING $($v.Name) - push with 'vercel env add $($v.Name) production'"
        } else {
            Write-Warn2 "Vercel prod missing $($v.Name)"
        }
    }
}

# ─── 8. Live deployment health check ───────────────────────
if (-not $SkipNetwork) {
    Write-Section "Live deploy health ($ProdUrl)"

    $endpoints = @(
        @{ Path = '/';                                              Desc = 'Web app HTML' }
        @{ Path = '/api/fx';                                        Desc = '/api/fx (FX rates proxy)' }
        @{ Path = '/api/op-variants?code=OP01-001&lightweight=1';   Desc = '/api/op-variants lightweight' }
    )
    foreach ($e in $endpoints) {
        $r = Invoke-Http -Url "$ProdUrl$($e.Path)" -TimeoutSec 12
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) {
            Write-Ok "$($e.Desc) -> HTTP $($r.StatusCode)"
        } elseif ($r.StatusCode -eq 401) {
            Write-Warn2 "$($e.Desc) -> HTTP 401 - Vercel deployment protection enabled? Disable for public preview or use the canonical URL."
        } elseif ($r.StatusCode -eq 0) {
            Write-Warn2 "$($e.Desc) unreachable: $($r.Error)"
        } else {
            Write-Warn2 "$($e.Desc) -> HTTP $($r.StatusCode)"
        }
    }
}

# ─── Summary + exit code ───────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  PREFLIGHT SUMMARY" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  Passed:    $script:Passes"  -ForegroundColor Green
Write-Host "  Warnings:  $script:Warnings" -ForegroundColor Yellow
Write-Host "  Blockers:  $script:Blockers" -ForegroundColor Red
Write-Host ""

if ($script:Blockers -gt 0) {
    Write-Host "  STOP - fix blockers before running 'vercel --prod'." -ForegroundColor Red
    Write-Host ""
    exit 1
} elseif ($script:Warnings -gt 0) {
    Write-Host "  Safe to deploy, but review warnings above first." -ForegroundColor Yellow
    Write-Host "  Next: vercel --prod" -ForegroundColor Cyan
    Write-Host ""
    exit 0
} else {
    Write-Host "  All systems green. Ship it." -ForegroundColor Green
    Write-Host "  Next: vercel --prod" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}
