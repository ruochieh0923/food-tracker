const Modal = (() => {
  let mealTags = [];
  let aiResult = null;

  // 簡單評級 ↔ 星等 對照
  const RATING_TO_TEXT = { 5: '神極好吃', 4: '滿好吃', 3: '還行', 2: '普通', 1: '難吃' };
  const TEXT_TO_RATING = { '神極好吃': 5, '滿好吃': 4, '還行': 3, '普通': 2, '難吃': 1 };
  const RATING_EMOJI   = { 5: '🤩', 4: '😋', 3: '😐', 2: '😑', 1: '🤢' };

  function open(overlayId) {
    document.getElementById(overlayId).classList.remove('hidden');
  }
  function close(overlayId) {
    document.getElementById(overlayId).classList.add('hidden');
  }

  function starsInput(container, initial = 0, onChange) {
    container.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('span');
      s.className = 'star' + (i <= initial ? ' active' : '');
      s.textContent = '★';
      s.dataset.val = i;
      container.appendChild(s);
    }
    container.className = 'stars-input';
    let current = initial;
    container.addEventListener('mouseover', e => {
      if (!e.target.dataset.val) return;
      const v = +e.target.dataset.val;
      [...container.children].forEach((s, i) => s.classList.toggle('active', i < v));
    });
    container.addEventListener('mouseleave', () => {
      [...container.children].forEach((s, i) => s.classList.toggle('active', i < current));
    });
    container.addEventListener('click', e => {
      if (!e.target.dataset.val) return;
      current = +e.target.dataset.val;
      [...container.children].forEach((s, i) => s.classList.toggle('active', i < current));
      if (onChange) onChange(current);
    });
    return { getValue: () => current, setValue: v => { current = v; [...container.children].forEach((s, i) => s.classList.toggle('active', i < current)); } };
  }

  function initTagsInput(wrapper) {
    mealTags = [];
    const inner = wrapper.querySelector('.tags-input-inner');

    function addTag(text) {
      const t = text.trim();
      if (!t || mealTags.includes(t)) return;
      mealTags.push(t);
      const chip = document.createElement('span');
      chip.className = 'tag';
      chip.textContent = t;
      chip.addEventListener('click', () => {
        mealTags = mealTags.filter(x => x !== t);
        chip.remove();
      });
      wrapper.insertBefore(chip, inner);
    }

    inner.addEventListener('keydown', e => {
      if (['Enter', ','].includes(e.key)) {
        e.preventDefault();
        addTag(inner.value);
        inner.value = '';
      } else if (e.key === 'Backspace' && !inner.value && mealTags.length) {
        const last = wrapper.querySelector('.tag:last-of-type');
        if (last) { mealTags.pop(); last.remove(); }
      }
    });
    wrapper.addEventListener('click', () => inner.focus());

    return {
      getTags: () => mealTags,
      setTags: (tags) => {
        mealTags = [];
        wrapper.querySelectorAll('.tag').forEach(e => e.remove());
        tags.forEach(addTag);
      }
    };
  }

  // 簡單評級星等 widget
  let simpleRatingCtrl = null;

  function initSimpleRatingWidget(container, initialText, onChange) {
    const options = [
      { val: 5, text: '神極好吃' },
      { val: 4, text: '滿好吃' },
      { val: 3, text: '還行' },
      { val: 2, text: '普通' },
      { val: 1, text: '難吃' },
    ];
    let current = initialText || '';

    function render() {
      container.innerHTML = options.map(o => {
        const active = o.text === current;
        return `<button type="button" class="simple-rating-opt ${active ? 'active' : ''}" data-text="${o.text}" data-val="${o.val}"
          style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:20px;
                 background:${active ? 'var(--accent-soft)' : 'var(--bg-tertiary)'};
                 border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};
                 color:${active ? 'var(--accent)' : 'var(--text-secondary)'};
                 font-size:12.5px;cursor:pointer;transition:all .15s">
          ${'★'.repeat(o.val)} ${o.text}
        </button>`;
      }).join('');

      container.querySelectorAll('.simple-rating-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          const wasActive = current === btn.dataset.text;
          current = wasActive ? '' : btn.dataset.text;
          render();
          if (onChange) onChange(current, wasActive ? 0 : +btn.dataset.val);
        });
      });
    }

    render();
    return {
      getValue: () => current,
      setValue: (text) => { current = text || ''; render(); }
    };
  }

  // --- Meal Modal ---
  let ratingCtrl = null;
  let repurchaseCtrl = null;
  let tagsCtrl = null;

  function openMealModal(meal = null) {
    const overlay = document.getElementById('meal-modal-overlay');
    const title = document.getElementById('meal-modal-title');
    const form = document.getElementById('meal-form');
    const aiPanel = document.getElementById('ai-estimate-panel');

    title.textContent = meal ? '編輯餐點' : '新增餐點';
    aiPanel.classList.add('hidden');
    aiResult = null;

    // Reset quick input zone
    const quickInput = document.getElementById('quick-input-text');
    if (quickInput) quickInput.value = '';
    const acResult = document.getElementById('autocomplete-result');
    if (acResult) acResult.style.display = 'none';

    // Rating stars
    ratingCtrl = starsInput(document.getElementById('rating-stars-input'), meal?.rating || 0, (v) => {
      // Sync to 簡單評級 if user sets stars
      if (simpleRatingCtrl && !simpleRatingCtrl.getValue()) {
        simpleRatingCtrl.setValue(RATING_TO_TEXT[v] || '');
        document.getElementById('rating-text-hidden').value = RATING_TO_TEXT[v] || '';
      }
    });
    repurchaseCtrl = starsInput(document.getElementById('repurchase-stars-input'), meal?.repurchase || 0);
    tagsCtrl = initTagsInput(document.getElementById('tags-input-wrapper'));

    // 簡單評級 star widget
    simpleRatingCtrl = initSimpleRatingWidget(
      document.getElementById('simple-rating-stars'),
      meal?.rating_text || '',
      (text, numVal) => {
        document.getElementById('rating-text-hidden').value = text;
        // Also sync overall star rating if not set
        if (numVal && ratingCtrl && !ratingCtrl.getValue()) {
          ratingCtrl.setValue(numVal);
        }
      }
    );
    document.getElementById('rating-text-hidden').value = meal?.rating_text || '';

    const fields = ['date', 'category', 'restaurant', 'meal_name', 'satiety', 'price', 'notes', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'sodium_mg', 'photo_url'];
    fields.forEach(f => {
      const el = form.querySelector(`[name="${f}"]`);
      if (el) el.value = meal ? (meal[f] ?? '') : (f === 'date' ? new Date().toISOString().split('T')[0] : '');
    });

    if (meal?.tags) tagsCtrl.setTags(meal.tags);

    State.set('editingMealId', meal?.id || null);
    open('meal-modal-overlay');
  }

  function getMealFormData(form) {
    const data = {};
    const fields = ['date', 'category', 'restaurant', 'meal_name', 'satiety', 'notes', 'photo_url'];
    const numFields = ['price', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'sodium_mg'];

    fields.forEach(f => {
      const el = form.querySelector(`[name="${f}"]`);
      if (el && el.value.trim()) data[f] = el.value.trim();
    });
    numFields.forEach(f => {
      const el = form.querySelector(`[name="${f}"]`);
      if (el && el.value.trim()) data[f] = parseFloat(el.value);
    });

    const rating = ratingCtrl?.getValue();
    if (rating) data.rating = rating;
    const repurchase = repurchaseCtrl?.getValue();
    if (repurchase != null) data.repurchase = repurchase;
    if (tagsCtrl) data.tags = tagsCtrl.getTags();

    // 簡單評級 from hidden field (set by star widget)
    const ratingText = document.getElementById('rating-text-hidden')?.value;
    if (ratingText) data.rating_text = ratingText;
    // If no rating from stars but rating_text exists, derive rating number
    if (!data.rating && ratingText) {
      const m = { '神極好吃': 5, '滿好吃': 4, '還行': 3, '普通': 2, '難吃': 1 };
      data.rating = m[ratingText] || null;
    }

    // Apply AI estimates if user didn't fill in calories
    if (aiResult && !data.calories && aiResult.calories) {
      data.calories = aiResult.calories;
      data.protein_g = data.protein_g || aiResult.protein_g;
      data.carbs_g = data.carbs_g || aiResult.carbs_g;
      data.fat_g = data.fat_g || aiResult.fat_g;
      data.sodium_mg = data.sodium_mg || aiResult.sodium_mg;
      data.source = 'ai_estimated';
      data.ai_confidence = aiResult.confidence;
    }

    return data;
  }

  function showAIResult(result) {
    aiResult = result;
    const panel = document.getElementById('ai-estimate-panel');
    document.getElementById('ai-cal').textContent = Math.round(result.calories || 0);
    document.getElementById('ai-prot').textContent = Math.round(result.protein_g || 0) + 'g';
    document.getElementById('ai-carb').textContent = Math.round(result.carbs_g || 0) + 'g';
    document.getElementById('ai-fat').textContent = Math.round(result.fat_g || 0) + 'g';
    document.getElementById('ai-sod').textContent = Math.round(result.sodium_mg || 0) + 'mg';
    document.getElementById('ai-conf').textContent = Math.round((result.confidence || 0) * 100) + '%';
    document.getElementById('ai-cache-badge').style.display = result.from_cache ? 'inline' : 'none';

    // Show fallback warning if API key not set or AI failed
    const warnEl = document.getElementById('ai-fallback-warn');
    if (warnEl) {
      if (result.is_fallback || result.error) {
        warnEl.textContent = result.error || '使用關鍵字估算（信心度較低）';
        warnEl.style.display = 'block';
      } else {
        warnEl.style.display = 'none';
      }
    }

    panel.classList.remove('hidden');

    // Auto-fill form fields if empty
    const form = document.getElementById('meal-form');
    ['calories', 'protein_g', 'carbs_g', 'fat_g', 'sodium_mg'].forEach(f => {
      const el = form.querySelector(`[name="${f}"]`);
      if (el && !el.value && result[f]) el.value = Math.round(result[f] * 10) / 10;
    });
  }

  return { open, close, openMealModal, getMealFormData, showAIResult, starsInput };
})();
