import { Canvas, FabricImage, Rect, Textbox } from "./fabric.min.mjs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
// OCR uses a downscaled analysis copy only; exported pixels remain at original size.
const OCR_MAX_PIXELS = 2_500_000;

const $ = (id) => document.getElementById(id);
const el = {
  stage: $("stage"), canvasShell: $("canvasShell"), dropCard: $("dropCard"), fileInput: $("fileInput"),
  importTop: $("importButtonTop"), importMain: $("importButtonMain"), addText: $("addTextButton"),
  addTextSide: $("addTextButtonSide"), exportButton: $("exportButton"), deleteButton: $("deleteButton"),
  layerList: $("layerList"), layerCount: $("layerCount"), dimension: $("dimensionLabel"), zoom: $("zoomLabel"),
  recognize: $("recognizeButton"), progressCard: $("progressCard"), progressTitle: $("progressTitle"),
  progressText: $("progressText"), progressBar: $("progressBar"), cancelOcr: $("cancelOcrButton"),
  emptyInspector: $("emptyInspector"), textInspector: $("textInspector"), maskInspector: $("maskInspector"),
  inspectorTitle: $("inspectorTitle"), confidence: $("confidenceBadge"), content: $("textContent"),
  fontFamily: $("fontFamily"), fontSize: $("fontSize"), textColor: $("textColor"), regionActions: $("regionActions"),
  regionHelper: $("regionHelper"), replace: $("replaceTextButton"), maskOnly: $("maskOnlyButton"),
  maskColor: $("maskColor"), maskOpacity: $("maskOpacity"), maskOpacityValue: $("maskOpacityValue"), toast: $("toast"),
};

let canvas = new Canvas("editorCanvas", {
  width: 10, height: 10, preserveObjectStacking: true, enableRetinaScaling: false,
  selection: true, renderOnAddRemove: false,
});
let nextLayerId = 1;
let imageState = null;
let selected = null;
let worker = null;
let workerLanguage = "";
let ocrCancelled = false;
let toastTimer = null;

function assignLayer(object, type, extra = {}) {
  object.layerId = `layer-${nextLayerId++}`;
  object.editorType = type;
  Object.assign(object, extra);
  return object;
}

function toast(message, kind = "") {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.className = `toast ${kind}`;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 4200);
}

function isEditingField(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function humanOcrStatus(status) {
  const words = String(status || "").toLowerCase();
  if (words.includes("language")) return "正在加载中文和英文识别数据…";
  if (words.includes("core")) return "正在加载本地 OCR 引擎…";
  if (words.includes("initialize")) return "正在初始化识别器…";
  if (words.includes("recogn")) return "正在分析文字位置…";
  return "正在准备识别…";
}

function setProgress(title, text, fraction = 0) {
  el.progressTitle.textContent = title;
  el.progressText.textContent = text;
  el.progressBar.style.width = `${Math.max(3, Math.min(100, Math.round(fraction * 100)))}%`;
}

function setBusy(busy) {
  el.progressCard.hidden = !busy;
  el.importTop.disabled = busy;
  el.recognize.disabled = busy;
  el.addText.disabled = busy || !imageState;
  el.addTextSide.disabled = busy || !imageState;
  el.exportButton.disabled = busy || !imageState;
}

function canvasObjects() { return canvas.getObjects(); }
function backgroundObject() { return canvasObjects().find((object) => object.editorType === "background"); }
function editableObjects() { return canvasObjects().filter((object) => object.editorType !== "background"); }

function fitCanvas() {
  if (!imageState || !canvas) return;
  const area = el.stage.getBoundingClientRect();
  const padding = 36;
  const width = Math.max(120, area.width - padding * 2);
  const height = Math.max(120, area.height - padding * 2);
  const scale = Math.min(width / imageState.width, height / imageState.height, 1);
  const cssWidth = Math.max(1, Math.round(imageState.width * scale));
  const cssHeight = Math.max(1, Math.round(imageState.height * scale));
  canvas.setDimensions({ width: cssWidth, height: cssHeight }, { cssOnly: true });
  el.canvasShell.style.width = `${cssWidth}px`;
  el.canvasShell.style.height = `${cssHeight}px`;
  el.zoom.textContent = `${Math.round(scale * 100)}%`;
  canvas.calcOffset();
}

function setSelected(object) {
  selected = object || null;
  if (object && object.editorType !== "background" && canvas.getActiveObject() !== object) canvas.setActiveObject(object);
  else if (!object || object.editorType === "background") canvas.discardActiveObject();
  canvas.requestRenderAll();
  renderLayers();
  renderInspector();
  el.deleteButton.disabled = !selected || selected.editorType === "background";
}

function layerDetails(object) {
  if (object.editorType === "background") return { label: "原始图片", sublabel: "只读背景", icon: "locked" };
  if (object.editorType === "region") return { label: object.originalText || "未命名文字", sublabel: `OCR 区域 · ${Math.round(object.confidence || 0)}%`, icon: "region" };
  if (object.editorType === "mask") return { label: "遮盖层", sublabel: "可删除以恢复原图", icon: "mask" };
  return { label: object.text || "空文字", sublabel: object.replacement ? "替换文字" : "新增文字", icon: "text" };
}

function symbolFor(type) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const paths = {
    locked: "M5 10h14v10H5zM8 10V7a4 4 0 0 1 8 0v3",
    region: "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9h8M8 12h8M8 15h5",
    mask: "M5 5h14v14H5zM5 19 19 5",
    text: "M5 5h14M12 5v14M8 19h8",
  };
  path.setAttribute("d", paths[type] || paths.text);
  svg.append(path);
  return svg;
}

