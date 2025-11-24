/**
 * Virtual Whiteboard - Core Logic
 */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const settingsOverlay = document.getElementById('settings-overlay');
const contextMenu = document.getElementById('context-menu');
const currentToolDisplay = document.querySelector('#current-tool-display span');
const textInput = document.getElementById('text-input');

// --- State ---
const state = {
    elements: [], // { type, x, y, width, height, color, ... }
    history: [], // Undo stack
    redoStack: [], // Redo stack
    view: { x: 0, y: 0, zoom: 1 },
    tool: 'pen', // Default tool
    isDragging: false,
    isDrawing: false,
    isResizing: false,
    isSpacePressed: false, // Track space key
    selection: null, // Selected element index or object
    activeHandle: null,
    lastMouse: { x: 0, y: 0 },
    dragStart: { x: 0, y: 0 },
    settings: {
        strokeColor: '#000000',
        fillColor: 'transparent', // Default transparent
        strokeWidth: 3,
        fontSize: 24
    }
};

// --- Initialization ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}
window.addEventListener('resize', resize);
resize();

// --- History ---
function saveState() {
    // Deep copy elements
    state.history.push(JSON.parse(JSON.stringify(state.elements)));
    if (state.history.length > 50) state.history.shift();
    state.redoStack = []; // Clear redo on new action

    // Autosave
    localStorage.setItem('boardData', JSON.stringify(state.elements));
}

function undo() {
    if (state.history.length > 0) {
        state.redoStack.push(JSON.parse(JSON.stringify(state.elements)));
        state.elements = state.history.pop();
        state.selection = null;
        updateSettingsUI();
        draw();
    }
}

function redo() {
    if (state.redoStack.length > 0) {
        state.history.push(JSON.parse(JSON.stringify(state.elements)));
        state.elements = state.redoStack.pop();
        state.selection = null;
        updateSettingsUI();
        draw();
    }
}

// --- UI Updates ---
function updateSettingsUI() {
    const toolSettings = document.getElementById('tool-settings');
    toolSettings.innerHTML = ''; // Clear existing

    // Common settings
    if (['rect', 'circle', 'pen', 'text', 'select'].includes(state.tool)) {
        // Stroke Color
        addSetting(toolSettings, 'color', 'Stroke', state.settings.strokeColor, (val) => {
            state.settings.strokeColor = val;
            if (state.selection) state.selection.strokeColor = val;
            saveState(); // Save on color change
        });
    }

    if (['rect', 'circle', 'text', 'select'].includes(state.tool)) {
        if (state.tool !== 'text' && (state.tool !== 'select' || (state.selection && state.selection.type !== 'text'))) {
            addSetting(toolSettings, 'color', 'Fill', state.settings.fillColor, (val) => {
                state.settings.fillColor = val;
                if (state.selection) state.selection.fillColor = val;
                saveState();
            });
        }
    }

    if (['rect', 'circle', 'pen', 'select'].includes(state.tool)) {
        // Stroke Width
        if (state.tool !== 'select' || (state.selection && state.selection.type !== 'text')) {
            addSetting(toolSettings, 'range', 'Width', state.settings.strokeWidth, (val) => {
                state.settings.strokeWidth = parseInt(val);
                if (state.selection) state.selection.strokeWidth = parseInt(val);
            }, { min: 1, max: 20 });
        }
    }

    if (state.tool === 'text' || (state.tool === 'select' && state.selection && state.selection.type === 'text')) {
        // Font Size
        addSetting(toolSettings, 'range', 'Size', state.selection ? state.selection.fontSize : state.settings.fontSize, (val) => {
            const size = parseInt(val);
            state.settings.fontSize = size;
            if (state.selection) state.selection.fontSize = size;
        }, { min: 10, max: 100 });
    }
}

