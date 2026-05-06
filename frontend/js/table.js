const Table = (() => {
  const RATING_LABEL = { 5: '神極好吃', 4: '滿好吃', 3: '還行', 2: '普通', 1: '難吃' };

  function stars(n, max = 5) {
    if (n == null) return '<span style="color:var(--text-muted)">—</span>';
    let s = '<span class="stars">';
    for (let i = 1; i <= max; i++) s += `<span class="star${i <= n ? ' filled' : ''}">★</span>`;
    s += '</span>';
    return s;
  }

  function calCell(meal) {
    const { calories, calories_min, calories_max, source, ai_confidence } = meal;
    if (!calories) return '<span style="color:var(--text-muted)">—</span>';
    let html = `<span class="cal-value">${Math.round(calories)}</span>`;
    if (calories_min && calories_max)
      html += `<br><span class="cal-range">${Math.round(calories_min)}~${Math.round(calories_max)}</span>`;
    if (source === 'ai_estimated')
      html += `<br><span class="cal-ai">✦ AI (${Math.round((ai_confidence || 0) * 100)}%)</span>`;
    return html;
  }

  function renderRow(meal) {
    const safeText = s => s ? String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const satClass = meal.satiety ? `satiety-${meal.satiety}` : '';
    const tags = (meal.tags || []).map(t => `<span class="tag">${safeText(t)}</span>`).join(' ');

    return `<tr data-id="${meal.id}">
      <td class="meal-name" title="${safeText(meal.meal_name)}">${safeText(meal.meal_name)}</td>
      <td>${safeText(meal.restaurant) || '<span style="color:var(--text-muted)">—</span>'}</td>
      <td><span class="cat-badge">${safeText(meal.category) || '—'}</span></td>
      <td>${stars(meal.rating)}</td>
      <td>${meal.repurchase != null ? `<span class="tag">${meal.repurchase}/5</span>` : '—'}</td>
      <td>${meal.satiety ? `<span class="satiety-pill ${satClass}">${safeText(meal.satiety)}</span>` : '—'}</td>
      <td>${calCell(meal)}</td>
      <td>${meal.price != null ? `NT$${Math.round(meal.price)}` : '—'}</td>
      <td class="notes-cell" title="${safeText(meal.notes)}">${safeText(meal.notes) || ''}</td>
      <td>${tags}</td>
      <td>${meal.date ? meal.date : '—'}</td>
      <td class="actions">
        <button class="btn btn-ghost btn-icon btn-edit" data-id="${meal.id}" title="編輯">✏️</button>
        <button class="btn btn-ghost btn-icon btn-del" data-id="${meal.id}" title="刪除">🗑️</button>
      </td>
    </tr>`;
  }

  function renderHeader(filters) {
    const s = filters.sort_by;
    const d = filters.sort_dir;
    function thSort(field, label) {
      const active = s === field;
      const icon = active ? (d === 'asc' ? '↑' : '↓') : '↕';
      const cls = active ? (d === 'asc' ? 'sort-asc' : 'sort-desc') : '';
      return `<th class="sortable ${cls}" data-sort="${field}">${label} <span class="sort-icon">${icon}</span></th>`;
    }
    return `<thead><tr>
      ${thSort('meal_name', '餐點')}
      ${thSort('restaurant', '店家')}
      ${thSort('category', '類別')}
      ${thSort('rating', '星等')}
      <th>回購</th>
      <th>飽足感</th>
      ${thSort('calories', '熱量(kcal)')}
      ${thSort('price', '價格')}
      <th>心得</th>
      <th>標籤</th>
      ${thSort('date', '日期')}
      <th></th>
    </tr></thead>`;
  }

  function render(container, meals, filters) {
    if (!meals.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="icon">🍽️</div>
        <p>目前沒有餐點記錄</p>
      </div>`;
      return;
    }
    container.innerHTML = `<div class="table-wrapper">
      <table>
        ${renderHeader(filters)}
        <tbody>${meals.map(renderRow).join('')}</tbody>
      </table>
    </div>`;
  }

  function renderPagination(container, total, page, limit) {
    const pages = Math.ceil(total / limit);
    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    const btns = [];
    btns.push(`<button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>`);
    const start = Math.max(1, page - 2), end = Math.min(pages, page + 2);
    for (let p = start; p <= end; p++) {
      btns.push(`<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`);
    }
    btns.push(`<button class="page-btn" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button>`);

    container.innerHTML = `<div class="pagination">
      <span>顯示 ${from}–${to} / 共 ${total} 筆</span>
      <div class="pagination-controls">${btns.join('')}</div>
    </div>`;
  }

  return { render, renderPagination, stars };
})();
