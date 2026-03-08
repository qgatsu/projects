const analyzeBtn = document.getElementById("analyze-btn");
const keywordBtn = document.getElementById("keyword-analyze-btn");
const urlInput = document.getElementById("url-input");
const keywordInput = document.getElementById("keyword-input");
const statusText = document.getElementById("status-text");
const keywordStatus = document.getElementById("keyword-status");
const progressSection = document.getElementById("progress-section");
const progressBar = document.getElementById("progress-bar");
const progressValue = document.getElementById("progress-value");
const progressDetail = document.getElementById("progress-detail");
const originPreview = document.getElementById("origin-preview");
const totalSpikeList = document.getElementById("total-spike-list");
const keywordSpikeList = document.getElementById("keyword-spike-list");
const totalCanvas = document.getElementById("total-chart");
const keywordCanvas = document.getElementById("keyword-chart");
const DEFAULT_Y_MAX = 10; // CPSの最低縦軸上限
const Y_PADDING_RATIO = 0.15;
const spikeState = {
  total: [],
  keyword: [],
};
const spikeSortState = {
  total: "peak",
  keyword: "peak",
};
const spikeListMap = {
  total: totalSpikeList,
  keyword: keywordSpikeList,
};
const PROGRESS_IDLE_MESSAGE = "解析を開始すると進捗が表示されます。";
const PROGRESS_WAITING_MESSAGE = "動画情報の取得を待っています...";
let lastProgressTimestamp = 0;

let totalChart;
let keywordChart;
let pollHandle = null;
let currentJobId = null;
let videoInfoTimer = null;
let videoInfoController = null;
let currentVideoDuration = null;
const VIDEO_PREVIEW_PLACEHOLDER = "URLを入力すると元動画の情報が表示されます。";

async function analyze() {
  const targetUrl = urlInput.value.trim();
  if (!targetUrl) {
    alert("URLを入力してください");
    return;
  }
  resetResults();
  analyzeBtn.disabled = true;
  keywordBtn.disabled = true;
  setStatus("解析ジョブを開始しています...");
  setProgressActive(true);
  try {
    const response = await fetch("/analyze/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "ジョブの開始に失敗しました");
    }
    const data = await response.json();
    startPolling(data.job_id);
  } catch (error) {
    setStatus(error.message);
    analyzeBtn.disabled = false;
    setProgressActive(false);
  }
}

function resetResults() {
  currentJobId = null;
  destroyChart(totalChart);
  destroyChart(keywordChart);
  totalChart = undefined;
  keywordChart = undefined;
  totalSpikeList.innerHTML = "";
  keywordSpikeList.innerHTML = "";
  keywordStatus.textContent = "キーワード未解析";
  spikeState.total = [];
  spikeState.keyword = [];
  renderSpikeList("total");
  renderSpikeList("keyword");
  resetProgress();
}

function startPolling(jobId) {
  if (pollHandle) {
    clearInterval(pollHandle);
  }
  pollHandle = setInterval(() => fetchStatus(jobId), 2000);
  fetchStatus(jobId);
}

async function fetchStatus(jobId) {
  try {
    const response = await fetch(`/analyze/status/${jobId}`);
    if (!response.ok) {
      throw new Error("進捗の取得に失敗しました");
    }
    const data = await response.json();
    handleStatus(data);
  } catch (error) {
    setStatus(error.message);
    stopPolling();
    analyzeBtn.disabled = false;
    setProgressActive(false);
  }
}

