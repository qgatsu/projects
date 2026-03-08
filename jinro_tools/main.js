const players = [];
const baseRoles = ["吊り", "噛み", "占い師", "霊能者", "騎士"];
const days = ["1日目"];
let nextDayIndex = 2;
let nextRoleId = baseRoles.length;
let roleRows = baseRoles.map((label, index) => ({ id: `role-${index}`, label }));
const coSelections = {};
const markerSelections = {};
const roleAssignments = {};
const deathRecords = {};
let votingData = {};
const votingHistory = [];
let votingFuture = [];
let activeVotingDay = null;
let pendingVoter = null;
let editingPlayerIndex = null;

const playerListEl = document.getElementById("playersList");
const playerForm = document.getElementById("playerForm");
const countEl = document.querySelector(".count");
const coTableEl = document.getElementById("coTable");
const addRoleBtn = document.getElementById("addRoleBtn");
const votingTabsEl = document.getElementById("votingTabs");
const votingContentEl = document.getElementById("votingContent");
const openBulkModalBtn = document.getElementById("openBulkModalBtn");
const bulkModalEl = document.getElementById("bulkModal");
const bulkModalClose = document.getElementById("bulkModalClose");
const bulkCancelBtn = document.getElementById("bulkCancelBtn");
const bulkSubmitBtn = document.getElementById("bulkSubmitBtn");
const bulkInputEl = document.getElementById("bulkPlayersInput");
const undoVoteBtn = document.getElementById("undoVoteBtn");
const redoVoteBtn = document.getElementById("redoVoteBtn");
const themeToggleBtn = document.getElementById("themeToggle");
const memoTextarea = document.querySelector(".memo-textarea");
const exportModalEl = document.getElementById("exportModal");
const exportModalClose = document.getElementById("exportModalClose");
const exportCancelBtn = document.getElementById("exportCancelBtn");
const exportSubmitBtn = document.getElementById("exportSubmitBtn");
const exportResultInput = document.getElementById("exportResultInput");
const exportRolesInput = document.getElementById("exportRolesInput");
const openExportModalBtn = document.getElementById("openExportModalBtn");
const openHelpModalBtn = document.getElementById("openHelpModalBtn");
const helpModalEl = document.getElementById("helpModal");
const THEME_STORAGE_KEY = "jinro-tools-theme";
const HELP_CONTENT_PATH = "help-content.html";

function getKey(roleId, day) {
    return `${roleId}-${day}`;
}

function renderPlayers() {
    playerListEl.innerHTML = "";

    if (players.length === 0) {
        const empty = document.createElement("li");
        empty.className = "player-card empty";
        empty.textContent = "未登録です。下のフォームから追加してください。";
        playerListEl.appendChild(empty);
        countEl.textContent = "0 人";
    } else {
        players.forEach((player, index) => {
            const item = document.createElement("li");
            item.className = "player-card";
            if (editingPlayerIndex === index) {
                item.classList.add("editing");
                const input = document.createElement("input");
                input.type = "text";
                input.value = player.name;
                input.className = "player-edit-input";
                input.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        finishEditingPlayer(index, input.value.trim(), player.name);
                    } else if (event.key === "Escape") {
                        cancelEditingPlayer();
                    }
                });
                input.addEventListener("blur", () => {
                    if (editingPlayerIndex === index) {
                        cancelEditingPlayer();
                    }
                });
                queueMicrotask(() => {
                    input.focus();
                    input.select();
                });
                item.appendChild(input);

                const actions = document.createElement("div");
                actions.className = "player-card-actions";

                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "delete-btn";
                deleteBtn.setAttribute("aria-label", `${player.name} を削除`);
                deleteBtn.textContent = "×";
                deleteBtn.addEventListener("click", (event) => {
                    event.stopPropagation();
                    deletePlayer(index);
                });

                actions.appendChild(deleteBtn);
                item.appendChild(actions);
            } else {
                const nameSpan = document.createElement("span");
                nameSpan.textContent = player.name;
                item.appendChild(nameSpan);
                item.addEventListener("click", () => {
                    startEditingPlayer(index);
                });
            }
            playerListEl.appendChild(item);
        });

        countEl.textContent = `${players.length} 人`;
    }

    renderCOTable();
}

function populateSelect(select, selected) {
    select.innerHTML = "";

    const none = document.createElement("option");
    none.value = "";
    none.textContent = "なし";
    select.appendChild(none);

    players.forEach((player) => {
        const option = document.createElement("option");
        option.value = player.name;
        option.textContent = player.name;
        select.appendChild(option);
    });

    if (selected) {
        select.value = selected;
    }
}

