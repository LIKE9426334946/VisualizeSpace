#!/usr/bin/env bash
set -euo pipefail

cd /opt/VisualizeSpace
if [ "$(id -u)" -ne 0 ]; then
  echo '请使用 root 运行此脚本。' >&2
  exit 1
fi
if [ ! -x /usr/bin/node ] || ! /usr/bin/node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo '请先安装 Node.js 22 或更高版本，并确保 /usr/bin/node 可用。' >&2
  exit 1
fi
command -v nginx >/dev/null
/usr/bin/node --test tests/*.test.js
install -m 644 deploy/VisualizeSpace.service /etc/systemd/system/VisualizeSpace.service
install -m 644 deploy/VisualizeSpace.nginx /etc/nginx/sites-available/VisualizeSpace
ln -sfn /etc/nginx/sites-available/VisualizeSpace /etc/nginx/sites-enabled/VisualizeSpace
nginx -t
systemctl daemon-reload
systemctl enable VisualizeSpace
systemctl restart VisualizeSpace
systemctl enable nginx
systemctl start nginx
systemctl reload nginx
systemctl --no-pager --full status VisualizeSpace
echo '部署完成，访问 http://服务器IP:16047/'