function handleStatus(job) {
  if (job.status === "running" || job.status === "queued") {
    const processed = job.processed_messages || 0;
    const timestamp = job.last_timestamp ? `${job.last_timestamp.toFixed(1)}s` : "-";
    setStatus(`解析中: ${processed}件処理済み (最新タイムスタンプ ${timestamp})`);
    updateProgressWithTimestamp(job.last_timestamp || 0);
  } else if (job.status === "completed") {
    stopPolling();
    currentJobId = job.job_id;
    setStatus("全コメントの解析が完了しました");
    if (job.result_total) {
      renderTotalSection(job.result_total);
    }
    if (job.result_keyword && job.keyword) {
      renderKeywordSection(job.result_keyword, job.keyword);
    } else {
      keywordStatus.textContent = "キーワード未解析";
    }
    analyzeBtn.disabled = false;
    keywordBtn.disabled = false;
    setProgressActive(false);
  } else if (job.status === "error") {
    stopPolling();
    setStatus(job.error || "解析に失敗しました");
    analyzeBtn.disabled = false;
    setProgressActive(false);
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

function setProgressActive(active) {
  if (!progressSection || !progressBar) {
    return;
  }
  if (!active) {
    progressSection.classList.remove("is-visible");
    progressBar.classList.remove("indeterminate");
    progressBar.style.width = "0%";
    setProgressValue("0%");
    setProgressDetail(PROGRESS_IDLE_MESSAGE);
    lastProgressTimestamp = 0;
    return;
  }
  progressSection.classList.add("is-visible");
  if (!hasVideoDuration()) {
    progressBar.classList.add("indeterminate");
    progressBar.style.width = "100%";
    setProgressValue("解析中");
    setProgressDetail(PROGRESS_WAITING_MESSAGE);
  } else {
    progressBar.classList.remove("indeterminate");
    progressBar.style.width = "0%";
    setProgressValue("0%");
    setProgressDetail(`動画長 ${formatTimecode(currentVideoDuration)} の解析を開始します`);
  }
}

function resetProgress() {
  setProgressActive(false);
}

function hasVideoDuration() {
  return typeof currentVideoDuration === "number" && currentVideoDuration > 0;
}

function updateProgressWithTimestamp(timestamp) {
  if (!progressBar) {
    return;
  }
  const currentSeconds = Math.max(0, Number(timestamp) || 0);
  const displaySeconds = Math.max(lastProgressTimestamp, currentSeconds);
  lastProgressTimestamp = displaySeconds;
  setProgressActive(true);
  if (!hasVideoDuration()) {
    progressBar.classList.add("indeterminate");
    setProgressValue("解析中");
    setProgressDetail(`最新コメント ${formatTimecode(displaySeconds)}`);
    return;
  }
  progressBar.classList.remove("indeterminate");
  const ratio = Math.max(0, Math.min(1, displaySeconds / currentVideoDuration));
  const percentText = `${(ratio * 100).toFixed(1)}%`;
  progressBar.style.width = percentText;
  setProgressValue(percentText);
  const durationText = formatTimecode(currentVideoDuration);
  setProgressDetail(`最新コメント ${formatTimecode(displaySeconds)} / 動画長 ${durationText}`);
}

function setProgressValue(value) {
  if (progressValue) {
    progressValue.textContent = value;
  }
}

function setProgressDetail(message) {
  if (progressDetail) {
    progressDetail.textContent = message;
  }
}

function renderTotalSection(result) {
  const series = result.series;
  renderLineChart(
    totalCanvas,
    "全コメント (スムージング)",
    series.time_axis,
    series.smoothed_total,
    "#111",
    "total"
  );
  spikeState.total = result.spikes || [];
  renderSpikeList("total");
}

function renderKeywordSection(result, keyword) {
  keywordStatus.textContent = `「${keyword}」の結果`;
  const series = result.series;
  renderLineChart(
    keywordCanvas,
    `キーワード (${keyword})`,
    series.time_axis,
    series.smoothed_keyword && series.smoothed_keyword.length
      ? series.smoothed_keyword
      : series.keyword,
    "#00c48c",
    "keyword"
  );
  spikeState.keyword = result.spikes || [];
  renderSpikeList("keyword");
}

function renderLineChart(canvas, label, labels, data, color, type) {
  destroyChart(type === "total" ? totalChart : keywordChart);
  const yMax = computeYMax(data);
  const chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          borderColor: color,
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "秒" } },
        y: {
          title: { display: true, text: "CPS" },
          min: 0,
          suggestedMax: yMax,
          max: yMax,
          beginAtZero: true,
        },
      },
    },
  });
  if (type === "total") {
    totalChart = chartInstance;
  } else {
    keywordChart = chartInstance;
  }
}

function destroyChart(chartInstance) {
  if (chartInstance) {
    chartInstance.destroy();
  }
}

function computeYMax(data) {
  if (!data || !data.length) {
    return DEFAULT_Y_MAX;
  }
  const numericValues = data.filter(
    (value) => typeof value === "number" && !Number.isNaN(value)
  );
  if (!numericValues.length) {
    return DEFAULT_Y_MAX;
  }
  const maxVal = Math.max(...numericValues);
  if (maxVal <= 0) {
    return DEFAULT_Y_MAX;
  }
  const padded = maxVal * (1 + Y_PADDING_RATIO);
  return padded || DEFAULT_Y_MAX;
}

