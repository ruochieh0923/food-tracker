const API = (() => {
  const BASE = '/api';

  async function req(method, path, body, isForm = false) {
    const opts = { method };
    if (body) {
      if (isForm) {
        opts.body = body;
      } else {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(BASE + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  return {
    // Meals
    getMeals: (params = {}) => {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''));
      return req('GET', `/meals?${q}`);
    },
    getMealMeta: () => req('GET', '/meals/meta'),
    getMeal: (id) => req('GET', `/meals/${id}`),
    createMeal: (data) => req('POST', '/meals', data),
    updateMeal: (id, data) => req('PUT', `/meals/${id}`, data),
    deleteMeal: (id) => req('DELETE', `/meals/${id}`),

    // AI
    autocomplete: (userInput) => req('POST', '/ai/autocomplete', { user_input: userInput }),
    estimateNutrition: (data) => req('POST', '/ai/estimate', data),
    analyzeDay: (date) => req('POST', '/ai/analyze-day', { date }),
    getRecommendations: (date) => req('POST', '/ai/recommend', { date }),
    getCacheStatus: () => req('GET', '/ai/cache/status'),
    clearCache: () => req('DELETE', '/ai/cache'),

    // Dashboard
    getSummary: (date) => req('GET', `/dashboard/summary${date ? `?target_date=${date}` : ''}`),
    getTrends: (days) => req('GET', `/dashboard/trends?days=${days}`),
    getCategoryBreakdown: (days) => req('GET', `/dashboard/category-breakdown?days=${days}`),
    getLeaderboard: () => req('GET', '/dashboard/leaderboard'),
    getStats: () => req('GET', '/dashboard/stats'),

    // Import
    previewCSV: (file, assignDate) => {
      const fd = new FormData();
      fd.append('file', file);
      if (assignDate) fd.append('assign_date', assignDate);
      return req('POST', '/import/csv/preview', fd, true);
    },
    confirmImport: (data) => req('POST', '/import/csv/confirm', data),

    // Profile
    getProfile: () => req('GET', '/profile'),
    updateProfile: (data) => req('PUT', '/profile', data),

    // Health
    health: () => req('GET', '/health'),
  };
})();
