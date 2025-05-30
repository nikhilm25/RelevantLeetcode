/**
 * LeetCode Questions Tracker - Modern ES6+ Implementation
 * @author nikhilm25
 * @version 2.0.0
 */

// Configuration
const CONFIG = {
    DATA_FILE: 'questions_data.json',
    CACHE_KEYS: {
        DATA: 'leetcode_questions_v2',
        PROGRESS: 'leetcode_progress_v2',
        SETTINGS: 'leetcode_settings_v2'
    },
    CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
    DEBOUNCE_DELAY: 300,
    VIRTUAL_SCROLL: {
        ITEM_HEIGHT: 60,
        BUFFER_SIZE: 10
    },
    PAGINATION: {
        ITEMS_PER_PAGE: 50
    }
};

// Data columns mapping
const COLUMNS = {
    DIFFICULTY: 'Difficulty',
    QUESTION: 'Question',
    FREQUENCY: 'Frequency (Number of Companies)',
    LINK: 'Link of Question',
    COMPANIES: 'Companies Asking This Question',
    TOPICS: 'Topics'
};

/**
 * Utility Functions
 */
class Utils {
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    static sanitizeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    static generateId() {
        return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    static formatNumber(num) {
        return new Intl.NumberFormat().format(num);
    }

    static truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    static normalizeString(str) {
        return str.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    static isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
}

/**
 * Storage Manager with IndexedDB fallback
 */
class StorageManager {
    constructor() {
        this.isIndexedDBSupported = this.checkIndexedDBSupport();
    }

    checkIndexedDBSupport() {
        return 'indexedDB' in window;
    }

    async get(key) {
        try {
            if (this.isIndexedDBSupported) {
                return await this.getFromIndexedDB(key);
            }
            return this.getFromLocalStorage(key);
        } catch (error) {
            console.warn('Storage get error:', error);
            return null;
        }
    }

    async set(key, data) {
        try {
            if (this.isIndexedDBSupported) {
                await this.setToIndexedDB(key, data);
            } else {
                this.setToLocalStorage(key, data);
            }
        } catch (error) {
            console.warn('Storage set error:', error);
        }
    }

    getFromLocalStorage(key) {
        const item = localStorage.getItem(key);
        if (!item) return null;

        try {
            const parsed = JSON.parse(item);
            if (parsed.expiry && Date.now() > parsed.expiry) {
                localStorage.removeItem(key);
                return null;
            }
            return parsed.data;
        } catch (error) {
            localStorage.removeItem(key);
            return null;
        }
    }

    setToLocalStorage(key, data) {
        const item = {
            data,
            timestamp: Date.now(),
            expiry: Date.now() + CONFIG.CACHE_EXPIRY
        };
        localStorage.setItem(key, JSON.stringify(item));
    }

    async getFromIndexedDB(key) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LeetCodeTracker', 1);
            
            request.onerror = () => reject(request.error);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('cache')) {
                    db.createObjectStore('cache', { keyPath: 'key' });
                }
            };
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['cache'], 'readonly');
                const store = transaction.objectStore('cache');
                const getRequest = store.get(key);
                
                getRequest.onsuccess = () => {
                    const result = getRequest.result;
                    if (!result || (result.expiry && Date.now() > result.expiry)) {
                        resolve(null);
                    } else {
                        resolve(result.data);
                    }
                };
                
                getRequest.onerror = () => reject(getRequest.error);
            };
        });
    }

    async setToIndexedDB(key, data) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LeetCodeTracker', 1);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['cache'], 'readwrite');
                const store = transaction.objectStore('cache');
                
                const item = {
                    key,
                    data,
                    timestamp: Date.now(),
                    expiry: Date.now() + CONFIG.CACHE_EXPIRY
                };
                
                const putRequest = store.put(item);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
        });
    }
}

/**
 * Data Manager
 */
