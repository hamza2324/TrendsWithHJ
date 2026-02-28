# Content Folder

Drop markdown files in `content/` and they will be auto-built.

## Category folders
- `content/sports/`
- `content/gaming/`
- `content/entertainment/`
- `content/trending/`
- `content/fifa2026/`
- `content/news/`

## Notes
- Output HTML is generated to `posts/<slug>.html`.
- Category is inferred from folder name if `category` is not set in frontmatter.
- Frontmatter still supports explicit `category`, `title`, `date`, `description`, `tags`, `thumbnail`, `author`, `slug`.

## Example

```md
---
title: "Sample Title"
date: 2026-02-28
description: "Sample description"
author: HJ Trending
tags: [Sample, Test]
---

Post content here.
```