function renderCOTable() {
    coTableEl.innerHTML = "";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th"));
    days.forEach((day) => {
        const th = document.createElement("th");
        th.textContent = day;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    const tbody = document.createElement("tbody");

    roleRows.forEach((role, index) => {
        const tr = document.createElement("tr");
        const roleCell = document.createElement("th");
        const hasMenu = supportsRoleMenu(role.label);
        if (supportsAssignment(role.label) || hasMenu) {
            roleCell.className = hasMenu ? "role-cell role-cell-inline" : "role-cell";
            const headerContent = document.createElement("div");
            headerContent.className = "role-header-content";

            const roleLabelWrapper = document.createElement("div");
            const nameSizeClass = getRoleNameSizeClass(role.label);
            roleLabelWrapper.className = `role-name${nameSizeClass ? ` ${nameSizeClass}` : ""}`;

            roleLabelWrapper.textContent = role.label;
            headerContent.appendChild(roleLabelWrapper);

            if (hasMenu) {
                const actionWrapper = document.createElement("div");
                actionWrapper.className = "role-inline-actions";

                const addBtn = document.createElement("button");
                addBtn.type = "button";
                addBtn.className = "role-inline-btn add";
                addBtn.textContent = "+";
                addBtn.addEventListener("click", (event) => {
                    event.stopPropagation();
                    addRoleRow(index);
                });

                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "role-inline-btn remove";
                removeBtn.textContent = "−";
                removeBtn.addEventListener("click", (event) => {
                    event.stopPropagation();
                    removeRoleRow(index);
                });

                actionWrapper.appendChild(addBtn);
                actionWrapper.appendChild(removeBtn);
                headerContent.appendChild(actionWrapper);
            }

            if (supportsAssignment(role.label)) {
                const assignSelect = document.createElement("select");
                assignSelect.className = "role-assignment-select";
                populateSelect(assignSelect, roleAssignments[role.id]);
                assignSelect.addEventListener("change", () => {
                    const value = assignSelect.value;
                    if (value) {
                        roleAssignments[role.id] = value;
                    } else {
                        delete roleAssignments[role.id];
                    }
                    renderCOTable();
                });
                headerContent.appendChild(assignSelect);
            }

            roleCell.appendChild(headerContent);
        } else {
            roleCell.textContent = role.label;
        }
        tr.appendChild(roleCell);

        days.forEach((day) => {
            const td = document.createElement("td");
            const cellWrapper = document.createElement("div");
            cellWrapper.className = "co-cell-content";

            const select = document.createElement("select");
            select.dataset.role = role.id;
            select.dataset.day = day;
            const key = getKey(role.id, day);
            populateSelect(select, coSelections[key]);
            select.addEventListener("change", (event) => {
                handleSelectionChange(role, day, event.target.value);
            });
            cellWrapper.appendChild(select);

            const shouldDisable = shouldDisableCell(role, day);
            td.dataset.role = role.id;
            td.dataset.day = day;
            if (shouldDisable && !coSelections[key]) {
                td.classList.add("disabled-cell");
            }

            if (supportsMarker(role.label)) {
                const markerKey = `${role.id}-${day}`;
                const markerButton = document.createElement("button");
                markerButton.type = "button";
                markerButton.className = "marker-toggle";
                const current = markerSelections[markerKey] || "white";
                updateMarkerAppearance(markerButton, current);
                markerButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    const next = markerSelections[markerKey] === "black" ? "white" : "black";
                    markerSelections[markerKey] = next;
                    updateMarkerAppearance(markerButton, next);
                });
                cellWrapper.appendChild(markerButton);
            }

            td.appendChild(cellWrapper);
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    coTableEl.appendChild(thead);
    coTableEl.appendChild(tbody);

    renderVotingTabs();
}

playerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(playerForm);
    const name = formData.get("name").trim();

    if (!name) {
        return;
    }

    players.push({ name });
    playerForm.reset();
    renderPlayers();
});

if (openBulkModalBtn) {
    openBulkModalBtn.addEventListener("click", () => {
        openBulkModal();
    });
}

if (bulkModalClose) {
    bulkModalClose.addEventListener("click", () => {
        closeBulkModal();
    });
}

if (bulkCancelBtn) {
    bulkCancelBtn.addEventListener("click", () => {
        closeBulkModal();
    });
}

if (bulkModalEl) {
    bulkModalEl.addEventListener("click", (event) => {
        if (event.target === bulkModalEl) {
            closeBulkModal();
        }
    });
}

if (bulkSubmitBtn) {
    bulkSubmitBtn.addEventListener("click", () => {
        handleBulkAdd();
    });
}

if (openExportModalBtn) {
    const activateExportModal = () => {
        openExportModal();
    };
    openExportModalBtn.addEventListener("click", activateExportModal);
    openExportModalBtn.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        event.preventDefault();
        activateExportModal();
    });
}

if (exportModalClose) {
    exportModalClose.addEventListener("click", () => {
        closeExportModal();
    });
}

if (exportCancelBtn) {
    exportCancelBtn.addEventListener("click", () => {
        closeExportModal();
    });
}

if (exportSubmitBtn) {
    exportSubmitBtn.addEventListener("click", () => {
        handleExportSummary();
    });
}

if (exportModalEl) {
    exportModalEl.addEventListener("click", (event) => {
        if (event.target === exportModalEl) {
            closeExportModal();
        }
    });
}

if (openHelpModalBtn) {
    openHelpModalBtn.addEventListener("click", () => {
        openHelpModal();
    });
    openHelpModalBtn.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        event.preventDefault();
        openHelpModal();
    });
}

if (helpModalEl) {
    helpModalEl.addEventListener("click", (event) => {
        if (event.target === helpModalEl) {
            closeHelpModal();
        }
    });
}

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
        return;
    }

    if (bulkModalEl?.classList.contains("open")) {
        closeBulkModal();
        return;
    }

    if (exportModalEl?.classList.contains("open")) {
        closeExportModal();
        return;
    }

    if (helpModalEl?.classList.contains("open")) {
        closeHelpModal();
    }
});

if (undoVoteBtn) {
    undoVoteBtn.addEventListener("click", () => {
        undoVotingChange();
    });
}

if (redoVoteBtn) {
    redoVoteBtn.addEventListener("click", () => {
        redoVotingChange();
    });
}

function openBulkModal() {
    if (!bulkModalEl) {
        return;
    }

    bulkModalEl.classList.add("open");
    bulkModalEl.setAttribute("aria-hidden", "false");
    if (bulkInputEl) {
        queueMicrotask(() => {
            bulkInputEl.focus();
            bulkInputEl.select();
        });
    }
}

function closeBulkModal() {
    if (!bulkModalEl) {
        return;
    }

    bulkModalEl.classList.remove("open");
    bulkModalEl.setAttribute("aria-hidden", "true");
}

function openExportModal() {
    if (!exportModalEl) {
        return;
    }

    exportModalEl.classList.add("open");
    exportModalEl.setAttribute("aria-hidden", "false");
    queueMicrotask(() => {
        exportResultInput?.focus();
    });
}

function closeExportModal() {
    if (!exportModalEl) {
        return;
    }

    exportModalEl.classList.remove("open");
    exportModalEl.setAttribute("aria-hidden", "true");
}

function openHelpModal() {
    if (!helpModalEl) {
        return;
    }

    helpModalEl.classList.add("open");
    helpModalEl.setAttribute("aria-hidden", "false");
}

function closeHelpModal() {
    if (!helpModalEl) {
        return;
    }

    helpModalEl.classList.remove("open");
    helpModalEl.setAttribute("aria-hidden", "true");
    openHelpModalBtn?.focus();
}