class DataManager {
    constructor() {
        this.storage = new StorageManager();
        this.questions = [];
        this.filteredQuestions = [];
        this.completedQuestions = new Set();
        this.companies = new Set();
        this.topics = new Set();
    }

    async loadData() {
        try {
            // Try to load from cache first
            const cachedData = await this.storage.get(CONFIG.CACHE_KEYS.DATA);
            if (cachedData) {
                this.processData(cachedData);
                return true;
            }

            // Load from network
            const response = await fetch(CONFIG.DATA_FILE);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            await this.storage.set(CONFIG.CACHE_KEYS.DATA, data);
            this.processData(data);
            return true;

        } catch (error) {
            console.error('Failed to load data:', error);
            throw new Error(`Failed to load question data: ${error.message}`);
        }
    }

    processData(data) {
        this.questions = data.map(question => ({
            ...question,
            id: Utils.generateId(),
            normalizedTitle: Utils.normalizeString(question[COLUMNS.QUESTION] || ''),
            difficulty: question[COLUMNS.DIFFICULTY]?.toLowerCase() || 'unknown',
            frequency: parseInt(question[COLUMNS.FREQUENCY]) || 0,
            companies: this.parseCompanies(question[COLUMNS.COMPANIES]),
            topics: this.parseTopics(question[COLUMNS.TOPICS])
        }));

        this.extractUniqueValues();
        this.filteredQuestions = [...this.questions];
    }

    parseCompanies(companiesStr) {
        if (!companiesStr) return [];
        return companiesStr.split(',')
            .map(company => company.trim().toUpperCase())
            .filter(Boolean);
    }

    parseTopics(topicsStr) {
        if (!topicsStr) return [];
        return topicsStr.split(',')
            .map(topic => topic.trim())
            .filter(Boolean);
    }

    extractUniqueValues() {
        this.companies.clear();
        this.topics.clear();

        this.questions.forEach(question => {
            question.companies.forEach(company => this.companies.add(company));
            question.topics.forEach(topic => this.topics.add(topic));
        });
    }

    async loadProgress() {
        try {
            const progress = await this.storage.get(CONFIG.CACHE_KEYS.PROGRESS);
            if (progress && Array.isArray(progress)) {
                this.completedQuestions = new Set(progress);
            }
        } catch (error) {
            console.warn('Failed to load progress:', error);
        }
    }

    async saveProgress() {
        try {
            await this.storage.set(CONFIG.CACHE_KEYS.PROGRESS, Array.from(this.completedQuestions));
        } catch (error) {
            console.error('Failed to save progress:', error);
        }
    }

    toggleQuestionComplete(questionId) {
        if (this.completedQuestions.has(questionId)) {
            this.completedQuestions.delete(questionId);
        } else {
            this.completedQuestions.add(questionId);
        }
        this.saveProgress();
    }

    isQuestionComplete(questionId) {
        return this.completedQuestions.has(questionId);
    }

    getCompletionStats() {
        const total = this.filteredQuestions.length;
        const completed = this.filteredQuestions.filter(q => this.isQuestionComplete(q.id)).length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        return { total, completed, percentage };
    }
}

/**
 * Filter Manager
 */
