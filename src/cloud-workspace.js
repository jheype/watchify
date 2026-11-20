/* Supabase persistence for isolated account workspaces, using the official Supabase client. */
(function attachCloudWorkspace(root) {
  'use strict';
  const TABLE = 'tester_workspaces';
  const MAX_BYTES = 8 * 1024 * 1024;
  const error = (code, message, retryable = false) => Object.assign(new Error(message), { code, retryable });
  const uuid = () => root.crypto.randomUUID();
  const clone = value => JSON.parse(JSON.stringify(value));
  function create({ client, onStatus = () => {}, storage, namespace, validateSnapshot = value => root.WatchifyWorkspaceSnapshot?.validate(value) || clone(value) } = {}) {
    if (!client?.auth?.getUser || !client?.from) throw new TypeError('An official Supabase client is required.');
    if (storage === undefined) { try { storage = root.sessionStorage || null; } catch { storage = null; } }
    const scope = namespace || client.supabaseUrl || root.WATCHIFY_CONFIG?.supabaseUrl || 'watchify';
    let epoch = 0, disposed = false, loaded = false, userId = null, observedUserId, version = null, updatedAt = null, pending = null, inFlight = null, blocked = false;
    let status = { state: 'idle', userId: null, version: null, updatedAt: null, pending: false, recoveryAvailable: false, error: null };
    const getStatus = () => clone(status);
    function emit(state, failure = null) {
      if (disposed) return;
      status = { ...status, state, userId, version, updatedAt, pending: !!pending, error: failure ? { code: failure.code || 'CLOUD_FAILED', message: failure.message, retryable: !!failure.retryable } : null };
      try { onStatus(getStatus()); } catch { /* A UI callback must not interrupt a saved write. */ }
    }
    const cacheKey = id => 'watchify.pending.v1:' + scope + ':' + id;
    function remember() {
      status.recoveryAvailable = false;
      if (!userId || !storage) return;
      try {
        if (pending) { storage.setItem(cacheKey(userId), JSON.stringify({ userId, ...pending })); status.recoveryAvailable = true; }
        else storage.removeItem(cacheKey(userId));
      } catch { /* Quota failure is surfaced by recoveryAvailable, never reported as a cloud save. */ }
    }
    function checkEpoch(start) {
      if (disposed || start !== epoch) throw error('AUTH_CHANGED', 'The signed-in account changed. Reopen this workspace before saving.');
    }
    function normalise(failure, fallback = 'SAVE_FAILED') {
      if (failure?.code && ['AUTH_REQUIRED', 'AUTH_CHANGED', 'CONFLICT', 'LOAD_REQUIRED', 'UNSAVED_CHANGES', 'SNAPSHOT_INVALID', 'SNAPSHOT_VERSION', 'SNAPSHOT_MEDIA', 'SNAPSHOT_TOO_LARGE'].includes(failure.code)) return failure;
      if (failure?.code === '42501' || failure?.status === 403) return error('PERMISSION_DENIED', 'This account does not have permission to save this workspace.');
      if (failure?.status === 401 || ['PGRST301', 'PGRST302', 'bad_jwt', 'session_not_found', 'refresh_token_not_found'].includes(failure?.code)) return error('AUTH_REQUIRED', 'Please sign in again. Your unsaved changes have been kept.');
      const transient = failure instanceof TypeError || failure?.status >= 500 || failure?.status === 429 || failure?.code === 'PGRST000' || /fetch|network|timeout|timed? out|connection/i.test(failure?.message || '');
      if (transient) return error('NETWORK', 'Cloud saving is unavailable. Your changes are waiting to retry.', true);
      return error(fallback, 'The cloud request failed. Your current workspace has not been replaced.');
    }
    async function identity(start) {
      let response;
      try { response = await client.auth.getUser(); } catch (failure) { throw normalise(failure); }
      checkEpoch(start);
      if (response.error) throw normalise(response.error, 'AUTH_REQUIRED');
      const user = response.data?.user;
      if (!user?.id || user.is_anonymous) throw error('AUTH_REQUIRED', 'Sign in with your account to open a private workspace.');
      if (observedUserId !== undefined && observedUserId !== user.id) throw error('AUTH_CHANGED', 'The signed-in account changed. Reopen this workspace before saving.');
      if (userId && user.id !== userId) throw error('AUTH_CHANGED', 'The signed-in account changed. Reopen this workspace before saving.');
      observedUserId = user.id;
      return user.id;
    }
    function checkRow(row) {
      if (!row || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.updated_at !== 'string') throw error('LOAD_FAILED', 'The saved workspace metadata is invalid. It has not been overwritten.');
      return row;
    }
    async function readRow(id, full = true) {
      const response = await client.from(TABLE).select(full ? 'snapshot,version,updated_at,save_id' : 'version,updated_at,save_id').eq('user_id', id).maybeSingle();
      if (response.error) throw response.error;
      return response.data ? checkRow(response.data) : null;
    }
    function recover(id) {
      if (!storage) return null;
      try {
        const cached = JSON.parse(storage.getItem(cacheKey(id)) || 'null');
        if (!cached || cached.userId !== id || !/^[0-9a-f-]{36}$/i.test(cached.saveId) || !(cached.baseVersion === null || Number.isSafeInteger(cached.baseVersion) && cached.baseVersion > 0)) return null;
        const result = { snapshot: validateSnapshot(cached.snapshot), baseVersion: cached.baseVersion, saveId: cached.saveId };
        if (cached.awaitingReceipt && /^[0-9a-f-]{36}$/i.test(cached.awaitingReceipt.saveId) && (cached.awaitingReceipt.baseVersion === null || Number.isSafeInteger(cached.awaitingReceipt.baseVersion) && cached.awaitingReceipt.baseVersion > 0)) result.awaitingReceipt = { saveId: cached.awaitingReceipt.saveId, baseVersion: cached.awaitingReceipt.baseVersion };
        return result;
      } catch { return null; }
    }
    async function load({ discardPending = false } = {}) {
      if (disposed) throw error('AUTH_CHANGED', 'This workspace has been closed.');
      if (inFlight) throw error('UNSAVED_CHANGES', 'Wait for the current cloud save before loading.');
      if (pending && !discardPending) throw error('UNSAVED_CHANGES', 'Export or save your pending changes before loading another copy.');
      const start = epoch;
      emit('loading');
      try {
        const id = await identity(start);
        const row = await readRow(id);
        checkEpoch(start);
        const remote = row ? validateSnapshot(row.snapshot) : null;
        userId = id; version = row?.version ?? null; updatedAt = row?.updated_at ?? null; loaded = true; blocked = false;
        pending = discardPending ? null : recover(id);
        // A previous response may have been lost after the database committed the write.
        if (pending && row?.save_id === pending.saveId) pending = null;
        if (pending && row?.save_id === pending.awaitingReceipt?.saveId) { pending.baseVersion = version; delete pending.awaitingReceipt; }
        if (pending && pending.baseVersion !== version) blocked = true;
        remember();
        const conflict = blocked ? error('CONFLICT', 'Another tab or device saved a newer copy. Your local copy is preserved; export it before reloading the cloud version.') : null;
        emit(blocked ? 'conflict' : pending ? 'pending' : row ? 'saved' : 'ready', conflict);
        return row || pending ? { snapshot: clone(pending?.snapshot || remote), version, updatedAt, recovered: !!pending, conflict: blocked } : null;
      } catch (failure) {
        const issue = normalise(failure, 'LOAD_FAILED');
        if (start === epoch) emit(issue.code === 'AUTH_REQUIRED' ? 'signed_out' : issue.retryable ? 'offline' : 'error', issue);
        throw issue;
      }
    }
    async function write(job, id, reconciled = false) {
      let response;
      if (job.baseVersion === null) response = await client.from(TABLE).insert({ user_id: id, snapshot: job.snapshot, save_id: job.saveId }).select('version,updated_at,save_id').single();
      else response = await client.from(TABLE).update({ snapshot: job.snapshot, save_id: job.saveId }).eq('user_id', id).eq('version', job.baseVersion).select('version,updated_at,save_id').maybeSingle();
      if (response.error && response.error.code !== '23505') throw response.error;
      if (!response.error && response.data) return checkRow(response.data);
      // Compare-and-swap lost, or an earlier request committed but its reply was lost.
      const row = await readRow(id, false);
      if (row?.save_id === job.saveId) return row;
      // This tab may have edited again after an earlier write committed but lost its reply.
      if (!reconciled && row?.save_id === job.awaitingReceipt?.saveId) {
        job.baseVersion = row.version;
        delete job.awaitingReceipt;
        remember();
        return write(job, id, true);
      }
      throw error('CONFLICT', 'Another tab or device saved a newer copy. Your local copy is preserved; export it before reloading the cloud version.');
    }
    async function reconcileReceipt(id, start) {
      if (!pending?.awaitingReceipt) return;
      const receipt = pending.awaitingReceipt;
      const row = await readRow(id, false);
      checkEpoch(start);
      if (row?.save_id === receipt.saveId) {
        version = row.version; updatedAt = row.updated_at;
        if (pending.saveId === receipt.saveId) pending = null;
        else { pending.baseVersion = version; delete pending.awaitingReceipt; }
        remember();
        emit(pending ? 'pending' : 'saved');
      } else if ((row?.version ?? null) !== receipt.baseVersion) {
        throw error('CONFLICT', 'Another tab or device saved a newer copy. Your local copy is preserved; export it before reloading the cloud version.');
      }
      // If the earlier write did not commit, retain its receipt until the next write
      // succeeds. A delayed server commit can still be reconciled by write().
    }
    async function drain() {
      if (inFlight) return inFlight;
      if (blocked) throw error('CONFLICT', 'Resolve the newer cloud copy before saving. Your local changes are still available to export.');
      const start = epoch;
      inFlight = (async () => {
        try {
          const id = await identity(start);
          while (pending) {
            await reconcileReceipt(id, start);
            if (!pending) break;
            const job = pending;
            emit('saving');
            let row;
            try { row = await write(job, id); }
            catch (failure) {
              if (start === epoch && pending && normalise(failure).retryable) pending.awaitingReceipt = { saveId: job.saveId, baseVersion: job.baseVersion };
              throw failure;
            }
            checkEpoch(start);
            version = row.version; updatedAt = row.updated_at;
            if (pending === job) pending = null;
            else pending.baseVersion = version;
            remember();
            emit(pending ? 'pending' : 'saved');
          }
          return getStatus();
        } catch (failure) {
          const issue = normalise(failure);
          if (start === epoch) {
            blocked = issue.code === 'CONFLICT';
            remember();
            emit(blocked ? 'conflict' : issue.code === 'AUTH_REQUIRED' ? 'signed_out' : issue.retryable ? 'offline' : 'error', issue);
          }
          throw issue;
        } finally { inFlight = null; }
      })();
      return inFlight;
    }
    async function save(snapshot) {
      if (disposed || !loaded || !userId) throw error('LOAD_REQUIRED', 'Open your signed-in workspace before saving changes.');
      let checked;
      try {
        checked = validateSnapshot(snapshot);
        if (new TextEncoder().encode(JSON.stringify(checked)).length > MAX_BYTES) throw error('SNAPSHOT_TOO_LARGE', 'This workspace exceeds the 8 MB cloud-save limit. Your changes remain in this tab.');
      } catch (failure) { const issue = normalise(failure); emit('error', issue); throw issue; }
      // A new action replaces only this tab's unsent snapshot, never a newer remote snapshot.
      pending = { snapshot: clone(checked), baseVersion: version, saveId: uuid(), ...(pending?.awaitingReceipt ? { awaitingReceipt: { ...pending.awaitingReceipt } } : {}) };
      remember();
      if (blocked) { const issue = error('CONFLICT', 'Resolve the newer cloud copy before saving. Your local changes are still available to export.'); emit('conflict', issue); throw issue; }
      emit('pending');
      return drain();
    }
    async function retry() {
      if (!pending) return getStatus();
      return drain();
    }
    const exportPending = () => pending ? clone(pending.snapshot) : null;
    const subscription = client.auth.onAuthStateChange?.((event, session) => {
      if (disposed) return;
      const nextId = session?.user?.id || null;
      if (event === 'INITIAL_SESSION' && observedUserId === undefined) { observedUserId = nextId; return; }
      if (nextId === observedUserId) return;
      observedUserId = nextId;
      // Do not call other Supabase auth methods inside its auth-state callback.
      epoch++; loaded = false; userId = null; version = null; updatedAt = null; pending = null; blocked = false;
      status.recoveryAvailable = false;
      emit('signed_out', error('AUTH_CHANGED', 'The signed-in account changed. Reopen your private workspace.'));
    })?.data?.subscription;
    function dispose() { remember(); disposed = true; epoch++; subscription?.unsubscribe(); }
    return Object.freeze({ load, save, retry, getStatus, exportPending, dispose });
  }
  const api = Object.freeze({ create });
  root.WatchifyCloudWorkspace = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
