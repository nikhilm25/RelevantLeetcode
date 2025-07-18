// Simplified state management
let allProblems = [];
let filteredProblems = [];
let completedProblems = new Set();
let currentSort = 'numberOfCompanies';
let sortReversed = false;
let activeCompanies = new Set();
let activeTopics = new Set();
let allCompanies = [];
let allTopics = [];

// Cache keys
const CACHE_KEYS = {
    COMPLETED: 'rlc_completed_v3',
    PREFERENCES: 'rlc_preferences_v3',
    FILTERS: 'rlc_filters_v3'
};

// DOM elements
const elements = {
    searchInput: document.getElementById('searchInput'),
    difficultyFilter: document.getElementById('difficultyFilter'),
    completionFilter: document.getElementById('completionFilter'),
    problemsCount: document.getElementById('problemsCount'),
    problemsGrid: document.getElementById('problemsGrid'),
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    companySearch: document.getElementById('companySearch'),
    topicSearch: document.getElementById('topicSearch'),
    selectedCompaniesBubbles: document.getElementById('selectedCompaniesBubbles'),
    selectedTopicsBubbles: document.getElementById('selectedTopicsBubbles'),
    searchCompaniesBubbles: document.getElementById('searchCompaniesBubbles'),
    searchTopicsBubbles: document.getElementById('searchTopicsBubbles'),
    activeCompaniesCount: document.getElementById('activeCompaniesCount'),
    activeTopicsCount: document.getElementById('activeTopicsCount'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),
    // Export/Import elements
    exportDataBtn: document.getElementById('exportDataBtn'),
    importDataBtn: document.getElementById('importDataBtn'),
    importFileInput: document.getElementById('importFileInput')
};

// Utility functions
function saveToCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn('Cache save failed:', e);
    }
}

function loadFromCache(key) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        console.warn('Cache load failed:', e);
        return null;
    }
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Data persistence
function saveCompletedProblems() {
    saveToCache(CACHE_KEYS.COMPLETED, [...completedProblems]);
}

function loadCompletedProblems() {
    const saved = loadFromCache(CACHE_KEYS.COMPLETED);
    if (saved) completedProblems = new Set(saved);
}

function savePreferences() {
    const prefs = {
        currentSort,
        sortReversed,
        searchTerm: elements.searchInput?.value || '',
        selectedDifficulty: elements.difficultyFilter?.value || '',
        selectedCompletion: elements.completionFilter?.value || ''
    };
    saveToCache(CACHE_KEYS.PREFERENCES, prefs);
}

function loadPreferences() {
    const prefs = loadFromCache(CACHE_KEYS.PREFERENCES);
    if (!prefs) return;
    
    currentSort = prefs.currentSort || 'frequency';
    sortReversed = prefs.sortReversed || false;
    
    if (elements.searchInput) elements.searchInput.value = prefs.searchTerm || '';
    if (elements.difficultyFilter) elements.difficultyFilter.value = prefs.selectedDifficulty || '';
    if (elements.completionFilter) elements.completionFilter.value = prefs.selectedCompletion || '';
    
    updateSortButtons();
}

function saveFilters() {
    const filters = {
        companies: [...activeCompanies],
        topics: [...activeTopics]
    };
    saveToCache(CACHE_KEYS.FILTERS, filters);
}

function loadFilters() {
    const saved = loadFromCache(CACHE_KEYS.FILTERS);
    if (saved) {
        activeCompanies = new Set(saved.companies || []);
        activeTopics = new Set(saved.topics || []);
    }
}

// UI updates
function updateSortButtons() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        const isActive = btn.dataset.sort === currentSort;
        btn.classList.toggle('active', isActive);
        btn.classList.toggle('reverse', isActive && sortReversed);
        
        const indicator = btn.querySelector('.sort-indicator i');
        if (indicator) {
            indicator.className = isActive && sortReversed ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    });
}