class FilterManager {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.filters = {
            search: '',
            difficulty: '',
            status: '',
            companies: new Set(),
            topics: new Set()
        };
        this.sortBy = 'frequency-desc';
    }

    applyFilters() {
        let filtered = [...this.dataManager.questions];

        // Search filter
        if (this.filters.search) {
            const searchTerm = Utils.normalizeString(this.filters.search);
            filtered = filtered.filter(question => 
                question.normalizedTitle.includes(searchTerm)
            );
        }

        // Difficulty filter
        if (this.filters.difficulty) {
            filtered = filtered.filter(question => 
                question.difficulty === this.filters.difficulty.toLowerCase()
            );
        }

        // Status filter
        if (this.filters.status) {
            filtered = filtered.filter(question => {
                const isCompleted = this.dataManager.isQuestionComplete(question.id);
                return this.filters.status === 'completed' ? isCompleted : !isCompleted;
            });
        }

        // Companies filter
        if (this.filters.companies.size > 0) {
            filtered = filtered.filter(question =>
                Array.from(this.filters.companies).some(company =>
                    question.companies.includes(company)
                )
            );
        }

        // Topics filter
        if (this.filters.topics.size > 0) {
            filtered = filtered.filter(question =>
                Array.from(this.filters.topics).some(topic =>
                    question.topics.includes(topic)
                )
            );
        }

        // Apply sorting
        this.sortQuestions(filtered);

        this.dataManager.filteredQuestions = filtered;
        return filtered;
    }

    sortQuestions(questions) {
        const [field, direction] = this.sortBy.split('-');
        const isAsc = direction === 'asc';

        questions.sort((a, b) => {
            let valueA, valueB;

            switch (field) {
                case 'frequency':
                    valueA = a.frequency;
                    valueB = b.frequency;
                    break;
                case 'difficulty':
                    const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
                    valueA = difficultyOrder[a.difficulty] || 999;
                    valueB = difficultyOrder[b.difficulty] || 999;
                    break;
                case 'title':
                    valueA = a[COLUMNS.QUESTION] || '';
                    valueB = b[COLUMNS.QUESTION] || '';
                    break;
                default:
                    return 0;
            }

            if (typeof valueA === 'string') {
                valueA = valueA.toLowerCase();
                valueB = valueB.toLowerCase();
            }

            if (valueA < valueB) return isAsc ? -1 : 1;
            if (valueA > valueB) return isAsc ? 1 : -1;
            return 0;
        });
    }

    updateFilter(filterType, value) {
        switch (filterType) {
            case 'search':
            case 'difficulty':
            case 'status':
                this.filters[filterType] = value;
                break;
            case 'companies':
            case 'topics':
                if (this.filters[filterType].has(value)) {
                    this.filters[filterType].delete(value);
                } else {
                    this.filters[filterType].add(value);
                }
                break;
        }
        return this.applyFilters();
    }

    clearFilters() {
        this.filters = {
            search: '',
            difficulty: '',
            status: '',
            companies: new Set(),
            topics: new Set()
        };
        return this.applyFilters();
    }

    setSortBy(sortBy) {
        this.sortBy = sortBy;
        return this.applyFilters();
    }
}

/**
 * UI Manager
 */
class UIManager {
    constructor(dataManager, filterManager) {
        this.dataManager = dataManager;
        this.filterManager = filterManager;
        this.elements = {};
        this.currentView = 'table';
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        // Cache all DOM elements
        this.elements = {
            // States
            loadingState: document.getElementById('loadingState'),
            errorState: document.getElementById('errorState'),
            appContainer: document.getElementById('appContainer'),
            noResults: document.getElementById('noResults'),

            // Progress
            completedCount: document.getElementById('completedCount'),
            totalCount: document.getElementById('totalCount'),
            progressPercentage: document.getElementById('progressPercentage'),
            progressFill: document.getElementById('progressFill'),

            // Filters
            questionSearch: document.getElementById('questionSearch'),
            clearSearch: document.getElementById('clearSearch'),
            difficultySelect: document.getElementById('difficultySelect'),
            statusSelect: document.getElementById('statusSelect'),
            companySearch: document.getElementById('companySearch'),
            companySuggestions: document.getElementById('companySuggestions'),
            selectedCompanies: document.getElementById('selectedCompanies'),
            topicSearch: document.getElementById('topicSearch'),
            topicSuggestions: document.getElementById('topicSuggestions'),
            selectedTopics: document.getElementById('selectedTopics'),
            clearFilters: document.getElementById('clearFilters'),
            clearFiltersFromEmpty: document.getElementById('clearFiltersFromEmpty'),
            resultsCount: document.getElementById('resultsCount'),

            // Table
            tableView: document.getElementById('tableView'),
            cardView: document.getElementById('cardView'),
            sortSelect: document.getElementById('sortSelect'),
            tableContainer: document.getElementById('tableContainer'),
            tableBody: document.getElementById('tableBody'),
            cardContainer: document.getElementById('cardContainer'),
            cardGrid: document.getElementById('cardGrid'),

            // Error handling
            errorMessage: document.getElementById('errorMessage'),
            retryButton: document.getElementById('retryButton'),

            // Theme
            themeToggle: document.getElementById('themeToggle'),
            currentYear: document.getElementById('currentYear')
        };
    }

