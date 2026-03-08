const playerNamesInput = document.getElementById("player-names");
const applyPlayersButton = document.getElementById("apply-players");
const clearPlayersButton = document.getElementById("clear-players");
const playerCards = document.getElementById("player-cards");
const playerStatus = document.getElementById("player-status");
const roleWolfList = document.getElementById("role-wolf");
const roleSeerList = document.getElementById("role-seer");
const roleKnightList = document.getElementById("role-knight");
const roleMadList = document.getElementById("role-mad");
const roleMediumList = document.getElementById("role-medium");

const seerCountSelect = document.getElementById("seer-count");
const mediumCountSelect = document.getElementById("medium-count");
const banmenCode = document.getElementById("banmen-code");
const noteInput = document.getElementById("note");

const actorSelect = document.getElementById("actor");
const targetSelect = document.getElementById("target");
const actionSelect = document.getElementById("action");
const reasonSelect = document.getElementById("reason");
const addLogButton = document.getElementById("add-log");
const clearLogsButton = document.getElementById("clear-logs");

const logList = document.getElementById("log-list");
const featureTable = document.getElementById("feature-table");
const featureHead = featureTable ? featureTable.querySelector("thead") : null;
const featureBody = featureTable ? featureTable.querySelector("tbody") : null;
const recalcStatus = document.getElementById("recalc-status");
const featureWrap = featureTable ? featureTable.closest(".table-wrap") : null;

const exportJsonButton = document.getElementById("export-json");
const exportCsvButton = document.getElementById("export-csv");
const exportStateButton = document.getElementById("export-state");
const importStateInput = document.getElementById("import-state");

const ACTIONS = [
  { value: "white_raise", label: "白上げ" },
  { value: "suspect", label: "疑い" },
  { value: "thought_update", label: "思考更新" },
  { value: "binjou", label: "便乗" },
  { value: "question", label: "質問" },
  { value: "two_wolf_deny", label: "2狼否定" },
];

const REASONS = [
  { value: "none", label: "なし" },
  { value: "emotion", label: "感覚" },
  { value: "logic", label: "論理" },
];

let players = [];
let roles = {};
let logs = [];
let roleSelections = {
  wolf: new Set(),
  seer: new Set(),
  knight: new Set(),
  mad: new Set(),
  medium: new Set(),
};

function parseNames(raw) {
  return raw
    .replace(/\r/g, "\n")
    .split(/[,\n、]+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function unique(list) {
  return Array.from(new Set(list));
}

function isWolf(role) {
  return String(role || "").includes("人狼");
}

function isVillager(role) {
  return role ? !isWolf(role) : false;
}

function updateBanmenCode() {
  const seer = seerCountSelect.value || "0";
  const medium = mediumCountSelect.value || "0";
  banmenCode.textContent = `${seer}-${medium}`;
  updateFeatureTable();
}

function buildCountOptions(select, min, max) {
  select.innerHTML = "";
  for (let i = min; i <= max; i += 1) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = String(i);
    select.appendChild(option);
  }
}

function buildRoleSelectors() {
  const lists = document.querySelectorAll(".role-list");
  lists.forEach((list) => {
    const roleKey = list.dataset.role;
    renderRoleChips(list, roleKey);
  });
}

function renderRoleChips(container, roleKey) {
  if (!container || !roleKey) {
    return;
  }
  container.innerHTML = "";
  players.forEach((name) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "role-chip";
    chip.textContent = name;
    chip.dataset.name = name;
    chip.addEventListener("click", () => toggleRole(roleKey, name));
    container.appendChild(chip);
  });
  refreshRoleChipStates();
}

function refreshRoleChipStates() {
  Object.entries(roleSelections).forEach(([roleKey, set]) => {
    const container = getRoleContainer(roleKey);
    if (!container) {
      return;
    }
    Array.from(container.querySelectorAll(".role-chip")).forEach((chip) => {
      const name = chip.dataset.name || chip.textContent;
      chip.classList.toggle("active", set.has(name));
    });
  });
}

function getRoleContainer(roleKey) {
  if (roleKey === "wolf") return roleWolfList;
  if (roleKey === "seer") return roleSeerList;
  if (roleKey === "knight") return roleKnightList;
  if (roleKey === "mad") return roleMadList;
  if (roleKey === "medium") return roleMediumList;
  return null;
}

