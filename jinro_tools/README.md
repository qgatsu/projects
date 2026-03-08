# jinro_tool

静的な HTML/CSS/JS で構成された人狼プレイヤー向けツールです。  
`jinro_tool` という名前の Nginx コンテナとして配信するためのデプロイ用ファイルを用意しています。

## ローカル確認

```bash
docker compose up --build
```

- 初回実行時は `Dockerfile` を元に Nginx イメージをビルドします。
- コンテナはポート `3000` を公開し、ホストの `3000` 番にフォワードします。
- ブラウザで `http://localhost:3000/` にアクセスすると UI を確認できます。

## Lightsail などへのデプロイ

`youtube_clip_search` と同様の手順で、`deploy/lightsail` 以下に本番用ファイルを配置しています。

```bash
cd deploy/lightsail
docker compose up -d --build
```

- `deploy/lightsail/Dockerfile`: 静的ファイルを Nginx (alpine) イメージへコピー。
- `deploy/lightsail/docker-compose.yml`: サービス名 `jinro_tool` として 8080→80 で公開。
- `.dockerignore`: デプロイ時に不要なファイルをイメージへ含めないための設定。
