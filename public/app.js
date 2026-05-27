const prefEl = document.querySelector("#pref");
const limitEl = document.querySelector("#limit");
const categoryEl = document.querySelector("#category");
const queryEl = document.querySelector("#query");
const refreshEl = document.querySelector("#refresh");
const gridEl = document.querySelector("#grid");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const loadMoreEl = document.querySelector("#load-more");

let shops = [];
let visibleCount = 10;
const PAGE_SIZE = 10;
const RENDER_API_ORIGIN = "https://yoasobi-cityheaven-compare.onrender.com";
const CATEGORY_LABELS = {
  "erotic massage service parlor": "风俗店铺",
  "hotel escort service parlor": "酒店派遣",
  "outcall escort service": "外送服务",
  "soapland service parlor": "泡泡浴",
};
const CITY_LABELS = {
  デリヘル: "外送",
  ソープ: "泡泡浴",
  ヘルス: "风俗店",
  "ファッションヘルス": "店铺型",
  ホテヘル: "酒店派遣",
  エステ: "按摩",
  高級: "高级",
  高級店: "高级",
  激安: "激安",
  格安: "低价",
  学園系: "学园系",
  イメクラ: "角色扮演",
  フェチ系: "癖好系",
  ネット予約: "可网络预约",
  来店ポイント: "到店积分",
  クーポン: "优惠券",
  イベント開催中: "活动中",
  コンパニオン募集: "技师招募",
  スタッフ募集: "员工招募",
};

function text(value) {
  return value == null || value === "" ? "N/A" : String(value);
}

function categoryLabel(value = "") {
  return CATEGORY_LABELS[value] || value || "未分类";
}

function cityLabel(value = "") {
  return CITY_LABELS[value] || value;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function apiPath(path) {
  if (location.hostname.endsWith("github.io")) return `${RENDER_API_ORIGIN}${path}`;
  return path;
}

async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const body = await response.text();
    const hint = body.trim().startsWith("<")
      ? "接口返回了网页内容，当前页面可能没有连接到 Node API"
      : body.trim().slice(0, 120);
    throw new Error(hint || response.statusText || "接口没有返回 JSON");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

async function fetchApiJson(path) {
  const primary = apiPath(path);
  let response = await fetch(primary);
  if (!response.ok && !primary.startsWith(RENDER_API_ORIGIN) && path.startsWith("/api/")) {
    response = await fetch(`${RENDER_API_ORIGIN}${path}`);
  }
  return readJson(response);
}

function renderSummary(list, visibleTotal) {
  const withCity = list.filter((shop) => shop.city?.reviewCount || shop.city?.priceSummary).length;
  const yoasobiReviews = list.reduce((sum, shop) => sum + Number(shop.yoasobiReviewCount || 0), 0);
  const cityReviews = list.reduce((sum, shop) => sum + Number(shop.city?.reviewCount || 0), 0);
  summaryEl.innerHTML = `
    <div class="metric"><span>已展示 / 符合条件</span><strong>${visibleTotal} / ${list.length}</strong></div>
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
            <div class="girl">
              <a class="girl-link" href="${escapeHtml(girl.url)}" target="_blank" title="${escapeHtml(girl.name)}">
                <img src="${escapeHtml(girl.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
                <span>${escapeHtml(girl.name)}</span>
              </a>
              ${
                girl.url?.includes("cityheaven.net")
                  ? `<a class="girl-review-link" href="${escapeHtml(girl.url)}" target="_blank">查看评价</a>`
                  : `<span class="girl-detail-missing">无本地详情</span>`
              }
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCityLocalInfo(info = {}) {
  const typeLabels = (info.types || []).map(cityLabel).filter(Boolean);
  const primary = [cityLabel(info.business), ...typeLabels, info.area].filter(Boolean);
  const badges = (info.badges || []).map(cityLabel).filter(Boolean).slice(0, 8);
  if (!primary.length && !badges.length) return "";
  return `
    <div class="city-local-info">
      ${primary.length ? `<p><span>本地类型</span>${primary.map((item) => `<strong>${escapeHtml(item)}</strong>`).join("")}</p>` : ""}
      ${badges.length ? `<p><span>本地标签</span>${badges.map((item) => `<strong>${escapeHtml(item)}</strong>`).join("")}</p>` : ""}
    </div>
  `;
}

function shopMatches(shop, query, category) {
  if (category && shop.category !== category) return false;
  if (!query) return true;
  const haystack = [
    shop.name,
    shop.localName,
    shop.kana,
    shop.area,
    shop.category,
    categoryLabel(shop.category),
    shop.directory,
    shop.city?.priceSummary,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function categoriesFor(list) {
  return [...new Set(list.map((shop) => shop.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function syncCategoryOptions(list) {
  const selected = categoryEl.value;
  const categories = categoriesFor(list);
  categoryEl.innerHTML = [
    `<option value="">全部种类</option>`,
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</option>`),
  ].join("");
  categoryEl.value = categories.includes(selected) ? selected : "";
}

function resetVisibleCount() {
  visibleCount = PAGE_SIZE;
}

function render() {
  const query = queryEl.value.trim();
  const category = categoryEl.value;
  const filtered = shops.filter((shop) => shopMatches(shop, query, category));
  const visible = filtered.slice(0, visibleCount);
  renderSummary(filtered, visible.length);
  gridEl.innerHTML = visible
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
              <span class="pill">${escapeHtml(categoryLabel(shop.category))}</span>
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
            ${renderCityLocalInfo(shop.city?.localInfo)}
            ${renderGirls(shop.city?.girls?.length ? shop.city.girls : shop.girls)}
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
    loadMoreEl.textContent = "";
    statusEl.textContent = "没有符合筛选条件的数据";
    return;
  }
  loadMoreEl.textContent =
    visible.length < filtered.length
      ? `继续下拉加载更多，还有 ${filtered.length - visible.length} 家`
      : "已显示全部符合条件的店铺";
}

function loadMore() {
  const query = queryEl.value.trim();
  const category = categoryEl.value;
  const filtered = shops.filter((shop) => shopMatches(shop, query, category));
  if (visibleCount >= filtered.length) return;
  visibleCount += PAGE_SIZE;
  render();
}

async function load() {
  const pref = prefEl.value;
  const limit = limitEl.value;
  const category = categoryEl.value;
  statusEl.textContent = `正在抓取 ${pref}，数量 ${limit}。首次加载会慢一些。`;
  gridEl.innerHTML = "";
  loadMoreEl.textContent = "";
  summaryEl.innerHTML = "";
  refreshEl.disabled = true;
  try {
    const params = new URLSearchParams({ pref, limit });
    if (category) params.set("category", category);
    let response = await fetch(apiPath(`/api/shops?${params.toString()}`));
    let staticSnapshot = false;
    if (!response.ok && response.status === 404) {
      staticSnapshot = true;
      response = await fetch(`./data/shops-${encodeURIComponent(pref)}.json`);
    }
    const data = await readJson(response);
    shops = (data.shops || []).slice(0, Number(limit));
    if (staticSnapshot && category) shops = shops.filter((shop) => shop.category === category);
    if (!category) syncCategoryOptions(shops);
    resetVisibleCount();
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
prefEl.addEventListener("change", () => {
  categoryEl.value = "";
  load();
});
limitEl.addEventListener("change", load);
categoryEl.addEventListener("change", () => {
  resetVisibleCount();
  load();
});
queryEl.addEventListener("input", () => {
  resetVisibleCount();
  render();
});

const observer = new IntersectionObserver(
  (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore();
  },
  { rootMargin: "240px 0px" },
);
observer.observe(loadMoreEl);

load();