function renderLayers() {
  const objects = canvasObjects().slice().reverse();
  el.layerList.replaceChildren();
  el.layerCount.textContent = String(objects.length);
  if (!objects.length) {
    const placeholder = document.createElement("div");
    placeholder.className = "layer-placeholder";
    placeholder.textContent = "导入图片后显示图层";
    el.layerList.append(placeholder);
    return;
  }
  objects.forEach((object) => {
    const detail = layerDetails(object);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `layer-item ${selected === object ? "selected" : ""}`;
    button.title = detail.label;
    const thumb = document.createElement("span");
    thumb.className = `layer-thumb ${detail.icon}`;
    thumb.append(symbolFor(detail.icon));
    const copy = document.createElement("span");
    copy.className = "layer-copy";
    const strong = document.createElement("strong");
    strong.textContent = detail.label;
    const small = document.createElement("small");
    small.textContent = detail.sublabel;
    copy.append(strong, small);
    button.append(thumb, copy);
    if (object.editorType === "background") {
      const lock = symbolFor("locked");
      lock.classList.add("layer-lock");
      button.append(lock);
    }
    button.addEventListener("click", () => setSelected(object));
    el.layerList.append(button);
  });
}

function safeHex(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function renderInspector() {
  const type = selected?.editorType;
  el.emptyInspector.hidden = Boolean(type && type !== "background");
  el.textInspector.hidden = !(type === "region" || type === "text");
  el.maskInspector.hidden = type !== "mask";
  el.confidence.hidden = type !== "region";
  el.regionActions.hidden = type !== "region";
  el.regionHelper.hidden = type !== "region";
  if (!selected || type === "background") {
    el.inspectorTitle.textContent = "文字样式";
    return;
  }
  if (type === "region") {
    el.inspectorTitle.textContent = "识别到的文字";
    el.confidence.textContent = `${Math.round(selected.confidence || 0)}%`;
    el.content.value = selected.originalText || "";
    const inferred = inferredTextStyle(selected.regionBox || { height: 32, width: 32, x: 0, y: 0 });
    el.fontSize.value = String(inferred.fontSize);
    el.textColor.value = inferred.colors.foreground;
    el.fontFamily.value = "Microsoft YaHei";
  } else if (type === "text") {
    el.inspectorTitle.textContent = selected.replacement ? "替换文字" : "新增文字";
    el.content.value = selected.text || "";
    el.fontSize.value = String(Math.round(selected.fontSize || 32));
    el.textColor.value = safeHex(selected.fill, "#172033");
    el.fontFamily.value = selected.fontFamily || "Microsoft YaHei";
  } else if (type === "mask") {
    el.inspectorTitle.textContent = "遮盖层";
    el.maskColor.value = safeHex(selected.fill, "#ffffff");
    const percent = Math.round((selected.opacity ?? 1) * 100);
    el.maskOpacity.value = String(percent);
    el.maskOpacityValue.textContent = `${percent}%`;
  }
}

function sampleColors(box) {
  const fallback = { background: "#ffffff", foreground: "#172033" };
  if (!imageState?.image || !box) return fallback;
  const padding = Math.max(3, Math.round(Math.min(box.width, box.height) * 0.15));
  const sx = Math.max(0, Math.floor(box.x - padding));
  const sy = Math.max(0, Math.floor(box.y - padding));
  const sw = Math.min(imageState.width - sx, Math.ceil(box.width + padding * 2));
  const sh = Math.min(imageState.height - sy, Math.ceil(box.height + padding * 2));
  if (sw < 2 || sh < 2) return fallback;
  const probe = document.createElement("canvas");
  probe.width = 72; probe.height = 72;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(imageState.image, sx, sy, sw, sh, 0, 0, probe.width, probe.height);
  const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let y = 0; y < 72; y++) for (let x = 0; x < 72; x++) {
    if (x < 7 || y < 7 || x > 64 || y > 64) {
      const i = (y * 72 + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
    }
  }
  const bg = { r: r / count, g: g / count, b: b / count };
  let fr = 0, fg = 0, fb = 0, foregroundCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b);
    if (distance > 78) { fr += data[i]; fg += data[i + 1]; fb += data[i + 2]; foregroundCount++; }
  }
  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  const background = `#${toHex(bg.r)}${toHex(bg.g)}${toHex(bg.b)}`;
  if (!foregroundCount) {
    const luminance = bg.r * 0.2126 + bg.g * 0.7152 + bg.b * 0.0722;
    return { background, foreground: luminance > 150 ? "#172033" : "#ffffff", coverage: 0 };
  }
  return { background, foreground: `#${toHex(fr / foregroundCount)}${toHex(fg / foregroundCount)}${toHex(fb / foregroundCount)}`, coverage: foregroundCount / (probe.width * probe.height) };
}

