import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 4173);
const ROOT = new URL(".", import.meta.url).pathname;
const PUBLIC_ROOT = join(ROOT, "public");
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const TTL_MS = 1000 * 60 * 20;
const cache = new Map();

const PREF_LABELS = {
  tokyo: "Tokyo",
  kanagawa: "Kanagawa",
  aichi: "Aichi",
  osaka: "Osaka",
  fukuoka: "Fukuoka",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function json(res, status, body) {
  send(res, status, JSON.stringify(body, null, 2), {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
}

function cleanText(value = "") {
  return decodeHtml(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function absolutize(url, base) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http")) return url;
  return new URL(url, base).toString();
}

async function fetchText(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < TTL_MS) return cached.text;

  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "en-US,en;q=0.9,ja;q=0.8,zh-CN;q=0.7",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} while fetching ${url}`);
  }
  const text = await response.text();
  cache.set(url, { time: Date.now(), text });
  return text;
}

function extractConstArray(html, variableName) {
  const marker = `const ${variableName} = `;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Cannot find ${variableName}`);
  const arrayStart = html.indexOf("[", start);
  if (arrayStart === -1) throw new Error(`Cannot find ${variableName} array`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = arrayStart; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') inString = true;
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (depth === 0) return JSON.parse(html.slice(arrayStart, i + 1));
  }
  throw new Error(`Unclosed ${variableName} array`);
}

function cityPathForShop(shop) {
  if (!shop.pref_name || !shop.heaven_first_area_id || !shop.heaven_second_area_id || !shop.shop_directry_name) {
    return "";
  }
  return `/${shop.pref_name}/${shop.heaven_first_area_id}/${shop.heaven_second_area_id}/${shop.shop_directry_name}/`;
}

function cityAreaListUrlForShop(shop) {
  if (!shop.pref_name || !shop.heaven_first_area_id || !shop.heaven_second_area_id) return "";
  return `https://www.cityheaven.net/${shop.pref_name}/${shop.heaven_first_area_id}/${shop.heaven_second_area_id}/shop-list/`;
}

function normalizeShop(shop) {
  const cityPath = cityPathForShop(shop);
  return {
    id: shop.c_commu_id,
    name: shop.shop_romaji || shop.name,
    localName: shop.name,
    kana: shop.shop_kana_romaji || shop.shop_kana,
    directory: shop.shop_directry_name,
    pref: shop.pref_name,
    area: shop.first_area_name,
    category: shop.business_large_name,
    openTime: shop.shop_opentime,
    holiday: shop.shop_holiday,
    phone: shop.shop_tel_international || shop.shop_tel,
    travelersRank: shop.travelers_lank,
    yoasobiReviewCount: Number(shop.trareview_count || 0),
    payment: (shop.jyoken_list || []).map((item) => item.category_name || item.jyoken_name).filter(Boolean),
    image: shop.image_file_name || "",
    yoasobiUrl: absolutize(shop.yoasobi_area_shop_url, "https://yoasobi-heaven.com"),
    cityUrl: cityPath ? absolutize(cityPath, "https://www.cityheaven.net") : "",
    citySystemUrl: cityPath ? absolutize(`${cityPath}system/`, "https://www.cityheaven.net") : "",
    cityAreaListUrl: cityAreaListUrlForShop(shop),
    citySearchUrl: `https://www.cityheaven.net/${shop.pref_name}/shop-list/?shopname_search=${encodeURIComponent(shop.name)}`,
    girlsApiUrl: `https://yoasobi-heaven.com/api/${shop.c_commu_id}/girls-list/?member_disp_count=${shop.member_disp_count || 10}&display_member_count=${shop.display_member_count || 5}&travelers_lank=${shop.travelers_lank || ""}`,
    raw: {
      heavenFirstAreaId: shop.heaven_first_area_id,
      heavenSecondAreaId: shop.heaven_second_area_id,
      yoasobiFirstAreaId: shop.first_area_id,
      yoasobiSecondAreaId: shop.second_area_id,
    },
  };
}

function parseYoasobiPriceTable(html) {
  const box = html.match(/<div class="system_box_new"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i)?.[0] || "";
  const rows = [];
  for (const match of box.matchAll(/<tr>\s*<td class="time-cell">([\s\S]*?)<\/td>\s*<td class="price-cell">([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
    const row = {
      duration: cleanText(match[1]),
      price: cleanText(match[2]),
    };
    if (row.duration || row.price) rows.push(row);
  }
  return rows;
}

function parseYoasobiGirls(jsonText, shop) {
  try {
    const data = JSON.parse(jsonText);
    return (data.girls_list || []).slice(0, 12).map((girl) => ({
      id: girl.c_member_id,
      name: girl.girls_kana,
      image: girl.girls_photo_link || absolutize(`${shop.girl_link || ""}${girl.girl_first_image || ""}`, "https://yoasobi-heaven.com"),
      price: girl.total_price ? `¥${Number(girl.total_price).toLocaleString()}` : "",
      url: absolutize(`${shop.yoasobi_area_shop_url}girlid-${girl.c_member_id}/`, "https://yoasobi-heaven.com"),
    }));
  } catch {
    return [];
  }
}

function parseCityShopPage(html, shop) {
  const priceSummary =
    cleanText(html.match(/icon_yen\.svg[\s\S]*?<dd>([\s\S]*?)<\/dd>/i)?.[1]) ||
    cleanText(html.match(/<dd>\s*([^<]*?円[^<]*?)<\/dd>/i)?.[1]);
  const reviewCount = Number((html.match(/口コミ\s*:\s*([\d,]+)\s*件/i)?.[1] || "").replace(/,/g, "")) || 0;
  const updateTime = cleanText(html.match(/<p class="time_update">([\s\S]*?)<\/p>/i)?.[1]);
  const catchText = cleanText(html.match(/<p class="shop_catch"[\s\S]*?<\/p>/i)?.[0]);
  const cityGirls = [];
  const seen = new Set();
  const girlPattern = new RegExp(
    `<a[^>]+href="([^"]+/${shop.directory}/girlid-([\\d]+)/[^"]*)"[^>]*>[\\s\\S]*?<img[^>]+(?:data-echo|src)="([^"]+)"[^>]+alt="([^"]*)"`,
    "gi",
  );
  for (const match of html.matchAll(girlPattern)) {
    if (seen.has(match[2])) continue;
    seen.add(match[2]);
    cityGirls.push({
      id: match[2],
      name: cleanText(match[4]),
      image: absolutize(match[3], "https://www.cityheaven.net"),
      url: absolutize(match[1], "https://www.cityheaven.net"),
    });
    if (cityGirls.length >= 12) break;
  }
  return { priceSummary, reviewCount, updateTime, catchText, girls: cityGirls };
}

function parseCityListEntry(html, shop) {
  const marker = `/${shop.pref}/${shop.raw.heavenFirstAreaId}/${shop.raw.heavenSecondAreaId}/${shop.directory}/`;
  const markerAt = html.indexOf(marker);
  if (markerAt === -1) return null;

  const blockStart = html.lastIndexOf("<li", markerAt);
  const blockEnd = html.indexOf("</li><!--li.shop_list-->", markerAt);
  if (blockStart === -1 || blockEnd === -1) return null;
  const block = html.slice(blockStart, blockEnd);
  if (!/class="[^"]*\bshop_list\b/i.test(block.slice(0, 300))) return null;

  const priceSummary =
    cleanText(block.match(/icon_yen\.svg[\s\S]*?<dd>([\s\S]*?)<\/dd>/i)?.[1]) ||
    cleanText(block.match(/<dd>\s*([^<]*?円[^<]*?)<\/dd>/i)?.[1]);
  const reviewCount = Number((block.match(/口コミ\s*:\s*([\d,]+)\s*件/i)?.[1] || "").replace(/,/g, "")) || 0;
  const updateTime = cleanText(block.match(/<p class="time_update">([\s\S]*?)<\/p>/i)?.[1]);
  const catchText = cleanText(block.match(/<p class="shop_catch"[\s\S]*?<\/p>/i)?.[0]);
  const girls = [];
  const seen = new Set();
  const girlPattern = new RegExp(
    `<a[^>]+href="([^"]+/${shop.directory}/girlid-([\\d]+)/)"[^>]*>[\\s\\S]*?<img[^>]+(?:data-echo|src)="([^"]+)"[^>]+alt="([^"]*)"`,
    "gi",
  );
  for (const match of block.matchAll(girlPattern)) {
    if (seen.has(match[2])) continue;
    seen.add(match[2]);
    girls.push({
      id: match[2],
      name: cleanText(match[4]),
      image: absolutize(match[3], "https://www.cityheaven.net"),
      url: absolutize(match[1], "https://www.cityheaven.net"),
    });
    if (girls.length >= 12) break;
  }

  return { priceSummary, reviewCount, updateTime, catchText, girls };
}

async function loadYoasobiShops(pref, limit, category = "") {
  const url = `https://yoasobi-heaven.com/en/${pref}/shop-list/`;
  const html = await fetchText(url);
  const rawShops = extractConstArray(html, "shopData");
  const normalizedCategory = category.trim().toLowerCase();
  const filteredShops = normalizedCategory
    ? rawShops.filter((shop) => String(shop.business_large_name || "").toLowerCase() === normalizedCategory)
    : rawShops;
  return filteredShops.slice(0, limit).map((shop) => ({ rawShop: shop, ...normalizeShop(shop) }));
}

async function enrichShop(shop) {
  const [citySearchResult, cityListResult, cityResult, yoasobiPageResult, girlsResult] = await Promise.allSettled([
    shop.citySearchUrl ? fetchText(shop.citySearchUrl) : "",
    shop.cityAreaListUrl ? fetchText(shop.cityAreaListUrl) : "",
    shop.cityUrl ? fetchText(shop.cityUrl) : "",
    shop.yoasobiUrl ? fetchText(shop.yoasobiUrl) : "",
    fetchText(shop.girlsApiUrl),
  ]);

  const cityFromSearch =
    citySearchResult.status === "fulfilled"
      ? parseCityListEntry(citySearchResult.value, shop)
      : null;
  const cityFromArea =
    cityListResult.status === "fulfilled"
      ? parseCityListEntry(cityListResult.value, shop)
      : null;
  const cityFallback = cityResult.status === "fulfilled" ? parseCityShopPage(cityResult.value, shop) : null;
  const yoasobiPrice =
    yoasobiPageResult.status === "fulfilled" ? parseYoasobiPriceTable(yoasobiPageResult.value) : [];
  const girls =
    girlsResult.status === "fulfilled" ? parseYoasobiGirls(girlsResult.value, shop.rawShop || {}) : [];

  return {
    ...shop,
    city: cityFromSearch || cityFromArea || cityFallback || {
      priceSummary: "",
      reviewCount: 0,
      updateTime: "",
      catchText: "",
      girls: [],
    },
    yoasobiPrice,
    girls,
    status: {
      citySearch: citySearchResult.status,
      cityAreaList: cityListResult.status,
      city: cityResult.status,
      yoasobiPage: yoasobiPageResult.status,
      yoasobiGirls: girlsResult.status,
    },
  };
}

async function handleShops(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pref = url.searchParams.get("pref") || "tokyo";
  const limit = Math.min(Number(url.searchParams.get("limit") || 24), 80);
  const category = url.searchParams.get("category") || "";
  const enrich = url.searchParams.get("enrich") !== "0";

  json(res, 200, await getAggregatedShops({ pref, limit, category, enrich }));
}

export async function getAggregatedShops({ pref = "tokyo", limit = 24, category = "", enrich = true } = {}) {
  const cappedLimit = Math.min(Number(limit || 24), 80);
  const shops = await loadYoasobiShops(pref, cappedLimit, category);
  const data = enrich ? await Promise.all(shops.map(enrichShop)) : shops;
  return {
    source: {
      primary: `https://yoasobi-heaven.com/en/${pref}/shop-list/`,
      secondaryBase: "https://www.cityheaven.net",
      fetchedAt: new Date().toISOString(),
    },
    pref,
    prefLabel: PREF_LABELS[pref] || pref,
    category,
    count: data.length,
    shops: data,
  };
}

function handleAnalyze(res) {
  json(res, 200, {
    purpose: "Compare public shop, staff, price, and review metadata between Yoasobi Heaven and CityHeaven.",
    calls: [
      {
        site: "Yoasobi Heaven",
        endpoint: "https://yoasobi-heaven.com/en/{pref}/shop-list/",
        method: "GET",
        usage: "Primary shop index. The page embeds const shopData = [...] with shared shop IDs, directory names, area IDs, links, categories, contact/opening metadata, and Yoasobi review counts.",
      },
      {
        site: "Yoasobi Heaven",
        endpoint: "https://yoasobi-heaven.com/en/{pref}/{yoasobi_area}/{shop_directory}/",
        method: "GET",
        usage: "Per-shop page. Used for the visitor-facing price table in #system_box_new.",
      },
      {
        site: "Yoasobi Heaven",
        endpoint: "https://yoasobi-heaven.com/api/{c_commu_id}/girls-list/",
        method: "GET",
        params: ["member_disp_count", "display_member_count", "travelers_lank"],
        usage: "Public staff preview used by Yoasobi shop-list JavaScript.",
      },
      {
        site: "CityHeaven",
        endpoint: "https://www.cityheaven.net/{pref}/shop-list/?shopname_search={local_shop_name}",
        method: "GET",
        usage: "Preferred local enrichment source. The search result contains the target shop block with local price summary, review count, update time, and staff preview.",
      },
      {
        site: "CityHeaven",
        endpoint: "https://www.cityheaven.net/{pref}/{heaven_first_area_id}/{heaven_second_area_id}/shop-list/",
        method: "GET",
        usage: "Area-level fallback for local shop blocks when the search page does not resolve cleanly.",
      },
      {
        site: "CityHeaven",
        endpoint: "https://www.cityheaven.net/{pref}/{heaven_first_area_id}/{heaven_second_area_id}/{shop_directory}/",
        method: "GET",
        usage: "Per-shop local page. Used as a fallback for staff preview and canonical links; it does not always expose price or review counts.",
      },
      {
        site: "CityHeaven",
        endpoint: "https://www.cityheaven.net/{pref}/{heaven_first_area_id}/{heaven_second_area_id}/{shop_directory}/system/",
        method: "GET",
        usage: "Price-system page. Some shops expose price only as an image, so the app currently prefers the text summary from the shop page.",
      },
    ],
    matching: "Yoasobi shopData provides both Yoasobi area IDs and CityHeaven area IDs. CityHeaven URLs are derived from pref_name, heaven_first_area_id, heaven_second_area_id, and shop_directry_name.",
    notes: [
      "The app does not use login-only pages, cookies, or private APIs.",
      "Network results are cached in memory for 20 minutes.",
      "The limit query parameter is capped at 80 to avoid excessive requests.",
    ],
  });
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const fullPath = join(PUBLIC_ROOT, safePath);
  if (!fullPath.startsWith(PUBLIC_ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };
  try {
    const body = await readFile(fullPath);
    send(res, 200, body, {
      "content-type": contentTypes[extname(fullPath)] || "application/octet-stream",
    });
  } catch {
    send(res, 404, "Not found");
  }
}

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") {
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/shops") {
      await handleShops(req, res);
      return;
    }
    if (url.pathname === "/api/analyze") {
      handleAnalyze(res);
      return;
    }
    await handleStatic(req, res);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, () => {
    console.log(`Yoasobi/CityHeaven compare app: http://localhost:${PORT}`);
  });
}
