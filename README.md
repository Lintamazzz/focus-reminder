# Focus Reminder

一个使用 Tauri、React 和 TypeScript 构建的极简桌面时间盒应用。

当前已完成 MVP-1 和 MVP-2：

- 输入任务名，空白时使用“未命名任务”
- 选择预计时间，默认 30 分钟
- 实时显示任务名、预计时间和已用时间
- 到点弹出不会自动消失的置顶提醒窗口
- 支持继续 5 / 15 / 30 分钟或结束任务
- 结束任务时保存完成记录或跳过记录
- 使用 SQLite 保存任务和提醒事件
- 重启后恢复未结束任务
- 支持继续、结束并记录或丢弃未完成任务

今日记录列表、Markdown 导出、设置和统计尚未实现。

SQLite 数据库保存在系统应用数据目录，文件名为：

```txt
focus_reminder.sqlite
```

## 开发运行

需要 Node.js、npm、Rust 和系统对应的 Tauri 开发依赖。

```bash
npm install
npm run tauri dev
```

只运行浏览器中的前端界面：

```bash
npm run dev
```

注意：普通浏览器没有 Tauri 后端，无法真正显示独立的置顶提醒窗口。

## 验证

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```