function initializeHelpModalContent() {
    if (!helpModalEl) {
        return;
    }

    fetch(HELP_CONTENT_PATH)
        .then((response) => {
            if (!response.ok) {
                throw new Error("failed to fetch help");
            }
            return response.text();
        })
        .then((html) => {
            helpModalEl.innerHTML = html;
            bindHelpModalCloseHandlers();
        })
        .catch(() => {
            helpModalEl.innerHTML = `
                <div class="modal help-modal">
                    <p class="help-intro">ヘルプを読み込めませんでした。ページを再読み込みしてみてください。</p>
                    <div class="modal-actions">
                        <button type="button" class="primary" data-help-close>閉じる</button>
                    </div>
                </div>`;
            bindHelpModalCloseHandlers();
        });
}

function bindHelpModalCloseHandlers() {
    if (!helpModalEl) {
        return;
    }

    const closeButtons = helpModalEl.querySelectorAll("[data-help-close]");
    closeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            closeHelpModal();
        });
    });
}

function handleExportSummary() {
    const resultText = exportResultInput?.value.trim() || "";
    const rolesText = exportRolesInput?.value.trim() || "";
    closeExportModal();
    exportMatchSummary({ resultText, rolesText });
}

function handleBulkAdd() {
    if (!bulkInputEl) {
        return;
    }

    const names = parseBulkInput(bulkInputEl.value);
    if (names.length === 0) {
        window.alert("登録できる名前が見つかりません。");
        return;
    }

    const uniqueNames = [...new Set(names)];
    const existing = new Set(players.map((player) => player.name));
    const added = [];
    const skipped = [];

    uniqueNames.forEach((name) => {
        if (existing.has(name)) {
            skipped.push(name);
            return;
        }
        players.push({ name });
        existing.add(name);
        added.push(name);
    });

    if (added.length === 0) {
        window.alert("すべての名前が既に登録されています。");
        return;
    }

    bulkInputEl.value = "";
    closeBulkModal();
    renderPlayers();

    if (skipped.length > 0) {
        window.alert("一部の名前は既に登録されているため追加されませんでした。");
    }
}

function parseBulkInput(value) {
    if (!value) {
        return [];
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return [];
    }

    const delimiter = /[,\u3001\uFF0C\r\n]+/;
    return trimmed
        .split(delimiter)
        .map((item) => item.trim())
        .filter(Boolean);
}

function deletePlayer(index) {
    const target = players[index];
    if (!window.confirm(`${target.name} を削除しますか？`)) {
        return;
    }

    players.splice(index, 1);
    removeSelectionsFor(target.name);
    if (editingPlayerIndex === index) {
        editingPlayerIndex = null;
    } else if (editingPlayerIndex !== null && editingPlayerIndex > index) {
        editingPlayerIndex -= 1;
    }
    renderPlayers();
}

function renameSelections(oldName, newName) {
    Object.keys(coSelections).forEach((key) => {
        if (coSelections[key] === oldName) {
            coSelections[key] = newName;
        }
    });

    Object.keys(roleAssignments).forEach((roleId) => {
        if (roleAssignments[roleId] === oldName) {
            roleAssignments[roleId] = newName;
        }
    });

    if (deathRecords[oldName]) {
        deathRecords[newName] = deathRecords[oldName];
        delete deathRecords[oldName];
    }
}

function removeSelectionsFor(name) {
    Object.keys(coSelections).forEach((key) => {
        if (coSelections[key] === name) {
            delete coSelections[key];
        }
    });

    Object.keys(roleAssignments).forEach((roleId) => {
        if (roleAssignments[roleId] === name) {
            delete roleAssignments[roleId];
        }
    });

    delete deathRecords[name];
}

function removeSelectionsForRole(roleId) {
    Object.keys(coSelections).forEach((key) => {
        if (key.startsWith(`${roleId}-`)) {
            delete coSelections[key];
        }
    });

    Object.keys(markerSelections).forEach((key) => {
        if (key.startsWith(`${roleId}-`)) {
            delete markerSelections[key];
        }
    });

    delete roleAssignments[roleId];
}

function startEditingPlayer(index) {
    editingPlayerIndex = index;
    renderPlayers();
}

function cancelEditingPlayer() {
    editingPlayerIndex = null;
    renderPlayers();
}

function finishEditingPlayer(index, newName, originalName) {
    if (!newName) {
        cancelEditingPlayer();
        return;
    }

    if (newName === originalName) {
        cancelEditingPlayer();
        return;
    }

    if (players.some((p, idx) => idx !== index && p.name === newName)) {
        window.alert("同じ名前のプレイヤーが既に存在します。");
        return;
    }

    renameSelections(originalName, newName);
    players[index].name = newName;
    editingPlayerIndex = null;
    renderPlayers();
}

function autoAddDayIfNeeded(dayLabel, value) {
    if (!value) {
        return;
    }

    const index = days.indexOf(dayLabel);
    if (index === -1) {
        return;
    }

    if (index === days.length - 1) {
        addNextDay();
    }
}

function addNextDay() {
    const label = `${nextDayIndex}日目`;
    days.push(label);
    nextDayIndex += 1;
    renderCOTable();
}

function supportsMarker(label) {
    return label !== "吊り" && label !== "噛み";
}

function supportsAssignment(label) {
    return label !== "吊り" && label !== "噛み";
}

function shouldDisableCell(role, dayLabel) {
    if (!supportsAssignment(role.label)) {
        return false;
    }

    const assigned = roleAssignments[role.id];
    if (!assigned) {
        return false;
    }

    return isAfterDeath(assigned, dayLabel);
}

function isAfterDeath(playerName, dayLabel) {
    const record = deathRecords[playerName];
    if (!record) {
        return false;
    }

    const dayIndex = days.indexOf(dayLabel);
    if (dayIndex === -1) {
        return false;
    }

    return dayIndex >= record.dayIndex;
}

function handleSelectionChange(role, dayLabel, value) {
    const key = getKey(role.id, dayLabel);
    const previous = coSelections[key];
    if (value) {
        coSelections[key] = value;
    } else {
        delete coSelections[key];
    }

    autoAddDayIfNeeded(dayLabel, value);

    if (role.label === "吊り") {
        syncMediumCells(dayLabel, value);
    }

    if (role.label === "吊り" || role.label === "噛み") {
        const changed = updateDeathRecord(previous, value, dayLabel);
        if (changed) {
            renderCOTable();
        }
    }

    updateCellStyles(role, dayLabel, value);
}

