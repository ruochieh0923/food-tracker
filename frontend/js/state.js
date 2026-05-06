const State = (() => {
  const state = {
    currentPage: 'dashboard',
    meals: { data: [], total: 0, page: 1, limit: 50 },
    filters: {
      search: '', category: '', restaurant: '', tag: '',
      date_from: '', date_to: '', sort_by: 'created_at', sort_dir: 'desc',
    },
    meta: { categories: [], restaurants: [], tags: [] },
    profile: {},
    summary: {},
    editingMealId: null,
  };

  const listeners = {};

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(cb => cb(data));
  }

  function set(key, value) {
    state[key] = value;
    emit('change', { key, value });
    emit(`change:${key}`, value);
  }

  function get(key) {
    return key ? state[key] : state;
  }

  function setFilter(key, value) {
    state.filters[key] = value;
    state.meals.page = 1;
    emit('filters-changed', state.filters);
  }

  function resetFilters() {
    Object.keys(state.filters).forEach(k => {
      if (!['sort_by', 'sort_dir'].includes(k)) state.filters[k] = '';
    });
    state.meals.page = 1;
    emit('filters-changed', state.filters);
  }

  return { on, emit, set, get, setFilter, resetFilters };
})();