function toggleRole(roleKey, name) {
  if (!roleSelections[roleKey]) {
    roleSelections[roleKey] = new Set();
  }
  const targetSet = roleSelections[roleKey];
  if (targetSet.has(name)) {
    targetSet.delete(name);
  } else {
    Object.values(roleSelections).forEach((set) => {
      set.delete(name);
    });
    targetSet.add(name);
  }
  applyRolesFromSelection();
  refreshRoleChipStates();
}

function renderPlayerCards() {
  playerCards.innerHTML = "";
  players.forEach((name) => {
    const chip = document.createElement("div");
    chip.className = "player-card";
    chip.textContent = name;
    playerCards.appendChild(chip);
  });
}

function updatePlayerStatus(message, isError) {
  playerStatus.textContent = message;
  playerStatus.classList.toggle("error", Boolean(isError));
}

function applyRolesFromSelection() {
  const wolf = Array.from(roleSelections.wolf);
  const seer = Array.from(roleSelections.seer);
  const knight = Array.from(roleSelections.knight);
  const mad = Array.from(roleSelections.mad);
  const medium = Array.from(roleSelections.medium);
  const roleMap = {};
  wolf.forEach((name) => {
    roleMap[name] = "人狼";
  });
  seer.forEach((name) => {
    roleMap[name] = "占い師";
  });
  knight.forEach((name) => {
    roleMap[name] = "騎士";
  });
  mad.forEach((name) => {
    roleMap[name] = "狂人";
  });
  medium.forEach((name) => {
    roleMap[name] = "霊媒師";
  });
  players.forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(roleMap, name)) {
      roles[name] = roleMap[name];
    } else {
      roles[name] = "村人";
    }
  });
  updateFeatureTable();
}

function buildSelectOptions(select, values, withEmpty) {
  select.innerHTML = "";
  if (withEmpty) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "なし";
    select.appendChild(option);
  }
  values.forEach((value) => {
    const option = document.createElement("option");
    const hasValue = value && Object.prototype.hasOwnProperty.call(value, "value");
    const hasLabel = value && Object.prototype.hasOwnProperty.call(value, "label");
    option.value = hasValue ? value.value : value;
    option.textContent = hasLabel ? value.label : value;
    select.appendChild(option);
  });
}

function refreshPlayerSelects() {
  buildSelectOptions(actorSelect, players.map((name) => ({ value: name, label: name })), false);
  buildSelectOptions(targetSelect, players.map((name) => ({ value: name, label: name })), true);
}

function applyPlayers() {
  players = unique(parseNames(playerNamesInput.value));
  if (players.length === 0) {
    updatePlayerStatus("名簿が空です。区切りを確認してください。", true);
    renderPlayerCards();
    refreshPlayerSelects();
    buildRoleSelectors();
    updateFeatureTable();
    return;
  }
  roles = players.reduce((acc, name) => {
    acc[name] = roles[name] ? roles[name] : "村人";
    return acc;
  }, {});
  roleSelections = {
    wolf: new Set(),
    seer: new Set(),
    knight: new Set(),
    mad: new Set(),
    medium: new Set(),
  };
  refreshPlayerSelects();
  buildRoleSelectors();
  renderPlayerCards();
  applyRolesFromSelection();
  updatePlayerStatus(`名簿を登録しました (${players.length}人)`, false);
  updateFeatureTable();
}

function clearPlayers() {
  players = [];
  roles = {};
  playerNamesInput.value = "";
  refreshPlayerSelects();
  buildRoleSelectors();
  renderPlayerCards();
  updatePlayerStatus("未登録", false);
  updateFeatureTable();
}

function addLog() {
  const actor = actorSelect.value;
  if (!actor) {
    return;
  }
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    actor,
    target: targetSelect.value || "",
    action: actionSelect.value,
    reason: reasonSelect.value,
  };
  logs.push(entry);
  renderLogs();
  updateFeatureTable();
}

function clearLogs() {
  logs = [];
  renderLogs();
  updateFeatureTable();
}

