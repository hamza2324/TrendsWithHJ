#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const ROOT = process.cwd();
const SITE_URL = "https://hjtrending.blog";
const DEFAULT_IMAGE = `${SITE_URL}/images/web-logo.jpeg`;
const GA_ID = "G-8RM3JPKY8L";

const SKIP_DIRS = new Set(["node_modules", ".git", ".github", ".vscode", "content"]);
const LEGAL_PAGES = new Set([
  "privacy-policy.html",
  "terms-of-service.html",
  "cookie-policy.html",
  "disclaimer.html"
]);

main();

function main() {
  const htmlFiles = getPublicHtmlFiles();
  htmlFiles.forEach((file) => patchHtmlFile(file));
  writeRobots();
  write404();
  writeSitemap(htmlFiles);
  console.log(`SEO patch completed for ${htmlFiles.length} public HTML files.`);
}

function getPublicHtmlFiles() {
  const files = walk(ROOT)
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
  files.sort();
  return files;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(abs));
    } else {
      out.push(abs);
    }
  }
  return out;
}

function patchHtmlFile(relPath) {
  const absPath = path.join(ROOT, relPath);
  const raw = fs.readFileSync(absPath, "utf8");
  const $ = cheerio.load(raw, { decodeEntities: false });
  const relLower = relPath.toLowerCase();
  const isIndex = relLower === "index.html";
  const isPost = relLower.startsWith("posts/");
  const isTemplate = relLower === "blog-post.html";
  const is404 = relLower === "404.html";

  ensureViewport($);
  const title = ensureTitle($, relPath);
  const description = ensureDescription($, title, relPath);
  const canonical = ensureCanonical($, relPath);
  ensureRobots($, isTemplate, is404);
  ensureOpenGraph($, title, description, canonical, relPath);
  ensureTwitter($, title, description, relPath);
  ensureAnalytics($);
  ensureSchemas($, { relPath, isIndex, isPost, title, description, canonical, absPath });
  ensureH1($, relPath, title);
  improveImages($);
  normalizeHeadScripts($);

  fs.writeFileSync(absPath, $.html(), "utf8");
}

function ensureViewport($) {
  let tag = $('meta[name="viewport"]').first();
  if (!tag.length) {
    $("head").append('<meta name="viewport" content="width=device-width, initial-scale=1">');
    return;
  }
  tag.attr("content", "width=device-width, initial-scale=1");
}

function ensureTitle($, relPath) {
  let tag = $("head > title").first();
  if (!tag.length) {
    const generated = `${humanizeFileName(relPath)} | HJ Trending`;
    $("head").append(`<title>${escapeHtml(generated)}</title>`);
    return generated;
  }
  const val = tag.text().trim();
  if (!val) {
    const generated = `${humanizeFileName(relPath)} | HJ Trending`;
    tag.text(generated);
    return generated;
  }
  return val;
}

function ensureDescription($, title, relPath) {
  let tag = $('meta[name="description"]').first();
  const fallback = `${stripSiteName(title)} on HJ Trending. Latest updates and analysis.`;
  if (!tag.length) {
    $("head").append(`<meta name="description" content="${escapeAttr(truncate(fallback, 158))}">`);
    return truncate(fallback, 158);
  }
  const val = (tag.attr("content") || "").trim();
  if (!val) {
    tag.attr("content", truncate(fallback, 158));
    return truncate(fallback, 158);
  }
  return val;
}

function ensureCanonical($, relPath) {
  const canonical = relPath === "index.html" ? `${SITE_URL}/` : `${SITE_URL}/${relPath}`;
  let tag = $('link[rel="canonical"]').first();
  if (!tag.length) {
    $("head").append(`<link rel="canonical" href="${canonical}">`);
  } else {
    tag.attr("href", canonical);
  }
  return canonical;
}

function ensureRobots($, isTemplate, is404) {
  const content = (isTemplate || is404) ? "noindex, follow" : "index, follow";
  let tag = $('meta[name="robots"]').first();
  if (!tag.length) {
    $("head").append(`<meta name="robots" content="${content}">`);
    return;
  }
  tag.attr("content", content);
}

function ensureOpenGraph($, title, description, canonical, relPath) {
  upsertMetaProperty($, "og:title", stripSiteName(title));
  upsertMetaProperty($, "og:description", truncate(description, 200));
  upsertMetaProperty($, "og:type", relPath.startsWith("posts/") ? "article" : "website");
  upsertMetaProperty($, "og:url", canonical);
  const current = $('meta[property="og:image"]').first().attr("content");
  upsertMetaProperty($, "og:image", normalizeImageUrl(current));
  upsertMetaProperty($, "og:site_name", "HJ Trending");
}