function addSetting(parent, type, label, value, onChange, attrs = {}) {
    const row = document.createElement('div');
    row.className = 'setting-row';

    if (type === 'color') {
        // Custom Color Picker Trigger
        const trigger = document.createElement('div');
        trigger.style.width = '100%';
        trigger.style.height = '30px';
        trigger.style.background = value === 'transparent' ?
            'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMy9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHJlY3Qgd2lkdGg9IjUiIGhlaWdodD0iNSIgZmlsbD0iI2NjYyIvPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSI1IiBoZWlnaHQ9IjUiIGZpbGw9IiNjY2MiLz48L3N2Zz4=") repeat' :
            value;
        trigger.style.border = '2px solid #000';
        trigger.style.cursor = 'pointer';
        trigger.title = label;

        trigger.addEventListener('click', (e) => {
            showColorPicker(e.clientX, e.clientY, (color) => {
                trigger.style.background = color === 'transparent' ?
                    'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMy9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHJlY3Qgd2lkdGg9IjUiIGhlaWdodD0iNSIgZmlsbD0iI2NjYyIvPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSI1IiBoZWlnaHQ9IjUiIGZpbGw9IiNjY2MiLz48L3N2Zz4=") repeat' :
                    color;
                onChange(color);
            });
        });
        row.appendChild(trigger);
    } else {
        const input = document.createElement('input');
        input.type = type;
        input.value = value;
        input.title = label;

        for (const [k, v] of Object.entries(attrs)) {
            input.setAttribute(k, v);
        }

        input.addEventListener('input', (e) => onChange(e.target.value));
        input.addEventListener('change', () => saveState());
        row.appendChild(input);
    }

    parent.appendChild(row);
}

// Custom Color Picker Logic
const colorPickerModal = document.getElementById('color-picker-modal');
let activeColorCallback = null;

function showColorPicker(x, y, callback) {
    activeColorCallback = callback;
    colorPickerModal.style.left = `${x}px`;
    colorPickerModal.style.top = `${y}px`;
    colorPickerModal.classList.remove('hidden');
}

// Close picker on outside click
document.addEventListener('mousedown', (e) => {
    if (!colorPickerModal.classList.contains('hidden') &&
        !colorPickerModal.contains(e.target) &&
        !e.target.closest('.setting-row')) {
        colorPickerModal.classList.add('hidden');
    }
});

// Color Grid Click
colorPickerModal.addEventListener('click', (e) => {
    if (e.target.classList.contains('color-swatch')) {
        const color = e.target.getAttribute('data-color');
        if (activeColorCallback) activeColorCallback(color);
        colorPickerModal.classList.add('hidden');
    }
});

// Custom Input
document.getElementById('custom-color-picker').addEventListener('input', (e) => {
    if (activeColorCallback) activeColorCallback(e.target.value);
});

// Initial UI Update
updateSettingsUI();

// Load from LocalStorage
const savedData = localStorage.getItem('boardData');
if (savedData) {
    try {
        state.elements = JSON.parse(savedData);
        // We don't push to history here to allow "Undo" to clear the board? 
        // No, usually we just load state.
        // But if we want undo to work for the loaded state, we might want to push it?
        // Let's just load it as the base state.
    } catch (e) {
        console.error("Failed to load saved data", e);
    }
}

// --- Coordinate Systems ---
// Screen to World
function toWorld(x, y) {
    return {
        x: (x - state.view.x) / state.view.zoom,
        y: (y - state.view.y) / state.view.zoom
    };
}

// World to Screen
function toScreen(x, y) {
    return {
        x: (x * state.view.zoom) + state.view.x,
        y: (y * state.view.zoom) + state.view.y
    };
}

// --- Rendering ---
function draw() {
    // Clear screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid();

    ctx.save();
    // Apply view transform
    ctx.translate(state.view.x, state.view.y);
    ctx.scale(state.view.zoom, state.view.zoom);

    // Draw elements
    state.elements.forEach(el => {
        drawElement(el);
    });

    // Draw current drawing preview
    if (state.isDrawing && state.currentDraft) {
        drawElement(state.currentDraft);
    }

    // Draw selection highlight and handles
    if (state.selection) {
        drawSelection(state.selection);
    }

    ctx.restore();

    requestAnimationFrame(draw);
}