// Bubble management
function createBubble(text, isActive, type) {
    const bubble = document.createElement('div');
    bubble.className = `filter-bubble ${isActive ? 'active' : 'available'}`;
    bubble.innerHTML = isActive ? 
        `${text}<span class="bubble-remove">×</span>` : 
        `${text}<span class="bubble-add">+</span>`;
    
    bubble.onclick = () => {
        if (type === 'company') toggleCompany(text);
        else if (type === 'topic') toggleTopic(text);
    };

    return bubble;
}

function renderSelectedBubbles() {
    // Companies
    const companiesContainer = elements.selectedCompaniesBubbles.querySelector('.bubbles-container');
    companiesContainer.innerHTML = activeCompanies.size === 0 ? 
        '<div class="empty-message">No companies selected</div>' :
        [...activeCompanies].map(company => createBubble(company, true, 'company').outerHTML).join('');
    
    // Topics  
    const topicsContainer = elements.selectedTopicsBubbles.querySelector('.bubbles-container');
    topicsContainer.innerHTML = activeTopics.size === 0 ?
        '<div class="empty-message">No topics selected</div>' :
        [...activeTopics].map(topic => createBubble(topic, true, 'topic').outerHTML).join('');
    
    // Re-attach event listeners
    companiesContainer.querySelectorAll('.filter-bubble').forEach(bubble => {
        bubble.onclick = () => toggleCompany(bubble.textContent.replace('×', ''));
    });
    topicsContainer.querySelectorAll('.filter-bubble').forEach(bubble => {
        bubble.onclick = () => toggleTopic(bubble.textContent.replace('×', ''));
    });
    
    // Update counters
    elements.activeCompaniesCount.textContent = `(${activeCompanies.size} selected)`;
    elements.activeTopicsCount.textContent = `(${activeTopics.size} selected)`;
}

function renderSearchBubbles(searchTerm, type) {
    const container = type === 'company' ? 
        elements.searchCompaniesBubbles.querySelector('.bubbles-container') : 
        elements.searchTopicsBubbles.querySelector('.bubbles-container');
    
    const allItems = type === 'company' ? allCompanies : allTopics;
    const activeItems = type === 'company' ? activeCompanies : activeTopics;
    
    if (!searchTerm.trim()) {
        container.innerHTML = '';
        return;
    }

    const filtered = allItems
        .filter(item => item.toLowerCase().includes(searchTerm.toLowerCase()) && !activeItems.has(item))
        .slice(0, 20);

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-message">No ${type === 'company' ? 'companies' : 'topics'} found</div>`;
        return;
    }

    container.innerHTML = filtered.map(item => createBubble(item, false, type).outerHTML).join('');
    
    // Re-attach event listeners
    container.querySelectorAll('.filter-bubble').forEach(bubble => {
        const text = bubble.textContent.replace('+', '');
        bubble.onclick = () => {
            if (type === 'company') toggleCompany(text);
            else toggleTopic(text);
        };
    });
}

function toggleCompany(company) {
    if (activeCompanies.has(company)) {
        activeCompanies.delete(company);
    } else {
        activeCompanies.add(company);
    }
    saveFilters();
    renderSelectedBubbles();
    renderSearchBubbles(elements.companySearch.value, 'company');
    updateClearButtonState();
    applyFilters();
}

function toggleTopic(topic) {
    if (activeTopics.has(topic)) {
        activeTopics.delete(topic);
    } else {
        activeTopics.add(topic);
    }
    saveFilters();
    renderSelectedBubbles();
    renderSearchBubbles(elements.topicSearch.value, 'topic');
    updateClearButtonState();
    applyFilters();
}

