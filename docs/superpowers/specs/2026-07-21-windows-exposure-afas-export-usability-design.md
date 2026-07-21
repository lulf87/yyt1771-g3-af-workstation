# Windows 曝光、AFAS 交互限位与导出目录设计

## 目标

在现有 Windows 单端口工作站架构上完成三项实际使用改进：

1. 在设备设置与 Operator 实时预览中提供 Hik 相机曝光调节，并在每次成功调整后自动持久化。
2. 把结果页 AFAS 低温区、高温区和最大斜率切线的所有拖动限制在正式平滑数据范围与图表绘图区内。
3. 用本地应用管理的长期导出目录替代浏览器 `showDirectoryPicker()`，同时保留原生自定义目录选择能力。

修改在 Mac 上开发和自动化验证，通过同一跨平台源码进入下一版 Windows portable/Setup。现有 dev.8 不会自动获得改动；Windows 目标机需要安装新构建。Hik MVS 曝光和 Windows 原生目录对话框必须在 Windows 真机上最终验证。

## 已确认的产品决定

- 曝光同时出现在设备设置和 Operator 实时测试页。
- 曝光控件采用“滑杆 + 精确数值框”，单位为 `μs`。
- 每次曝光调整成功后自动保存，下一次启动继续使用最后成功值。
- 正式测量运行期间锁定曝光；一个 run 内不允许改变曝光。
- 本轮不增加帧率显示或帧率修改。
- AFAS 高低温区边界、区间整体平移、切线整线平移和切线端点改斜率全部受正式数据范围限制。
- 导出目录允许自定义，选择后按当前系统用户长期记住并作为以后默认位置。
- 导出页面提供完整路径、更改位置、打开文件夹和恢复默认位置。

## 当前基线与根因

### 曝光

`CameraConfig` 已包含 `exposure_us`，Hik source 打开相机时也会设置 MVS `ExposureTime`。但硬件绑定请求、设备向导和 Operator 页面只传相机身份字段，没有相机参数能力、运行期更新或曝光状态。当前值只能通过隐藏 YAML 手工修改，并且只在相机 source 打开时应用一次。

### AFAS 交互

`resizeAfasRange()` 与 `moveAfasRange()` 会吸附到传入温度点，但 pointer 转数据坐标前没有统一 plot 限位。`translateAfasTangent()` 和 `rotateAfasTangent()` 直接使用未限位的数据坐标。温区、切线、宽命中层和手柄也没有共享的 SVG plot clip path，因此交互参数或绘制都可能越出正式数据范围和坐标轴。

### 导出目录

dev.8 强制调用 Chromium File System Access API 的 `showDirectoryPicker()`，并把 directory handle 保存到 IndexedDB。浏览器会拒绝磁盘根目录、系统目录或其认定的敏感目录，权限还可能在重启后过期。应用既无法解释或恢复浏览器原生拒绝，也没有稳定的本地默认目录。

## 方案选择

### 采用：本地工作站后端统一管理

后端作为相机参数、AFAS 参数合法性和导出目标的权威来源。前端负责交互、显示状态和发送意图。平台差异只放在原生文件夹选择/打开适配器中。

该方案能保留现有 FastAPI + React + PyInstaller + Inno Setup 架构，并完整解决浏览器目录权限、相机参数持久化和 AFAS 越界问题。

### 不采用：浏览器内最小修改

只增加曝光输入、AFAS CSS 裁剪并继续使用 `showDirectoryPicker()`，无法可靠解决目录敏感性限制、权限过期和长期偏好；曝光范围也会被迫硬编码或缺少真机校验。

### 不采用：Electron/Tauri 桌面壳

原生文件接口更直接，但需要重做应用容器、启动、升级和硬件交接，超出本轮局部改进范围。

## 1. 曝光调节设计

### 1.1 相机适配器合同

在相机抽象中增加可选的手动曝光能力：

```text
read_exposure_capability()
  -> supported
  -> minimum_us
  -> maximum_us
  -> increment_us
  -> requested_us
  -> actual_us

set_exposure_us(value)
  -> actual_us
```

Hik MVS 实现需要：

1. 确保 G3 控制相机期间 `ExposureAuto=Off`。
2. 从 MVS `ExposureTime` float node 读取最小值、最大值、步长和当前值。
3. 对输入做有限数、范围和步长校验。
4. 设置后重新读取 `ExposureTime`，以设备实际采用值作为响应和保存值。

无曝光能力的 adapter 返回结构化 `supported=false`，不得伪造范围。模拟/fake adapter 提供确定性能力，仅用于 Mac 浏览器流程和自动化测试。

### 1.2 后端服务与相机所有权