function renderLogs() {
  logList.innerHTML = "";
  logs.forEach((log, index) => {
    const card = document.createElement("div");
    card.className = "log-card";
    const actionItem = ACTIONS.find((item) => item.value === log.action);
    const reasonItem = REASONS.find((item) => item.value === log.reason);
    const parts = [
      { label: "誰が", value: log.actor },
      { label: "誰に", value: log.target || "-" },
      {
        label: "行動",
        value: actionItem ? actionItem.label : log.action,
      },
      {
        label: "理由",
        value: reasonItem ? reasonItem.label : log.reason,
      },
    ];
    parts.forEach((part) => {
      const cell = document.createElement("div");
      const tag = document.createElement("div");
      tag.className = "log-tag";
      tag.textContent = part.label;
      const value = document.createElement("div");
      value.className = "log-value";
      value.textContent = part.value;
      cell.appendChild(tag);
      cell.appendChild(value);
      card.appendChild(cell);
    });
    const actionCell = document.createElement("div");
    actionCell.className = "log-actions";
    const moveUp = document.createElement("button");
    moveUp.className = "ghost";
    moveUp.textContent = "↑";
    moveUp.disabled = index === 0;
    moveUp.addEventListener("click", () => {
      if (index === 0) {
        return;
      }
      const swapped = logs[index - 1];
      logs[index - 1] = logs[index];
      logs[index] = swapped;
      renderLogs();
      updateFeatureTable();
    });
    const moveDown = document.createElement("button");
    moveDown.className = "ghost";
    moveDown.textContent = "↓";
    moveDown.disabled = index === logs.length - 1;
    moveDown.addEventListener("click", () => {
      if (index >= logs.length - 1) {
        return;
      }
      const swapped = logs[index + 1];
      logs[index + 1] = logs[index];
      logs[index] = swapped;
      renderLogs();
      updateFeatureTable();
    });
    const remove = document.createElement("button");
    remove.className = "ghost";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      logs = logs.filter((item) => item.id !== log.id);
      renderLogs();
      updateFeatureTable();
    });
    actionCell.appendChild(moveUp);
    actionCell.appendChild(moveDown);
    actionCell.appendChild(remove);
    card.appendChild(actionCell);
    logList.appendChild(card);
  });
}

function collectTargets(actorName, actionType) {
  return unique(
    logs
      .filter((log) => log.actor === actorName && log.action === actionType && log.target)
      .map((log) => log.target)
  );
}

function collectTargetsByReason(actorName, actionType, reasonType) {
  return unique(
    logs
      .filter(
        (log) =>
          log.actor === actorName &&
          log.action === actionType &&
          log.reason === reasonType &&
          log.target
      )
      .map((log) => log.target)
  );
}

function countThoughtUpdates(actorName) {
  return logs.filter((log) => log.actor === actorName && log.action === "thought_update")
    .length;
}

function computeLeakTargets(actionType, roleFilter) {
  return unique(
    logs
      .filter((log) => log.action === actionType && log.target)
      .filter((log) => {
        const role = roles[log.target];
        if (!roleFilter) {
          return true;
        }
        return roleFilter(role);
      })
      .filter((log) => {
        const actorRole = roles[log.actor];
        return isWolf(actorRole);
      })
      .map((log) => log.target)
  );
}

function buildTargetTimeline(filterFn) {
  const timeline = [];
  const seen = new Set();
  logs.forEach((log, index) => {
    if (filterFn(log)) {
      seen.add(log.target);
    }
    timeline[index] = new Set(seen);
  });
  return timeline;
}

function hasPriorTarget(timeline, target, logIndex) {
  if (logIndex <= 0) {
    return false;
  }
  const prior = timeline[logIndex - 1];
  return prior ? prior.has(target) : false;
}

function buildVillagerSuspectTimeline() {
  return buildTargetTimeline(
    (log) =>
      log.action === "suspect" &&
      log.target &&
      isVillager(roles[log.actor]) &&
      isVillager(roles[log.target])
  );
}

function buildVillagerSuspectActorTimeline() {
  const timeline = [];
  const seen = new Set();
  logs.forEach((log, index) => {
    if (
      log.action === "suspect" &&
      log.target &&
      isVillager(roles[log.actor]) &&
      isVillager(roles[log.target])
    ) {
      seen.add(log.actor);
    }
    timeline[index] = new Set(seen);
  });
  return timeline;
}

function buildWolfSuspectTimeline() {
  return buildTargetTimeline(
    (log) => log.action === "suspect" && log.target && isWolf(roles[log.actor])
  );
}

function buildWolfWhiteTimeline() {
  return buildTargetTimeline(
    (log) => log.action === "white_raise" && log.target && isWolf(roles[log.actor])
  );
}

function buildWolfSuspectVillagerTimeline() {
  return buildTargetTimeline(
    (log) =>
      log.action === "suspect" &&
      log.target &&
      isWolf(roles[log.actor]) &&
      isVillager(roles[log.target])
  );
}

