# 首页桌宠框架（虚拟蜘蛛）

更新时间：2026-09-12

首页 `/` 三屏滚动页上的桌面宠物方案。第一款宠物为虚拟蜘蛛，通过右下角“自定义外观”面板中的“召唤宠物”按钮召唤。本文档只定义框架，具体实现按“实施阶段”推进。

## 一、目标与范围

- **纯前端功能**：不新增数据库表、API 或服务端逻辑。
- **仅首页可见**：只挂在首页 `/`，聊天、登录、伴侣等页面不显示。
- **可扩展**：`PetKind` 预留多宠物，第一款为 `spider`；行为与渲染解耦，后续可换皮/换行为。
- **默认降级**：`prefers-reduced-motion` 下不跑动画，显示静态可拖拽蜘蛛。
- **不干扰业务**：覆盖层 `pointer-events: none`，只有蜘蛛本体响应指针事件，且 z-index 低于外观面板。

## 二、设计决策

| 项目 | 决策 | 理由 |
| --- | --- | --- |
| 绘制方式 | 内联 SVG + CSS 变量 | 无资源文件、体积小、颜色可跟随主题色、易做降低动效降级 |
| 活动范围 | `position: fixed` 固定视口，跟随三屏滚动 | 与“桌面宠物”语义一致；三屏切换时始终在屏上 |
| 交互深度（v1） | 召唤/收回、沿边爬行、光标回避、点击反应、拖拽落地 | 足够有趣且不引入结网等复杂状态 |
| 状态持久化 | `localStorage` + 自定义事件 | 复用现有 `CHAT_BACKGROUND_*` 模式，无需服务端 |
| 动画驱动 | 单个 `requestAnimationFrame` 写 CSS 变量/transform | 不触发 React 每帧渲染，性能可控 |

## 三、文件结构与职责

```
client/pet/
  types.ts        # PetKind / PetStatus / PetPreferences / SpiderState
  pet-store.ts    # PET_STORAGE_KEY、PET_CHANGE_EVENT、parse/save/normalize
  spider.ts       # 蜘蛛几何、8 条腿步态角度、姿态计算（纯函数）
  motion.ts       # 状态机与物理步进（纯函数，可单测）
  index.ts        # 统一导出
components/pet/
  spider-pet.tsx  # SVG 渲染 + 订阅事件 + rAF 循环
components/appearance/appearance-control.tsx   # 新增“桌面宠物”区块与按钮
client/appearance.ts                            # getAppearancePanelVisibility 增加 showPetControls
app/globals.css                                 # .spider-pet-* 样式与 reduced-motion 降级
tests/pet.test.ts                               # 纯函数与状态机测试
tests/appearance.test.ts                        # 更新可见性断言
```

## 四、接口草案

```ts
// client/pet/types.ts
export type PetKind = "spider";
export type PetStatus = "idle" | "walk" | "chase" | "drag" | "fall" | "sleep";
export type PetPreferences = {
  kind: PetKind | null;      // null 表示未召唤
  activity: number;          // 0-200，与气泡活跃度一致的手感刻度
  chaseCursor: boolean;      // 是否追逐光标
};
export type SpiderState = {
  status: PetStatus;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  legPhase: number;
  idleSince: number;
  webAnchor: { x: number; y: number } | null;
};

// client/pet/pet-store.ts
export const PET_STORAGE_KEY = "ai-chater-pet-v1";
export const PET_CHANGE_EVENT = "ai-chater:pet-change";
export function parsePetPreferences(value: string | null): PetPreferences;
export function savePetPreferences(preferences: PetPreferences): void;
export function dispatchPetChange(preferences: PetPreferences): void;

// client/pet/spider.ts（纯函数）
export function spiderLegAngles(phase: number, status: PetStatus): number[]; // 8 条腿

// client/pet/motion.ts（纯函数）
export type PetInput = {
  viewport: { width: number; height: number };
  pointer: { x: number; y: number } | null;
  dragging: boolean;
  activity: number;
  elapsedMs: number;
};
export function createSpiderState(viewport: { width: number; height: number }): SpiderState;
export function stepSpider(state: SpiderState, input: PetInput): SpiderState;
```

## 五、状态机

