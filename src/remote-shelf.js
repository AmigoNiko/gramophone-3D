/*
  =====================================================================
  remote-shelf.js — YouTube-backed shelf + sign-in UI.

  Subscribes to auth state. When the user signs in:
    - Fetches their playlists → "Albums" section (records with >1 track).
    - Fetches a suggestions feed → "Suggestions" section (single-track).
    - Swaps the gramophone's disk array.
    - Enables the search panel.
  When the user signs out:
    - Restores the built-in demo records.

  Expects window.GRAMOPHONE (exposed by src/app.js) to provide:
    state, placeDisk, setDisks, resetDisks, stopPlayback, rebuildShelf.
  =====================================================================
*/

import * as Auth from './auth.js';
import * as YT   from './youtube.js';

const SECTIONS = ['albums', 'suggestions', 'search'];

const cache = {
  playlists: null,        // array of disks (lazy tracks)
  suggestions: null,      // array of disks (single track)
  searchResults: [],      // array of disks (single track)
  lastQuery: '',
};

let currentSection = 'albums';
let busyToken = 0;        // bumps on every rebuild to kill stale async

// ---------- DOM wiring ----------

function el(id){ return document.getElementById(id); }

function setAuthUi({ signedIn, error }){
  const panel    = el('authPanel');
  const signedOut= el('authSignedOut');
  const signedInN= el('authSignedIn');
  const avatar   = el('authAvatar');
  const nameEl   = el('authName');
  const errEl    = el('authError');
  if(!panel) return;

  if(error){
    errEl.textContent = error;
    errEl.classList.add('show');
    clearTimeout(setAuthUi._errT);
    setAuthUi._errT = setTimeout(() => errEl.classList.remove('show'), 4000);
  }

  if(signedIn){
    const u = Auth.getUser();
    signedOut.style.display = 'none';
    signedInN.style.display = 'flex';
    if(avatar) avatar.src = u?.picture || '';
    if(nameEl) nameEl.textContent = u?.name || 'Signed in';
    setTabsVisible(true);
    enableSearchTrigger(true);
  } else {
    signedOut.style.display = 'flex';
    signedInN.style.display = 'none';
    setTabsVisible(false);
    enableSearchTrigger(false);
    closeSearchPanel();
  }
}

function setTabsVisible(visible){
  const tabs = el('shelfTabs');
  if(tabs) tabs.classList.toggle('visible', !!visible);
}

function enableSearchTrigger(on){
  const addBtn = el('addBtn');
  if(!addBtn) return;
  addBtn.dataset.mode = on ? 'search' : 'craft';
  addBtn.title = on ? 'Search YouTube' : 'Craft your own record';
  addBtn.querySelector('span').textContent = on ? '\u2315' : '+';
}

function bindUi(){
  const signInBtn = el('signInBtn');
  const signOutBtn= el('signOutBtn');
  if(signInBtn) signInBtn.addEventListener('click', async ()=>{
    try{ await Auth.signIn(); }
    catch(err){ setAuthUi({ signedIn: false, error: err.message || String(err) }); }
  });
  if(signOutBtn) signOutBtn.addEventListener('click', ()=>{
    Auth.signOut();
  });

  // Section tabs
  el('shelfTabs')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-section]');
    if(!btn) return;
    const s = btn.dataset.section;
    if(!SECTIONS.includes(s) || s === currentSection) return;
    currentSection = s;
    updateTabActive();
    if(s === 'search'){
      openSearchPanel();
      renderSearch(); // last results (may be empty)
    } else {
      closeSearchPanel();
      render();
    }
  });

  // Search
  const searchInput = el('searchInput');
  const searchForm  = el('searchForm');
  if(searchForm) searchForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const q = searchInput.value.trim();
    if(!q) return;
    await doSearch(q);
  });

  // If the + button is in 'search' mode, open search panel on click.
  const addBtn = el('addBtn');
  if(addBtn){
    addBtn.addEventListener('click', (e)=>{
      if(addBtn.dataset.mode === 'search'){
        e.stopPropagation();
        e.preventDefault();
        currentSection = 'search';
        updateTabActive();
        openSearchPanel();
        searchInput?.focus();
      }
    }, true); // capture so we win over app.js's openModal
  }
}

function updateTabActive(){
  el('shelfTabs')?.querySelectorAll('[data-section]').forEach(b=>{
    b.classList.toggle('active', b.dataset.section === currentSection);
  });
}

function openSearchPanel(){ el('searchPanel')?.classList.add('open'); el('searchInput')?.focus(); }
function closeSearchPanel(){ el('searchPanel')?.classList.remove('open'); }

// ---------- Data fetch + disk building ----------

