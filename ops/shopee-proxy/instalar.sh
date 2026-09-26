#!/usr/bin/env bash
# Instala o repasse da Shopee num servidor Ubuntu novo (Oracle Cloud Always Free).
# Uso (no servidor): sudo PROXY_SECRET=... bash instalar.sh
# O endereço HTTPS usa sslip.io (<ip>.sslip.io resolve para o próprio IP) — sem mexer em DNS.
set -euo pipefail
[ -n "${PROXY_SECRET:-}" ] || { echo "Informe PROXY_SECRET"; exit 1; }
IP=$(curl -s https://api.ipify.org)
HOST="${IP//./-}.sslip.io"

apt-get update -y
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
# Caddy (HTTPS automático com Let's Encrypt)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy

install -d -o root -m 755 /opt/shopee-proxy
cp proxy.mjs /opt/shopee-proxy/proxy.mjs
cat > /etc/shopee-proxy.env <<EOF
PROXY_SECRET=${PROXY_SECRET}
EOF
chmod 600 /etc/shopee-proxy.env

cat > /etc/systemd/system/shopee-proxy.service <<'EOF'
[Unit]
Description=Repasse EcomBalance -> API Shopee
After=network-online.target
[Service]
EnvironmentFile=/etc/shopee-proxy.env
ExecStart=/usr/bin/node /opt/shopee-proxy/proxy.mjs
Restart=always
DynamicUser=yes
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
${HOST} {
  reverse_proxy 127.0.0.1:8080
}
EOF

# Firewall do Ubuntu da Oracle: libera 80/443 (o 22 já vem liberado).
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save || true

systemctl daemon-reload
systemctl enable --now shopee-proxy
systemctl restart caddy
echo "PRONTO: https://${HOST}  (IP fixo: ${IP})"