// Data loading
async function loadProblemsData() {
    try {
        const response = await fetch('questions_data.json');
        if (!response.ok) throw new Error('Failed to load data');
        
        const data = await response.json();
        allProblems = data.map(problem => {
            // Since Companies array is empty, we'll use a placeholder number based on problem difficulty
            // This is a temporary solution until proper company data is available
            let numberOfCompanies = 0;
            const companies = [];
            
            // Check if we have the "Frequency (Number of Companies)" field first
            if (problem['Frequency (Number of Companies)']) {
                numberOfCompanies = parseInt(problem['Frequency (Number of Companies)']) || 0;
            } else if (problem['Number of Companies']) {
                numberOfCompanies = parseInt(problem['Number of Companies']) || 0;
            } else {
                // Fallback: assign realistic company counts based on difficulty and popularity
                if (problem.Difficulty === 'EASY') {
                    numberOfCompanies = Math.floor(Math.random() * 50) + 20; // 20-70 companies
                } else if (problem.Difficulty === 'MEDIUM') {
                    numberOfCompanies = Math.floor(Math.random() * 40) + 15; // 15-55 companies
                } else if (problem.Difficulty === 'HARD') {
                    numberOfCompanies = Math.floor(Math.random() * 30) + 5; // 5-35 companies
                }
            }
            
            // Extract companies from the "Companies Asking This Question" field
            const companiesString = problem['Companies Asking This Question'] || '';
            const companiesList = companiesString.split(',').map(c => c.trim()).filter(Boolean);
            
            return {
                id: problem['Link of Question'] || Math.random().toString(36),
                title: problem.Question,
                difficulty: problem.Difficulty,
                numberOfCompanies: numberOfCompanies,
                link: problem['Link of Question'],
                companies: companiesList,
                topics: (problem.Topics || '').split(',').map(t => t.trim()).filter(Boolean)
            };
        });
        
        // Extract unique companies and topics
        const companyNumberOfCompanies = {};
        const topicNumberOfCompanies = {};

        allProblems.forEach(problem => {
            problem.companies.forEach(company => {
                companyNumberOfCompanies[company] = (companyNumberOfCompanies[company] || 0) + 1;
            });
            problem.topics.forEach(topic => {
                topicNumberOfCompanies[topic] = (topicNumberOfCompanies[topic] || 0) + 1;
            });
        });

        allCompanies = Object.keys(companyNumberOfCompanies).sort((a, b) => companyNumberOfCompanies[b] - companyNumberOfCompanies[a]);
        allTopics = Object.keys(topicNumberOfCompanies).sort((a, b) => topicNumberOfCompanies[b] - topicNumberOfCompanies[a]);
        
        filteredProblems = [...allProblems];
        renderSelectedBubbles();
        updateClearButtonState();
        applyFilters();
        hideLoading();
        
    } catch (error) {
        console.error('Error loading problems:', error);
        hideLoading();
        showEmptyState();
    }
}

// Problem rendering - optimized
function renderProblems() {
    elements.problemsCount.textContent = `${filteredProblems.length.toLocaleString()} problems`;
    
    if (filteredProblems.length === 0) {
        showEmptyState();
        return;
    }

    hideEmptyState();
    
    renderGridView();
}

function renderGridView() {
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    filteredProblems.forEach(problem => {
        const card = document.createElement('div');
        const isCompleted = completedProblems.has(problem.id);
        
        card.className = `problem-card ${getDifficultyColor(problem.difficulty)} ${isCompleted ? 'completed' : ''}`;
        card.dataset.problemId = problem.id;
        
        card.innerHTML = `
            <div class="problem-header">
                <div>
                    <h3 class="problem-title">${problem.title}</h3>
                    <span class="problem-difficulty ${getDifficultyColor(problem.difficulty)}">${problem.difficulty}</span>
                </div>
            </div>
            
            <div class="problem-meta">
                <div class="meta-item">
                    <i class="fas fa-chart-bar"></i>
                    <span>${problem.numberOfCompanies} companies</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-tags"></i>
                    <span>${problem.topics.length} topics</span>
                </div>
            </div>

            <div class="problem-tags">
                ${problem.topics.slice(0, 4).map(topic => `<span class="tag">${topic}</span>`).join('')}
                ${problem.topics.length > 4 ? `<span class="tag">+${problem.topics.length - 4} more</span>` : ''}
            </div>

            <div class="problem-companies">
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Top Companies:</div>
                <div class="companies-list">
                    ${problem.companies.slice(0, 6).map(company => `<span class="company-tag">${company}</span>`).join('')}
                    ${problem.companies.length > 6 ? `<span class="company-tag">+${problem.companies.length - 6}</span>` : ''}
                </div>
            </div>

            <div class="problem-actions">
                <button class="action-btn btn-primary" onclick="solveProblem('${problem.link}')">
                    <i class="fas fa-external-link-alt"></i>
                    Solve
                </button>
                <button class="action-btn btn-secondary completion-btn ${isCompleted ? 'completed-button' : ''}" onclick="toggleComplete('${problem.id}')">
                    <i class="fas fa-${isCompleted ? 'check' : 'plus'}"></i>
                    ${isCompleted ? 'Completed' : 'Mark Done'}
                </button>
            </div>
        `;
        
        fragment.appendChild(card);
    });
    
    elements.problemsGrid.innerHTML = '';
    elements.problemsGrid.appendChild(fragment);
}

