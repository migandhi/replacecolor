// --- DOM Elements ---
const imageLoader = document.getElementById('imageLoader');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const selectionCanvas = document.getElementById('selectionCanvas');
const selectionCtx = selectionCanvas.getContext('2d');
const maskCanvas = document.getElementById('maskCanvas');
const maskCtx = maskCanvas.getContext('2d');
const placeholderText = document.getElementById('placeholder-text');
const colorPreview = document.getElementById('color-preview');
const previewSwatch = document.getElementById('preview-swatch');
const previewHex = document.getElementById('preview-hex');
const previewRgb = document.getElementById('preview-rgb');
const selectedColorSwatch = document.getElementById('selected-color-swatch');
const selectedHex = document.getElementById('selected-hex');
const selectedRgb = document.getElementById('selected-rgb');
const colorPicker = document.getElementById('colorPicker');
const hexInput = document.getElementById('hexInput');
const rInput = document.getElementById('rInput');
const gInput = document.getElementById('gInput');
const bInput = document.getElementById('bInput');
const paletteImageLoader = document.getElementById('paletteImageLoader');
const paletteCanvas = document.getElementById('paletteCanvas');
const paletteCtx = paletteCanvas.getContext('2d');
const palettePlaceholder = document.getElementById('palettePlaceholder');
const paletteSelectionSwatch = document.getElementById('palette-selection-swatch');
const paletteSelectionHex = document.getElementById('palette-selection-hex');
const paletteSelectionRgb = document.getElementById('palette-selection-rgb');
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const replaceBtn = document.getElementById('replaceBtn');
const undoBtn = document.getElementById('undoBtn');
const downloadBtn = document.getElementById('downloadBtn');
const toleranceSlider = document.getElementById('toleranceSlider');
const toleranceValue = document.getElementById('toleranceValue');
const modeToggle = document.getElementById('mode-toggle');
const toolRadios = document.querySelectorAll('input[name="tool"]');
const clearSelectionBtn = document.getElementById('clear-selection-btn');
const downloadOverlay = document.getElementById('download-overlay');
const progressText = document.getElementById('progress-text');
const progressBarFill = document.getElementById('progress-bar-fill');
const closeOverlayBtn = document.getElementById('close-overlay-btn');

// --- STATE ---
let isImageLoaded = false;
let history = [];
let selectedColor = null;
let lastConfirmedColorToReplace = null;
let previewTimeout;
let isDrawing = false;
let currentTool = 'none';
let currentPath = [];

// --- Image Loading ---
imageLoader.addEventListener('change', e => loadImage(e, true));
paletteImageLoader.addEventListener('change', e => loadImage(e, false));

function loadImage(e, isMainImage) {
    const reader = new FileReader();
    reader.onload = event => {
        const img = new Image();
        img.onload = () => {
            if (isMainImage) {
                canvas.width = img.width;
                canvas.height = img.height;
                selectionCanvas.width = img.width;
                selectionCanvas.height = img.height;
                maskCanvas.width = img.width;
                maskCanvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                placeholderText.style.display = 'none';
                history = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
                clearAllSelections();
                selectedColor = null;
                lastConfirmedColorToReplace = null;
                isImageLoaded = true;
                updateSelectedColorUI();
                updateButtonStates();
            } else {
                paletteCanvas.width = img.width;
                paletteCanvas.height = img.height;
                paletteCtx.drawImage(img, 0, 0);
                palettePlaceholder.style.display = 'none';
                resetPaletteSelectionUI();
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
}

// --- Tool Selection & Drawing Logic ---
toolRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentTool = e.target.value;
        selectionCanvas.style.cursor = (currentTool === 'none') ? 'pointer' : 'crosshair';
    });
});
clearSelectionBtn.addEventListener('click', clearAllSelections);

