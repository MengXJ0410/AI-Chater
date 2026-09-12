param(
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$integrationRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeRoot = Join-Path $projectRoot ".runtime\airi"
$versionFile = Join-Path $integrationRoot "VERSION"
$versionLines = Get-Content $versionFile
$version = (($versionLines | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith("#") } | Select-Object -First 1).Trim())
$commitLine = $versionLines | Where-Object { $_ -match "^\s*commit=" } | Select-Object -First 1
$commit = if ($commitLine) { ($commitLine -replace "^\s*commit=", "").Trim() } else { "" }

if (-not $version -or -not ($commit -match "^[0-9a-fA-F]{40}$")) {
  throw "integrations/airi/VERSION must declare a release tag followed by commit=<40-character SHA>."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is required to prepare AIRI." }
if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) { throw "Corepack is required to run AIRI with its pinned pnpm version." }

$listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listeners) {
  $owners = $listeners | ForEach-Object {
    $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($process) { "$($process.ProcessName) (PID $($process.Id))" } else { "PID $($_.OwningProcess)" }
  } | Select-Object -Unique
  throw "Port $Port is already in use by $($owners -join ', '). Stop that process or start AIRI with a different -Port value."
}

New-Item -ItemType Directory -Force (Split-Path $runtimeRoot) | Out-Null
if (-not (Test-Path (Join-Path $runtimeRoot ".git"))) {
  if (Test-Path $runtimeRoot) { throw "$runtimeRoot exists but is not an AIRI Git checkout. Move it aside before running this script." }
  git clone --filter=blob:none --no-checkout https://github.com/moeru-ai/airi.git $runtimeRoot
  if ($LASTEXITCODE -ne 0) { throw "Unable to clone the AIRI runtime repository." }
}

Push-Location $runtimeRoot
$previousNodeOptions = $env:NODE_OPTIONS
$previousElectronSkip = $env:ELECTRON_SKIP_BINARY_DOWNLOAD
try {
  git fetch --depth 1 origin $commit
  if ($LASTEXITCODE -ne 0) { throw "Unable to fetch pinned AIRI commit $commit." }
  $expectedCommit = (git rev-parse "${commit}^{commit}").Trim()
  if (-not ($expectedCommit -match "^[0-9a-f]{40}$")) { throw "Unable to resolve pinned AIRI commit $commit." }
  # .runtime/airi is script-managed. Reapply the tracked integration patch after switching revisions.
  git checkout --detach --force $expectedCommit
  if ($LASTEXITCODE -ne 0) { throw "Unable to checkout pinned AIRI commit $expectedCommit." }
  $actualCommit = (git rev-parse HEAD).Trim()
  if ($actualCommit -ne $expectedCommit.ToLowerInvariant()) { throw "AIRI checkout mismatch: expected $expectedCommit, got $actualCommit." }

  # v0.11.3 already ships the MediaPipe export-map change. Remove only its stale patch metadata.
  $mediaPatchHash = "2014bd232d13f4bfac27f27d61105894bf54aca350379b2816fe05b6d3e27d66"
  $workspaceFile = Join-Path $runtimeRoot "pnpm-workspace.yaml"
  $workspace = Get-Content -Raw $workspaceFile
  $workspacePattern = "(?m)^  '@mediapipe/tasks-vision': patches/@mediapipe__tasks-vision\.patch\r?\n"
  if ([regex]::Matches($workspace, $workspacePattern).Count -gt 1) { throw "AIRI workspace contains multiple MediaPipe patch declarations." }
  $workspace = [regex]::Replace($workspace, $workspacePattern, "", 1)
  Set-Content -Encoding UTF8 $workspaceFile $workspace

  $lockFile = Join-Path $runtimeRoot "pnpm-lock.yaml"
  $lock = Get-Content -Raw $lockFile
  $lockBefore = $lock
  $lock = $lock.Replace("  '@mediapipe/tasks-vision':`r`n    hash: $mediaPatchHash`r`n    path: patches/@mediapipe__tasks-vision.patch`r`n", "")
  $lock = $lock.Replace("  '@mediapipe/tasks-vision':`n    hash: $mediaPatchHash`n    path: patches/@mediapipe__tasks-vision.patch`n", "")
  $lock = $lock.Replace("0.10.34(patch_hash=$mediaPatchHash)", "0.10.34")
  $lock = $lock.Replace("'@mediapipe/tasks-vision@0.10.34(patch_hash=$mediaPatchHash)'", "'@mediapipe/tasks-vision@0.10.34'")
  if ($lock -eq $lockBefore -and $lock.Contains("patch_hash=$mediaPatchHash")) { throw "AIRI lockfile MediaPipe metadata did not match the reviewed compatibility update." }
  Set-Content -Encoding UTF8 $lockFile $lock

  $pnpmVersion = (& corepack pnpm --version).Trim()
  if ($pnpmVersion -ne "10.33.0") { throw "AIRI requires pnpm 10.33.0, but Corepack resolved $pnpmVersion. Check the packageManager field in the pinned AIRI checkout." }

  if ($env:NODE_OPTIONS -notmatch "(?:^|\s)--use-system-ca(?:\s|$)") {
    $env:NODE_OPTIONS = "$($env:NODE_OPTIONS) --use-system-ca".Trim()
  }
  # Stage Web does not execute AIRI's desktop Electron bundle during local development.
  $env:ELECTRON_SKIP_BINARY_DOWNLOAD = "1"

  $bridgeTarget = Join-Path $runtimeRoot "apps\stage-web\src\integrations\companion-bridge.ts"
  New-Item -ItemType Directory -Force (Split-Path $bridgeTarget) | Out-Null
  Copy-Item (Join-Path $integrationRoot "bridge\companion-bridge.ts") $bridgeTarget -Force

  $mainFile = Join-Path $runtimeRoot "apps\stage-web\src\main.ts"
  $main = Get-Content -Raw $mainFile
  if ($main -notmatch "integrations/companion-bridge") {
    $main = $main.Replace("import App from './App.vue'", "import App from './App.vue'`nimport './integrations/companion-bridge'")
    Set-Content -Encoding UTF8 $mainFile $main
  }

  # Stage Web is browser-only; native desktop postinstall scripts are not required to render Live2D.
  & corepack pnpm install --ignore-scripts --frozen-lockfile --filter "@proj-airi/stage-web..."
  if ($LASTEXITCODE -ne 0) {
    throw "AIRI Stage Web dependency installation failed. Do not use --ignore-patches; review the pinned pnpm version and the upstream patch failure first."
  }
  & corepack pnpm --filter @proj-airi/stage-web dev -- --port $Port
  if ($LASTEXITCODE -ne 0) { throw "AIRI Stage Web stopped unexpectedly." }
} finally {
  if ($null -eq $previousNodeOptions) { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue } else { $env:NODE_OPTIONS = $previousNodeOptions }
  if ($null -eq $previousElectronSkip) { Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue } else { $env:ELECTRON_SKIP_BINARY_DOWNLOAD = $previousElectronSkip }
  Pop-Location
}
