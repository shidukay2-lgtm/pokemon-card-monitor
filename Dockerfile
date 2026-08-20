# ベースイメージ
FROM node:20-slim

# 作業ディレクトリ設定
WORKDIR /app

# パッケージ定義コピーとインストール
COPY package*.json ./
RUN npm ci --only=production

# ソースコードコピー
COPY . .

# 初期DB作成
RUN node seed.js

# 公開ポート設定
EXPOSE 3000

# 起動コマンド
CMD ["node", "server.js"]