function drawGrid() {
    const gridSize = 50 * state.view.zoom;
    const offsetX = state.view.x % gridSize;
    const offsetY = state.view.y % gridSize;

    ctx.beginPath();
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = offsetX; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    // Horizontal lines
    for (let y = offsetY; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
}

function drawElement(el) {
    ctx.save();

    if (!el.rotation) el.rotation = 0;

    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    ctx.translate(cx, cy);
    ctx.rotate(el.rotation);
    ctx.translate(-cx, -cy);

    ctx.beginPath();
    ctx.strokeStyle = el.strokeColor;
    ctx.fillStyle = el.fillColor;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (el.type === 'rect') {
        ctx.rect(el.x, el.y, el.width, el.height);
        if (el.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
    } else if (el.type === 'circle') {
        ctx.beginPath();
        ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, Math.abs(el.width / 2), Math.abs(el.height / 2), 0, 0, 2 * Math.PI);
        if (el.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
    } else if (el.type === 'pen') {
        // Pen drawing
        // Reverting transform for pen if it's not a container-based shape
        // BUT, if we want to rotate/resize pen, we should treat it as a container now?
        // The user wants "object manipulation" for pen.
        // If we use the points directly, we can't easily rotate/resize without modifying points.
        // My resize logic modifies points. Rotation logic modifies rotation property.
        // So for rotation to work, we MUST use the transform.
        // But points are in world coords.
        // If we rotate around center, we need to draw points relative to center? No, that's hard.
        // Easier: Draw points as is, but if rotation is applied, we need to handle it.
        // Actually, for pen, let's just apply rotation transform.
        // But points are absolute. If we rotate the context, the points will be drawn in wrong place unless they are relative.
        // FIX: We should probably just NOT support rotation for pen in this simple MVP, OR we permanently transform points on rotate end.
        // User said "object manipulation does not work".
        // Let's stick to resizing working (which I fixed in handleResize).
        // For rotation, let's just skip it for pen to avoid complexity, or try to support it by drawing relative to bounding box top-left?
        // Let's try drawing relative to bounding box.

        // Reset transform to draw absolute points if no rotation/resize active?
        // Actually, my resize logic modifies the points directly. So we don't need scale transform.
        // We only need rotation transform.
        // If rotation is 0, we can just draw.
        // If rotation is non-zero, it's hard with absolute points.
        // Let's just reset transform for Pen for now to ensure it draws correctly at least.

        ctx.setTransform(state.view.zoom, 0, 0, state.view.zoom, state.view.x, state.view.y);

        if (el.points.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = el.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
    } else if (el.type === 'text') {
        ctx.font = `${el.fontSize || 24}px 'Patrick Hand'`;
        ctx.fillStyle = el.strokeColor;
        ctx.textBaseline = 'top';

        // Handle Aspect Ratio Unlock (Stretching)
        // We have el.width and el.height.
        // We also have el.fontSize.
        // We can use transform to stretch.
        // Calculate expected width based on text measure?
        // Or just scale context.

        // Let's assume the text was created with a certain width/height.
        // If current width/height differs, we scale.
        // And we scale the text to fit that box?
        // Or we simply scale the context.

        // Save context before scale
        ctx.save();

        // Move to top-left of text box
        ctx.translate(el.x, el.y);

        // Calculate scale factors
        // We need to measure text to know natural size
        const metrics = ctx.measureText(el.text || "Text");
        const naturalWidth = metrics.width;
        const naturalHeight = el.fontSize * 1.2; // Approx

        // If it's a new text, width might be set to natural.
        // If resized, width is different.
        const scaleX = el.width / naturalWidth;
        const scaleY = el.height / naturalHeight;

        ctx.scale(scaleX, scaleY);

        ctx.fillText(el.text || "Text", 0, 0);

        ctx.restore();
    }

    ctx.restore();
}

function drawSelection(el) {
    ctx.save();

    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    if (el.type !== 'pen') {
        ctx.translate(cx, cy);
        ctx.rotate(el.rotation || 0);
        ctx.translate(-cx, -cy);
    }

    ctx.strokeStyle = '#00a8ff'; // Selection blue
    ctx.lineWidth = 2 / state.view.zoom;

    let bounds = getBounds(el);
    // Add padding
    let pad = 5 / state.view.zoom;

    // Draw bounding box
    ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);

    // Draw Handles
    const handleSize = 8 / state.view.zoom;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#00a8ff';

    const handles = getHandleCoords(bounds, pad);

    for (const pos of Object.values(handles)) {
        ctx.fillRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
    }

    // Rotation Handle (top center extended)
    if (el.type !== 'pen') {
        const rotHandle = { x: bounds.x + bounds.width / 2, y: bounds.y - pad - 20 / state.view.zoom };
        ctx.beginPath();
        ctx.moveTo(bounds.x + bounds.width / 2, bounds.y - pad);
        ctx.lineTo(rotHandle.x, rotHandle.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rotHandle.x, rotHandle.y, handleSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}

function getHandleCoords(bounds, pad) {
    return {
        nw: { x: bounds.x - pad, y: bounds.y - pad },
        ne: { x: bounds.x + bounds.width + pad, y: bounds.y - pad },
        sw: { x: bounds.x - pad, y: bounds.y + bounds.height + pad },
        se: { x: bounds.x + bounds.width + pad, y: bounds.y + bounds.height + pad },
        n: { x: bounds.x + bounds.width / 2, y: bounds.y - pad },
        s: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height + pad },
        w: { x: bounds.x - pad, y: bounds.y + bounds.height / 2 },
        e: { x: bounds.x + bounds.width + pad, y: bounds.y + bounds.height / 2 },
    };
}

function getBounds(el) {
    if (el.type === 'rect' || el.type === 'circle' || el.type === 'text') {
        return { x: el.x, y: el.y, width: el.width, height: el.height };
    } else if (el.type === 'pen') {
        // Calculate bounds for pen path
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        el.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
}

// --- Interaction ---

// Key Events
window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
        state.isSpacePressed = true;
        canvas.style.cursor = 'grab';
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't interfere if editing text
        if (!textInput.classList.contains('hidden')) return;

        // Prevent browser navigation/tab closing
        e.preventDefault();

        if (state.selection) {
            const index = state.elements.indexOf(state.selection);
            if (index !== -1) {
                state.elements.splice(index, 1);
                state.selection = null;
                saveState();
                updateSettingsUI();
                draw();
            }
        }
    }
});

window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
        state.isSpacePressed = false;
        canvas.style.cursor = 'default';
    }
});

