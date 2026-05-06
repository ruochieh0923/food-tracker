const Dashboard = (() => {
  let trendChart = null, catChart = null, ratingChart = null;

  function ringProgress(pct, color = 'var(--accent)') {
    const r = 36, c = 2 * Math.PI * r;
    const dash = Math.min(pct, 1) * c;
    return `<svg width="84" height="84"><circle cx="42" cy="42" r="${r}" stroke="var(--bg-hover)" stroke-width="7" fill="none"/>
      <circle cx="42" cy="42" r="${r}" stroke="${color}" stroke-width="7" fill="none"
        stroke-dasharray="${dash} ${c}" stroke-linecap="round" style="transition:stroke-dasharray 0.5s"/></svg>`;
  }

  function macroBar(label, val, target, cssClass) {
    const pct = target ? Math.min(val / target, 1.2) : 0;
    const over = pct > 1;
    return `<div class="macro-row">
      <span class="macro-label">${label}</span>
      <div class="macro-bar-wrap">
        <div class="macro-bar ${cssClass}" style="width:${Math.min(pct,1)*100}%;${over ? 'background:var(--red)' : ''}"></div>
      </div>
      <span class="macro-val">${Math.round(val)}/${Math.round(target)}</span>
    </div>`;
  }

  async function renderSummary(date) {
    const el = document.getElementById('dashboard-summary');
    el.innerHTML = '<div class="loading"><div class="spinner"></div> 載入中…</div>';
    try {
      const s = await API.getSummary(date);
      State.set('summary', s);
      const calPct = s.target_calories ? s.total_calories / s.target_calories : 0;
      const deficit = s.target_calories - s.total_calories;
      const calColor = deficit > 0 ? 'var(--green)' : deficit > -200 ? 'var(--yellow)' : 'var(--red)';

      const waterRiskLabel = ['LOW', 'MEDIUM', 'HIGH'];
      const waterColors = ['var(--green)', 'var(--yellow)', 'var(--red)'];
      const wRisk = s.water_risk_flag || 0;

      el.innerHTML = `
        <div class="dashboard-grid">
          <div class="stat-card">
            <div class="stat-label">今日熱量</div>
            <div class="stat-value" style="color:${calColor}">${Math.round(s.total_calories)}</div>
            <div class="stat-sub">目標 ${s.target_calories} kcal | ${deficit >= 0 ? '還剩' : '超出'} ${Math.abs(Math.round(deficit))} kcal</div>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.min(calPct,1)*100}%;background:${calColor}"></div></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">連續記錄</div>
            <div class="stat-value">${s.streak_days}</div>
            <div class="stat-sub">天 | 共 ${s.total_meals_ever} 筆記錄</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">今日餐點</div>
            <div class="stat-value">${s.meal_count}</div>
            <div class="stat-sub">平均 ${s.avg_rating ? s.avg_rating.toFixed(1) + ' 星' : '—'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">水腫風險</div>
            <div class="stat-value" style="color:${waterColors[wRisk]};font-size:18px">${['低', '中', '高'][wRisk]}</div>
            <div class="stat-sub">鈉 ${Math.round(s.total_sodium_mg)}mg / 目標 ${s.target_sodium_mg}mg</div>
          </div>
        </div>
        <div class="chart-card mt-4">
          <h3>巨量營養素</h3>
          ${macroBar('蛋白質', s.total_protein_g, s.target_protein_g, 'protein')}
          ${macroBar('碳水', s.total_carbs_g, s.target_carbs_g, 'carbs')}
          ${macroBar('脂肪', s.total_fat_g, s.target_fat_g, 'fat')}
          ${macroBar('鈉', s.total_sodium_mg, s.target_sodium_mg, 'sodium')}
        </div>`;
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>${e.message}</p></div>`;
    }
  }

  async function renderTrends() {
    try {
      const data = await API.getTrends(7);
      const ctx = document.getElementById('trend-chart')?.getContext('2d');
      if (!ctx) return;

      // Generate full 7-day range (fill missing dates with 0)
      const today = new Date();
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
      }
      const dataMap = Object.fromEntries(data.data.map(r => [r.date, r.total_calories || 0]));
      const labels = days.map(d => {
        const dt = new Date(d);
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        return `${dt.getMonth() + 1}/${dt.getDate()}（${weekdays[dt.getDay()]}）`;
      });
      const cals = days.map(d => dataMap[d] || 0);
      const profile = State.get('profile') || {};
      const targetCal = profile.tdee_calories || 1800;

      if (trendChart) trendChart.destroy();
      trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: '熱量(kcal)',
              data: cals,
              backgroundColor: cals.map(c => c > targetCal ? 'rgba(192,84,84,0.55)' : 'rgba(200,130,74,0.6)'),
              borderColor: cals.map(c => c > targetCal ? 'rgb(192,84,84)' : 'rgb(200,130,74)'),
              borderWidth: 2,
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.raw} kcal ${ctx.raw > targetCal ? '⚠️ 超標' : '✓'}`,
              },
            },
            annotation: {
              annotations: {
                targetLine: {
                  type: 'line',
                  yMin: targetCal,
                  yMax: targetCal,
                  borderColor: 'rgba(200,130,74,0.7)',
                  borderWidth: 1.5,
                  borderDash: [5, 5],
                  label: {
                    display: true,
                    content: `目標 ${targetCal}`,
                    position: 'end',
                    font: { size: 11 },
                  },
                },
              },
            },
          },
          scales: {
            x: { ticks: { color: '#b09a84', font: { size: 11 } }, grid: { color: 'rgba(61,46,30,0.06)' } },
            y: { ticks: { color: '#b09a84', font: { size: 11 } }, grid: { color: 'rgba(61,46,30,0.06)' }, beginAtZero: true },
          },
        },
      });
    } catch (_) {}
  }

  async function renderCategoryChart() {
    // Category chart removed per user request
  }

  async function renderLeaderboard() {
    const el = document.getElementById('leaderboard-list');
    try {
      const data = await API.getLeaderboard();
      const rankClass = i => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      el.innerHTML = data.top_rated.slice(0, 10).map((m, i) => `
        <div class="leaderboard-row">
          <div class="leaderboard-rank ${rankClass(i)}">${i + 1}</div>
          <div class="leaderboard-info">
            <div class="leaderboard-name">${m.meal_name}</div>
            <div class="leaderboard-sub">${m.restaurant || ''} ${m.category ? '· ' + m.category : ''}</div>
          </div>
          <div>${Table.stars(m.rating)}</div>
          ${m.calories ? `<div class="leaderboard-score">${Math.round(m.calories)}</div>` : ''}
        </div>`).join('');
    } catch (e) {
      el.innerHTML = `<p style="color:var(--text-muted)">${e.message}</p>`;
    }
  }

  async function renderAnalysis(date) {
    const el = document.getElementById('analysis-panel');
    el.innerHTML = '<div class="loading"><div class="spinner"></div> AI 分析中…</div>';
    try {
      const r = await API.analyzeDay(date || new Date().toISOString().split('T')[0]);
      const riskColors = { LOW: 'var(--green)', MEDIUM: 'var(--yellow)', HIGH: 'var(--red)' };
      const scoreClass = r.fat_loss_score > 60 ? 'good' : r.fat_loss_score > 35 ? 'ok' : 'poor';
      el.innerHTML = `
        <div class="analysis-card">
          <div class="flex-row gap-4 mb" style="margin-bottom:14px">
            <div class="score-circle ${scoreClass}">
              <span class="score-num">${Math.round(r.fat_loss_score || 0)}</span>
              <span class="score-lbl">分</span>
            </div>
            <div>
              <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">減脂評分</div>
              <div class="analysis-verdict">${r.fat_loss_verdict || '—'}</div>
              <div style="font-size:13px">水腫風險：<strong style="color:${riskColors[r.water_risk] || 'var(--text-primary)'}">
                ${r.water_risk === 'LOW' ? '低' : r.water_risk === 'MEDIUM' ? '中' : '高'}
              </strong> — ${r.water_risk_reason || ''}</div>
            </div>
          </div>
          <div style="font-size:12.5px;font-weight:600;color:var(--text-muted);margin-bottom:8px">明天改善建議</div>
          ${(r.improvements || []).map((imp, i) => `
            <div class="improvement-item">
              <div class="num">${i + 1}</div>
              <div>${imp}</div>
            </div>`).join('')}
        </div>`;
    } catch (e) {
      el.innerHTML = `<div class="analysis-card"><p style="color:var(--text-muted)">${e.message}（請先確認今日有記錄餐點且已設定日期）</p></div>`;
    }
  }

  async function renderRecommendations(date) {
    const el = document.getElementById('rec-panel');
    el.innerHTML = '<div class="loading"><div class="spinner"></div> 推薦中…</div>';
    try {
      const r = await API.getRecommendations(date);
      if (!r.recommendations.length) {
        el.innerHTML = '<p style="color:var(--text-muted)">暫無推薦（需要更多歷史資料）</p>';
        return;
      }
      el.innerHTML = r.recommendations.map(rec => `
        <div class="rec-card" data-name="${rec.name}">
          <div class="rec-name">${rec.name}</div>
          <div class="rec-stats">~${rec.estimated_calories}kcal | 蛋白質 ~${rec.estimated_protein_g}g</div>
          <div class="rec-why">${rec.why}</div>
        </div>`).join('');

      el.querySelectorAll('.rec-card').forEach(card => {
        card.addEventListener('click', () => {
          Modal.openMealModal({ meal_name: card.dataset.name, date: new Date().toISOString().split('T')[0] });
          UI.navigate('meals');
        });
      });
    } catch (e) {
      el.innerHTML = `<p style="color:var(--text-muted)">${e.message}</p>`;
    }
  }

  // Quick dashboard recommendations with meal-type filter
  async function renderQuickRecommend(mealType, date) {
    const el = document.getElementById('quick-rec-panel');
    if (!el) return;
    el.innerHTML = '<div class="loading" style="grid-column:1/-1"><div class="spinner"></div> 推薦中…</div>';

    try {
      const todayDate = date || new Date().toISOString().split('T')[0];

      // Get today's meals to compute remaining budget
      const todayMeals = await API.getMeals({ date_from: todayDate, date_to: todayDate, limit: 50 });
      const profile = State.get('profile') || await API.getProfile();
      const totalCal = todayMeals.data.reduce((s, m) => s + (m.calories || 0), 0);
      const totalProt = todayMeals.data.reduce((s, m) => s + (m.protein_g || 0), 0);
      const remainCal = Math.max((profile.tdee_calories || 1800) - totalCal, 0);
      const remainProt = Math.max((profile.target_protein_g || 120) - totalProt, 0);

      // Generate recommendations based on meal type
      const recs = _generateQuickRecs(mealType, remainCal, remainProt, profile.goal || 'fat_loss');

      if (!recs.length) {
        el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>今日熱量已達標，建議輕食收尾</p></div>';
        return;
      }

      el.innerHTML = recs.map(r => `
        <div class="rec-card" style="cursor:pointer" onclick="Modal.openMealModal({meal_name:'${r.name.replace(/'/g,"\\'")}',date:'${todayDate}'});UI.navigate('meals')">
          <div class="rec-name">${r.icon} ${r.name}</div>
          <div class="rec-stats">~${r.cal}kcal | 蛋白質 ~${r.prot}g</div>
          <div class="rec-why" style="color:var(--text-muted);font-size:12px">${r.why}</div>
        </div>`).join('');
    } catch (e) {
      el.innerHTML = `<div style="grid-column:1/-1;color:var(--text-muted);padding:12px">${e.message}</div>`;
    }
  }

  // Local recommendation database (no API key needed)
  const REC_DB = {
    '': [
      { name: '茶葉蛋+御飯糰', cal: 280, prot: 16, why: '超商方便，蛋白質充足', icon: '🏪', tags: ['超商'] },
      { name: '水煮雞胸+花椰菜', cal: 220, prot: 38, why: '最高效蛋白質補充', icon: '🍳', tags: ['自煮'] },
      { name: '鯖魚定食', cal: 520, prot: 32, why: 'Omega-3 豐富，均衡減脂', icon: '🍱', tags: ['日式'] },
      { name: '舒肥雞胸沙拉', cal: 320, prot: 35, why: '低卡高蛋白，蔬菜纖維豐富', icon: '🥗', tags: ['健康餐盒'] },
      { name: '全麥吐司+水煮蛋x2', cal: 280, prot: 18, why: '早餐或宵夜輕食', icon: '🥚', tags: ['早餐', '自煮'] },
      { name: '無糖豆漿+蒸地瓜', cal: 240, prot: 12, why: '低GI，飽足感持久', icon: '🥛', tags: ['早餐'] },
    ],
    '超商': [
      { name: '茶葉蛋x2+御飯糰', cal: 310, prot: 18, why: '隨手可得，蛋白質穩定', icon: '🥚', tags: ['超商'] },
      { name: '雞胸肉便當（7-11）', cal: 420, prot: 36, why: '高蛋白低脂，飽足感佳', icon: '🍱', tags: ['超商'] },
      { name: '無糖燕麥拿鐵+水煮蛋', cal: 200, prot: 14, why: '低卡早餐或下午茶', icon: '☕', tags: ['超商'] },
      { name: '鮪魚沙拉三明治', cal: 320, prot: 22, why: '高蛋白低GI', icon: '🥪', tags: ['超商'] },
      { name: '即食雞胸肉+蒸蛋', cal: 240, prot: 38, why: '減脂神器組合', icon: '💪', tags: ['超商'] },
      { name: '低卡蒟蒻麵+玉子燒', cal: 180, prot: 10, why: '熱量極低飽足感不差', icon: '🍜', tags: ['超商'] },
    ],
    '自煮': [
      { name: '水煮雞胸+烤花椰菜', cal: 220, prot: 38, why: '最高蛋白質效率', icon: '🐔', tags: ['自煮'] },
      { name: '炒菠菜+白煮蛋x2', cal: 200, prot: 16, why: '鐵質豐富，快速料理', icon: '🥬', tags: ['自煮'] },
      { name: '豆腐味噌湯+糙米飯', cal: 320, prot: 18, why: '低GI主食，易消化', icon: '🍲', tags: ['自煮'] },
      { name: '鮭魚排+蒸地瓜', cal: 420, prot: 30, why: 'Omega-3+複雜碳水黃金組合', icon: '🐟', tags: ['自煮'] },
      { name: '雞蛋炒時蔬（少油）', cal: 260, prot: 20, why: '快速上桌，熱量可控', icon: '🥘', tags: ['自煮'] },
      { name: '希臘優格+堅果+香蕉', cal: 300, prot: 18, why: '高蛋白點心，控制食慾', icon: '🫙', tags: ['自煮', '早餐'] },
    ],
    '日式': [
      { name: '鯖魚定食', cal: 520, prot: 32, why: 'Omega-3 豐富，均衡飽足', icon: '🐟', tags: ['日式'] },
      { name: '清蒸鱈魚御膳', cal: 450, prot: 38, why: '低脂高蛋白，清淡不膩', icon: '🍱', tags: ['日式'] },
      { name: '親子丼（小碗）', cal: 480, prot: 28, why: '雞肉蛋白質豐富，份量可控', icon: '🥚', tags: ['日式'] },
      { name: '壽喜鍋牛肉烏龍麵', cal: 580, prot: 30, why: '牛肉鐵質豐富，暖胃', icon: '🍜', tags: ['日式'] },
      { name: '海鮮茶碗蒸+白飯', cal: 380, prot: 22, why: '低卡輕盈，蛋白質穩定', icon: '🦐', tags: ['日式'] },
    ],
    '健康餐盒': [
      { name: '舒肥雞胸餐盒', cal: 380, prot: 40, why: '最高蛋白質密度', icon: '🥗', tags: ['健康餐盒'] },
      { name: '鮭魚沙拉碗', cal: 420, prot: 32, why: '健康脂肪+蔬菜纖維充足', icon: '🐟', tags: ['健康餐盒'] },
      { name: '泰式打拋雞無飯', cal: 300, prot: 35, why: '低碳高蛋白，飽足感佳', icon: '🌶️', tags: ['健康餐盒'] },
      { name: '烤雞腿排+地瓜', cal: 480, prot: 36, why: '低GI澱粉+高蛋白黃金比', icon: '🍗', tags: ['健康餐盒'] },
      { name: '蒸虱目魚+糙米', cal: 420, prot: 28, why: '台式低脂健康選擇', icon: '🐟', tags: ['健康餐盒'] },
    ],
    '早餐': [
      { name: '全麥吐司+水煮蛋x2+低脂牛奶', cal: 340, prot: 22, why: '均衡早餐，啟動代謝', icon: '🥛', tags: ['早餐'] },
      { name: '無糖燕麥粥+堅果', cal: 320, prot: 12, why: '低GI抗餓，穩定血糖', icon: '🥣', tags: ['早餐'] },
      { name: '希臘優格碗+藍莓', cal: 250, prot: 18, why: '益生菌+高蛋白，輕盈早餐', icon: '🫐', tags: ['早餐'] },
      { name: '雞蛋蔬菜捲餅', cal: 380, prot: 20, why: '蛋白質充足，帶著走方便', icon: '🌯', tags: ['早餐'] },
      { name: '豆漿+茶葉蛋+地瓜', cal: 290, prot: 18, why: '台式早餐最強組合', icon: '🥚', tags: ['早餐'] },
    ],
  };

  function _generateQuickRecs(type, remainCal, remainProt, goal) {
    const pool = REC_DB[type] || REC_DB[''];
    return pool
      .filter(r => r.cal <= remainCal + 100) // 允許略超
      .sort((a, b) => {
        // Prioritize by remaining protein need
        const aNeed = remainProt > 0 ? b.prot - a.prot : 0;
        const aCalFit = Math.abs(a.cal - remainCal * 0.5) - Math.abs(b.cal - remainCal * 0.5);
        return aNeed + aCalFit;
      })
      .slice(0, 6);
  }

  const RATING_TEXT_MAP = { '神極好吃': '🤩', '滿好吃': '😋', '還行': '😐', '普通': '😑', '難吃': '🤢' };

  async function renderTodayMeals(date, onEdit) {
    const el = document.getElementById('today-meals-list');
    if (!el) return;
    try {
      const data = await API.getMeals({ date_from: date, date_to: date, limit: 50, sort_by: 'created_at', sort_dir: 'asc' });
      if (!data.data.length) {
        el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted)">
          <div style="font-size:32px;margin-bottom:8px">📝</div>
          <div>今日還沒有餐點記錄，點「補充新增」開始記錄</div>
        </div>`;
        return;
      }

      const safeText = s => s ? String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
      const starStr = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—';

      el.innerHTML = data.data.map(m => {
        const emoji = RATING_TEXT_MAP[m.rating_text] || '';
        const cal = m.calories ? `${Math.round(m.calories)} kcal` : '';
        const price = m.price ? `NT$${Math.round(m.price)}` : '';
        const prot = m.protein_g ? `蛋白 ${Math.round(m.protein_g)}g` : '';
        const satiety = m.satiety ? `<span class="satiety-pill satiety-${m.satiety}">${safeText(m.satiety)}</span>` : '';
        const ratingHtml = m.rating
          ? `<span style="color:var(--star-fill);font-size:13px">${starStr(m.rating)}</span>`
          : (m.rating_text ? `<span style="font-size:13px">${emoji} ${safeText(m.rating_text)}</span>` : '');

        return `<div class="today-meal-row" data-id="${m.id}" style="
            display:flex;align-items:center;gap:12px;padding:10px 14px;
            border-radius:var(--radius-md);background:var(--bg-tertiary);
            border:1px solid var(--border);margin-bottom:8px;
            transition:border-color var(--transition)
          " onmouseenter="this.style.borderColor='var(--border-light)'" onmouseleave="this.style.borderColor='var(--border)'">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <span style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px" title="${safeText(m.meal_name)}">${safeText(m.meal_name)}</span>
              ${m.restaurant ? `<span style="color:var(--text-muted);font-size:12.5px">@ ${safeText(m.restaurant)}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              ${ratingHtml}
              ${satiety}
              ${cal ? `<span style="font-size:12.5px;color:var(--accent);font-family:var(--mono)">${cal}</span>` : ''}
              ${prot ? `<span style="font-size:12px;color:var(--blue)">${prot}</span>` : ''}
              ${price ? `<span style="font-size:12px;color:var(--text-muted)">${price}</span>` : ''}
            </div>
            ${m.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px" title="${safeText(m.notes)}">${safeText(m.notes)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-secondary btn-sm today-edit-btn" data-id="${m.id}" title="編輯">✏️ 編輯</button>
            <button class="btn btn-ghost btn-sm today-del-btn" data-id="${m.id}" title="刪除" style="color:var(--red)">🗑️</button>
          </div>
        </div>`;
      }).join('');

      // Bind edit buttons
      el.querySelectorAll('.today-edit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const meal = await API.getMeal(+btn.dataset.id);
          if (onEdit) onEdit(meal);
        });
      });

      // Bind delete buttons
      el.querySelectorAll('.today-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('確定刪除這筆記錄？')) return;
          await API.deleteMeal(+btn.dataset.id);
          Toast.show('已刪除', 'success');
          renderTodayMeals(date, onEdit);
          // Re-render summary too
          renderSummary(date);
        });
      });

    } catch (e) {
      el.innerHTML = `<div style="color:var(--text-muted);padding:12px">${e.message}</div>`;
    }
  }

  return { renderSummary, renderTrends, renderLeaderboard, renderCategoryChart, renderAnalysis, renderRecommendations, renderQuickRecommend, renderTodayMeals };
})();
