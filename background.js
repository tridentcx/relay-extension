// Show a subtle badge dot when local bookmarks change since last sync
// The popup clears it after a successful sync

async function markPending() {
  const { autoSync } = await chrome.storage.local.get('autoSync');
  if (autoSync) {
    chrome.action.setBadgeText({ text: '·' });
    chrome.action.setBadgeBackgroundColor({ color: '#0a84ff' });
  }
}

chrome.bookmarks.onCreated.addListener(markPending);
chrome.bookmarks.onRemoved.addListener(markPending);
chrome.bookmarks.onChanged.addListener(markPending);
chrome.bookmarks.onMoved.addListener(markPending);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') console.log('Relay installed.');
});
