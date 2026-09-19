# DSH Desktop Next

[English](README.md) | 中文

基于 DeepSeek Harness **0.1.6-alpha.2** 的独立实验包。主窗口直接加载官方发布的 `@deepseek-ai/dsh-web-frontend`，复用官方 Web 应用、插件管理器和基本桌面样式；Next 添加 Profile、恢复、Agents Anywhere 手机远控和社区市场。

## 开发与验证

在外层仓库根目录执行，使用 Node.js `^22.19.0` 或 `>=24.0.0`，以及 Corepack 提供的 Yarn 4.18.0：

```sh
git submodule update --init --recursive
corepack yarn install --immutable
corepack yarn check:next
corepack yarn dev:next
```

`check:next` 构建市场与 Next，执行类型检查、单元测试、官方前端与沙箱 preload 检查，以及临时目录中的真实 Host 检查，不打开图形应用。后者使用离线本地测试插件验证 pnpm、市场卸载与重启请求、鉴权、Profile 切换和恢复后启动，并清理测试进程与文件。

`dev:next` 是显式的图形启动命令；已有构建可用 `corepack yarn start:next` 启动。Electron 二进制尚未缓存时会下载。需要额外检查真实 Electron Node 模式时，先完成构建，再运行：

```sh
corepack yarn workspace dsh-desktop-next verify:host:electron
```

此检查不打开 Electron 窗口。主窗口呈现、原生对话框和真实手机连接仍需手动验收。

## 使用

应用菜单中的“Profile 与附加功能…”可新建和切换 Profile，启停市场或手机远控；也可按 `CmdOrCtrl+,` 打开。切换或应用功能开关会先停止当前 Host，再启动新的 Host，进行中的任务会被中断。

- **Profile** 分别保存插件依赖、激活列表、补丁和 Next 功能开关。会话、设置、凭据等按上游规则在同一个 Next home 内共享，Profile 不提供账号或数据隔离。
- **社区市场** 默认启用，沿用现有发现、来源管理、安装预览、确认安装和卸载流程。包操作使用随应用依赖安装的 pnpm。完成操作后可从市场请求重启。Next 暂不提供市场的“打开终端”入口。
- **手机远控** 默认关闭。启用并重启后，在官方主界面中的“手机连接”完成配置；Connector 状态按 Profile 保存在 Next home。切换 Profile 会停止旧 Host 和其中的远控连接。
- **恢复** 可在 Host 或第三方插件无法启动时从应用菜单进入。它备份当前 `cordis.patch.yml`，恢复内置 bundle 列表，并关闭 AA 和市场。插件安装文件、会话、设置和 home 级补丁会保留；它不是完整文件回滚，也不会自动修复损坏的 `package.json` 或 home 级补丁。

默认数据目录为本包下的 `.desktop-next/home`，Electron 状态也位于其中。可通过绝对路径 `DSH_DESKTOP_NEXT_HOME` 指定专用目录；Next 不使用现有 `DSH_HOME` 来选择数据目录。首次使用不会迁移 Stable/Beta 数据。

## 架构与来源

```text
官方 Web 前端 + 官方基础桌面适配
              │  dsh-app://app
       Next Electron 主进程
              │  认证 HTTP / WebSocket
       Electron Node 模式 Host
              │  上游共享 runProfile
       官方 Web bundles + Next bundle
              ├─ Community Market
              └─ Agents Anywhere bridge
```

alpha.1 的无端口管道方案已被 alpha.2 的 WebServer 方案替代。本包使用真正的上游 WebServer，不实现模拟 HTTP 路由层。服务仅绑定 `127.0.0.1` 的系统分配端口，允许与其他版本并行运行。主进程保存 Host 凭据，并为市场接口补上同一套认证；市场写请求继续接受来源检查。

主界面使用官方前端产物，不复制聊天、设置或插件管理页面。macOS 窗口材质、平台标记、Windows 标题栏菜单与主题同步参考官方实现。Next 自己的小型控制窗口只管理新增的 Profile、功能开关和恢复，在主 Host 启动失败时也可访问。

Next 是正式的 Profile bundle，因此上游插件管理器重新组合配置时仍保留附加能力。开发目录启动时，只为 Next 自身在 `home/profiles/node_modules` 建立一个受管链接；其他依赖由 alpha.2 的 runtime resolver 解析。所有上游运行时依赖来自发布包，不链接或改写 `deepseek-harness/` 源码。

[upstream-reference.json](upstream-reference.json) 记录参考提交和复制文件的原始摘要；原始许可保存在 [LICENSE.upstream](LICENSE.upstream)。

## 当前边界

这是可运行的开发包，尚无签名安装包、自动更新或 Stable/Beta 数据迁移。官方发布包内的 Python/Office 离线运行时和技能包也尚未集成。我们自己的增强窗口、托盘等能力留待后续迁移。Node/Electron 的无图形检查不代表跨平台安装包和视觉验收完成。
