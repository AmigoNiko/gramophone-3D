/*
  =====================================================================
  bootstrap.js — ES module entry point loaded by index.html.

  All module-aware code (auth, youtube, remote-shelf) is wired up here.
  The classic-script gramophone lives in src/app.js and exposes its
  integration API on window.GRAMOPHONE.
  =====================================================================
*/

import * as RemoteShelf from './remote-shelf.js';
import { hasValidConfig } from './config.js';

RemoteShelf.start();

if(!hasValidConfig()){
  console.info(
    '%c[gramophone] YouTube integration is disabled.%c\n' +
    'Fill in src/config.js with your OAuth Client ID and YouTube Data API key ' +
    'to enable sign-in, albums, suggestions, and search.',
    'color:#E8B93F;font-weight:bold', 'color:inherit'
  );
}
