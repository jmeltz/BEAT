# BEAT

## Update 2/7/25 - BEAT is now available in the [![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/beat/omimamelfkooloclbcofnliamomdfkan)

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/jmeltz)

BEAT (Browser Extension for Account Toggling) lets you save, switch, and manage multiple SoundCloud sessions without bouncing through logins each time. It lives in the SoundCloud navbar and restores your session with one click.

## Features

- Save your current SoundCloud session as a named profile.
- Switch profiles instantly from the SoundCloud header.
- Local Sign Out that clears cookies and storage without hitting SoundCloud logout.
- Import/export profiles for backup or migration.

## Quickstart

1) Clone the repo (or download as .zip and extract)
2) Open Chrome and go to `chrome://extensions`.
3) Enable **Developer mode** (top right).
4) Click **Load unpacked** and select the folder.
5) Open SoundCloud and use the **Accounts** pill in the top bar.
6) **IMPORTANT**: Avoid using SoundCloud’s built-in **Logout** button, as this invalides the stored session. Use the **Local Sign Out** button in the **Accounts** pill instead instead.

## How it works

BEAT stores SoundCloud cookies and site storage (local/session storage) per profile. When you switch, it restores cookies + storage and reloads SoundCloud tabs to apply the session.

## Usage

- **Save profile:** Click **Accounts** -> **Save Current Session** and name it.
- **Switch profile:** Click a profile in the list.
- **Rename/delete:** Use the icons on a profile row.
- **Local Sign Out:** Clears SoundCloud cookies/storage locally without calling `/logout`.
- **Export/import:** Use the import/export buttons in the extension popup.

## Development

No build step required. Edit files directly and reload the extension in `chrome://extensions`.

## License

MIT
