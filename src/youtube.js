/*
  =====================================================================
  youtube.js — YouTube Data API v3 wrapper (browser, no gapi.client).

  Uses plain fetch() with the OAuth bearer token from auth.js for
  endpoints that read the signed-in user's content, and falls back to
  the public API key for anonymous reads (search, video lookups).

  Quota notes (default 10,000 units/day per project):
    - playlists.list, playlistItems.list, videos.list  →  1 unit each
    - search.list                                      →  100 units each
    - activities.list                                  →  1 unit each
  =====================================================================
*/

import { YT_API_KEY } from './config.js';
import { getAccessToken } from './auth.js';

const BASE = 'https://www.googleapis.com/youtube/v3';

function qs(params){
  const sp = new URLSearchParams();
  for(const [k, v] of Object.entries(params)){
    if(v === undefined || v === null || v === '') continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return sp.toString();
}

async function request(path, params = {}, { auth = false } = {}){
  const token = auth ? getAccessToken() : null;
  const merged = { ...params };
  // Always send the API key; on authorized requests it still counts
  // against the project quota alongside the access token.
  if(YT_API_KEY && !YT_API_KEY.startsWith('REPLACE_')) merged.key = YT_API_KEY;

  const res = await fetch(`${BASE}${path}?${qs(merged)}`, {
    headers: token ? { Authorization: 'Bearer ' + token } : undefined
  });
  if(!res.ok){
    let msg = res.status + ' ' + res.statusText;
    try{
      const j = await res.json();
      if(j && j.error && j.error.message) msg += ' — ' + j.error.message;
    }catch(e){}
    throw new Error('YouTube API: ' + msg);
  }
  return res.json();
}

// Pick the best thumbnail URL out of a `snippet.thumbnails` object.
export function bestThumb(thumbs, target = 'medium'){
  if(!thumbs) return '';
  return (
    thumbs[target]?.url ||
    thumbs.medium?.url  ||
    thumbs.high?.url    ||
    thumbs.default?.url ||
    thumbs.standard?.url||
    thumbs.maxres?.url  ||
    ''
  );
}

// ---------- Authenticated endpoints (signed-in user's data) ----------

/** List the signed-in user's playlists (paginated). */
export async function listMyPlaylists({ maxResults = 50 } = {}){
  const pages = [];
  let pageToken = '';
  do{
    const j = await request('/playlists', {
      part: 'snippet,contentDetails',
      mine: true,
      maxResults,
      pageToken
    }, { auth: true });
    pages.push(...(j.items || []));
    pageToken = j.nextPageToken || '';
  } while(pageToken && pages.length < 200); // safety cap
  return pages;
}

/** List items (videos) inside a playlist. */
export async function listPlaylistItems(playlistId, { maxResults = 50, max = 100 } = {}){
  const pages = [];
  let pageToken = '';
  do{
    const j = await request('/playlistItems', {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults,
      pageToken
    }, { auth: true });
    pages.push(...(j.items || []));
    pageToken = j.nextPageToken || '';
  } while(pageToken && pages.length < max);
  return pages;
}

/** The user's Liked Videos — served as a special playlist id = "LL". */
export async function listLikedVideos({ max = 50 } = {}){
  // The signed-in user's liked videos live in a playlist discoverable via
  // channels.list?mine=true → contentDetails.relatedPlaylists.likes.
  const me = await request('/channels', {
    part: 'contentDetails',
    mine: true
  }, { auth: true });
  const likedId = me.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
  if(!likedId) return [];
  return listPlaylistItems(likedId, { max });
}

/** Recent activity from the signed-in user (uploads from subscriptions, etc). */
export async function listHomeSuggestions({ max = 25 } = {}){
  const j = await request('/activities', {
    part: 'snippet,contentDetails',
    home: true,
    maxResults: Math.min(max, 50)
  }, { auth: true }).catch(() => null);
  return (j && j.items) || [];
}

// ---------- Public endpoints (search, video lookups) ----------

/** Public search — returns at most 20 video results. Uses 100 quota units. */
export async function searchVideos(query, { max = 20 } = {}){
  const j = await request('/search', {
    part: 'snippet',
    q: query,
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: Math.min(max, 50)
  });
  return j.items || [];
}

// ---------- Converters: API items → gramophone tracks ----------

function extractVideoIdFromItem(item){
  // Different endpoints return the videoId on slightly different paths.
  return (
    item?.contentDetails?.videoId ||
    item?.snippet?.resourceId?.videoId ||
    item?.id?.videoId ||
    item?.id ||
    null
  );
}

export function itemToTrack(item){
  const videoId = extractVideoIdFromItem(item);
  if(!videoId) return null;
  const s = item.snippet || {};
  const title = s.title || 'Untitled';
  const channel = s.videoOwnerChannelTitle || s.channelTitle || '';
  // Hide autogen topic suffixes ("X - Topic" → "X") so labels read nicer.
  const artist = channel.replace(/\s*-\s*Topic\s*$/i, '');
  const thumbnail = bestThumb(s.thumbnails, 'medium') ||
                    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return { videoId, title, artist, thumbnail };
}

// Colour helper: pick a pleasing label colour from a playlist id. Stable
// per-id so the same album always gets the same colour.
const PALETTE = [
  '#6B1212', '#1a2a48', '#0d3b2e', '#4a1f6b',
  '#1a1a2e', '#6b3a12', '#2c1810', '#1a0a2e',
  '#2b4060', '#4b2b60', '#2b604b', '#603a2b'
];
export function stableColor(seed){
  let h = 0;
  for(let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
