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
const spikeModal = document.getElementById("spike-action-modal");
const spikeActionMessage = document.getElementById("spike-action-message");
const spikeActionPreview = document.getElementById("spike-action-preview");
const spikeViewBtn = document.getElementById("spike-view-btn");
const spikeAddBtn = document.getElementById("spike-add-btn");
const spikeCancelBtn = document.getElementById("spike-cancel-btn");
const DEFAULT_Y_MAX = 10; // CPSの最低縦軸上限
const Y_PADDING_RATIO = 0.15;
const CLIP_DURATION_OPTIONS = [15, 30, 45, 60, 75, 90];
const DEFAULT_CLIP_DURATION_SECONDS = 30;
const PEAK_POSITION_RATIO = 0.75;
const SPEAKER_COUNT_OPTIONS = ["auto", 1, 2, 3, 4];
const DEFAULT_SPEAKER_COUNT = "auto";
const spikeState = {
  total: [],
  keyword: [],
};
const addedSpikeState = {
  total: [],
  keyword: [],
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
let currentVideoTitle = "";
let pendingSpikeType = null;
let pendingSpike = null;
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
  addedSpikeState.total = [];
  addedSpikeState.keyword = [];
  closeSpikeActionModal();
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
  spikeState.total = result.spikes || [];
  addedSpikeState.total = [];
  renderLineChart(
    totalCanvas,
    "全コメント (スムージング)",
    series.time_axis,
    series.smoothed_total,
    "#111",
    "total"
  );
  renderSpikeList("total");
}

function renderKeywordSection(result, keyword) {
  keywordStatus.textContent = `「${keyword}」の結果`;
  const series = result.series;
  spikeState.keyword = result.spikes || [];
  addedSpikeState.keyword = [];
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
  renderSpikeList("keyword");
}