function inferredTextStyle(box) {
  const colors = sampleColors(box);
  return { colors, fontSize: Math.max(8, Math.round(box.height * 0.92)), fontWeight: colors.coverage > 0.2 ? "700" : "400" };
}

function createMask(box, color) {
  const pad = Math.max(1, Math.round(Math.min(box.width, box.height) * 0.04));
  const mask = assignLayer(new Rect({
    left: Math.max(0, box.x - pad), top: Math.max(0, box.y - pad),
    width: Math.min(imageState.width, box.width + pad * 2), height: Math.min(imageState.height, box.height + pad * 2),
    fill: color, opacity: 1, strokeWidth: 0, originX: "left", originY: "top",
    transparentCorners: false, cornerColor: "#2856d8", borderColor: "#2856d8",
  }), "mask");
  canvas.insertAt(1, mask);
  return mask;
}

function replaceRegion(region, onlyMask = false) {
  if (!region || region.editorType !== "region") return;
  const box = region.regionBox;
  const inferred = inferredTextStyle(box);
  const { colors } = inferred;
  const mask = createMask(box, colors.background);
  if (!onlyMask) {
    const content = el.content.value.trim() || region.originalText || "文字";
    const fontSize = Math.max(6, Math.min(400, Number(el.fontSize.value) || inferred.fontSize));
    const text = assignLayer(new Textbox(content, {
      left: box.x, top: Math.max(0, box.y - Math.round(fontSize * 0.08)), width: Math.max(20, box.width), originX: "left", originY: "top",
      fontFamily: el.fontFamily.value || "Microsoft YaHei", fontSize, fontWeight: inferred.fontWeight,
      fill: safeHex(el.textColor.value, colors.foreground), lineHeight: 1.05,
      editable: true, transparentCorners: false, cornerColor: "#2856d8", borderColor: "#2856d8",
    }), "text", { replacement: true, linkedMaskId: mask.layerId });
    canvas.add(text);
    canvas.remove(region);
    setSelected(text);
  } else {
    canvas.remove(region);
    setSelected(mask);
  }
  canvas.requestRenderAll();
  toast(onlyMask ? "已创建可删除的遮盖层。" : "已创建遮盖层和替换文字层。", "success");
}

