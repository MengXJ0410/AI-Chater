# MiniMax-H3 部署日志

> 本日志记录 MiniMax-H3 在 Windows ComfyUI portable 环境中的下载、部署和项目接入进度。
>
> 最后更新：2026-08-29（Asia/Shanghai）

## 1. 环境信息

- ComfyUI portable 路径：`D:\ComfyUI\ComfyUI_windows_portable`
- ComfyUI 模型根目录：`D:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models`
- 项目路径：`D:\funtools\ai-chater\AI-Chater`
- ModelScope 仓库：<https://modelscope.cn/models/Comfy-Org/MiniMax-H3>
- ModelScope CLI：`1.35.1`
- 下载工具：`modelscope.exe`、`hf.exe`、`curl.exe`、`wget.exe`、`git.exe`
- GPU/显存：尚未完成硬件探测；计划按 12–16GB 显存低显存模式使用。
- 最新磁盘检查：D 盘剩余约 `118.7 GB`。

## 2. 目标模型清单

| ModelScope 路径 | ComfyUI 目标目录 | 预期大小 | SHA256 | 最新状态 |
|---|---|---:|---|---|
| `diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors` | `models/diffusion_models/` | 20,970,379,616 bytes | `e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a` | 未检测到完整文件 |
| `diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `models/diffusion_models/` | 20,970,379,616 bytes | `9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779` | 未检测到完整文件 |
| `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | `models/text_encoders/` | 15,687,142,551 bytes | `35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6` | 未检测到完整文件 |
| `vae/minimax_h3_audio_vae_fp32.safetensors` | `models/vae/` | 605,254,808 bytes | `8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48` | 曾下载，需重下/复核 |
| `vae/minimax_h3_video_vae_fp16.safetensors` | `models/vae/` | 5,207,808,496 bytes | `7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522` | 下载中断，需断点续传 |

总下载量约 63.44 GB（约 59.1 GiB）。

## 3. 已完成的检查

- portable 版 ComfyUI 目录存在。
- `models/diffusion_models`、`models/text_encoders`、`models/vae` 目录存在。
- ModelScope CLI 可启动，版本为 `1.35.1`。
- ModelScope 仓库 API 可访问，五个文件路径、大小和 SHA256 已确认。
- 仓库提供 MiniMax-H3 的 ComfyUI T2V、I2V、R2V workflow。
- 最新扫描显示五个目标文件均未作为完整模型落盘。
- 当前没有任何文件可以标记为“已通过最终 SHA256 校验”。

## 4. 下载过程时间线

### 4.1 ModelScope CLI

尝试使用 `modelscope.exe download` 下载 diffusion model。CLI 创建了临时目录，但临时文件长时间保持 0 字节；进程没有有效字节增长，随后停止。该次尝试不计为成功下载。

### 4.2 curl 音频 VAE

音频 VAE 的官方 `resolve/master` URL 曾成功传输约 577 MiB，但最新扫描未检测到完整目标文件，因此需要重新下载或复核。

### 4.3 curl 视频 VAE

视频 VAE 下载曾增长到约 4.25 GB，随后远端连接重置，文件未完成；后续任务被中断。应使用 `curl -C -` 断点续传。

## 5. 推荐下载命令

下载前关闭 ComfyUI，逐个文件执行以下命令：

```powershell
$root = "D:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models"

curl.exe -L --fail --retry 20 --retry-all-errors --retry-delay 3 -C - -o "$root\diffusion_models\minimax_h3_fl2va_pruned_int8_convrot.safetensors" "https://modelscope.cn/models/Comfy-Org/MiniMax-H3/resolve/master/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors"
curl.exe -L --fail --retry 20 --retry-all-errors --retry-delay 3 -C - -o "$root\diffusion_models\minimax_h3_ref2va_pruned_int8_convrot.safetensors" "https://modelscope.cn/models/Comfy-Org/MiniMax-H3/resolve/master/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors"
curl.exe -L --fail --retry 20 --retry-all-errors --retry-delay 3 -C - -o "$root\text_encoders\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors" "https://modelscope.cn/models/Comfy-Org/MiniMax-H3/resolve/master/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
curl.exe -L --fail --retry 20 --retry-all-errors --retry-delay 3 -C - -o "$root\vae\minimax_h3_audio_vae_fp32.safetensors" "https://modelscope.cn/models/Comfy-Org/MiniMax-H3/resolve/master/vae/minimax_h3_audio_vae_fp32.safetensors"
curl.exe -L --fail --retry 20 --retry-all-errors --retry-delay 3 -C - -o "$root\vae\minimax_h3_video_vae_fp16.safetensors" "https://modelscope.cn/models/Comfy-Org/MiniMax-H3/resolve/master/vae/minimax_h3_video_vae_fp16.safetensors"
```