function buildWolfWhiteVillagerTimeline() {
  return buildTargetTimeline(
    (log) =>
      log.action === "white_raise" &&
      log.target &&
      isWolf(roles[log.actor]) &&
      isVillager(roles[log.target])
  );
}

function buildVillagerWhiteWolfActorTimeline() {
  const timeline = [];
  const seen = new Set();
  logs.forEach((log, index) => {
    if (
      log.action === "white_raise" &&
      log.target &&
      isVillager(roles[log.actor]) &&
      isWolf(roles[log.target])
    ) {
      seen.add(log.actor);
    }
    timeline[index] = new Set(seen);
  });
  return timeline;
}

function buildVillagerSuspectWolfActorTimeline() {
  const timeline = [];
  const seen = new Set();
  logs.forEach((log, index) => {
    if (
      log.action === "suspect" &&
      log.target &&
      isVillager(roles[log.actor]) &&
      isWolf(roles[log.target])
    ) {
      seen.add(log.actor);
    }
    timeline[index] = new Set(seen);
  });
  return timeline;
}

function computeFeaturesForPlayer(name, timelines) {
  const shiroTargets = collectTargets(name, "white_raise");
  const utagaiTargets = collectTargets(name, "suspect");
  const shitsumonTargets = collectTargets(name, "question");
  const twoWolfDenyTargets = collectTargets(name, "two_wolf_deny");

  const binjouFlag = logs.some((log) => log.actor === name && log.action === "binjou");

  const wolfShiroTargets = shiroTargets.filter((target) => isWolf(roles[target]));
  const wolfUtagaiTargets = utagaiTargets.filter((target) => isWolf(roles[target]));
  const wolfShitsumonTargets = shitsumonTargets.filter((target) => isWolf(roles[target]));
  const wolfTwoWolfDenyTargets = twoWolfDenyTargets.filter((target) => isWolf(roles[target]));
  const villagerShiroTargets = shiroTargets.filter((target) => isVillager(roles[target]));
  const villagerUtagaiTargets = utagaiTargets.filter((target) => isVillager(roles[target]));
  const villagerShitsumonTargets = shitsumonTargets.filter((target) => isVillager(roles[target]));
  const villagerTwoWolfDenyTargets = twoWolfDenyTargets.filter((target) => isVillager(roles[target]));

  const wolfSuspectTargets = computeLeakTargets("suspect");
  const wolfWhiteTargets = computeLeakTargets("white_raise");
  const wolfSuspectVillagers = computeLeakTargets(
    "suspect",
    (role) => isVillager(role)
  );
  const wolfWhiteVillagers = computeLeakTargets(
    "white_raise",
    (role) => isVillager(role)
  );
  const hasPriorVillagerSuspect = (target, logIndex) =>
    hasPriorTarget(timelines.villagerSuspect, target, logIndex);
  const hasPriorVillagerSuspectActor = (actorName, logIndex) =>
    hasPriorTarget(timelines.villagerSuspectActor, actorName, logIndex);
  const hasPriorWolfSuspect = (target, logIndex) =>
    hasPriorTarget(timelines.wolfSuspect, target, logIndex);
  const hasPriorWolfWhite = (target, logIndex) =>
    hasPriorTarget(timelines.wolfWhite, target, logIndex);
  const hasPriorWolfSuspectVillager = (target, logIndex) =>
    hasPriorTarget(timelines.wolfSuspectVillager, target, logIndex);
  const hasPriorWolfWhiteVillager = (target, logIndex) =>
    hasPriorTarget(timelines.wolfWhiteVillager, target, logIndex);
  const hasPriorVillagerSuspectWolfActor = (actorName, logIndex) =>
    hasPriorTarget(timelines.villagerSuspectWolfActor, actorName, logIndex);
  const hasPriorVillagerWhiteWolfActor = (actorName, logIndex) =>
    hasPriorTarget(timelines.villagerWhiteWolfActor, actorName, logIndex);

  return {
    shikou_koushin_count_1: countThoughtUpdates(name),
    shiroage_count_1: shiroTargets.length,
    kanjou_shiroage_count_1: collectTargetsByReason(name, "white_raise", "emotion").length,
    riron_shiroage_count_1: collectTargetsByReason(name, "white_raise", "logic").length,
    utagai_count_1: utagaiTargets.length,
    kanjou_utagai_count_1: collectTargetsByReason(name, "suspect", "emotion").length,
    riron_utagai_count_1: collectTargetsByReason(name, "suspect", "logic").length,
    shitsumon_count_1: shitsumonTargets.length,
    "2whitei_count_1": twoWolfDenyTargets.length,
    binjou_1: binjouFlag ? 1 : 0,
    jinrou_shiroage_count_2: wolfShiroTargets.length,
    jinrou_utagai_count_2: wolfUtagaiTargets.length,
    murabito_shiroage_count_2: villagerShiroTargets.length,
    murabito_utagai_count_2: villagerUtagaiTargets.length,
    jinrou_utagai_murabito_shiro_2: Number(
      logs.some(
        (log, index) =>
          log.actor === name &&
          log.action === "white_raise" &&
          log.target &&
          isVillager(roles[log.target]) &&
          hasPriorVillagerSuspectWolfActor(log.target, index)
      )
    ),
    jinrou_utagai_murabito_kuro_2: Number(
      logs.some(
        (log, index) =>
          log.actor === name &&
          log.action === "suspect" &&
          log.target &&
          isVillager(roles[log.target]) &&
          hasPriorVillagerSuspectWolfActor(log.target, index)
      )
    ),
    jinrou_shiro_murabito_utagai_2: Number(
      logs.some(
        (log, index) =>
          log.actor === name &&
          log.action === "suspect" &&
          log.target &&
          isVillager(roles[log.target]) &&
          hasPriorVillagerWhiteWolfActor(log.target, index)
      )
    ),
    jinrou_shiro_murabito_shiro_2: Number(
      logs.some(
        (log, index) =>
          log.actor === name &&
          log.action === "white_raise" &&
          log.target &&
          isVillager(roles[log.target]) &&
          hasPriorVillagerWhiteWolfActor(log.target, index)
      )
    ),
    jinrou_binjou_2: Number(
      logs.some(
        (log) =>
          log.actor === name &&
          log.action === "binjou" &&
          log.target &&
          isWolf(roles[log.target])
      )
    ),
    murabito_binjou_2: Number(
      logs.some(
        (log) =>
          log.actor === name &&
          log.action === "binjou" &&
          log.target &&
          log.target in roles &&
          isVillager(roles[log.target])
      )
    ),
    murabito_utagai_murabito_shiro_2: Number(
      logs.some(
        (log, index) =>
          log.actor === name &&
          log.action === "white_raise" &&
          log.target &&
          isVillager(roles[log.target]) &&
          hasPriorVillagerSuspectActor(log.target, index)
      )
    ),
    murabito_utagai_murabito_kuro_2: Number(
      logs.some(
        (log, index) =>
          log.actor === name &&
          log.action === "suspect" &&
          log.target &&
          isVillager(roles[log.target]) &&
          hasPriorVillagerSuspectActor(log.target, index)
      )
    ),
    jinrou_shitsumon_count_2: wolfShitsumonTargets.length,
    murabito_shitsumon_count_2: villagerShitsumonTargets.length,
    jinrou_2whitei_count_2: wolfTwoWolfDenyTargets.length,
    murabito_2whitei_count_2: villagerTwoWolfDenyTargets.length,
  };
}

