## YouTube コメントスパイク解析

### ローカル環境 (AWS 構成を想定したコンテナ)

1. 事前に `.env` を用意し、必要な API キーなどを設定してください。
2. Docker と Docker Compose v2 がインストールされていることを確認します。
3. 下記のコマンドで Redis / Web / Worker の 3 サービスを起動します。

```bash
docker compose up --build
```

開発時に「コード変更をリビルドなしで反映」したい場合は、初回ビルド後に開発用オーバーライドを使って起動します。

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- `web` は `--reload` で Python 変更を自動反映します。
- `app/static/*` や `app/templates/*` の変更はバインドマウント経由で即時反映されます（ブラウザ再読込は必要）。
- `worker` はバインドマウントされるためリビルド不要ですが、コード変更を反映するには `docker compose restart worker` を実行してください。
- ただし依存追加（例: `requirements.txt` / `Dockerfile` 変更）時は 1 回だけ再ビルドが必要です。

### 切り抜き保存 (yt-dlp)

- 追加カードの `保存` ボタンは `yt-dlp --download-sections` を使って切り抜きを保存します。
- API は生成した動画フォルダを ZIP 化して添付レスポンスで返します（ZIPのみ保存）。
- サーバー側では一時フォルダで切り抜きを生成し、レスポンス後に削除します。
- サーバー側の一時フォルダはデフォルトで `/tmp/youtube_clip_spike` を使います（`CLIP_OUTPUT_DIR` で変更可能）。
- 対応ブラウザでは保存ダイアログを表示し、PC上の保存先フォルダを選択できます。
- `CLIP_PARALLEL_FRAGMENTS` で yt-dlp の並列フラグメント数を調整できます（デフォルト: `24`）。
- 保存ダイアログ対応ブラウザではレスポンスをストリーミング書き込みするため、大きなファイルでも待ち時間とメモリ使用量を抑えられます。
- 長い動画で保存に時間がかかる場合は `GUNICORN_TIMEOUT`（秒）を増やしてください（デフォルト: `600`）。
- 画質は下げず、フラグメント並列ダウンロードを有効化しています。`aria2c` が利用可能な環境では自動で併用します。
- 切り抜き開始直後の映像欠けを抑えるため、切り取り開始の約10秒前から一度ダウンロードしてから、ローカルで必要区間をトリムしています。
- 各スパイクカードでは「前後秒数」ではなく「クリップ全体秒数」を指定します。
- 切り抜き範囲は `開始 = peak - (全体秒数 × 0.75)`、`終了 = 開始 + 全体秒数` で計算され、ピーク時刻がクリップ内の約 75% 位置に来るようにしています。
- `CLIP_TRANSCRIPT_ENABLED=true` を設定すると、保存した切り抜き動画に対して話者分離付き文字起こし（`video_transcript.txt`）を同梱します。
- 話者分離を有効にするには `HUGGINGFACE_TOKEN` が必要です（`pyannote/speaker-diarization-3.1` 利用）。未設定時は単一話者（`SPEAKER_00`）で文字起こしファイルを生成します。
- 追加した各スパイクカード上で、話者数を `自動 / 1人 / 2人 / 3人 / 4人` から選択できます（保存時の話者分離に反映）。
- 120秒程度の動画を軽量に処理する用途では、`CLIP_TRANSCRIPT_MODEL=small` / `CLIP_TRANSCRIPT_DEVICE=cpu` / `CLIP_TRANSCRIPT_COMPUTE_TYPE=int8` が扱いやすい設定です。

| サービス | 役割 | AWS での想定 |
| -------- | ---- | ------------ |
| `redis`  | RQ キュー/メタデータを保存。 | Amazon ElastiCache (Redis) |
| `web`    | Flask + Gunicorn で API/フロントを提供。 | AWS App Runner / ECS Fargate / Elastic Beanstalk |
| `worker` | RQ Worker として解析ジョブを非同期実行。 | ECS Fargate / EKS / Lambda (Container) |

ブラウザから `http://localhost:5002` にアクセスすると従来通り UI を利用できます（`docker-compose.yml` で `127.0.0.1:5002:5000` を公開）。ジョブは Redis キューにエンキューされ、`worker` が処理します。

- Docker イメージ内では `sample/youtube.py` を `chat_downloader` の公式 `youtube.py` に上書きしているため、配信のチャット取得で発生していた解析失敗を回避できます。ローカル環境で直接 Python を実行する場合も、同様に `sample/youtube.py` を site-packages の `chat_downloader/sites/youtube.py` にコピーしてください。

### バックグラウンドジョブ構成

- Redis URL や Queue 名、タイムアウトは `config/settings.yaml` もしくは環境変数 (`REDIS_URL`, `REDIS_QUEUE_NAME`, `REDIS_JOB_TIMEOUT`, `REDIS_RESULT_TTL`) で調整できます。
- 解析ワーカーは `app.worker.run_analysis_job` に実装され、RQ から呼び出されます。処理途中の進捗や結果は Redis 上の Job Meta に保存されるため、スケールアウトした Web/Worker 間で共有が可能です。

### AWS への展開を想定したポイント

- Docker イメージは `Dockerfile` をそのまま Amazon ECR にプッシュし、ECS/App Runner 等から利用できます。
- Redis はマネージドサービス (Amazon ElastiCache) を利用し、`REDIS_URL` を該当エンドポイントに切り替えるだけで構成を移行できます。
- ワーカー数を増やしたい場合は worker サービスを水平スケールさせるだけでジョブ処理能力が向上します。
