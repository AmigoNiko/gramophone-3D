/*
  =====================================================================
  auth.js — Google OAuth2 (Identity Services) token flow.

  Uses the modern GIS library (google.accounts.oauth2.initTokenClient).
  The token is kept in memory only — no cookies, no server round-trips.
  The page just needs to be served over http(s); it works fine on a
  static host like Vercel / Netlify / GitHub Pages.
  =====================================================================
*/

import { YT_CLIENT_ID, YT_SCOPES, hasValidConfig } from './config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let userProfile = null;           // { name, picture, sub } or null
let gisReady = false;
const listeners = new Set();

// Load the Google Identity Services library once, lazily. Returns a
// promise that resolves when window.google.accounts.oauth2 is available.
function loadGis(){
  if(gisReady) return Promise.resolve();
  if(window.google && window.google.accounts && window.google.accounts.oauth2){
    gisReady = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    // Reuse if already injected (maybe HMR / double-import)
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const onload = () => {
      if(window.google && window.google.accounts && window.google.accounts.oauth2){
        gisReady = true;
        resolve();
      } else {
        reject(new Error('Google Identity Services failed to initialise.'));
      }
    };
    if(existing){ existing.addEventListener('load', onload); return; }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true; s.defer = true;
    s.onload = onload;
    s.onerror = () => reject(new Error('Failed to load Google Identity Services from ' + GIS_SRC));
    document.head.appendChild(s);
  });
}

function initTokenClient(){
  if(tokenClient) return tokenClient;
  if(!window.google || !window.google.accounts || !window.google.accounts.oauth2){
    throw new Error('GIS not loaded.');
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: YT_CLIENT_ID,
    scope: YT_SCOPES,
    prompt: '',
    callback: handleTokenResponse,
  });
  return tokenClient;
}

async function handleTokenResponse(resp){
  if(!resp || resp.error){
    notify({ signedIn: false, error: resp && resp.error ? resp.error_description || resp.error : 'Sign-in cancelled' });
    return;
  }
  accessToken    = resp.access_token;
  tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3600) - 30) * 1000;
  userProfile    = null; // fetched below
  try{
    userProfile = await fetchUserProfile(accessToken);
  }catch(e){
    // Non-fatal — we still consider the user signed in.
    console.warn('[auth] Could not fetch user profile:', e);
  }
  notify({ signedIn: true });
}

async function fetchUserProfile(token){
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if(!res.ok) throw new Error('userinfo ' + res.status);
  const j = await res.json();
  return {
    name:    j.name || j.given_name || 'You',
    picture: j.picture || '',
    sub:     j.sub || ''
  };
}

function notify(detail){
  for(const fn of listeners) { try{ fn(detail); }catch(e){ console.error(e); } }
}

// ----- Public API ----------------------------------------------------

export function isConfigured(){ return hasValidConfig(); }

export function isSignedIn(){
  return !!accessToken && Date.now() < tokenExpiresAt;
}

export function getUser(){ return userProfile; }

export function getAccessToken(){
  if(!isSignedIn()) return null;
  return accessToken;
}

// Register a listener. Called with { signedIn:boolean, error?:string }.
export function onSignedInChange(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Start sign-in. Returns a promise that resolves when the token callback
// has fired (either success or user-cancel).
export async function signIn(){
  if(!hasValidConfig()){
    throw new Error(
      'YouTube integration is not configured. Edit src/config.js and add ' +
      'your OAuth Client ID and YouTube Data API key.'
    );
  }
  await loadGis();
  initTokenClient();
  tokenClient.requestAccessToken({ prompt: userProfile ? '' : 'consent' });
}

export function signOut(){
  const tokenToRevoke = accessToken;
  accessToken = null;
  tokenExpiresAt = 0;
  userProfile = null;
  if(tokenToRevoke && window.google && window.google.accounts && window.google.accounts.oauth2){
    try{
      window.google.accounts.oauth2.revoke(tokenToRevoke, () => {});
    }catch(e){ /* ignore */ }
  }
  notify({ signedIn: false });
}
