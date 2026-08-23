/**
 * ☁️ Cloud Sync Module — Electric Shop App (فانوس)
 * Providers: Supabase (recommended, free 500MB + unlimited API) / Custom REST
 * Architecture: localStorage = primary (always works offline), cloud = backup + multi-device sync
 * Conflict resolution: last-write-wins (single-user shop app)
 */
const CloudSync = {
    _cfg: null,
    _timer: null,
    _busy: false,
    _status: 'offline',
    _debounce: null,

    /* ========== Configuration ========== */
    cfg() {
        if (!this._cfg) {
            const raw = localStorage.getItem('electric_shop_cloud');
            this._cfg = raw ? JSON.parse(raw) : {
                enabled: false,
                provider: 'supabase',       // 'supabase' | 'custom'
                supabaseUrl: '',
                supabaseKey: '',
                customApiUrl: '',
                customApiKey: '',
                shopId: '',
                shopPin: '',
                lastSync: null,
                pullInterval: 60           // seconds between auto-pulls
            };
        }
        return this._cfg;
    },

    saveCfg() {
        localStorage.setItem('electric_shop_cloud', JSON.stringify(this.cfg()));
    },

    /* ========== Status ========== */
    get status() { return this._status; },

    refreshUI() {
        // Header sync indicator
        const ind = document.getElementById('syncIndicator');
        if (ind) {
            const map = {
                offline: { i: '📴', l: 'آفلاین', c: '#64748b', b: '#f1f5f9' },
                syncing: { i: '🔄', l: 'همگام‌سازی...', c: '#f59e0b', b: '#fffbeb' },
                synced:  { i: '☁️', l: 'همگام‌شده', c: '#10b981', b: '#ecfdf5' },
                error:   { i: '⚠️', l: 'خطای اتصال', c: '#ef4444', b: '#fef2f2' }
            };
            const s = map[this._status] || map.offline;
            ind.querySelector('.sync-icon').textContent = s.i;
            ind.querySelector('.sync-label').textContent = s.l;
            ind.style.borderColor = s.c;
            ind.style.background = s.b;
            const c = this.cfg();
            ind.title = s.l + (c.lastSync ? ' | آخرین: ' + new Date(c.lastSync).toLocaleString('fa-AF') : '');
        }

        // Settings page cloud status
        const card = document.getElementById('cloudStatus');
        if (card) {
            const c = this.cfg();
            if (!c.enabled) {
                card.className = 'cloud-status disconnected';
                card.innerHTML = '<span>📴</span><span>متصل نیست — داده‌ها فقط در مرورگر ذخیره می‌شوند</span>';
            } else {
                const map = {
                    offline: { cls: 'disconnected', h: '<span>📴</span><span>آفلاین — اینترنت ندارید</span>' },
                    syncing: { cls: 'syncing',      h: '<span>🔄</span><span>در حال همگام‌سازی...</span>' },
                    synced:  { cls: 'connected',    h: '<span>☁️</span><span>متصل و همگام' + (c.lastSync ? ' — آخرین: ' + new Date(c.lastSync).toLocaleString('fa-AF') : '') + '</span>' },
                    error:   { cls: 'error',         h: '<span>⚠️</span><span>خطا در اتصال ابری — داده‌ها محلی ذخیره می‌شوند</span>' }
                };
                const s = map[this._status] || map.offline;
                card.className = 'cloud-status ' + s.cls;
                card.innerHTML = s.h;
            }
        }

        // Show/hide buttons in settings
        const connectBtn = document.getElementById('connectCloud');
        const disconnectBtn = document.getElementById('disconnectCloud');
        const forceBtn = document.getElementById('forceSyncCloud');
        if (connectBtn) connectBtn.style.display = this.cfg().enabled ? 'none' : '';
        if (disconnectBtn) disconnectBtn.style.display = this.cfg().enabled ? '' : 'none';
        if (forceBtn) forceBtn.style.display = this.cfg().enabled ? '' : 'none';
    },

    _set(s) {
        this._status = s;
        this.refreshUI();
    },

    /* ========== Debounced Push (3s after each DB.save) ========== */
    schedulePush() {
        if (!this.cfg().enabled) return;
        if (this._debounce) clearTimeout(this._debounce);
        this._debounce = setTimeout(() => this.push(), 3000);
    },

    /* ========== Force Pull (click sync indicator) ========== */
    async forcePull() {
        const changed = await this.pull();
        if (changed) {
            const p = document.querySelector('.page.active');
            if (p) refreshPage(p.id);
        }
    },

    /* ========== PUSH to cloud ========== */
    async push() {
        const c = this.cfg();
        if (!c.enabled || this._busy) return;
        if (!navigator.onLine) { this._set('offline'); return; }

        this._busy = true;
        this._set('syncing');
        try {
            const data = DB.getAll();
            const ts = new Date().toISOString();

            if (c.provider === 'supabase') await this._pushSB(data, ts);
            else await this._pushCustom(data, ts);

            c.lastSync = ts;
            this.saveCfg();
            this._set('synced');
        } catch (e) {
            console.error('☁️ push fail:', e);
            this._set('error');
        } finally {
            this._busy = false;
        }
    },

    /* ========== PULL from cloud ========== */
    async pull() {
        const c = this.cfg();
        if (!c.enabled) return false;
        if (!navigator.onLine) { this._set('offline'); return false; }

        this._busy = true;
        this._set('syncing');
        try {
            let r;
            if (c.provider === 'supabase') r = await this._pullSB();
            else r = await this._pullCustom();

            if (r && r.data) {
                const cloudT = new Date(r.updatedAt).getTime();
                const localT = c.lastSync ? new Date(c.lastSync).getTime() : 0;
                if (cloudT > localT || !c.lastSync) {
                    // Cloud data is newer — update localStorage
                    DB.save(r.data);
                    c.lastSync = r.updatedAt;
                    this.saveCfg();
                    this._set('synced');
                    return true;   // data changed → caller should refresh UI
                }
            }
            this._set('synced');
            return false;
        } catch (e) {
            console.error('☁️ pull fail:', e);
            this._set('error');
            return false;
        } finally {
            this._busy = false;
        }
    },

    _normalizeSBUrl(url) {
        // Strip /rest/v1 and trailing slashes so both formats work:
        //   https://xxx.supabase.co          ← correct
        //   https://xxx.supabase.co/rest/v1  ← also accepted
        return url.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    },

    /* ========== Supabase REST API ========== */
    async _pushSB(data, ts) {
        const c = this.cfg();
        const baseUrl = this._normalizeSBUrl(c.supabaseUrl);
        const resp = await fetch(baseUrl + '/rest/v1/shop_data', {
            method: 'POST',
            headers: {
                'apikey': c.supabaseKey,
                'Authorization': 'Bearer ' + c.supabaseKey,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                shop_id: c.shopId,
                data: data,
                pin: c.shopPin || '',
                updated_at: ts
            })
        });
        if (!resp.ok) {
            const txt = await resp.text();
            throw new Error('Supabase push ' + resp.status + ': ' + txt);
        }
    },

    async _pullSB() {
        const c = this.cfg();
        const baseUrl = this._normalizeSBUrl(c.supabaseUrl);
        const url = baseUrl + '/rest/v1/shop_data?shop_id=eq.'
            + encodeURIComponent(c.shopId) + '&select=data,updated_at';
        const resp = await fetch(url, {
            headers: {
                'apikey': c.supabaseKey,
                'Authorization': 'Bearer ' + c.supabaseKey
            }
        });
        if (!resp.ok) throw new Error('Supabase pull ' + resp.status);
        const rows = await resp.json();
        return rows.length ? { data: rows[0].data, updatedAt: rows[0].updated_at } : null;
    },

    /* ========== Custom REST API ========== */
    async _pushCustom(data, ts) {
        const c = this.cfg();
        const url = c.customApiUrl.replace(/\/+$/, '') + '/shop-data/' + encodeURIComponent(c.shopId);
        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': c.customApiKey || ''
            },
            body: JSON.stringify({ data, updatedAt: ts, pin: c.shopPin || '' })
        });
        if (!resp.ok) throw new Error('Custom push ' + resp.status);
    },

    async _pullCustom() {
        const c = this.cfg();
        const url = c.customApiUrl.replace(/\/+$/, '') + '/shop-data/' + encodeURIComponent(c.shopId);
        const resp = await fetch(url, {
            headers: { 'X-API-Key': c.customApiKey || '' }
        });
        if (resp.status === 404) return null;
        if (!resp.ok) throw new Error('Custom pull ' + resp.status);
        const j = await resp.json();
        return { data: j.data, updatedAt: j.updatedAt };
    },

    /* ========== Auto-Sync ========== */
    startAutoSync() {
        const c = this.cfg();
        if (!c.enabled) return;
        this.stopAutoSync();
        const ms = (c.pullInterval || 60) * 1000;
        this._timer = setInterval(() => {
            if (c.enabled && navigator.onLine) {
                this.pull().then(changed => {
                    if (changed) {
                        const p = document.querySelector('.page.active');
                        if (p) refreshPage(p.id);
                    }
                });
            }
        }, ms);
    },

    stopAutoSync() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },

    /* ========== Connect / Disconnect ========== */
    async connect(settings) {
        const c = this.cfg();
        Object.assign(c, settings);
        c.enabled = true;
        try {
            // Try pulling first; if cloud empty, push local data
            const changed = await this.pull();
            if (!changed) await this.push();
            this.startAutoSync();
            this.saveCfg();
            return { ok: true, pulled: changed };
        } catch (e) {
            c.enabled = false;
            this.saveCfg();
            this._set('error');
            return { ok: false, error: e.message };
        }
    },

    disconnect() {
        this.cfg().enabled = false;
        this.stopAutoSync();
        this.saveCfg();
        this._set('offline');
    },

    /* ========== Initialize ========== */
    init() {
        const c = this.cfg();

        // If cloud enabled and online, pull latest data
        if (c.enabled && navigator.onLine) {
            this.pull().then(changed => {
                if (changed) {
                    const p = document.querySelector('.page.active');
                    if (p) refreshPage(p.id);
                }
                this.startAutoSync();
            }).catch(() => this._set('error'));
        } else if (c.enabled && !navigator.onLine) {
            this._set('offline');
        }

        // Go online → resume sync
        window.addEventListener('online', () => {
            if (this.cfg().enabled) {
                this.pull().then(changed => {
                    if (changed) {
                        const p = document.querySelector('.page.active');
                        if (p) refreshPage(p.id);
                    }
                    this.startAutoSync();
                }).catch(() => this._set('error'));
            }
        });

        // Go offline → stop sync
        window.addEventListener('offline', () => {
            this.stopAutoSync();
            this._set('offline');
        });
    }
};

/* Wire up DB events */
window.addEventListener('db-save', () => CloudSync.schedulePush());
window.addEventListener('db-ready', () => CloudSync.init());