function buildFeatureRows() {
  const banmen = banmenCode.textContent || "";
  const bikou = noteInput.value.trim();
  const columns = [
    "player",
    "role",
    "banmen",
    "bikou",
    "shikou_koushin_count_1",
    "shiroage_count_1",
    "kanjou_shiroage_count_1",
    "riron_shiroage_count_1",
    "utagai_count_1",
    "kanjou_utagai_count_1",
    "riron_utagai_count_1",
    "shitsumon_count_1",
    "2whitei_count_1",
    "binjou_1",
    "jinrou_shiroage_count_2",
    "jinrou_utagai_count_2",
    "murabito_shiroage_count_2",
    "murabito_utagai_count_2",
    "jinrou_utagai_murabito_shiro_2",
    "jinrou_utagai_murabito_kuro_2",
    "jinrou_shiro_murabito_utagai_2",
    "jinrou_shiro_murabito_shiro_2",
    "jinrou_binjou_2",
    "murabito_binjou_2",
    "murabito_utagai_murabito_shiro_2",
    "murabito_utagai_murabito_kuro_2",
    "jinrou_shitsumon_count_2",
    "murabito_shitsumon_count_2",
    "jinrou_2whitei_count_2",
    "murabito_2whitei_count_2",
  ];

  const timelines = {
    villagerSuspect: buildVillagerSuspectTimeline(),
    villagerSuspectActor: buildVillagerSuspectActorTimeline(),
    wolfSuspect: buildWolfSuspectTimeline(),
    wolfWhite: buildWolfWhiteTimeline(),
    wolfSuspectVillager: buildWolfSuspectVillagerTimeline(),
    wolfWhiteVillager: buildWolfWhiteVillagerTimeline(),
    villagerWhiteWolfActor: buildVillagerWhiteWolfActorTimeline(),
    villagerSuspectWolfActor: buildVillagerSuspectWolfActorTimeline(),
  };
  const rows = players.map((name) => {
    const features = computeFeaturesForPlayer(name, timelines);
    return columns.map((col) => {
      if (col === "player") return name;
      if (col === "role") return roles[name] ? roles[name] : "村人";
      if (col === "banmen") return banmen;
      if (col === "bikou") return bikou;
      if (Object.prototype.hasOwnProperty.call(features, col)) {
        return features[col];
      }
      return "";
    });
  });
  return { columns, rows };
}

