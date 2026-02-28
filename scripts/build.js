#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");
const cheerio = require("cheerio");

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "posts");
const CONTENT_DIR = path.join(ROOT, "content");
const TEMPLATE_PATH = path.join(ROOT, "blog-post.html");
const SITE_URL = (process.env.SITE_URL || "https://hjtrending.com").replace(/\/+$/, "");
const HOME_LATEST_LIMIT = Number(process.env.HOME_LATEST_LIMIT || 6);
const CATEGORY_LIMIT = Number(process.env.CATEGORY_LIMIT || 12);
const BLOG_LIMIT = Number(process.env.BLOG_LIMIT || 18);

const CATEGORY_MAP = {
  sports: { key: "sports", label: "Sports", emoji: "", page: "sports.html", className: "cat-sports", dataCat: "sports" },
  gaming: { key: "gaming", label: "Gaming", emoji: "", page: "gaming.html", className: "cat-gaming", dataCat: "gaming" },
  entertainment: { key: "entertainment", label: "Entertainment", emoji: "", page: "entertainment.html", className: "cat-entertainment", dataCat: "entertainment" },
  trending: { key: "trending", label: "Trending", emoji: "", page: "trending.html", className: "cat-trending", dataCat: "trending" },
  fifa2026: { key: "fifa2026", label: "FIFA 2026", emoji: "", page: "fifa2026.html", className: "cat-fifa", dataCat: "fifa" },
  news: { key: "news", label: "News", emoji: "", page: "news.html", className: "cat-trending", dataCat: "news" }
};

marked.setOptions({ gfm: true, breaks: false });

main();

function main() {
  ensureDir(POSTS_DIR);
  ensureDir(CONTENT_DIR);
  ensureBlogPage();
  ensureNewsPage();

  const posts = loadPosts();
  const template = readFileSafe(TEMPLATE_PATH);
  if (!template) {
    throw new Error("Missing required template file: blog-post.html");
  }

  posts.forEach((post) => buildPostPage(post, posts, template));

  updateIndexPage(posts);
  updateBlogPage(posts);
  updateCategoryPages(posts);
  generateSitemap(posts);

  console.log(`Built ${posts.length} markdown post(s).`);
}

