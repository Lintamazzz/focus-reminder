# 强制提醒与完成日志桌面 App：产品需求与实现说明

> 目标：做一个极简桌面端 App，用来帮助用户在执行任务时及时被打断、意识到超时，并在任务结束时记录“刚才完成了什么”。

---

## 1. 产品定位

这个 App 不是传统 ToDo 软件，也不是复杂的项目管理工具。

它的核心定位是：

> 一个“任务时间盒 + 强制提醒 + 完成日志”工具。

用户的主要痛点：

1. 执行任务时容易陷入完美主义，忘记时间。
2. 实际用时经常超过预期时间，导致后续工作延误。
3. 一天结束时不知道自己完成了什么。
4. 不想花太多精力维护复杂的任务系统。

因此，App 的设计原则是：

- 少输入
- 强提醒
- 强制记录
- 本地保存
- 不做复杂任务管理
- 不追求“完美规划”，只帮助用户“及时停下来”和“留下完成记录”

---

## 2. MVP 核心功能

MVP 只实现 3 个页面/状态：

1. 开始任务
2. 超时提醒
3. 结束记录

---

## 3. 推荐技术栈

优先推荐：

```txt
Tauri + React + TypeScript + SQLite
```

原因：

- Tauri 适合做轻量桌面端 App。
- React/TypeScript 方便后续迭代 UI。
- SQLite 适合本地保存任务日志。
- App 不需要联网。
- 用户数据应默认保存在本地。

备选方案：

```txt
Electron + React + TypeScript + SQLite
```

Electron 更成熟，但打包体积更大。

---

## 4. 核心用户流程

### 4.1 开始任务

用户打开 App，看到一个极简窗口。

字段：

- 当前任务名称，可选
- 预计时间，默认 30 分钟
- 开始按钮

示例：

```txt
当前任务：
[________________]

预计时间：
[30 分钟 v]

[开始]
```

任务名称可以为空。

如果用户没有填写任务名称，则使用：

```txt
未命名任务
```

---

### 4.2 任务进行中

开始后，主窗口显示：

```txt
正在进行：

修改方案

预计时间：
30 分钟

已用时间：
12 分 35 秒

[提前结束]
[暂停]
```

要求：

- 已用时间每秒刷新。
- 到达预计时间后，必须弹出提醒窗口。
- 提醒窗口应尽量置顶。
- 提醒窗口应比普通通知更强，不只是系统通知。

---

### 4.3 到达预计时间后的强制提醒

当任务用时达到预计时间，弹出一个置顶窗口。

内容：

```txt
⚠️ 已达到预计时间

你计划用时：
30 分钟

现在已用：
31 分钟

请决定下一步。
```

按钮：

```txt
[继续 5 分钟]
[继续 15 分钟]
[继续 30 分钟]
[结束并记录]
```

要求：

- 弹窗置顶。
- 不允许自动消失。
- 用户必须点击一个按钮。
- 点击“继续 N 分钟”后，进入下一轮时间盒。
- 再次到时间后继续弹出提醒。
- 每次继续都要记录一条 extension event。

---

### 4.4 结束任务时强制记录

当用户点击：

- 提前结束
- 结束并记录

都必须弹出记录窗口。

内容：

```txt
刚才你完成了什么？

[________________________________]

用时：
42 分钟

[保存]
[跳过记录]
```

要求：

- 文本框默认聚焦。
- 记录内容允许为空，但点击“跳过记录”时需要保存一条空记录或标记为 skipped。
- 保存后，生成一条 Done Log。
- 保存后回到开始任务页面。

推荐 placeholder：

```txt
例如：完成项目 A 方案初稿
```

---

## 5. Done Log 功能

### 5.1 日志列表

App 需要有一个“今日记录”区域。

显示当天所有完成记录：

```txt
2026-06-09

09:00 - 09:42
完成项目 A 方案初稿
预计：30 分钟
实际：42 分钟
超时：12 分钟

10:00 - 10:18
回复客户邮件
预计：20 分钟
实际：18 分钟
提前：2 分钟
```

---

### 5.2 每日汇总

每天的 Done Log 页面底部显示：

```txt
今日汇总

完成任务数：5
总专注时间：4 小时 20 分钟
超时任务数：3
平均超时：14 分钟
```

---

### 5.3 导出功能

MVP 可以支持导出 Markdown。

点击：

```txt
[导出今日 Markdown]
```

生成：

