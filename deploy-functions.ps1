param(
    [string]$FunctionName = ""
)

# Paths relative to Vulnerix/ folder (where this script lives)
$SOURCE = "supabase\functions"
$TARGET = "..\Supabase\docker\volumes\functions"
$CONTAINER = "supabase-edge-functions"

$ALL_FUNCTIONS = @("cve-engine", "delete-user", "send-email", "splunk-advisories")

if ($FunctionName -ne "") {
    if (-not ($ALL_FUNCTIONS -contains $FunctionName)) {
        Write-Host "[ERROR] Unknown function '$FunctionName'. Available: $($ALL_FUNCTIONS -join ', ')" -ForegroundColor Red
        exit 1
    }
    $toDeploy = @($FunctionName)
} else {
    $toDeploy = $ALL_FUNCTIONS
}

Write-Host "Deploying $($toDeploy.Count) function(s)..." -ForegroundColor Cyan

foreach ($fn in $toDeploy) {
    $src = "$SOURCE\$fn"
    $dst = "$TARGET\$fn"

    if (-not (Test-Path $src)) {
        Write-Host "  [SKIP] $fn - source not found at $src" -ForegroundColor Yellow
        continue
    }

    if (-not (Test-Path $dst)) {
        New-Item -ItemType Directory -Path $dst | Out-Null
    }

    Copy-Item -Recurse -Force "$src\*" "$dst\"
    Write-Host "  [OK] $fn" -ForegroundColor Green
}

Write-Host "Restarting $CONTAINER..." -ForegroundColor Cyan
docker restart $CONTAINER

if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. Functions are live." -ForegroundColor Green
} else {
    Write-Host "Failed to restart container." -ForegroundColor Red
    exit 1
}
