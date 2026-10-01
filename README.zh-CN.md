# 藏物公馆 · HIDEAWAY

<div align="center">
  <img src="screenshots/menu-zh.png" alt="藏物公馆主菜单——红瓦屋顶的两层体素住宅与庭院" width="880" />
</div>

[English](README.md) · 简体中文

在两层住宅和庭院里，用体素编辑器制作自己的伪装，与本地机器人玩躲猫猫。躲藏者可以在追逐中修改模型；猎人通过观察、声音和武器寻找目标。

**▶ [在线游玩](https://homie-wu.github.io/hideaway/)** — 无需安装；桌面 Chrome / Edge。模型与设置按站点保存在浏览器本地。

游戏使用 Three.js 和 Rapier，支持自由练习和最多 8 名角色的本地回合。当前不含联网多人模式。

主菜单和暂停界面支持 English / 中文 切换，语言偏好保存在浏览器本地。首次启动时根据浏览器语言选择。

## 本地启动

需要 Node.js 24 或更新版本，以及开启硬件加速的桌面 Chrome / Edge。

```sh
npm ci
npm run dev
```

打开终端显示的地址，通常是 `http://127.0.0.1:5173`。Windows 也可双击 `启动游戏.cmd`。首次点击界面后启用音乐和音效；模型与设置保存在浏览器本地，使用同一浏览器和访问地址即可继续读取。

## 操作

| 操作 | 按键 |
| --- | --- |
| 移动 / 冲刺 / 跳跃 | WASD / Shift / Space |
| 切换第一、第三人称 | V |
| 躲藏者打开体素编辑器 | Tab |
| 躲藏者攀爬 / 蹬离墙面 | 靠近墙面按 Ctrl，W/S 或 A/D 移动；Space 蹬离 |
| 躲藏者发声 | T，猎杀期可用；自由练习可试听 |
| 猎人蹲伏 / 瞄准 | Ctrl / 右键 |
| 攻击 / 换弹 | 左键 / R |
| 匕首与当前枪械切换 | 1 / 2，或滚轮 |
| 准备室领取武器 | 对准武器架上的武器点击左键 |
| 暂停 / 释放鼠标 | Esc |

准备期猎人留在独立准备室，可在武器架换枪和自由练靶。猎杀开始后正式计分，猎人误击场景实体会扣血。回合结束展示躲藏位置和得分。菜单设置可修改身份偏好、人数、时长、随机摆件比例、画质与音量。

编辑器最大范围为 32×32×32。场景小物件可以按原尺寸载入、编辑和保存；修改会同步更新碰撞，不能靠编辑模型穿过实体。

| ![](screenshots/workshop.png) | ![](screenshots/model-library.png) |
|---|---|
| 对局中打开的伪装工坊 | 场景物件，都能变成你 |
| ![](screenshots/entrance-hall.png) | ![](screenshots/menu-en.png) |
| 你就是那个绿色方块。真的是吗？ | English UI |

## 构建与检查

```sh
npm test                              # 408 项测试通过
npm run build
npm run preview
```

`dist/` 是可部署的静态网站，使用 HTTP 服务访问。代码不依赖线上模型、贴图或音频服务。

可选的本地浏览器检查：

```sh
node tools/production-smoke.mjs
node tools/audit-map.mjs
```

浏览器检查需要本机 Chrome / Edge，可通过环境变量 `CHROME_PATH` 指定可执行文件。测试结果写入忽略提交的 `.artifacts/`。开发、资源和验收说明见 [docs/development.md](docs/development.md)。

## GitHub Pages

仓库包含 `.github/workflows/pages.yml`。推送到 `main` 后，工作流先运行测试和构建，通过后部署 `dist/`；拉取请求只执行检查。

在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，然后推送代码或在 Actions 页面手动运行 **Check and deploy**。工作流完成后会给出网站地址。无需提交 `node_modules/`、`dist/` 或测试截图。

Vite 使用相对资源路径，同一份构建可放在网站根路径或仓库子路径。配置参考 [Vite 静态部署文档](https://vite.dev/guide/static-deploy#github-pages) 和 [GitHub Pages 工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 项目结构

```text
src/                 游戏、编辑器、体素资产与地图
  world/layout.json  当前唯一地图布局数据
public/models/       游戏必需的猎人与武器资源
assets/characters/   猎人资源的制作源文件
tests/              当前行为与物理回归测试
tools/              可重复执行的检查工具
docs/               开发说明
.github/workflows/   GitHub 检查与部署
```

## 许可

[MIT](LICENSE)。Three.js 和 Rapier 均使用 MIT 许可。本项目是独立的躲猫猫游戏原型，与参考游戏没有隶属关系。