function renderLineChart(canvas, label, labels, data, color, type) {
  destroyChart(type === "total" ? totalChart : keywordChart);
  const yMax = computeYMax(data);
  const spikeMarkers = buildSpikeMarkerSeries(labels, spikeState[type] || []);
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
        {
          label: "スパイク",
          data: spikeMarkers,
          borderColor: "transparent",
          backgroundColor: "#ef4444",
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHitRadius: 40,
          showLine: false,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: false,
      },
      onClick: (event, _elements, chart) => {
        handleChartClick(type, event, chart);
      },
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

function buildSpikeMarkerSeries(labels, spikes) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return [];
  }
  const markers = new Array(labels.length).fill(null);
  if (!Array.isArray(spikes) || spikes.length === 0) {
    return markers;
  }
  spikes.forEach((spike) => {
    const index = findNearestIndex(labels, spike.peak_time);
    if (index < 0) {
      return;
    }
    const current = markers[index];
    if (typeof current !== "number" || spike.peak_value > current) {
      markers[index] = spike.peak_value;
    }
  });
  return markers;
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
  const addedEntries = addedSpikeState[type] || [];
  if (!spikes.length) {
    listElement.innerHTML =
      '<li class="spike-card">しきい値を超えるスパイクはありませんでした。</li>';
    return;
  }
  if (!addedEntries.length) {
    listElement.innerHTML =
      '<li class="spike-card">チャート上の赤いスパイク点をクリックして「追加」を押すとカードが並びます。</li>';
    return;
  }
  listElement.innerHTML = "";
  const fragment = document.createDocumentFragment();
  addedEntries.forEach((entry) => {
    const spike = entry.spike;
    const clipDurationSeconds =
      Number(entry.clipDurationSeconds) || DEFAULT_CLIP_DURATION_SECONDS;
    const speakerCount = normalizeSpeakerCount(entry.speakerCount);
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
      <div class="spike-card__clip">
        <label class="spike-card__clip-label">
          全体
          <select class="spike-card__clip-select">${buildClipDurationOptions(clipDurationSeconds)}</select>
          秒
        </label>
        <label class="spike-card__clip-label">
          話者
          <select class="spike-card__speaker-select">${buildSpeakerCountOptions(speakerCount)}</select>
        </label>
        <span class="spike-card__clip-range">${buildClipRangeText(
          spike.peak_time,
          clipDurationSeconds
        )}</span>
        <button type="button" class="chip chip-small spike-card__save">保存</button>
        <button type="button" class="chip chip-small spike-card__remove">削除</button>
      </div>
      ${entry.lastSavedPath ? `<p class="spike-card__saved">ダウンロード済み: ${escapeHtml(entry.lastSavedPath)}</p>` : ""}
    `;
    const select = item.querySelector(".spike-card__clip-select");
    if (select) {
      select.addEventListener("change", (event) => {
        const value = Number(event.target.value);
        if (Number.isNaN(value) || value <= 0) {
          return;
        }
        updateClipDuration(type, entry.key, value);
      });
    }
    const speakerSelect = item.querySelector(".spike-card__speaker-select");
    if (speakerSelect) {
      speakerSelect.addEventListener("change", (event) => {
        const value = normalizeSpeakerCount(event.target.value);
        updateSpeakerCount(type, entry.key, value);
      });
    }
    const removeButton = item.querySelector(".spike-card__remove");
    if (removeButton) {
      removeButton.addEventListener("click", () => {
        removeSpikeCard(type, entry.key);
      });
    }
    const saveButton = item.querySelector(".spike-card__save");
    if (saveButton) {
      saveButton.addEventListener("click", () => {
        downloadSpikeCard(type, entry.key, saveButton);
      });
    }
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

function buildClipDurationOptions(selectedValue) {
  return CLIP_DURATION_OPTIONS.map((seconds) => {
    const selected = seconds === selectedValue ? " selected" : "";
    return `<option value="${seconds}"${selected}>${seconds}</option>`;
  }).join("");
}

function buildSpeakerCountOptions(selectedValue) {
  const safeValue = normalizeSpeakerCount(selectedValue);
  return SPEAKER_COUNT_OPTIONS.map((value) => {
    const selected = value === safeValue ? " selected" : "";
    if (value === "auto") {
      return `<option value="auto"${selected}>自動</option>`;
    }
    return `<option value="${value}"${selected}>${value}人</option>`;
  }).join("");
}

function buildClipRangeText(peakTime, durationSeconds) {
  const start = Math.max(0, peakTime - durationSeconds * PEAK_POSITION_RATIO);
  const end = Math.max(start, start + durationSeconds);
  return `${formatTimestamp(start)} - ${formatTimestamp(end)}`;
}

function normalizeSpeakerCount(value) {
  if (value === "auto" || value == null || value === "") {
    return "auto";
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    return "auto";
  }
  return num;
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
  currentVideoTitle = typeof info.title === "string" ? info.title : "";
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
  currentVideoTitle = "";
  originPreview.classList.remove("has-content");
  originPreview.innerHTML = `<p class="placeholder-text">${escapeHtml(message)}</p>`;
}

function resetOriginPreview(message = VIDEO_PREVIEW_PLACEHOLDER) {
  if (!originPreview) return;
  currentVideoDuration = null;
  currentVideoTitle = "";
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

function handleChartClick(type, event, chart) {
  const spikes = spikeState[type] || [];
  if (!Array.isArray(spikes) || spikes.length === 0) {
    return;
  }
  if (!chart || !event) {
    return;
  }
  const elements = chart.getElementsAtEventForMode(
    event,
    "nearest",
    { intersect: true },
    false
  );
  if (!Array.isArray(elements) || elements.length === 0) {
    return;
  }
  const spikeElement = elements.find((element) => element?.datasetIndex === 1);
  if (!spikeElement) {
    return;
  }
  const index = spikeElement.index;
  if (typeof index !== "number" || index < 0) {
    return;
  }
  const label = chart?.data?.labels?.[index];
  const xValue = typeof label === "number" ? label : parseFloat(String(label));
  if (Number.isNaN(xValue)) {
    return;
  }
  const selected = findNearestSpike(spikes, xValue);
  if (!selected) {
    return;
  }
  pendingSpikeType = type;
  pendingSpike = selected;
  openSpikeActionModal(type, selected);
  highlightSpike(type, selected);
}

function findNearestSpike(spikes, targetTime) {
  let selected = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  spikes.forEach((spike) => {
    if (!spike || typeof spike.peak_time !== "number") {
      return;
    }
    const diff = Math.abs(spike.peak_time - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      selected = spike;
    }
  });
  return selected;
}

if (urlInput) {
  urlInput.addEventListener("input", handleUrlInputChange);
  if (urlInput.value.trim()) {
    loadVideoPreview(urlInput.value.trim());
  } else {
    resetOriginPreview();
  }
}

if (spikeModal) {
  spikeModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.hasAttribute("data-modal-close")) {
      closeSpikeActionModal();
    }
  });
}

if (spikeCancelBtn) {
  spikeCancelBtn.addEventListener("click", () => {
    closeSpikeActionModal();
  });
}

if (spikeViewBtn) {
  spikeViewBtn.addEventListener("click", () => {
    if (!pendingSpike || !pendingSpike.jump_url) {
      closeSpikeActionModal();
      return;
    }
    window.open(pendingSpike.jump_url, "_blank", "noopener,noreferrer");
    closeSpikeActionModal();
  });
}

if (spikeAddBtn) {
  spikeAddBtn.addEventListener("click", () => {
    if (!pendingSpikeType || !pendingSpike) {
      closeSpikeActionModal();
      return;
    }
    addSpikeCard(pendingSpikeType, pendingSpike);
    closeSpikeActionModal();
  });
}

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

function openSpikeActionModal(type, spike) {
  if (!spikeModal || !spikeActionMessage || !spikeActionPreview) {
    return;
  }
  spikeActionMessage.textContent = "代表コメント";
  spikeActionPreview.innerHTML = renderWordBadges(spike.top_words);
  spikeModal.hidden = false;
}

function closeSpikeActionModal() {
  if (!spikeModal) {
    return;
  }
  spikeModal.hidden = true;
  pendingSpikeType = null;
  pendingSpike = null;
}

function addSpikeCard(type, spike) {
  const list = addedSpikeState[type];
  if (!Array.isArray(list)) {
    return;
  }
  const key = buildSpikeKey(spike);
  const exists = list.some((item) => item.key === key);
  if (!exists) {
    list.push({
      key,
      spike,
      clipDurationSeconds: DEFAULT_CLIP_DURATION_SECONDS,
      speakerCount: DEFAULT_SPEAKER_COUNT,
    });
  }
  renderSpikeList(type);
}

function updateClipDuration(type, key, seconds) {
  const list = addedSpikeState[type];
  if (!Array.isArray(list)) {
    return;
  }
  const target = list.find((entry) => entry.key === key);
  if (!target) {
    return;
  }
  target.clipDurationSeconds = seconds;
  renderSpikeList(type);
}

function updateSpeakerCount(type, key, speakerCount) {
  const list = addedSpikeState[type];
  if (!Array.isArray(list)) {
    return;
  }
  const target = list.find((entry) => entry.key === key);
  if (!target) {
    return;
  }
  target.speakerCount = speakerCount;
  renderSpikeList(type);
}

function removeSpikeCard(type, key) {
  const list = addedSpikeState[type];
  if (!Array.isArray(list)) {
    return;
  }
  const index = list.findIndex((entry) => entry.key === key);
  if (index < 0) {
    return;
  }
  list.splice(index, 1);
  renderSpikeList(type);
}

async function downloadSpikeCard(type, key, buttonElement) {
  const list = addedSpikeState[type];
  if (!Array.isArray(list)) {
    return;
  }
  const target = list.find((entry) => entry.key === key);
  if (!target) {
    return;
  }
  const button = buttonElement;
  const originalText = button.textContent;
  const provisionalFilename = buildProvisionalClipFilename(target);
  button.disabled = true;
  button.textContent = "保存中...";
  try {
    const pickerResult = await prepareSaveTarget(provisionalFilename);
    const response = await fetch("/api/clips/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: target.spike.jump_url,
        video_title: currentVideoTitle,
        peak_time: target.spike.peak_time,
        clip_duration_seconds: target.clipDurationSeconds,
        clip_speaker_count: normalizeSpeakerCount(target.speakerCount),
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "切り抜き保存に失敗しました");
    }
    const filename = resolveDownloadFilename(response) || provisionalFilename;
    const savedPath = await saveClipResponse(response, filename, pickerResult);
    target.lastSavedPath = filename;
    if (savedPath) {
      setStatus(`保存しました: ${savedPath}`);
    } else if (pickerResult.reason) {
      setStatus(`ブラウザ通常ダウンロードに切替: ${filename} (${pickerResult.reason})`);
    } else {
      setStatus(`ダウンロードを開始しました: ${filename}`);
    }
    renderSpikeList(type);
  } catch (error) {
    setStatus(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function resolveDownloadFilename(response) {
  const contentDisposition = response.headers.get("content-disposition") || "";
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    return sanitizeDownloadFilename(decodeURIComponent(utf8Match[1]));
  }
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch && plainMatch[1]) {
    return sanitizeDownloadFilename(plainMatch[1]);
  }
  return "";
}

function sanitizeDownloadFilename(value) {
  if (!value) {
    return "";
  }
  const normalized = String(value).replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

async function prepareSaveTarget(suggestedName) {
  if (typeof window.showSaveFilePicker !== "function") {
    return {
      fileHandle: null,
      reason: "save picker未対応",
    };
  }
  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: suggestedName || "clip.zip",
      startIn: "downloads",
      types: [
        {
          description: "Zip archive",
          accept: {
            "application/zip": [".zip"],
          },
        },
      ],
    });
    return {
      fileHandle,
      reason: "",
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("保存がキャンセルされました");
    }
    if (error && error.name) {
      return {
        fileHandle: null,
        reason: `picker失敗: ${error.name}`,
      };
    }
    return {
      fileHandle: null,
      reason: "picker失敗",
    };
  }
}

async function saveClipResponse(response, filename, pickerResult) {
  if (pickerResult?.fileHandle && response && response.body) {
    const writable = await pickerResult.fileHandle.createWritable();
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await writable.write(value);
      }
    } catch (_error) {
      await writable.abort();
      throw new Error("保存中にエラーが発生しました");
    }
    await writable.close();
    return pickerResult.fileHandle.name || filename;
  }
  const blob = await response.blob();
  triggerBrowserDownload(blob, filename);
  return "";
}

function buildProvisionalClipFilename(entry) {
  const peak = Number(entry?.spike?.peak_time) || 0;
  const duration = Number(entry?.clipDurationSeconds) || DEFAULT_CLIP_DURATION_SECONDS;
  const start = Math.max(0, Math.floor(peak - duration * PEAK_POSITION_RATIO));
  const end = Math.max(start + 1, Math.floor(start + duration));
  return `clip_${start}-${end}.zip`;
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildSpikeKey(spike) {
  if (!spike) {
    return "";
  }
  return [
    spike.jump_url || "",
    String(spike.start_time ?? ""),
    String(spike.peak_time ?? ""),
    String(spike.peak_value ?? ""),
  ].join("|");
}

function getClipSelectionPayload() {
  const toPayload = (entries) =>
    entries.map((entry) => {
      const seconds =
        Number(entry.clipDurationSeconds) || DEFAULT_CLIP_DURATION_SECONDS;
      const peak = Number(entry.spike?.peak_time) || 0;
      const start = Math.max(0, peak - seconds * PEAK_POSITION_RATIO);
      const end = Math.max(start, start + seconds);
      const speakerCount = normalizeSpeakerCount(entry.speakerCount);
      return {
        key: entry.key,
        jump_url: entry.spike?.jump_url || "",
        peak_time: peak,
        clip_duration_seconds: seconds,
        clip_speaker_count: speakerCount,
        clip_start_time: start,
        clip_end_time: end,
      };
    });

  return {
    total: toPayload(addedSpikeState.total || []),
    keyword: toPayload(addedSpikeState.keyword || []),
  };
}

window.getClipSelectionPayload = getClipSelectionPayload;
