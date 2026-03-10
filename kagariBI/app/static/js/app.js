const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("file");
const csvOptionBlocks = document.querySelectorAll(".csv-option");
const delimiterSelect = document.getElementById("delimiter");
const encodingSelect = document.getElementById("encoding");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const columnThead = document.querySelector("#column-table thead");
const columnTbody = document.querySelector("#column-table tbody");
const previewThead = document.querySelector("#preview-table thead");
const previewTbody = document.querySelector("#preview-table tbody");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatHistory = document.getElementById("chat-history");
const chatStatus = document.getElementById("chat-status");
const chatSendBtn = document.getElementById("chat-send-btn");

function switchTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
  });
}

function getExtension(filename) {
  const idx = filename.lastIndexOf(".");
  if (idx < 0) return "";
  return filename.slice(idx).toLowerCase();
}

function updateCsvOptionsVisibility() {
  const file = fileInput.files && fileInput.files[0];
  const ext = file ? getExtension(file.name) : ".csv";
  const isCsv = ext === ".csv";

  csvOptionBlocks.forEach((el) => {
    el.classList.toggle("hidden", !isCsv);
  });
  delimiterSelect.disabled = !isCsv;
  encodingSelect.disabled = !isCsv;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#c0392b" : "#5d6c76";
}

function setChatStatus(message, isError = false) {
  chatStatus.textContent = message;
  chatStatus.style.color = isError ? "#c0392b" : "#5d6c76";
}

function isNearBottom(element, threshold = 120) {
  const delta = element.scrollHeight - element.scrollTop - element.clientHeight;
  return delta < threshold;
}

function scrollHistoryToBottom(force = false) {
  if (force || isNearBottom(chatHistory)) {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }
}

function appendChatMessage(role, text, extra = null) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  const stack = document.createElement("div");
  stack.className = "msg-stack";

  if (role === "assistant") {
    const roleEl = document.createElement("div");
    roleEl.className = "msg-role";
    roleEl.textContent = "kagariBI";
    stack.appendChild(roleEl);
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  stack.appendChild(bubble);

  if (extra) {
    const pre = document.createElement("pre");
    pre.className = "msg-extra";
    pre.textContent = extra;
    stack.appendChild(pre);
  }

  const meta = document.createElement("span");
  meta.className = "msg-meta";
  meta.textContent = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  stack.appendChild(meta);

  row.appendChild(stack);
  chatHistory.appendChild(row);
  scrollHistoryToBottom();
  return row;
}

function setChatMessageText(messageEl, text) {
  const bubble = messageEl.querySelector(".msg-bubble");
  if (!bubble) return;
  bubble.textContent = text;
  scrollHistoryToBottom();
}

async function appendFigureToMessage(messageEl, figure) {
  if (!window.Plotly || !figure || !figure.data || !figure.layout) return;
  const stack = messageEl.querySelector(".msg-stack") || messageEl;
  const chartEl = document.createElement("div");
  chartEl.className = "chat-chart";
  stack.appendChild(chartEl);
  await window.Plotly.newPlot(chartEl, figure.data, figure.layout, { responsive: true });
  scrollHistoryToBottom();
}

async function handleChatStreamResponse(response) {
  if (!response.body) {
    throw new Error("ストリーミングレスポンスを取得できませんでした。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let reportText = "";
  let reportMsg = null;
  let plotMsg = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const payload = line.trim();
      if (!payload) continue;

      const event = JSON.parse(payload);
      if (event.type === "meta") {
        const fnInfo = `[${event.planner_source}] ${event.function_name}(${JSON.stringify(event.function_args)})`;
        plotMsg = appendChatMessage("assistant", "可視化プロット");
        await appendFigureToMessage(plotMsg, event?.result?.figure);
        reportMsg = appendChatMessage("assistant", "", fnInfo);
        continue;
      }

      if (event.type === "report_chunk") {
        reportText += event.chunk || "";
        if (!reportMsg) {
          reportMsg = appendChatMessage("assistant", "");
        }
        setChatMessageText(reportMsg, reportText);
      }
    }
  }
}

function formatNumber(value) {
  if (typeof value !== "number") return value;
  return value.toLocaleString();
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(value);
}

function createSparkHistogram(distribution) {
  const spark = document.createElement("div");
  spark.className = "spark";
  if (!distribution || distribution.length === 0) {
    const empty = document.createElement("span");
    empty.textContent = "-";
    spark.appendChild(empty);
    return spark;
  }

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);
  distribution.slice(0, 20).forEach((item) => {
    const bar = document.createElement("div");
    bar.className = "spark-bar";
    bar.style.height = `${Math.max(2, Math.round((item.count / maxCount) * 34))}px`;
    bar.title = `${item.bucket}: ${item.count}`;
    spark.appendChild(bar);
  });
  return spark;
}

function renderSummary(profile) {
  summaryEl.innerHTML = "";
  const items = [
    { label: "Rows", value: formatNumber(profile.rows) },
    { label: "Columns", value: formatNumber(profile.columns) },
    {
      label: "Global Null Rate",
      value: `${(profile.global_null_rate * 100).toFixed(2)}%`,
    },
  ];

  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "summary-item";
    div.innerHTML = `<p>${item.label}</p><h3>${item.value}</h3>`;
    summaryEl.appendChild(div);
  });
}

