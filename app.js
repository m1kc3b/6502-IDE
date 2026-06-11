/* ─────────────────────────────────────────────────────────────
   6502 IDE — L'Archéogeek
   app.js  — événements UI uniquement (pas de logique métier)
   ───────────────────────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════
   CONSOLE
   ══════════════════════════════════════════════════════════════ */
const Console = (() => {
  const output = document.getElementById('console-output');

  function log(text, type = 'info') {
    const line = document.createElement('span');
    line.className = `log-line log-${type}`;
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.textContent = `[${ts}]  ${text}`;
    output.appendChild(line);
    output.appendChild(document.createElement('br'));
    output.scrollTop = output.scrollHeight;
  }

  function clear() {
    output.innerHTML = '';
    log('Console effacée.', 'dim');
  }

  return { log, clear };
})();


/* ══════════════════════════════════════════════════════════════
   EVENT BUS  (publish / subscribe minimal)
   ══════════════════════════════════════════════════════════════ */
const Bus = (() => {
  const listeners = {};

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  function emit(event, data) {
    console.log(`[Bus] emit → ${event}`, data ?? '');
    (listeners[event] || []).forEach(fn => fn(data));
  }

  return { on, emit };
})();


/* ══════════════════════════════════════════════════════════════
   TOOLBAR — boutons gauche
   ══════════════════════════════════════════════════════════════ */
const Toolbar = (() => {
  const btnAssemble  = document.getElementById('btn-assemble');
  const btnRun       = document.getElementById('btn-run');
  const btnStep      = document.getElementById('btn-step');
  const btnReset     = document.getElementById('btn-reset');
  const btnHexdump   = document.getElementById('btn-hexdump');
  const btnDisasm    = document.getElementById('btn-disasm');
  const chkDebug     = document.getElementById('chk-debug');
  const speedSlider  = document.getElementById('speed-slider');
  const speedVal     = document.getElementById('speed-val');

  function init() {
    btnAssemble.addEventListener('click', () => {
      Console.log('→ Assembler déclenché', 'info');
      Bus.emit('assemble');
    });

    btnRun.addEventListener('click', () => {
      const isRunning = btnRun.classList.contains('running');
      if (isRunning) {
        Console.log('→ Stop déclenché', 'info');
        Bus.emit('stop');
      } else {
        Console.log('→ Run déclenché', 'info');
        Bus.emit('run');
      }
    });

    btnStep.addEventListener('click', () => {
      Console.log('→ Step (pas à pas) déclenché', 'info');
      Bus.emit('step');
    });

    btnReset.addEventListener('click', () => {
      Console.log('→ Reset déclenché', 'info');
      Bus.emit('reset');
    });

    btnHexdump.addEventListener('click', () => {
      Console.log('→ Hexdump demandé', 'info');
      Bus.emit('hexdump');
    });

    btnDisasm.addEventListener('click', () => {
      Console.log('→ Désassemblage demandé', 'info');
      Bus.emit('disassemble');
    });

    chkDebug.addEventListener('change', () => {
      const on = chkDebug.checked;
      Console.log(`→ Mode debug : ${on ? 'activé' : 'désactivé'}`, 'info');
      Bus.emit('debug-toggle', { enabled: on });
    });

    speedSlider.addEventListener('input', () => {
      const v = speedSlider.value;
      speedVal.textContent = v + '%';
      Bus.emit('speed-change', { value: Number(v) });
    });
  }

  /* Appelé par la logique métier pour refléter l'état */
  function setState(state) {
    // state : 'idle' | 'assembled' | 'running' | 'debugging'
    const assembled  = ['assembled', 'running', 'debugging'].includes(state);
    const running    = state === 'running';
    const debugging  = state === 'debugging';

    btnAssemble.disabled = assembled;
    btnRun.disabled      = !assembled;
    btnStep.disabled     = !debugging;
    btnReset.disabled    = !assembled;
    btnHexdump.disabled  = !assembled;
    btnDisasm.disabled   = !assembled;

    if (running) {
      btnRun.classList.add('running');
      btnRun.querySelector('.tb-label').textContent = 'Stop';
      btnRun.querySelector('svg').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    } else {
      btnRun.classList.remove('running');
      btnRun.querySelector('.tb-label').textContent = 'Run';
      btnRun.querySelector('svg').innerHTML = '<polygon points="5,3 19,12 5,21"/>';
    }
  }

  return { init, setState };
})();


/* ══════════════════════════════════════════════════════════════
   MODAL — fenêtre flottante déplaçable et redimensionnable
   ══════════════════════════════════════════════════════════════ */
