# 首页桌宠框架（虚拟蜘蛛）

更新时间：2026-09-12

首页 `/` 三屏滚动页上的桌面宠物方案。第一款宠物为虚拟蜘蛛，通过右下角“自定义外观”面板中的“召唤宠物”按钮召唤。本文档只定义框架，具体实现按“实施阶段”推进。

## 实施状态（2026-09-13）

阶段 1–5 已落地：`client/pet/{types,pet-store,spider,motion,index}.ts`、`components/pet/spider-pet.tsx`、独立的桌宠面板 `components/pet/pet-control.tsx`（右下角 🕷️ 按钮，含召唤/收回、活跃度、允许追击与身体姿态调参）、`app/globals.css` 的 `.spider-pet-*` 样式、`tests/pet.test.ts`，并在 `app/page.tsx` 挂载（随首页卸载）、`app/layout.tsx` 挂载面板。

实现相对下文草案的调整：

- 接口由单一 `spiderLegAngles(phase, status)` 扩展为逐腿独立的**三节式 IK** 与方向性步态：
  - `SPIDER_LEGS`：8 条腿各自独立的髋位、股节/胫节/跗节长度、基准朝向与膝弯曲方向。
  - `solveTwoBone(hip, target, upper, lower, kneeBias)`：二骨余弦定理，供上两节使用。
  - `solveLeg(hip, foot, femur, tibia, tarsus, kneeBias)`：先由可达性解出跗节折角（近端张、远端接近满伸时自动伸直，保证足端精确落地），再对股节+胫节解二骨 IK，返回 `{ knee, ankle, foot }`。
  - `legStrideFactor(leg)` / `strideTarget(...)`：按腿的方向给出步幅（前腿前伸、后腿后蹬）。
  - `poseSpider(state)`：输出每条腿的髋/膝/踝/足与抬腿量供渲染。
  - `stepSpider(state, input)`：移动时落点沿运动方向做方向性步幅，并按“足端可达距离、转身角度误差”逐腿触发支撑/摆动；支撑相足端固定在世界坐标；`PetInput` 含 `chaseCursor`、`chaseTrigger`、`wake`、`random`。
- `SpiderState` 采用 `heading/headingTarget/headingTimer/wanderPhase/wanderSince/chaseSince` 与逐腿 `legs` 状态，身体与腿几何统一按 `heading` 旋转。
- 渲染用 SVG `path` 逐帧更新 `d`（股节/胫节/跗节三段分离 + 足端圆点），身体用 `transform` 平移/旋转；未使用草案里的 `--leg-angle-i` CSS 变量方案。

### 腿部调参（无需重新构建）

所有腿部几何/弯曲参数集中在 `client/pet/spider.ts` 的 `DEFAULT_SPIDER_TUNING`：

| 字段 | 含义 | 典型范围 |
| --- | --- | --- |
| `femur` / `tibia` / `tarsus` | 四对腿的股节/胫节/跗节长度 | 各 4 个数 |
| `restAngle` | 四对腿基准朝向（度，相对身体正前方） | 0–180 |
| `hipX` / `hipY` | 髋部在身体局部坐标 | 小范围 |
| `restReach` | 静止伸展比例：越大腿越直、膝弯越小 | 0.4–0.9 |
| `stepReach` | 移动时超过该伸展比例就抬脚 | 0.8–1.0 |
| `stepAngle` | 移动时足端方向偏差超过该弧度就抬脚（转身重摆） | 0.5–1.5 |
| `tarsusBend` | 跗节折角（度，0 直线，负值反向） | −45–45 |
| `stride` | 前后腿步幅系数 | 0.1–0.5 |
| `legLift` | 抬脚高度（px） | 2–14 |
| `kneeFlip` | 膝/跗节整体镜像：1 或 −1 | 1 / −1 |

运行时覆盖（面板滑条实时生效，也支持持久化与查询串）：