function addText(options = {}) {
  if (!imageState) return;
  const content = String(options.text || "双击编辑文字").slice(0, 1000);
  const left = Number.isFinite(options.x) ? Math.max(0, Math.min(imageState.width - 20, options.x)) : Math.round(imageState.width * 0.35);
  const top = Number.isFinite(options.y) ? Math.max(0, Math.min(imageState.height - 20, options.y)) : Math.round(imageState.height * 0.42);
  const text = assignLayer(new Textbox(content, {
    left, top, width: Math.max(120, Math.round(imageState.width * 0.3)),
    originX: "left", originY: "top", fontFamily: options.fontFamily || "Microsoft YaHei", fontSize: Math.max(6, Math.min(400, options.fontSize || Math.max(22, Math.round(imageState.height * 0.05)))),
    fill: safeHex(options.color, "#172033"), lineHeight: 1.05, editable: true, transparentCorners: false, cornerColor: "#2856d8", borderColor: "#2856d8",
  }), "text", { replacement: false });
  canvas.add(text);
  setSelected(text);
  toast("已新增文字图层。", "success");
  return text;
}

function updateTextFromInspector() {
  if (!selected || selected.editorType !== "text") return;
  selected.set({
    text: el.content.value, fontFamily: el.fontFamily.value || "Microsoft YaHei",
    fontSize: Math.max(6, Math.min(400, Number(el.fontSize.value) || 32)),
    fill: safeHex(el.textColor.value, "#172033"),
  });
  canvas.requestRenderAll();
  renderLayers();
}

function updateMaskFromInspector() {
  if (!selected || selected.editorType !== "mask") return;
  const opacity = Math.max(0, Math.min(1, Number(el.maskOpacity.value) / 100));
  selected.set({ fill: safeHex(el.maskColor.value, "#ffffff"), opacity });
  el.maskOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
  canvas.requestRenderAll();
}

function removeSelected() {
  if (!selected || selected.editorType === "background") return;
  if (selected.editorType === "region") {
    replaceRegion(selected, true);
    return;
  }
  canvas.remove(selected);
  selected = null;
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  renderLayers(); renderInspector();
  el.deleteButton.disabled = true;
  toast("图层已删除。", "success");
}