function getCanvasPos(e) {
    const rect = selectionCanvas.getBoundingClientRect();
    const scaleX = selectionCanvas.width / rect.width;
    const scaleY = selectionCanvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

selectionCanvas.addEventListener('mousedown', (e) => {
    if (!isImageLoaded) return;
    isDrawing = true;
    const startPos = getCanvasPos(e);
    currentPath = [startPos];

    function onMouseMove(moveEvent) {
        if (!isDrawing) return;
        const currentPos = getCanvasPos(moveEvent);
        currentPath.push(currentPos);
        drawTemporarySelection();
    }

    function onMouseUp() {
        if (currentPath.length <= 1 && currentTool === 'none') {
            const { r, g, b } = getColorAtCursor(e, canvas, ctx);
            selectedColor = { r, g, b };
            updateSelectedColorUI();
        } else if (currentPath.length > 1) {
            commitCurrentPathToMask();
        }
        isDrawing = false;
        currentPath = [];
        drawSelectionBoundaries();
        updateButtonStates();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
});

function drawTemporarySelection() {
    drawSelectionBoundaries(); // Redraw persistent boundaries
    selectionCtx.strokeStyle = 'rgba(0, 123, 255, 0.7)'; // Use a different color for live drawing
    selectionCtx.lineWidth = 2;
    selectionCtx.setLineDash([]); // Solid line for temporary drawing

    if (currentTool === 'rect' && currentPath.length > 1) {
        const start = currentPath[0];
        const end = currentPath[currentPath.length - 1];
        selectionCtx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (currentTool === 'lasso' && currentPath.length > 1) {
        selectionCtx.beginPath();
        selectionCtx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length; i++) {
            selectionCtx.lineTo(currentPath[i].x, currentPath[i].y);
        }
        selectionCtx.stroke();
    }
}

function commitCurrentPathToMask() {
    maskCtx.fillStyle = 'white';
    maskCtx.beginPath();
    if (currentTool === 'rect' && currentPath.length > 1) {
        const start = currentPath[0];
        const end = currentPath[currentPath.length - 1];
        maskCtx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (currentTool === 'lasso' && currentPath.length > 1) {
        maskCtx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length; i++) {
            maskCtx.lineTo(currentPath[i].x, currentPath[i].y);
        }
        maskCtx.closePath();
    }
    maskCtx.fill();
}

function drawSelectionBoundaries() {
    selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
    if (maskCanvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 0) return; // Quick check if mask is empty
    
    // Create a temporary canvas to draw the boundary from the mask
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    
    // Draw the mask onto the temp canvas
    tempCtx.drawImage(maskCanvas, 0, 0);

    // Use globalCompositeOperation to "trace" the edge
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    tempCtx.lineWidth = 4;
    tempCtx.setLineDash([8, 8]);
    tempCtx.strokeRect(0, 0, canvas.width, canvas.height);

    // Draw the result back to the visible selection canvas
    selectionCtx.drawImage(tempCanvas, 0, 0);
}

function clearAllSelections() {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    drawSelectionBoundaries();
    updateButtonStates();
}

// --- Main Replacement Function ---
function replaceColor(colorToReplace, saveToHistory) {
    if (!isImageLoaded || !colorToReplace) return;
    const sourceImageData = history[history.length - 1];
    const newImageData = new ImageData(new Uint8ClampedArray(sourceImageData.data), sourceImageData.width, sourceImageData.height);
    const data = newImageData.data;
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    const hasSelection = maskData.some(a => a > 0);

    const newColorRgb = hexToRgb(colorPicker.value);
    const tolerance = toleranceSlider.value;
    const isAdvancedMode = modeToggle.checked;
    const newColorHsl = isAdvancedMode ? rgbToHsl(newColorRgb.r, newColorRgb.g, newColorRgb.b) : null;
    const targetLab = rgbToLab(colorToReplace.r, colorToReplace.g, colorToReplace.b);

    for (let i = 0; i < data.length; i += 4) {
        if (hasSelection && maskData[i + 3] === 0) {
            continue; // Skip pixel if there's a selection and this pixel isn't in it
        }

        const r = sourceImageData.data[i], g = sourceImageData.data[i + 1], b = sourceImageData.data[i + 2];
        const currentLab = rgbToLab(r, g, b);
        const deltaE = Math.sqrt(Math.pow(currentLab[0] - targetLab[0], 2) + Math.pow(currentLab[1] - targetLab[1], 2) + Math.pow(currentLab[2] - targetLab[2], 2));

        if (deltaE <= tolerance) {
            if (isAdvancedMode) {
                const originalHsl = rgbToHsl(r, g, b);
                const finalRgb = hslToRgb(newColorHsl[0], newColorHsl[1], originalHsl[2]);
                data[i] = finalRgb[0]; data[i + 1] = finalRgb[1]; data[i + 2] = finalRgb[2];
            } else {
                data[i] = newColorRgb.r; data[i + 1] = newColorRgb.g; data[i + 2] = newColorRgb.b;
            }
        }
    }
    ctx.putImageData(newImageData, 0, 0);
    if (saveToHistory) {
        history.push(newImageData);
        updateButtonStates();
    }
}

// --- All other functions remain the same ---
// (Paste of full, working functions below for completeness)
replaceBtn.addEventListener('click', () => {
    if (!selectedColor) return;
    lastConfirmedColorToReplace = selectedColor;
    replaceColor(lastConfirmedColorToReplace, true);
});
toleranceSlider.addEventListener('input', () => {
    toleranceValue.textContent = `${toleranceSlider.value}`;
    if (!lastConfirmedColorToReplace) return;
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => {
        replaceColor(lastConfirmedColorToReplace, false);
    }, 10);
});
undoBtn.addEventListener('click', () => {
    if (history.length > 1) {
        history.pop();
        lastConfirmedColorToReplace = null;
        ctx.putImageData(history[history.length - 1], 0, 0);
        clearAllSelections(); // Selections are tied to a specific history state
        updateButtonStates();
    }
});
downloadBtn.addEventListener('click', () => {
    progressText.innerHTML = 'Preparing your image...';
    progressBarFill.style.width = '0%';
    closeOverlayBtn.style.display = 'none';
    downloadOverlay.style.display = 'flex';
    setTimeout(() => {
        progressBarFill.style.width = '100%';
        const image = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'edited-image.png';
        link.href = image;
        setTimeout(() => {
            link.click();
            progressText.innerHTML = `✅ Download Started!<br><small>Please check your browser's 'Downloads' folder.</small>`;
            closeOverlayBtn.style.display = 'block';
        }, 1500);
    }, 100);
});
closeOverlayBtn.addEventListener('click', () => { downloadOverlay.style.display = 'none'; });
downloadOverlay.addEventListener('click', (e) => {
    if (e.target === downloadOverlay) { downloadOverlay.style.display = 'none'; }
});
paletteCanvas.addEventListener('click', e => {
    if (paletteCanvas.width > 0) {
        const { r, g, b } = getColorAtCursor(e, paletteCanvas, paletteCtx);
        const hex = rgbToHex(r, g, b);
        syncColorInputs(hex, 'hex');
    }
});
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(button.dataset.tab).classList.add('active');
    });
});
function updateButtonStates() {
    replaceBtn.disabled = !selectedColor || !isImageLoaded;
    downloadBtn.disabled = history.length <= 1;
    undoBtn.disabled = history.length <= 1;
    const hasSelection = maskCanvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] > 0 || maskCanvas.getContext('2d').getImageData(maskCanvas.width - 1, maskCanvas.height - 1, 1, 1).data[3] > 0;
    clearSelectionBtn.disabled = !hasSelection;
}
function updateSelectedColorUI() {
    if (selectedColor) {
        const hex = rgbToHex(selectedColor.r, selectedColor.g, selectedColor.b);
        selectedColorSwatch.style.backgroundColor = hex;
        selectedHex.textContent = `HEX: ${hex}`;
        selectedRgb.textContent = `RGB: ${selectedColor.r}, ${selectedColor.g}, ${selectedColor.b}`;
    } else {
        selectedColorSwatch.style.backgroundColor = '#f0f0f0';
        selectedHex.textContent = 'HEX: --';
        selectedRgb.textContent = 'RGB: --, --, --';
    }
}
function resetPaletteSelectionUI() {
    paletteSelectionSwatch.style.backgroundColor = '#f0f0f0';
    paletteSelectionHex.textContent = 'HEX: --';
    paletteSelectionRgb.textContent = 'RGB: --, --, --';
}
selectionCanvas.addEventListener('mousemove', (e) => {
    if (!isImageLoaded || isDrawing) return;
    const { r, g, b } = getColorAtCursor(e, canvas, ctx);
    updatePreviewTooltip(e, r, g, b);
});
selectionCanvas.addEventListener('mouseleave', () => { colorPreview.style.display = 'none'; });
function updatePreviewTooltip(e, r, g, b) {
    const hex = rgbToHex(r, g, b);
    previewSwatch.style.backgroundColor = hex;
    previewHex.textContent = hex;
    previewRgb.textContent = `RGB(${r}, ${g}, ${b})`;
    colorPreview.style.left = `${e.pageX + 15}px`;
    colorPreview.style.top = `${e.pageY + 15}px`;
    colorPreview.style.display = 'flex';
}
colorPicker.addEventListener('input', () => syncColorInputs(colorPicker.value, 'picker'));
hexInput.addEventListener('input', () => syncColorInputs(hexInput.value, 'hex'));
[rInput, gInput, bInput].forEach(input => input.addEventListener('input', () => syncColorInputs(null, 'rgb')));
function syncColorInputs(color, source) {
    let r, g, b, hex;
    if (source === 'picker' || source === 'hex') {
        hex = color;
        if (!/^#[0-9A-F]{6}$/i.test(hex)) return;
        ({ r, g, b } = hexToRgb(hex));
    } else if (source === 'rgb') {
        r = parseInt(rInput.value); g = parseInt(gInput.value); b = parseInt(bInput.value);
        if (isNaN(r) || isNaN(g) || isNaN(b) || r > 255 || g > 255 || b > 255 || r < 0 || g < 0 || b < 0) return;
        hex = rgbToHex(r, g, b);
    }
    if (source !== 'picker') colorPicker.value = hex;
    if (source !== 'hex') hexInput.value = hex;
    if (source !== 'rgb') { rInput.value = r; gInput.value = g; bInput.value = b; }
    paletteSelectionSwatch.style.backgroundColor = hex;
    paletteSelectionHex.textContent = `HEX: ${hex}`;
    paletteSelectionRgb.textContent = `RGB: ${r}, ${g}, ${b}`;
}
function getColorAtCursor(e, targetCanvas, targetCtx) {
    const rect = targetCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaleX = targetCanvas.width / rect.width;
    const scaleY = targetCanvas.height / rect.height;
    const pixel = targetCtx.getImageData(x * scaleX, y * scaleY, 1, 1).data;
    return { r: pixel[0], g: pixel[1], b: pixel[2] };
}
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
function rgbToLab(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    x = (x > 0.008856) ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
    y = (y > 0.008856) ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
    z = (z > 0.008856) ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
    return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)];
}
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max == min) { h = s = 0; } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s == 0) { r = g = b = l; } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// --- INITIALIZE ---
syncColorInputs(colorPicker.value, 'picker');
resetPaletteSelectionUI();
updateButtonStates();