function renderSpikeList(type) {
  const listElement = spikeListMap[type];
  if (!listElement) return;
  const spikes = spikeState[type] || [];
  const sorted = sortSpikes(spikes, spikeSortState[type]);
  if (!sorted.length) {
    listElement.innerHTML =
      '<li class="spike-card">しきい値を超えるスパイクはありませんでした。</li>';
    return;
  }
  listElement.innerHTML = "";
  const fragment = document.createDocumentFragment();
  sorted.forEach((spike) => {
    const item = document.createElement("li");
    item.className = "spike-card";
    item.tabIndex = 0;
    const wordBadges = renderWordBadges(spike.top_words);
    const spikeBadge = buildSpikeBadge(spike.label);
    item.innerHTML = `
      <div class="spike-card__times">
        <span>開始 ${formatTimestamp(spike.start_time)}</span>
        <span>ピーク ${formatTimestamp(spike.peak_time)}</span>
        <strong>CPS ${spike.peak_value.toFixed(2)}</strong>
        ${spikeBadge}
      </div>
      <div class="spike-card__main">
        <div class="spike-card__words">
          <span class="spike-card__words-label">コメントワード</span>
          <div class="spike-card__words-list">${wordBadges}</div>
        </div>
        <a class="spike-card__link" href="${spike.jump_url}" target="_blank" rel="noopener noreferrer">視聴</a>
      </div>
    `;
    item.addEventListener("mouseenter", () => highlightSpike(type, spike));
    item.addEventListener("focus", () => highlightSpike(type, spike));
    item.addEventListener("mouseleave", () => clearHighlight(type));
    item.addEventListener("blur", () => clearHighlight(type));
    fragment.appendChild(item);
  });
  listElement.appendChild(fragment);
}