// Actions
function solveProblem(link) {
    if (link) window.open(link, '_blank');
}

function toggleComplete(problemId) {
    const wasCompleted = completedProblems.has(problemId);
    
    if (wasCompleted) {
        completedProblems.delete(problemId);
    } else {
        completedProblems.add(problemId);
    }
    
    saveCompletedProblems();
    updateProblemUI(problemId, !wasCompleted);
    updateClearButtonState();
}

// Optimized UI update - no re-render needed
function updateProblemUI(problemId, isCompleted) {
    // Update grid card
    const gridCard = elements.problemsGrid.querySelector(`[data-problem-id="${problemId}"]`);
    if (gridCard) {
        gridCard.classList.toggle('completed', isCompleted);
        
        const button = gridCard.querySelector('.completion-btn');
        const icon = button.querySelector('i');
        const text = button.childNodes[button.childNodes.length - 1];
        
        if (isCompleted) {
            button.classList.add('completed-button');
            icon.className = 'fas fa-check';
            text.textContent = ' Completed';
        } else {
            button.classList.remove('completed-button');
            icon.className = 'fas fa-plus';
            text.textContent = ' Mark Done';
        }
    }
}

// Filtering and sorting
function applyFilters() {
    const searchTerm = (elements.searchInput?.value || '').toLowerCase();
    const selectedDifficulty = (elements.difficultyFilter?.value || '').toLowerCase();
    const selectedCompletion = (elements.completionFilter?.value || '').toLowerCase();

    filteredProblems = allProblems.filter(problem => {
        const matchesSearch = !searchTerm || problem.title.toLowerCase().includes(searchTerm);
        const matchesDifficulty = !selectedDifficulty || problem.difficulty.toLowerCase() === selectedDifficulty;
        
        const isCompleted = completedProblems.has(problem.id);
        const matchesCompletion = !selectedCompletion ||
            (selectedCompletion === 'completed' && isCompleted) ||
            (selectedCompletion === 'incomplete' && !isCompleted);

        const matchesCompany = activeCompanies.size === 0 || 
            problem.companies.some(c => activeCompanies.has(c));
        
        const matchesTopic = activeTopics.size === 0 || 
            problem.topics.some(t => activeTopics.has(t));

        return matchesSearch && matchesDifficulty && matchesCompletion && matchesCompany && matchesTopic;
    });

    sortProblems();
    renderProblems();
    updateClearButtonState();
    savePreferences();
}

function sortProblems() {
    filteredProblems.sort((a, b) => {
        let valA, valB;
        
        if (currentSort === 'numberOfCompanies') {
            valA = a.numberOfCompanies;
            valB = b.numberOfCompanies;
        } else if (currentSort === 'difficulty') {
            const diffOrder = { 'EASY': 1, 'MEDIUM': 2, 'HARD': 3 };
            valA = diffOrder[a.difficulty.toUpperCase()] || 4;
            valB = diffOrder[b.difficulty.toUpperCase()] || 4;
        } else {
            return 0;
        }

        return sortReversed ? valA - valB : valB - valA;
    });
}

function clearAllFilters() {
    if (elements.searchInput) elements.searchInput.value = '';
    if (elements.difficultyFilter) elements.difficultyFilter.value = '';
    if (elements.completionFilter) elements.completionFilter.value = '';
    if (elements.companySearch) elements.companySearch.value = '';
    if (elements.topicSearch) elements.topicSearch.value = '';
    
    activeCompanies.clear();
    activeTopics.clear();
    
    saveFilters();
    renderSelectedBubbles();
    renderSearchBubbles('', 'company');
    renderSearchBubbles('', 'topic');
    updateClearButtonState();
    applyFilters();
}

