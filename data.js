const Storage = {
    KEY: 'studyai_portal_data',
    CONFIG_KEY: 'studyai_github_config',
    SYNC_KEY: 'studyai_last_sync',

    // ===== CONFIG =====
    getConfig() {
        const stored = localStorage.getItem(this.CONFIG_KEY);
        return stored ? JSON.parse(stored) : {};
    },

    saveConfig(config) {
        localStorage.setItem(this.CONFIG_KEY, JSON.stringify(config));
    },

    isGithubEnabled() {
        const cfg = this.getConfig();
        return !!(cfg.owner && cfg.repo && cfg.token && cfg.path);
    },

    // ===== STRIP fileData untuk GitHub =====
    stripFileData(data) {
        return {
            versions: data.versions.map(v => ({
                id: v.id,
                version: v.version,
                date: v.date,
                size: v.size,
                status: v.status,
                link: v.link,
                description: v.description,
                downloads: v.downloads || 0,
                fileSize: v.fileSize || 0,
                hasLocalFile: !!v.fileData
            })),
            changelogs: data.changelogs
        };
    },

    // Merge GitHub data dengan local fileData
    mergeWithLocal(githubData) {
        const local = this.getLocalData();
        const merged = {
            versions: githubData.versions.map(gv => {
                const lv = local.versions.find(v => v.id === gv.id);
                return {
                    ...gv,
                    fileData: lv ? lv.fileData : null,
                    size: gv.fileSize ? this.formatBytesStatic(gv.fileSize) : gv.size
                };
            }),
            changelogs: githubData.changelogs
        };
        this.saveLocalData(merged);
        return merged;
    },

    formatBytesStatic(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // ===== GITHUB API =====
    async fetchFromGithub() {
        const cfg = this.getConfig();
        const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `token ${cfg.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (!res.ok) throw new Error('Gagal fetch dari GitHub: ' + res.status);
        const data = await res.json();
        const content = atob(data.content.replace(/\s/g, ''));
        return { data: JSON.parse(content), sha: data.sha };
    },

    async pushToGithub(jsonData, sha) {
        const cfg = this.getConfig();
        const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
        const stripped = this.stripFileData(jsonData);
        const body = {
            message: 'Update StudyAI data via admin panel',
            content: btoa(JSON.stringify(stripped, null, 2)),
            branch: cfg.branch
        };
        if (sha) body.sha = sha;

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${cfg.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(`HTTP ${res.status}: ${err.message || 'Unknown error'}`);
        }
        return await res.json();
    },

    async testGithubConnection() {
        const cfg = this.getConfig();
        if (!this.isGithubEnabled()) return { ok: false, msg: 'Konfigurasi belum lengkap' };
        try {
            const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
            const res = await fetch(url, {
                headers: {
                    'Authorization': `token ${cfg.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!res.ok) {
                return { ok: false, msg: `Repo tidak ditemukan atau token salah (HTTP ${res.status})` };
            }
            try {
                const remote = await this.fetchFromGithub();
                return { ok: true, msg: 'Koneksi berhasil! Database ditemukan di GitHub.' };
            } catch(e) {
                return { ok: false, msg: 'Repo ditemukan tapi file data.json belum ada. Klik "Buat Database" untuk inisialisasi.' };
            }
        } catch(e) {
            return { ok: false, msg: 'Network error: ' + e.message };
        }
    },

    async initGithubDatabase() {
        if (!this.isGithubEnabled()) throw new Error('Konfigurasi belum lengkap');
        const emptyData = { versions: [], changelogs: [] };
        let sha = null;
        try {
            const remote = await this.fetchFromGithub();
            sha = remote.sha;
        } catch(e) {
            // File belum ada, buat baru
        }
        await this.pushToGithub(emptyData, sha);
        return true;
    },

    async syncToGithub() {
        if (!this.isGithubEnabled()) throw new Error('GitHub belum dikonfigurasi');
        const localData = this.getLocalData();
        let sha = null;
        try {
            const remote = await this.fetchFromGithub();
            sha = remote.sha;
        } catch(e) {
            // File belum ada, buat baru
        }
        await this.pushToGithub(localData, sha);
        localStorage.setItem(this.SYNC_KEY, Date.now().toString());
    },

    // ===== LOCAL STORAGE =====
    getDefaultData() {
        return {
            versions: [
                {
                    id: 'v_1',
                    version: '1.1',
                    date: '2026-06-05',
                    size: '261Kb',
                    status: 'stable',
                    link: 'https://www.mediafire.com/file/w5jqmq38delj31i/StudyAI_1.1.apk/file',
                    description: 'Versi stabil dengan fitur AI Study Dan Latihan Soal.',
                    downloads: 0,
                    fileData: null,
                    fileSize: 0
                }
            ],
            changelogs: [
                {
                    id: 'c_1',
                    version: '1.1',
                    date: '2026-06-05',
                    changes: [
                        'Support upload gambar soal via API Groq',
                        'Menu catatan dengan title dan kategori',
                        'Tampilan UI/UX diperbarui',
                        'Fix bug loading di beberapa device'
                    ]
                }
            ]
        };
    },

    getLocalData() {
        const stored = localStorage.getItem(this.KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch(e) {
                return this.getDefaultData();
            }
        }
        const defaultData = this.getDefaultData();
        this.saveLocalData(defaultData);
        return defaultData;
    },

    saveLocalData(data) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(data));
        } catch(e) {
            if (e.name === 'QuotaExceededError') {
                alert('Storage penuh! Hapus beberapa versi lokal atau gunakan link external.');
            }
        }
    },

    // ===== MAIN GET DATA (GitHub Priority) =====
    async getData() {
        if (this.isGithubEnabled()) {
            try {
                const remote = await this.fetchFromGithub();
                const merged = this.mergeWithLocal(remote.data);
                localStorage.setItem(this.SYNC_KEY, Date.now().toString());
                return merged;
            } catch(e) {
                console.warn('Gagal fetch dari GitHub, pakai local:', e.message);
                return this.getLocalData();
            }
        }
        return this.getLocalData();
    },

    // ===== WRITE OPERATIONS =====
    async addVersion(version) {
        const data = this.getLocalData();
        data.versions.unshift(version);
        this.saveLocalData(data);
        if (this.isGithubEnabled()) {
            try {
                const remote = await this.fetchFromGithub();
                remote.data.versions.unshift({
                    id: version.id,
                    version: version.version,
                    date: version.date,
                    size: version.size,
                    status: version.status,
                    link: version.link,
                    description: version.description,
                    downloads: 0,
                    fileSize: version.fileSize || 0,
                    hasLocalFile: !!version.fileData
                });
                await this.pushToGithub(remote.data, remote.sha);
            } catch(e) {
                console.warn('Gagal sync ke GitHub:', e.message);
            }
        }
    },

    async updateVersion(version) {
        const data = this.getLocalData();
        const idx = data.versions.findIndex(v => v.id === version.id);
        if (idx !== -1) {
            version.downloads = data.versions[idx].downloads || 0;
            data.versions[idx] = version;
            this.saveLocalData(data);
        }
        if (this.isGithubEnabled()) {
            try {
                const remote = await this.fetchFromGithub();
                const ridx = remote.data.versions.findIndex(v => v.id === version.id);
                if (ridx !== -1) {
                    version.downloads = remote.data.versions[ridx].downloads || 0;
                    remote.data.versions[ridx] = {
                        id: version.id,
                        version: version.version,
                        date: version.date,
                        size: version.size,
                        status: version.status,
                        link: version.link,
                        description: version.description,
                        downloads: version.downloads,
                        fileSize: version.fileSize || 0,
                        hasLocalFile: !!version.fileData
                    };
                    await this.pushToGithub(remote.data, remote.sha);
                }
            } catch(e) {
                console.warn('Gagal sync ke GitHub:', e.message);
            }
        }
    },

    async deleteVersion(id) {
        const data = this.getLocalData();
        data.versions = data.versions.filter(v => v.id !== id);
        this.saveLocalData(data);
        if (this.isGithubEnabled()) {
            try {
                const remote = await this.fetchFromGithub();
                remote.data.versions = remote.data.versions.filter(v => v.id !== id);
                await this.pushToGithub(remote.data, remote.sha);
            } catch(e) {
                console.warn('Gagal sync ke GitHub:', e.message);
            }
        }
    },

    async addChangelog(changelog) {
        const data = this.getLocalData();
        data.changelogs.unshift(changelog);
        this.saveLocalData(data);
        if (this.isGithubEnabled()) {
            try {
                const remote = await this.fetchFromGithub();
                remote.data.changelogs.unshift(changelog);
                await this.pushToGithub(remote.data, remote.sha);
            } catch(e) {
                console.warn('Gagal sync ke GitHub:', e.message);
            }
        }
    },

    async updateChangelog(changelog) {
        const data = this.getLocalData();
        const idx = data.changelogs.findIndex(c => c.id === changelog.id);
        if (idx !== -1) {
            data.changelogs[idx] = changelog;
            this.saveLocalData(data);
        }
        if (this.isGithubEnabled()) {
            try {
                const remote = await this.fetchFromGithub();
                const ridx = remote.data.changelogs.findIndex(c => c.id === changelog.id);
                if (ridx !== -1) {
                    remote.data.changelogs[ridx] = changelog;
                    await this.pushToGithub(remote.data, remote.sha);
                }
            } catch(e) {
                console.warn('Gagal sync ke GitHub:', e.message);
            }
        }
    },

    async deleteChangelog(id) {
        const data = this.getLocalData();
        data.changelogs = data.changelogs.filter(c => c.id !== id);
        this.saveLocalData(data);
        if (this.isGithubEnabled()) {
            try {
                const remote = await this.fetchFromGithub();
                remote.data.changelogs = remote.data.changelogs.filter(c => c.id !== id);
                await this.pushToGithub(remote.data, remote.sha);
            } catch(e) {
                console.warn('Gagal sync ke GitHub:', e.message);
            }
        }
    },

    // ===== DOWNLOAD COUNT (Global via GitHub) =====
    async incrementDownload(id) {
        if (this.isGithubEnabled()) {
            try {
                const remote = await this.fetchFromGithub();
                const v = remote.data.versions.find(x => x.id === id);
                if (v) {
                    v.downloads = (v.downloads || 0) + 1;
                    await this.pushToGithub(remote.data, remote.sha);
                    // Update local juga
                    const local = this.getLocalData();
                    const lv = local.versions.find(x => x.id === id);
                    if (lv) lv.downloads = v.downloads;
                    this.saveLocalData(local);
                }
            } catch(e) {
                console.warn('Gagal increment download di GitHub:', e.message);
                const data = this.getLocalData();
                const v = data.versions.find(x => x.id === id);
                if (v) {
                    v.downloads = (v.downloads || 0) + 1;
                    this.saveLocalData(data);
                }
            }
        } else {
            const data = this.getLocalData();
            const v = data.versions.find(x => x.id === id);
            if (v) {
                v.downloads = (v.downloads || 0) + 1;
                this.saveLocalData(data);
            }
        }
    },

    downloadFile(id) {
        const data = this.getLocalData();
        const v = data.versions.find(x => x.id === id);
        if (!v || !v.fileData) return;
        this.incrementDownload(id);
        const link = document.createElement('a');
        link.href = v.fileData;
        link.download = 'StudyAI_v' + v.version + '.apk';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    resetData() {
        localStorage.removeItem(this.KEY);
        localStorage.removeItem(this.CONFIG_KEY);
        localStorage.removeItem(this.SYNC_KEY);
    }
};