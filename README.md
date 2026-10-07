# VisualizeSpace

三维向量与矩阵变换可视化网页。输入多个向量和一个 3 × 3 变换矩阵，在同一空间中查看原始位置、当前位置、变换终点与运动轨迹。

## 功能与使用

- 每行输入一个三维向量，支持空格、英文/中文逗号、分号、多行文本及二维 JSON；最多 500 个向量。
- 自定义 3 × 3 矩阵，内置单位矩阵、绕 Z 轴旋转 45°、绕 X 轴旋转 90°、非均匀缩放、剪切与 XY 平面投影。
- 播放/暂停变换、拖动进度条、回到起点、调整播放速度；结果表同步显示当前坐标。
- 原点到点的向量箭头、运动轨迹、原始位置、坐标标签和网格均可独立开关。**关闭原点连线不会隐藏点或运动轨迹。**
- 拖动画面旋转，滚轮缩放，鼠标右键或 Shift + 拖动平移；手机单指旋转，双指缩放和平移。
- 支持 3D、XY、XZ、YZ 视角、适应全部向量、视角复位、隐藏控制面板、全屏和深色模式。
- 点击点或结果表中的行突出显示向量，再次点击取消。超过 24 个向量时只显示选中向量的坐标标签，避免遮挡；悬停仍可查看每个点。
- 点击画布上方的「固定视角 / 拖动」，锁定旋转、平移和视角切换，并暂停动画、回到原始向量。用鼠标或单指拖动实心端点，坐标和点积实时更新；滚轮和加减按钮仍可缩放。
- 点积面板支持选择两个不同向量，显示 `a · b = ax × bx + ay × by + az × bz` 的展开式、结果和夹角。未固定视角时按当前动画位置计算，播放和拖动进度条也会更新结果。
- 已应用的矩阵、向量、进度、显示设置、主题、观察角度与缩放自动保存在当前浏览器的 localStorage 中。刷新可恢复；不同设备和浏览器之间不自动同步。
- 所有计算在浏览器本地完成，无 CDN、前端框架、外部字体和运行时 npm 依赖，加载页面后不依赖第三方服务。

### 输入示例

```text
2, 1, 1
1, 3, 2
-2, 1, 2
```

也可以粘贴：

```json
[[2, 1, 1], [1, 3, 2], [-2, 1, 2]]
```

### 矩阵乘法约定

输入矩阵 X 的每一行都表示一个向量，形状为 N × 3。

| 选项 | 运算 | Python/PyTorch 对照 |
| --- | --- | --- |
| 行向量右乘（默认） | X′ = X M | `X @ M` |
| 列向量左乘 | 逐个执行 v′ = M v，结果仍按行显示 | `X @ M.T`，等价于 `(M @ X.T).T` |

切换乘法约定时，已输入的矩阵数值保持不变，重新计算结果。选择变换预设时会自动按当前约定填写矩阵，以保证同一个预设对应相同的几何变换。空间使用右手坐标系，Z 轴向上，画面为正交投影。

**轨迹定义：**`p(t) = (1 - t) * p0 + t * p1`，其中 `p1` 为变换后的向量，`t` 从 0 到 1。任意矩阵只定义起点到终点的映射，不唯一决定运动轨迹。本项目统一使用直线插值；即使终点来自旋转矩阵，动画也不是圆弧旋转。3 × 3 矩阵用于三维线性变换，不表示平移。

空心圆为起点，实心圆为当前位置，菱形为终点。虚线路径表示完整轨迹，实线路径表示已经经过的部分。当前点与起点或终点重合时会叠加显示。

### 键盘

点击或 Tab 聚焦画布后，方向键旋转，`+` / `-` 缩放，`Home` 复位。编辑向量后按 `Ctrl + Enter` / `Cmd + Enter` 应用；矩阵单元格内按 Enter 应用。系统启用减少动态效果时，点击应用直接展示终点，仍可手动播放。

### 拖动向量与实时点积

1. 在点积面板选择 A、B 两个向量，或点击「两向量示例」载入 `(2, 0, 0)`、`(1, 2, 0)` 并进入拖动模式，初始点积为 2。
2. 点击「固定视角 / 拖动」，画面暂时只显示原始向量。拖动实心端点修改向量，文本输入、结果表、变换终点和点积计算同步更新。隐藏原点连线后仍可拖动端点。
3. 二维鼠标移动对应经过端点、平行于屏幕的平面，保持端点的观察深度不变。在 XY 视角下拖动保持 Z 不变，在 XZ 视角下保持 Y 不变，在 YZ 视角下保持 X 不变。需要从另一个方向编辑时，先关闭固定视角，切换或旋转观察方向，再重新固定。
4. 固定期间空白处拖动、右键平移、双指手势、方向键和 Home 都不会改变相机；缩放仍可使用滚轮或加减按钮。拖动端点过程中暂时禁用缩放。画布不会因向量改变而自动适应大小。
5. 点击「已固定 · 关闭拖动」退出，恢复轨迹与变换播放。修改后的原始向量使用现有矩阵重新计算终点，支持零矩阵、投影等不可逆矩阵，无需反求矩阵。

两个端点重叠时，先点击结果表中对应的向量，再拖动重合处。输入尚未应用时会提示先应用，避免拖动覆盖未保存的编辑。拖动结束后自动保存向量；固定模式、点积对象也会保存在当前浏览器中。

