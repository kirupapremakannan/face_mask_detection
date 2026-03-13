/**
 * ============================================================
 *  FACE MASK DETECTION SYSTEM
 *  app.js — Main application logic
 *
 *  Uses Healer Alpha AI (OpenRouter) to analyze face mask status.
 *  ============================================================
 *
 *  HOW IT WORKS:
 *  1. User uploads an image (drag/drop, browse, or webcam capture)
 *  2. Image is converted to base64 and sent to Healer Alpha API
 *  3. Healer Alpha analyzes the image and returns JSON with:
 *     - result: "mask" | "no_mask" | "unclear" | "no_face"
 *     - confidence: 0–100
 *     - count_faces / count_masked
 *     - details: short description
 *     - recommendation: safety tip
 *  4. UI updates with result, stats, and scan history
 * ============================================================
 */

// ─── CONFIG ───────────────────────────────────────────────────
const API_URL   = "https://openrouter.ai/api/v1/chat/completions";
const API_MODEL = "openrouter/healer-alpha";

// ─── STATE ────────────────────────────────────────────────────
let currentImageData = null;   // { base64, type, name }
let webcamStream     = null;   // MediaStream when webcam is active
let scanHistory      = [];     // array of past results
let stats = { total: 0, mask: 0, noMask: 0, unclear: 0 };

// ─── DOM REFERENCES ───────────────────────────────────────────
const fileInput        = document.getElementById("fileInput");
const dropZone         = document.getElementById("dropZone");
const dropPlaceholder  = document.getElementById("dropPlaceholder");
const previewImg       = document.getElementById("previewImg");
const imgBadge         = document.getElementById("imgBadge");
const analyzeBtn       = document.getElementById("analyzeBtn");
const resultArea       = document.getElementById("resultArea");
const historyList      = document.getElementById("historyList");
const webcamVideo      = document.getElementById("webcamVideo");
const captureBtn       = document.getElementById("captureBtn");
const webcamIcon       = document.getElementById("webcamIcon");

// ─── FILE INPUT EVENTS ────────────────────────────────────────
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) loadImageFile(file);
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    loadImageFile(file);
  } else {
    showError("Please drop a valid image file.");
  }
});

webcamIcon.addEventListener("click", toggleWebcam);

// ─── LOAD IMAGE FROM FILE ─────────────────────────────────────
function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    const dataUrl = evt.target.result;
    const base64  = dataUrl.split(",")[1];
    currentImageData = { base64, type: file.type, name: file.name };
    showPreview(dataUrl, file.name);
  };
  reader.readAsDataURL(file);
}

// ─── SHOW PREVIEW ────────────────────────────────────────────
function showPreview(src, name) {
  previewImg.src = src;
  previewImg.style.display = "block";
  dropPlaceholder.style.display = "none";
  dropZone.classList.add("has-content");
  imgBadge.style.display = "block";
  imgBadge.textContent = name.length > 22 ? name.slice(0, 20) + "…" : name;
  analyzeBtn.disabled = false;
  webcamIcon.style.display = "none";
  showReadyState();
}

function showReadyState() {
  resultArea.innerHTML = `
    <div class="result-card waiting">
      <div class="result-badge badge-waiting">📷 Image Loaded</div>
      <p class="detail-text">Click <strong>Analyze Image</strong> to start AI-powered mask detection.</p>
    </div>`;
}

// ─── WEBCAM ──────────────────────────────────────────────────
function toggleWebcam() {
  if (webcamStream) {
    stopWebcam();
  } else {
    startWebcam();
  }
}

async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
    webcamVideo.srcObject = webcamStream;
    dropPlaceholder.style.display = "none";
    webcamVideo.style.display = "block";
    captureBtn.style.display = "inline-flex";
  } catch (err) {
    showError("Could not access webcam: " + err.message);
  }
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach((track) => track.stop());
    webcamStream = null;
  }
  webcamVideo.style.display = "none";
  captureBtn.style.display = "none";

  // Only show placeholder if there is no currently loaded image.
  // When capturing a frame, we want the preview to stay visible.
  if (!currentImageData) {
    dropPlaceholder.style.display = "flex";
  }
}