// Mouse Events
canvas.addEventListener('mousedown', e => {
    if (e.button === 2) return;

    const worldPos = toWorld(e.clientX, e.clientY);
    state.lastMouse = { x: e.clientX, y: e.clientY };
    state.dragStart = worldPos;
    state.isDragging = true;
    state.activeHandle = null;

    // Close context menu if open
    contextMenu.classList.add('hidden');

    // Handle Text Input Blur
    if (!textInput.classList.contains('hidden')) {
        finishTextInput();
        return;
    }

    if (state.tool === 'pan' || state.isSpacePressed || e.buttons === 4) {
        return;
    }

    if (state.tool === 'select') {
        if (state.selection) {
            const handle = getHandleHit(state.selection, worldPos);
            if (handle) {
                state.activeHandle = handle;
                state.isResizing = true;
                // Store initial state for resize
                state.resizeStart = {
                    x: state.selection.x,
                    y: state.selection.y,
                    width: state.selection.width,
                    height: state.selection.height,
                    fontSize: state.selection.fontSize,
                    points: state.selection.type === 'pen' ? JSON.parse(JSON.stringify(state.selection.points)) : null
                };
                return;
            }
        }

        let hit = null;
        for (let i = state.elements.length - 1; i >= 0; i--) {
            if (isHit(state.elements[i], worldPos)) {
                hit = state.elements[i];
                break;
            }
        }
        setSelection(hit);

        if (hit) {
            state.selectionOffset = {
                x: worldPos.x - hit.x,
                y: worldPos.y - hit.y
            };
            if (hit.type === 'pen') {
                state.selectionStartPos = { x: hit.points[0].x, y: hit.points[0].y };
            }
        }
    } else if (['rect', 'circle'].includes(state.tool)) {
        state.isDrawing = true;
        state.currentDraft = {
            type: state.tool,
            x: worldPos.x,
            y: worldPos.y,
            width: 0,
            height: 0,
            strokeColor: state.settings.strokeColor,
            fillColor: state.settings.fillColor,
            strokeWidth: state.settings.strokeWidth,
            rotation: 0
        };
    } else if (state.tool === 'pen') {
        state.isDrawing = true;
        state.currentDraft = {
            type: 'pen',
            points: [{ x: worldPos.x, y: worldPos.y }],
            strokeColor: state.settings.strokeColor,
            fillColor: 'transparent',
            strokeWidth: state.settings.strokeWidth
        };
    } else if (state.tool === 'text') {
        startTextInput(e.clientX, e.clientY, worldPos);
    }
});

