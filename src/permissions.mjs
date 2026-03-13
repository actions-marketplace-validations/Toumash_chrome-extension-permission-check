/**
 * Chrome Extension permissions that trigger a user-facing warning dialog.
 *
 * When an extension update adds any of these permissions, Chrome will:
 * 1. Disable the extension automatically
 * 2. Show the user a dialog asking them to re-approve
 * 3. Keep the extension disabled until the user explicitly accepts
 *
 * Source: https://developer.chrome.com/docs/extensions/reference/permissions-list
 * Last updated: 2025-04-29
 */
export const PERMISSIONS_WITH_WARNINGS = new Map([
  ['accessibilityFeatures.modify', 'Change your accessibility settings'],
  ['accessibilityFeatures.read', 'Read your accessibility settings'],
  ['bookmarks', 'Read and change your bookmarks'],
  ['clipboardRead', 'Read data you copy and paste'],
  ['clipboardWrite', 'Modify data you copy and paste'],
  [
    'contentSettings',
    "Change your settings that control websites' access to features such as cookies, JavaScript, plugins, geolocation, microphone, camera etc.",
  ],
  ['debugger', 'Access the page debugger backend + Read and change all your data on all websites'],
  ['declarativeNetRequest', 'Block content on any page'],
  ['declarativeNetRequestFeedback', 'Read your browsing history'],
  ['desktopCapture', 'Capture content of your screen'],
  ['downloads', 'Manage your downloads'],
  ['downloads.open', 'Manage your downloads'],
  ['downloads.ui', 'Manage your downloads'],
  ['favicon', 'Read the icons of the websites you visit'],
  ['geolocation', 'Detect your physical location'],
  ['history', 'Read and change your browsing history on all signed-in devices'],
  ['identity.email', 'Know your email address'],
  ['management', 'Manage your apps, extensions, and themes'],
  ['nativeMessaging', 'Communicate with cooperating native applications'],
  ['notifications', 'Display notifications'],
  ['pageCapture', 'Read and change all your data on all websites'],
  ['privacy', 'Change your privacy-related settings'],
  ['proxy', 'Read and change all your data on all websites'],
  ['readingList', 'Read and change entries in the reading list'],
  ['sessions', 'Read your browsing history on all your signed-in devices'],
  ['system.storage', 'Identify and eject storage devices'],
  ['tabCapture', 'Read and change all your data on all websites'],
  ['tabGroups', 'View and manage your tab groups'],
  ['tabs', 'Read your browsing history'],
  ['topSites', 'Read a list of your most frequently visited websites'],
  ['ttsEngine', 'Read all text spoken using synthesized speech'],
  ['webAuthenticationProxy', 'Read and change all your data on all websites'],
  ['webNavigation', 'Read your browsing history'],
]);
