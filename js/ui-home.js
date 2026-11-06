// ui-home.js — home screen: project/elements grids, new project modal

const Home = {
  selectedProjectIds: new Set(),
  selectionMode: false,
  _projects: [],

  async refresh() {
    await Home.refreshProjects();
    await Home.refreshElements();
  },
  async refreshProjects() {
    const projects = (await Storage.all('projects')).sort((a, b) => b.updated - a.updated);
    Home._projects = projects;
    // prune selected ids that no longer exist
    const existIds = new Set(projects.map(p => p.id));
    for (const id of Array.from(Home.selectedProjectIds)) {
      if (!existIds.has(id)) Home.selectedProjectIds.delete(id);
    }
    const grid = document.getElementById('project-grid');
    grid.innerHTML = '';
    if (!projects.length) {
      grid.innerHTML = `<p class="hint">No projects yet — hit + to start one.</p>`;
      if (Home.selectionMode) Home.setSelectionMode(false);
    }
    for (const p of projects) grid.appendChild(Home.card(p, async () => {
      await Storage.put('projects', p);
      Editor.open(p);
    }, async () => {
      if (confirm(`Delete project "${p.name}"?`)) {
        await Storage.del('projects', p.id);
        Home.selectedProjectIds.delete(p.id);
        Home.refreshProjects();
        toast('Project deleted');
      }
    }));
    Home.updateSelectionUI();
  },
  setSelectionMode(active) {
    Home.selectionMode = !!active;
    const grid = document.getElementById('project-grid');
    if (grid) grid.classList.toggle('selection-active', Home.selectionMode);
    const norm = document.getElementById('home-normal-actions');
    const batch = document.getElementById('home-batch-actions');
    if (norm && batch) {
      norm.style.display = Home.selectionMode ? 'none' : 'flex';
      batch.style.display = Home.selectionMode ? 'flex' : 'none';
    }
    const selBtn = document.getElementById('btn-select-mode');
    if (selBtn) selBtn.classList.toggle('active', Home.selectionMode);
    if (!Home.selectionMode) {
      Home.selectedProjectIds.clear();
    }
    Home.updateSelectionUI();
  },
  toggleSelect(id) {
    if (Home.selectedProjectIds.has(id)) {
      Home.selectedProjectIds.delete(id);
    } else {
      Home.selectedProjectIds.add(id);
      if (!Home.selectionMode) Home.setSelectionMode(true);
    }
    Home.updateSelectionUI();
  },
  selectAll() {
    if (Home.selectedProjectIds.size === Home._projects.length && Home._projects.length > 0) {
      Home.selectedProjectIds.clear();
    } else {
      Home._projects.forEach(p => Home.selectedProjectIds.add(p.id));
    }
    Home.updateSelectionUI();
  },
  updateSelectionUI() {
    const count = Home.selectedProjectIds.size;
    const cntEl = document.getElementById('batch-selected-count');
    if (cntEl) cntEl.textContent = `${count} selected`;
    const delBtn = document.getElementById('btn-delete-selected');
    if (delBtn) {
      delBtn.disabled = count === 0;
      delBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:-2px;margin-right:4px;"><path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M4 7h16M10 11v6M14 11v6M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Delete${count > 0 ? ` (${count})` : ''}`;
    }
    const allBtn = document.getElementById('btn-select-all');
    if (allBtn) {
      allBtn.textContent = (count === Home._projects.length && count > 0) ? 'Deselect All' : 'Select All';
    }
    const grid = document.getElementById('project-grid');
    if (grid) {
      grid.querySelectorAll('.pcard').forEach(card => {
        const id = card.dataset.id;
        card.classList.toggle('selected', !!(id && Home.selectedProjectIds.has(id)));
      });
    }
  },
  async deleteSelected() {
    const count = Home.selectedProjectIds.size;
    if (!count) return;
    const msg = count === 1 ? 'Delete 1 selected project?' : `Delete ${count} selected projects?`;
    if (!confirm(msg)) return;
    const ids = Array.from(Home.selectedProjectIds);
    for (const id of ids) {
      await Storage.del('projects', id);
    }
    Home.selectedProjectIds.clear();
    Home.setSelectionMode(false);
    await Home.refreshProjects();
    toast(`Deleted ${count} project${count > 1 ? 's' : ''}`);
  },
  card(p, onOpen, onDelete) {
    const el = document.createElement('div');
    el.className = 'pcard';
    el.dataset.id = p.id;
    if (Home.selectedProjectIds.has(p.id)) el.classList.add('selected');
    el.innerHTML = `
      <div class="pcard-check" title="Select project">
        <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="thumb"></div>
      <div class="meta">
        <div class="pname"></div>
        <div class="psub"></div>
      </div>
      <button class="pmenu">⋮</button>`;
    el.querySelector('.pname').textContent = p.name;
    el.querySelector('.psub').textContent = `${p.width}×${p.height} · ${p.fps}fps · ${fmtClock(p.duration)}`;
    const thumb = el.querySelector('.thumb');
    if (p.thumb) { const img = new Image(); img.src = p.thumb; thumb.appendChild(img); }
    else thumb.textContent = p.name.slice(0, 1).toUpperCase();
    Home.menuify(el, p, onDelete);

    const chk = el.querySelector('.pcard-check');
    if (chk) {
      chk.addEventListener('click', e => {
        e.stopPropagation();
        Home.toggleSelect(p.id);
      });
    }

    let pressTimer = null;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.pmenu') || e.target.closest('.pcard-check')) return;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        Home.toggleSelect(p.id);
      }, 420);
    });
    const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    el.addEventListener('pointerup', cancelPress);
    el.addEventListener('pointerleave', cancelPress);
    el.addEventListener('pointercancel', cancelPress);

    el.addEventListener('click', e => {
      if (e.target.closest('.pmenu') || e.target.closest('.pcard-check')) return;
      if (Home.selectionMode || e.ctrlKey || e.metaKey || e.shiftKey) {
        Home.toggleSelect(p.id);
        return;
      }
      onOpen();
    });
    return el;
  },
  menuify(el, p, onDelete) {
    const btn = el.querySelector('.pmenu');
    btn.onclick = e => {
      e.stopPropagation();
      showContext(e.clientX, e.clientY, [
        ['Open', () => Editor.open(p)],
        ['Select', () => Home.toggleSelect(p.id)],
        ['Rename', () => { const n = prompt('Project name', p.name); if (n) { p.name = n; Storage.put('projects', p); Home.refreshProjects(); } }],
        ['Export XML...', () => { if (typeof AMXML !== 'undefined') AMXML.download(p); }],
        ['Export package...', () => { Home._exportP = p; Window$exportPackage(p); }],
        ['Duplicate', async () => { const c = deep(p); c.id = uid(); c.name += ' copy'; c.updated = Date.now(); await Storage.put('projects', c); Home.refreshProjects(); }],
        ['Delete', () => onDelete(), 'warn']
      ]);
    };
  },
  async refreshElements() {
    const els = (await Storage.all('elements')).sort((a, b) => b.created - a.created);
    const grid = document.getElementById('element-grid');
    grid.innerHTML = '';
    if (!els.length) grid.innerHTML = `<p class="hint">No saved elements. In the editor, hold a layer menu ⋮ → "Save as Element".</p>`;
    for (const e of els) {
      const card = document.createElement('div');
      card.className = 'pcard';
      card.innerHTML = `<div class="thumb"></div><div class="meta"><div class="pname"></div><div class="psub">${e.type} element</div></div>`;
      card.querySelector('.pname').textContent = e.name;
      if (e.thumb) { const img = new Image(); img.src = e.thumb; card.querySelector('.thumb').appendChild(img); }
      card.onclick = () => Editor.addElementFromHome(e);
      const x = document.createElement('button');
      x.className = 'pmenu'; x.textContent = '⋮';
      x.onclick = async ev => { ev.stopPropagation(); await Storage.del('elements', e.id); Home.refreshElements(); };
      card.appendChild(x);
      grid.appendChild(card);
    }
  },
  async newProjectDialog() {
    const first = { name: 'New Project', width: 1920, height: 1080, fps: 30, bg: '#000000', duration: 10 };
    Modals.open('m-settings');
    Settings.fill(first, true);
    Settings.onSave = async p => {
      if (!document.getElementById('editor-screen').classList.contains('active')) {
        // creating from home
        const proj = createProject(p);
        proj.updated = Date.now();
        await Storage.put('projects', proj);
        Settings.onSave = null;
        Modals.close('m-settings');
        Home.refreshProjects();
        Editor.open(proj);
      }
    };
  }
};