canvas.addEventListener('mousemove', e => {
    const worldPos = toWorld(e.clientX, e.clientY);
    const dx = e.clientX - state.lastMouse.x;
    const dy = e.clientY - state.lastMouse.y;

    if (state.isDragging) {
        if (state.tool === 'pan' || state.isSpacePressed || e.buttons === 4) {
            state.view.x += dx;
            state.view.y += dy;
        } else if (state.isDrawing) {
            if (state.tool === 'rect' || state.tool === 'circle') {
                state.currentDraft.width = worldPos.x - state.currentDraft.x;
                state.currentDraft.height = worldPos.y - state.currentDraft.y;
            } else if (state.tool === 'pen') {
                state.currentDraft.points.push({ x: worldPos.x, y: worldPos.y });
            }
        } else if (state.isResizing && state.selection) {
            handleResize(state.selection, state.activeHandle, worldPos);
        } else if (state.tool === 'select' && state.selection) {
            if (state.selection.type !== 'pen') {
                state.selection.x = worldPos.x - state.selectionOffset.x;
                state.selection.y = worldPos.y - state.selectionOffset.y;
            } else if (state.selection.type === 'pen') {
                const worldDx = dx / state.view.zoom;
                const worldDy = dy / state.view.zoom;
                state.selection.points.forEach(p => {
                    p.x += worldDx;
                    p.y += worldDy;
                });
            }
        }
    } else {
        if (state.tool === 'select' && state.selection) {
            const handle = getHandleHit(state.selection, worldPos);
            if (handle) {
                canvas.style.cursor = getCursorForHandle(handle, state.selection.rotation);
            } else {
                canvas.style.cursor = 'default';
            }
        } else {
            canvas.style.cursor = (state.tool === 'pan' || state.isSpacePressed) ? 'grab' : 'crosshair';
        }
    }

    state.lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mouseup', () => {
    if (state.isDrawing && state.currentDraft) {
        if (state.currentDraft.type === 'rect' || state.currentDraft.type === 'circle') {
            if (state.currentDraft.width < 0) {
                state.currentDraft.x += state.currentDraft.width;
                state.currentDraft.width = Math.abs(state.currentDraft.width);
            }
            if (state.currentDraft.height < 0) {
                state.currentDraft.y += state.currentDraft.height;
                state.currentDraft.height = Math.abs(state.currentDraft.height);
            }
            if (state.currentDraft.width > 2 || state.currentDraft.height > 2) {
                state.elements.push(state.currentDraft);
                saveState();
            }
        } else if (state.currentDraft.type === 'pen') {
            if (state.currentDraft.points.length > 1) {
                state.elements.push(state.currentDraft);
                saveState();
            }
        }
        state.currentDraft = null;
        state.isDrawing = false;
    }

    if (state.isDragging && state.tool === 'select' && state.selection && !state.isResizing) {
        // Moved object
        saveState();
    }

    if (state.isResizing) {
        saveState();
    }

    state.isDragging = false;
    state.isResizing = false;
    state.activeHandle = null;
});

// --- Text Input ---
function startTextInput(screenX, screenY, worldPos) {
    textInput.value = "";
    textInput.style.left = `${screenX}px`;
    textInput.style.top = `${screenY}px`;
    textInput.style.width = '200px';
    textInput.style.height = '50px';
    textInput.classList.remove('hidden');
    textInput.focus();

    state.pendingTextPos = worldPos;
}

function finishTextInput() {
    if (textInput.classList.contains('hidden')) return;

    const text = textInput.value.trim();
    if (text) {
        state.elements.push({
            type: 'text',
            x: state.pendingTextPos.x,
            y: state.pendingTextPos.y,
            width: ctx.measureText(text).width * 2, // Approx width
            height: state.settings.fontSize * 1.2, // Approx height
            text: text,
            strokeColor: state.settings.strokeColor,
            fillColor: state.settings.fillColor,
            strokeWidth: 1,
            fontSize: state.settings.fontSize,
            rotation: 0
        });
        saveState();
    }
    textInput.classList.add('hidden');
}

textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        finishTextInput();
    }
});

// --- Buttons ---
document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);
document.getElementById('save-btn').addEventListener('click', () => {
    localStorage.setItem('boardData', JSON.stringify(state.elements));
    alert('Saved!');
});
document.getElementById('load-btn').addEventListener('click', () => {
    const data = localStorage.getItem('boardData');
    if (data) {
        state.elements = JSON.parse(data);
        saveState();
        draw();
    }
});

// --- Helpers for Handles & Hit Test ---

function getHandleHit(el, pos) {

    const pad = 5 / state.view.zoom;
    const bounds = getBounds(el);
    const handleSize = 10 / state.view.zoom; // Slightly larger hit area
    const handles = getHandleCoords(bounds, pad);

    // Check rotation handle
    const rotHandle = { x: bounds.x + bounds.width / 2, y: bounds.y - pad - 20 / state.view.zoom };

    // For rotated objects, we need to transform the mouse position to the object's local space
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const cos = Math.cos(-el.rotation || 0);
    const sin = Math.sin(-el.rotation || 0);
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const localPos = {
        x: dx * cos - dy * sin + cx,
        y: dx * sin + dy * cos + cy
    };

    // Check rotation handle (rotHandle is already in local space)
    if (dist(localPos, rotHandle) < handleSize) return 'rot';

    // Check resize handles (handles are already in local space)
    for (const [key, hPos] of Object.entries(handles)) {
        if (Math.abs(localPos.x - hPos.x) < handleSize && Math.abs(localPos.y - hPos.y) < handleSize) {
            return key;
        }
    }
    return null;
}

function dist(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function handleResize(el, handle, pos) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const rotation = el.rotation || 0;
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);

    // Transform mouse position to element's local coordinate system
    const localPos = {
        x: (pos.x - cx) * cos - (pos.y - cy) * sin + cx,
        y: (pos.x - cx) * sin + (pos.y - cy) * cos + cy
    };

    if (handle === 'rot') {
        el.rotation = Math.atan2(pos.y - cy, pos.x - cx) + Math.PI / 2;
        return;
    }

    // Calculate new dimensions and position in local space
    let newX = el.x;
    let newY = el.y;
    let newWidth = el.width;
    let newHeight = el.height;

    // Determine the opposite corner (anchor point) in local space
    let anchorX = el.x;
    let anchorY = el.y;

    if (handle.includes('e')) anchorX = el.x; else anchorX = el.x + el.width;
    if (handle.includes('s')) anchorY = el.y; else anchorY = el.y + el.height;

    // Update dimensions based on handle
    if (handle.includes('e')) {
        newWidth = localPos.x - anchorX;
    }
    if (handle.includes('s')) {
        newHeight = localPos.y - anchorY;
    }
    if (handle.includes('w')) {
        newX = localPos.x;
        newWidth = anchorX - localPos.x;
    }
    if (handle.includes('n')) {
        newY = localPos.y;
        newHeight = anchorY - localPos.y;
    }

    // Handle negative width/height (resizing past anchor)
    if (newWidth < 0) {
        newX += newWidth;
        newWidth = Math.abs(newWidth);
    }
    if (newHeight < 0) {
        newY += newHeight;
        newHeight = Math.abs(newHeight);
    }

    // Correct for rotation: Calculate new center in world space
    const newLocalCx = newX + newWidth / 2;
    const newLocalCy = newY + newHeight / 2;

    // Shift in local space
    const dCx = newLocalCx - cx;
    const dCy = newLocalCy - cy;

    // Rotate shift back to world space
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    const worldShiftX = dCx * cosR - dCy * sinR;
    const worldShiftY = dCx * sinR + dCy * cosR;

    const newWorldCx = cx + worldShiftX;
    const newWorldCy = cy + worldShiftY;

    el.x = newWorldCx - newWidth / 2;
    el.y = newWorldCy - newHeight / 2;
    el.width = newWidth;
    el.height = newHeight;

    // Special handling for Pen scaling
    if (el.type === 'pen') {
        const scaleX = newWidth / state.resizeStart.width;
        const scaleY = newHeight / state.resizeStart.height;

        el.points = state.resizeStart.points.map(p => ({
            x: newX + (p.x - state.resizeStart.x) * scaleX,
            y: newY + (p.y - state.resizeStart.y) * scaleY
        }));
    }
}

