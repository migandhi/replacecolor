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
const pickColorInstruction = document.getElementById('pick-color-instruction');
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
const undoBtn = document.getElementById('undoBtn');
const downloadBtn = document.getElementById('downloadBtn');
const toleranceSlider = document.getElementById('toleranceSlider');
const toleranceValue = document.getElementById('toleranceValue');
const modeToggle = document.getElementById('mode-toggle');
const toolBtns = document.querySelectorAll('.tool-btn');
const clearSelectionBtn = document.getElementById('clear-selection-btn');
const undoSelectionBtn = document.getElementById('undo-selection-btn');
const clearSelectedColorBtn = document.getElementById('clear-selected-color-btn');
const resetNewColorBtn = document.getElementById('reset-new-color-btn');
const downloadOverlay = document.getElementById('download-overlay');
const progressText = document.getElementById('progress-text');
const progressBarFill = document.getElementById('progress-bar-fill');
const closeOverlayBtn = document.getElementById('close-overlay-btn');

// --- STATE ---
let isImageLoaded = false;
let history = [];
let selectedColor = null;
let previewTimeout;
let debounceTimeout;
let isInteracting = false;
let selections = [];
let currentTool = 'none';
let currentPath = [];
let animationFrameId;

const DEFAULT_NEW_COLOR = "#0099ff";

// --- Intelligent Undo System ---
function saveState() {
    if (!isImageLoaded) return;
    // Create a deep copy of selections to avoid reference issues
    const selectionsCopy = JSON.parse(JSON.stringify(selections));
    const currentState = {
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
        selections: selectionsCopy
    };
    history.push(currentState);
    updateButtonStates();
}

function restoreState(state) {
    if (!state) return;
    ctx.putImageData(state.imageData, 0, 0);
    selections = JSON.parse(JSON.stringify(state.selections));
    redrawMaskFromSelections();
    updateButtonStates();
}

// --- Image Loading ---
imageLoader.addEventListener('change', e => {
    loadImage(e, true);
});
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
                history = []; // Reset history
                isImageLoaded = true;
                saveState(); // Save the initial state
                clearAllSelections();
                clearSelectedColor();
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
    if (e.target.files[0]) {
        reader.readAsDataURL(e.target.files[0]);
    }
}

// --- Tool Selection & Drawing Logic ---
toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.id.replace('tool-', '');
        selectionCanvas.className = (currentTool === 'none') ? 'cursor-eyedropper' : 'cursor-crosshair';
    });
});

clearSelectionBtn.addEventListener('click', () => {
    clearAllSelections();
    saveState();
});

undoSelectionBtn.addEventListener('click', () => {
    if (selections.length > 0) {
        selections.pop();
        redrawMaskFromSelections();
        saveState();
    }
});
clearSelectedColorBtn.addEventListener('click', () => {
    clearSelectedColor();
    // Revert the canvas to its last saved state, removing any active preview.
    if (history.length > 0) {
        ctx.putImageData(history[history.length - 1].imageData, 0, 0);
    }
});
resetNewColorBtn.addEventListener('click', () => syncColorInputs(DEFAULT_NEW_COLOR, 'hex'));

