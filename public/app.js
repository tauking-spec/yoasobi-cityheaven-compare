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

function text(value) {
  return value == null || value === "" ? "N/A" : String(value);
}

function categoryLabel(value = "") {
  return CATEGORY_LABELS[value] || value || "未分类";
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
                  ? `<button class="girl-detail-trigger" type="button" data-url="${escapeHtml(girl.url)}">资料/评价</button>`
                  : `<span class="girl-detail-missing">无本地详情</span>`
              }
              <div class="girl-detail" aria-live="polite"></div>
            </div>
          `,
        )
        .join("")}
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

gridEl.addEventListener("click", async (event) => {
  const trigger = event.target.closest(".girl-detail-trigger");
  if (!trigger) return;
  const detailEl = trigger.parentElement.querySelector(".girl-detail");
  const isOpen = detailEl.dataset.open === "1";
  if (isOpen) {
    detailEl.dataset.open = "0";
    detailEl.innerHTML = "";
    trigger.textContent = "资料/评价";
    return;
  }
  trigger.disabled = true;
  trigger.textContent = "加载中";
  detailEl.dataset.open = "1";
  detailEl.innerHTML = `<p>正在读取 CityHeaven 资料...</p>`;
  try {
    const data = await fetchApiJson(`/api/girl?url=${encodeURIComponent(trigger.dataset.url)}`);
    detailEl.innerHTML = data.blocked
      ? `<p>${escapeHtml(data.message || "源站限制读取该技师页。")}</p>
         <a class="girl-detail-source" href="${escapeHtml(data.url || trigger.dataset.url)}" target="_blank">打开 CityHeaven 原页</a>`
      : `
      <dl>
        ${data.age ? `<div><dt>年龄</dt><dd>${escapeHtml(data.age)}</dd></div>` : ""}
        ${data.measurements ? `<div><dt>三围</dt><dd>${escapeHtml(data.measurements)}</dd></div>` : ""}
        ${data.bloodType ? `<div><dt>血型</dt><dd>${escapeHtml(data.bloodType)}</dd></div>` : ""}
      </dl>
      ${
        data.salesPoints?.length
          ? `<div class="girl-tags">${data.salesPoints.map((point) => `<span>${escapeHtml(point)}</span>`).join("")}</div>`
          : ""
      }
      ${
        data.review
          ? `<div class="girl-review">
              <strong>${escapeHtml(data.review.title || "最新口コミ")}</strong>
              ${data.review.date ? `<span>${escapeHtml(data.review.date)}</span>` : ""}
              ${data.review.body ? `<p>${escapeHtml(data.review.body)}</p>` : ""}
            </div>`
          : `<p>暂无 CityHeaven 口コミ。</p>`
      }
    `;
    trigger.textContent = "收起评价";
  } catch (error) {
    detailEl.innerHTML = `<p>加载失败：${escapeHtml(error.message)}</p>`;
    trigger.textContent = "重试";
  } finally {
    trigger.disabled = false;
  }
});

const observer = new IntersectionObserver(
  (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore();
  },
  { rootMargin: "240px 0px" },
);
observer.observe(loadMoreEl);

load();
