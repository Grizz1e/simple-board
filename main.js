const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
}
resize();
addEventListener("resize", resize);

/* ===============================
   GLOBAL STATE
================================*/
const S = {
    tool: "pencil",
    color: "#000",
    thickness: 2,

    zoom: 1,
    panX: 0,
    panY: 0,

    objects: [],
    drawing: false,

    // shapes
    shapeStart: null,

    // text
    typing: false,
    caret: null,
    currentText: "",

    // eraser
    eraseHoverIndex: -1,

    // panning
    panning: false,
    lastX: 0,
    lastY: 0,
};

function save() {
    localStorage.setItem("sketch_objects", JSON.stringify(S.objects));
}
function load() {
    const d = localStorage.getItem("sketch_objects");
    if (d) S.objects = JSON.parse(d);
}
load();

/* ===============================
   COORDINATES
================================*/
function screenToWorld(x, y) {
    return {
        x: (x - S.panX) / S.zoom,
        y: (y - S.panY) / S.zoom
    };
}

/* ===============================
   DRAW LOOP
================================*/
function drawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(S.panX, S.panY);
    ctx.scale(S.zoom, S.zoom);

    S.objects.forEach((obj, i) => drawObj(obj, i === S.eraseHoverIndex));

    ctx.restore();
}

function drawObj(o, highlight) {
    ctx.lineWidth = o.thickness;
    ctx.strokeStyle = o.color;
    ctx.fillStyle = o.color;

    if (highlight) ctx.strokeStyle = "red";

    if (o.type === "stroke") {
        ctx.beginPath();
        o.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
    }

    if (o.type === "rect") {
        ctx.strokeRect(o.x, o.y, o.w, o.h);
    }

    if (o.type === "circle") {
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.stroke();
    }

    if (o.type === "text") {
        ctx.font = `${o.thickness * 5 + 10}px Handlee`;
        ctx.fillText(o.text, o.x, o.y);
    }
}

/* ===============================
   PANNING (Space-drag or mid mouse)
================================*/
canvas.addEventListener("mousedown", e => {
    if (e.button === 1 || e.buttons === 4 || e.shiftKey || e.ctrlKey || e.altKey) {
        S.panning = true;
        S.lastX = e.clientX;
        S.lastY = e.clientY;
        return;
    }
});
addEventListener("mousemove", e => {
    if (S.panning) {
        S.panX += e.clientX - S.lastX;
        S.panY += e.clientY - S.lastY;
        S.lastX = e.clientX;
        S.lastY = e.clientY;
        drawAll();
    }
});
addEventListener("mouseup", () => S.panning = false);

/* ===============================
   ZOOM (mouse wheel)
================================*/
canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const worldBefore = screenToWorld(e.clientX, e.clientY);

    S.zoom *= e.deltaY < 0 ? 1.05 : 0.95;

    const worldAfter = screenToWorld(e.clientX, e.clientY);
    S.panX += (worldAfter.x - worldBefore.x) * S.zoom;
    S.panY += (worldAfter.y - worldBefore.y) * S.zoom;

    drawAll();
}, { passive: false });

/* ===============================
   MOUSE DOWN
================================*/
canvas.addEventListener("mousedown", e => {
    hideMenu();

    if (S.tool === "pencil") {
        S.drawing = true;
        const w = screenToWorld(e.clientX, e.clientY);
        S.currentStroke = [{ x: w.x, y: w.y }];
    }

    if (S.tool.startsWith("shape")) {
        S.shapeStart = screenToWorld(e.clientX, e.clientY);
    }

    if (S.tool === "text") {
        startTyping(e);
    }

    if (S.tool === "eraser") {
        eraseAt(e);
    }
});