function syncMediumCells(dayLabel, value) {
    const dayIndex = days.indexOf(dayLabel);
    if (dayIndex === -1) {
        return;
    }

    const targetDay = days[dayIndex + 1];
    if (!targetDay) {
        return;
    }

    updateMediumCellsForDay(targetDay, value);
}

function updateMediumCellsForDay(targetDay, value) {
    let updated = false;

    roleRows.forEach((role) => {
        if (role.label !== "霊能者") {
            return;
        }

        const key = getKey(role.id, targetDay);
        if (value) {
            if (coSelections[key] !== value) {
                coSelections[key] = value;
                updated = true;
            }
        } else if (coSelections[key]) {
            delete coSelections[key];
            updated = true;
        }
    });

    if (updated) {
        renderCOTable();
    }
}

function syncNewMediumRow(newRole) {
    const lynchRoleId = findRoleIdByLabel("吊り");
    if (!lynchRoleId) {
        return;
    }

    days.forEach((day, index) => {
        const prevDay = days[index - 1];
        if (!prevDay) {
            return;
        }

        const sourceKey = getKey(lynchRoleId, prevDay);
        const value = coSelections[sourceKey];
        if (!value) {
            return;
        }

        const targetKey = getKey(newRole.id, day);
        coSelections[targetKey] = value;
    });

    renderCOTable();
}

function getRoleNameSizeClass(label) {
    if (!label) {
        return "";
    }

    if (label.length >= 8) {
        return "role-name-small";
    }

    if (label.length >= 6) {
        return "role-name-medium";
    }

    return "";
}

function findRoleIdByLabel(label) {
    const role = roleRows.find((item) => item.label === label);
    return role ? role.id : null;
}

function updateDeathRecord(previous, next, dayLabel) {
    let changed = false;
    const dayIndex = days.indexOf(dayLabel);

    if (previous) {
        const existing = deathRecords[previous];
        if (existing && (dayIndex === -1 || existing.dayIndex === dayIndex)) {
            delete deathRecords[previous];
            changed = true;
        }
    }

    if (next) {
        if (dayIndex === -1) {
            return changed;
        }

        const current = deathRecords[next];
        if (!current || current.dayIndex !== dayIndex) {
            deathRecords[next] = { dayIndex };
            changed = true;
        }
    }

    return changed;
}

function supportsRoleMenu(label) {
    return label !== "吊り" && label !== "噛み";
}

function updateCellStyles(role, dayLabel, value) {
    const selector = `[data-role="${role.id}"][data-day="${dayLabel}"]`;
    const cell = coTableEl.querySelector(selector);
    if (!cell) {
        return;
    }

    if (value) {
        cell.classList.remove("disabled-cell");
    } else if (shouldDisableCell(role, dayLabel)) {
        cell.classList.add("disabled-cell");
    } else {
        cell.classList.remove("disabled-cell");
    }
}

function renderVotingTabs() {
    const availableDays = getVotingDays();
    if (!activeVotingDay || !availableDays.includes(activeVotingDay)) {
        activeVotingDay = availableDays[0] || null;
    }

    votingTabsEl.innerHTML = "";

    availableDays.forEach((day) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "voting-tab";
        if (day === activeVotingDay) {
            button.classList.add("active");
        }
        button.textContent = day;
        button.addEventListener("click", () => {
            activeVotingDay = day;
            renderVotingTabs();
        });
        votingTabsEl.appendChild(button);
    });

    renderVotingContent();
}

function renderVotingContent() {
    votingContentEl.innerHTML = "";

    if (!activeVotingDay) {
        votingContentEl.textContent = "表示できる日がありません。";
        return;
    }

    if (players.length === 0) {
        const empty = document.createElement("p");
        empty.className = "voting-empty";
        empty.textContent = "プレイヤーが登録されると投票管理が表示されます。";
        votingContentEl.appendChild(empty);
        return;
    }

    const container = document.createElement("div");
    container.className = "voting-layout";

    const visualWrapper = document.createElement("div");
    visualWrapper.className = "voting-visual";

    const rows = document.createElement("div");
    rows.className = "voting-rows";
    rows.appendChild(createVotingColumnHeader());

    const dayVotes = votingData[activeVotingDay] || {};

    players.forEach((player) => {
        const row = document.createElement("div");
        row.className = "voting-row";

        row.appendChild(createVotingItem(player.name, "voter", dayVotes));

        const connector = document.createElement("div");
        connector.className = "vote-connector";
        row.appendChild(connector);

        row.appendChild(createVotingItem(player.name, "target", dayVotes));

        rows.appendChild(row);
    });

    visualWrapper.appendChild(rows);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("voting-lines");
    visualWrapper.appendChild(svg);

    container.appendChild(visualWrapper);
    container.appendChild(renderVotingSummary(dayVotes));

    votingContentEl.appendChild(container);

    setupVotingInteractions(visualWrapper, dayVotes);
    drawVotingLines(visualWrapper, svg, dayVotes);
}

function createVotingColumnHeader() {
    const header = document.createElement("div");
    header.className = "voting-row voting-header";

    const voterTitle = document.createElement("div");
    voterTitle.className = "voting-column-title voter-title";
    voterTitle.textContent = "投票者";

    const spacer = document.createElement("div");
    spacer.className = "vote-connector";

    const targetTitle = document.createElement("div");
    targetTitle.className = "voting-column-title target-title";
    targetTitle.textContent = "投票先";

    header.appendChild(voterTitle);
    header.appendChild(spacer);
    header.appendChild(targetTitle);
    return header;
}

function setupVotingInteractions(wrapper, dayVotes) {
    const dots = wrapper.querySelectorAll(".vote-dot");
    dots.forEach((dot) => {
        dot.addEventListener("mouseenter", () => {
            dot.classList.add("hover");
        });
        dot.addEventListener("mouseleave", () => {
            dot.classList.remove("hover");
        });
    });
}

