FROM nginx:alpine

# 静的コンテンツの配置
COPY . /usr/share/nginx/html

# Cloud RunのPORT環境変数に対応するNginx設定テンプレート
COPY default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080
ENV PORT=8080
