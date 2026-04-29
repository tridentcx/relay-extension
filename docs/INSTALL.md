# Install Relay from GitHub

Relay is distributed as a downloadable extension package through GitHub Releases.

## Download

Download a stable release zip:

[Relay Releases](https://github.com/trident-cx/relay-extension/releases)

Choose the asset named `relay-extension-stable-v<version>.zip`. The version number in the filename is the build you are installing.

After downloading, unzip the file. You should see files such as `manifest.json`, `popup.html`, `sync.js`, and the `icons/` folder.

## Install in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the unzipped Relay folder, not the zip file itself.
5. Pin Relay from the extensions menu if you want quick access.

## Install in Microsoft Edge

1. Open `edge://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the unzipped Relay folder.
5. Pin Relay from the extensions menu if you want quick access.

## Use Relay

1. Open the Relay extension.
2. Create a username and save the generated password somewhere safe.
3. Click **Sync Now** to upload your encrypted bookmark vault.
4. On another browser, install Relay and sign in with the same username and password.
5. Click **Sync Now** to bring your bookmarks over.

Relay cannot reset your password. If you lose it, your encrypted bookmark vault cannot be recovered by Relay.

## Update Relay

Relay includes an update checker in **Settings → Updates**. It compares your installed version to the latest GitHub Release and opens the current download when a new zip is available.

Unpacked browser extensions cannot safely replace their own files in the background, so updates require a short manual reload:

1. Download the newest versioned stable zip from the same link above.
2. Unzip it.
3. Open your browser extensions page.
4. Remove the old unpacked Relay extension.
5. Load the new unzipped Relay folder.
6. Sign in again if the browser asks you to.

Your cloud vault is encrypted and remains available as long as you know your username and password.

## Troubleshooting

- If **Load unpacked** is missing, confirm Developer mode is enabled.
- If the browser says the manifest is missing, select the unzipped folder that directly contains `manifest.json`.
- If sync fails, check your internet connection and try again.
- If sign-in fails on a second browser, confirm the username and password match exactly.
- If you hit a plan limit, upgrade or remove an older browser registration by deleting the account and starting fresh only if you are sure you no longer need the old cloud vault.

For support, open an issue:

[Relay Support](https://github.com/trident-cx/relay-extension/issues)