function ensureTwitter($, title, description, relPath) {
  upsertMetaName($, "twitter:card", "summary_large_image");
  upsertMetaName($, "twitter:title", stripSiteName(title));
  upsertMetaName($, "twitter:description", truncate(description, 200));
  const ogImg = $('meta[property="og:image"]').first().attr("content");
  upsertMetaName($, "twitter:image", normalizeImageUrl(ogImg));
}

function ensureAnalytics($) {
  const src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  if ($(`script[src="${src}"]`).length) return;
  $("head").append(`<script async src="${src}"></script>`);
  $("head").append(`<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');
</script>`);
}

function ensureSchemas($, ctx) {
  const scripts = $('script[type="application/ld+json"]');
  const hasWebsite = scripts.toArray().some((el) => ($(el).html() || "").includes('"WebSite"'));
  const hasOrg = scripts.toArray().some((el) => ($(el).html() || "").includes('"Organization"'));
  const hasArticle = scripts.toArray().some((el) => ($(el).html() || "").includes('"Article"') || ($(el).html() || "").includes('"NewsArticle"'));
  const hasBreadcrumb = scripts.toArray().some((el) => ($(el).html() || "").includes('"BreadcrumbList"'));
  const hasWebPage = scripts.toArray().some((el) => ($(el).html() || "").includes('"WebPage"'));

  if (ctx.isIndex) {
    if (!hasWebsite) {
      const webSchema = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "HJ Trending",
        url: `${SITE_URL}/`,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/blog.html?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      };
      $("head").append(`<script type="application/ld+json">${JSON.stringify(webSchema)}</script>`);
    }
    if (!hasOrg) {
      const orgSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "HJ Trending",
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/images/web-logo.jpeg`,
        sameAs: ["https://hamzajadoon.cloud"]
      };
      $("head").append(`<script type="application/ld+json">${JSON.stringify(orgSchema)}</script>`);
    }
    return;
  }

  if (ctx.isPost && !hasArticle) {
    const date = toISODate(fs.statSync(ctx.absPath).mtime);
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: stripSiteName(ctx.title),
      description: truncate(ctx.description, 300),
      author: { "@type": "Person", name: "Hamza Jadoon" },
      publisher: {
        "@type": "Organization",
        name: "HJ Trending",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/images/web-logo.jpeg` }
      },
      datePublished: `${date}T00:00:00Z`,
      dateModified: `${date}T00:00:00Z`,
      image: normalizeImageUrl($('meta[property="og:image"]').first().attr("content")),
      mainEntityOfPage: ctx.canonical
    };
    $("head").append(`<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>`);
  } else if (!ctx.isPost && !hasWebPage) {
    const pageSchema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: stripSiteName(ctx.title),
      description: truncate(ctx.description, 300),
      url: ctx.canonical,
      isPartOf: { "@type": "WebSite", name: "HJ Trending", url: `${SITE_URL}/` }
    };
    $("head").append(`<script type="application/ld+json">${JSON.stringify(pageSchema)}</script>`);
  }

  if (!hasBreadcrumb) {
    const crumbs = buildBreadcrumb(ctx.relPath, stripSiteName(ctx.title), ctx.canonical);
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: c.name,
        item: c.item
      }))
    };
    $("head").append(`<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`);
  }
}

function buildBreadcrumb(relPath, title, canonical) {
  const crumbs = [{ name: "Home", item: `${SITE_URL}/` }];
  if (relPath.startsWith("posts/")) {
    crumbs.push({ name: "Blog", item: `${SITE_URL}/blog.html` });
    crumbs.push({ name: title, item: canonical });
  } else if (relPath !== "index.html") {
    crumbs.push({ name: title, item: canonical });
  }
  return crumbs;
}

function ensureH1($, relPath, title) {
  if ($("h1").length) return;
  const h1Text = stripSiteName(title) || humanizeFileName(relPath);
  const h1Html = `<h1 class="sr-only-seo">${escapeHtml(h1Text)}</h1>`;
  const main = $("main").first();
  if (main.length) {
    main.prepend(h1Html);
  } else if ($("body").length) {
    $("body").prepend(h1Html);
  }
}

function improveImages($) {
  const imgs = $("img").toArray();
  imgs.forEach((img, idx) => {
    const el = $(img);
    const src = el.attr("src") || "";
    if (!el.attr("loading")) el.attr("loading", idx < 2 ? "eager" : "lazy");
    if (!el.attr("decoding")) el.attr("decoding", "async");
    if (!el.attr("width") || !el.attr("height")) {
      const dims = guessDims(src);
      if (!el.attr("width")) el.attr("width", String(dims.width));
      if (!el.attr("height")) el.attr("height", String(dims.height));
    }
  });
}

function guessDims(src) {
  const s = (src || "").toLowerCase();
  if (s.includes("logo") || s.includes("avatar") || s.includes("icon")) return { width: 64, height: 64 };
  if (s.includes("hero")) return { width: 1600, height: 900 };
  return { width: 1200, height: 675 };
}

