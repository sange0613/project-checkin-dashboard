# 项目进度

一个极简的项目每日打卡网页。

- 数据仅保存在当前浏览器，无需登录
- 每日视图显示完整自然月
- 支持每周、每月灰度汇总
- 支持项目增删改、排序和搜索
- 支持 JSON 导入与导出
- 顶部「时」可打开内置时间记录，按北京时间日期自动保存；日均统计今天之前有记录的日期
- 时间记录接入同一同步码，离线先存本地；不同日期合并，同一天以最新保存版本为准，重置和撤销也会同步
- 项目 JSON 导入与导出目前不包含时间记录

## 本地运行

```bash
npm install
npm run dev
```

## Windows 10 本地版

Windows 安装包只使用本机存储，不显示或连接云同步服务。数据可通过页面底部的“导入 / 导出”进行备份与迁移。

```bash
npm run dist:win
```


## 新账号部署

源码仓库：https://github.com/sange0613/project-checkin-dashboard

网页地址：https://sange0613.github.io/project-checkin-dashboard/

当前部署分支为 `codex/project-checkin-web`。在本项目目录修改后提交并执行 `git push`，GitHub Actions 会运行测试、构建并自动发布到上述网址。工作流状态见仓库的 Actions 页面。

原账号的网页与提交历史保留。新网址使用独立的浏览器存储；原来已启用云同步时，在新网页输入原有同步码。仅保存在旧网页本机的数据，可通过 JSON 导出和导入迁移；看板的 JSON 备份不包含内嵌时间记录。
