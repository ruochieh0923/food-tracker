// Toast notifications
const Toast = {
  show(msg, type = 'info', duration = 3500) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, duration);
  }
};

// Main UI controller
const UI = (() => {
  let currentPage = 'dashboard';
  let mealsPage = 1;
  const todayStr = new Date().toISOString().split('T')[0];

  function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    document.querySelector('.topbar-title').textContent = {
      dashboard: '📊 今日飲食總覽', meals: '🍽️ 餐點清單', analysis: '🧠 AI 分析',
      import: '📥 匯入資料', profile: '⚙️ 目標設定'
    }[page] || page;

    if (page === 'dashboard') loadDashboard();
    if (page === 'meals') loadMeals();
    if (page === 'analysis') {/* triggered manually */}
  }

  function onDashboardMealEdit(meal) {
    Modal.openMealModal(meal);
    // After modal saves, refresh dashboard
    const saveBtn = document.getElementById('meal-save-btn');
    const handler = async () => {
      saveBtn.removeEventListener('click', handler);
      // small delay to let save complete
      setTimeout(() => {
        Dashboard.renderTodayMeals(todayStr, onDashboardMealEdit);
        Dashboard.renderSummary(todayStr);
        checkTodayReminder();
      }, 500);
    };
    saveBtn.addEventListener('click', handler);
  }

  async function loadDashboard() {
    await Promise.allSettled([
      Dashboard.renderSummary(todayStr),
      Dashboard.renderLeaderboard(),
      Dashboard.renderQuickRecommend('', todayStr),
      Dashboard.renderTodayMeals(todayStr, onDashboardMealEdit),
    ]);
    await Promise.allSettled([
      Dashboard.renderTrends(),
    ]);
    checkTodayReminder();

    // Wire "today add" button
    document.getElementById('today-add-btn')?.addEventListener('click', () => {
      Modal.openMealModal();
      const saveBtn = document.getElementById('meal-save-btn');
      const handler = () => {
        saveBtn.removeEventListener('click', handler);
        setTimeout(() => {
          Dashboard.renderTodayMeals(todayStr, onDashboardMealEdit);
          Dashboard.renderSummary(todayStr);
          checkTodayReminder();
        }, 500);
      };
      saveBtn.addEventListener('click', handler);
    });
  }

  async function loadMeals() {
    const filters = State.get('filters');
    const el = document.getElementById('meals-table-container');
    const paginEl = document.getElementById('meals-pagination');
    el.innerHTML = '<div class="loading"><div class="spinner"></div> 載入中…</div>';

    try {
      const params = {
        ...filters,
        page: mealsPage,
        limit: 50,
      };
      const data = await API.getMeals(params);
      State.set('meals', data);
      Table.render(el, data.data, filters);
      Table.renderPagination(paginEl, data.total, data.page, data.limit);

      // Bind table events
      el.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          const meal = await API.getMeal(id);
          Modal.openMealModal(meal);
        });
      });
      el.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          if (!confirm('確定刪除？')) return;
          await API.deleteMeal(+btn.dataset.id);
          Toast.show('已刪除', 'success');
          loadMeals();
        });
      });
      el.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const field = th.dataset.sort;
          const cur = State.get('filters');
          if (cur.sort_by === field) {
            State.setFilter('sort_dir', cur.sort_dir === 'asc' ? 'desc' : 'asc');
          } else {
            State.setFilter('sort_by', field);
            State.setFilter('sort_dir', 'desc');
          }
          loadMeals();
        });
      });
      paginEl.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          mealsPage = +btn.dataset.page;
          loadMeals();
        });
      });
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
    }
  }

  async function loadMeta() {
    try {
      const meta = await API.getMealMeta();
      State.set('meta', meta);

      // Filter bar category dropdown
      const catSelect = document.getElementById('filter-category');
      if (catSelect) {
        catSelect.innerHTML = '<option value="">所有類別</option>' +
          meta.categories.map(c => `<option value="${c}">${c}</option>`).join('');
      }

      // Modal datalists (autocomplete)
      const restList = document.getElementById('restaurant-list');
      if (restList) {
        restList.innerHTML = meta.restaurants.map(r => `<option value="${r}">`).join('');
      }
      const catList = document.getElementById('category-list');
      if (catList) {
        catList.innerHTML = meta.categories.map(c => `<option value="${c}">`).join('');
      }
    } catch (_) {}
  }

  async function checkTodayReminder() {
    const key = `reminder-dismissed-${todayStr}`;
    if (localStorage.getItem(key)) return;
    try {
      const data = await API.getMeals({ date_from: todayStr, date_to: todayStr, limit: 1 });
      const banner = document.getElementById('today-reminder');
      if (banner) {
        if (data.total === 0) {
          banner.style.display = 'block';
          // Dismiss button already in HTML; also auto-dismiss on new meal add
          banner.querySelector('button:last-child').addEventListener('click', () => {
            localStorage.setItem(key, '1');
          });
        } else {
          banner.style.display = 'none';
        }
      }
    } catch (_) {}
  }

  async function loadProfile() {
    try {
      const p = await API.getProfile();
      State.set('profile', p);
      const fields = ['name', 'tdee_calories', 'goal', 'target_protein_g', 'target_carbs_g', 'target_fat_g', 'target_sodium_mg'];
      fields.forEach(f => {
        const el = document.getElementById(`profile-${f}`);
        if (el) el.value = p[f] ?? '';
      });
    } catch (_) {}
  }

  function initFilters() {
    const searchEl = document.getElementById('filter-search');
    const catEl = document.getElementById('filter-category');
    let searchTimer;

    searchEl?.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        State.setFilter('search', e.target.value);
        mealsPage = 1;
        loadMeals();
      }, 350);
    });

    catEl?.addEventListener('change', e => {
      State.setFilter('category', e.target.value);
      mealsPage = 1;
      loadMeals();
    });

    document.getElementById('filter-reset')?.addEventListener('click', () => {
      State.resetFilters();
      searchEl.value = '';
      catEl.value = '';
      mealsPage = 1;
      loadMeals();
    });
  }

  function _flashFill(name) {
    const el = document.querySelector(`[name="${name}"], #${name}`);
    if (!el) return;
    el.style.transition = 'background 0.1s';
    el.style.background = 'rgba(249,115,22,0.15)';
    setTimeout(() => { el.style.background = ''; }, 1200);
  }

  function _applyAutocompleteResult(r) {
    const form = document.getElementById('meal-form');
    if (!form) return;

    const setField = (name, val) => {
      if (val == null || val === '') return;
      const el = form.querySelector(`[name="${name}"]`);
      if (el && !el.value) { el.value = val; _flashFill(name); }
    };

    // Text fields
    setField('meal_name', r.meal_name);
    setField('restaurant', r.restaurant);
    setField('category', r.category);
    setField('satiety', r.satiety);
    setField('notes', r.notes);

    // Numeric fields
    ['calories', 'protein_g', 'carbs_g', 'fat_g', 'sodium_mg', 'fiber_g'].forEach(f => {
      const el = form.querySelector(`[name="${f}"]`);
      if (el && !el.value && r[f] != null) { el.value = Math.round(r[f] * 10) / 10; _flashFill(f); }
    });

    // Rating: 簡單評級 + stars
    if (r.rating_text && window.Modal) {
      // Trigger the simple rating widget
      const container = document.getElementById('simple-rating-stars');
      const btn = container?.querySelector(`[data-text="${r.rating_text}"]`);
      if (btn) btn.click();
    }

    // Show AI analysis summary
    const panel = document.getElementById('autocomplete-result');
    if (panel) {
      const wColors = { LOW: 'var(--green)', MEDIUM: 'var(--yellow)', HIGH: 'var(--red)' };
      const wLabels = { LOW: '低', MEDIUM: '中', HIGH: '高' };
      const score = r.fat_loss_score || 0;
      const scoreColor = score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--yellow)' : 'var(--red)';
      const isWarn = r.is_fallback || r.error;

      panel.style.display = 'block';
      panel.innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start">
          <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;flex:1;min-width:180px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">減脂友善度</div>
            <div style="font-size:20px;font-weight:700;color:${scoreColor}">${score}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${r.fat_loss_label || ''}</div>
          </div>
          <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;flex:1;min-width:140px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">水腫風險</div>
            <div style="font-size:20px;font-weight:700;color:${wColors[r.water_risk] || 'var(--text-primary)'}">
              ${wLabels[r.water_risk] || '—'}
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">鈉 ${Math.round(r.sodium_mg || 0)}mg</div>
          </div>
          <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;flex:2;min-width:200px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">營養摘要</div>
            <div style="font-size:13px;font-family:var(--mono);color:var(--text-primary)">
              🔥 ${Math.round(r.calories || 0)} kcal &nbsp;
              💪 ${Math.round(r.protein_g || 0)}g 蛋白 &nbsp;
              🌾 ${Math.round(r.carbs_g || 0)}g 碳水 &nbsp;
              🥑 ${Math.round(r.fat_g || 0)}g 脂
            </div>
            ${isWarn ? `<div style="font-size:11.5px;color:var(--yellow);margin-top:4px">⚠️ ${r.error || '關鍵字估算，信心度較低'}</div>` : ''}
          </div>
        </div>`;
    }
  }

  function initMealModal() {
    document.getElementById('meal-modal-overlay')?.addEventListener('click', e => {
      if (e.target.id === 'meal-modal-overlay') Modal.close('meal-modal-overlay');
    });
    document.getElementById('meal-modal-close')?.addEventListener('click', () => Modal.close('meal-modal-overlay'));
    document.getElementById('meal-modal-cancel')?.addEventListener('click', () => Modal.close('meal-modal-overlay'));

    // AI autocomplete button
    document.getElementById('btn-ai-autocomplete')?.addEventListener('click', async () => {
      const input = document.getElementById('quick-input-text')?.value?.trim();
      if (!input) { Toast.show('請輸入餐點描述', 'error'); return; }
      const btn = document.getElementById('btn-ai-autocomplete');
      btn.textContent = '⏳ 分析中…';
      btn.disabled = true;
      // Clear previous result
      const panel = document.getElementById('autocomplete-result');
      if (panel) panel.style.display = 'none';
      try {
        const result = await API.autocomplete(input);
        _applyAutocompleteResult(result);
        Toast.show(result.is_fallback ? '已使用關鍵字估算，可手動調整' : 'AI 補完完成！', result.is_fallback ? 'info' : 'success');
      } catch (e) {
        Toast.show(`補完失敗：${e.message}`, 'error');
      } finally {
        btn.textContent = '✦ AI 補完';
        btn.disabled = false;
      }
    });

    // Enter key in quick input → trigger autocomplete
    document.getElementById('quick-input-text')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-ai-autocomplete')?.click();
      }
    });

    // AI estimate button
    document.getElementById('btn-ai-estimate')?.addEventListener('click', async () => {
      const form = document.getElementById('meal-form');
      const name = form.querySelector('[name="meal_name"]')?.value?.trim();
      const rest = form.querySelector('[name="restaurant"]')?.value?.trim();
      if (!name) { Toast.show('請先填入餐點名稱', 'error'); return; }
      const btn = document.getElementById('btn-ai-estimate');
      btn.textContent = '⏳ 估算中…';
      btn.disabled = true;
      try {
        const result = await API.estimateNutrition({ meal_name: name, restaurant: rest });
        Modal.showAIResult(result);
        Toast.show(result.from_cache ? '已從快取取得估算' : 'AI 估算完成', 'success');
      } catch (e) {
        Toast.show(`AI 估算失敗：${e.message}`, 'error');
      } finally {
        btn.textContent = '✦ AI 估算熱量';
        btn.disabled = false;
      }
    });

    // Save meal
    document.getElementById('meal-save-btn')?.addEventListener('click', async () => {
      const form = document.getElementById('meal-form');
      const data = Modal.getMealFormData(form);
      if (!data.meal_name) { Toast.show('請填入餐點名稱', 'error'); return; }
      const editId = State.get('editingMealId');
      try {
        if (editId) {
          await API.updateMeal(editId, data);
          Toast.show('已更新', 'success');
        } else {
          await API.createMeal(data);
          Toast.show('已新增', 'success');
        }
        Modal.close('meal-modal-overlay');
        if (currentPage === 'meals') loadMeals();
        if (currentPage === 'dashboard') loadDashboard();
      } catch (e) {
        Toast.show(`儲存失敗：${e.message}`, 'error');
      }
    });
  }

  function initAnalysisPage() {
    const dateEl = document.getElementById('analysis-date');
    if (dateEl) dateEl.value = todayStr;
    document.getElementById('btn-analyze')?.addEventListener('click', async () => {
      const date = dateEl?.value || todayStr;
      await Dashboard.renderAnalysis(date);
    });
    document.getElementById('btn-recommend')?.addEventListener('click', async () => {
      const date = dateEl?.value || todayStr;
      await Dashboard.renderRecommendations(date);
    });
  }

  function initProfilePage() {
    document.getElementById('profile-save-btn')?.addEventListener('click', async () => {
      const fields = { name: 'name', tdee_calories: 'tdee_calories', goal: 'goal',
        target_protein_g: 'target_protein_g', target_carbs_g: 'target_carbs_g',
        target_fat_g: 'target_fat_g', target_sodium_mg: 'target_sodium_mg' };
      const data = {};
      Object.entries(fields).forEach(([key, id]) => {
        const el = document.getElementById(`profile-${id}`);
        if (el) {
          const v = el.value.trim();
          if (v) data[key] = isNaN(v) ? v : parseFloat(v);
        }
      });
      try {
        await API.updateProfile(data);
        Toast.show('設定已儲存', 'success');
        State.set('profile', { ...State.get('profile'), ...data });
      } catch (e) {
        Toast.show(`儲存失敗：${e.message}`, 'error');
      }
    });
  }

  function initQuickRec() {
    document.querySelectorAll('.rec-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rec-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Dashboard.renderQuickRecommend(btn.dataset.type, todayStr);
      });
    });
  }

  async function init() {
    // Nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => navigate(item.dataset.page));
    });

    // Add meal button
    document.getElementById('btn-add-meal')?.addEventListener('click', () => Modal.openMealModal());

    initFilters();
    initMealModal();
    initAnalysisPage();
    initProfilePage();
    initQuickRec();
    ImportModule.initDropzone();

    await loadMeta();
    await loadProfile();
    navigate('dashboard');
  }

  return { init, navigate, loadMeals };
})();

document.addEventListener('DOMContentLoaded', () => UI.init());
