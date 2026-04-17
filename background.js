'use strict';

// Badge dot when bookmarks change and auto-sync is on
async function markPending() {
  const { autoSync } = await chrome.storage.local.get('autoSync');
  if (autoSync) {
    chrome.action.setBadgeText({ text: '·' });
    chrome.action.setBadgeBackgroundColor({ color: '#4361ee' });
  }
}

chrome.bookmarks.onCreated.addListener(markPending);
chrome.bookmarks.onRemoved.addListener(markPending);
chrome.bookmarks.onChanged.addListener(markPending);
chrome.bookmarks.onMoved.addListener(markPending);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') console.log('Relay installed.');
});
