const Storage = {
    KEY: 'studyai_portal_data',

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

    getData() {
        const stored = localStorage.getItem(this.KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch(e) {
                return this.getDefaultData();
            }
        }
        const defaultData = this.getDefaultData();
        this.saveData(defaultData);
        return defaultData;
    },

    saveData(data) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(data));
        } catch(e) {
            if (e.name === 'QuotaExceededError') {
                alert('Storage penuh! Hapus beberapa versi lokal atau gunakan link external.');
            }
        }
    },

    addVersion(version) {
        const data = this.getData();
        data.versions.unshift(version);
        this.saveData(data);
    },

    updateVersion(version) {
        const data = this.getData();
        const idx = data.versions.findIndex(v => v.id === version.id);
        if (idx !== -1) {
            version.downloads = data.versions[idx].downloads || 0;
            data.versions[idx] = version;
            this.saveData(data);
        }
    },

    deleteVersion(id) {
        const data = this.getData();
        data.versions = data.versions.filter(v => v.id !== id);
        this.saveData(data);
    },

    addChangelog(changelog) {
        const data = this.getData();
        data.changelogs.unshift(changelog);
        this.saveData(data);
    },

    updateChangelog(changelog) {
        const data = this.getData();
        const idx = data.changelogs.findIndex(c => c.id === changelog.id);
        if (idx !== -1) {
            data.changelogs[idx] = changelog;
            this.saveData(data);
        }
    },

    deleteChangelog(id) {
        const data = this.getData();
        data.changelogs = data.changelogs.filter(c => c.id !== id);
        this.saveData(data);
    },

    incrementDownload(id) {
        const data = this.getData();
        const v = data.versions.find(x => x.id === id);
        if (v) {
            v.downloads = (v.downloads || 0) + 1;
            this.saveData(data);
        }
    },

    downloadFile(id) {
        const data = this.getData();
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
    }
};