```md
# Done Log - 2026-06-09

## 今日完成

- 09:00-09:42 完成项目 A 方案初稿（42 分钟，预计 30 分钟）
- 10:00-10:18 回复客户邮件（18 分钟，预计 20 分钟）

## 汇总

- 完成任务数：2
- 总专注时间：1 小时
- 超时任务数：1
```

---

## 6. 数据结构

### 6.1 TaskSession

```ts
type TaskSession = {
  id: string;
  title: string;
  plannedMinutes: number;
  startedAt: string; // ISO datetime
  endedAt?: string; // ISO datetime
  status: "running" | "paused" | "completed" | "cancelled";
  note?: string;
  recordSkipped: boolean;
  createdAt: string;
  updatedAt: string;
};
```

---

### 6.2 ReminderEvent

用于记录每次超时提醒和继续操作。

```ts
type ReminderEvent = {
  id: string;
  sessionId: string;
  triggeredAt: string; // ISO datetime
  elapsedMinutes: number;
  plannedMinutes: number;
  action: "extend_5" | "extend_15" | "extend_30" | "finish";
  createdAt: string;
};
```

---

### 6.3 AppSettings

```ts
type AppSettings = {
  defaultPlannedMinutes: number; // 默认 30
  reminderOptions: number[]; // 默认 [5, 15, 30]
  alwaysOnTop: boolean; // 默认 true
  startOnLaunch: boolean; // 默认 false
  theme: "system" | "light" | "dark";
};
```

---

## 7. SQLite 表设计

### 7.1 task_sessions

```sql
CREATE TABLE IF NOT EXISTS task_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  note TEXT,
  record_skipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

### 7.2 reminder_events

```sql
CREATE TABLE IF NOT EXISTS reminder_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  triggered_at TEXT NOT NULL,
  elapsed_minutes INTEGER NOT NULL,
  planned_minutes INTEGER NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES task_sessions(id)
);
```

---

### 7.3 app_settings

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 8. 页面设计

### 8.1 主页面：Idle 状态

组件：

- TaskTitleInput
- PlannedTimeSelect
- StartButton
- TodayLogPreview

行为：

- 输入任务标题。
- 选择预计时间。
- 点击开始后创建 TaskSession。
- 进入 Running 状态。

---

### 8.2 主页面：Running 状态

组件：

- CurrentTaskCard
- ElapsedTimer
- PlannedTimeDisplay
- EndButton
- PauseButton，可选

行为：

- 展示当前任务。
- 实时显示已用时间。
- 到达 plannedMinutes 后触发 ReminderModal。

---

### 8.3 ReminderModal

组件：

- WarningMessage
- PlannedVsActual
- ExtendButtons
- FinishButton

行为：

- 弹窗置顶。
- 用户必须选择继续或结束。
- 继续后增加下一轮提醒时间。
- 结束后进入 CompletionModal。

---

### 8.4 CompletionModal

组件：

- CompletionNoteInput
- DurationDisplay
- SaveButton
- SkipButton

行为：

- 用户输入“刚才完成了什么”。
- 保存后更新 TaskSession。
- 回到 Idle 状态。

---

### 8.5 TodayLog 页面/区域

组件：

- DateHeader
- DoneLogList
- SummaryStats
- ExportMarkdownButton

---

## 9. 计时与提醒逻辑

### 9.1 基本规则

任务开始时：

```ts
startedAt = now()
plannedMinutes = userSelectedValue
nextReminderAt = startedAt + plannedMinutes
```

每秒检查：

```ts
if now >= nextReminderAt:
  showReminderModal()