/* ===============================
   MOUSE MOVE
================================*/
canvas.addEventListener("mousemove", e => {
    const w = screenToWorld(e.clientX, e.clientY);

    if (S.tool === "pencil" && S.drawing) {
        S.currentStroke.push(w);
        drawAll();
        ctx.save();
        ctx.translate(S.panX, S.panY);
        ctx.scale(S.zoom, S.zoom);
        drawObj({ type: "stroke", points: S.currentStroke, color: S.color, thickness: S.thickness });
        ctx.restore();
    }

    if (S.tool.startsWith("shape") && S.shapeStart) {
        drawAll();
        ctx.save();
        ctx.translate(S.panX, S.panY);
        ctx.scale(S.zoom, S.zoom);

        ctx.strokeStyle = S.color;
        ctx.lineWidth = S.thickness;

        if (S.tool === "shape-rect") {
            ctx.strokeRect(S.shapeStart.x, S.shapeStart.y, w.x - S.shapeStart.x, w.y - S.shapeStart.y);
        }
        if (S.tool === "shape-circle") {
            let r = Math.hypot(w.x - S.shapeStart.x, w.y - S.shapeStart.y);
            ctx.beginPath();
            ctx.arc(S.shapeStart.x, S.shapeStart.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    if (S.tool === "eraser") {
        highlightErase(e);
    }
});

/* ===============================
   MOUSE UP
================================*/
canvas.addEventListener("mouseup", e => {
    if (S.tool === "pencil" && S.drawing) {
        S.objects.push({
            type: "stroke",
            points: S.currentStroke,
            color: S.color,
            thickness: S.thickness
        });
        S.drawing = false;
        save();
        drawAll();
    }

    if (S.tool.startsWith("shape") && S.shapeStart) {
        const w = screenToWorld(e.clientX, e.clientY);

        if (S.tool === "shape-rect") {
            S.objects.push({
                type: "rect",
                x: S.shapeStart.x,
                y: S.shapeStart.y,
                w: w.x - S.shapeStart.x,
                h: w.y - S.shapeStart.y,
                color: S.color,
                thickness: S.thickness
            });
        }

        if (S.tool === "shape-circle") {
            S.objects.push({
                type: "circle",
                x: S.shapeStart.x,
                y: S.shapeStart.y,
                r: Math.hypot(w.x - S.shapeStart.x, w.y - S.shapeStart.y),
                color: S.color,
                thickness: S.thickness
            });
        }

        S.shapeStart = null;
        save();
        drawAll();
    }
});

/* ===============================
   ERASER
================================*/
function highlightErase(e) {
    const w = screenToWorld(e.clientX, e.clientY);
    S.eraseHoverIndex = S.objects.findIndex(o => hitTest(o, w.x, w.y));
    drawAll();
}
function eraseAt(e) {
    const w = screenToWorld(e.clientX, e.clientY);
    const i = S.objects.findIndex(o => hitTest(o, w.x, w.y));
    if (i >= 0) {
        S.objects.splice(i, 1);
        save();
        S.eraseHoverIndex = -1;
        drawAll();
    }
}
function hitTest(o, x, y) {
    if (o.type === "rect")
        return x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;

    if (o.type === "circle")
        return Math.hypot(x - o.x, y - o.y) <= o.r;

    if (o.type === "text")
        return x >= o.x && x <= o.x + 200 && y >= o.y - 20 && y <= o.y;

    if (o.type === "stroke") {
        return o.points.some(p => Math.hypot(p.x - x, p.y - y) < o.thickness + 3);
    }
}

/* ===============================
   TEXT TOOL
================================*/
function startTyping(e) {
    if (S.typing && S.caret) finishTyping();

    const world = screenToWorld(e.clientX, e.clientY);

    S.typing = true;
    S.currentText = "";

    const caret = document.createElement("div");
    caret.className = "text-caret";
    caret.style.left = e.clientX + "px";
    caret.style.top = e.clientY + "px";
    document.body.appendChild(caret);
    S.caret = caret;

    S.textStart = { x: world.x, y: world.y };
}

addEventListener("keydown", e => {
    if (!S.typing) return;

    if (e.key === "Enter") return finishTyping();
    if (e.key === "Backspace") S.currentText = S.currentText.slice(0, -1);
    else if (e.key.length === 1) S.currentText += e.key;

    updateCaretRender();
});

function updateCaretRender() {
    drawAll();
    ctx.save();
    ctx.translate(S.panX, S.panY);
    ctx.scale(S.zoom, S.zoom);
    ctx.font = `${S.thickness * 5 + 10}px Handlee`;
    ctx.fillStyle = S.color;
    ctx.fillText(S.currentText, S.textStart.x, S.textStart.y);
    ctx.restore();
}

function finishTyping() {
    if (!S.typing) return;
    document.body.removeChild(S.caret);
    S.objects.push({
        type: "text",
        text: S.currentText,
        x: S.textStart.x,
        y: S.textStart.y,
        color: S.color,
        thickness: S.thickness
    });
    S.typing = false;
    S.currentText = "";
    save();
    drawAll();
}

/* ===============================
   PANNING (Space-drag or mid mouse)
================================*/
canvas.addEventListener("mousedown", e => {
    if (e.button === 1 || e.buttons === 4 || e.shiftKey || e.ctrlKey || e.altKey) {
        S.panning = true;
        S.lastX = e.clientX;
        S.lastY = e.clientY;
        return;
    }
});
addEventListener("mousemove", e => {
    if (S.panning) {
        S.panX += e.clientX - S.lastX;
        S.panY += e.clientY - S.lastY;
        S.lastX = e.clientX;
        S.lastY = e.clientY;
        drawAll();
    }
});
addEventListener("mouseup", () => S.panning = false);

/* ===============================
   ZOOM (mouse wheel)
================================*/
canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const worldBefore = screenToWorld(e.clientX, e.clientY);

    S.zoom *= e.deltaY < 0 ? 1.05 : 0.95;

    const worldAfter = screenToWorld(e.clientX, e.clientY);
    S.panX += (worldAfter.x - worldBefore.x) * S.zoom;
    S.panY += (worldAfter.y - worldBefore.y) * S.zoom;

    drawAll();
}, { passive: false });

/* ===============================
   MOUSE DOWN
================================*/
canvas.addEventListener("mousedown", e => {
    hideMenu();

    if (S.tool === "pencil") {
        S.drawing = true;
        const w = screenToWorld(e.clientX, e.clientY);
        S.currentStroke = [{ x: w.x, y: w.y }];
    }

    if (S.tool.startsWith("shape")) {
        S.shapeStart = screenToWorld(e.clientX, e.clientY);
    }

    if (S.tool === "text") {
        startTyping(e);
    }

    if (S.tool === "eraser") {
        eraseAt(e);
    }
});

/* ===============================
   MOUSE MOVE
================================*/
canvas.addEventListener("mousemove", e => {
    const w = screenToWorld(e.clientX, e.clientY);

    if (S.tool === "pencil" && S.drawing) {
        S.currentStroke.push(w);
        drawAll();
        ctx.save();
        ctx.translate(S.panX, S.panY);
        ctx.scale(S.zoom, S.zoom);
        drawObj({ type: "stroke", points: S.currentStroke, color: S.color, thickness: S.thickness });
        ctx.restore();
    }

    if (S.tool.startsWith("shape") && S.shapeStart) {
        drawAll();
        ctx.save();
        ctx.translate(S.panX, S.panY);
        ctx.scale(S.zoom, S.zoom);

        ctx.strokeStyle = S.color;
        ctx.lineWidth = S.thickness;

        if (S.tool === "shape-rect") {
            ctx.strokeRect(S.shapeStart.x, S.shapeStart.y, w.x - S.shapeStart.x, w.y - S.shapeStart.y);
        }
        if (S.tool === "shape-circle") {
            let r = Math.hypot(w.x - S.shapeStart.x, w.y - S.shapeStart.y);
            ctx.beginPath();
            ctx.arc(S.shapeStart.x, S.shapeStart.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    if (S.tool === "eraser") {
        highlightErase(e);
    }
});

/* ===============================
   MOUSE UP
================================*/
canvas.addEventListener("mouseup", e => {
    if (S.tool === "pencil" && S.drawing) {
        S.objects.push({
            type: "stroke",
            points: S.currentStroke,
            color: S.color,
            thickness: S.thickness
        });
        S.drawing = false;
        save();
        drawAll();
    }

    if (S.tool.startsWith("shape") && S.shapeStart) {
        const w = screenToWorld(e.clientX, e.clientY);

        if (S.tool === "shape-rect") {
            S.objects.push({
                type: "rect",
                x: S.shapeStart.x,
                y: S.shapeStart.y,
                w: w.x - S.shapeStart.x,
                h: w.y - S.shapeStart.y,
                color: S.color,
                thickness: S.thickness
            });
        }

        if (S.tool === "shape-circle") {
            S.objects.push({
                type: "circle",
                x: S.shapeStart.x,
                y: S.shapeStart.y,
                r: Math.hypot(w.x - S.shapeStart.x, w.y - S.shapeStart.y),
                color: S.color,
                thickness: S.thickness
            });
        }

        S.shapeStart = null;
        save();
        drawAll();
    }
});

/* ===============================
   ERASER
================================*/
function highlightErase(e) {
    const w = screenToWorld(e.clientX, e.clientY);
    S.eraseHoverIndex = S.objects.findIndex(o => hitTest(o, w.x, w.y));
    drawAll();
}
function eraseAt(e) {
    const w = screenToWorld(e.clientX, e.clientY);
    const i = S.objects.findIndex(o => hitTest(o, w.x, w.y));
    if (i >= 0) {
        S.objects.splice(i, 1);
        save();
        S.eraseHoverIndex = -1;
        drawAll();
    }
}
function hitTest(o, x, y) {
    if (o.type === "rect")
        return x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;

    if (o.type === "circle")
        return Math.hypot(x - o.x, y - o.y) <= o.r;

    if (o.type === "text")
        return x >= o.x && x <= o.x + 200 && y >= o.y - 20 && y <= o.y;

    if (o.type === "stroke") {
        return o.points.some(p => Math.hypot(p.x - x, p.y - y) < o.thickness + 3);
    }
}

/* ===============================
   TEXT TOOL
================================*/
function startTyping(e) {
    if (S.typing && S.caret) finishTyping();

    const world = screenToWorld(e.clientX, e.clientY);

    S.typing = true;
    S.currentText = "";

    const caret = document.createElement("div");
    caret.className = "text-caret";
    caret.style.left = e.clientX + "px";
    caret.style.top = e.clientY + "px";
    document.body.appendChild(caret);
    S.caret = caret;

    S.textStart = { x: world.x, y: world.y };
}

addEventListener("keydown", e => {
    if (!S.typing) return;

    if (e.key === "Enter") return finishTyping();
    if (e.key === "Backspace") S.currentText = S.currentText.slice(0, -1);
    else if (e.key.length === 1) S.currentText += e.key;

    updateCaretRender();
});

function updateCaretRender() {
    drawAll();
    ctx.save();
    ctx.translate(S.panX, S.panY);
    ctx.scale(S.zoom, S.zoom);
    ctx.font = `${S.thickness * 5 + 10}px Handlee`;
    ctx.fillStyle = S.color;
    ctx.fillText(S.currentText, S.textStart.x, S.textStart.y);
    ctx.restore();
}

function finishTyping() {
    if (!S.typing) return;
    document.body.removeChild(S.caret);
    S.objects.push({
        type: "text",
        text: S.currentText,
        x: S.textStart.x,
        y: S.textStart.y,
        color: S.color,
        thickness: S.thickness
    });
    S.typing = false;
    S.currentText = "";
    save();
    drawAll();
}

/* ===============================
   CONTEXT MENU
================================*/
const menu = document.getElementById("contextMenu");

document.addEventListener("contextmenu", e => {
    e.preventDefault();
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    menu.classList.remove("hidden");
});
document.addEventListener("click", e => {
    if (!menu.contains(e.target)) hideMenu();
});
function hideMenu() { menu.classList.add("hidden"); }

/* dropdowns */
document.querySelectorAll(".dropdown-title").forEach(title => {
    title.onclick = () => title.parentElement.classList.toggle("open");
});

/* tool selection */
document.querySelectorAll("[data-tool]").forEach(btn =>
    btn.onclick = () => S.tool = btn.dataset.tool
);

/* colors */
document.querySelectorAll(".color-swatch").forEach(c =>
    c.onclick = () => S.color = c.dataset.color
);
document.getElementById("customColor").oninput = e =>
    S.color = e.target.value;

/* thickness */
document.querySelectorAll(".thickness-item").forEach(btn =>
    btn.onclick = () => S.thickness = +btn.dataset.thick
);

/* initial draw */
drawAll();