- 面板：右下角 🕷️「桌宠设置」→「身体姿态」直接拖动滑条，立即生效并写入 `localStorage`。
- 控制台：`localStorage.setItem("ai-chater-spider-tuning", JSON.stringify({ tarsusBend: -20, restReach: 0.5 }))`。
- URL：`/?spiderTuning=${encodeURIComponent('{"tarsusBend":-20,"restReach":0.5}')}`，优先级高于 localStorage（刷新时读取）。
- 非法字段自动回退默认值；解析逻辑 `resolveSpiderTuning(stored, query)` 与实时应用 `updateSpiderTuning`/`resetSpiderTuning` 均可单测。


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
  spider-pet.tsx  # SVG 渲染 + 订阅事件 + rAF 循环（挂载于 app/page.tsx）
  pet-control.tsx # 独立的桌宠面板：召唤/活跃度/追击 + 身体姿态滑条（挂载于 app/layout.tsx）
app/globals.css                                 # .spider-pet-* 与 .pet-control 样式、reduced-motion 降级
tests/pet.test.ts                               # 纯函数、状态机与实时调参测试
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
              wander ──闲逛满 5 分钟──▶ sleep
            ▲   │  │                    │
   远离超 3 倍 │   │  │ 1 秒内左键 ≥5 次    │ 点击蜘蛛
            │   │  │                    ▼
            │   │  └──────────────▶ chase ─┘
            │   │                     │ 到达鼠标/超时
            │   ▼                     ▼
            └─ evade ◀────────────────┘
                 ▲
      鼠标距离 < 自身长度（wander 时）
```

任意状态按住拖动进入 drag，松手进入 fall，落地/蛛丝摆定回到 wander。

- **wander（闲逛，默认）**：以缓慢波动（`0.55±0.35` 正弦）的速度移动，方向每 0.9–2.3 秒更新一次；新方向为随机方向与“朝向鼠标方向”的加权混合（鼠标存在时权重 0.55），并叠加边缘回避分量，保证不出屏。
- **chase（追击）**：1 秒内左键点击任意处 ≥5 次触发（受 `chaseCursor` 开关控制）；快速转向鼠标并高速靠近，到达（< 0.75 自身长度）或超过 3.5 秒后转入 evade。
- **evade（躲避）**：wander 时鼠标进入自身长度（`SPIDER_LENGTH`）以内立即触发，背向鼠标逃离；距离超过自身长度 3 倍后回到 wander。点击蜘蛛也会进入 evade（惊慌）。
- **sleep（睡觉）**：连续闲逛满 5 分钟（`SPIDER_SLEEP_AFTER_MS`）进入，腿收缩静止；点击蜘蛛唤醒并进入 evade，快速连点则进入 chase。
- **drag / fall**：拖动挣扎、松手重力下落，高处会挂蛛丝摆动衰减，落地回到 wander。

`PetInput` 相应新增 `chaseCursor`、`chaseTrigger`、`wake`，`SpiderState` 用 `heading/headingTarget/headingTimer/wanderPhase/wanderSince/chaseSince` 取代原先的 `idleSince/targetX/targetY/waitMs`。

## 六、触发与同步

1. 独立的桌宠面板 `PetControl` 在 `pathname === "/"` 时显示右下角 🕷️ 按钮（与「自定义外观」并排、位于其上方）。
2. “召唤宠物”按钮切换 `PetPreferences.kind`，写 `localStorage` 并派发 `PET_CHANGE_EVENT`；活跃度与追击开关同样持久化。
3. 面板的“身体姿态”滑条调用 `updateSpiderTuning`，重建腿部骨架、写 `localStorage` 并派发 `SPIDER_TUNING_CHANGE_EVENT`，`SpiderPet` 订阅后立即重绘。
4. `SpiderPet` 初次挂载读取偏好，并监听事件；`kind === null` 时不渲染。
5. 组件卸载（离开首页）时取消 rAF 与事件监听，不写状态。

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