function playlistToDisk(pl){
  const id = 'yt-pl-' + pl.id;
  const thumb = YT.bestThumb(pl.snippet?.thumbnails, 'medium');
  return {
    id,
    title: pl.snippet?.title || 'Untitled album',
    artist: pl.snippet?.channelTitle || 'My library',
    labelColor: YT.stableColor(pl.id),
    // Placeholder thumbnail so the disk card has art before tracks are fetched.
    _thumb: thumb,
    // Tracks are fetched lazily when the disk is actually placed.
    _fetchTracks: async () => {
      const items = await YT.listPlaylistItems(pl.id, { max: 50 });
      const tracks = items.map(YT.itemToTrack).filter(Boolean);
      if(!tracks.length) throw new Error('This album has no playable videos.');
      return tracks;
    }
  };
}

function videoItemToDisk(item){
  const track = YT.itemToTrack(item);
  if(!track) return null;
  return {
    id: 'yt-v-' + track.videoId,
    title: track.title,
    artist: track.artist || 'YouTube',
    labelColor: YT.stableColor(track.videoId),
    _thumb: track.thumbnail,
    tracks: [track]
  };
}

async function ensurePlaylists(){
  if(cache.playlists) return cache.playlists;
  const raw = await YT.listMyPlaylists({ maxResults: 50 });
  cache.playlists = raw.map(playlistToDisk);
  return cache.playlists;
}

async function ensureSuggestions(){
  if(cache.suggestions) return cache.suggestions;
  // Combine liked videos + home activities for a richer "Quick suggestions".
  const [liked, home] = await Promise.all([
    YT.listLikedVideos({ max: 25 }).catch(() => []),
    YT.listHomeSuggestions({ max: 25 }).catch(() => [])
  ]);
  const seen = new Set();
  const out = [];
  for(const item of [...liked, ...home]){
    const disk = videoItemToDisk(item);
    if(!disk) continue;
    if(seen.has(disk.id)) continue;
    seen.add(disk.id);
    out.push(disk);
    if(out.length >= 40) break;
  }
  cache.suggestions = out;
  return out;
}

// ---------- Rendering ----------

function setShelfStatus(msg){
  const G = window.GRAMOPHONE;
  if(!G) return;
  // Render a simple placeholder "card" so the user sees progress/errors.
  const shelf = document.getElementById('shelf');
  if(!shelf) return;
  shelf.innerHTML = `<div class="shelf-status">${msg}</div>`;
}

async function render(){
  const G = window.GRAMOPHONE;
  if(!G) return;
  const token = ++busyToken;
  try{
    if(currentSection === 'albums'){
      setShelfStatus('Loading your albums…');
      const disks = await ensurePlaylists();
      if(token !== busyToken) return;
      G.setDisks(disks);
    } else if(currentSection === 'suggestions'){
      setShelfStatus('Gathering suggestions…');
      const disks = await ensureSuggestions();
      if(token !== busyToken) return;
      G.setDisks(disks);
    } else if(currentSection === 'search'){
      G.setDisks(cache.searchResults);
    }
  }catch(err){
    console.error('[remote-shelf]', err);
    setShelfStatus('Could not load from YouTube — ' + (err.message || 'try again later'));
  }
}

function renderSearch(){
  const G = window.GRAMOPHONE;
  if(!G) return;
  if(!cache.searchResults.length){
    setShelfStatus(cache.lastQuery
      ? `No results for "${cache.lastQuery}".`
      : 'Search YouTube above…');
    return;
  }
  G.setDisks(cache.searchResults);
}

async function doSearch(q){
  cache.lastQuery = q;
  const token = ++busyToken;
  setShelfStatus('Searching YouTube for "' + q + '"…');
  try{
    const items = await YT.searchVideos(q, { max: 20 });
    if(token !== busyToken) return;
    cache.searchResults = items.map(videoItemToDisk).filter(Boolean);
    if(currentSection === 'search') renderSearch();
  }catch(err){
    console.error('[remote-shelf] search failed', err);
    setShelfStatus('Search failed — ' + (err.message || 'try again'));
  }
}

// ---------- Init ----------

function resetState(){
  cache.playlists = null;
  cache.suggestions = null;
  cache.searchResults = [];
  cache.lastQuery = '';
  currentSection = 'albums';
  updateTabActive();
}

function whenGramophoneReady(fn){
  if(window.GRAMOPHONE) return fn();
  const t = setInterval(() => {
    if(window.GRAMOPHONE){ clearInterval(t); fn(); }
  }, 80);
}

export function start(){
  bindUi();
  updateTabActive();

  if(!Auth.isConfigured()){
    const btn = el('signInBtn');
    if(btn){
      btn.title = 'Add your OAuth Client ID in src/config.js first';
      btn.classList.add('disabled');
    }
    return;
  }

  Auth.onSignedInChange((detail)=>{
    setAuthUi(detail);
    whenGramophoneReady(()=>{
      if(detail.signedIn){
        resetState();
        render();
      } else {
        window.GRAMOPHONE?.resetDisks();
      }
    });
  });

  // Initial UI state: signed out.
  setAuthUi({ signedIn: false });
}
