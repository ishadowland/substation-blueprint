# Substation Blueprint — 设计文档

> **版本**: 对应 HEAD `640ccf7`(详见章节末"代码 / commit 索引")
> **线上地址**: <https://ishadowland.github.io/substation-blueprint/>
> **源码仓库**: <https://github.com/ishadowland/substation-blueprint>

---

## 1. 项目概述

### 1.1 定位

一个 **Three.js 蓝图风格**的升压站 + 光伏区可视化项目。所有几何体以 `LineSegments` (EdgesGeometry) 的线框模式呈现,整体走工程图语言 —— 标题栏、Sheet 编号、Scale、HUD 中所有文字均使用 `JetBrains Mono` + 宽字距 (0.12em – 0.35em)。

### 1.2 目标

| 目标维度        | 落地方式                                                              |
| ----------- | ----------------------------------------------------------------- |
| 单 HTML 即看    | importmap + jsdelivr CDN,无 build / 无 bundler / 无框架,纯 vanilla ES module |
| 多主题可分享几何    | 3 个主题共享同一组 `THREE.LineBasicMaterial` 引用,主题切换仅 **就地 mutate color** |
| 信息密度        | substation 11 类可点击组件 + 3 座 792-unit 光伏场 = 2,376 unit / 57,024 panels |
| 演示能力        | 7 阶段无人机 fly-through,可 loop 循环                                                |
| 性能可控        | 启动后首帧 paint 完才异步构建光伏场(commit `f557c52`);光伏场几何 **merge 为 9 个 LineSegments** |

### 1.3 灵感来源