新增聚焦的 camera-control service，负责能力读取、运行期应用、相机锁和硬件配置原子更新。API 合同应同时支持：

- 设备向导中尚未完成全套绑定的当前选中相机。
- Operator 页面已经保存的绑定相机。

请求使用相机 identity 加 `exposure_us`，响应至少包含：

```json
{
  "supported": true,
  "minimum_us": 100.0,
  "maximum_us": 100000.0,
  "increment_us": 1.0,
  "requested_us": 10000.0,
  "actual_us": 10000.0,
  "saved": true,
  "editable": true,
  "lock_reason": ""
}
```

示例数值仅说明字段，不是硬编码默认或设备能力。真实范围必须来自 MVS。

保存顺序固定为：

```text
验证 identity 与取值
  -> 获取 camera operation lock
  -> 在已打开且 identity 匹配的 preview source 上应用
     或建立短时受控相机会话
  -> 重新读取 actual_us
  -> 原子更新硬件配置中的 camera.exposure_us
  -> 返回实际值与保存状态
```

如果正式 real-camera run 持有相机，后端返回结构化 busy/locked 响应，不尝试排队到 run 中间执行。相机拒绝、超时或保存失败时保留上一次成功配置；不允许出现“相机已改但配置写入失败”而无明确恢复状态。若相机应用成功但持久化失败，响应必须明确区分两阶段，并尝试恢复上一个成功曝光；恢复失败时记录高优先级日志和可操作错误。

### 1.3 前端共享控件

新增一个共享 `ExposureControl`，挂载到：

- 设备设置的相机选择/测试步骤。
- Operator 实时相机预览区域。

控件包含：

- 滑杆。
- 精确数值框和 `μs` 单位。
- 相机报告的最小值、最大值和步长。
- `正在应用`、`已应用并保存`、`应用失败` 状态。

交互规则：

- 滑杆输入约 200 ms 防抖，连续输入只提交最新候选。
- 数值框在 Enter 或失焦时提交。
- 请求采用递增 request id 或 abort controller，旧响应不能覆盖新值。
- 保存成功后显示后端返回的 `actual_us`；设备取整时不继续显示原始输入。
- 失败时恢复上一个后端确认值并保留错误信息。
- Probe、设备切换、相机不可用或正式 run 期间按相机状态禁用。
- 停止 run 并恢复 preview 后重新读取能力和实际曝光，再开放控件。

### 1.4 配置与可复现性

每个正式 run 的 camera profile、run metadata 或配置快照必须包含实际 `exposure_us`。同一 run 内曝光固定。导出中的参数快照继续从后端保存结果读取，前端不得自行补写。

## 2. AFAS 高低温区与切线统一限位

### 2.1 权威数据边界

交互边界来自当前 region 的正式 `afas_preprocessing.smoothed`；不可用时按现有正式 fallback 使用 repaired/grouped。边界至少包含：

```text
temperature_min
temperature_max
distance_min
distance_max
available_temperatures（严格递增）
```

图表全范围使用完整正式数据边界。局部 zoom 状态下，交互还要与当前可见 x domain 取交集；重置 zoom 后恢复完整范围。

### 2.2 Pointer 与温区约束

所有 pointer 事件先在 SVG 坐标中限制到 `plot.left/right/top/bottom`，再转换为数据坐标。

温区规则：

- 起止边界吸附到当前有效 `available_temperatures`。
- 每个区间至少保留两个有效温度点。
- 整体移动保持索引跨度，触及边界后停止。
- 不能因拖到边界而翻转、压成零宽或扩展到数据域外。

### 2.3 切线平移与改斜率约束

切线整线平移保持斜率不变，只改变截距。候选截距必须使切线继续与正式数据矩形相交：

```text
x ∈ [temperature_min, temperature_max]
y ∈ [distance_min, distance_max]
```

前端根据数据矩形推导允许的截距上下界并夹紧，避免整条切线被平移到数据之外。

切线端点改斜率时：

- 对侧控制点固定。
- 拖动点同时限制在正式温度和距离范围内。
- 保留最小温度差，禁止近似垂直造成无穷或不稳定斜率。
- 新切线必须经过固定控制点，因此始终与正式数据矩形相交。

前端每次只把有限候选交给后端 preview。后端返回无效时保留最后一个有效候选；pointer up 只持久化最后一个有效状态。

### 2.4 后端 AFAS 校验

后端在 preview 和正式保存共用同一个合法性校验：

- 低温区、高温区在正式温度范围内，端点递增且各自至少包含两个点。
- tangent slope/intercept 为有限值。
- 切线与正式数据矩形相交。
- 与低温、高温基线的交点有限。
- AS、AF 均位于正式温度范围内。
- `AS < AF`。

