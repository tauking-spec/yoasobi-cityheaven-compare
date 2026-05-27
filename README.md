# Yoasobi / CityHeaven 信息统合

轻量 Node 应用，用于把 Yoasobi Heaven 国际站的公开店铺信息作为主数据源，并补充 CityHeaven 本地站的价格摘要、评价数和技师预览。

## 运行

```bash
npm start
```

默认地址：

```text
http://localhost:4173
```

## 接口

- `GET /api/shops?pref=tokyo&limit=24`
  - 抓取并聚合公开信息。
  - `limit` 最大 80，避免对源站产生过多请求。
- `GET /api/analyze`
  - 输出两个站点当前使用到的公开页面/API 梳理。

## GitHub Pages

GitHub Pages 不能运行 Node 服务。本项目通过 GitHub Actions 在部署时执行：

```bash
npm run build:data
```

该命令会生成 `public/data/shops-{pref}.json` 静态快照，Pages 上的前端会自动读取这些 JSON。工作流位于 `.github/workflows/pages.yml`，会在 `main` 分支 push 后自动部署，并每 12 小时刷新一次快照。

## 当前匹配逻辑

Yoasobi 的 `shopData` 中同时包含国际站路径和 CityHeaven 的地区 ID：

- `pref_name`
- `heaven_first_area_id`
- `heaven_second_area_id`
- `shop_directry_name`

因此 CityHeaven 单店页可拼为：

```text
https://www.cityheaven.net/{pref_name}/{heaven_first_area_id}/{heaven_second_area_id}/{shop_directry_name}/
```

本地站价格摘要和口コミ数优先来自：

```text
https://www.cityheaven.net/{pref_name}/shop-list/?shopname_search={店铺日文名}
```

如果搜索结果无法定位店铺，再回退到对应地区的 `shop-list/`。

## 注意

应用只读取公开页面和公开接口，不使用登录态、Cookie、验证码或非公开数据。部分 CityHeaven 店铺的完整价格表是图片，当前优先展示列表/单店页能解析到的文本价格摘要。