function renderWordBadges(words) {
  if (!Array.isArray(words) || words.length === 0) {
    return `<span class="word-badge muted">${escapeHtml("該当なし")}</span>`;
  }
  const badges = words
    .map((entry) => {
      if (!entry || typeof entry.word !== "string") {
        return "";
      }
      const safeWord = escapeHtml(entry.word);
      return `<span class="word-badge">${safeWord}</span>`;
    })
    .filter(Boolean)
    .join("");
  return badges || `<span class="word-badge muted">${escapeHtml("該当なし")}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSpikeBadge(label) {
  if (!label) {
    return "";
  }
  let text = "";
  if (label === "greeting_head") {
    text = "挨拶 (開始)";
  } else if (label === "greeting_tail") {
    text = "挨拶 (終了)";
  } else {
    return "";
  }
  return `<span class="spike-card__badge">${escapeHtml(text)}</span>`;
}

function handleUrlInputChange() {
  if (!originPreview) return;
  const value = urlInput.value.trim();
  if (videoInfoTimer) {
    clearTimeout(videoInfoTimer);
    videoInfoTimer = null;
  }
  if (!value) {
    if (videoInfoController) {
      videoInfoController.abort();
      videoInfoController = null;
    }
    resetOriginPreview();
    return;
  }
  videoInfoTimer = setTimeout(() => {
    loadVideoPreview(value);
  }, 500);
}

async function loadVideoPreview(url) {
  if (!originPreview) return;
  if (videoInfoController) {
    videoInfoController.abort();
  }
  const controller = new AbortController();
  videoInfoController = controller;
  showOriginLoading();
  try {
    const response = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "動画情報の取得に失敗しました");
    }
    const payload = await response.json();
    renderOriginPreview(payload.video);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }
    showOriginError(error.message);
  }
}

function renderOriginPreview(info) {
  if (!originPreview) return;
  if (!info) {
    showOriginError("動画情報を取得できませんでした。");
    return;
  }
  currentVideoDuration = typeof info.duration_seconds === "number" ? info.duration_seconds : null;
  originPreview.classList.add("has-content");
  const title = escapeHtml(info.title || "不明な動画");
  const channel = escapeHtml(info.channel_title || "-");
  const viewText = escapeHtml(info.view_count_text || "-");
  const durationText = escapeHtml(info.duration_text || "-");
  const publishedText = escapeHtml(formatPublishedDate(info.published_at));
  originPreview.innerHTML = `
    <a class="origin-link" href="${info.url}" target="_blank" rel="noopener noreferrer">
      ${buildOriginThumbnail(info)}
      <div class="origin-meta">
        <p class="origin-title">${title}</p>
        <p class="origin-channel">${channel}</p>
        <ul class="origin-stats">
          <li>再生数 ${viewText}</li>
          <li>長さ ${durationText}</li>
          <li>公開日 ${publishedText}</li>
        </ul>
      </div>
    </a>
  `;
}

function buildOriginThumbnail(info) {
  const alt = escapeHtml(info.title || "動画サムネイル");
  if (info.thumbnail_url) {
    return `<img src="${info.thumbnail_url}" alt="${alt}" loading="lazy" />`;
  }
  return "";
}

function showOriginLoading() {
  if (!originPreview) return;
  originPreview.classList.remove("has-content");
  originPreview.innerHTML = `<p class="placeholder-text">動画情報を取得しています...</p>`;
}

function showOriginError(message) {
  if (!originPreview) return;
  currentVideoDuration = null;
  originPreview.classList.remove("has-content");
  originPreview.innerHTML = `<p class="placeholder-text">${escapeHtml(message)}</p>`;
}

function resetOriginPreview(message = VIDEO_PREVIEW_PLACEHOLDER) {
  if (!originPreview) return;
  currentVideoDuration = null;
  originPreview.classList.remove("has-content");
  originPreview.innerHTML = `<p class="placeholder-text">${escapeHtml(message)}</p>`;
}

function formatPublishedDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function formatTimecode(totalSeconds) {
  if (typeof totalSeconds !== "number" || Number.isNaN(totalSeconds)) {
    return "-";
  }
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function sortSpikes(spikes, sortKey) {
  const copy = [...spikes];
  if (sortKey === "time") {
    return copy.sort((a, b) => a.peak_time - b.peak_time);
  }
  return copy.sort((a, b) => b.peak_value - a.peak_value);
}

function formatTimestamp(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function highlightSpike(type, spike) {
  const chart = getChartByType(type);
  if (!chart) return;
  const labels = chart.data?.labels || [];
  const index = findNearestIndex(labels, spike.peak_time);
  if (index < 0) return;
  const elements = [{ datasetIndex: 0, index }];
  chart.setActiveElements(elements);
  if (chart.tooltip && chart.tooltip.setActiveElements) {
    chart.tooltip.setActiveElements(elements);
  }
  chart.update();
}

function clearHighlight(type) {
  const chart = getChartByType(type);
  if (!chart) return;
  chart.setActiveElements([]);
  if (chart.tooltip && chart.tooltip.setActiveElements) {
    chart.tooltip.setActiveElements([]);
  }
  chart.update();
}

function findNearestIndex(labels, target) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return -1;
  }
  let bestIndex = -1;
  let bestDiff = Number.POSITIVE_INFINITY;
  labels.forEach((label, index) => {
    const labelValue =
      typeof label === "number" ? label : parseFloat(String(label));
    if (Number.isNaN(labelValue)) {
      return;
    }
    const diff = Math.abs(labelValue - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function getChartByType(type) {
  return type === "total" ? totalChart : keywordChart;
}

function setupSpikeSortControls() {
  const buttons = document.querySelectorAll("[data-spike-sort]");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.spikeTarget;
      const sortKey = button.dataset.spikeSort;
      if (!target || !sortKey || !spikeState[target]) {
        return;
      }
      spikeSortState[target] = sortKey;
      setActiveSortButton(target, sortKey);
      renderSpikeList(target);
    });
  });
}

function setActiveSortButton(target, sortKey) {
  document
    .querySelectorAll(`[data-spike-target="${target}"][data-spike-sort]`)
    .forEach((button) => {
      const element = button;
      element.classList.toggle("active", element.dataset.spikeSort === sortKey);
    });
}

if (urlInput) {
  urlInput.addEventListener("input", handleUrlInputChange);
  if (urlInput.value.trim()) {
    loadVideoPreview(urlInput.value.trim());
  } else {
    resetOriginPreview();
  }
}

setupSpikeSortControls();
renderSpikeList("total");
renderSpikeList("keyword");

async function analyzeKeyword() {
  if (!currentJobId) {
    alert("先に配信URLの解析を実行してください");
    return;
  }
  const keyword = keywordInput.value.trim();
  if (!keyword) {
    keywordStatus.textContent = "キーワードを入力してください";
    return;
  }
  keywordBtn.disabled = true;
  keywordStatus.textContent = "キーワード解析中...";
  try {
    const response = await fetch(`/analyze/recompute/${currentJobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "キーワード解析に失敗しました");
    }
    const data = await response.json();
    renderKeywordSection(data.result, keyword);
  } catch (error) {
    keywordStatus.textContent = error.message;
  } finally {
    keywordBtn.disabled = false;
  }
}

analyzeBtn.addEventListener("click", analyze);
keywordBtn.addEventListener("click", analyzeKeyword);