const Modal = (() => {
  function init(modalEl) {
    const bar      = modalEl.querySelector('.modal-bar');
    const closeBtn = modalEl.querySelector('.modal-close');
    const resizeEl = modalEl.querySelector('.modal-resize');

    /* ── Drag ── */
    let dragging = false, ox = 0, oy = 0;

    bar.addEventListener('mousedown', e => {
      if (e.target === closeBtn) return;
      dragging = true;
      const rect = modalEl.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      modalEl.style.transition = 'none';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      let x = e.clientX - ox;
      let y = e.clientY - oy;
      // clamp inside viewport
      x = Math.max(0, Math.min(window.innerWidth  - modalEl.offsetWidth,  x));
      y = Math.max(0, Math.min(window.innerHeight - modalEl.offsetHeight, y));
      modalEl.style.left = x + 'px';
      modalEl.style.top  = y + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        document.body.style.userSelect = '';
        modalEl.style.transition = '';
      }
    });

    /* ── Resize ── */
    if (resizeEl) {
      let resizing = false, startW, startH, startX, startY;

      resizeEl.addEventListener('mousedown', e => {
        e.stopPropagation();
        resizing = true;
        startW = modalEl.offsetWidth;
        startH = modalEl.offsetHeight;
        startX = e.clientX;
        startY = e.clientY;
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', e => {
        if (!resizing) return;
        const w = Math.max(240, startW + (e.clientX - startX));
        const h = Math.max(120, startH + (e.clientY - startY));
        modalEl.style.width  = w + 'px';
        modalEl.style.height = h + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (resizing) {
          resizing = false;
          document.body.style.userSelect = '';
        }
      });
    }

    /* ── Close ── */
    closeBtn.addEventListener('click', () => hide(modalEl));
  }

  function show(modalEl) {
    modalEl.classList.add('visible');
  }

  function hide(modalEl) {
    modalEl.classList.remove('visible');
  }

  function toggle(modalEl) {
    modalEl.classList.toggle('visible');
  }

  return { init, show, hide, toggle };
})();


/* ══════════════════════════════════════════════════════════════
   TITLE BAR — boutons screen / debug
   ══════════════════════════════════════════════════════════════ */
const Titlebar = (() => {
  const btnScreen = document.getElementById('btn-show-screen');
  const btnDebug  = document.getElementById('btn-show-debug');
  const modalScreen = document.getElementById('modal-screen');
  const modalDebug  = document.getElementById('modal-debug');

  function init() {
    btnScreen.addEventListener('click', () => {
      Modal.toggle(modalScreen);
      Console.log('→ Fenêtre écran togglée', 'dim');
    });
    btnDebug.addEventListener('click', () => {
      Modal.toggle(modalDebug);
      Console.log('→ Fenêtre débogueur togglée', 'dim');
    });
  }

  return { init };
})();


/* ══════════════════════════════════════════════════════════════
   EDITOR — textarea
   ══════════════════════════════════════════════════════════════ */
const Editor = (() => {
  const ta = document.getElementById('code-editor');
  const sbCursor = document.getElementById('sb-cursor');

  function init() {
    /* Tab → 2 espaces */
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
        Bus.emit('code-change');
      }
    });

    ta.addEventListener('input', () => Bus.emit('code-change'));
    ta.addEventListener('click', updateCursor);
    ta.addEventListener('keyup', updateCursor);
  }

  function updateCursor() {
    const before = ta.value.substring(0, ta.selectionStart);
    const lines  = before.split('\n');
    sbCursor.textContent = `Ln ${lines.length}  Col ${lines[lines.length - 1].length + 1}`;
  }

  function getValue() { return ta.value; }

  return { init, getValue, updateCursor };
})();


/* ══════════════════════════════════════════════════════════════
   STATUS BAR
   ══════════════════════════════════════════════════════════════ */
const StatusBar = (() => {
  const stateEl = document.getElementById('sb-state');

  function set(text, type = '') {
    stateEl.textContent  = text;
    stateEl.className    = `sb-state ${type}`;
  }

  return { set };
})();


/* ══════════════════════════════════════════════════════════════
   CONSOLE CLEAR
   ══════════════════════════════════════════════════════════════ */
document.getElementById('console-clear').addEventListener('click', Console.clear);


/* ══════════════════════════════════════════════════════════════
   GOTO
   ══════════════════════════════════════════════════════════════ */
document.getElementById('goto-btn').addEventListener('click', () => {
  const val = document.getElementById('goto-input').value.trim();
  Console.log(`→ Goto adresse : ${val || '(vide)'}`, 'info');
  Bus.emit('goto', { address: val });
});


/* ══════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Toolbar */
  Toolbar.init();
  Toolbar.setState('idle');

  /* Editor */
  Editor.init();

  /* Modals */
  Modal.init(document.getElementById('modal-screen'));
  Modal.init(document.getElementById('modal-debug'));

  /* Titlebar toggles */
  Titlebar.init();

  /* Status bar */
  StatusBar.set('Prêt');

  /* Moteur 6502 */
  initSimulator();
});
