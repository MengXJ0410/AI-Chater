param([string]$ComfyDir = "$PSScriptRoot/../../ComfyUI")
$ErrorActionPreference = "Stop"
if (-not (Test-Path $ComfyDir)) { git clone https://github.com/comfyanonymous/ComfyUI.git $ComfyDir }
Set-Location $ComfyDir
if (-not (Test-Path .venv)) { python -m venv .venv }
& .venv/Scripts/python.exe -m pip install --upgrade pip
& .venv/Scripts/python.exe -m pip install -r requirements.txt
Write-Host "Install Wan 2.1/2.2 checkpoints and export API-format workflows into the project data/comfyui-workflows directory."
Write-Host "Start with: .venv/Scripts/python.exe main.py --listen 127.0.0.1 --port 8188 --lowvram"
