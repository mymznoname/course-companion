# 网课伴学 · course-companion

> **不写总结,不准打卡。**
>
> 一个纯本地的网课学习进度管理器。把一门几十节的网课拆成每天几节的任务,学完必须用自己的话写下总结才能勾选完成,再按遗忘曲线提醒你回顾。

<sub>English: A local-first course progress tracker for video courses. It splits a long course into daily chunks, **refuses to mark a lesson complete until you've written a summary in your own words**, and schedules spaced-repetition reviews. No account, no server, no telemetry — all data stays in your browser's IndexedDB.</sub>

<p align="center">
  <img src="docs/images/today.png" width="240" alt="今天页" />
  <img src="docs/images/summary-editor.png" width="240" alt="强制写总结" />
  <img src="docs/images/weekday-picker.png" width="240" alt="每周哪几天学" />
</p>

<p align="center">
  <b><a href="docs/使用教程.md">→ 完整图文使用教程</a></b>
</p>

---

## 为什么做这个

大部分学习软件的逻辑是「记录你学过了」——进度条、连续天数、徽章。但「学过」和「学会」是两件事。

这个软件只做一件反人性的事:**你看完视频想点「已学完」,它会弹出一个框,不写总结就打不了卡。** 写不出来,说明没真懂,回去重看。

其余所有功能——排期、复习提醒、热力图、导出——都是围着这个核心转的。

## 功能

| 功能 | 说明 |
|---|---|
| **强制写总结** | 没有总结不能打卡。写不出来 = 没懂 |
| **按天拆任务** | 输入总节数 + 每个学习日学几节,自动排到具体日期;当天没学完自动顺延,不会丢 |
| **每周哪几天学** | 不必每天学。可只排工作日、只在周末,或任选星期几(如一/三/五);排期、预计完成日、课程卡片都跟着变 |
| **B站 目录一键抓取** | 书签栏小工具,在 B站 页面点一下,课程目录直接进软件 |
| **目录自动清洗** | 去掉 `【】` 前缀、UP 主名、`01`/`P02-` 编号、重复项、`_bilibili` 尾巴 |
| **复习提醒** | 学完按 1/3/7/14/30 天(可自定义)自动排复习点,到期在首页回顾 |
| **学习复盘** | 16 周热力图、连续天数、本周报告、每门课的健康度与预计完成日 |
| **改总结** | 随时能改,纯编辑:不重复加经验、不改原始完成日期 |
| **导出 Markdown** | 单课导出 / 多课合并,直接丢进 Obsidian、Typora、VS Code |
| **JSON 备份** | 全量导出导入,数据在自己手里 |
| **纯本地** | 无账号、无后端、无遥测。数据只在你浏览器的 IndexedDB 里 |

## 快速开始

这个版本**在本地跑**,没有在线版。需要 Node.js 18+。

```bash
git clone https://github.com/xin080708/course-companion.git
cd course-companion
npm install
npm run build
npm run serve        # 打开 http://localhost:4174
```

Windows 用户构建完之后可以直接双击项目根目录的 **`launch.cmd`** —— 自动起服务 + 用 Edge 应用模式打开,没有地址栏。

> 为什么不做在线版:每日提醒(关机也能收到)和书签栏一键导入目录都需要一个本地小服务,纯静态托管做不到。要这三项就得在本地跑。

`server.cjs` 是一个零依赖的静态服务器,顺带提供两个本地接口:接收书签栏工具推送的目录、到点弹 Windows 系统通知。

> ⚠️ 同一个浏览器里,`localhost:4174` 和别的端口是**两份独立的数据**。固定用 4174 这一个就行。

## 怎么用

> 带截图的完整教程在这里:**[docs/使用教程.md](docs/使用教程.md)**

1. **加一门课** —— 课库 → 添加课程。填标题、总节数,设**每个学习日学几节**、**每周哪几天学**(每天 / 工作日 / 周末 / 自选)、开始日期。
   - 不想每天学就选「工作日」或自己点选星期几,比如只排周一/周三/周五
   - 之后随时可以「改节奏」重设,未完成的节会重新排
   - 如果是 B站 的课,先把「B站 目录工具」里的书签拖到书签栏,然后在课程页面点一下,目录就自动填好了
2. **每天打开「今天」** —— 看今天该学哪几节,去平台看视频
3. **回来点「已学完」** —— 弹窗让你写总结。写完才能打卡
4. **到期回顾** —— 学完 1、3、7、14、30 天后,首页「今日回顾」会提醒你翻回当时的总结
5. **随时导出** —— 笔记页可以导出 Markdown,存到自己的知识库

## 技术栈

- **前端** — React 18 + Vite 6 + React Router(HashRouter)
- **存储** — Dexie.js / IndexedDB,全部本地
- **状态** — Zustand
- **PWA** — vite-plugin-pwa,可装到桌面/手机,离线可用
- **服务** — 一个零依赖的 `server.cjs`,只负责发静态文件和两个本地小接口

不依赖任何云服务,没有 `.env`,没有 API key,克隆下来就能跑。

## 文档

- [使用教程](docs/使用教程.md) —— 带截图的完整上手教程

## 数据在哪

全部在浏览器 IndexedDB 的 `courseAppDB` 里。换电脑、清缓存、换浏览器都会导致数据不可见,**请定期用「我 → 导出 JSON 备份」存一份**。

> 注意:浏览器存储按「地址 + 端口」隔离。`localhost:4174` 和别的端口是两份数据,固定用一个就行。

## 已知限制

- B站 目录抓取依赖页面内部数据结构,平台改版可能失效
- 系统通知只在 Windows 上验证过
- 单用户本地应用,没有多设备同步(设计如此,不是待办)

## License

[MIT](LICENSE) — 随便用,包括商用。