function drawVotingLines(wrapper, svg, dayVotes) {
    const rect = wrapper.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = "";

    Object.entries(dayVotes).forEach(([voter, target], index) => {
        const start = getDotCenter(wrapper, voter, "voter");
        const end = getDotCenter(wrapper, target, "target");

        if (!start || !end) {
            return;
        }

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", start.x);
        line.setAttribute("y1", start.y);
        line.setAttribute("x2", end.x);
        line.setAttribute("y2", end.y);
        line.classList.add("vote-connection");
        line.dataset.order = `${index}`;
        svg.appendChild(line);
    });
}

function getDotCenter(wrapper, playerName, side) {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(playerName) : playerName.replace(/"/g, '\\"');
    const selector = `.vote-dot[data-side="${side}"][data-player="${escaped}"]`;
    const dot = wrapper.querySelector(selector);
    if (!dot) {
        return null;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const dotRect = dot.getBoundingClientRect();
    return {
        x: dotRect.left - wrapperRect.left + dotRect.width / 2,
        y: dotRect.top - wrapperRect.top + dotRect.height / 2,
    };
}

function createVotingItem(name, side, dayVotes) {
    const item = document.createElement("div");
    item.className = "voting-item";
    if (side === "voter") {
        item.classList.add("voting-item-left");
    }

    const dot = document.createElement("span");
    dot.className = "vote-dot";
    dot.dataset.player = name;
    dot.dataset.side = side;

    if (side === "voter") {
        if (pendingVoter === name) {
            dot.classList.add("pending");
        }

        if (dayVotes[name]) {
            item.classList.add("has-vote");
        }

        dot.addEventListener("click", () => handleVoterClick(name));
    } else {
        const targeted = Object.values(dayVotes).includes(name);
        if (targeted) {
            item.classList.add("targeted");
        }

        dot.addEventListener("click", () => handleTargetClick(name));
    }

    const label = document.createElement("span");
    label.className = "vote-name";
    label.textContent = name;

    item.appendChild(dot);
    item.appendChild(label);
    return item;
}

function handleVoterClick(name) {
    if (pendingVoter === name) {
        pendingVoter = null;
    } else {
        pendingVoter = name;
    }

    renderVotingContent();
}

function handleTargetClick(targetName) {
    if (!pendingVoter) {
        const removed = applyVotingChange(() => removeVoteByTarget(targetName));
        if (removed) {
            renderVotingContent();
        }
        return;
    }

    const changed = applyVotingChange(() => {
        if (!activeVotingDay) {
            return false;
        }

        if (!votingData[activeVotingDay]) {
            votingData[activeVotingDay] = {};
        }

        const dayVotes = votingData[activeVotingDay];
        if (dayVotes[pendingVoter] === targetName) {
            delete dayVotes[pendingVoter];
        } else {
            dayVotes[pendingVoter] = targetName;
        }
        return true;
    });

    if (changed) {
        pendingVoter = null;
        renderVotingContent();
    }
}

function removeVoteByTarget(targetName) {
    if (!activeVotingDay) {
        return false;
    }

    const dayVotes = votingData[activeVotingDay];
    if (!dayVotes) {
        return false;
    }

    let removed = false;
    Object.keys(dayVotes).forEach((voter) => {
        if (dayVotes[voter] === targetName) {
            delete dayVotes[voter];
            removed = true;
        }
    });

    return removed;
}

function cloneVotingData() {
    return JSON.parse(JSON.stringify(votingData));
}

function applyVotingChange(mutator) {
    const snapshot = cloneVotingData();
    const changed = mutator();
    if (!changed) {
        return false;
    }

    votingHistory.push(snapshot);
    if (votingHistory.length > 100) {
        votingHistory.shift();
    }
    votingFuture = [];
    updateVotingControls();
    return true;
}

function undoVotingChange() {
    if (votingHistory.length === 0) {
        return;
    }

    votingFuture.push(cloneVotingData());
    votingData = votingHistory.pop();
    pendingVoter = null;
    renderVotingTabs();
    updateVotingControls();
}

function redoVotingChange() {
    if (votingFuture.length === 0) {
        return;
    }

    votingHistory.push(cloneVotingData());
    votingData = votingFuture.pop();
    pendingVoter = null;
    renderVotingTabs();
    updateVotingControls();
}

function updateVotingControls() {
    if (!undoVoteBtn || !redoVoteBtn) {
        return;
    }

    undoVoteBtn.disabled = votingHistory.length === 0;
    redoVoteBtn.disabled = votingFuture.length === 0;
}

function renderVotingSummary(dayVotes) {
    const summary = document.createElement("div");
    summary.className = "voting-summary";

    const title = document.createElement("h3");
    title.textContent = "投票一覧";
    summary.appendChild(title);

    const table = document.createElement("table");
    table.className = "voting-summary-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["投票者", "投票先", "投票数"].forEach((text) => {
        const th = document.createElement("th");
        th.textContent = text;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    const tbody = document.createElement("tbody");
    const entries = Object.entries(dayVotes);
    if (entries.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 3;
        cell.textContent = "投票がまだありません。";
        row.appendChild(cell);
        tbody.appendChild(row);
    } else {
        const targetCounts = computeTargetCounts(entries);

        entries.forEach(([voter, target]) => {
            const row = document.createElement("tr");
            const voterCell = document.createElement("td");
            voterCell.textContent = voter;
            const targetCell = document.createElement("td");
            targetCell.textContent = target;
            const countCell = document.createElement("td");
            const count = targetCounts[target];
            if (count && count > 1) {
                const order = getVoteOrder(entries, target, voter);
                countCell.textContent = `${order}票目 / ${count}票`;
            } else {
                countCell.textContent = count ? "1票目" : "-";
            }

            row.appendChild(voterCell);
            row.appendChild(targetCell);
            row.appendChild(countCell);
            tbody.appendChild(row);
        });
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    summary.appendChild(table);
    return summary;
}

function computeTargetCounts(entries) {
    const counts = {};
    entries.forEach(([, target]) => {
        counts[target] = (counts[target] || 0) + 1;
    });
    return counts;
}

function getVoteOrder(entries, target, voter) {
    let order = 0;
    for (const [currentVoter, currentTarget] of entries) {
        if (currentTarget === target) {
            order += 1;
        }
        if (currentVoter === voter) {
            return order;
        }
    }
    return order;
}

function getVotingDays() {
    return days.filter((day) => {
        const num = parseInt(day, 10);
        if (Number.isNaN(num)) {
            return true;
        }
        return num > 0;
    });
}

function updateMarkerAppearance(button, color) {
    button.dataset.color = color;
    button.setAttribute("aria-label", color === "black" ? "黒丸" : "白丸");
}

function addRoleRow(index) {
    const source = roleRows[index];
    const newRole = { id: `role-${nextRoleId}`, label: source.label };
    nextRoleId += 1;
    roleRows.splice(index + 1, 0, newRole);
    renderCOTable();
    if (source.label === "霊能者") {
        syncNewMediumRow(newRole);
    }
}

function removeRoleRow(index) {
    if (roleRows.length === 1) {
        window.alert("これ以上削除できません。");
        return;
    }

    const target = roleRows[index];
    roleRows.splice(index, 1);
    removeSelectionsForRole(target.id);
    renderCOTable();
}

addRoleBtn.addEventListener("click", () => {
    const name = window.prompt("追加する役職名を入力してください");
    if (name === null) {
        return;
    }

    const label = name.trim();
    if (!label) {
        return;
    }

    const exists = roleRows.some((role) => role.label === label);
    if (exists) {
        window.alert("同じ名前の役職が既に存在します。");
        return;
    }

    const newRole = { id: `role-${nextRoleId}`, label };
    nextRoleId += 1;
    roleRows.push(newRole);
    renderCOTable();
});

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const current = getActiveTheme();
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        storeTheme(next);
    });
}