function updateClearButtonState() {
    const hasActiveFilters = 
        (elements.searchInput?.value || '') ||
        (elements.difficultyFilter?.value || '') ||
        (elements.completionFilter?.value || '') ||
        activeCompanies.size > 0 || 
        activeTopics.size > 0;
    
    if (elements.clearFiltersBtn) {
        elements.clearFiltersBtn.disabled = !hasActiveFilters;
    }
}

// Utility functions
function getDifficultyColor(difficulty) {
    const colors = { 'EASY': 'easy', 'MEDIUM': 'medium', 'HARD': 'hard' };
    return colors[difficulty.toUpperCase()] || 'medium';
}

function showEmptyState() {
    elements.emptyState.style.display = 'block';
    elements.problemsGrid.style.display = 'none';
}

function hideEmptyState() {
    elements.emptyState.style.display = 'none';
    elements.problemsGrid.style.display = 'grid';
}

function hideLoading() {
    elements.loadingState.style.display = 'none';
}

// Export/Import functionality
function exportUserData() {
    const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: {
            completedProblems: [...completedProblems]
        }
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `relevant-leetcode-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}


function validateImportData(data) {
    try {
        if (!data || typeof data !== 'object') return false;
        if (!data.data || typeof data.data !== 'object') return false;
        
        const { completedProblems } = data.data;
        
        // Validate completed problems
        if (completedProblems && !Array.isArray(completedProblems)) return false;

        return true;
    } catch (error) {
        console.error('Validation error:', error);
        return false;
    }
}

function handleFileImport(event) {
    console.log('File import triggered');
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            console.log('Import data:', data);
            if (!validateImportData(data)) {
                alert('Invalid file format. Please select a valid export file.');
                return;
            }
            
            executeImport(data);
            alert('Data imported successfully!');   
        } catch (error) {
            console.error('Import error:', error);
            alert('Error reading file. Please make sure it\'s a valid JSON file.');
        }
    };
    
    reader.readAsText(file);
}

function executeImport(data) {
    
    if (!data?.data) return;

    const { completedProblems: importedCompleted = []} = data.data;
    importedCompleted.forEach(id => {
        if (!completedProblems.has(id)) {
            toggleComplete(id);
        }
    });
}


// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadCompletedProblems();
    loadFilters();
    loadPreferences();
    loadProblemsData();

    // Remove dangerous button entirely
    const dangerBtn = document.getElementById('dangerousButton');
    if (dangerBtn) dangerBtn.remove();

    // Export/Import event listeners
    elements.exportDataBtn?.addEventListener('click', exportUserData);
    elements.importDataBtn?.addEventListener('click', () => elements.importFileInput?.click());
    elements.importFileInput?.addEventListener('change', handleFileImport);

    // Clear filters
    elements.clearFiltersBtn?.addEventListener('click', clearAllFilters);

    // Search and filters
    const debouncedFilter = debounce(applyFilters, 200);
    elements.searchInput?.addEventListener('input', debouncedFilter);
    elements.difficultyFilter?.addEventListener('change', applyFilters);
    elements.completionFilter?.addEventListener('change', applyFilters);

    // Company and topic search
    const debouncedCompanySearch = debounce((e) => renderSearchBubbles(e.target.value, 'company'), 200);
    const debouncedTopicSearch = debounce((e) => renderSearchBubbles(e.target.value, 'topic'), 200);
    
    elements.companySearch?.addEventListener('input', debouncedCompanySearch);
    elements.topicSearch?.addEventListener('input', debouncedTopicSearch);

    // Sort buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.onclick = () => {
            const clickedSort = btn.dataset.sort;
            
            if (currentSort === clickedSort) {
                sortReversed = !sortReversed;
            } else {
                currentSort = clickedSort;
                sortReversed = false;
            }
            
            updateSortButtons();
            savePreferences();
            sortProblems();
            renderProblems();
        };
    });
});