function captureWebcam() {
  if (!webcamStream) return;
  const canvas = document.createElement("canvas");
  canvas.width  = webcamVideo.videoWidth;
  canvas.height = webcamVideo.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(webcamVideo, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const base64  = dataUrl.split(",")[1];
  currentImageData = { base64, type: "image/jpeg", name: "webcam_capture.jpg" };
  showPreview(dataUrl, "webcam_capture.jpg");
  stopWebcam();
}

// ─── AI ANALYSIS ─────────────────────────────────────────────
async function analyzeImage() {
  if (!currentImageData) return;

  analyzeBtn.disabled = true;

  // Show loading spinner
  resultArea.innerHTML = `
    <div class="result-card waiting">
      <div class="spinner-wrap">
        <div class="spinner"></div>
        <div class="detail-text">Analyzing with Healer Alpha AI… Please wait.</div>
      </div>
    </div>`;

  const prompt = buildPrompt();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // NOTE: In production, never expose API keys in frontend code!
        // Use a backend server to proxy requests.
        // For local development and demo purposes only:
        "Authorization": "Bearer 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"
      },
      body: JSON.stringify({
  model: API_MODEL,
  max_tokens: 1500,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:${currentImageData.type};base64,${currentImageData.base64}`
          }
        },
        {
          type: "text",
          text: buildPrompt()
        }
      ]
    }
  ]
})
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.choices[0].message.content;

    const parsed = parseAIResponse(rawText);
    if (parsed) {
      renderResult(parsed);
    } else {
      showError("Could not parse AI response. Please try again.");
    }
  } catch (err) {
    console.error("API Error:", err);
    showError("API Error: " + err.message + "<br><small>Check your API key in app.js or index.html</small>");
  }

  analyzeBtn.disabled = false;
}

// ─── BUILD AI PROMPT ─────────────────────────────────────────
function buildPrompt() {
  return `You are an expert Face Mask Detection AI system. Analyze the provided image carefully.

Your task: Determine whether the person(s) in the image are wearing a face mask.

Return ONLY a valid JSON object with NO extra text, markdown, or code fences. Exactly this format:
{
  "result": "<mask|no_mask|unclear|no_face>",
  "confidence": <0-100>,
  "count_faces": <number>,
  "count_masked": <number>,
  "details": "<1-2 sentences describing what you observe>",
  "recommendation": "<1 sentence safety recommendation>"
}

Classification rules:
- "mask"    → Face mask clearly visible, properly covering nose AND mouth
- "no_mask" → Face clearly visible, no mask worn (or mask pulled down)
- "unclear" → Image is blurry/dark/partial, mask status cannot be determined
- "no_face" → No human face detected in the image

Confidence should reflect certainty (0=not sure at all, 100=absolutely certain).
If multiple faces, use the majority for result. Count all faces and masked ones separately.`;
}

// ─── PARSE AI RESPONSE ───────────────────────────────────────
function parseAIResponse(raw) {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    // Try to extract JSON block from the text
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    return null;
  }
}

// ─── RENDER RESULT ───────────────────────────────────────────
function renderResult(r) {
  const conf = Math.min(100, Math.max(0, Math.round(r.confidence || 0)));

  // Mappings
  const cardClass  = { mask: "mask", no_mask: "no-mask", unclear: "unclear", no_face: "unclear" };
  const badgeClass = { mask: "badge-mask", no_mask: "badge-nomask", unclear: "badge-unclear", no_face: "badge-unclear" };
  const fillClass  = { mask: "fill-green", no_mask: "fill-red", unclear: "fill-yellow", no_face: "fill-yellow" };
  const labelMap   = {
    mask:    "✅ Mask Detected",
    no_mask: "❌ No Mask",
    unclear: "⚠️ Unclear",
    no_face: "👤 No Face Found"
  };

  const label = labelMap[r.result] || "⚠️ Unknown";
  const cc    = cardClass[r.result]  || "unclear";
  const bc    = badgeClass[r.result] || "badge-unclear";
  const fc    = fillClass[r.result]  || "fill-yellow";

  const facesHtml = r.count_faces > 0
    ? `<div class="faces-info">👤 ${r.count_faces} face(s) detected &nbsp;|&nbsp; 😷 ${r.count_masked || 0} wearing mask</div>`
    : "";

  const recHtml = r.recommendation
    ? `<div class="recommendation">💡 ${r.recommendation}</div>`
    : "";

  resultArea.innerHTML = `
    <div class="result-card ${cc}">
      <div class="result-badge ${bc}">${label}</div>
      ${facesHtml}
      <div class="conf-wrap">
        <div class="conf-labels">
          <span>Confidence</span>
          <span>${conf}%</span>
        </div>
        <div class="conf-bar">
          <div class="conf-fill ${fc}" style="width: ${conf}%"></div>
        </div>
      </div>
      <p class="detail-text">${r.details || "No description available."}</p>
      ${recHtml}
    </div>`;

  // Update global stats
  stats.total++;
  if      (r.result === "mask")    stats.mask++;
  else if (r.result === "no_mask") stats.noMask++;
  else                              stats.unclear++;
  updateStatsUI();

  // Add to history
  addToHistory(r, label, conf);
}

// ─── SHOW ERROR ──────────────────────────────────────────────
function showError(msg) {
  resultArea.innerHTML = `
    <div class="result-card unclear">
      <div class="result-badge badge-unclear">❌ Error</div>
      <p class="detail-text">${msg}</p>
    </div>`;
}

// ─── UPDATE STATS ─────────────────────────────────────────────
function updateStatsUI() {
  document.getElementById("stat-total").textContent   = stats.total;
  document.getElementById("stat-mask").textContent    = stats.mask;
  document.getElementById("stat-nomask").textContent  = stats.noMask;
  document.getElementById("stat-unclear").textContent = stats.unclear;
}

// ─── HISTORY ─────────────────────────────────────────────────
function addToHistory(r, label, conf) {
  const badgeClass = {
    mask: "hb-mask", no_mask: "hb-nomask", unclear: "hb-unclear", no_face: "hb-unclear"
  };
  const iconMap = { mask: "✅", no_mask: "❌", unclear: "⚠️", no_face: "👤" };

  scanHistory.unshift({
    name: currentImageData?.name || "image.jpg",
    result: r.result,
    label,
    conf,
    badgeClass: badgeClass[r.result] || "hb-unclear",
    icon: iconMap[r.result] || "⚠️"
  });

  if (scanHistory.length > 10) scanHistory.pop();
  renderHistory();
}

function renderHistory() {
  if (!scanHistory.length) {
    historyList.innerHTML = `<p class="empty-state">No scans yet. Upload an image to begin.</p>`;
    return;
  }
  historyList.innerHTML = scanHistory.map((h) => `
    <div class="history-item">
      <span>${h.icon}</span>
      <span class="hi-name">${h.name}</span>
      <span class="hi-badge ${h.badgeClass}">${h.conf}%</span>
    </div>`).join("");
}

function clearHistory() {
  scanHistory = [];
  renderHistory();
}

// ─── CLEAR ALL ───────────────────────────────────────────────
function clearAll() {
  currentImageData = null;
  previewImg.src   = "";
  previewImg.style.display   = "none";
  dropPlaceholder.style.display = "";
  dropZone.classList.remove("has-content");
  imgBadge.style.display     = "none";
  analyzeBtn.disabled        = true;
  fileInput.value            = "";
  stopWebcam();
  webcamIcon.style.display = "flex";
  resultArea.innerHTML = `
    <div class="result-card waiting">
      <div class="result-badge badge-waiting">⏳ Awaiting Image</div>
      <p class="detail-text">Upload a photo or use your webcam to begin AI-powered mask detection.</p>
    </div>`;
}

// ─── DEMO MODE ───────────────────────────────────────────────
async function loadDemo() {
  analyzeBtn.disabled = true;

  // Create a placeholder canvas image for demo
  const canvas = document.createElement("canvas");
  canvas.width  = 400;
  canvas.height = 300;
  const ctx = canvas.getContext("2d");

  // Draw a simple face with a mask
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, 400, 300);

  // Face circle
  ctx.beginPath();
  ctx.arc(200, 130, 70, 0, Math.PI * 2);
  ctx.fillStyle = "#fde68a";
  ctx.fill();

  // Eyes
  ctx.beginPath();
  ctx.arc(175, 110, 10, 0, Math.PI * 2);
  ctx.arc(225, 110, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#1e293b";
  ctx.fill();

  // Mask
  ctx.beginPath();
  ctx.roundRect(145, 130, 110, 60, 10);
  ctx.fillStyle = "#3b82f6";
  ctx.fill();
  ctx.strokeStyle = "#93c5fd";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Mask lines
  ctx.beginPath();
  ctx.moveTo(155, 155);
  ctx.lineTo(245, 155);
  ctx.moveTo(155, 170);
  ctx.lineTo(245, 170);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Text
  ctx.font = "bold 16px Arial";
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.fillText("Demo: Person with Mask", 200, 240);
  ctx.font = "12px Arial";
  ctx.fillText("(Simulated — upload a real photo for actual detection)", 200, 265);

  const dataUrl = canvas.toDataURL("image/png");
  currentImageData = { base64: dataUrl.split(",")[1], type: "image/png", name: "demo_face_mask.png" };
  showPreview(dataUrl, "demo_face_mask.png");

  // Inject a mock result for demo (without calling the API)
  const demoResult = {
    result: "mask",
    confidence: 96,
    count_faces: 1,
    count_masked: 1,
    details: "Demo mode: One person detected wearing a blue surgical face mask properly covering nose and mouth. Mask appears well-fitted.",
    recommendation: "Excellent mask compliance! Ensure mask is replaced every 4–6 hours or when damp."
  };

  resultArea.innerHTML = `
    <div class="result-card waiting" style="margin-bottom:8px">
      <div class="result-badge badge-unclear">🎯 Demo Mode</div>
      <p class="detail-text">This is a simulated demo result. Upload a real photo for actual AI analysis.</p>
    </div>`;

  setTimeout(() => {
    renderResult(demoResult);
    analyzeBtn.disabled = false;
  }, 1200);
}

// ─── INIT ─────────────────────────────────────────────────────
(function init() {
  renderHistory();
  console.log("✅ Face Mask Detection System loaded.");
  console.log("📌 Remember to set your API key in index.html or app.js");
})();












