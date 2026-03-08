const imageInput = document.getElementById("image-input");
const previewImage = document.getElementById("preview-image");
const ocrForm = document.getElementById("ocr-form");
const ocrStatus = document.getElementById("ocr-status");
const calendarForm = document.getElementById("calendar-form");
const calendarStatus = document.getElementById("calendar-status");
const eventLink = document.getElementById("event-link");

const titleField = document.getElementById("title");
const dueDateField = document.getElementById("due-date");
const amountField = document.getElementById("amount");
const notesField = document.getElementById("notes");

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) {
    previewImage.classList.add("hidden");
    previewImage.removeAttribute("src");
    return;
  }

  previewImage.src = URL.createObjectURL(file);
  previewImage.classList.remove("hidden");
});

ocrForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = imageInput.files?.[0];
  if (!file) {
    setStatus(ocrStatus, "画像を選択してください。", true);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  setStatus(ocrStatus, "DocumentAnalyzer を実行しています...");
  setStatus(calendarStatus, "");
  eventLink.classList.add("hidden");

  try {
    const response = await fetch("/api/ocr", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || "OCR failed");
    }

    applyPayment(payload.payment);
    setStatus(ocrStatus, "解析が完了しました。抽出結果をフォームに反映しています。");
  } catch (error) {
    setStatus(ocrStatus, error.message, true);
  }
});

calendarForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!dueDateField.value) {
    setStatus(calendarStatus, "支払期限を入力してください。", true);
    return;
  }

  const amountValue = amountField.value.trim();
  const payload = {
    title: titleField.value.trim(),
    due_date: dueDateField.value,
    amount: amountValue ? Number.parseInt(amountValue, 10) : null,
    notes: notesField.value,
  };

  setStatus(calendarStatus, "Google カレンダーに登録しています...");
  eventLink.classList.add("hidden");

  try {
    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || "Calendar creation failed");
    }

    setStatus(calendarStatus, "イベントを作成しました。");
    if (result.event_link) {
      eventLink.href = result.event_link;
      eventLink.classList.remove("hidden");
    }
  } catch (error) {
    setStatus(calendarStatus, error.message, true);
  }
});

function setStatus(target, message, isError = false) {
  target.textContent = message;
  target.classList.toggle("error", isError);
}

function applyPayment(payment) {
  titleField.value = payment?.title || "";
  dueDateField.value = payment?.due_date || "";
  amountField.value = payment?.amount ?? "";
  notesField.value = "";
}