// context menu helper
function showContext(x, y, items) {
  const ctx = document.getElementById('m-layer');
  ctx.innerHTML = '';
  for (const [label, fn, cls] of items) {
    const b = document.createElement('button');
    b.textContent = label; if (cls) b.className = cls;
    b.onclick = () => { ctx.hidden = true; fn(); };
    ctx.appendChild(b);
  }
  ctx.hidden = false;
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.min(x, window.innerWidth - r.width - 10) + 'px';
  ctx.style.top = Math.min(y, window.innerHeight - r.height - 10) + 'px';
}

/* package export from home */
function Window$exportPackage(p) {
  const blob = new Blob([JSON.stringify(p)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(p.name.replace(/\s+/g, '_') + '.alightproj', url);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// home tabs
document.querySelectorAll('.home-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.home-tab').forEach(t => t.classList.toggle('active', t === tab));
  document.getElementById('home-projects').hidden = tab.dataset.tab !== 'projects';
  document.getElementById('home-elements').hidden = tab.dataset.tab !== 'elements';
  if (tab.dataset.tab !== 'projects') Home.setSelectionMode(false);
}));

// multi-select batch actions
const btnSelectMode = document.getElementById('btn-select-mode');
if (btnSelectMode) btnSelectMode.addEventListener('click', () => Home.setSelectionMode(!Home.selectionMode));