无效 preview 返回可识别的验证结果；正式保存请求返回 422 且不覆盖磁盘中的上一个有效分析。

### 2.5 SVG 绘制边界

AFAS chart 为 plot 建立唯一 clip path。以下视觉与交互层共用该 clip：

- 低温/高温阴影区。
- 区间整体移动命中层。
- 四个区间边界与全高命中带。
- 低/高温拟合线。
- 最大斜率切线、宽命中线和两个端点。
- 与上述交互对应的构造线。

坐标轴、tick、标签、tooltip 和工具栏不放入 clip group。数据值约束与视觉裁剪必须同时存在，不能只靠 CSS 隐藏错误状态。

## 3. 长期自定义导出目录

### 3.1 默认目录与偏好

默认目录使用当前系统用户的系统 Documents known folder，再追加：

```text
YYT1771-G3/Exports
```

Windows 必须使用系统 known-folder 解析，支持中文用户名、OneDrive 和重定向 Documents，不拼接固定 `C:\Users\...`。macOS 使用当前用户 Documents。

用户偏好按用户保存到应用本地配置目录：

```text
Windows: %LOCALAPPDATA%\YYT1771-G3\preferences\export.json
macOS:   ~/Library/Application Support/YYT1771-G3/preferences/export.json
```

偏好只保存经过验证的绝对目录和 schema version，使用临时文件 + 原子替换。安装和升级不得覆盖。

### 3.2 平台适配器

定义两个小接口：

```text
choose_directory(initial_directory) -> selected path | cancelled
open_directory(validated_directory) -> success
```

- Windows 使用系统原生文件夹选择窗口，并从当前已保存目录开始。
- macOS 使用系统原生文件夹选择窗口。
- 自动化测试注入 fake adapter，不弹出真实窗口。

前端不能直接提交任意路径给“打开文件夹”端点。后端只能打开当前已保存且再次验证通过的目录。

### 3.3 目录验证

选择后执行：

1. 规范化绝对路径。
2. 创建缺失的专用目录。
3. 在目标中创建唯一临时文件、flush/close 后删除，验证实际写权限。
4. 验证通过才原子保存偏好。

验证只检查目录和写权限，不枚举、扫描或拒绝已有文件。用户取消选择不视为错误，并继续使用原目录。Windows ACL 拒绝的 `C:\Windows`、`Program Files`、只读介质或失效移动盘仍会明确失败。

### 3.4 API 与页面行为

本地 API 提供以下语义：

```text
读取当前/默认导出目录与可写状态
打开原生目录选择器并保存有效结果
恢复默认目录
打开当前目录
生成并保存某个 run 的导出 bundle
```

结果页显示完整路径，并提供：

- 更改保存位置。
- 打开导出文件夹。
- 恢复默认位置。
- 导出。

导出成功返回最终绝对路径和文件名。目标目录不存在或变为不可写时，不静默保存到其他位置；保留错误并引导更改或恢复默认。

### 3.5 原子导出与文件名冲突

后端继续复用现有 `export_run_bundle()` 生成内容，然后把 bundle 写入配置目录：

```text
生成/读取 bundle
  -> 在目标目录写唯一 .part 临时文件
  -> flush/close
  -> 原子 rename 为最终 .zip
```

若目标文件已存在，不静默覆盖，使用稳定的冲突后缀生成新文件名。失败时清理本次 `.part`，保留已有文件和上一个有效目录偏好。

## 4. 状态、一致性与错误处理

- 曝光更新、preview、Probe 和 real-camera run 继续共享相机 operation lock。
- 正式 run 优先取得独占权；曝光 UI 依据后端状态锁定，不以单纯前端布尔值作为唯一保护。
- 曝光配置、导出偏好和 AFAS 正式分析都不得被失败请求部分覆盖。
- AFAS 前端只计算交互候选和可视坐标；正式 AS/AF、区间与切线有效性仍由后端产生。
- 目录选择、目录打开和导出保存只作用于当前用户明确配置的路径，不扩大为任意文件系统 API。
- 所有错误提供中文可操作信息，同时日志保留阶段、相机 active operation、目标路径或 AFAS validation reason。

## 5. 测试与验收

### 5.1 后端自动化

- Hik fake SDK 验证 ExposureAuto 关闭、能力范围读取、步长校验、设置与 actual re-read。
- 曝光应用成功才写配置；应用失败、保存失败和恢复失败路径分别覆盖。
- preview source 复用与短时会话路径覆盖。
- real-camera run 持锁时曝光更新返回 busy，run 快照包含实际曝光。
- AFAS 四个温区边界、两个区间整体移动和切线整线/双端点的越界候选被限制或拒绝。
- AFAS 无效正式请求不覆盖既有 summary。
- 导出默认路径、偏好迁移、取消、不可写、移动盘失效、路径包含空格/中文、文件名冲突和原子失败清理覆盖。
- “打开文件夹”不能接受任意前端路径。

