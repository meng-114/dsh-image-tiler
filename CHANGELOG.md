# Changelog

All notable changes to `@mengli114/dsh-image-tiler`.
中文说明见 [README.md](./README.md) · English: [README.en.md](./README.en.md)

## 0.4.0

**DSH 0.1.7 设置面板 API 迁移。**

- 设置卡片换到官方新的 keyed seat：`settings.plugin.item` → **`plugins.bundle.config`**，key 为本 bundle 的包名；由 `dsh-client-ui-plugin-manager` 在插件页以 `view: 'page'` 渲染。旧 seat 在新版 DSH 中已被移除（全树 0 命中）。
- 设置读写服务迁移：`ctx.settingsScope.bind({ namespace })` → **`ctx.configForms.get(namespace)`**，`inject` 由 `settingsScope` 改为 `configForms`。读写表面不变——卡片使用的 `getSnapshot` / `subscribe` / `set(field, value)` / `unset(field)`，以及快照里的 `status` / `value` / `user` / `writable`，与旧 API 一一对应。
- `package.json` 新增 `dsh.engines.dsh = ">=0.1.7-rc.1"`：本版依赖上述新 seat，装到旧版 DSH 上会**静默不显示**设置卡片，因此显式声明引擎下限。
- 新增 `tests/client.test.mjs`：无需浏览器的客户端不变量测试（模块 id、宿主/客户端命名空间一致、新 seat 与 key、不再引用已移除 API、engines 声明）。
- 宿主侧工具行为与工作台未改动。旧 DSH（≤0.1.6 线）请继续使用 0.3.1。

## 0.3.1

- 发布包里补上 MIT LICENSE（仓库此前有、tarball 里缺失）。

## 0.3.0

- `read_tiles` 语义选片（`target`）：视觉模型在 overview 上定位目标框，缩放回原图坐标后只返回覆盖该框的切片；框落在切片缝隙时退化为最近一片。定位全程走 host 服务（`ctx.attachments` + `ctx.llm`），不额外要 key、不装 Python 侧车、不加依赖。
- 性能：源图只解码一次，切片按并发上限执行。

## 0.2.0

- 补齐英文 README 与双语互链。
- 参数行布局修正（nowrap 固定宽度控件）与 overview 优先的模型指引。

## 0.1.0

- 首发上 npm：`tile_image` 工具 + 可在设置里调整的默认值；`read_tiles` 区域选择器；可视化切片工作台（网格拖拽、缩放、分页、勾选、自由输入）；拖图即切片；按会话隔离的任务与图片路由。