function normalizeHeadScripts($) {
  $("head script[src]").each((_, script) => {
    const el = $(script);
    const src = el.attr("src") || "";
    if (/googletagmanager\.com\/gtag\/js/i.test(src)) {
      if (!el.attr("async")) el.attr("async", "");
      return;
    }
    if (!el.attr("async") && !el.attr("defer")) el.attr("defer", "");
  });
}

function writeRobots() {
  const robots = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /content/",
    "Disallow: /node_modules/",
    "Disallow: /scripts/",
    "Disallow: /.github/",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    ""
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "robots.txt"), robots, "utf8");
}

function write404() {
  const file = path.join(ROOT, "404.html");
  if (fs.existsSync(file)) return;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page Not Found | HJ Trending</title>
  <meta name="description" content="The page you requested was not found. Visit HJ Trending homepage or browse latest posts.">
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${SITE_URL}/404.html">
  <meta property="og:title" content="Page Not Found | HJ Trending">
  <meta property="og:description" content="The page you requested was not found.">
  <meta property="og:url" content="${SITE_URL}/404.html">
  <meta property="og:image" content="${DEFAULT_IMAGE}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Page Not Found | HJ Trending">
  <meta name="twitter:description" content="The page you requested was not found.">
  <meta name="twitter:image" content="${DEFAULT_IMAGE}">
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  </script>
</head>
<body>
  <main>
    <h1>Page Not Found</h1>
    <p>This page does not exist.</p>
    <p><a href="/">Go to Homepage</a></p>
    <p><a href="/blog.html">Browse Blog</a></p>
  </main>
</body>
</html>
`;
  fs.writeFileSync(file, html, "utf8");
}

function writeSitemap(htmlFiles) {
  const include = htmlFiles
    .filter((rel) => rel !== "404.html")
    .filter((rel) => rel !== "blog-post.html")
    .sort();

  const urls = [];
  include.forEach((rel) => {
    const abs = path.join(ROOT, rel);
    const mtime = toISODate(fs.statSync(abs).mtime);
    const loc = rel === "index.html" ? `${SITE_URL}/` : `${SITE_URL}/${rel}`;
    urls.push({
      loc,
      lastmod: mtime,
      changefreq: getChangefreq(rel),
      priority: getPriority(rel)
    });
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => [
      "  <url>",
      `    <loc>${escapeXml(u.loc)}</loc>`,
      `    <lastmod>${u.lastmod}</lastmod>`,
      `    <changefreq>${u.changefreq}</changefreq>`,
      `    <priority>${u.priority}</priority>`,
      "  </url>"
    ].join("\n")),
    "</urlset>",
    ""
  ].join("\n");

  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
}

function getChangefreq(rel) {
  if (rel === "index.html") return "daily";
  if (rel.startsWith("posts/")) return "weekly";
  if (LEGAL_PAGES.has(rel)) return "yearly";
  return "weekly";
}

function getPriority(rel) {
  if (rel === "index.html") return "1.0";
  if (rel.startsWith("posts/")) return "0.7";
  if (LEGAL_PAGES.has(rel)) return "0.3";
  return "0.8";
}

function upsertMetaName($, name, value) {
  let tag = $(`meta[name="${name}"]`).first();
  if (!tag.length) {
    $("head").append(`<meta name="${name}" content="${escapeAttr(value)}">`);
  } else {
    tag.attr("content", value);
  }
}

function upsertMetaProperty($, prop, value) {
  let tag = $(`meta[property="${prop}"]`).first();
  if (!tag.length) {
    $("head").append(`<meta property="${prop}" content="${escapeAttr(value)}">`);
  } else {
    tag.attr("content", value);
  }
}

function normalizeImageUrl(value) {
  const v = (value || "").trim();
  if (!v) return DEFAULT_IMAGE;
  if (/^https?:\/\//i.test(v)) return v.replace(/^http:\/\//i, "https://");
  if (v.startsWith("/")) return `${SITE_URL}${v}`;
  if (v.startsWith("../")) return `${SITE_URL}/${v.replace(/^\.\.\//, "")}`;
  return `${SITE_URL}/${v.replace(/^\.\//, "")}`;
}

function stripSiteName(title) {
  return String(title || "").replace(/\s*\|\s*HJ Trending\s*$/i, "").trim();
}

function humanizeFileName(relPath) {
  const base = path.basename(relPath, ".html").replace(/[-_]+/g, " ").trim();
  return base.replace(/\b\w/g, (m) => m.toUpperCase()) || "HJ Trending";
}

function truncate(value, max) {
  const str = String(value || "").trim();
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1).trim()}…`;
}

function toISODate(date) {
  return new Date(date).toISOString().slice(0, 10);
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

function escapeAttr(value) {
  return escapeHtml(String(value)).replace(/"/g, "&quot;");
}