```
      召唤
       │
       ▼
   idle ──空闲超时──▶ sleep
     │                  │
     │ 随机航点          │ 点击/移动
     ▼                  │
   walk ◀───────────────┘
     │ 光标靠近
     ▼
   chase ──按住──▶ drag ──松手──▶ fall ──落地──▶ walk
```

- **idle**：原地轻微摆动，随机等待后出发。
- **walk**：沿视口边缘或随机航点爬行，取边缘时 `facing` 指向移动方向；复用气泡物理中的 `clamp` / 边界约束思路。
- **chase**：光标进入半径时靠近并加速，过近则后撤（可由 `chaseCursor` 关闭）。
- **drag**：Pointer 按住拖动，腿做挣扎步态；放开后进入 fall。
- **fall**：重力下落，若存在 `webAnchor` 则先按蛛丝摆动衰减，触底后 walk。
- **sleep**：长时间无交互缩成一团，任何指针事件唤醒。

## 六、触发与同步

1. 外观面板在 `pathname === "/"` 时显示“桌面宠物”区块。
2. “召唤宠物”按钮切换 `PetPreferences.kind`，写 `localStorage` 并派发 `PET_CHANGE_EVENT`。
3. `SpiderPet` 初次挂载读取偏好，并监听事件；`kind === null` 时不渲染。
4. 组件卸载（离开首页）时取消 rAF 与事件监听，不写状态。

## 七、渲染与性能

- SVG 结构：身体（椭圆/圆形）+ 8 条腿（`path`，每条腿一个 CSS 变量 `--leg-angle-i`）。
- 颜色：`fill`/`stroke` 使用 `--accent` 派生色，自动适配日夜模式。
- 每帧只更新 ref 上的 CSS 变量与 `transform: translate3d()`，不调用 `setState`。
- `document.hidden` 时暂停；`ResizeObserver` 处理视口变化并夹紧位置。
- 触摸设备降低 `activity` 并默认关闭 `chaseCursor`。

## 八、降级与可访问性

- `prefers-reduced-motion: reduce`：不启动 rAF，蜘蛛固定在右下角且可拖拽。
- 装饰性容器 `aria-hidden="true"`；开关由外观面板按钮承担，按钮可键盘操作并带 `aria-pressed`。
- 不抢焦点、不阻塞页面滚动与点击。

## 九、测试计划

- `parsePetPreferences`：非法输入回退默认、`kind` 校验、`activity` 范围。
- `spiderLegAngles`：相位推进产生周期性腿角、不同状态的姿态差异。
- `stepSpider`：边界夹紧、drag/fall 状态迁移、fall 触底回 walk、sleep 唤醒。
- `getAppearancePanelVisibility`：`/` 返回 `showPetControls: true`，其余路径为 `false`（同步更新 `tests/appearance.test.ts` 的完整对象断言）。

## 十、实施阶段

1. **偏好与入口**：`pet-store` + 外观面板“桌面宠物”区块 + 可见性字段与测试。
2. **静态渲染**：SVG 蜘蛛 + 主题色 + reduced-motion 降级。
3. **基础运动**：rAF 步态、沿边/航点爬行、光标回避。
4. **交互**：点击反应、拖拽、松手重力与蛛丝。
5. **打磨**：移动端、性能、单测、更新日志与文档入口。

每阶段完成后运行 `npx tsc --noEmit`、`npm run lint`、`npm run test`，必要时 `npm run build`。

## 十一、扩展预留

- 新增宠物：扩展 `PetKind` 并新增对应 `client/pet/<kind>.ts`，注册到渲染映射。
- 彩蛋（后续版本）：吐丝、结网、吃首页气泡、跨屏掉落。
- 外观面板可继续增加活跃度滑条、安静模式等配置项，字段并入 `PetPreferences`。

## 十二、风险

- **与气泡层叠加**：蜘蛛与 AI 气泡都在首页，需保证层级与指针事件不冲突（蜘蛛层 z-index 低于外观面板、高于背景）。
- **移动端性能**：低端设备需降频或退款为静态，已在降级策略中覆盖。
- **断言波及**：修改 `getAppearancePanelVisibility` 返回值会影响现有测试，需同阶段更新。