零向量与任何向量的点积均为 0，其夹角显示「无定义」。不足两个向量时显示提示。点积展开式和结果显示最多 6 位有效数字，实际运算使用完整精度坐标。

## 目录

```text
VisualizeSpace/
├── backend/server.js             # Node.js 静态服务与健康检查
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js                    # 输入、动画、结果表与浏览器保存
│   ├── math.js                   # 矩阵运算和投影数学
│   ├── space.js                  # Canvas 三维绘制和交互
│   └── favicon.svg
├── deploy/
│   ├── VisualizeSpace.service
│   ├── VisualizeSpace.nginx
│   └── install.sh
├── tests/
├── package.json
└── README.md
```

## Ubuntu 部署

按照 Development.MD：root 用户、单服务器、Node.js + Nginx + systemd，不使用 Docker、数据库或用户系统。

| 配置 | 值 |
| --- | --- |
| GitHub 仓库/分支 | `LIKE9426334946/VisualizeSpace` / `main` |
| 项目目录 | `/opt/VisualizeSpace` |
| 公网入口 | `http://服务器IP:16047/` |
| Node.js 监听 | `127.0.0.1:3047` |
| systemd 服务 | `VisualizeSpace.service` |
| Nginx 配置 | `/etc/nginx/sites-available/VisualizeSpace` |

### 1. 准备环境

使用 root 执行（无需 sudo），准备 Node.js 22 或更高版本。服务使用 `/usr/bin/node`；如果服务器已经安装符合要求的版本，直接继续。

```bash
apt update
apt install -y git nginx
/usr/bin/node --version
```

若尚未安装 Node.js，可按 [Node.js 官方下载页面](https://nodejs.org/en/download)安装支持的版本，并确认可执行路径为 `/usr/bin/node`。本项目无需 `npm install`，不需要编译构建。

### 2. 获取 main 分支

```bash
mkdir -p /opt/VisualizeSpace
git clone --branch main https://github.com/LIKE9426334946/VisualizeSpace.git /opt/VisualizeSpace
cd /opt/VisualizeSpace
```

上面的 clone 用于首次部署，目录应为空。已有仓库请使用下文更新步骤。

### 3. 一键安装项目服务

```bash
cd /opt/VisualizeSpace
bash deploy/install.sh
```

脚本先运行测试，然后复制本仓库的 systemd、Nginx 配置，创建软链接、检查 Nginx 配置、启用开机启动并启动/重启本项目。它不会删除其他项目配置。若偏好手动部署，执行下面的等价步骤。

### 4. 手动创建配置并启用服务

创建独立的 systemd 服务和 Nginx 站点：

```bash
cd /opt/VisualizeSpace
install -m 644 deploy/VisualizeSpace.service /etc/systemd/system/VisualizeSpace.service
install -m 644 deploy/VisualizeSpace.nginx /etc/nginx/sites-available/VisualizeSpace
ln -sfn /etc/nginx/sites-available/VisualizeSpace /etc/nginx/sites-enabled/VisualizeSpace
```

systemd 配置完整内容：

```ini
[Unit]
Description=VisualizeSpace 3D vector visualization
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/VisualizeSpace
ExecStart=/usr/bin/node /opt/VisualizeSpace/backend/server.js
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3047
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Nginx 配置完整内容：

```nginx
map $http_upgrade $visualizespace_connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 16047;
    listen [::]:16047;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3047;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $visualizespace_connection_upgrade;
        proxy_read_timeout 60s;
    }
}
```

`map` 随站点配置放在 Nginx 的 `http` 上下文中，Ubuntu 默认的 `sites-enabled/*` 引入位置符合要求。已配置 WebSocket 反向代理头，项目当前不需要 WebSocket。

检查配置并启用服务：

```bash
nginx -t
systemctl daemon-reload
systemctl enable VisualizeSpace
systemctl start VisualizeSpace
systemctl enable nginx
systemctl start nginx
systemctl reload nginx
systemctl status VisualizeSpace --no-pager
```

### 5. 放行端口并访问

在云服务器安全组中放行 TCP 16047。若启用了 UFW，再执行：

```bash
ufw allow 16047/tcp
```

不要放行内部端口 3047，服务固定绑定回环地址。

在浏览器访问 `http://服务器IP:16047/`。健康检查为 `http://服务器IP:16047/api/health`，正常返回 `{"status":"ok","app":"VisualizeSpace"}`。

## 更新

```bash
cd /opt/VisualizeSpace
git pull --ff-only origin main
bash deploy/install.sh
```

## 本地运行与检查

```bash
node backend/server.js
```

在运行这条命令的电脑上访问 `http://127.0.0.1:3047/`。无需安装 npm 依赖。

```bash
npm run check
npm test
```

测试覆盖向量解析、左右乘约定、旋转预设、零向量与投影、插值、相机投影、静态服务和路径隔离。测试会临时绑定随机回环端口，不占用项目的 3047 端口。

## 排查

```bash
systemctl status VisualizeSpace --no-pager
journalctl -u VisualizeSpace -n 80 --no-pager
nginx -t
ss -lntp | grep -E ':3047|:16047'
```

页面 502 时先检查 Node.js 服务和 `/usr/bin/node` 路径；公网无法连接但服务正常时检查云安全组与防火墙。所有页面状态保存在浏览器中，清理站点数据会恢复默认示例。
