const prefEl = document.querySelector("#pref");
const limitEl = document.querySelector("#limit");
const queryEl = document.querySelector("#query");
const refreshEl = document.querySelector("#refresh");
const gridEl = document.querySelector("#grid");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");

let shops = [];

function text(value) {
  return value == null || value === "" ? "N/A" : String(value);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSummary(list) {
  const withCity = list.filter((shop) => shop.city?.reviewCount || shop.city?.priceSummary).length;
  const yoasobiReviews = list.reduce((sum, shop) => sum + Number(shop.yoasobiReviewCount || 0), 0);
  const cityReviews = list.reduce((sum, shop) => sum + Number(shop.city?.reviewCount || 0), 0);
  summaryEl.innerHTML = `
    <div class="metric"><span>展示店铺</span><strong>${list.length}</strong></div>
    <div class="metric"><span>匹配本地信息</span><strong>${withCity}</strong></div>
    <div class="metric"><span>国际站评价</span><strong>${yoasobiReviews.toLocaleString()}</strong></div>
    <div class="metric"><span>本地站评价</span><strong>${cityReviews.toLocaleString()}</strong></div>
  `;
}

function renderPriceTable(rows) {
  if (!rows?.length) return `<p class="price-line">暂无文本价格表</p>`;
  return `
    <div class="price-table">
      ${rows
        .slice(0, 5)
        .map(
          (row) => `
            <div class="price-row">
              <span>${escapeHtml(row.duration)}</span>
              <strong>${escapeHtml(row.price)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderGirls(girls = []) {
  if (!girls.length) return "";
  return `
    <div class="girls">
      ${girls
        .slice(0, 12)
        .map(
          (girl) => `
            <a class="girl" href="${escapeHtml(girl.url)}" target="_blank" title="${escapeHtml(girl.name)}">
              <img src="${escapeHtml(girl.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
              <span>${escapeHtml(girl.name)}</span>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function shopMatches(shop, query) {
  if (!query) return true;
  const haystack = [
    shop.name,
    shop.localName,
    shop.kana,
    shop.area,
    shop.category,
    shop.directory,
    shop.city?.priceSummary,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function render() {
  const query = queryEl.value.trim();
  const filtered = shops.filter((shop) => shopMatches(shop, query));
  renderSummary(filtered);
  gridEl.innerHTML = filtered
    .map(
      (shop) => `
        <article class="shop-card">
          <div class="shop-media">
            ${
              shop.image
                ? `<img src="${escapeHtml(shop.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
                : ""
            }
          </div>
          <div class="shop-body">
            <div class="shop-title">
              <h2>${escapeHtml(shop.name)}</h2>
              <span class="rank">${escapeHtml(shop.travelersRank || "-")}</span>
            </div>
            <div class="meta">
              <span class="pill">${escapeHtml(text(shop.localName))}</span>
              <span class="pill">${escapeHtml(text(shop.area))}</span>
              <span class="pill">${escapeHtml(text(shop.category))}</span>
              <span class="pill">${escapeHtml(text(shop.openTime))}</span>
            </div>
            <div class="compare">
              <section class="compare-box">
                <h3>Yoasobi</h3>
                <p class="review-line">评价 ${Number(shop.yoasobiReviewCount || 0).toLocaleString()}</p>
                ${renderPriceTable(shop.yoasobiPrice)}
              </section>
              <section class="compare-box">
                <h3>CityHeaven</h3>
                <p class="review-line">口コミ ${Number(shop.city?.reviewCount || 0).toLocaleString()} 件</p>
                <p class="price-line">${escapeHtml(text(shop.city?.priceSummary))}</p>
                <p class="price-line">${escapeHtml(text(shop.city?.updateTime))}</p>
              </section>
            </div>
            ${renderGirls(shop.girls?.length ? shop.girls : shop.city?.girls)}
            <div class="links">
              <a href="${escapeHtml(shop.yoasobiUrl)}" target="_blank">国际站</a>
              <a href="${escapeHtml(shop.cityUrl)}" target="_blank">本地站</a>
              <a href="${escapeHtml(shop.citySystemUrl)}" target="_blank">本地价格页</a>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  if (!filtered.length) {
    gridEl.innerHTML = "";
    statusEl.textContent = "没有符合筛选条件的数据";
  }
}

async function load() {
  const pref = prefEl.value;
  const limit = limitEl.value;
  statusEl.textContent = `正在抓取 ${pref}，数量 ${limit}。首次加载会慢一些。`;
  gridEl.innerHTML = "";
  summaryEl.innerHTML = "";
  refreshEl.disabled = true;
  try {
    let response = await fetch(`/api/shops?pref=${encodeURIComponent(pref)}&limit=${encodeURIComponent(limit)}`);
    let staticSnapshot = false;
    if (!response.ok && response.status === 404) {
      staticSnapshot = true;
      response = await fetch(`./data/shops-${encodeURIComponent(pref)}.json`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    shops = (data.shops || []).slice(0, Number(limit));
    const mode = staticSnapshot ? "GitHub Pages 静态快照" : "本地实时聚合";
    statusEl.textContent = `${mode}。数据时间：${new Date(data.source.fetchedAt).toLocaleString()}。来源：${data.source.primary}`;
    render();
  } catch (error) {
    statusEl.textContent = `加载失败：${error.message}`;
  } finally {
    refreshEl.disabled = false;
  }
}

refreshEl.addEventListener("click", load);
prefEl.addEventListener("change", load);
limitEl.addEventListener("change", load);
queryEl.addEventListener("input", render);

load();