function updateFeatureTable() {
  if (!featureHead || !featureBody) {
    return;
  }
  const { columns, rows } = buildFeatureRows();
  featureHead.innerHTML = "";
  featureBody.innerHTML = "";
  const headRow = document.createElement("tr");
  columns.forEach((title) => {
    const th = document.createElement("th");
    th.textContent = title;
    headRow.appendChild(th);
  });
  featureHead.appendChild(headRow);
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.appendChild(td);
    });
    featureBody.appendChild(tr);
  });
  if (recalcStatus) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    recalcStatus.textContent = `再計算: ${hh}:${mm}:${ss}`;
  }
  if (featureWrap) {
    featureWrap.classList.remove("recalc");
    void featureWrap.offsetWidth;
    featureWrap.classList.add("recalc");
  }
}

function buildCsv({ columns, rows }) {
  return [columns, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const safeCell = cell == null ? "" : cell;
          const text = String(safeCell);
          if (text.includes("\"") || text.includes(",") || text.includes("\n")) {
            return `"${text.replace(/\"/g, '""')}"`;
          }
          return text;
        })
        .join(",")
    )
    .join("\n");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildStatePayload() {
  const rolesArray = players.map((name) => ({
    name,
    role: roles[name] ? roles[name] : "村人",
  }));
  return {
    version: 1,
    players: players.slice(),
    roles: rolesArray,
    roleSelections: {
      wolf: Array.from(roleSelections.wolf),
      seer: Array.from(roleSelections.seer),
      knight: Array.from(roleSelections.knight),
      mad: Array.from(roleSelections.mad),
      medium: Array.from(roleSelections.medium),
    },
    banmen: {
      seer: seerCountSelect.value,
      medium: mediumCountSelect.value,
    },
    note: noteInput.value,
    logs: logs.map((log) => ({
      id: log.id,
      actor: log.actor,
      target: log.target,
      action: log.action,
      reason: log.reason,
    })),
  };
}

function downloadState() {
  const filename = getExportFilename("json");
  if (!filename) {
    return;
  }
  const payload = buildStatePayload();
  const json = JSON.stringify(payload, null, 2);
  downloadFile(filename, json, "application/json;charset=utf-8;");
}

function applyStatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const nextPlayers = Array.isArray(payload.players) ? payload.players : [];
  players = unique(nextPlayers.map((name) => String(name)));
  playerNamesInput.value = players.join("\n");

  roles = {};
  if (Array.isArray(payload.roles)) {
    payload.roles.forEach((entry) => {
      if (entry && entry.name) {
        roles[String(entry.name)] = entry.role ? String(entry.role) : "村人";
      }
    });
  }
  players.forEach((name) => {
    if (!roles[name]) {
      roles[name] = "村人";
    }
  });

  roleSelections = {
    wolf: new Set(),
    seer: new Set(),
    knight: new Set(),
    mad: new Set(),
    medium: new Set(),
  };
  const selections = payload.roleSelections || {};
  ["wolf", "seer", "knight", "mad", "medium"].forEach((key) => {
    const list = Array.isArray(selections[key]) ? selections[key] : [];
    list.forEach((name) => {
      if (players.includes(name)) {
        roleSelections[key].add(name);
      }
    });
  });

  refreshPlayerSelects();
  buildRoleSelectors();
  renderPlayerCards();
  refreshRoleChipStates();
  applyRolesFromSelection();

  if (payload.banmen) {
    const seer = payload.banmen.seer;
    const medium = payload.banmen.medium;
    if (seer !== undefined) {
      seerCountSelect.value = String(seer);
    }
    if (medium !== undefined) {
      mediumCountSelect.value = String(medium);
    }
  }
  updateBanmenCode();

  noteInput.value = payload.note ? String(payload.note) : "";

  logs = Array.isArray(payload.logs)
    ? payload.logs.map((log) => ({
        id: log.id || Date.now().toString(36) + Math.random().toString(36).slice(2),
        actor: log.actor || "",
        target: log.target || "",
        action: log.action || "white_raise",
        reason: log.reason || "none",
      }))
    : [];
  renderLogs();
  updateFeatureTable();
  updatePlayerStatus(`名簿を登録しました (${players.length}人)`, false);
}