const btnSelectAll = document.getElementById('btn-select-all');
if (btnSelectAll) btnSelectAll.addEventListener('click', () => Home.selectAll());

const btnDeleteSelected = document.getElementById('btn-delete-selected');
if (btnDeleteSelected) btnDeleteSelected.addEventListener('click', () => Home.deleteSelected());

const btnCancelSelect = document.getElementById('btn-cancel-select');
if (btnCancelSelect) btnCancelSelect.addEventListener('click', () => Home.setSelectionMode(false));

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && Home.selectionMode) {
    Home.setSelectionMode(false);
  }
});

document.getElementById('fab-new').addEventListener('click', () => Home.newProjectDialog());
document.getElementById('btn-import-project').addEventListener('click', () => document.getElementById('file-import').click());
document.getElementById('file-import').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  await Home.handleImportFile(f);
});

Home.handleImportFile = async function(f) {
  try {
    const rawText = await readDataURLBlob(f);
    const trimmed = rawText.trim();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<scene') || trimmed.startsWith('<shape') || trimmed.startsWith('<element')) {
      if (typeof AMXML === 'undefined') throw new Error('XML Engine not loaded');
      const { project, missingFonts } = AMXML.import(trimmed);
      project.id = typeof uid === 'function' ? uid() : 'p_' + Date.now();
      project.updated = Date.now();
      await Storage.put('projects', project);
      await Home.refreshProjects();
      toast('XML Project imported');

      if (missingFonts && missingFonts.length) {
        AMXML.showMissingFontsDialog(missingFonts, () => {
          Editor.open(project);
        });
      } else {
        Editor.open(project);
      }
      return;
    }

    const p = JSON.parse(trimmed);
    if (!p || !p.layers || !p.width) throw new Error('Invalid project structure');
    p.id = typeof uid === 'function' ? uid() : 'p_' + Date.now();
    p.updated = Date.now();
    await Storage.put('projects', p);
    await Home.refreshProjects();
    toast('Project imported');
    Editor.open(p);
  } catch (err) {
    console.error('Import error:', err);
    toast('Invalid project file: ' + (err.message || ''));
  }
};

// Drag and drop on home screen
const homeScr = document.getElementById('home-screen');
if (homeScr) {
  homeScr.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
  homeScr.addEventListener('drop', async e => {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) await Home.handleImportFile(f);
  });
}
function readDataURLBlob(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); }); }
