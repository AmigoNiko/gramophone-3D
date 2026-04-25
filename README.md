# Gramophone — Interactive 3D Music Player

A photorealistic 3D gramophone built with Three.js. Drop a disc on the platter, open the lid, press play. Now with **Google sign-in** to use your own YouTube library as records.

## Features

- Real-time 3D gramophone rendered with Three.js (custom PBR materials, baked textures, dynamic lighting).
- Interactions happen on the model itself: click the lid to open/close, click the power button to switch on, click the second button to swap 33/45 RPM, click the record to play/pause.
- Synthetic music-note particle visualiser rising from the disc.
- Shelf of hand-crafted demo records with multi-track albums and drag-to-platter support.
- "Craft your own record" modal (YouTube URL → disc, persisted in localStorage).
- **YouTube integration (optional)**: sign in with your Google account to:
  - Use your **YouTube playlists** as multi-track albums on the shelf.
  - Browse **Quick Suggestions** built from your liked videos + home activity.
  - **Search YouTube** and drop any result on the platter.
  - Single-track discs always come from search or suggestions; only your own playlists can be multi-track (per spec).

## Project structure

```
index.html              static entry
styles.css              all visual styling
gagata5.glb             the 3D model (put your GLB here)
src/
  app.js                main gramophone (classic script; uses THREE globals)
  config.js             <-- paste your OAuth Client ID + API key here
  auth.js               Google Identity Services OAuth2 token flow
  youtube.js            YouTube Data API v3 wrapper
  remote-shelf.js       swaps the shelf with YT content when signed in
  bootstrap.js          ES-module entry (wires the remote layer)
package.json            `npm run dev` → local static server
vercel.json             cache headers for deployment
```

## Quick start (local)

```bash
npm run dev
# then open http://localhost:5500
```

That's it — the gramophone works offline with the built-in demo records. To enable sign-in, follow the next section.

## Enabling YouTube / Google sign-in

1. Open **[Google Cloud Console](https://console.cloud.google.com/)**, create (or select) a project.

2. **Enable the API**: *APIs & Services → Enable APIs → search "YouTube Data API v3" → Enable*.

3. **Create an API key**: *APIs & Services → Credentials → Create Credentials → API key*. Copy it. Strongly recommended: restrict the key to HTTP referrers matching your origin (`http://localhost:5500/*`, `https://your-domain.vercel.app/*`).

4. **Create an OAuth Client ID**:
   - *APIs & Services → Credentials → Create Credentials → OAuth client ID*.
   - Application type: **Web application**.
   - Authorized JavaScript origins — add **every** origin you'll run the app from, exactly as the browser will see them, e.g.:
     - `http://localhost:5500`
     - `https://your-domain.vercel.app`
   - Authorized redirect URIs — leave empty (the token flow doesn't need one).
   - Copy the resulting Client ID (ends with `.apps.googleusercontent.com`).

5. **Configure the OAuth consent screen** (the first time you create credentials):
   - User type: External.
   - Add the scopes `https://www.googleapis.com/auth/youtube.readonly` and `https://www.googleapis.com/auth/userinfo.profile`.
   - While the app is in "Testing" mode, add your Gmail as a test user.

6. Open `src/config.js` and paste both values:

   ```js
   export const YT_CLIENT_ID = '1234567890-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com';
   export const YT_API_KEY   = 'AIzaSy...';
   ```

7. Restart the dev server and reload the page. Click **Sign in with Google** (top-right).

## Deployment

The whole app is static — no bundler, no backend. Push the folder to any static host:

### Vercel
```bash
npx vercel
```
(First deploy: confirm defaults. The included `vercel.json` sets sensible cache headers for the GLB.)

### Netlify
Drag the folder onto [app.netlify.com](https://app.netlify.com/drop), or use `netlify deploy`.

### GitHub Pages
Push to a repo, enable Pages → Branch: `main`, folder: `/ (root)`.

After deploying, **add your production origin** (e.g. `https://gramophone.vercel.app`) to:
- the OAuth Client ID's Authorized JavaScript origins
- the API key's HTTP referrer restrictions (if you set any)

Otherwise Google will refuse the sign-in.

## Limitations (read this)

- **There is no public "YouTube Music" API.** This app uses the official **YouTube Data API v3**. Most YouTube Music tracks are also regular YouTube videos (the `<artist> - Topic` channels are YT Music uploads), so playback works via the same IFrame player.
- We cannot read your YT Music home feed, your recently-played history, or your YT Music library directly. "Suggestions" here = your **liked videos** + your **YouTube home activity feed** — the closest official equivalents.
- YouTube Data API defaults to a **10,000 units/day** quota. Each search call costs 100 units; playlist / video reads cost 1 unit each. For personal use this is more than enough.
- OAuth tokens are held in memory only — no cookies, no session storage, nothing is sent to any server but Google's.

## Controls cheat sheet

| Gesture | Result |
|---|---|
| Click the **lid** | Open / close the lid (must be open to play) |
| Click the **power button** | Toggle power on/off |
| Click the **other button** | Toggle 33 ⇌ 45 RPM |
| Click / drop a shelf record | Drop it on the platter |
| Click the **record** | Play / pause |
| Scroll over the volume bar | Fine volume up/down |
| Sign in with Google | Replace shelf with your YouTube content |

## License

MIT for the code. The included `gagata5.glb` is the author's; replace with your own GLB if you want to redistribute.
