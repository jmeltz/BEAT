# BEAT

BEAT (Browser Extension for Account Toggling) lets you save, switch, and manage multiple SoundCloud sessions without bouncing through logins each time. It lives in the SoundCloud navbar and restores your session with one click.

## Features

- Save your current SoundCloud session as a named profile.
- Switch profiles instantly from the SoundCloud header.
- Local Sign Out that clears cookies and storage without hitting SoundCloud logout.
- Import/export profiles for backup or migration.

## Quickstart

1) Clone the repo.
2) Open Chrome and go to `chrome://extensions`.
3) Enable **Developer mode** (top right).
4) Click **Load unpacked** and select the `soundcloud-account-switcher` folder.
5) Open SoundCloud and use the **Accounts** pill in the top bar.

## How it works

BEAT stores SoundCloud cookies and site storage (local/session storage) per profile. When you switch, it restores cookies + storage and reloads SoundCloud tabs to apply the session.

## Usage

- **Save profile:** Click **Accounts** -> **Save Current Session** and name it.
- **Switch profile:** Click a profile in the list.
- **Rename/delete:** Use the icons on a profile row.
- **Local Sign Out:** Clears SoundCloud cookies/storage locally without calling `/logout`.
- **Export/import:** Use the import/export buttons in the extension popup.

## Notes

- Avoid using SoundCloud’s built-in **Logout** if you plan to switch back to a saved profile. Use **Local Sign Out** instead.
- If switching feels out of sync after a new login, re-save the profile once.

## Development

No build step required. Edit files directly and reload the extension in `chrome://extensions`.

## License

MIT