`-C -` 用于断点续传；下载过程不应将临时文件移动为正式模型。

## 6. SHA256 校验

```powershell
$root = "D:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models"
Get-FileHash "$root\diffusion_models\minimax_h3_fl2va_pruned_int8_convrot.safetensors" -Algorithm SHA256
Get-FileHash "$root\diffusion_models\minimax_h3_ref2va_pruned_int8_convrot.safetensors" -Algorithm SHA256
Get-FileHash "$root\text_encoders\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors" -Algorithm SHA256
Get-FileHash "$root\vae\minimax_h3_audio_vae_fp32.safetensors" -Algorithm SHA256
Get-FileHash "$root\vae\minimax_h3_video_vae_fp16.safetensors" -Algorithm SHA256
```

文件大小必须与清单一致，SHA256 必须完全匹配；不匹配时删除对应文件后重新下载。

## 7. ComfyUI 启动与工作流验证

模型全部校验通过后执行：

```powershell
Set-Location D:\ComfyUI\ComfyUI_windows_portable
.\run_nvidia_gpu.bat
```

低显存手动启动：

```powershell
.\python_embeded\python.exe .\ComfyUI\main.py --listen 127.0.0.1 --port 8188 --lowvram
```

访问 <http://127.0.0.1:8188>，依次导入并验证：

1. `video_minimax_h3_t2v.json`：文生视频。
2. `video_minimax_h3_i2v.json`：图生视频。
3. `video_minimax_h3_r2v.json`：参考图/图文相关路径。

建议参数：576×320、49 帧、8 FPS、20 steps、单任务并发 1。确认输出视频写入 ComfyUI `output` 目录并能正常播放。

## 8. 项目代码进度

项目侧已完成：

- 视频生成请求 schema 和三种模式校验。
- 视频配置、视频任务表和 Drizzle migration。
- 视频任务 API、视频配置 API。
- ComfyUI `/prompt`、`/history`、`/view`、`/system_stats` 适配。
- MiniMax-H3 OpenAI-compatible 提示词扩写适配。
- 独立视频 worker：`npm run video:worker`。
- 视频工作区：文生、图生、图文结合、参考图上传、轮询、停止、播放和下载。
- 视频附件播放支持、Windows 初始化脚本和 workflow 占位文件。

已通过：`tsc --noEmit`、ESLint、Vitest（107 通过、3 跳过）和 `npm run build`。

尚未完成：

- 五个模型文件全部下载并通过 SHA256。
- 真实 MiniMax-H3 workflow 在本机跑通。
- 用真实 API workflow 替换项目占位 JSON。
- I2V/R2V 参考图片节点映射。

## 9. 项目联调

模型和 workflow 验证完成后：

```powershell
Set-Location D:\funtools\ai-chater\AI-Chater
npm run db:migrate
npm run dev
npm run video:worker
```

`.env` 至少设置：

```env
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_WORKFLOW_DIR=./data/comfyui-workflows
COMFYUI_OUTPUT_TIMEOUT_MS=900000
VIDEO_MAX_OUTPUT_BYTES=209715200
VIDEO_PROMPT_REWRITE_ENABLED=false
VIDEO_PROMPT_REWRITE_BASE_URL=http://127.0.0.1:8000/v1
VIDEO_PROMPT_REWRITE_MODEL=MiniMax-H3
VIDEO_PROMPT_REWRITE_API_KEY=
```

MiniMax-H3 ComfyUI 模型本体不等于 OpenAI-compatible 文本服务；只有另行部署 H3 文本接口后，才开启 prompt rewrite。

## 10. 故障处理

- 下载卡住：观察文件大小；长时间 0 字节时停止并改用 curl 断点续传。
- 连接重置：保留部分文件，使用 `--retry 20 --retry-all-errors -C -`。
- 找不到模型：检查目录、文件名、扩展名和 SHA256，重启 ComfyUI 扫描。
- 显存不足：使用 `--lowvram`，降低宽高、帧数和 steps，保持单任务并发。
- `COMFY_UNAVAILABLE`：检查 ComfyUI 是否监听 `127.0.0.1:8188`。
- `COMFY_TIMEOUT`：降低分辨率、帧数或 steps。
- `OUTPUT_INVALID`：检查 workflow 是否存在视频输出节点。
- `H3_UNAVAILABLE`：关闭 H3 rewrite，先单独验证视频扩散链路。

## 11. 待办清单

- [ ] 下载并校验五个模型文件。
- [ ] 在 ComfyUI 中确认五个模型可被节点选择。
- [ ] 跑通 T2V、I2V、R2V workflow。
- [ ] 用真实 API workflow 替换项目占位文件。
- [ ] 完成项目文生、图生、图文结合联调。
- [ ] 如需 H3 扩写，另行部署 OpenAI-compatible H3 文本服务并开启 rewrite。

