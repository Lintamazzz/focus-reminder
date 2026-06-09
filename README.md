# Focus Reminder

一个使用 Tauri、React 和 TypeScript 构建的极简桌面时间盒应用。

当前已完成 MVP-1、MVP-2 和 MVP-3：

- 输入任务名，空白时使用“未命名任务”
- 选择预计时间，默认 30 分钟
- 实时显示任务名、预计时间和已用时间
- 到点弹出不会自动消失的置顶提醒窗口
- 支持继续 5 / 15 / 30 分钟或结束任务
- 结束任务时保存完成记录或跳过记录
- 使用 SQLite 保存任务和提醒事件
- 重启后恢复未结束任务
- 支持继续、结束并记录或丢弃未完成任务
- 按本地日期显示今日完成记录和汇总统计
- 支持二次确认后删除 Done Log 记录
- 将今日记录导出为 `done-log-YYYY-MM-DD.md`
- 设置默认预计时间和 3 个提醒延长选项
- 设置提醒窗口是否置顶
- 支持跟随系统、浅色和深色主题

SQLite 数据库保存在系统应用数据目录，文件名为：

```txt
focus_reminder.sqlite
```

Markdown 导出文件默认保存在系统下载目录。

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

## 打包与发布

本地打包当前系统对应的安装包：

```bash
npm run tauri build
```

每次向 `main` 分支推送提交时，GitHub Actions 都会自动构建 macOS（Apple Silicon 和 Intel）、Windows、Linux 安装包。

构建完成后，安装包会发布到固定的 `latest` Release。下一次推送会删除并重建这个 Release，因此页面中始终只保留最近一次成功构建的安装包。

日常发布只需要提交并推送：

```bash
git add .
git commit -m "描述本次修改"
git push origin main
```

修改应用版本时，仍需同步更新 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 中的版本号。

可以在仓库的 Actions 页面查看构建进度，完成后安装包会出现在 Releases 页面的 `Focus Reminder Latest` 中。

## 验证

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```
