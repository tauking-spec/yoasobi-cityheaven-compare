const prefEl = document.querySelector("#pref");
const areaEl = document.querySelector("#area");
const limitEl = document.querySelector("#limit");
const categoryEl = document.querySelector("#category");
const queryEl = document.querySelector("#query");
const refreshEl = document.querySelector("#refresh");
const gridEl = document.querySelector("#grid");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const loadMoreEl = document.querySelector("#load-more");
const mapEl = document.querySelector("#map");
const mapStatusEl = document.querySelector("#map-status");

let shops = [];
let visibleCount = 10;
let areaOptions = [];
let categoryOptions = [];
let selectedShopId = "";
let currentMapInfo = { lat: 35.6812, lng: 139.7671, zoom: 11 };
let map;
let markerLayer;
const markers = new Map();
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
const AREA_LABELS = {
  "Akihabara and Tokyo Dome": "秋叶原 / 东京巨蛋",
  "Asakusa and Ueno": "浅草 / 上野",
  "Atsugi and Ebina": "厚木 / 海老名",
  "Chofu, Fuchu and Kichijoji": "调布 / 府中 / 吉祥寺",
  "Fukuoka": "福冈",
  "Ginza and Nihonbashi": "银座 / 日本桥",
  "Hakone and Odawara": "箱根 / 小田原",
  "Ikebukuro and Otsuka": "池袋 / 大塚",
  "Kamakura and Shonan": "镰仓 / 湘南",
  "Kamata and Haneda": "蒲田 / 羽田",
  "Kawasaki": "川崎",
  "Kinshicho and Tokyo Skytree": "锦糸町 / 晴空塔",
  "Kitakyushu": "北九州",
  "Kurume": "久留米",
  "Machida, Sagamihara, Yamato and Zama": "町田 / 相模原 / 大和 / 座间",
  "Mikawa-Anjo": "三河安城",
  "Nagoya": "名古屋",
  "Osaka City North": "大阪市北部",
  "Osaka City South": "大阪市南部",
  "Owari-Ichinomiya": "尾张一宫",
  "Roppongi and Tokyo Tower": "六本木 / 东京塔",
  "Sakai City and Kansai International Airport Area": "堺市 / 关西机场",
  "Shibuya and Harajuku": "涩谷 / 原宿",
  "Shimonoseki": "下关",
  "Shin-Yokohama": "新横滨",
  "Shinagawa and Hamamatsucho": "品川 / 滨松町",
  "Shinjuku Kabukicho": "新宿 / 歌舞伎町",
  "Tachikawa, Takao-san (Mt. Takao) and Yokota Air Base": "立川 / 高尾山 / 横田基地",
  "Toyohashi": "丰桥",
  "Yokohama": "横滨",
  "Yokosuka": "横须贺",
  "Yoshiwara": "吉原",
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

function areaLabel(value = "") {
  return AREA_LABELS[value] || value || "未分区";
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
    areaLabel(shop.area),
    shop.areaId,
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
  const counts = new Map();
  for (const shop of list) {
    if (!shop.category) continue;
    counts.set(shop.category, (counts.get(shop.category) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function areasFor(list) {
  const counts = new Map();
  for (const shop of list) {
    const value = shop.areaId || shop.rawShop?.first_area_id || shop.area;
    const label = shop.area || shop.rawShop?.first_area_name || value;
    if (!value) continue;
    const current = counts.get(value) || { value, label, count: 0, location: shop.location };
    current.count += 1;
    counts.set(value, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function syncCategoryOptions(options) {
  const selected = categoryEl.value;
  const categories = options?.length ? options : categoriesFor(shops);
  categoryOptions = categories;
  categoryEl.innerHTML = [
    `<option value="">全部种类</option>`,
    ...categories.map(
      (category) =>
        `<option value="${escapeHtml(category.value)}">${escapeHtml(categoryLabel(category.label))} (${category.count})</option>`,
    ),
  ].join("");
  categoryEl.value = categories.some((category) => category.value === selected) ? selected : "";
}

function syncAreaOptions(options) {
  const selected = areaEl.value;
  const areas = options?.length ? options : areasFor(shops);
  areaOptions = areas;
  areaEl.innerHTML = [
    `<option value="">全部二级地区</option>`,
    ...areas.map((area) => `<option value="${escapeHtml(area.value)}">${escapeHtml(areaLabel(area.label))} (${area.count})</option>`),
  ].join("");
  areaEl.value = areas.some((area) => area.value === selected) ? selected : "";
}

function resetVisibleCount() {
  visibleCount = PAGE_SIZE;
}

function ensureMap(center = { lat: 35.6812, lng: 139.7671, zoom: 11 }) {
  if (typeof L === "undefined") {
    mapStatusEl.textContent = "地图组件加载失败";
    return false;
  }
  if (!map) {
    map = L.map(mapEl, { scrollWheelZoom: false }).setView([center.lat, center.lng], center.zoom || 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }
  return true;
}

function shopCoords(shop) {
  if (!shop?.location || typeof shop.location.lat !== "number" || typeof shop.location.lng !== "number") return null;
  return [shop.location.lat, shop.location.lng];
}

function selectShop(shopId, { scroll = false } = {}) {
  if (!shopId) return;
  selectedShopId = shopId;
  document.querySelectorAll(".shop-card").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.shopId === shopId);
  });
  const shop = shops.find((item) => item.id === shopId);
  const coords = shopCoords(shop);
  if (coords && map) {
    map.flyTo(coords, Math.max(map.getZoom(), 14), { animate: true, duration: 0.8 });
    markers.get(shopId)?.openPopup();
  }
  if (scroll) {
    document.querySelector(`.shop-card[data-shop-id="${CSS.escape(shopId)}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
}

function updateMap(list, mapInfo) {
  if (!ensureMap(mapInfo)) return;
  markerLayer.clearLayers();
  markers.clear();
  const bounds = [];

  for (const shop of list) {
    const coords = shopCoords(shop);
    if (!coords) continue;
    const marker = L.marker(coords)
      .bindPopup(
        `<strong>${escapeHtml(shop.name)}</strong><br>${escapeHtml(areaLabel(shop.area))}<br>${escapeHtml(categoryLabel(shop.category))}`,
      )
      .on("click", () => selectShop(shop.id, { scroll: true }));
    marker.addTo(markerLayer);
    markers.set(shop.id, marker);
    bounds.push(coords);
  }

  if (!bounds.length) {
    mapStatusEl.textContent = "当前筛选结果没有可定位店铺";
    if (mapInfo?.lat && mapInfo?.lng) map.setView([mapInfo.lat, mapInfo.lng], mapInfo.zoom || 11);
    return;
  }

  mapStatusEl.textContent = `显示 ${bounds.length} 家店铺位置`;
  if (selectedShopId && list.some((shop) => shop.id === selectedShopId)) {
    selectShop(selectedShopId);
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 14);
  } else {
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  }
  setTimeout(() => map.invalidateSize(), 0);
}

function render() {
  const query = queryEl.value.trim();
  const category = categoryEl.value;
  const filtered = shops.filter((shop) => shopMatches(shop, query, category));
  if (selectedShopId && !filtered.some((shop) => shop.id === selectedShopId)) selectedShopId = "";
  const visible = filtered.slice(0, visibleCount);
  renderSummary(filtered, visible.length);
  gridEl.innerHTML = visible
    .map(
      (shop) => `
        <article class="shop-card ${shop.id === selectedShopId ? "is-selected" : ""}" data-shop-id="${escapeHtml(shop.id)}">
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
              <button class="locate-shop" type="button" data-shop-id="${escapeHtml(shop.id)}">地图定位</button>
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
    updateMap([], currentMapInfo);
    return;
  }
  loadMoreEl.textContent =
    visible.length < filtered.length
      ? `继续下拉加载更多，还有 ${filtered.length - visible.length} 家`
      : "已显示全部符合条件的店铺";
  updateMap(filtered, currentMapInfo);
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
  const area = areaEl.value;
  statusEl.textContent = `正在抓取 ${pref}，数量 ${limit}。首次加载会慢一些。`;
  gridEl.innerHTML = "";
  loadMoreEl.textContent = "";
  summaryEl.innerHTML = "";
  refreshEl.disabled = true;
  try {
    const params = new URLSearchParams({ pref, limit });
    if (category) params.set("category", category);
    if (area) params.set("area", area);
    let response = await fetch(apiPath(`/api/shops?${params.toString()}`));
    let staticSnapshot = false;
    if (!response.ok && response.status === 404) {
      staticSnapshot = true;
      response = await fetch(`./data/shops-${encodeURIComponent(pref)}.json`);
    }
    const data = await readJson(response);
    currentMapInfo = data.map || currentMapInfo;
    shops = (data.shops || []).slice(0, Number(limit));
    if (staticSnapshot && category) shops = shops.filter((shop) => shop.category === category);
    if (staticSnapshot && area) {
      shops = shops.filter((shop) => (shop.areaId || shop.rawShop?.first_area_id || shop.area) === area);
    }
    syncCategoryOptions(data.categories || categoriesFor(shops));
    syncAreaOptions(data.areas || areasFor(shops));
    selectedShopId = "";
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
  areaEl.value = "";
  load();
});
limitEl.addEventListener("change", load);
categoryEl.addEventListener("change", () => {
  resetVisibleCount();
  areaEl.value = "";
  selectedShopId = "";
  load();
});
areaEl.addEventListener("change", () => {
  resetVisibleCount();
  selectedShopId = "";
  load();
});
queryEl.addEventListener("input", () => {
  resetVisibleCount();
  render();
});
gridEl.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const trigger = event.target.closest(".locate-shop");
  if (trigger) {
    event.preventDefault();
    selectShop(trigger.dataset.shopId);
    return;
  }
  if (event.target.closest("a, button")) return;
  const card = event.target.closest(".shop-card");
  if (card) selectShop(card.dataset.shopId);
});

const observer = new IntersectionObserver(
  (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore();
  },
  { rootMargin: "240px 0px" },
);
observer.observe(loadMoreEl);

load();
