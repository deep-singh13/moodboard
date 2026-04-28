'use strict';

const API = 'https://moodboard-zyji.onrender.com/api';

// Shared state for the current page
const page = { url: '', type: 'link', imageUrl: '' };

// ── Helpers ──────────────────────────────────────────────────────────────────

function show(stateName) {
  ['loading', 'no-page', 'ready', 'success', 'error'].forEach((s) => {
    const el = document.getElementById(`state-${s}`);
    if (el) el.style.display = s === stateName ? 'block' : 'none';
  });
}

function detectType(url) {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('youtube.com') || hostname === 'youtu.be') return 'youtube';
    if (hostname.includes('substack.com')) return 'substack';
    return 'link';
  } catch {
    return 'link';
  }
}

function setSaveError(msg) {
  const el = document.getElementById('save-error');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

// ── Init: fetch current tab + OG data ───────────────────────────────────────

async function init() {
  show('loading');
  setSaveError('');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? '';

    // Can't save browser-internal pages
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      show('no-page');
      return;
    }

    page.url  = url;
    page.type = detectType(url);
    page.imageUrl = '';

    // Ask the moodboard server to scrape OG meta for us
    const res = await fetch(`${API}/fetch-og?url=${encodeURIComponent(url)}`);
    const og  = await res.json();

    // Thumbnail
    const img         = document.getElementById('thumb');
    const placeholder = document.getElementById('thumb-placeholder');

    if (og.image) {
      img.onload  = () => {
        page.imageUrl = og.image;
        img.style.display = 'block';
        placeholder.style.display = 'none';
      };
      img.onerror = () => {
        // keep placeholder visible; imageUrl stays ''
      };
      img.src = og.image;
    }

    // Title field
    document.getElementById('title-input').value =
      og.title || new URL(url).hostname;

    // Type badge
    const badge = document.getElementById('type-badge');
    const labels = { youtube: '▶ YouTube', substack: 'Substack', link: '🔗 Link' };
    badge.textContent  = labels[page.type];
    badge.dataset.type = page.type;

    show('ready');
    document.getElementById('title-input').focus();
    document.getElementById('title-input').select();

  } catch (err) {
    document.getElementById('error-text').textContent =
      "Couldn't reach your moodboard server. Check your connection.";
    show('error');
  }
}

// ── Save ─────────────────────────────────────────────────────────────────────

async function save() {
  const btn   = document.getElementById('save-btn');
  const title = document.getElementById('title-input').value.trim();
  const note  = document.getElementById('note-input').value.trim() || null;

  setSaveError('');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    let hostname = '';
    try { hostname = new URL(page.url).hostname; } catch {}

    const res = await fetch(`${API}/items`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:       crypto.randomUUID(),
        type:     page.type,
        url:      page.url,
        title:    title || hostname,
        subtitle: hostname,
        imageUrl: page.imageUrl || undefined,
        size:     320,
        addedAt:  new Date().toISOString(),
        note,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    show('success');

  } catch {
    btn.disabled = false;
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg> Save to Moodboard';
    setSaveError('Failed to save — check your connection and try again.');
  }
}

// ── Wire up events after DOM is ready ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('save-btn').addEventListener('click', save);

  document.getElementById('retry-btn').addEventListener('click', init);

  // Cmd/Ctrl + Enter also triggers save when a field is focused
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  });
});
