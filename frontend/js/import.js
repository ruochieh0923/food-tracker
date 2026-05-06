const ImportModule = (() => {
  let sessionId = null;
  let previewData = null;

  function initDropzone() {
    const zone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('csv-file-input');

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith('.csv')) handleFile(f);
      else Toast.show('請上傳 CSV 檔案', 'error');
    });
    zone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
  }

  async function handleFile(file) {
    const assignDate = document.getElementById('import-assign-date')?.value || null;
    const statusEl = document.getElementById('import-status');
    statusEl.innerHTML = '<div class="loading"><div class="spinner"></div> 解析中…</div>';

    try {
      const result = await API.previewCSV(file, assignDate);
      sessionId = result.session_id;
      previewData = result;
      renderPreview(result);
    } catch (e) {
      statusEl.innerHTML = `<div class="empty-state"><div class="icon">❌</div><p>${e.message}</p></div>`;
    }
  }

  function renderPreview(data) {
    const el = document.getElementById('import-status');
    const table = data.preview_new.slice(0, 10).map(row => `
      <tr>
        <td>${row.restaurant || '—'}</td>
        <td class="meal-name">${row.meal_name}</td>
        <td>${row.category || '—'}</td>
        <td>${row.rating_text || '—'}</td>
        <td>${row.calories != null ? Math.round(row.calories) : '—'}</td>
        <td><span class="tag tag-green">新增</span></td>
      </tr>`).join('');

    el.innerHTML = `
      <div class="card mt-4">
        <div class="flex-row" style="margin-bottom:14px">
          <div style="flex:1">
            <div style="font-size:15px;font-weight:600;margin-bottom:6px">預覽結果</div>
            <div class="flex-row">
              <span class="tag tag-green">新增 ${data.new_count} 筆</span>
              <span class="tag tag-yellow">重複 ${data.duplicate_count} 筆</span>
              <span class="tag tag-red">無效 ${data.invalid_count} 筆</span>
            </div>
          </div>
          <div class="flex-row">
            <label style="font-size:13px;color:var(--text-secondary)">
              <input type="checkbox" id="skip-dups" checked style="background:transparent;border:none;width:auto;height:auto;padding:0"> 跳過重複
            </label>
            <button class="btn btn-primary" id="confirm-import-btn">確認匯入</button>
          </div>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>店家</th><th>餐點</th><th>類別</th><th>評級</th><th>熱量</th><th>狀態</th></tr></thead>
            <tbody>${table}</tbody>
          </table>
        </div>
        ${data.new_count > 10 ? `<div style="color:var(--text-muted);font-size:12px;margin-top:8px">僅顯示前 10 筆，共 ${data.new_count} 筆新增</div>` : ''}
      </div>`;

    document.getElementById('confirm-import-btn').addEventListener('click', confirmImport);
  }

  async function confirmImport() {
    if (!sessionId) return;
    const skipDups = document.getElementById('skip-dups')?.checked ?? true;
    const btn = document.getElementById('confirm-import-btn');
    btn.disabled = true;
    btn.textContent = '匯入中…';

    try {
      const result = await API.confirmImport({ session_id: sessionId, skip_duplicates: skipDups });
      Toast.show(`${result.message}`, 'success');
      document.getElementById('import-status').innerHTML = `
        <div class="card" style="text-align:center;padding:40px">
          <div style="font-size:48px;margin-bottom:12px">✅</div>
          <div style="font-size:18px;font-weight:600;margin-bottom:8px">${result.message}</div>
          <div style="color:var(--text-muted)">需 AI 估算熱量：${result.ai_estimation_needed} 筆</div>
          <button class="btn btn-primary mt-4" onclick="UI.navigate('meals')">查看餐點</button>
        </div>`;
      sessionId = null;
    } catch (e) {
      Toast.show(e.message, 'error');
      btn.disabled = false;
      btn.textContent = '確認匯入';
    }
  }

  return { initDropzone };
})();