initializeHelpModalContent();
updateVotingControls();
renderPlayers();
initializeThemePreference();

function getActiveTheme() {
    return document.documentElement.dataset.theme || "light";
}

function initializeThemePreference() {
    const stored = getStoredTheme();
    if (stored) {
        applyTheme(stored);
        return;
    }

    const prefersDark =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
}

function applyTheme(theme) {
    const normalized = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = normalized;
    if (themeToggleBtn) {
        const isDark = normalized === "dark";
        themeToggleBtn.setAttribute("aria-pressed", isDark ? "true" : "false");
        themeToggleBtn.setAttribute(
            "aria-label",
            isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"
        );
    }
}

function storeTheme(theme) {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // ignore storage failures
    }
}

function getStoredTheme() {
    try {
        return window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
        return null;
    }
}



function exportMatchSummary({ resultText, rolesText }) {
    const exportedAt = formatExportTimestamp(new Date());
    const data = buildSummaryData({ resultText, rolesText, exportedAt });
    const pages = renderSummaryPages(data);
    const pdfContent = assemblePdfFromImages(pages);
    triggerPdfDownload(pdfContent);
}

function buildSummaryData({ resultText, rolesText, exportedAt }) {
    const memoText = (memoTextarea?.value || "").trim();

    const coHeaders = ["役職", ...days];
    const coRows = roleRows.map((role) => {
        const assignment = supportsAssignment(role.label) && roleAssignments[role.id]
            ? roleAssignments[role.id]
            : "";
        const rows = days.map((day) => {
            const value = coSelections[getKey(role.id, day)] || "-";
            const marker = getMarkerSymbol(role.id, day, value);
            if (!marker) {
                return value;
            }

            if (!value || value === "-") {
                return marker;
            }

            return `${value} ${marker}`;
        });
        const label = assignment ? `${role.label}\n${assignment}` : role.label;
        return [label, ...rows];
    });

    const voteDays = getVotingDays().map((day) => {
        const entries = Object.entries(votingData[day] || {});
        if (entries.length === 0) {
            return { day, rows: [] };
        }
        const counts = computeTargetCounts(entries);
        const rows = entries.map(([voter, target]) => {
            const count = counts[target] || 1;
            const orderText = count > 1 ? `${getVoteOrder(entries, target, voter)}票目 / ${count}票` : "1票目";
            return [voter, target, orderText];
        });
        return { day, rows };
    });

    return {
        coTable: { headers: coHeaders, rows: coRows },
        votes: voteDays,
        memoText: memoText || "メモは記録されていません。",
        resultText: (resultText || "").trim() || "未入力",
        rolesText: (rolesText || "").trim() || "未入力",
        exportedAt: exportedAt || formatExportTimestamp(new Date())
    };
}

function getMarkerSymbol(roleId, day, value) {
    const key = `${roleId}-${day}`;
    const marker = markerSelections[key];
    if (marker === "black") {
        return "●";
    }

    if (marker === "white") {
        return "○";
    }

    if (value && value !== "-") {
        return "○";
    }

    return "";
}

