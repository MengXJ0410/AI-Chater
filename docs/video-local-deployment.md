# 本地视频生成部署

项目的视频任务通过 ComfyUI 调用 Wan 2.1/2.2。MiniMax-H3 仅用于可选提示词扩写，不负责视频扩散。

## Windows 快速启动

1. 安装 NVIDIA 驱动、CUDA、Python 3.10+ 和 Git。
2. 克隆 ComfyUI，创建虚拟环境并安装依赖。
3. 安装 Wan 2.1/2.2 对应 checkpoint、VAE、text encoder 和 ComfyUI 自定义节点。
4. 将 ComfyUI workflow 导出为 API 格式，复制到 `data/comfyui-workflows`，替换项目内置占位 JSON。
5. 以低显存模式启动：

```powershell
python main.py --listen 127.0.0.1 --port 8188 --lowvram
```

6. 在 `.env` 中设置 `COMFYUI_BASE_URL=http://127.0.0.1:8188`，执行数据库迁移：`npm run db:migrate`。
7. 启动 Next.js 和视频 worker：

```powershell
npm run dev
npm run video:worker
```

## Workflow 约定

项目会读取 `wan-t2v.workflow.json`、`wan-i2v.workflow.json` 和 `wan-ti2v.workflow.json`。模板中需要把正向提示词、负向提示词、宽度、高度、帧数、FPS、步数对应节点标记为 `__POSITIVE_PROMPT__`、`__NEGATIVE_PROMPT__` 或带 `__field` 的数值节点。

12–16GB 显存建议从 576×320、49 帧、8 FPS、20 steps 开始，确认稳定后再提高参数。

## H3 提示词扩写

若本地 H3 通过 OpenAI-compatible API 暴露 `/v1/chat/completions`，设置：

```env
VIDEO_PROMPT_REWRITE_ENABLED=true
VIDEO_PROMPT_REWRITE_BASE_URL=http://127.0.0.1:8000/v1
VIDEO_PROMPT_REWRITE_MODEL=MiniMax-H3
VIDEO_PROMPT_REWRITE_API_KEY=
```

H3 必须返回 `positive_prompt`、`negative_prompt`、`shot_plan` 和 `duration_hint` JSON 字段。