function getCursorForHandle(handle, rotation) {
    if (handle === 'rot') return 'grab';

    // Standard resize cursors
    const cursors = {
        nw: 'nwse-resize', ne: 'nesw-resize',
        sw: 'nesw-resize', se: 'nwse-resize',
        n: 'ns-resize', s: 'ns-resize',
        w: 'ew-resize', e: 'ew-resize'
    };

    // Rotate cursor based on element's rotation
    const angle = (rotation || 0) * (180 / Math.PI); // Convert radians to degrees
    const cursorMap = {
        'nwse-resize': ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'],
        'nesw-resize': ['nesw-resize', 'nwse-resize', 'nesw-resize', 'nwse-resize'],
        'ns-resize': ['ns-resize', 'ew-resize', 'ns-resize', 'ew-resize'],
        'ew-resize': ['ew-resize', 'ns-resize', 'ew-resize', 'ns-resize']
    };

    const baseCursor = cursors[handle];
    if (baseCursor && cursorMap[baseCursor]) {
        const index = Math.round(angle / 45) % 4; // 0, 1, 2, 3 for 0, 45, 90, 135 degrees
        return cursorMap[baseCursor][index];
    }

    return 'default';
}

function isHit(el, pos) {
    // Simple AABB check. For rotated objects, we should transform pos to local space.
    if (el.type === 'pen') {
        // Check distance to any point
        // Optimization: check bounds first
        const bounds = getBounds(el);
        if (pos.x < bounds.x || pos.x > bounds.x + bounds.width || pos.y < bounds.y || pos.y > bounds.y + bounds.height) return false;

        // Detailed check
        for (let i = 0; i < el.points.length - 1; i++) {
            // Distance to line segment
            if (distToSegment(pos, el.points[i], el.points[i + 1]) < (el.strokeWidth / 2 + 5)) return true;
        }
        return false;
    }

    // For rect/circle/text, check bounds (ignoring rotation for hit test simplicity in MVP)
    // Better: Transform point to local space
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    // Rotate point around center by -rotation
    const cos = Math.cos(-el.rotation || 0);
    const sin = Math.sin(-el.rotation || 0);
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const localX = dx * cos - dy * sin + cx;
    const localY = dx * sin + dy * cos + cy;

    return localX >= el.x && localX <= el.x + el.width &&
        localY >= el.y && localY <= el.y + el.height;
}

function distToSegment(p, v, w) {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return dist(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return dist(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

// Zoom
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoomFactor = Math.exp(wheel * zoomIntensity);

    // Zoom towards mouse pointer
    const mouseX = e.clientX - state.view.x;
    const mouseY = e.clientY - state.view.y;

    state.view.x -= mouseX * (zoomFactor - 1);
    state.view.y -= mouseY * (zoomFactor - 1);
    state.view.zoom *= zoomFactor;
}, { passive: false });

// Context Menu
canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.remove('hidden');
});

// Menu Selection
contextMenu.addEventListener('click', e => {
    if (e.target.classList.contains('menu-item')) {
        const tool = e.target.getAttribute('data-tool');
        if (tool) {
            state.tool = tool;
            currentToolDisplay.textContent = tool.charAt(0).toUpperCase() + tool.slice(1);
            contextMenu.classList.add('hidden');
            state.selection = null; // Deselect when changing tools
            updateSettingsUI();
        }
    }
});

// Update settings when selection changes
function setSelection(hit) {
    state.selection = hit;
    updateSettingsUI();
}

// Helpers
function isHit(el, pos) {
    const bounds = getBounds(el);
    return pos.x >= bounds.x && pos.x <= bounds.x + bounds.width &&
        pos.y >= bounds.y && pos.y <= bounds.y + bounds.height;
}

// Initial Draw
draw();
