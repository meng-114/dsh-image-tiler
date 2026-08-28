# dsh-image-tiler

面向 DeepSeek Harness（DSH）的 host 工具插件：把一张大图切成带坐标标注的 ~800×800 切片，并生成一张全局缩略图与 manifest，供视觉模型逐张读取，避免单张图被整体缩到约 800×800 等效像素而丢失细节。

## 功能

- 工具：`tile_image`，参数包括 `file_path`、`tile_size`（默认 800）、`overlap`（默认 40px）、`output_dir`（默认 `tiles`）、`format`（png/jpeg/webp）、`label`、`overview_size`、`max_tiles`（默认 64）。
- 工具：`read_tiles`——按区域按需选片（`center`/`left`/`right`/`top`/`bottom`/`full`，或显式 `r1c2,r2c3`），先看 overview 再只读关心的切片，省 token；**无参数调用时读取用户在可视化工作台中勾选的切片**。
- **可视化切片工作台**：模型调用 `tile_image` 后，工具卡片变为交互界面——拖动滑块实时预览网格，点"切片"生成切片缩略图网格，勾选要给模型看的切片，确认后模型 `read_tiles` 自动读取选中部分。
- 输出：每个切片文件（文件名含 `r<c>c<col>` 与 `x/y` 坐标）、一张 `*-overview.*` 缩略图、一份 `manifest.json`。
- 路径安全：输入与输出都限制在当前会话工作区（`session.header.cwd`）内。
- 与 `read_image` 配合：先调用 `tile_image`，再用 `read_image` 逐张读取切片。

## 安装

**方式一（推荐，npm 发布版）**：

```bash
dsh plugin add @mengli114/dsh-image-tiler
```

或受保护的流程（plugin_install / dshpm，同插件管理器界面的"社区插件"入口）。

**方式二（本地开发 / GitHub 源）**：

```bash
dsh plugin --profile web add link:E:/ds_harness/dsh-image-tiler
# 或从 GitHub 安装
dsh plugin add github:meng-114/dsh-image-tiler
```

`cordis.patch.yml` 会被合并进 profile roster，安装后重启 Web 一次。

## 使用

让模型调用：

```
tile_image({
  file_path: "large.png",
  tile_size: 800,
  overlap: 40,
  format: "png"
})
```

返回切片路径后，再对每个切片调用 `read_image`。先看 `overview` 了解整体布局，再按坐标逐片细看。

## 设置

在 Web 的 **设置 → 插件** 中找到 **image-tiler** 卡片，可调整（即时生效，无需重启）：

- **自动切片**：开启后，用户发送大图时工具描述会引导模型先 `tile_image` 再逐张读取，而不是读被缩小的原图。
- **切片边长 / 重叠 / 输出格式 / 最大切片数 / 缩略图边长 / 坐标标注 / 输出目录**：作为 `tile_image` 的默认值；模型调用时显式传参仍可覆盖。
- **清除覆盖**：移除用户设置，回落到内置默认值（800px、40px、png、64 片等）。

## 限制

- 输入仅限 PNG / JPEG / GIF / WebP；GIF 按首帧处理。
- 单次最多 600 张（工具默认 64，可通过 `max_tiles` 上调），与 DeepSeek 官方 API 的 600 张/请求一致。
- 输出写入会话工作区内的 `tiles` 目录；如需其他位置，请用工作区相对路径。
