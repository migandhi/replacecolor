// --- DOM Elements ---
const imageLoader = document.getElementById('imageLoader');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const placeholderText = document.getElementById('placeholder-text');
const colorPreview = document.getElementById('color-preview');
const previewSwatch = document.getElementById('preview-swatch');
const previewHex = document.getElementById('preview-hex');
const previewRgb = document.getElementById('preview-rgb');

// Selected Color UI (Color to Replace)
const selectedColorSwatch = document.getElementById('selected-color-swatch');
const selectedHex = document.getElementById('selected-hex');
const selectedRgb = document.getElementById('selected-rgb');

// New Color UI (Picker & Manual)
const colorPicker = document.getElementById('colorPicker');
const hexInput = document.getElementById('hexInput');
const rInput = document.getElementById('rInput');
const gInput = document.getElementById('gInput');
const bInput = document.getElementById('bInput');

// New Color UI (From Image)
const paletteImageLoader = document.getElementById('paletteImageLoader');
const paletteCanvas = document.getElementById('paletteCanvas');
const paletteCtx = paletteCanvas.getContext('2d');
const palettePlaceholder = document.getElementById('palettePlaceholder');
const paletteSelectionSwatch = document.getElementById('palette-selection-swatch');
const paletteSelectionHex = document.getElementById('palette-selection-hex');
const paletteSelectionRgb = document.getElementById('palette-selection-rgb');

// Tabs
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

// Actions
const replaceBtn = document.getElementById('replaceBtn');
const undoBtn = document.getElementById('undoBtn');
const downloadBtn = document.getElementById('downloadBtn');
const toleranceSlider = document.getElementById('toleranceSlider');
const toleranceValue = document.getElementById('toleranceValue');

// --- State ---
let isImageLoaded = false;
let history = [];
let selectedColor = null;

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
                ctx.drawImage(img, 0, 0);
                placeholderText.style.display = 'none';
                history = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
                selectedColor = null;
                isImageLoaded = true;
                updateSelectedColorUI();
                updateButtonStates();
            } else {
                paletteCanvas.width = img.width;
                paletteCanvas.height = img.height;
                paletteCtx.drawImage(img, 0, 0);
                palettePlaceholder.style.display = 'none';
                resetPaletteSelectionUI(); // Reset display when new palette is loaded
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
}

// --- Tab Switching ---
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(button.dataset.tab).classList.add('active');
    });
});

// --- Color Selection & Replacement ---
canvas.addEventListener('click', e => {
    if (isImageLoaded) {
        const { r, g, b } = getColorAtCursor(e, canvas, ctx);
        selectedColor = { r, g, b };
        updateSelectedColorUI();
        updateButtonStates();
    }
});

paletteCanvas.addEventListener('click', e => {
    if (paletteCanvas.width > 0) {
        const { r, g, b } = getColorAtCursor(e, paletteCanvas, paletteCtx);
        const hex = rgbToHex(r, g, b);
        syncColorInputs(hex, 'hex'); // Sync all inputs with the new color
    }
});

replaceBtn.addEventListener('click', () => {
    if (!selectedColor) return;
    replaceColor(selectedColor);
});

function replaceColor(colorToReplace) { /* ... same as previous ... */ }

// --- Live Color Preview ---
canvas.addEventListener('mousemove', e => { /* ... same as previous ... */ });
canvas.addEventListener('mouseout', () => { colorPreview.style.display = 'none'; });
function updatePreviewTooltip(e, r, g, b) { /* ... same as previous ... */ }

// --- UI Updates & Event Listeners ---
function updateSelectedColorUI() { /* ... same as previous ... */ }
function updateButtonStates() { /* ... same as previous ... */ }

function resetPaletteSelectionUI() {
    paletteSelectionSwatch.style.backgroundColor = '#f0f0f0';
    paletteSelectionHex.textContent = 'HEX: --';
    paletteSelectionRgb.textContent = 'RGB: --, --, --';
}

toleranceSlider.addEventListener('input', () => { toleranceValue.textContent = `${toleranceSlider.value}%`; });
undoBtn.addEventListener('click', () => { /* ... same as previous ... */ });
downloadBtn.addEventListener('click', () => { /* ... same as previous ... */ });

// --- Color Input Sync (The Core of the New Feature) ---
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
        if (isNaN(r) || isNaN(g) || isNaN(b) || r>255 || g>255 || b>255) return;
        hex = rgbToHex(r, g, b);
    }

    // Update ALL "new color" displays to be consistent
    if (source !== 'picker') colorPicker.value = hex;
    if (source !== 'hex') hexInput.value = hex;
    if (source !== 'rgb') {
        rInput.value = r;
        gInput.value = g;
        bInput.value = b;
    }

    // Update the new palette selection display
    paletteSelectionSwatch.style.backgroundColor = hex;
    paletteSelectionHex.textContent = `HEX: ${hex}`;
    paletteSelectionRgb.textContent = `RGB: ${r}, ${g}, ${b}`;
}

// --- Utility Functions ---
function getColorAtCursor(e, targetCanvas, targetCtx) { /* ... same as previous ... */ }
function hexToRgb(hex) { /* ... same as previous ... */ }
function rgbToHex(r, g, b) { /* ... same as previous ... */ }

// --- PASTE UNCHANGED FUNCTIONS HERE ---
function replaceColor(colorToReplace) {
    const newColor = hexToRgb(colorPicker.value);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const tolerance = toleranceSlider.value * 2.55;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const colorDistance = Math.sqrt(Math.pow(r - colorToReplace.r, 2) + Math.pow(g - colorToReplace.g, 2) + Math.pow(b - colorToReplace.b, 2));
        if (colorDistance <= tolerance) {
            data[i] = newColor.r;
            data[i + 1] = newColor.g;
            data[i + 2] = newColor.b;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    history.push(imageData);
    updateButtonStates();
}
function updatePreviewTooltip(e, r, g, b) {
    const hex = rgbToHex(r, g, b);
    previewSwatch.style.backgroundColor = hex;
    previewHex.textContent = hex;
    previewRgb.textContent = `RGB(${r}, ${g}, ${b})`;
    colorPreview.style.left = `${e.pageX + 15}px`;
    colorPreview.style.top = `${e.pageY + 15}px`;
    colorPreview.style.display = 'flex';
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
function updateButtonStates() {
    replaceBtn.disabled = !selectedColor;
    downloadBtn.disabled = history.length <= 1;
    undoBtn.disabled = history.length <= 1;
}
undoBtn.addEventListener('click', () => {
    if (history.length > 1) {
        history.pop();
        ctx.putImageData(history[history.length - 1], 0, 0);
        updateButtonStates();
    }
});
downloadBtn.addEventListener('click', () => {
    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'edited-image.png';
    link.href = image;
    link.click();
});
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

// Initialize
syncColorInputs(colorPicker.value, 'picker');
resetPaletteSelectionUI();