function renderPreview(preview) {
  previewThead.innerHTML = "";
  previewTbody.innerHTML = "";

  const tr = document.createElement("tr");
  preview.columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    th.title = col;
    tr.appendChild(th);
  });
  previewThead.appendChild(tr);

  preview.rows.forEach((row) => {
    const rowEl = document.createElement("tr");
    preview.columns.forEach((col) => {
      const td = document.createElement("td");
      const value = row[col];
      const text = value === null || value === undefined ? "" : String(value);
      td.textContent = text;
      td.title = text;
      rowEl.appendChild(td);
    });
    previewTbody.appendChild(rowEl);
  });
}

function modeFromDetails(details) {
  if (details?.stats?.mode !== undefined && details?.stats?.mode !== null) {
    return details.stats.mode;
  }
  if (Array.isArray(details?.stats?.top_values) && details.stats.top_values.length > 0) {
    return details.stats.top_values[0].value;
  }
  return null;
}

function renderColumnTable(columnProfiles, columnDetails) {
  columnThead.innerHTML = "";
  columnTbody.innerHTML = "";

  const headerRow = document.createElement("tr");
  const metricTh = document.createElement("th");
  metricTh.textContent = "metric";
  metricTh.className = "metric-col";
  headerRow.appendChild(metricTh);

  columnProfiles.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.name;
    th.title = col.name;
    headerRow.appendChild(th);
  });
  columnThead.appendChild(headerRow);

  const rows = [
    { key: "distribution", label: "distribution_hist" },
    { key: "inferred_type", label: "type" },
    { key: "non_null_count", label: "non_null" },
    { key: "null_count", label: "null" },
    { key: "null_rate", label: "null_rate(%)" },
    { key: "unique_count", label: "unique" },
    { key: "max", label: "max" },
    { key: "min", label: "min" },
    { key: "median", label: "median" },
    { key: "mode", label: "mode" },
    { key: "sample", label: "sample" },
  ];

  rows.forEach((rowMeta) => {
    const tr = document.createElement("tr");
    const metricTd = document.createElement("td");
    metricTd.textContent = rowMeta.label;
    metricTd.className = "metric-col";
    tr.appendChild(metricTd);

    columnProfiles.forEach((col) => {
      const td = document.createElement("td");
      const details = columnDetails[col.name];

      let value = "-";
      if (rowMeta.key === "distribution") {
        td.appendChild(createSparkHistogram(details?.distribution || []));
      } else if (rowMeta.key === "null_rate") {
        value = `${(col.null_rate * 100).toFixed(2)}`;
        td.textContent = value;
        td.title = value;
      } else if (["inferred_type", "non_null_count", "null_count", "unique_count", "sample"].includes(rowMeta.key)) {
        value = col[rowMeta.key];
        const text = formatValue(value);
        td.textContent = text;
        td.title = text;
      } else if (["max", "min", "median"].includes(rowMeta.key)) {
        value = details?.stats?.[rowMeta.key];
        const text = formatValue(value);
        td.textContent = text;
        td.title = text;
      } else if (rowMeta.key === "mode") {
        value = modeFromDetails(details);
        const text = formatValue(value);
        td.textContent = text;
        td.title = text;
      }
      tr.appendChild(td);
    });

    columnTbody.appendChild(tr);
  });
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("分析中...");

  const formData = new FormData(uploadForm);

  try {
    const response = await fetch("/api/profile", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error || "分析に失敗しました", true);
      return;
    }

    renderSummary(data.profile);
    renderColumnTable(data.column_profiles, data.column_details);
    renderPreview(data.preview);
    setStatus("分析が完了しました。");
  } catch (error) {
    setStatus(`通信エラー: ${error.message}`, true);
  }
});

fileInput.addEventListener("change", () => {
  updateCsvOptionsVisibility();
});

updateCsvOptionsVisibility();
appendChatMessage("assistant", "チャットで可視化を作成できます。まずEDAタブでデータを分析してから依頼してください。");
scrollHistoryToBottom(true);

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
});

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 140)}px`;
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  appendChatMessage("user", message);
  chatInput.value = "";
  chatInput.style.height = "44px";
  chatInput.disabled = true;
  chatSendBtn.disabled = true;
  setChatStatus("可視化を実行中...");

  try {
    const response = await fetch("/api/chat-visualize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, stream: true }),
    });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      const errData = await response.json();
      setChatStatus(errData.error || "可視化に失敗しました", true);
      appendChatMessage("assistant", errData.error || "可視化に失敗しました。");
      return;
    }

    if (contentType.includes("application/x-ndjson")) {
      await handleChatStreamResponse(response);
    } else {
      const data = await response.json();
      const fnInfo = `[${data.planner_source}] ${data.function_name}(${JSON.stringify(data.function_args)})`;
      const plotMsg = appendChatMessage("assistant", "可視化プロット");
      await appendFigureToMessage(plotMsg, data?.result?.figure);
      appendChatMessage("assistant", data.report, fnInfo);
    }
    setChatStatus("可視化を更新しました。");
  } catch (error) {
    setChatStatus(`通信エラー: ${error.message}`, true);
    appendChatMessage("assistant", `通信エラー: ${error.message}`);
  } finally {
    chatInput.disabled = false;
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
});