function loadPosts() {
  const sources = [
    { dir: POSTS_DIR, sourceType: "posts" },
    { dir: CONTENT_DIR, sourceType: "content" }
  ];
  const markdownFiles = sources.flatMap((source) => {
    return walkFiles(source.dir)
      .filter((f) => isPublishableMarkdown(f))
      .map((filePath) => ({ filePath, source }));
  });

  const all = markdownFiles.map(({ filePath, source }) => {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    const fm = parsed.data || {};
    const stat = fs.statSync(filePath);
    const relPath = path.relative(source.dir, filePath).replace(/\\/g, "/");

    const slug = slugify(String(fm.slug || path.basename(filePath, ".md")));
    const inferredCategory = inferCategoryFromPath(relPath);
    const categoryKey = normalizeCategory(fm.category || inferredCategory || "news");
    const category = CATEGORY_MAP[categoryKey] || CATEGORY_MAP.news;
    const date = parseDate(fm.date) || stat.mtime;
    const title = String(fm.title || slug.replace(/-/g, " "));
    const description = String(fm.description || buildExcerpt(parsed.content, 155));
    const thumbnail = String(fm.thumbnail || "/assets/images/default-thumb.jpg");
    const author = String(fm.author || "HJ Trending");
    let tags = [];
    if (Array.isArray(fm.tags)) {
      tags = fm.tags.map((t) => String(t)).filter(Boolean);
    } else if (fm.tags) {
      tags = String(fm.tags)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
    const htmlContent = marked.parse(parsed.content || "");
    const readingMinutes = estimateReadMinutes(parsed.content || "");

    return {
      slug,
      sourcePath: filePath,
      sourceType: source.sourceType,
      outputPath: path.join(POSTS_DIR, `${slug}.html`),
      title,
      date,
      isoDate: toISODate(date),
      humanDate: toHumanDate(date),
      category,
      description,
      thumbnail,
      author,
      tags,
      contentHtml: htmlContent,
      readingMinutes,
      excerpt: buildExcerpt(parsed.content || description, 160),
      url: `${SITE_URL}/posts/${slug}.html`
    };
  });

  all.sort((a, b) => b.date - a.date || a.slug.localeCompare(b.slug));
  return dedupeBySlug(all);
}

function buildPostPage(post, allPosts, templateHtml) {
  const $ = cheerio.load(templateHtml, { decodeEntities: false });

  const pageTitle = `${post.title} | HJ Trending`;
  $("title").text(pageTitle);
  setMetaByName($, "description", post.description);
  // add keywords meta from tags for extra SEO value
  if (post.tags && post.tags.length) {
    setMetaByName($, "keywords", post.tags.join(", "));
  }
  setMetaByName($, "robots", "index, follow");
  setMetaByProperty($, "og:title", post.title);
  setMetaByProperty($, "og:description", post.description);
  setMetaByProperty($, "og:image", toAbsoluteUrl(post.thumbnail));
  setMetaByProperty($, "og:url", post.url);
  setMetaByProperty($, "og:type", "article");
  setMetaByName($, "twitter:card", "summary_large_image");
  setMetaByName($, "twitter:title", post.title);
  setMetaByName($, "twitter:description", post.description);
  setMetaByName($, "twitter:image", toAbsoluteUrl(post.thumbnail));
  setCanonical($, post.url);
  setArticleSchemas($, post);

  // ---- hero image ---------------------------------------------------
  const heroEl = $(".article-hero").first();
  if (heroEl.length) {
    heroEl.empty();
    const thumbPath = post.thumbnail || "";
    // convert to path usable from posts/ folder
    const imgSrc = /^https?:/.test(thumbPath)
      ? thumbPath
      : thumbPath.startsWith("/")
      ? thumbPath.slice(1)
      : `../${thumbPath}`;
    heroEl.append(`<img src="${imgSrc}" alt="${escapeHtml(post.title)}">`);
  }
  if (post.thumbnailCaption) {
    $(".article-hero__caption").text(post.thumbnailCaption);
  } else {
    $(".article-hero__caption").remove();
  }

  // remove the generic "more from" section so first/solo posts
  // don't link out to placeholder content (GTA, etc.)
  $(".dark-band").remove();

  $(".breadcrumb a").first().attr("href", "../index.html");
  $(".breadcrumb a").eq(1).attr("href", `../${post.category.page}`).text(post.category.label);
  $(".breadcrumb .breadcrumb__current").text(post.title);

  $(".article-cat-tag")
    .removeClass("cat-sports cat-gaming cat-entertainment cat-trending cat-fifa")
    .addClass(post.category.className)
    .text(`${post.category.emoji} ${post.category.label}`);
  $(".article-h1").text(post.title);
  $(".article-deck").text(post.description);
  $(".author-name, .author-bio__name").text(post.author);
  $(".article-dates span").first().text(post.humanDate);
  $(".js-read-time").text(`${post.readingMinutes} min read`);

  $(".article-body").html(post.contentHtml);
  replaceTags($, post.tags);
  replaceRelated($, post, allPosts);
  ensureLegalLinks($);
  rewriteRootRelativeLinksForPost($);

  const out = $.html();
  fs.writeFileSync(post.outputPath, out, "utf8");
}

function updateIndexPage(posts) {
  const indexPath = path.join(ROOT, "index.html");
  if (!fs.existsSync(indexPath)) {
    return;
  }
  const $ = cheerio.load(fs.readFileSync(indexPath, "utf8"), { decodeEntities: false });
  const latest = posts.slice(0, HOME_LATEST_LIMIT);
  const more = posts.slice(HOME_LATEST_LIMIT, HOME_LATEST_LIMIT + 18);
  const sideLatest = posts.slice(0, 4);

  const grid = $("main .card-grid").first();
  if (grid.length) {
    const cards = latest.map((p) => renderGridCard(p, { includeDataCat: true }));
    upsertGeneratedCards($, grid, cards);
  }
  const list = $("#moreStories").first();
  if (list.length) {
    const rows = more.map((p) => renderListRow(p, { includeDataCat: true }));
    upsertGeneratedCards($, list, rows);
  }
  const heroSide = $(".hero__side").first();
  if (heroSide.length && sideLatest.length > 0) {
    heroSide.find(".side-story").remove();
    sideLatest.forEach((post) => {
      heroSide.append(`\n${renderSideStory(post)}`);
    });
  }

  // ---- trending sidebar -----------------------------------------
  // replace hardcoded 'Trending Now' items with the latest posts
  const trendingWidget = $(".sidebar .widget").first();
  if (trendingWidget.length) {
    trendingWidget.find(".trend-item").remove();
    posts.slice(0, 5).forEach((post, idx) => {
      const num = idx + 1;
      const cat = post.category.label;
      const url = `posts/${post.slug}.html`;
      const html = `<div class="trend-item"><span class="trend-num">${num}</span><div><div class="trend-cat">${cat}</div><a href="${url}" class="trend-title">${escapeHtml(post.title)}</a><div class="trend-meta">${escapeHtml(post.readingMinutes + ' min read')}</div></div></div>`;
      trendingWidget.append(html);
    });
  }

  fs.writeFileSync(indexPath, $.html(), "utf8");
}

function updateBlogPage(posts) {
  const blogPath = path.join(ROOT, "blog.html");
  if (!fs.existsSync(blogPath)) {
    return;
  }
  const $ = cheerio.load(fs.readFileSync(blogPath, "utf8"), { decodeEntities: false });
  const latest = posts.slice(0, BLOG_LIMIT);
  const list = posts.slice(BLOG_LIMIT, BLOG_LIMIT + 30);

  const grid = $("main .card-grid").first();
  if (grid.length) {
    const cards = latest.map((p) => renderGridCard(p, { includeDataCat: true }));
    upsertGeneratedCards($, grid, cards);
  }
  const more = $("#moreStories").first();
  if (more.length) {
    const rows = list.map((p) => renderListRow(p, { includeDataCat: true }));
    upsertGeneratedCards($, more, rows);
  }
  fs.writeFileSync(blogPath, $.html(), "utf8");
}

function updateCategoryPages(posts) {
  const pages = Object.values(CATEGORY_MAP);
  pages.forEach((cat) => {
    const pagePath = path.join(ROOT, cat.page);
    if (!fs.existsSync(pagePath)) {
      return;
    }

    const categoryPosts = posts.filter((p) => p.category.key === cat.key).slice(0, CATEGORY_LIMIT);

    const $ = cheerio.load(fs.readFileSync(pagePath, "utf8"), { decodeEntities: false });
    const grid = $("main .card-grid").first();
    if (grid.length) {
      const cards = categoryPosts.map((p) => renderGridCard(p, { includeDataCat: false }));
      upsertGeneratedCards($, grid, cards);
    }
    fs.writeFileSync(pagePath, $.html(), "utf8");
  });
}

function generateSitemap(posts) {
  const rootHtml = fs
    .readdirSync(ROOT)
    .filter((name) => name.endsWith(".html"))
    .filter((name) => !name.startsWith("."))
    .sort();

  const urls = [];
  rootHtml.forEach((name) => {
    const abs = path.join(ROOT, name);
    const stat = fs.statSync(abs);
    urls.push({ loc: `${SITE_URL}/${name}`, lastmod: toISODate(stat.mtime) });
  });
  posts.forEach((post) => {
    const stat = fs.existsSync(post.outputPath) ? fs.statSync(post.outputPath) : fs.statSync(post.sourcePath);
    urls.push({ loc: `${SITE_URL}/posts/${post.slug}.html`, lastmod: toISODate(stat.mtime) });
  });
  urls.push({ loc: `${SITE_URL}/`, lastmod: toISODate(new Date()) });

  const body = urls
    .map(
      (u) => [
        "  <url>",
        `    <loc>${escapeXml(u.loc)}</loc>`,
        `    <lastmod>${u.lastmod}</lastmod>`,
        "  </url>"
      ].join("\n")
    )
    .join("\n");

  const xml = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    body,
    "</urlset>",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
}

function ensureBlogPage() {
  const blogPath = path.join(ROOT, "blog.html");
  if (fs.existsSync(blogPath)) {
    return;
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Blog | HJ Trending</title>
<meta name="description" content="Latest stories from HJ Trending across sports, gaming, entertainment, trending, FIFA 2026 and news.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${SITE_URL}/blog.html">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="nav-wrap"><nav class="nav"><a href="index.html" class="nav__logo">HJ<span></span>TRENDING</a><ul class="nav__links"><li><a href="index.html">Home</a></li><li><a href="blog.html" class="active">Blog</a></li><li><a href="news.html">News</a></li><li><a href="sports.html">Sports</a></li><li><a href="gaming.html">Gaming</a></li></ul><div class="nav__right"><button class="nav__search-btn" id="searchBtn" aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button><button class="nav__burger" id="burgerBtn" aria-label="Menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button></div></nav></div>
<div class="cat-bar" role="navigation" aria-label="Filter by category"><div class="cat-bar__inner"><button class="cat-btn active" onclick="filterCat(this,'all')">All</button><button class="cat-btn" onclick="filterCat(this,'news')"> News</button><button class="cat-btn" onclick="filterCat(this,'sports')"> Sports</button><button class="cat-btn" onclick="filterCat(this,'gaming')"> Gaming</button><button class="cat-btn" onclick="filterCat(this,'entertainment')"> Entertainment</button><button class="cat-btn" onclick="filterCat(this,'trending')"> Trending</button><button class="cat-btn" onclick="filterCat(this,'fifa')"> FIFA 2026</button></div></div>
<div class="main-layout"><main class="feed"><div class="sec-label">Latest Articles</div><div class="card-grid"></div><div class="sec-label">More Stories</div><div class="card-list" id="moreStories"></div></main></div>
<footer><div class="footer-top"><div><div class="footer-logo">HJ<span></span>TRENDING</div></div><div class="footer-col"><div class="footer-col__title">Legal</div><ul><li><a href="privacy-policy.html">Privacy Policy</a></li><li><a href="terms-of-service.html">Terms of Service</a></li><li><a href="cookie-policy.html">Cookie Policy</a></li><li><a href="disclaimer.html">Disclaimer</a></li></ul></div></div></footer>
<button class="back-top" id="backTop" aria-label="Back to top"></button>
<div class="search-overlay" id="searchOverlay" role="dialog"><div class="search-box"><div class="search-input-wrap"><input type="text" id="searchInput" placeholder="Search stories..."><button class="search-close" id="searchClose"></button></div></div></div>
<div class="mobile-menu" id="mobileMenu" role="dialog"><div class="mobile-menu__header"><span class="mobile-menu__logo">HJ<span></span>TRENDING</span><button class="mobile-menu__close" id="mobileClose"></button></div><a href="index.html">Home</a><a href="blog.html">Blog</a><a href="news.html">News</a><a href="sports.html">Sports</a><a href="gaming.html">Gaming</a></div>
<script src="main.js"></script>
</body>
</html>
`;
  fs.writeFileSync(blogPath, html, "utf8");
}

function ensureNewsPage() {
  const newsPath = path.join(ROOT, "news.html");
  if (fs.existsSync(newsPath)) {
    return;
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>News | HJ Trending</title>
<meta name="description" content="Latest news updates on HJ Trending.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${SITE_URL}/news.html">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="nav-wrap"><nav class="nav"><a href="index.html" class="nav__logo">HJ<span></span>TRENDING</a><ul class="nav__links"><li><a href="index.html">Home</a></li><li><a href="news.html" class="active">News</a></li><li><a href="blog.html">Blog</a></li><li><a href="sports.html">Sports</a></li><li><a href="gaming.html">Gaming</a></li></ul><div class="nav__right"><button class="nav__search-btn" id="searchBtn" aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button><button class="nav__burger" id="burgerBtn" aria-label="Menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button></div></nav></div>
<div class="main-layout"><main class="feed"><div class="sec-label"> Latest News</div><div class="card-grid"></div></main></div>
<footer><div class="footer-top"><div><div class="footer-logo">HJ<span></span>TRENDING</div></div><div class="footer-col"><div class="footer-col__title">Legal</div><ul><li><a href="privacy-policy.html">Privacy Policy</a></li><li><a href="terms-of-service.html">Terms of Service</a></li><li><a href="cookie-policy.html">Cookie Policy</a></li><li><a href="disclaimer.html">Disclaimer</a></li></ul></div></div></footer>
<button class="back-top" id="backTop" aria-label="Back to top"></button>
<div class="search-overlay" id="searchOverlay" role="dialog"><div class="search-box"><div class="search-input-wrap"><input type="text" id="searchInput" placeholder="Search stories..."><button class="search-close" id="searchClose"></button></div></div></div>
<div class="mobile-menu" id="mobileMenu" role="dialog"><div class="mobile-menu__header"><span class="mobile-menu__logo">HJ<span></span>TRENDING</span><button class="mobile-menu__close" id="mobileClose"></button></div><a href="index.html">Home</a><a href="news.html">News</a><a href="blog.html">Blog</a><a href="sports.html">Sports</a><a href="gaming.html">Gaming</a></div>
<script src="main.js"></script>
</body>
</html>
`;
  fs.writeFileSync(newsPath, html, "utf8");
}

function renderGridCard(post, opts = {}) {
  const dataAttr = opts.includeDataCat ? ` data-cat="${post.category.dataCat}"` : "";
  const thumb = post.thumbnail ? post.thumbnail : "";
  let imgHtml = "";
  if (thumb) {
    // resolve relative path for cards/list/side stories; these pages live at the
    // site root, so we don't need to climb out of any subfolder. only posts
    // themselves require a `../` prefix (handled separately in buildPostPage).
    const imgSrc = /^https?:/.test(thumb)
      ? thumb
      : thumb.startsWith("/")
      ? thumb.slice(1)
      : thumb; // leave as-is (e.g. "images/foo.jpg")
    imgHtml = `<img src="${imgSrc}" alt="${escapeHtml(post.title)}">`;
  } else {
    imgHtml = `<div class="ph"><span>${escapeHtml(post.category.label)}</span></div>`;
  }
  const imgClass = thumb ? "" : `ph ${placeholderClass(post.slug)}`;
  return `<article class="card" data-generated="md" data-slug="${post.slug}"${dataAttr}>
  <a href="posts/${post.slug}.html" class="card__img ${imgClass}">${imgHtml}</a>
  <div class="card__body">
    <div class="card__cat ${post.category.className}">${post.category.emoji} ${escapeHtml(post.category.label)}</div>
    <h2 class="card__title"><a href="posts/${post.slug}.html">${escapeHtml(post.title)}</a></h2>
    <p class="card__excerpt">${escapeHtml(post.excerpt)}</p>
    <div class="card__meta"><span>${escapeHtml(post.author)}</span><span>${escapeHtml(post.humanDate)}</span><span>${post.readingMinutes} min read</span></div>
  </div>
</article>`;
}

function renderListRow(post, opts = {}) {
  const dataAttr = opts.includeDataCat ? ` data-cat="${post.category.dataCat}"` : "";
  const thumb = post.thumbnail ? post.thumbnail : "";
  let imgHtml = "";
  if (thumb) {
    const imgSrc = /^https?:/.test(thumb)
      ? thumb
      : thumb.startsWith("/")
      ? thumb.slice(1)
      : thumb;
    imgHtml = `<img src="${imgSrc}" alt="${escapeHtml(post.title)}">`;
  } else {
    imgHtml = `<div class="ph"><span>${escapeHtml(post.category.label)}</span></div>`;
  }
  const imgClass = thumb ? "" : `ph ${placeholderClass(post.slug)}`;

  return `<article class="card-row" data-generated="md" data-slug="${post.slug}"${dataAttr}>
  <a href="posts/${post.slug}.html" class="card-row__img ${imgClass}">${imgHtml}</a>
  <div>
    <div class="card-row__cat ${post.category.className}">${post.category.emoji} ${escapeHtml(post.category.label)}</div>
    <h3 class="card-row__title"><a href="posts/${post.slug}.html">${escapeHtml(post.title)}</a></h3>
    <div class="card-row__meta">${escapeHtml(post.author)}  ${escapeHtml(post.humanDate)}  ${post.readingMinutes} min read</div>
  </div>
</article>`;
}

function renderSideStory(post) {
  const thumb = post.thumbnail ? post.thumbnail : "";
  let imgHtml = "";
  if (thumb) {
    const imgSrc = /^https?:/.test(thumb)
      ? thumb
      : thumb.startsWith("/")
      ? thumb.slice(1)
      : thumb;
    imgHtml = `<img src="${imgSrc}" alt="${escapeHtml(post.title)}">`;
  } else {
    imgHtml = `<div class="ph"><span>${escapeHtml(post.category.label)}</span></div>`;
  }
  const imgClass = thumb ? "" : `ph ${placeholderClass(post.slug)}`;

  return `<article class="side-story" data-generated="md" data-slug="${post.slug}">
  <a href="posts/${post.slug}.html" class="side-story__img ${imgClass}">${imgHtml}</a>
  <div>
    <div class="side-story__cat">${escapeHtml(post.category.label)}</div>
    <a href="posts/${post.slug}.html" class="side-story__title">${escapeHtml(post.title)}</a>
    <div class="side-story__meta">${escapeHtml(post.humanDate)}  ${post.readingMinutes} min read</div>
  </div>
</article>`;
}

function replaceTags($, tags) {
  const tagContainer = $(".article-tags .tags").first();
  if (!tagContainer.length) {
    return;
  }
  const tagLinks = (tags.length ? tags : ["News"]).map((tag) => `<a href="../blog.html" class="tag">${escapeHtml(tag)}</a>`);
  tagContainer.html(tagLinks.join(""));
}

function replaceRelated($, post, allPosts) {
  const related = allPosts.filter((p) => p.slug !== post.slug && p.category.key === post.category.key).slice(0, 3);
  const container = $(".related-posts .card-grid").first();
  if (!container.length) {
    return;
  }
  const cards = related.map((r) => {
    return `<article class="card">
      <a href="posts/${r.slug}.html" class="card__img ph ${placeholderClass(r.slug)}"><div class="ph"><span>${escapeHtml(r.category.label)}</span></div></a>
      <div class="card__body">
        <div class="card__cat ${r.category.className}">${r.category.emoji} ${escapeHtml(r.category.label)}</div>
        <h3 class="card__title"><a href="posts/${r.slug}.html">${escapeHtml(r.title)}</a></h3>
        <div class="card__meta"><span>${escapeHtml(r.author)}</span><span>${escapeHtml(r.humanDate)}</span><span>${r.readingMinutes} min read</span></div>
      </div>
    </article>`;
  });
  if (cards.length > 0) {
    container.html(cards.join("\n"));
  }
}

function ensureLegalLinks($) {
  const required = ["privacy-policy.html", "terms-of-service.html", "cookie-policy.html", "disclaimer.html"];
  const footer = $("footer").first();
  if (!footer.length) {
    return;
  }
  const hrefs = new Set(footer.find("a[href]").map((_, el) => $(el).attr("href")).get());
  const targetList = footer.find(".footer-col ul").last();
  if (!targetList.length) {
    return;
  }
  required.forEach((href) => {
    if (!hrefs.has(href) && !hrefs.has(`../${href}`)) {
      const label = href
        .replace(".html", "")
        .split("-")
        .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
        .join(" ");
      targetList.append(`<li><a href="${href}">${label}</a></li>`);
    }
  });
}

function rewriteRootRelativeLinksForPost($) {
  $("a[href], link[href], script[src]").each((_, el) => {
    const attr = el.tagName === "script" ? "src" : "href";
    const value = $(el).attr(attr);
    if (!value) {
      return;
    }
    if (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("//") ||
      value.startsWith("#") ||
      value.startsWith("/") ||
      value.startsWith("mailto:") ||
      value.startsWith("tel:") ||
      value.startsWith("javascript:") ||
      value.startsWith("../")
    ) {
      return;
    }
    $(el).attr(attr, `../${value}`);
  });
}

function upsertGeneratedCards($, container, htmlItems) {
  container.children('[data-generated="md"]').remove();
  for (let i = htmlItems.length - 1; i >= 0; i -= 1) {
    container.prepend(`\n${htmlItems[i]}`);
  }
}

function setArticleSchemas($, post) {
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    image: [toAbsoluteUrl(post.thumbnail)],
    datePublished: `${post.isoDate}T00:00:00Z`,
    dateModified: `${post.isoDate}T00:00:00Z`,
    author: { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "HJ Trending",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon-32x32.png` }
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": post.url }
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: post.category.label, item: `${SITE_URL}/${post.category.page}` },
      { "@type": "ListItem", position: 3, name: post.title, item: post.url }
    ]
  };

  const scripts = $('script[type="application/ld+json"]');
  if (scripts.length >= 1) {
    scripts.eq(0).text(JSON.stringify(articleSchema));
  } else {
    $("head").append(`<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>`);
  }
  if (scripts.length >= 2) {
    scripts.eq(1).text(JSON.stringify(breadcrumbSchema));
  } else {
    $("head").append(`<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`);
  }
}

function setCanonical($, url) {
  let link = $('link[rel="canonical"]').first();
  if (!link.length) {
    $("head").append(`<link rel="canonical" href="${url}">`);
    return;
  }
  link.attr("href", url);
}

function setMetaByName($, name, value) {
  let tag = $(`meta[name="${name}"]`).first();
  if (!tag.length) {
    $("head").append(`<meta name="${name}" content="${escapeHtmlAttr(value)}">`);
    return;
  }
  tag.attr("content", value);
}

function setMetaByProperty($, prop, value) {
  let tag = $(`meta[property="${prop}"]`).first();
  if (!tag.length) {
    $("head").append(`<meta property="${prop}" content="${escapeHtmlAttr(value)}">`);
    return;
  }
  tag.attr("content", value);
}

function normalizeCategory(raw) {
  const normalized = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (normalized === "fifa" || normalized === "fifaworldcup2026" || normalized === "fifa2026") {
    return "fifa2026";
  }
  if (CATEGORY_MAP[normalized]) {
    return normalized;
  }
  return "news";
}

function inferCategoryFromPath(relPath) {
  const firstSegment = String(relPath || "").split("/")[0] || "";
  if (!firstSegment || firstSegment.toLowerCase().endsWith(".md")) {
    return "";
  }
  return firstSegment;
}

function estimateReadMinutes(text) {
  const words = stripHtml(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function buildExcerpt(text, maxLen) {
  const plain = stripHtml(String(text || "")).replace(/\s+/g, " ").trim();
  if (plain.length <= maxLen) {
    return plain;
  }
  return `${plain.slice(0, maxLen - 1).trim()}`;
}

function parseDate(input) {
  if (!input) {
    return null;
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
}

function toHumanDate(date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function placeholderClass(seed) {
  const n = (Array.from(seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 9) + 1;
  return `ph-${n}`;
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      out.push(...walkFiles(abs));
    } else {
      out.push(abs);
    }
  }
  return out;
}

function isPublishableMarkdown(filePath) {
  if (!filePath.toLowerCase().endsWith(".md")) {
    return false;
  }
  const name = path.basename(filePath).toLowerCase();
  if (name === "readme.md") {
    return false;
  }
  if (name.startsWith("_")) {
    return false;
  }
  return true;
}

function dedupeBySlug(posts) {
  const seen = new Set();
  const out = [];
  posts.forEach((p) => {
    if (seen.has(p.slug)) {
      return;
    }
    seen.add(p.slug);
    out.push(p);
  });
  return out;
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stripHtml(input) {
  return String(input || "").replace(/<[^>]*>/g, " ");
}

function readFileSafe(file) {
  if (!fs.existsSync(file)) {
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function toAbsoluteUrl(input) {
  if (!input) {
    return `${SITE_URL}/assets/images/default-thumb.jpg`;
  }
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return input;
  }
  if (input.startsWith("/")) {
    return `${SITE_URL}${input}`;
  }
  return `${SITE_URL}/${input}`;
}