* **redradman/artemis**(<https://github.com/redradman/artemis>) — 工程图风格 HUD、warm-cream + amber 单点强调色、双层网格 + paper grain 蓝图纸、JetBrains Mono + 宽字距。
* **iswiki 调研结论** — 直接复用 Artemis 的 design tokens(深色背景 + 暖色前景 + 单琥珀色 accent),不做重新发明,只把渲染目标从单一 mesh 换成 wireframe-only。

---

## 2. 文件结构

```
substation-blueprint/
├── index.html      (217 LOC,  8.4 KB)  ── HUD 静态结构 + importmap + commit hash fetch
├── scene.js        (2,387 LOC, 86 KB)  ── Three.js 场景 / 交互 / drone / 主题切换
├── style.css       (711 LOC,  17 KB)   ── CSS 变量主题 + HUD chrome + 蓝图纸 backdrop
├── README.md       (35 LOC)            ── 入口说明
└── DESIGN.md       (本文档)              ── 设计文档
```

`scene.js` 内章节切分(行号区间,基于 `640ccf7` HEAD):

| 区间       | 模块                                  |
| ---------- | ----------------------------------- |
| 1–55     | 顶部说明 / importmap 注释 / imports        |
| 57–141   | PALETTES / state / 共享 materials       |
| 143–247  | CATALOG / renderer / scene / camera    |
| 249–356  | lighting + `wireGroup` helpers         |
| 358–810  | substation 11 类组件(ground / perimeter / gate / road / building / transformer×3 / switchgear×2 / capacitor / mast×2 / tower×3 + conductors) |
| 812–1170 | solar demo 单机(12 unit,355m 行)         |
| 1172–1511 | **太阳能 farm 合并优化** + `requestAnimationFrame` 异步构建 3 农场 |
| 1513–1724 | landscape / vehicles / `applyTheme()` |
| 1726–1830 | `applySelection()` 3-tone + raycaster    |
| 1832–2013 | viewpoint flyToViewpoint / resize / panel collapse |
| 2015–2328 | **DroneCameraController** (7 phase) + DRONE/LOOP wiring |
| 2330–2386 | `tick()` render loop / boot              |

---

## 3. ASCII 架构图

```
┌────────────────────────────────────────────────────────────────────────┐
│  index.html  (HUD chrome: title / theme picker / commit hash / panel)  │
│  ── JetBrains Mono, letter-spacing 0.18em, 单琥珀色 accent ──          │
└────────────────────────────────────────────────────────────────────────┘
                                  │ importmap → cdn.jsdelivr.net
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       scene.js (Three.js 0.160.0)                      │
│                                                                        │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ PALETTES   │  │  materials  │  │   CATALOG    │  │  state{}     │ │
│  │ (3 theme)  │  │  (mutated   │  │ (11 selectable│  │  lastInter   │ │
│  │            │  │   in-place) │  │  components) │  │  isDragging  │ │
│  └────────────┘  └─────────────┘  └──────────────┘  └──────────────┘ │
│                                                                        │
│  ┌──────────── Substation (≈150 line components, 11 groups) ──────────┐ │
│  │ building / transformer×3 / switchgear×2 / capacitor / mast×2       │ │
│  │ tower×3 + conductors / perimeter / gate / road / landscape / drone│ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌──────────── Solar (deferred via requestAnimationFrame) ───────────┐ │
│  │ buildMergedFarmAtOffset(x, id) ──► 3 LineSegments per farm × 3 farm│ │
│  │       = 9 draw calls for 2,376 units (57,024 panels)              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌──────────── Interaction ─────────────────────────────────────────┐ │
│  │ raycaster pointerup → applySelection(id) → 3-tone state          │ │
│  │ OrbitControls + autoRotate (idle > 4s) + viewpoint flyToViewpoint│ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌──────────── Drone (DroneCameraController, 7 phases, 62s) ─────────┐ │
│  │ 1 takeoff 2 orbit 3 climb 4 race-north 5 skim-south 6 return 7   │ │
│  │ land. LOOP option loops via 'loop' return from onEnd handler.    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌──────────── Render Loop tick() ──────────────────────────────────┐ │
│  │ drone.update()? → controls.autoRotate (gated) → controls.update()│ │
│  │ → FPS throttle (1 Hz) → renderer.render → rAF                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
                                  │ body[data-theme=…]
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  style.css   ── CSS variable tokens ──► 3 themes                       │
│  body[data-theme=blueprint]    → paper cyan (#dceafe) + sky cyan       │
│  body[data-theme=space]        → warm cream (#f0ebe0) + amber          │
│  body[data-theme=cinematic]    → warm cream + amber + lighting on      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 3 大主题系统

切换主题 = **就地 mutate 同一组共享 `LineBasicMaterial` 的 color + opacity**,不重新分配 material,详见 `scene.js:1652` `applyTheme()`。

| 主题         | 背景 (bgCss)     | 线框默认 (line)     | accent (active) | 光照                | 实体 hull 可见 | 蓝图纸 backdrop |
| ---------- | --------------- | --------------- | --------------- | ----------------- | --------- | ---------- |
| blueprint  | `#0b2e55` cyanotype navy | `#dceafe` paper cyan | `#8fd2ff` sky cyan | 全 0(纯线框)          | 否         | 是          |
| space      | `#000000` 黑        | `#ffffff` 白        | `#e8a23b` amber  | ambient 0.18 + hemi 0.12(轻微体积感) | 否         | 否          |
| cinematic  | `#000000` 黑        | `#ffffff` 白        | `#e8a23b` amber  | ambient 0.32 + key 1.4 + fill 0.55 + rim 0.45 | **是**(Phong hull opacity 0.55/0.45) | 否 |

**3 个主题共用同一份 geometry 数据**,主题切换不会触发 rebuild scene。只切换:

* `materials.wireDefault.color` / `materials.wireActive.color` / `materials.wireDim.color` (`.setHex()`)
* `scene.background` + `renderer.setClearColor(alpha=0 or 1)`
* 5 盏 light 的 `intensity`
* `materials.ground.opacity` + `materials.hull.opacity` + `materials.hullDark.opacity`
* `scene.traverse()` 把 `userData.kind === 'solid'` 的 mesh `.visible = (theme === 'cinematic')`
* `body[data-theme]` 属性 → 触发 CSS variables 切换

可访问性 / 输入:

* 鼠标按钮:顶部右上 01 / 02 / 03 三颗按钮(`data-theme-btn`)。
* 键盘:`1` / `2` / `3`。

引用 commit:

* `d941c6a` — 引入 cyanotype 蓝图纸 + 双层网格 + paper grain + vignette。
* `f1ee189` — boost grid alpha + 显式 `background-repeat`。
* `d616477` — canvas alpha 修复,让 paper backdrop 真正透过来。
* `017d14d` / `7d8340a` — 把 grid alpha 减半两次,避免太抢眼。

---

## 5. 蓝图背景设计 (Blueprint Theme 专属)

`.blueprint-paper` 是 **绝对定位 + `z-index: 0` + `pointer-events: none`** 的 div,仅 `body[data-theme="blueprint"]` 时显示(`#canvas` 在该主题下 `setClearColor(..., 0)` 让 canvas alpha = 0 → paper div 透过来,见 `d616477`)。7 层 `background-image` 叠合(后写在上):

| # | 层             | 实现                                                |
| - | ------------- | ------------------------------------------------- |
| 1 | paper base    | `background-color: #0b2e55` (cyanotype navy)       |
| 2 | major grid H  | alpha 0.1125, `linear-gradient` 2px 横线 / 80px          |
| 3 | major grid V  | alpha 0.1125, 2px 竖线 / 80px                          |
| 4 | minor grid H  | alpha 0.055, 1px 横线 / 20px                           |
| 5 | minor grid V  | alpha 0.055, 1px 竖线 / 20px                           |
| 6 | paper grain   | inline SVG `feTurbulence baseFrequency=0.9 numOctaves=2`,`opacity 0.045`,160×160 平铺 |
| 7 | highlight + vignette | 顶部左侧 `radial-gradient rgba(210,225,255,0.06)` 受光;四角 `rgba(0,0,0,0.35)` 收暗 |

---

## 6. 3D 场景结构

### 6.1 Substation(11 类可点击组件)

| `id`           | 几何 / 数量                                  | 含义                            |
| -------------- | ----------------------------------------- | ----------------------------- |
| `building`     | 1 个长 180×50×18m 厂房 + 屋顶 + 屋脊 + 竖向 ribs + 3 道门 | 控制楼,SCADA / 继电保护屏              |
| `transformer`  | 3 套 cluster,每套 = pad + housing + 4 fins + crown + bus + 3 bushings | 主变压器                        |
| `switchgear`   | 2 行 × 6 bay = 12 间隔,带 H 架 + 3 根纵向母线     | 中压开关                       |
| `capacitor`    | 6×3 = 18 cream enclosures + 红/蓝/暗 bushings   | 无功补偿                          |
| `mast`         | 2 根 60m pole + 3 insulator disc          | 避雷针                            |
| `tower`        | 3 座 70m 钢格构塔 + 3 根倾斜 conductor       | 出线塔                             |
| `perimeter`    | 不规则 4 边形围墙(180×140 范围)                | 周界                              |
| `gate`         | 2 个侧柱 + 8 根横杆(开口 16m)                | 车辆大门                          |
| `road`         | quadratic bezier 曲线 = 8 段 box,长约 90m    | 厂内道路                          |
| `landscape`    | 4 棵 icosphere 树 + 8 花坛 + 1 个 40m 半径湖 + 3 圈波纹 | 绿化 / 水景                  |
| `drone`        | 1 个 quadcopter marker(中心 box + 4 arm + 4 propeller + 4 corner light) | DEMO 标识 |

每个组件对应 `CATALOG` 中一条元数据(点击后在 panel 显示 label / category / qty / note)。

### 6.2 Solar Farm(3 × 792 unit = 2,376 unit)

| 维度               | 值                                                                |
| ---------------- | ---------------------------------------------------------------- |
| 单 unit           | 12 cols × 2 rows = 24 panel + 4 post;cell grid = **2 竖线 + 1 横线**(早期 4 竖线减半以省 vertex) |
| 单板尺寸             | 2.0m × 1.0m × 0.08m;倾角 ≈ 26°(`PANEL_TILT = 0.45` rad)             |
| 单场                | 66 rows × 12 cols = **792 unit / 19,008 panel**;440m(X)× 2,925m(Z) footprint |
| 3 场布局            | 西 x=-360 / 中 x=0 / 东 x=+360,场间 ~127m gap;yaw=0,面板面向 -Z(朝 substation) |
| 全部               | **2,376 unit / 57,024 panel**(3 × 66 × 12 × 24)                       |

### 6.3 Performance: 25,000 LineSegments → 9

历史痛点:早期每个 panel 独立 LineSegments,792 unit ≈ **~25,000 draw call**(`1e8623a` → `1832753` Revert → `c394762` 重做)。

最终方案(`bd192cf`):

```js
function buildMergedFarmAtOffset(xOffset, groupId) {
  // 累积 panel edges / cell grids / posts 的 BufferGeometry
  // ……
  const panelEdgesMerged = mergeGeometries(allPanelEdges);   // BufferGeometryUtils
  const cellGridsMerged  = mergeGeometries(allCellGrids);
  const postsMerged      = mergeGeometries(allPosts);
  // 每 farm 输出 3 个 LineSegments,3 farm = 9 draw calls
}
// cell grid 使用 wireAccent(opacity 0.55),在 blueprint → sky cyan,space/cinematic → amber
```

启动流程(`f557c52`):`boot()` 同步执行 `applyTheme + applySelection + tick()`(rAF);`requestAnimationFrame(() => buildMergedFarmAtOffset × 3)` 把 3 场推迟到下一帧,**首屏只渲染 substation**,首屏白屏从 ~2s 降到 < 200ms。

---

## 7. 交互系统

### 7.1 OrbitControls + Auto-Rotate

```js
controls.enableDamping   = true
controls.dampingFactor   = 0.08
controls.minDistance     = 80;   controls.maxDistance = 3000
controls.maxPolarAngle   = π × 0.49   // 防止穿地
controls.autoRotateSpeed = 0.35
```

`tick()` 内 auto-rotate gate:`autoRotate = !droneActive && idle > 4000ms && !state.isDragging`。`state.lastInteractAt` 在 pointerdown / move / up 中刷新,4 px 阈值判 drag。

### 7.2 Click-to-Select(3-tone state)

每个 `LineSegments` 在 `userData.kind` 有 3 种角色:`'wire'` / `'solid'` / `'ambient'`(始终 dim)。

| line.kind | id=null | id=match | id=other |
| --- | --- | --- | --- |
| `wire`   | wireDefault(opacity 0.85) | **wireActive**(1.00, accent) | wireDim(0.14) |
| `solid`  | (隐于 wire 之下)             | 同左                        | 同左          |
| `ambient`| wireDim(0.14)               | wireDim(0.14)               | wireDim(0.14) |

`raycaster.intersectObjects(candidates)` 仅命中 kind=wire;移动 > 4 px 视为 drag。

### 7.3 3 视角按钮 + DRONE + LOOP

| 控件       | 行为                                                                                |
| -------- | --------------------------------------------------------------------------------- |
| `S` SUBSTATION | `flyToViewpoint('substation')` → camera (-360,240,360), target (0,0,0)(`19f199f` 加倍) |
| `F` SOLAR FARM | `flyToViewpoint('farm')` → camera (0,800,-1340), target (0,0,-1340)              |
| `N` STRING    | `flyToViewpoint('string')` → camera (-30,50,-1420), target (0,2.5,-1340)         |
| `D` DRONE / 04 DRONE | `toggleDroneTour()`:`isActive ? cancel() : startDroneTour()`(`f3bd22e` + `c4945ff`) |
| `L` LOOP / LOOP | 独立 arm toggle;`droneController.onEnd` 返回 `'loop'` → `start()` 重启(`640ccf7`)         |

视角 fly 用 1.2s `easeInOutCubic` lerp camera.position + controls.target;DRONE 期间 `controls.enabled = false`,camera 完全由 `DroneCameraController` 接管。

---

## 8. 无人机 DEMO:7 阶段时间线

`DroneCameraController` 在 `isActive === true` 期间 **完全接管 camera**(`controls.enabled = false`),通过 7 个 `else if` 分支按 `elapsed` 时间查表生成 `position + lookAt`(`scene.js:2026–2213`)。

| #   | 阶段        | 时长(s) | 起 → 终                                                              | lookAt 起点 → 终点 |
| --- | --------- | ------ | -------------------------------------------------------------------- | ----------- |
| 1   | takeoff   | 0→2    | (45, 3, -30) → (45, 30, -30)                                         | 固定 building (0,10,-22) |
| 2   | orbit     | 2→14   | r=110m, y=60, 12s 1 圈 CCW(center = DRONE_HOME)                      | 固定 DRONE_HOME |
| 3   | climb     | 14→17  | (45,30,-22) → (0,80,-200)                                            | **lerp** DRONE_HOME → building |
| 4   | race north | 17→22 | (0,80,-200) → (0,80,-2380)                                            | lerp building → (0,80,-1500) |
| 5   | skim south | 22→47 | (0,80,-2380) → (0,45,-300) — 25s 长镜头(40% 速度)                   | ly lerp 80→45 |
| 7   | land      | 52→57  | (45,80,-30) → (45,3,-30)                                              | 固定 DRONE_HOME,y=3 |

总时长 62s,`easeInOutCubic` 用于每个子阶段的进度归一化。

**chase camera offset**: camera 不是直接放在 drone 位置,而是 `position + (-forward)×6 + up×2.0 + right×0.4`,产生"跟在后面略高略偏"的三维运镜感。`OrbitControls.target` 也被同步 copy,避免 `controls.update()` snap-back。

**drone marker 同步**:`group.position` 每帧跟随 keyframe;4 个 propeller 每帧 `rotation.z += 0.6` 自旋;4 个 corner light 使用 `materials.wireActive`,在 3 主题下分别呈 sky-cyan / amber / amber。

引用 commit:

* `c4945ff` — 7-phase 飞行首次落地(437 LOC)。
* `e68c7e0` — orbit r 45→110、alt 30→60、skim alt 30→45、speed 40%。
* `640ccf7` — phase 边界 lookAt 平滑 + LOOP 选项。

---

## 9. HUD 设计

### 9.1 字体 / 颜色 token

* 字体:`JetBrains Mono` 300/400/500/600,Google Fonts preconnect。
* 字距:`--tracking-tight: 0.12em` / `--tracking-normal: 0.18em` / `--tracking-wide: 0.32em`(kbd 0.05em)。
* token(默认 + blueprint override):

```css
:root                       /* Artemis 基础 */
  --color-fg:      #f0ebe0  /* warm cream */
  --color-accent:  #e8a23b  /* amber */
  --color-bg:      #000000

body[data-theme='blueprint']
  --color-fg:      #dceafe  /* paper cyan */
  --color-accent:  #8fd2ff  /* sky cyan */
  --color-bg:      #0d2c54  /* cyanotype paper blue */
```

### 9.2 HUD 结构

* **顶部条**:左侧 `▣ SUBSTATION // BLUEPRINT VIEWER` 标题 + `Drawing No. S-001/A · Sheet 01 of 01 · Scale 1 : 200` + `Build <commit-hash>` 链接(`be88393` 引入,运行时 fetch GitHub API `commits/main` 拉前 7 位 hash,失败 fallback 到 baked-in)。
* **顶部条右侧**:`THEME` label + 4 颗按钮(01 BLUEPRINT / 02 SPACE / 03 CINEMATIC / 04 DRONE)+ LOOP 按钮。
* **左上面板**:可折叠的 component info panel(SELECTION / CATEGORY / QUANTITY / NOTE)。
* **左下角 legend**:4 条 swatch(DEFAULT / ACTIVE / DIMMED / DRONE)。
* **底部条**:3 颗 viewpoint 按钮(SUBSTATION [S] / SOLAR FARM [F] / STRING [N]) + 6 个快捷键 hint + FPS readout。

### 9.3 Commit Hash 显示

* baked-in hash 写在 `index.html` 中(占位符)。
* 页面 load 时 inline `<script>` fetch `https://api.github.com/repos/ishadowland/substation-blueprint/commits/main`,把 `#commit-hash-link` 的 text + href 替换为最新 7 位 SHA。
* API 失败 / 网络超时 → silently fallback,不阻塞页面。
* 引用 commit:`be88393 feat(hud): show current GitHub commit hash in top-left`。

### 9.4 DRONE 按钮

* 边框默认 accent 色,点击 armed 后背景填实 accent + REC 灯切换为 `pulse 0.9s`。
* LOOP 按钮 dashed 边框,armed 后切换为 solid + prefix `⟳ `。

引用 commit:`640ccf7 fix(drone): smooth phase-boundary lookAt + add LOOP option`(也引入 LOOP 按钮)。

---

## 10. 性能优化历程

| 阶段             | commit     | 关键改动                                                                         |
| -------------- | ---------- | ---------------------------------------------------------------------------- |
| 初始            | `e97c8fd`  | 整个 viewer 一次性 build,2,312 LOC,无优化                                              |
| 800-unit 试错    | `1e8623a` / `1832753` | 800 unit × 24 panel = 19,200 panel,**每个 panel 一个 LineSegments**,~25,000 draw call,直接 revert |
| 12-unit demo   | `5b8bdc6` → `553db1a` | 单 unit 12 panel × 12 unit = 355m 行,验证外观                                      |
| 翻 180°        | `47e6084`  | solar demo 移到 substation 北 200m 并旋转 180° 朝向 substation                       |
| 扩大 66×12     | `c394762`  | 单场 792 unit = 19,008 panel,**cell grid 4 竖线减半到 2 条**                       |
| **合并几何**      | `bd192cf`  | 用 `mergeGeometries(BufferGeometryUtils)` 把 792 unit 合并为 **3 个 LineSegments**(panels / cells / posts)|
| 三场            | `7a0d6bf`  | 加入 left / right farm,各 792 unit,farm 间 100m gap(实算 127m)                 |
| **首屏渲染**      | `f557c52`  | `requestAnimationFrame()` 推迟 3 场到下一帧,substation 先 paint,首屏白屏从 ~2s 降到 < 200ms |
| Blueprint 视觉  | `d941c6a` → `d616477` | 引入 cyanotype 纸 + alpha 修复(canvas 透明让 paper 透过)                              |
| Drone         | `c4945ff` → `e68c7e0` → `640ccf7` | 7 阶段 → orbit 110m / alt 60m / skim 40% → phase 边界 lookAt 平滑 + LOOP |

最终状态:整个光伏区仅 **9 个 LineSegments draw call**(3 farm × 3 type)。

---

## 11. 已知限制 + 改进方向

| 限制                          | 原因                              | 改进方向                                 |
| --------------------------- | ------------------------------- | ------------------------------------ |
| 帧率 ≈ 15–30 FPS,典型 22 FPS  | 9 个合并 LineSegments 仍有几万 vertex + GPU 着色器无 LOD；cell grid 在 4K 屏渲染量大 | 把 panel edges 改为 InstancedBufferGeometry;远景用 frustum culling;HUD 在低 FPS 时自动降级 |
| FPS 还有优化空间                  | `tick()` 未做 `if (now - lastFrame < 16ms) return` 帧时间门限;`fpsReadout` 1 Hz 节流 | 加 frame budget;render only on demand(dirty flag) |
| drone marker 体积偏小            | 中央 box 仅 1.4×0.5×1.4m,在 2.9km 长的光伏场中难以察觉 | 改成 halo + screen-space marker,或 trail line |
| 无 SSR / 无 post-processing    | 直接 forward 渲染,无 bloom / SSAO | cinematic 主题加轻微 UnrealBloomPass + 暗角 |
| 无 mobile 触摸支持              | 仅 `pointerdown/move/up`,未识别 `touchstart/move/end` + pinch | 引入 `hammer.js` 或自实现 pinch zoom / two-finger rotate |
| LOOP 启动后无退出提示              | 用户按 D 取消是 OK,但 ESC 没绑                       | 在 panel 加 "PRESS D TO STOP" 倒计时条 |
| Auto-rotate 偶发瞬移          | OrbitControls.update 在 drone `isActive=false` 后第一帧仍用 savedAutoRotate 触发一次 | 在 `_end()` 显式 `controls.update()` 一次再恢复 |
| Loading 文字位置不居中            | `#loading-msg` 用 absolute top:50% 但未考虑 HUD 高度     | 改 flex / 加 padding-top              |
| commit hash 偶尔 stale       | fetch 失败时显示 baked-in 旧 hash                | 加 localStorage 缓存 + SWR 策略       |

---

## 12. 代码 / Commit 索引(便于跳读)

```
640ccf7  fix(drone): smooth phase-boundary lookAt + add LOOP option
19f199f  tweak(viewpoint): double substation viewpoint camera distance
be88393  feat(hud): show current GitHub commit hash in top-left
017d14d  tweak(blueprint): halve grid line alpha again
7d8340a  tweak(blueprint): halve grid line alpha for subtler look
d616477  fix(blueprint): make canvas transparent so paper backdrop + grid shows through
f1ee189  fix(blueprint): boost grid alpha + add explicit background-repeat
d941c6a  feat(blueprint): add cyanotype paper backdrop with 2-level grid
e68c7e0  feat(drone): orbit radius 45→110m, alt 30→60m, center on takeoff; skim speed 40%, alt 30→45m
c4945ff  feat: drone fly-through demo (7-phase cinematic camera tour)
f3bd22e  Fix solar spacing, add viewpoint camera buttons, update blueprint theme
f557c52  perf: defer solar farm build to post-first-paint (fix initial-load freeze)
7a0d6bf  feat: add left + right solar farms (each 792 units), 100m gaps from center
bd192cf  perf: merge 792 solar units into 3 LineSegments (was 25,000)
c394762  feat: scale up to 792-unit solar farm (66 rows × 12 cols, 19,008 panels)
eefb4b4  fix: face the entire 12-unit solar row toward the substation
553db1a  feat: replicate solar demo to 12-unit horizontal row (~355m wide)
47e6084  chore: move solar demo unit 200m north and rotate 180° (Y-axis)
5b8bdc6  feat: add single solar array demo unit (12x2 panels, 4 posts)
1832753  Revert "feat: add 800-unit photovoltaic array …"
1e8623a  feat: add 800-unit photovoltaic array (12x2 panels each, 19,200 panels total)
213c24d  feat: blueprint substation viewer (Three.js, vanilla JS, GitHub Pages)
e97c8fd  feat: blueprint substation viewer (Three.js, vanilla JS, GitHub Pages)   ← 起点
```

**入口文件**:

* `index.html` (217 LOC, 8.4 KB) — HUD chrome + importmap
* `scene.js` (2,387 LOC, 86 KB) — 全 Three.js 逻辑
* `style.css` (711 LOC, 17 KB) — theme tokens + HUD CSS
* `README.md` (35 LOC) — 入口 README

**第三方**:

* Three.js `0.160.0`(CDN: `cdn.jsdelivr.net/npm/three@0.160.0/`)
* JetBrains Mono(Google Fonts)
* `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js`