function triggerPdfDownload(pdfContent) {
    const blob = pdfContent instanceof Blob ? pdfContent : new Blob([pdfContent], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `jinro-summary-${timestamp}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function renderSummaryPages(data) {
    const canvasWidth = 1240;
    const canvasHeight = 1754;
    const marginX = 80;
    const marginTop = 80;
    const marginBottom = 80;
    const contentWidth = canvasWidth - marginX * 2;
    const fonts = {
        reportTitle: '600 48px "Noto Sans JP", "Yu Gothic", sans-serif',
        sectionTitle: '600 34px "Noto Sans JP", "Yu Gothic", sans-serif',
        subheading: '600 28px "Noto Sans JP", "Yu Gothic", sans-serif',
        tableHeader: '600 24px "Noto Sans JP", "Yu Gothic", sans-serif',
        tableCell: '400 22px "Noto Sans JP", "Yu Gothic", sans-serif',
        paragraph: '400 24px "Noto Sans JP", "Yu Gothic", sans-serif',
        memo: '400 26px "Noto Sans JP", "Yu Gothic", sans-serif',
        caption: '400 22px "Noto Sans JP", "Yu Gothic", sans-serif'
    };
    const lineHeights = {
        tableHeader: 30,
        tableCell: 30,
        paragraph: 34,
        memo: 36
    };
    const cellPadding = 12;
    const pages = [];

    let { canvas, ctx } = createSummaryCanvas(canvasWidth, canvasHeight);
    let currentY = marginTop;

    const availableHeight = () => canvasHeight - marginBottom - currentY;
    const commitPage = () => {
        pages.push(convertCanvasToPage(canvas));
        ({ canvas, ctx } = createSummaryCanvas(canvasWidth, canvasHeight));
        currentY = marginTop;
    };

    const ensureSpace = (height) => {
        if (height <= availableHeight()) {
            return;
        }
        commitPage();
    };

    const drawReportHeader = () => {
        ensureSpace(80);
        ctx.font = fonts.reportTitle;
        ctx.fillStyle = "#0f172a";
        const titleBase = data.exportedAt ? `試合まとめ: ${data.exportedAt}` : "試合まとめ";
        const resultLabel = data.resultText ? `（結果: ${data.resultText}）` : "";
        ctx.fillText(`${titleBase} ${resultLabel}`.trim(), marginX, currentY);
        currentY += 64;
        ctx.fillStyle = "#1f2937";
    };

    const drawSectionTitle = (text) => {
        ensureSpace(60);
        ctx.font = fonts.sectionTitle;
        ctx.fillStyle = "#0f172a";
        ctx.fillText(text, marginX, currentY);
        currentY += 46;
        drawDivider();
    };

    const drawDivider = () => {
        ctx.strokeStyle = "#cbd5f5";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(marginX, currentY);
        ctx.lineTo(canvasWidth - marginX, currentY);
        ctx.stroke();
        currentY += 12;
        ctx.fillStyle = "#1f2937";
    };

    const wrapLines = (text, width, font, lineHeightValue) => {
        ctx.save();
        ctx.font = font;
        const chars = Array.from(text || "");
        const lines = [];
        let current = "";
        chars.forEach((char) => {
            const test = current + char;
            if (ctx.measureText(test).width <= width) {
                current = test;
            } else if (current) {
                lines.push(current);
                current = char;
            } else {
                lines.push(char);
                current = "";
            }
        });
        if (current) {
            lines.push(current);
        }
        ctx.restore();
        if (lines.length === 0) {
            lines.push("");
        }
        return {
            lines,
            height: lines.length * lineHeightValue
        };
    };

    const wrapWithLineBreaks = (text, width, font, lineHeightValue) => {
        const segments = (text ?? "").split(/\r?\n/);
        const collected = [];
        segments.forEach((segment, index) => {
            const layout = wrapLines(segment, width, font, lineHeightValue);
            collected.push(...layout.lines);
            if (index !== segments.length - 1) {
                collected.push("");
            }
        });
        if (collected.length === 0) {
            collected.push("");
        }
        return {
            lines: collected,
            height: collected.length * lineHeightValue
        };
    };

    const drawTable = (table) => {
        if (!table.rows.length) {
            drawParagraph("データがありません。");
            return;
        }

        const columnWidths = computeColumnWidths(table.headers.length, contentWidth);
        const headerLayout = table.headers.map((text, index) =>
            wrapLines(text, columnWidths[index] - cellPadding * 2, fonts.tableHeader, lineHeights.tableHeader)
        );
        const headerHeight = getRowHeight(headerLayout, lineHeights.tableHeader, cellPadding);

        const drawHeaderRow = () => {
            ensureSpace(headerHeight);
            drawRow(table.headers, headerLayout, columnWidths, {
                font: fonts.tableHeader,
                lineHeight: lineHeights.tableHeader,
                fill: "#f1f5f9",
                bold: true
            });
        };

        drawHeaderRow();

        table.rows.forEach((row) => {
            const layouts = row.map((text, index) =>
                wrapLines(text || "", columnWidths[index] - cellPadding * 2, fonts.tableCell, lineHeights.tableCell)
            );
            const rowHeight = getRowHeight(layouts, lineHeights.tableCell, cellPadding);
            if (rowHeight > availableHeight()) {
                commitPage();
                drawHeaderRow();
            }
            ensureSpace(rowHeight);
            drawRow(row, layouts, columnWidths, {
                font: fonts.tableCell,
                lineHeight: lineHeights.tableCell
            });
        });

        currentY += 24;
    };

    const drawRow = (cells, layouts, widths, options) => {
        const rowHeight = getRowHeight(layouts, options.lineHeight, cellPadding);
        let x = marginX;
        ctx.strokeStyle = "#cbd5f5";
        ctx.lineWidth = 1;
        ctx.font = options.font;
        ctx.fillStyle = "#0f172a";
        cells.forEach((cell, index) => {
            const width = widths[index];
            ctx.fillStyle = options.fill || "#ffffff";
            ctx.fillRect(x, currentY, width, rowHeight);
            ctx.strokeRect(x, currentY, width, rowHeight);
            ctx.fillStyle = "#0f172a";
            ctx.font = options.font;
            const lines = layouts[index].lines;
            let textY = currentY + cellPadding;
            lines.forEach((line) => {
                ctx.fillText(line, x + cellPadding, textY);
                textY += options.lineHeight;
            });
            x += width;
        });
        currentY += rowHeight;
    };

    const drawParagraph = (text, indent = 0) => {
        const maxWidth = contentWidth - indent;
        const layout = wrapLines(text, maxWidth, fonts.paragraph, lineHeights.paragraph);
        const blockHeight = layout.height;
        ensureSpace(blockHeight);
        ctx.font = fonts.paragraph;
        ctx.fillStyle = "#1f2937";
        let textY = currentY;
        layout.lines.forEach((line) => {
            ctx.fillText(line, marginX + indent, textY);
            textY += lineHeights.paragraph;
        });
        currentY += blockHeight + 20;
    };

    const drawMemoBlock = (text) => {
        const layout = wrapWithLineBreaks(text, contentWidth - cellPadding * 2, fonts.memo, lineHeights.memo);
        const boxHeight = layout.height + cellPadding * 2;
        ensureSpace(boxHeight);
        ctx.fillStyle = "#eef2ff";
        ctx.fillRect(marginX, currentY, contentWidth, boxHeight);
        ctx.fillStyle = "#0f172a";
        ctx.font = fonts.memo;
        let textY = currentY + cellPadding;
        layout.lines.forEach((line) => {
            ctx.fillText(line, marginX + cellPadding, textY);
            textY += lineHeights.memo;
        });
        currentY += boxHeight + 24;
    };

    const drawVoteSections = (votes) => {
        if (!votes.length) {
            drawParagraph("投票情報がありません。");
            return;
        }

        votes.forEach((entry) => {
            ensureSpace(50);
            ctx.font = fonts.subheading;
            ctx.fillStyle = "#0f172a";
            ctx.fillText(entry.day, marginX, currentY);
            currentY += 38;
            if (entry.rows.length === 0) {
                drawParagraph("投票なし", 20);
                return;
            }
            const table = {
                headers: ["投票者", "投票先", "票順"],
                rows: entry.rows
            };
            drawTable(table);
        });
    };

    const drawResultSection = (result, roles) => {
        const blocks = [
            { label: "試合結果", value: result },
            { label: "正解の配役", value: roles }
        ];
        blocks.forEach((block) => {
            const layout = wrapWithLineBreaks(block.value, contentWidth - cellPadding * 2, fonts.paragraph, lineHeights.paragraph);
            const boxHeight = layout.height + cellPadding * 2 + 34;
            ensureSpace(boxHeight);
            ctx.fillStyle = "#f8fafc";
            ctx.fillRect(marginX, currentY, contentWidth, boxHeight);
            ctx.strokeStyle = "#cbd5f5";
            ctx.strokeRect(marginX, currentY, contentWidth, boxHeight);
            ctx.fillStyle = "#0f172a";
            ctx.font = fonts.subheading;
            ctx.fillText(block.label, marginX + cellPadding, currentY + cellPadding);
            ctx.font = fonts.paragraph;
            let textY = currentY + cellPadding + 30;
            layout.lines.forEach((line) => {
                ctx.fillText(line, marginX + cellPadding, textY);
                textY += lineHeights.paragraph;
            });
            currentY += boxHeight + 20;
        });
    };

    drawReportHeader();
    drawSectionTitle("CO表");
    drawTable(data.coTable);
    drawSectionTitle("メモ");
    drawMemoBlock(data.memoText);
    drawSectionTitle("投票状況");
    drawVoteSections(data.votes);
    drawSectionTitle("配役 / 試合結果");
    drawResultSection(data.resultText, data.rolesText);

    pages.push(convertCanvasToPage(canvas));
    return pages;
}

function formatExportTimestamp(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }
    const pad = (value) => String(value).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return `${year}-${month}-${day}`;
}

function computeColumnWidths(count, totalWidth) {
    if (count <= 0) {
        return [];
    }
    if (count === 1) {
        return [totalWidth];
    }
    const first = Math.min(260, totalWidth * 0.3);
    const remaining = Math.max(totalWidth - first, 200);
    const others = (remaining) / (count - 1);
    const widths = [];
    for (let i = 0; i < count; i += 1) {
        widths.push(i === 0 ? first : others);
    }
    return widths;
}

function getRowHeight(layouts, lineHeight, padding) {
    if (!layouts.length) {
        return lineHeight + padding * 2;
    }
    const heights = layouts.map((layout) => layout.height + padding * 2);
    return Math.max(...heights);
}

function createSummaryCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("2D コンテキストを初期化できません");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#0f172a";
    ctx.font = '400 24px "Noto Sans JP", "Yu Gothic", sans-serif';
    ctx.textBaseline = "top";

    return { canvas, ctx };
}

function convertCanvasToPage(canvas) {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    return {
        width: canvas.width,
        height: canvas.height,
        data: dataUrlToUint8Array(dataUrl)
    };
}

function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function assemblePdfFromImages(pages) {
    const encoder = new TextEncoder();
    const pdfChunks = [];
    let position = 0;
    const pushChunk = (chunk) => {
        pdfChunks.push(chunk);
        position += chunk.length;
    };

    const header = encoder.encode("%PDF-1.4\n");
    pushChunk(header);
    const xrefEntries = ["0000000000 65535 f \n"];

    const pageCount = pages.length || 1;
    const totalObjects = 2 + pageCount * 3;
    const pageObjectIds = [];
    const contentObjectIds = [];
    const imageObjectIds = [];

    let nextId = 3;
    for (let i = 0; i < pageCount; i += 1) {
        pageObjectIds.push(nextId);
        contentObjectIds.push(nextId + 1);
        imageObjectIds.push(nextId + 2);
        nextId += 3;
    }

    const objectMap = new Map();
    objectMap.set(1, [`<< /Type /Catalog /Pages 2 0 R >>`]);
    const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
    objectMap.set(2, [`<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`]);

    pages.forEach((page, index) => {
        const pageId = pageObjectIds[index];
        const contentId = contentObjectIds[index];
        const imageId = imageObjectIds[index];
        const imageName = `/Im${index}`;

        objectMap.set(
            pageId,
            [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << ${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`]
        );

        const contentStream = `q 595 0 0 842 0 0 cm ${imageName} Do Q`;
        objectMap.set(
            contentId,
            [`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`]
        );

        objectMap.set(
            imageId,
            [
                `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.data.length} >>\nstream\n`,
                page.data,
                "\nendstream"
            ]
        );
    });

    for (let i = 1; i <= totalObjects; i += 1) {
        const parts = objectMap.get(i) || [""];
        const offsetEntry = `${position.toString().padStart(10, "0")} 00000 n \n`;
        xrefEntries.push(offsetEntry);
        pushChunk(encoder.encode(`${i} 0 obj\n`));
        parts.forEach((part) => {
            if (typeof part === "string") {
                pushChunk(encoder.encode(part));
            } else {
                pushChunk(part);
            }
        });
        pushChunk(encoder.encode("\nendobj\n"));
    }

    const xrefStart = position;
    pushChunk(encoder.encode(`xref\n0 ${totalObjects + 1}\n`));
    xrefEntries.forEach((entry) => {
        pushChunk(encoder.encode(entry));
    });
    pushChunk(encoder.encode(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`));

    const totalLength = pdfChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    pdfChunks.forEach((chunk) => {
        merged.set(chunk, offset);
        offset += chunk.length;
    });

    return merged;
}