function getCanvasPos(e) {
    const rect = selectionCanvas.getBoundingClientRect();
    const scaleX = selectionCanvas.width / rect.width;
    const scaleY = selectionCanvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

selectionCanvas.addEventListener('mousedown', (e) => {
    if (!isImageLoaded) return;
    const startPos = getCanvasPos(e);
    let hasMoved = false;
    isInteracting = true;
    currentPath = [startPos];

    const onMouseMove = (moveEvent) => {
        if (!isInteracting) return;
        if (!hasMoved && Math.hypot(moveEvent.clientX - e.clientX, moveEvent.clientY - e.clientY) > 5) {
            hasMoved = true;
        }
        if (hasMoved && currentTool !== 'none') {
            currentPath.push(getCanvasPos(moveEvent));
        }
    };

    const onMouseUp = (upEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (!hasMoved && currentTool === 'none') {
            const { r, g, b } = getColorAtCursor(upEvent, canvas, ctx);
            selectedColor = { r, g, b };
            updateSelectedColorUI();
            replaceColor();
        } else if (hasMoved && currentTool !== 'none') {
            commitCurrentPathToSelections();
            redrawMaskFromSelections();
            saveState();
        }
        
        isInteracting = false;
        currentPath = [];
        updateButtonStates();
    };
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
});

function commitCurrentPathToSelections() {
    if (currentPath.length < 2) return;
    if (currentTool === 'rect') {
        const start = currentPath[0];
        const end = currentPath[currentPath.length - 1];
        selections.push({
            type: 'rect',
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            w: Math.abs(start.x - end.x),
            h: Math.abs(start.y - end.y),
        });
    } else if (currentTool === 'lasso') {
        selections.push({ type: 'polygon', points: [...currentPath] });
    }
}

function redrawMaskFromSelections() {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    if (selections.length > 0) {
        maskCtx.fillStyle = 'white';
        selections.forEach(sel => {
            maskCtx.beginPath();
            if (sel.type === 'rect') {
                maskCtx.rect(sel.x, sel.y, sel.w, sel.h);
            } else if (sel.type === 'polygon') {
                maskCtx.moveTo(sel.points[0].x, sel.points[0].y);
                for (let i = 1; i < sel.points.length; i++) {
                    maskCtx.lineTo(sel.points[i].x, sel.points[i].y);
                }
                maskCtx.closePath();
            }
            maskCtx.fill();
        });
    }
    updateButtonStates();
}

function animateSelectionBoundaries() {
    let offset = 0;
    function march() {
        selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
        
        const hasSelections = selections.length > 0;
        if (hasSelections) {
            selectionCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            selectionCtx.lineWidth = 1;
            selectionCtx.setLineDash([4, 4]);
            selectionCtx.lineDashOffset = -offset;
            selectionCtx.beginPath();
            selections.forEach(sel => {
                if (sel.type === 'rect') {
                    selectionCtx.rect(sel.x, sel.y, sel.w, sel.h);
                } else if (sel.type === 'polygon') {
                    selectionCtx.moveTo(sel.points[0].x, sel.points[0].y);
                    for (let i = 1; i < sel.points.length; i++) {
                        selectionCtx.lineTo(sel.points[i].x, sel.points[i].y);
                    }
                    selectionCtx.closePath();
                }
            });
            selectionCtx.stroke();
            
            selectionCtx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
            selectionCtx.lineDashOffset = -offset + 4;
            selectionCtx.stroke();
        }
        
        if (isInteracting && currentPath.length > 1 && currentTool !== 'none') {
            selectionCtx.strokeStyle = 'rgba(79, 70, 229, 0.9)';
            selectionCtx.setLineDash([]);
            selectionCtx.beginPath();
            if (currentTool === 'rect') {
                const start = currentPath[0];
                const end = currentPath[currentPath.length - 1];
                selectionCtx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
            } else if (currentTool === 'lasso') {
                selectionCtx.moveTo(currentPath[0].x, currentPath[0].y);
                for (let i = 1; i < currentPath.length; i++) {
                    selectionCtx.lineTo(currentPath[i].x, currentPath[i].y);
                }
            }
            selectionCtx.stroke();
        }
        
        offset = (offset + 1) % 8;
        animationFrameId = requestAnimationFrame(march);
    }
    cancelAnimationFrame(animationFrameId);
    march();
}

function clearAllSelections() {
    selections = [];
    redrawMaskFromSelections();
}

// --- Main Replacement Function ---
function replaceColor() {
    if (!isImageLoaded || !selectedColor || history.length === 0) return;
    
    // Always work from the last saved state for previews
    const sourceImageData = history[history.length - 1].imageData;
    const newImageData = new ImageData(new Uint8ClampedArray(sourceImageData.data), sourceImageData.width, sourceImageData.height);
    const data = newImageData.data;
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    const hasSelection = selections.length > 0;

    const newColorRgb = hexToRgb(colorPicker.value);
    const tolerance = toleranceSlider.value;
    const isAdvancedMode = modeToggle.checked;
    const newColorHsl = isAdvancedMode ? rgbToHsl(newColorRgb.r, newColorRgb.g, newColorRgb.b) : null;
    const targetLab = rgbToLab(selectedColor.r, selectedColor.g, selectedColor.b);

    for (let i = 0; i < data.length; i += 4) {
        if (hasSelection && maskData[i + 3] === 0) {
            continue;
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
}

// --- Event Listeners and UI Updates ---
toleranceSlider.addEventListener('input', () => {
    toleranceValue.textContent = `Tolerance: ${toleranceSlider.value}`;
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(replaceColor, 10);

    // Debounce saving state to history
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(saveState, 500);
});

undoBtn.addEventListener('click', () => {
    if (history.length > 1) {
        history.pop();
        restoreState(history[history.length - 1]);
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
            progressText.innerHTML = `✅ Download Started!<br><small>Check your browser's 'Downloads' folder.</small>`;
            closeOverlayBtn.style.display = 'inline-block';
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
    undoBtn.disabled = history.length <= 1;
    downloadBtn.disabled = !isImageLoaded;
    clearSelectionBtn.disabled = selections.length === 0;
    undoSelectionBtn.disabled = selections.length === 0;
}
function clearSelectedColor() {
    selectedColor = null;
    updateSelectedColorUI();
}
function updateSelectedColorUI() {
    if (selectedColor) {
        const hex = rgbToHex(selectedColor.r, selectedColor.g, selectedColor.b);
        selectedColorSwatch.style.backgroundColor = hex;
        selectedHex.textContent = `HEX: ${hex}`;
        selectedRgb.textContent = `RGB: ${selectedColor.r}, ${selectedColor.g}, ${selectedColor.b}`;
        pickColorInstruction.classList.add('hidden');
    } else {
        selectedColorSwatch.style.backgroundColor = '#f0f0f0';
        selectedHex.textContent = 'HEX: --';
        selectedRgb.textContent = 'RGB: --, --, --';
        pickColorInstruction.classList.remove('hidden');
        if (selections.length > 0) {
            pickColorInstruction.textContent = "Use the eyedropper to click a color inside the selected area.";
        } else {
            pickColorInstruction.textContent = "Use the eyedropper to click on the color to replace.";
        }
    }
    updateButtonStates();
}
function resetPaletteSelectionUI() {
    paletteSelectionSwatch.style.backgroundColor = '#f0f0f0';
    paletteSelectionHex.textContent = 'HEX: --';
    paletteSelectionRgb.textContent = 'RGB: --, --, --';
}
selectionCanvas.addEventListener('mousemove', (e) => {
    if (!isImageLoaded || isInteracting) return;
    const { r, g, b } = getColorAtCursor(e, canvas, ctx);
    updatePreviewTooltip(e, r, g, b);
});
selectionCanvas.addEventListener('mouseleave', () => { colorPreview.style.display = 'none'; });

function updatePreviewTooltip(e, r, g, b) {
    if (selectedColor) {
        colorPreview.style.display = 'none';
        return;
    }
    const hex = rgbToHex(r, g, b);
    previewSwatch.style.backgroundColor = hex;
    previewHex.textContent = hex;
    previewRgb.textContent = `RGB(${r}, ${g}, ${b})`;
    const tooltip = colorPreview;
    const offsetX = 20;
    const offsetY = 20;
    tooltip.style.display = 'flex'; 
    const tooltipRect = tooltip.getBoundingClientRect();
    let x = e.clientX + offsetX;
    let y = e.clientY + offsetY;
    if (x + tooltipRect.width > window.innerWidth) { x = e.clientX - tooltipRect.width - offsetX; }
    if (y + tooltipRect.height > window.innerHeight) { y = e.clientY - tooltipRect.height - offsetY; }
    if (x < 0) x = offsetX;
    if (y < 0) y = offsetY;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}
[colorPicker, hexInput, rInput, gInput, bInput].forEach(el => {
    el.addEventListener('input', () => {
        if(el.id === 'hexInput') syncColorInputs(hexInput.value, 'hex');
        else if (['rInput', 'gInput', 'bInput'].includes(el.id)) syncColorInputs(null, 'rgb');
        else syncColorInputs(colorPicker.value, 'picker');
        
        if (selectedColor) {
            replaceColor();
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(saveState, 500);
        }
    });
});
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

// --- HELP MODAL LOGIC ---
const helpModal = document.getElementById('help-modal');
const helpBtn = document.getElementById('help-btn');
const helpCloseBtn = document.getElementById('help-close-btn');
const controlBoxes = document.querySelectorAll('.control-box');
let currentHelpTopic = 'introduction';

const openHelpModal = () => {
    helpModal.classList.remove('hidden');
    const topicElement = document.getElementById(`help-topic-${currentHelpTopic}`);
    if (topicElement) {
        topicElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        topicElement.classList.add('topic-highlight');
        setTimeout(() => {
            topicElement.classList.remove('topic-highlight');
        }, 2000);
    }
};

const closeHelpModal = () => {
    helpModal.classList.add('hidden');
};

controlBoxes.forEach(box => {
    box.addEventListener('focusin', () => {
        currentHelpTopic = box.dataset.helpTopic;
    });
     box.addEventListener('click', () => {
        currentHelpTopic = box.dataset.helpTopic;
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === '?') {
        if (document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            openHelpModal();
        }
    }
    if (e.key === 'Escape') {
        closeHelpModal();
    }
});

helpBtn.addEventListener('click', openHelpModal);
helpCloseBtn.addEventListener('click', closeHelpModal);
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        closeHelpModal();
    }
});


// --- INITIALIZE ---
syncColorInputs(DEFAULT_NEW_COLOR, 'hex');
resetPaletteSelectionUI();
updateButtonStates();
animateSelectionBoundaries();
selectionCanvas.className = 'cursor-eyedropper';