```

用户点击继续 15 分钟：

```ts
create ReminderEvent(action = "extend_15")
nextReminderAt = now() + 15 minutes
```

用户点击结束：

```ts
create ReminderEvent(action = "finish")
showCompletionModal()
```

---

### 9.2 注意事项

不要只依赖 setTimeout。

原因：

- 电脑睡眠后可能失效。
- App 后台运行时可能有偏差。
- 用户暂停/恢复会影响计时。

推荐：

- UI 用 setInterval 每秒刷新。
- 每次刷新都用当前时间和 nextReminderAt 比较。
- App 恢复焦点时也重新检查。
- 数据库里保存 startedAt 和 endedAt，最终用时间戳计算实际时长。

---

## 10. 暂停功能

MVP 可以先不做暂停。

如果做暂停，需要额外记录 pause intervals。

建议第一版先不实现暂停，避免复杂度上升。

第一版只保留：

```txt
[提前结束]
```

---

## 11. 设置项

MVP 设置项：

```txt
默认预计时间：30 分钟
提醒延长选项：5 / 15 / 30 分钟
提醒窗口置顶：开启
主题：跟随系统
```

暂不做：

- 账号系统
- 云同步
- 团队协作
- AI 总结
- 项目分类
- 多设备同步
- 日历集成

---

## 12. 本地文件路径

建议：

### macOS

```txt
~/Library/Application Support/Focus Reminder/
```

### Windows

```txt
%APPDATA%/Focus Reminder/
```

### Linux

```txt
~/.config/focus-reminder/
```

数据库文件：

```txt
focus_reminder.sqlite
```

导出的 Markdown 文件：

```txt
done-log-YYYY-MM-DD.md
```

---

## 13. 非功能需求

### 13.1 隐私

- 所有数据默认保存在本地。
- 不上传服务器。
- 不需要登录。
- 不采集应用使用情况。

### 13.2 易用性

- 开始任务不超过 2 次点击。
- 结束记录不超过 10 秒。
- 不强迫用户做复杂分类。
- 不把任务管理复杂化。

### 13.3 稳定性

- App 重启后，如果存在 running session，应提示用户处理。

提示：

```txt
检测到上次有未结束任务：

修改方案
开始时间：09:00

请选择：
[结束并记录]
[继续计时]
[丢弃]
```

---

## 14. 验收标准

### 14.1 开始任务

- 用户可以输入任务名称。
- 用户可以选择预计时间。
- 点击开始后进入计时状态。
- 未输入任务名称时，自动使用“未命名任务”。

### 14.2 超时提醒

- 到达预计时间后弹出提醒。
- 提醒不会自动消失。
- 用户可以选择继续 5/15/30 分钟。
- 用户可以选择结束并记录。
- 每次提醒和选择都会写入 reminder_events。

### 14.3 结束记录

- 结束任务时必须进入记录弹窗。
- 用户可以输入完成内容。
- 保存后生成 Done Log。
- 跳过记录也会保存 session，但 recordSkipped = true。

### 14.4 今日记录

- 今日页面显示所有当天完成的任务。
- 显示开始时间、结束时间、实际用时、预计用时。
- 显示今日汇总。
- 可以导出 Markdown。

### 14.5 数据持久化

- 重启 App 后，历史记录仍然存在。
- 重启 App 后，设置仍然存在。
- 如果有未结束任务，启动时提示处理。

---

## 15. 建议目录结构

```txt
focus-reminder/
  src/
    components/
      TaskStartForm.tsx
      RunningTask.tsx
      ReminderModal.tsx
      CompletionModal.tsx
      TodayLog.tsx
      SettingsPanel.tsx
    hooks/
      useTaskTimer.ts
      useTodayLogs.ts
    services/
      db.ts
      taskService.ts
      exportService.ts
      settingsService.ts
    types/
      task.ts
      settings.ts
    utils/
      time.ts
      id.ts
    App.tsx
    main.tsx
  src-tauri/
    ...
  README.md
```

---

## 16. Codex 执行建议

请 Codex 按以下顺序实现：

1. 初始化 Tauri + React + TypeScript 项目。
2. 实现基础 UI，不接数据库。
3. 实现任务开始、计时、超时弹窗。
4. 实现结束记录弹窗。
5. 接入 SQLite。
6. 实现今日 Done Log。
7. 实现 Markdown 导出。
8. 实现设置页。
9. 实现重启后未完成任务恢复逻辑。
10. 做基础测试和打包。

---

## 17. 第一版不要做的功能

为了避免 MVP 膨胀，第一版不要做：

- AI 总结
- 自动识别当前软件
- 浏览器历史分析
- 项目标签系统
- 复杂统计图表
- 日历视图
- 云同步
- 手机端
- 账号登录
- 团队功能
- 积分、成就、游戏化系统

这些功能以后可以加，但第一版必须专注：

> 及时提醒我停下来，并让我记录刚才完成了什么。

---

## 18. README 简短描述

```md
# Focus Reminder

Focus Reminder is a minimal desktop app for timeboxing tasks, interrupting overrun sessions, and recording what you just completed.

It is designed for people who can start tasks but often lose track of time, overwork due to perfectionism, and forget to record daily accomplishments.

Core features:

- Start a focused task with an expected duration
- Get a strong always-on-top reminder when time is up
- Extend the session by 5 / 15 / 30 minutes
- End the session and record what was completed
- View today's Done Log
- Export daily logs as Markdown
- Store all data locally
```