function handleStateImport(file) {
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      applyStatePayload(parsed);
    } catch (error) {
      window.alert("状態ファイルの読み込みに失敗しました。");
    }
  };
  reader.readAsText(file);
}
async function gzipText(text) {
  if (typeof CompressionStream === "undefined") {
    return null;
  }
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  const response = new Response(stream.readable);
  return response.blob();
}

function getExportFilename(extension) {
  const raw = window.prompt("ファイル名を入力してください (拡張子不要)", "jinro_features");
  if (raw === null) {
    return null;
  }
  const name = raw.trim();
  const safe = (name || "jinro_features").replace(/[\\/:*?"<>|]/g, "_");
  const base = safe.replace(/\.[a-z0-9]+$/i, "");
  return `${base}.${extension}`;
}

async function downloadCsvGzip() {
  const filename = getExportFilename("csv.gz");
  if (!filename) {
    return;
  }
  const data = buildFeatureRows();
  const csv = buildCsv(data);
  const gz = await gzipText(csv);
  if (!gz) {
    window.alert("このブラウザはgzip出力に対応していません。");
    return;
  }
  const url = URL.createObjectURL(gz);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadJson() {
  const filename = getExportFilename("json");
  if (!filename) {
    return;
  }
  const data = buildFeatureRows();
  const json = JSON.stringify(data, null, 2);
  downloadFile(filename, json, "application/json;charset=utf-8;");
}

function init() {
  if (
    !playerNamesInput ||
    !applyPlayersButton ||
    !clearPlayersButton ||
    !playerCards ||
    !playerStatus ||
    !roleWolfList ||
    !roleSeerList ||
    !roleKnightList ||
    !roleMadList ||
    !roleMediumList ||
    !seerCountSelect ||
    !mediumCountSelect ||
    !banmenCode ||
    !noteInput ||
    !actorSelect ||
    !targetSelect ||
    !actionSelect ||
    !reasonSelect ||
    !addLogButton ||
    !clearLogsButton ||
    !logList ||
    !exportCsvButton ||
    !exportJsonButton ||
    !exportStateButton ||
    !importStateInput
  ) {
    console.error("Required elements are missing. Check index.html IDs.");
    return;
  }
  buildCountOptions(seerCountSelect, 0, 13);
  buildCountOptions(mediumCountSelect, 0, 13);
  updateBanmenCode();
  buildSelectOptions(actionSelect, ACTIONS, false);
  buildSelectOptions(reasonSelect, REASONS, false);
  refreshPlayerSelects();
  buildRoleSelectors();
  renderLogs();
  updateFeatureTable();
  updatePlayerStatus("未登録", false);
}

applyPlayersButton.addEventListener("click", applyPlayers);
clearPlayersButton.addEventListener("click", clearPlayers);
seerCountSelect.addEventListener("change", updateBanmenCode);
mediumCountSelect.addEventListener("change", updateBanmenCode);
noteInput.addEventListener("input", updateFeatureTable);
addLogButton.addEventListener("click", addLog);
clearLogsButton.addEventListener("click", clearLogs);
exportCsvButton.addEventListener("click", () => {
  downloadCsvGzip();
});
exportJsonButton.addEventListener("click", downloadJson);
exportStateButton.addEventListener("click", downloadState);
importStateInput.addEventListener("change", (event) => {
  const file = event.target.files ? event.target.files[0] : null;
  if (!file) {
    return;
  }
  handleStateImport(file);
  event.target.value = "";
});

init();
