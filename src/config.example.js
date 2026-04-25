/*
  Copy to `config.js` for local dev, or set YT_CLIENT_ID + YT_API_KEY on Vercel
  (see README). Placeholders below keep sign-in disabled until configured.
*/

export const YT_CLIENT_ID = 'REPLACE_WITH_YOUR_CLIENT_ID.apps.googleusercontent.com';
export const YT_API_KEY   = 'REPLACE_WITH_YOUR_API_KEY';

export const YT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

export function hasValidConfig(){
  return (
    typeof YT_CLIENT_ID === 'string' &&
    YT_CLIENT_ID.endsWith('.apps.googleusercontent.com') &&
    !YT_CLIENT_ID.startsWith('REPLACE_') &&
    typeof YT_API_KEY === 'string' &&
    !YT_API_KEY.startsWith('REPLACE_') &&
    YT_API_KEY.length > 10
  );
}
