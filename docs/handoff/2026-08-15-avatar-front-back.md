# 用户头像前后端交接

更新时间：2026-08-15 14:58

## 前端现状

前端已新增受保护的 `/profile` 个人资料页、浏览器 Canvas 1:1 手动裁切和聊天页头像展示。头像服务未接入时，资料页会显示“等待服务端头像服务接入”，不会把图片写入浏览器存储。

前端会探测 `GET /api/me/profile`：返回 `404` 时自动禁用上传；接口上线后无需更换前端交互。用户头像会用于右侧用户消息、聊天工具栏、侧栏和账号面板；AI 继续使用固定 Bot 图标。

## 数据库与存储

1. 在 `users` 增加可空字段：`avatar_storage_key VARCHAR(80)`、`avatar_mime_type VARCHAR(80)`、`avatar_updated_at DATETIME`。
2. 通过新的 Drizzle migration 升级；历史用户字段均为 `NULL`，表示使用前端用户名首字母回退头像。
3. 头像文件复用 `UPLOAD_DIR` 的受控路径处理和随机存储键，但**不得**写入 `attachments` 表，也不得复用消息附件 ID 路由。头像与消息附件具有独立生命周期。
4. 更新头像时先写入新文件、成功更新用户记录，再删除旧文件；删除账号时同步删除该用户的头像文件。数据库更新失败时删除刚写入的新文件，避免孤儿文件。

## 接口契约

所有写操作使用现有 `requireUser()`、`assertSameOrigin()`、`routeError()` 约定；所有头像读取只允许当前登录用户，不接受或暴露任意用户 ID。

### `GET /api/me/profile`

响应：

```json
{
  "user": {
    "id": "uuid",
    "username": "name",
    "avatarUrl": "/api/me/avatar?v=2026-08-15T14%3A58%3A00.000Z"
  },
  "avatarServiceAvailable": true
}
```

无头像时 `avatarUrl` 为 `null`。该接口需与 `getCurrentUser()` 的扩展字段保持一致，使聊天页服务端首屏也能收到可选 `avatarUrl`。

### `PUT /api/me/avatar`

- 请求为 `multipart/form-data`，字段名固定为 `avatar`。
- 前端会发送经 Canvas 裁切的 `512×512 image/webp`，但服务端仍必须独立验证。
- 成功响应：`{ "avatarUrl": "/api/me/avatar?v=<updatedAt>" }`。
- 校验 JPEG、PNG、WebP 的真实文件签名、非空、最大 2 MB；不能只信任 `Content-Type` 或客户端扩展名。

### `GET /api/me/avatar`

- 返回当前登录用户头像的字节、正确 MIME 类型与私有缓存策略。
- 无头像返回 `404`；未登录返回现有统一的 `401` 错误响应。
- `v` 查询参数仅用于缓存失效，不参与权限或存储路径解析。

### `DELETE /api/me/avatar`

- 清空三个头像字段并删除对应文件。
- 成功响应 `{ "ok": true }`；无头像时可保持幂等成功。

## 安全与验收

- 禁止用户控制磁盘路径、存储键或其他用户 ID；所有路径必须通过现有 `uploadPath` 保护。
- 头像读取、更新、删除均测试未登录、跨账号和软删除账号场景。
- 测试格式/签名/大小拒绝、更新替换旧文件、失败回滚、删除头像和删除账号的文件清理。
- 后端完成后运行 `npm run db:generate`、`npm run db:migrate`、`npm run lint`、`npm test`、`npx tsc --noEmit` 与 `npm run build`，并在桌面和移动端验证资料页上传、裁切、消息头像刷新与回退状态。