### 5.2 前端自动化

- 曝光滑杆 200 ms 防抖、数值提交、last-write-wins、actual 值回显、失败回滚和运行期禁用。
- 设备设置与 Operator 共用同一个曝光控件合同。
- AFAS pointer 在四个方向越出时转换坐标仍在 plot/data domain 内。
- 温区至少两点、整体平移保持跨度。
- 切线平移截距夹紧、端点斜率有限、无效 preview 保留最后有效候选。
- clip path 覆盖温区、切线和命中层，轴/标签不被裁剪。
- 导出目录读取、更改、取消、恢复默认、打开和成功路径显示。

### 5.3 Mac 真实浏览器复测

- fake/simulated camera：设备设置曝光、Operator 曝光、自动保存、run 期间禁用、停止后恢复。
- `golden_a_20260522_dev_lab` 与 `golden_c_20260529_dev_lab`：四个温区边界、两个区间整体、切线整线、两个切线端点分别向四个方向越界拖动；覆盖全范围、局部 zoom、保存、刷新和导出。
- macOS 自定义导出目录：默认、更改、取消、长期恢复、打开文件夹、冲突文件名和不可写错误。
- 记录浏览器、URL、步骤、结果和证据到 P-0115/P-0116/P-0117。

### 5.4 Windows CI 与目标机验收

Windows CI 必须通过前后端测试、前端 production build、PyInstaller one-folder、packaged EXE smoke、Inno Setup 和 artifact 上传。原生窗口用注入 adapter 做自动化，不在无人值守 CI 中弹窗。

目标 Windows 10/11 x64 真机至少验证：

- Hik MVS 返回真实曝光范围、步长和 actual 值。
- 滑杆改变画面亮度，设备设置与 Operator 值一致，重启后保留。
- run 期间曝光锁定，run 配置快照与开始时 actual 值一致。
- AFAS 温区和切线在 Edge/Chrome 中无法拖出数据范围。
- Windows 原生目录选择器可选择普通本地目录、中文/空格路径和可写移动盘。
- 自定义路径重启和覆盖升级后仍保留。
- 系统/只读目录给出明确权限错误，不再出现浏览器“目录包含系统文件”流程。
- 打开目录、恢复默认、原子导出和文件名冲突行为正确。

Mac 浏览器验证通过而 Windows Hik/原生目录仍未验证时，相关问题只能标记 `FIXED_PENDING_BROWSER_RETEST`。

## 6. 预期改动边界

预计涉及：

- `backend/src/yyt1771_g3/camera/`：曝光能力与运行期设置。
- `backend/src/yyt1771_g3/services/`：camera control、export destination、AFAS validation。
- `backend/src/yyt1771_g3/core/`：用户偏好路径与原子偏好存储。
- `backend/src/yyt1771_g3/api/main.py`：薄 API 合同。
- `frontend/src/`：共享曝光控件、AFAS 交互/clip、导出目标 UI 与 API client。
- `backend/tests/`、`frontend/tests/`：失败优先回归测试。
- `packaging/windows/` 与 Windows workflow：仅在新增运行资源或 smoke 需要时调整。
- `problem.md`：P-0115、P-0116、P-0117 状态与复测证据。

不进行与三项需求无关的目录重构或 UI 重写。

## 7. 非目标

- 不增加帧率显示或帧率修改。
- 不增加 gain 调节或自动曝光策略。
- 不允许正式测量过程中改变曝光。
- 不修改 ContrastWidestSpanDetector、ROI 定义、温度同步或 AFAS 数学公式。
- 不让前端成为 AS/AF 或正式数据范围的权威计算源。
- 不引入 Electron、Tauri、Docker、WSL 或新的大型 GUI 依赖。
- 不改变原始 run 数据保存位置或历史 run 兼容规则。

## 8. 完成标准

- 两处曝光 UI 使用相机真实能力，调整后立即应用并自动保存，run 期间锁定。
- 曝光失败不会污染配置，一个 run 内曝光固定且可追溯。
- AFAS 高低温区和切线的所有拖动在数值与视觉上均不越出正式数据范围。
- 无效 AFAS 候选不能覆盖上一个有效保存结果。
- 导出使用长期记忆的本地默认/自定义目录，不依赖浏览器 directory handle。
- 目录更改、打开、恢复默认、不可写错误、原子写入和同名冲突均可验证。
- Mac 自动化与真实浏览器复测通过；Windows CI 生成新包；Windows 真机待验证项如实登记。
