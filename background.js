// Service worker pour l'extension Chrome
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension Gestionnaire de Prompts installée avec succès');
});

// Optionnel : gestion des événements d'installation
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension Gestionnaire de Prompts démarrée');
});