    setupEventListeners() {
        // Search with debouncing
        this.elements.questionSearch.addEventListener('input', 
            Utils.debounce((e) => {
                this.filterManager.updateFilter('search', e.target.value);
                this.renderQuestions();
                this.updateResultsCount();
            }, CONFIG.DEBOUNCE_DELAY)
        );

        // Clear search
        this.elements.clearSearch.addEventListener('click', () => {
            this.elements.questionSearch.value = '';
            this.filterManager.updateFilter('search', '');
            this.renderQuestions();
            this.updateResultsCount();
        });

        // Difficulty filter
        this.elements.difficultySelect.addEventListener('change', (e) => {
            this.filterManager.updateFilter('difficulty', e.target.value);
            this.renderQuestions();
            this.updateResultsCount();
        });

        // Status filter
        this.elements.statusSelect.addEventListener('change', (e) => {
            this.filterManager.updateFilter('status', e.target.value);
            this.renderQuestions();
            this.updateResultsCount();
        });

        // Company autocomplete
        this.setupAutocomplete(
            this.elements.companySearch,
            this.elements.companySuggestions,
            this.elements.selectedCompanies,
            'companies'
        );

        // Topic autocomplete
        this.setupAutocomplete(
            this.elements.topicSearch,
            this.elements.topicSuggestions,
            this.elements.selectedTopics,
            'topics'
        );

        // Clear filters
        this.elements.clearFilters.addEventListener('click', () => {
            this.clearAllFilters();
        });

        this.elements.clearFiltersFromEmpty.addEventListener('click', () => {
            this.clearAllFilters();
        });

        // View toggle
        this.elements.tableView.addEventListener('click', () => {
            this.switchView('table');
        });

        this.elements.cardView.addEventListener('click', () => {
            this.switchView('card');
        });

        // Sort
        this.elements.sortSelect.addEventListener('change', (e) => {
            this.filterManager.setSortBy(e.target.value);
            this.renderQuestions();
        });

        // Error retry
        this.elements.retryButton.addEventListener('click', () => {
            this.initializeApp();
        });

        // Theme toggle
        this.elements.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });

        // Update current year
        this.elements.currentYear.textContent = new Date().getFullYear();
    }

    setupAutocomplete(input, suggestions, selectedContainer, filterType) {
        let selectedIndex = -1;

        input.addEventListener('input', Utils.debounce((e) => {
            const value = e.target.value.trim();
            if (value.length >= 2) {
                this.showSuggestions(value, suggestions, filterType);
            } else {
                this.hideSuggestions(suggestions);
            }
            selectedIndex = -1;
        }, 200));

        input.addEventListener('keydown', (e) => {
            const items = suggestions.querySelectorAll('.suggestion-item');
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                    this.updateSuggestionSelection(items, selectedIndex);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    selectedIndex = Math.max(selectedIndex - 1, 0);
                    this.updateSuggestionSelection(items, selectedIndex);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (selectedIndex >= 0 && items[selectedIndex]) {
                        this.selectSuggestion(items[selectedIndex].textContent, filterType, input, suggestions, selectedContainer);
                    }
                    break;
                case 'Escape':
                    this.hideSuggestions(suggestions);
                    selectedIndex = -1;
                    break;
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(() => this.hideSuggestions(suggestions), 200);
        });

        input.addEventListener('focus', () => {
            if (input.value.length >= 2) {
                this.showSuggestions(input.value, suggestions, filterType);
            }
        });
    }

    showSuggestions(value, suggestions, filterType) {
        const normalizedValue = value.toLowerCase();
        const dataSet = filterType === 'companies' ? this.dataManager.companies : this.dataManager.topics;
        const filtered = Array.from(dataSet)
            .filter(item => item.toLowerCase().includes(normalizedValue))
            .slice(0, 10);

        suggestions.innerHTML = '';
        
        if (filtered.length === 0) {
            this.hideSuggestions(suggestions);
            return;
        }

        filtered.forEach(item => {
            const li = document.createElement('li');
            li.className = 'suggestion-item';
            li.textContent = item;
            li.setAttribute('role', 'option');
            li.addEventListener('click', () => {
                this.selectSuggestion(item, filterType, 
                    filterType === 'companies' ? this.elements.companySearch : this.elements.topicSearch,
                    suggestions,
                    filterType === 'companies' ? this.elements.selectedCompanies : this.elements.selectedTopics
                );
            });
            suggestions.appendChild(li);
        });

        suggestions.classList.remove('hidden');
        suggestions.parentElement.setAttribute('aria-expanded', 'true');
    }

    hideSuggestions(suggestions) {
        suggestions.classList.add('hidden');
        suggestions.parentElement.setAttribute('aria-expanded', 'false');
    }

    updateSuggestionSelection(items, selectedIndex) {
        items.forEach((item, index) => {
            item.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
        });
    }

    selectSuggestion(value, filterType, input, suggestions, selectedContainer) {
        this.filterManager.updateFilter(filterType, value);
        input.value = '';
        this.hideSuggestions(suggestions);
        this.renderSelectedFilters(selectedContainer, filterType);
        this.renderQuestions();
        this.updateResultsCount();
    }

    renderSelectedFilters(container, filterType) {
        const filters = this.filterManager.filters[filterType];
        container.innerHTML = '';

        filters.forEach(filter => {
            const tag = document.createElement('span');
            tag.className = 'filter-tag';
            tag.innerHTML = `
                ${Utils.sanitizeHTML(filter)}
                <button type="button" class="filter-tag-remove" aria-label="Remove ${filter} filter">×</button>
            `;

            tag.querySelector('.filter-tag-remove').addEventListener('click', () => {
                this.filterManager.updateFilter(filterType, filter);
                this.renderSelectedFilters(container, filterType);
                this.renderQuestions();
                this.updateResultsCount();
            });

            container.appendChild(tag);
        });
    }

    clearAllFilters() {
        // Clear form inputs
        this.elements.questionSearch.value = '';
        this.elements.difficultySelect.value = '';
        this.elements.statusSelect.value = '';
        this.elements.companySearch.value = '';
        this.elements.topicSearch.value = '';

        // Clear selected filters
        this.elements.selectedCompanies.innerHTML = '';
        this.elements.selectedTopics.innerHTML = '';

        // Clear filter manager
        this.filterManager.clearFilters();
        
        // Re-render
        this.renderQuestions();
        this.updateResultsCount();
    }

    switchView(view) {
        this.currentView = view;

        // Update button states
        this.elements.tableView.classList.toggle('active', view === 'table');
        this.elements.cardView.classList.toggle('active', view === 'card');
        this.elements.tableView.setAttribute('aria-pressed', view === 'table');
        this.elements.cardView.setAttribute('aria-pressed', view === 'card');

        // Show/hide containers
        this.elements.tableContainer.classList.toggle('hidden', view !== 'table');
        this.elements.cardContainer.classList.toggle('hidden', view !== 'card');

        // Re-render questions in the new view
        this.renderQuestions();
    }

    renderQuestions() {
        const questions = this.dataManager.filteredQuestions;
        
        if (questions.length === 0) {
            this.elements.noResults.classList.remove('hidden');
            return;
        }

        this.elements.noResults.classList.add('hidden');

        if (this.currentView === 'table') {
            this.renderTableView(questions);
        } else {
            this.renderCardView(questions);
        }

        this.updateProgressStats();
    }

    renderTableView(questions) {
        this.elements.tableBody.innerHTML = '';

        questions.forEach(question => {
            const row = document.createElement('tr');
            row.className = this.dataManager.isQuestionComplete(question.id) ? 'completed' : '';

            row.innerHTML = `
                <td class="status-col">
                    <button type="button" class="status-toggle ${this.dataManager.isQuestionComplete(question.id) ? 'completed' : ''}"
                            aria-label="${this.dataManager.isQuestionComplete(question.id) ? 'Mark as incomplete' : 'Mark as complete'}"
                            data-question-id="${question.id}">
                        ${this.dataManager.isQuestionComplete(question.id) ? '✓' : '○'}
                    </button>
                </td>
                <td>
                    <span class="difficulty-badge difficulty-${question.difficulty}">
                        ${question[COLUMNS.DIFFICULTY] || 'Unknown'}
                    </span>
                </td>
                <td>
                    <strong>${Utils.sanitizeHTML(question[COLUMNS.QUESTION] || 'Untitled')}</strong>
                </td>
                <td>${Utils.formatNumber(question.frequency)}</td>
                <td>
                    ${question[COLUMNS.LINK] && Utils.isValidUrl(question[COLUMNS.LINK]) 
                        ? `<a href="${question[COLUMNS.LINK]}" target="_blank" rel="noopener noreferrer" aria-label="Open ${question[COLUMNS.QUESTION]} on LeetCode">View Problem</a>`
                        : 'N/A'
                    }
                </td>
                <td>${this.renderTags(question.companies, 'company')}</td>
                <td>${this.renderTags(question.topics, 'topic')}</td>
            `;

            // Add event listener for status toggle
            const statusButton = row.querySelector('.status-toggle');
            statusButton.addEventListener('click', () => {
                this.toggleQuestionStatus(question.id);
            });

            this.elements.tableBody.appendChild(row);
        });
    }

    renderCardView(questions) {
        this.elements.cardGrid.innerHTML = '';

        questions.forEach(question => {
            const card = document.createElement('div');
            card.className = `question-card ${this.dataManager.isQuestionComplete(question.id) ? 'completed' : ''}`;

            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${Utils.sanitizeHTML(question[COLUMNS.QUESTION] || 'Untitled')}</h3>
                    <span class="card-frequency">${Utils.formatNumber(question.frequency)} companies</span>
                </div>
                <div class="card-meta">
                    <span class="difficulty-badge difficulty-${question.difficulty}">
                        ${question[COLUMNS.DIFFICULTY] || 'Unknown'}
                    </span>
                </div>
                <div class="card-content">
                    <div class="card-section">
                        <strong>Companies:</strong>
                        <div class="tag-list">${this.renderTags(question.companies.slice(0, 5), 'company')}</div>
                    </div>
                    <div class="card-section">
                        <strong>Topics:</strong>
                        <div class="tag-list">${this.renderTags(question.topics.slice(0, 5), 'topic')}</div>
                    </div>
                </div>
                <div class="card-actions">
                    <button type="button" class="status-toggle ${this.dataManager.isQuestionComplete(question.id) ? 'completed' : ''}"
                            aria-label="${this.dataManager.isQuestionComplete(question.id) ? 'Mark as incomplete' : 'Mark as complete'}"
                            data-question-id="${question.id}">
                        ${this.dataManager.isQuestionComplete(question.id) ? '✓ Completed' : 'Mark Complete'}
                    </button>
                    ${question[COLUMNS.LINK] && Utils.isValidUrl(question[COLUMNS.LINK])
                        ? `<a href="${question[COLUMNS.LINK]}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Solve Problem</a>`
                        : '<span class="text-muted">No link available</span>'
                    }
                </div>
            `;

            // Add event listener for status toggle
            const statusButton = card.querySelector('.status-toggle');
            statusButton.addEventListener('click', () => {
                this.toggleQuestionStatus(question.id);
            });

            this.elements.cardGrid.appendChild(card);
        });
    }

    renderTags(items, type) {
        if (!items || items.length === 0) return '<span class="text-muted">None</span>';

        const maxVisible = 3;
        let html = '';

        items.slice(0, maxVisible).forEach(item => {
            html += `<span class="tag">${Utils.sanitizeHTML(item)}</span>`;
        });

        if (items.length > maxVisible) {
            html += `<span class="tag tag-more" title="${items.slice(maxVisible).join(', ')}">+${items.length - maxVisible} more</span>`;
        }

        return html;
    }

    toggleQuestionStatus(questionId) {
        this.dataManager.toggleQuestionComplete(questionId);
        this.renderQuestions();
        this.updateResultsCount();
    }

    updateProgressStats() {
        const stats = this.dataManager.getCompletionStats();
        
        this.elements.completedCount.textContent = Utils.formatNumber(stats.completed);
        this.elements.totalCount.textContent = Utils.formatNumber(stats.total);
        this.elements.progressPercentage.textContent = `${stats.percentage}%`;
        this.elements.progressFill.style.width = `${stats.percentage}%`;
        this.elements.progressFill.setAttribute('aria-valuenow', stats.percentage);
    }

    updateResultsCount() {
        const count = this.dataManager.filteredQuestions.length;
        const total = this.dataManager.questions.length;
        
        this.elements.resultsCount.textContent = count === total 
            ? `${Utils.formatNumber(count)} questions`
            : `${Utils.formatNumber(count)} of ${Utils.formatNumber(total)} questions`;
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.loadingState.classList.add('hidden');
        this.elements.errorState.classList.remove('hidden');
        this.elements.appContainer.classList.add('hidden');
    }

    showApp() {
        this.elements.loadingState.classList.add('hidden');
        this.elements.errorState.classList.add('hidden');
        this.elements.appContainer.classList.remove('hidden');
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        
        // Update theme toggle icon
        const icon = this.elements.themeToggle.querySelector('.theme-icon');
        icon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
        
        // Save preference
        localStorage.setItem('theme', newTheme);
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        const icon = this.elements.themeToggle.querySelector('.theme-icon');
        icon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
    }

    handleKeyboardNavigation(e) {
        // Global keyboard shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'k':
                    e.preventDefault();
                    this.elements.questionSearch.focus();
                    break;
                case 'Enter':
                    if (e.target.tagName === 'INPUT') {
                        e.target.blur();
                    }
                    break;
            }
        }

        // Escape key handling
        if (e.key === 'Escape') {
            if (document.activeElement.tagName === 'INPUT') {
                document.activeElement.blur();
            }
            // Hide any open suggestion lists
            this.hideSuggestions(this.elements.companySuggestions);
            this.hideSuggestions(this.elements.topicSuggestions);
        }
    }

    async initializeApp() {
        try {
            this.elements.loadingState.classList.remove('hidden');
            this.elements.errorState.classList.add('hidden');
            this.elements.appContainer.classList.add('hidden');

            await this.dataManager.loadData();
            await this.dataManager.loadProgress();

            this.renderSelectedFilters(this.elements.selectedCompanies, 'companies');
            this.renderSelectedFilters(this.elements.selectedTopics, 'topics');
            this.renderQuestions();
            this.updateResultsCount();
            this.loadTheme();
            
            this.showApp();

        } catch (error) {
            console.error('App initialization failed:', error);
            this.showError(error.message);
        }
    }
}

/**
 * Application Controller
 */
class App {
    constructor() {
        this.dataManager = new DataManager();
        this.filterManager = new FilterManager(this.dataManager);
        this.uiManager = new UIManager(this.dataManager, this.filterManager);
    }

    async init() {
        try {
            await this.uiManager.initializeApp();
        } catch (error) {
            console.error('Failed to initialize app:', error);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { App, DataManager, FilterManager, UIManager, Utils };
}