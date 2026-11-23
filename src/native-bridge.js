/* Narrow iPhone file-sharing bridge. Account credentials stay in the web client. */
(function attachNativeBridge(root) {
  'use strict';
  const ORIGIN = 'https://watchify-azure.vercel.app';
  const MIB = 1024 * 1024;
  const limits = Object.freeze({ 'application/pdf': 8 * MIB, 'text/csv': 8 * MIB, 'application/json': 32 * MIB });
  const extensions = Object.freeze({ 'application/pdf': '.pdf', 'text/csv': '.csv', 'application/json': '.json' });
  let active = null, generation = 0;
  const failure = (code, message) => Object.assign(new Error(message), { code });
  const cancelled = () => failure('DOWNLOAD_CANCELLED', 'Sharing was cancelled. Your data is unchanged.');
  const handler = () => root.webkit?.messageHandlers?.watchifyDownload;
  const available = () => root.location?.origin === ORIGIN && typeof handler()?.postMessage === 'function';

  function validate({ data, filename, mimeType } = {}) {
    if (!Object.hasOwn(limits, mimeType)) throw failure('DOWNLOAD_INVALID', 'This file format cannot be shared from Watchify.');
    if (typeof filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(filename) || filename.includes('..') || !filename.endsWith(extensions[mimeType])) throw failure('DOWNLOAD_INVALID', 'The export filename is invalid.');
    if (!ArrayBuffer.isView(data) || Object.prototype.toString.call(data) !== '[object Uint8Array]' || !data.byteLength) throw failure('DOWNLOAD_INVALID', 'The export is empty or invalid.');
    if (data.byteLength > limits[mimeType]) throw failure('DOWNLOAD_TOO_LARGE', 'This export is too large to share on iPhone. Your data has been kept.');
    // Copy before handing off: later changes to the caller's buffer cannot change this export.
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
    if (mimeType === 'application/pdf' && (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-')) throw failure('DOWNLOAD_INVALID', 'The valuation is not a valid PDF.');
    if (mimeType !== 'application/pdf') {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw failure('DOWNLOAD_INVALID', 'The export contains invalid text.'); }
      if (text.includes('\0')) throw failure('DOWNLOAD_INVALID', 'The export contains invalid text.');
      if (mimeType === 'application/json') {
        let backup;
        try { backup = JSON.parse(text); } catch { throw failure('DOWNLOAD_INVALID', 'The recovery copy is not valid JSON.'); }
        if (!backup || Array.isArray(backup) || backup.product !== 'Watchify' || backup.kind !== 'test-workspace-backup' || !backup.snapshot || typeof backup.snapshot !== 'object' || Array.isArray(backup.snapshot)) throw failure('DOWNLOAD_INVALID', 'The recovery copy is not a Watchify workspace backup.');
      }
    }
    return { bytes, filename, mimeType };
  }

  async function download(input) {
    if (!available()) throw failure('NATIVE_UNAVAILABLE', 'Native sharing is available in the Watchify iPhone app.');
    if (active) throw failure('DOWNLOAD_BUSY', 'Finish sharing the current file before starting another export.');
    const { bytes, filename, mimeType } = validate(input);
    const requestId = root.crypto.randomUUID();
    const operation = { requestId, generation };
    active = operation;
    try {
      const parts = [];
      for (let index = 0; index < bytes.length; index += 0x8000) parts.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
      const base64 = root.btoa(parts.join(''));
      const response = await handler().postMessage({ version: 1, type: 'download', requestId, filename, mimeType, base64 });
      if (active !== operation || generation !== operation.generation) throw cancelled();
      if (response?.cancelled || response?.code === 'DOWNLOAD_CANCELLED') throw cancelled();
      // Swift UUID.uuidString uses uppercase, while crypto.randomUUID() uses
      // lowercase. Compare the same UUID value without changing other receipts.
      const matchesRequest = typeof response?.requestId === 'string' && response.requestId.toLowerCase() === requestId;
      if (response?.ok !== true || response?.completed !== true || !matchesRequest) throw failure('DOWNLOAD_FAILED', 'The file was not shared. Your data has been kept; please try again.');
      return { shared: true };
    } catch (error) {
      if (active !== operation || generation !== operation.generation || error?.code === 'DOWNLOAD_CANCELLED') throw cancelled();
      if (['DOWNLOAD_FAILED', 'DOWNLOAD_BUSY', 'DOWNLOAD_TOO_LARGE', 'DOWNLOAD_INVALID'].includes(error?.code)) throw error;
      // Do not surface native diagnostics or exported contents in the UI.
      throw failure('DOWNLOAD_FAILED', 'The file could not be shared. Your data has been kept; please try again.');
    } finally { if (active === operation) active = null; }
  }

  async function openAccountRecovery() {
    const recovery = root.webkit?.messageHandlers?.watchifyAccountRecovery;
    if (!available() || typeof recovery?.postMessage !== 'function') throw failure('NATIVE_UNAVAILABLE', 'Open Watchify in your browser to reset your password.');
    try {
      // The native app owns the fixed destination. No URL or credential crosses this bridge.
      const response = await recovery.postMessage({ version: 1, type: 'openRecovery' });
      if (response?.ok !== true || response?.opened !== true) throw new Error('not opened');
      return { opened: true };
    } catch { throw failure('RECOVERY_UNAVAILABLE', 'The browser could not be opened. Open Watchify in your browser and choose Forgot password.'); }
  }

  function cancelDownloads() {
    generation++;
    const pending = active;
    active = null;
    if (pending && available()) {
      try { Promise.resolve(handler().postMessage({ version: 1, type: 'cancel', requestId: pending.requestId })).catch(() => {}); }
      catch { /* Navigation can remove the native handler before this notification arrives. */ }
    }
  }
  root.addEventListener?.('pagehide', cancelDownloads);
  root.addEventListener?.('watchify:session-changed', cancelDownloads);
  if (available()) root.document?.documentElement?.classList?.add('watchify-ios');
  const api = Object.freeze({ available, download, cancelDownloads, openAccountRecovery, limits });
  root.WatchifyNative = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