async function exportImage() {
  if (!imageState) return;
  const regions = canvasObjects().filter((object) => object.editorType === "region");
  const previous = canvas.getActiveObject();
  regions.forEach((object) => { object.visible = false; });
  canvas.discardActiveObject(); canvas.requestRenderAll();
  try {
    const exportCanvas = canvas.toCanvasElement(1, { left: 0, top: 0, width: imageState.width, height: imageState.height });
    const blob = await new Promise((resolve) => exportCanvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("浏览器无法生成图片。");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${imageState.baseName || "layertext"}-edited.png`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`已导出 ${imageState.width} × ${imageState.height} PNG。`, "success");
  } catch (error) {
    toast(`导出失败：${error.message || "请重试"}`, "error");
  } finally {
    regions.forEach((object) => { object.visible = true; });
    if (previous) canvas.setActiveObject(previous);
    canvas.requestRenderAll();
  }
}

function makeOcrSource() {
  const scale = Math.min(1, Math.sqrt(OCR_MAX_PIXELS / (imageState.width * imageState.height)));
  const source = document.createElement("canvas");
  source.width = Math.max(1, Math.round(imageState.width * scale));
  source.height = Math.max(1, Math.round(imageState.height * scale));
  source.getContext("2d").drawImage(imageState.image, 0, 0, source.width, source.height);
  return { source, xScale: imageState.width / source.width, yScale: imageState.height / source.height };
}

function addOcrRegions(blocks, xScale, yScale) {
  let count = 0;
  (blocks || []).forEach((block) => (block.paragraphs || []).forEach((paragraph) => (paragraph.lines || []).forEach((line) => {
    const text = String(line.text || "").trim();
    const bbox = line.bbox;
    if (!text || !bbox) return;
    const box = {
      x: Math.max(0, bbox.x0 * xScale), y: Math.max(0, bbox.y0 * yScale),
      width: Math.max(4, (bbox.x1 - bbox.x0) * xScale), height: Math.max(4, (bbox.y1 - bbox.y0) * yScale),
    };
    const region = assignLayer(new Rect({
      left: box.x, top: box.y, width: box.width, height: box.height, originX: "left", originY: "top",
      fill: "rgba(40,86,216,0.08)", stroke: "#2856d8", strokeWidth: 1.5, strokeUniform: true,
      selectable: true, evented: true, hasControls: false, hasBorders: false,
      lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true,
      hoverCursor: "pointer", transparentCorners: false,
    }), "region", { originalText: text, confidence: line.confidence || 0, regionBox: box });
    canvas.add(region); count++;
  })));
  return count;
}

async function stopWorker() {
  const active = worker;
  worker = null;
  workerLanguage = "";
  if (active) {
    try { await active.terminate(); } catch { /* already stopped */ }
  }
}

async function getOcrWorker() {
  const language = "chi_sim+eng";
  if (worker && workerLanguage === language) return worker;
  await stopWorker();
  const root = new URL(".", window.location.href);
  worker = await window.Tesseract.createWorker(language, window.Tesseract.OEM.LSTM_ONLY, {
    workerPath: new URL("worker.min.js", root).href,
    corePath: new URL("./", root).href,
    langPath: new URL("./", root).href,
    logger: ({ status, progress }) => setProgress("正在识别文字", humanOcrStatus(status), progress || 0.1),
    errorHandler: () => {},
  });
  await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.SPARSE_TEXT });
  workerLanguage = language;
  return worker;
}

async function runOcr() {
  if (!imageState) return;
  ocrCancelled = false;
  editableObjects().forEach((object) => canvas.remove(object));
  selected = null;
  setBusy(true); setProgress("正在识别文字", "正在加载本地 OCR 引擎…", 0.04);
  try {
    if (!window.Tesseract?.createWorker) throw new Error("OCR 引擎未能加载。");
    await getOcrWorker();
    if (ocrCancelled) return;
    const { source, xScale, yScale } = makeOcrSource();
    setProgress("正在识别文字", "正在分析文字位置…", 0.2);
    const result = await worker.recognize(source, {}, { blocks: true });
    if (ocrCancelled) return;
    const found = addOcrRegions(result.data?.blocks, xScale, yScale);
    canvas.requestRenderAll(); renderLayers(); renderInspector();
    toast(found ? `识别到 ${found} 个可编辑文字区域。` : "没有识别到文字；你仍可手动新增文字。", found ? "success" : "");
  } catch (error) {
    if (!ocrCancelled) toast(`OCR 识别失败：${error.message || "请重新识别"}`, "error");
  } finally {
    setBusy(false);
    renderLayers();
  }
}

async function loadImageFile(file) {
  if (!file) return;
  const accepted = ["image/png", "image/jpeg", "image/webp"];
  if (!accepted.includes(file.type)) return toast("仅支持 PNG、JPEG 或 WebP 图片。", "error");
  if (file.size > MAX_FILE_BYTES) return toast("图片超过 20 MB 限制。", "error");
  // Keep the worker warm so repeated recognition does not reload local language data.
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("无法读取这张图片。")); image.src = objectUrl; });
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height) throw new Error("图片没有有效尺寸。");
    if (width * height > MAX_PIXELS) throw new Error("图片超过 25 MP 安全限制。请先压缩或裁剪。 ");
    canvas.clear(); nextLayerId = 1;
    imageState = { image, width, height, baseName: file.name.replace(/\.[^.]+$/, "") || "layertext" };
    const background = assignLayer(new FabricImage(image, {
      left: 0, top: 0, originX: "left", originY: "top", selectable: false, evented: false,
      lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true,
      hasControls: false, hasBorders: false, hoverCursor: "default",
    }), "background");
    canvas.setDimensions({ width, height });
    canvas.add(background); canvas.sendObjectToBack(background); canvas.requestRenderAll();
    el.dropCard.hidden = true; el.canvasShell.hidden = false; el.recognize.hidden = false;
    el.dimension.textContent = `${width} × ${height} px`;
    setBusy(false); fitCanvas(); renderLayers(); renderInspector();
    toast("图片已导入，开始识别文字…", "success");
    window.setTimeout(runOcr, 120);
  } catch (error) {
    toast(error.message || "导入失败。", "error");
  } finally {
    URL.revokeObjectURL(objectUrl);
    el.fileInput.value = "";
  }
}

function openPicker() { if (!el.importTop.disabled) el.fileInput.click(); }

el.importTop.addEventListener("click", openPicker);
el.importMain.addEventListener("click", openPicker);
el.fileInput.addEventListener("change", () => loadImageFile(el.fileInput.files?.[0]));
el.addText.addEventListener("click", addText);
el.addTextSide.addEventListener("click", addText);
el.exportButton.addEventListener("click", exportImage);
el.deleteButton.addEventListener("click", removeSelected);
el.recognize.addEventListener("click", runOcr);
el.cancelOcr.addEventListener("click", async () => { ocrCancelled = true; await stopWorker(); setBusy(false); toast("已取消 OCR 识别。", ""); });
el.replace.addEventListener("click", () => replaceRegion(selected, false));
el.maskOnly.addEventListener("click", () => replaceRegion(selected, true));
[el.content, el.fontFamily, el.fontSize, el.textColor].forEach((input) => input.addEventListener("input", updateTextFromInspector));
[el.maskColor, el.maskOpacity].forEach((input) => input.addEventListener("input", updateMaskFromInspector));

canvas.on("selection:created", ({ selected: items }) => setSelected(items?.[0] || null));
canvas.on("selection:updated", ({ selected: items }) => setSelected(items?.[0] || null));
canvas.on("selection:cleared", () => { selected = null; renderLayers(); renderInspector(); el.deleteButton.disabled = true; });
canvas.on("object:modified", () => { renderLayers(); renderInspector(); });
canvas.on("text:changed", () => { renderLayers(); renderInspector(); });

window.addEventListener("resize", () => window.requestAnimationFrame(fitCanvas));
window.addEventListener("keydown", (event) => {
  if (isEditingField(event.target)) return;
  if ((event.key === "Delete" || event.key === "Backspace") && selected) { event.preventDefault(); removeSelected(); }
});
["dragenter", "dragover"].forEach((eventName) => el.stage.addEventListener(eventName, (event) => { event.preventDefault(); el.stage.classList.add("dragging"); }));
["dragleave", "drop"].forEach((eventName) => el.stage.addEventListener(eventName, (event) => { event.preventDefault(); el.stage.classList.remove("dragging"); }));
el.stage.addEventListener("drop", (event) => loadImageFile(event.dataTransfer?.files?.[0]));

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = (tool) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
  register({
    name: "get_image_text_editor_status",
    title: "查看图片文字编辑状态",
    description: "读取当前画布的原图尺寸、图层数量和已识别文字区域数量；不修改内容。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute() {
      const regions = canvasObjects().filter((object) => object.editorType === "region").length;
      const textLayers = canvasObjects().filter((object) => object.editorType === "text").length;
      return { imageLoaded: Boolean(imageState), width: imageState?.width ?? null, height: imageState?.height ?? null, ocrRegions: regions, textLayers };
    },
  });
  register({
    name: "add_image_text_layer",
    title: "新增文字图层",
    description: "在已导入的图片上新增一个可编辑文字图层。",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", minLength: 1, maxLength: 1000 }, x: { type: "number", minimum: 0 }, y: { type: "number", minimum: 0 }, fontSize: { type: "number", minimum: 6, maximum: 400 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } },
      required: ["text"], additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      if (!imageState) throw new Error("请先在编辑器中导入图片。");
      if (!input || typeof input !== "object" || typeof input.text !== "string" || !input.text.trim()) throw new Error("text 必须是非空字符串。");
      const text = addText(input);
      return { layerId: text.layerId, text: text.text, x: Math.round(text.left), y: Math.round(text.top) };
    },
  });
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}

renderLayers(); renderInspector();
registerWebMcp();
