class PromptManager {
    constructor() {
        this.prompts = [];
        this.favoritePrompts = [];
        this.currentEditId = null;
        this.syncQuota = 102400; // 100KB limite Chrome
        this.syncAvailable = false;
        this.lastSyncSuccess = false;
        this.syncErrorShown = false;
        this.init();
    }

    async init() {
        console.log('🚀 Initialisation du gestionnaire de prompts...');
        
        // Vérifier d'abord si la sync est disponible
        await this.checkSyncStatus();
        
        await this.loadPrompts();
        await this.loadFavorites();
        this.setupEventListeners();
        this.renderPrompts();
        
        // Charger des prompts par défaut si c'est la première utilisation
        if (this.prompts.length === 0) {
            console.log('📋 Chargement des prompts par défaut...');
            await this.loadDefaultPrompts();
        }
        
        // Vérifier l'espace de sync
        if (this.syncAvailable) {
            await this.checkSyncUsage();
        }
        
        console.log('✅ Gestionnaire de prompts initialisé avec succès');
        console.log(`📊 ${this.prompts.length} prompts chargés, ${this.favoritePrompts.length} favoris`);
        console.log(`🔄 Synchronisation: ${this.syncAvailable ? 'Activée' : 'Désactivée'}`);
    }

    setupEventListeners() {
        // Boutons principaux
        document.getElementById('add-prompt-btn').addEventListener('click', () => this.showModal());
        document.getElementById('export-btn').addEventListener('click', () => this.exportPrompts());
        document.getElementById('sync-status-btn').addEventListener('click', () => this.toggleSyncInfo());
        
        // Recherche et filtres
        document.getElementById('search-input').addEventListener('input', () => this.filterPrompts());
        document.getElementById('category-filter').addEventListener('change', () => this.filterPrompts());
        document.getElementById('favorite-filter').addEventListener('change', () => this.filterPrompts());
        
        // Modal
        document.getElementById('prompt-form').addEventListener('submit', (e) => this.savePrompt(e));
        document.getElementById('cancel-btn').addEventListener('click', () => this.hideModal());
        
        // Fermeture des modals
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.classList.add('hidden');
                }
            });
        });
        
        // Fermeture modal en cliquant sur l'overlay
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
        
        // Import
        document.getElementById('import-file').addEventListener('change', (e) => this.handleImport(e));
        
        console.log('📝 Event listeners configurés');
    }

    toggleSyncInfo() {
        const syncInfo = document.getElementById('sync-info');
        if (syncInfo.classList.contains('hidden')) {
            this.updateSyncInfo();
            syncInfo.classList.remove('hidden');
        } else {
            syncInfo.classList.add('hidden');
        }
    }

    async updateSyncInfo() {
        const favoriteCount = this.favoritePrompts.length;
        let syncUsage = { usage: 0, percentage: 0 };
        
        if (this.syncAvailable) {
            syncUsage = await this.checkSyncUsage();
        }
        
        document.getElementById('sync-count').textContent = favoriteCount;
        document.getElementById('sync-usage').textContent = this.syncAvailable ? 
            `${syncUsage.percentage.toFixed(1)}%` : 'N/A';
        
        // Mettre à jour l'indicateur de statut
        const syncInfo = document.getElementById('sync-info');
        const statusIndicator = syncInfo.querySelector('.sync-status') || document.createElement('div');
        statusIndicator.className = 'sync-status';
        
        if (!this.syncAvailable) {
            statusIndicator.innerHTML = '🔴 Synchronisation désactivée - <a href="chrome://settings/syncSetup" target="_blank" style="color: #2196F3;">Activer</a>';
            statusIndicator.style.color = '#f44336';
        } else if (this.lastSyncSuccess) {
            statusIndicator.innerHTML = '🟢 Synchronisation active';
            statusIndicator.style.color = '#4CAF50';
        } else {
            statusIndicator.innerHTML = '🟡 Synchronisation partielle';
            statusIndicator.style.color = '#ff9800';
        }
        
        // Ajouter l'indicateur s'il n'existe pas
        if (!syncInfo.querySelector('.sync-status')) {
            syncInfo.querySelector('.sync-details').insertAdjacentElement('afterbegin', statusIndicator);
        }
        
        // Changer la couleur selon l'utilisation
        const usageElement = document.getElementById('sync-usage');
        if (syncUsage.percentage > 80) {
            usageElement.style.color = '#f44336';
            usageElement.style.fontWeight = 'bold';
        } else if (syncUsage.percentage > 60) {
            usageElement.style.color = '#ff9800';
            usageElement.style.fontWeight = '500';
        } else {
            usageElement.style.color = '#4CAF50';
            usageElement.style.fontWeight = 'normal';
        }
    }

    async loadPrompts() {
        const result = await chrome.storage.local.get(['prompts']);
        this.prompts = result.prompts || [];
    }

    async savePrompts() {
        await chrome.storage.local.set({ prompts: this.prompts });
    }

    async loadFavorites() {
        try {
            const result = await chrome.storage.sync.get(['favoritePrompts']);
            this.favoritePrompts = result.favoritePrompts || [];
            console.log('✅ Favoris chargés depuis sync:', this.favoritePrompts.length);
        } catch (error) {
            console.warn('⚠️ Erreur chargement sync, fallback vers local:', error);
            // Fallback vers local storage
            const result = await chrome.storage.local.get(['favoritePrompts']);
            this.favoritePrompts = result.favoritePrompts || [];
        }
    }

    async saveFavorites() {
        try {
            // Tenter d'abord la sync
            await chrome.storage.sync.set({ favoritePrompts: this.favoritePrompts });
            console.log('✅ Favoris synchronisés:', this.favoritePrompts.length);
            
            // Marquer qu'on a réussi la sync
            this.lastSyncSuccess = true;
            
        } catch (error) {
            console.warn('⚠️ Erreur sync favoris, sauvegarde locale:', error);
            
            // Fallback vers local storage
            await chrome.storage.local.set({ favoritePrompts: this.favoritePrompts });
            this.lastSyncSuccess = false;
            
            // Notifier l'utilisateur si c'est la première fois
            if (!this.syncErrorShown) {
                this.showNotification('⚠️ Sync désactivée - favoris sauvés localement', '#ff9800');
                this.syncErrorShown = true;
            }
        }
    }

    async checkSyncStatus() {
        try {
            // Test simple pour vérifier si la sync fonctionne
            const testKey = 'syncTest_' + Date.now();
            await chrome.storage.sync.set({ [testKey]: 'test' });
            await chrome.storage.sync.remove([testKey]);
            
            this.syncAvailable = true;
            console.log('✅ Synchronisation Chrome disponible');
            
        } catch (error) {
            this.syncAvailable = false;
            console.warn('❌ Synchronisation Chrome indisponible:', error);
            
            // Expliquer pourquoi la sync ne fonctionne pas
            if (error.message.includes('MAX_WRITE_OPERATIONS_PER_HOUR')) {
                this.showNotification('⚠️ Limite sync atteinte - réessayez dans 1h', '#ff9800');
            } else {
                this.showNotification('ℹ️ Connectez-vous à Chrome pour synchroniser', '#2196F3');
            }
        }
        
        return this.syncAvailable;
    }

    async toggleFavorite(promptId) {
        const prompt = this.prompts.find(p => p.id === promptId);
        if (!prompt) return;

        const isFavorite = this.favoritePrompts.some(f => f.id === promptId);
        
        if (isFavorite) {
            // Retirer des favoris
            this.favoritePrompts = this.favoritePrompts.filter(f => f.id !== promptId);
            prompt.isFavorite = false;
        } else {
            // Ajouter aux favoris
            const favoriteData = {
                id: prompt.id,
                name: prompt.name,
                category: prompt.category,
                text: prompt.text,
                tags: prompt.tags,
                createdAt: prompt.createdAt,
                updatedAt: prompt.updatedAt
            };
            
            // Vérifier la limite de taille avant d'ajouter
            const currentSize = await this.getSyncUsage();
            const favoriteSize = new Blob([JSON.stringify(favoriteData)]).size;
            
            if (currentSize + favoriteSize > this.syncQuota * 0.9) { // 90% de la limite
                alert('⚠️ Espace de synchronisation presque plein!\nVous pouvez avoir maximum ~50 prompts favoris synchronisés.');
                return;
            }
            
            this.favoritePrompts.push(favoriteData);
            prompt.isFavorite = true;
        }

        await this.savePrompts();
        await this.saveFavorites();
        this.renderPrompts();
    }

    async getSyncUsage() {
        try {
            if (!this.syncAvailable) return 0;
            return await chrome.storage.sync.getBytesInUse();
        } catch (error) {
            console.warn('Erreur lecture usage sync:', error);
            return 0;
        }
    }

    async checkSyncUsage() {
        const usage = await this.getSyncUsage();
        const percentage = (usage / this.syncQuota) * 100;
        
        if (percentage > 80) {
            console.warn(`⚠️ Sync usage: ${usage}/${this.syncQuota} bytes (${percentage.toFixed(1)}%)`);
        }
        
        return { usage, percentage };
    }

    showModal(prompt = null) {
        const modal = document.getElementById('prompt-modal');
        const title = document.getElementById('modal-title');
        
        if (prompt) {
            title.textContent = 'Modifier le prompt';
            document.getElementById('prompt-name').value = prompt.name;
            document.getElementById('prompt-category').value = prompt.category;
            document.getElementById('prompt-text').value = prompt.text;
            document.getElementById('prompt-tags').value = prompt.tags?.join(', ') || '';
            this.currentEditId = prompt.id;
        } else {
            title.textContent = 'Nouveau prompt';
            document.getElementById('prompt-form').reset();
            this.currentEditId = null;
        }
        
        modal.classList.remove('hidden');
        document.getElementById('prompt-name').focus();
    }

    hideModal() {
        document.getElementById('prompt-modal').classList.add('hidden');
        this.currentEditId = null;
    }

    async savePrompt(e) {
        e.preventDefault();
        
        const name = document.getElementById('prompt-name').value.trim();
        const category = document.getElementById('prompt-category').value;
        const text = document.getElementById('prompt-text').value.trim();
        const tagsInput = document.getElementById('prompt-tags').value.trim();
        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()) : [];
        
        const promptData = {
            id: this.currentEditId || Date.now().toString(),
            name,
            category,
            text,
            tags,
            createdAt: this.currentEditId ? 
                this.prompts.find(p => p.id === this.currentEditId)?.createdAt || new Date().toISOString() :
                new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isFavorite: this.currentEditId ? 
                this.prompts.find(p => p.id === this.currentEditId)?.isFavorite || false : 
                false
        };

        if (this.currentEditId) {
            const index = this.prompts.findIndex(p => p.id === this.currentEditId);
            this.prompts[index] = promptData;
            
            // Mettre à jour dans les favoris si c'est un favori
            if (promptData.isFavorite) {
                const favIndex = this.favoritePrompts.findIndex(f => f.id === this.currentEditId);
                if (favIndex !== -1) {
                    this.favoritePrompts[favIndex] = { ...promptData };
                    await this.saveFavorites();
                }
            }
        } else {
            this.prompts.unshift(promptData);
        }

        await this.savePrompts();
        this.renderPrompts();
        this.hideModal();
    }

    async deletePrompt(id) {
        if (confirm('Êtes-vous sûr de vouloir supprimer ce prompt ?')) {
            // Supprimer des prompts normaux
            this.prompts = this.prompts.filter(p => p.id !== id);
            
            // Supprimer des favoris si présent
            const wasFavorite = this.favoritePrompts.some(f => f.id === id);
            if (wasFavorite) {
                this.favoritePrompts = this.favoritePrompts.filter(f => f.id !== id);
                await this.saveFavorites();
            }
            
            await this.savePrompts();
            this.renderPrompts();
        }
    }

    copyPrompt(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this.showNotification('✓ Copié !', '#4CAF50');
            }).catch(err => {
                console.error('Erreur copie clipboard:', err);
                this.fallbackCopyText(text);
            });
        } else {
            this.fallbackCopyText(text);
        }
    }

    fallbackCopyText(text) {
        // Méthode de fallback pour la copie
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        try {
            document.execCommand('copy');
            this.showNotification('✓ Copié !', '#4CAF50');
        } catch (err) {
            console.error('Erreur copie fallback:', err);
            this.showNotification('❌ Erreur de copie', '#f44336');
        }
        
        document.body.removeChild(textarea);
    }

    showNotification(message, color = '#4CAF50') {
        // Animation de feedback
        const tooltip = document.createElement('div');
        tooltip.textContent = message;
        tooltip.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${color};
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            z-index: 10000;
            font-size: 14px;
            animation: fadeInOut 2s ease-in-out;
        `;
        
        document.body.appendChild(tooltip);
        
        setTimeout(() => {
            if (document.body.contains(tooltip)) {
                document.body.removeChild(tooltip);
            }
        }, 2000);
    }

    filterPrompts() {
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        const categoryFilter = document.getElementById('category-filter').value;
        const favoriteFilter = document.getElementById('favorite-filter').value;
        
        let filtered = this.prompts.filter(prompt => {
            const matchesSearch = !searchTerm || 
                prompt.name.toLowerCase().includes(searchTerm) ||
                prompt.text.toLowerCase().includes(searchTerm) ||
                prompt.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
            
            const matchesCategory = !categoryFilter || prompt.category === categoryFilter;
            
            const matchesFavorite = !favoriteFilter || 
                (favoriteFilter === 'favorites' && prompt.isFavorite) ||
                (favoriteFilter === 'non-favorites' && !prompt.isFavorite);
            
            return matchesSearch && matchesCategory && matchesFavorite;
        });
        
        this.renderPrompts(filtered);
    }

    renderPrompts(promptsToRender = null) {
        const container = document.getElementById('prompts-container');
        const prompts = promptsToRender || this.prompts;
        
        if (prompts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Aucun prompt trouvé</h3>
                    <p>Commencez par créer votre premier prompt !</p>
                </div>
            `;
            return;
        }

        // Marquer les favoris dans les prompts
        prompts.forEach(prompt => {
            prompt.isFavorite = this.favoritePrompts.some(f => f.id === prompt.id);
        });

        container.innerHTML = prompts.map(prompt => `
            <div class="prompt-item" data-id="${prompt.id}">
                <div class="prompt-header">
                    <div class="prompt-title-row">
                        <span class="favorite-star ${prompt.isFavorite ? 'active' : ''}" 
                              data-id="${prompt.id}" 
                              title="${prompt.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                            ${prompt.isFavorite ? '⭐' : '☆'}
                        </span>
                        <div class="prompt-title">${prompt.name}</div>
                        ${prompt.isFavorite ? '<span class="sync-indicator" title="Synchronisé sur tous vos appareils">🔄</span>' : ''}
                    </div>
                    <div class="prompt-category">${this.getCategoryLabel(prompt.category)}</div>
                </div>
                <div class="prompt-text">${prompt.text}</div>
                ${prompt.tags && prompt.tags.length > 0 ? `
                    <div class="prompt-tags">
                        ${prompt.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="prompt-actions">
                    <button class="btn-small btn-copy" data-id="${prompt.id}">
                        📋 Copier
                    </button>
                    <button class="btn-small btn-edit" data-id="${prompt.id}">
                        ✏️ Modifier
                    </button>
                    <button class="btn-small btn-delete" data-id="${prompt.id}">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `).join('');

        // Ajouter les event listeners après avoir créé le HTML
        this.attachPromptEventListeners();
    }

    attachPromptEventListeners() {
        // Event listeners pour les étoiles favorites
        document.querySelectorAll('.favorite-star').forEach(star => {
            star.addEventListener('click', (e) => {
                const promptId = e.target.getAttribute('data-id');
                this.toggleFavorite(promptId);
            });
        });

        // Event listeners pour les boutons d'action
        document.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const promptId = e.target.getAttribute('data-id');
                const prompt = this.prompts.find(p => p.id === promptId);
                if (prompt) {
                    this.copyPrompt(prompt.text);
                }
            });
        });

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const promptId = e.target.getAttribute('data-id');
                this.editPrompt(promptId);
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const promptId = e.target.getAttribute('data-id');
                this.deletePrompt(promptId);
            });
        });
    }

    getCategoryLabel(category) {
        const labels = {
            'communication': '💬 Communication',
            'gestion-projet': '📊 Gestion de projet',
            'blogging': '✍️ Blogging',
            'fundraising': '💰 Fundraising',
            'reporting': '📈 Reporting',
            'strategie': '🎯 Stratégie',
            'formation': '🎓 Formation',
            'autre': '📝 Autre'
        };
        return labels[category] || category;
    }

    editPrompt(id) {
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            this.showModal(prompt);
        }
    }

    exportPrompts() {
        const dataStr = JSON.stringify(this.prompts, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `prompts-export-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }

    handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    this.prompts = [...this.prompts, ...imported];
                    await this.savePrompts();
                    this.renderPrompts();
                    alert(`${imported.length} prompts importés avec succès !`);
                }
            } catch (error) {
                alert('Erreur lors de l\'importation du fichier JSON');
            }
        };
        reader.readAsText(file);
    }

    async loadDefaultPrompts() {
        const defaultPrompts = [
            {
                id: 'default-1',
                name: 'Email de demande de don',
                category: 'fundraising',
                text: 'Rédigez un email percutant pour solliciter des dons pour notre ONG. L\'email doit :\n- Présenter notre mission de manière émotionnelle\n- Expliquer l\'urgence de la situation\n- Montrer l\'impact concret des dons\n- Inclure un appel à l\'action clair\n\nContexte de l\'ONG : [DÉCRIVEZ VOTRE ONG]\nObjectif de la campagne : [MONTANT ET OBJECTIF]\nPublic cible : [PROFIL DES DONATEURS]',
                tags: ['email', 'donation', 'fundraising', 'ONG'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: true
            },
            {
                id: 'default-2',
                name: 'Plan de projet ONG',
                category: 'gestion-projet',
                text: 'Créez un plan de projet détaillé pour notre initiative. Le plan doit inclure :\n\n## Contexte et objectifs\n- Problématique abordée\n- Objectifs SMART\n- Bénéficiaires cibles\n\n## Ressources et budget\n- Équipe nécessaire\n- Budget prévisionnel\n- Partenaires potentiels\n\n## Calendrier\n- Phases du projet\n- Jalons importants\n- Livrables\n\n## Gestion des risques\n- Risques identifiés\n- Plans de mitigation\n\nDétails du projet : [DÉCRIVEZ VOTRE PROJET]',
                tags: ['planification', 'projet', 'ONG', 'gestion'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: true
            },
            {
                id: 'default-3',
                name: 'Article de blog impact social',
                category: 'blogging',
                text: 'Rédigez un article de blog engageant sur l\'impact social de notre organisation. L\'article doit :\n\n- Avoir un titre accrocheur\n- Commencer par une histoire personnelle ou un témoignage\n- Présenter des données et statistiques concrètes\n- Inclure des citations d\'experts ou bénéficiaires\n- Se terminer par un appel à l\'action\n- Être optimisé SEO avec des mots-clés pertinants\n\nSujet : [THÈME DE L\'ARTICLE]\nAngle : [PERSPECTIVE CHOISIE]\nMots-clés : [LISTE DES MOTS-CLÉS]\nLongueur souhaitée : [NOMBRE DE MOTS]',
                tags: ['blog', 'impact', 'social', 'SEO', 'storytelling'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: false
            },
            {
                id: 'default-4',
                name: 'Rapport annuel ONG',
                category: 'reporting',
                text: 'Créez la structure et le contenu d\'un rapport annuel professionnel. Le rapport doit inclure :\n\n## Message du directeur\n- Vision et accomplissements de l\'année\n\n## Nos réalisations\n- Statistiques clés\n- Projets marquants\n- Témoignages\n\n## Impact mesurable\n- Indicateurs de performance\n- Comparaison avec les objectifs\n- Évolution sur plusieurs années\n\n## Transparence financière\n- Utilisation des fonds\n- Sources de financement\n- Certification des comptes\n\n## Perspectives d\'avenir\n- Projets 2024\n- Nouveaux défis\n- Appel au soutien\n\nDonnées de l\'organisation : [VOS CHIFFRES ET RÉALISATIONS]',
                tags: ['rapport', 'annuel', 'transparence', 'impact', 'financier'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: false
            },
            {
                id: 'default-5',
                name: 'Stratégie de communication digitale',
                category: 'strategie',
                text: 'Développez une stratégie de communication digitale complète pour notre ONG :\n\n## Analyse de la situation\n- Audit des canaux actuels\n- Analyse de la concurrence\n- Identification du public cible\n\n## Objectifs SMART\n- Notoriété\n- Engagement\n- Conversion (dons/bénévolat)\n\n## Stratégie de contenu\n- Types de contenus par canal\n- Calendrier éditorial\n- Ton et ligne éditoriale\n\n## Canaux de communication\n- Réseaux sociaux prioritaires\n- Newsletter\n- Site web\n- Partenariats média\n\n## Budget et ressources\n- Allocation budgétaire\n- Équipe nécessaire\n- Outils recommandés\n\n## KPIs et mesure\n- Indicateurs de succès\n- Outils de suivi\n- Reporting mensuel\n\nContexte : [VOTRE ORGANISATION ET SES ENJEUX]',
                tags: ['stratégie', 'digital', 'communication', 'réseaux sociaux', 'KPI'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isFavorite: true
            }
        ];

        this.prompts = defaultPrompts;
        
        // Ajouter les favoris par défaut
        this.favoritePrompts = defaultPrompts.filter(p => p.isFavorite);
        
        await this.savePrompts();
        await this.saveFavorites();
        this.renderPrompts();
        
        // Notification de bienvenue
        setTimeout(() => {
            const tooltip = document.createElement('div');
            tooltip.textContent = '🎉 Extension installée ! 3 prompts favoris sont déjà synchronisés.';
            tooltip.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 12px 16px;
                border-radius: 6px;
                z-index: 10000;
                font-size: 13px;
                max-width: 250px;
                animation: fadeInOut 4s ease-in-out;
            `;
            
            document.body.appendChild(tooltip);
            
            setTimeout(() => {
                if (document.body.contains(tooltip)) {
                    document.body.removeChild(tooltip);
                }
            }, 4000);
        }, 1000);
    }
}

// Initialisation et exposition globale
let promptManager;

// Attendre que le DOM soit chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM déjà chargé
    initializeApp();
}

function initializeApp() {
    console.log('🌐 DOM prêt, initialisation de l\'extension...');
    promptManager = new PromptManager();
}

// Ajout du CSS pour l'animation
if (!document.getElementById('prompt-manager-styles')) {
    const style = document.createElement('style');
    style.id = 'prompt-manager-styles';
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(-10px); }
            20% { opacity: 1; transform: translateY(0); }
            80% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-10px); }
        }
    `;
    document.head.appendChild(style);
}