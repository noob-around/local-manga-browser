import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

const DEFAULT_COMIC_ROOT = process.env.COMIC_ROOT || path.join(__dirname, 'manga-library');
const DEFAULT_WORKSPACE = process.env.WORKSPACE_DIR || path.join(__dirname, 'app-workspace');
const DATA_FILE = 'reader-state.json';
const SUPPORTED_COMIC_FILES = new Set(['.cbz', '.zip', '.pdf', '.rar', '.7z']);
const SUPPORTED_IMAGE_FILES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);

const initialTags = [];

const initialGalleries = [
  { id: 'g1', name: '默认画廊', color: '#009688' },
];

const initialComics = [];

function createDefaultState() {
  return {
    version: 1,
    directories: {
      comicRoot: DEFAULT_COMIC_ROOT,
      workspace: DEFAULT_WORKSPACE,
    },
    tags: initialTags,
    galleries: initialGalleries,
    comics: initialComics,
    readingProgress: {},
    updatedAt: new Date().toISOString(),
  };
}

let state = createDefaultState();

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function textResponse(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function normalizeAbsolute(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return null;
  return path.resolve(inputPath);
}

function isSameOrInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateDirectories(directories) {
  const comicRoot = normalizeAbsolute(directories.comicRoot);
  const workspace = normalizeAbsolute(directories.workspace);
  if (!comicRoot || !workspace) {
    throw httpError(400, '漫画目录和工作目录都不能为空');
  }
  if (isSameOrInside(workspace, comicRoot)) {
    throw httpError(400, '工作目录不能位于漫画目录内部，否则会污染漫画目录');
  }
  if (isSameOrInside(comicRoot, workspace)) {
    throw httpError(400, '漫画目录不能位于工作目录内部，请保持两个目录相互独立');
  }
  return { comicRoot, workspace };
}

function dataPath() {
  return path.join(state.directories.workspace, DATA_FILE);
}

async function ensureWorkspace() {
  const { workspace } = validateDirectories(state.directories);
  await fs.mkdir(workspace, { recursive: true });
}

async function loadState() {
  const fallback = createDefaultState();
  state = fallback;
  await ensureWorkspace();
  try {
    const saved = JSON.parse(await fs.readFile(dataPath(), 'utf8'));
    state = {
      ...fallback,
      ...saved,
      directories: validateDirectories({ ...fallback.directories, ...saved.directories }),
      tags: Array.isArray(saved.tags) ? saved.tags : fallback.tags,
      galleries: Array.isArray(saved.galleries) ? saved.galleries : fallback.galleries,
      comics: Array.isArray(saved.comics) ? saved.comics : fallback.comics,
      readingProgress: saved.readingProgress && typeof saved.readingProgress === 'object' ? saved.readingProgress : {},
    };
    const migratedDefaultGallery = state.galleries.some((gallery) => gallery.id === 'g1' && gallery.name === '????');
    state.galleries = state.galleries.map((gallery) => (
      gallery.id === 'g1' && gallery.name === '????' ? { ...gallery, name: '默认画廊' } : gallery
    ));
    if (migratedDefaultGallery) await saveState();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await saveState();
  }
}

async function saveState() {
  state.updatedAt = new Date().toISOString();
  await ensureWorkspace();
  const target = dataPath();
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rename(temp, target);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function publicState(extra = {}) {
  return {
    directories: state.directories,
    tags: state.tags,
    galleries: state.galleries,
    comics: state.comics,
    readingProgress: state.readingProgress,
    ...extra,
  };
}

function findComic(id) {
  const comic = state.comics.find((item) => item.id === id);
  if (!comic) throw httpError(404, '未找到漫画');
  return comic;
}

function findGallery(id) {
  const gallery = state.galleries.find((item) => item.id === id);
  if (!gallery) throw httpError(404, '未找到画廊');
  return gallery;
}

function normalizeTag(group, value) {
  const normalizedGroup = String(group || '自定义').trim() || '自定义';
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) throw httpError(400, 'tag 内容不能为空');
  return { group: normalizedGroup, value: normalizedValue };
}

function addTagToComic(comicId, group, value) {
  const comic = findComic(comicId);
  const tagInput = normalizeTag(group, value);
  let tag = state.tags.find((item) => item.group === tagInput.group && item.value === tagInput.value);
  if (!tag) {
    tag = { id: createId('tag'), ...tagInput };
    state.tags.push(tag);
  }
  if (!comic.tags.includes(tag.id)) {
    comic.tags.push(tag.id);
  }
  return tag;
}

function removeTagFromComic(comicId, tagId) {
  const comic = findComic(comicId);
  comic.tags = comic.tags.filter((id) => id !== tagId);
}

function searchComics(includeTerms = [], excludeTerms = []) {
  const include = includeTerms.map((term) => String(term).trim().toLowerCase()).filter(Boolean);
  const exclude = excludeTerms.map((term) => String(term).trim().toLowerCase()).filter(Boolean);
  if (include.length === 0 && exclude.length === 0) return [];

  return state.comics.filter((comic) => {
    const comicTags = comic.tags.map((id) => state.tags.find((tag) => tag.id === id)).filter(Boolean);
    const searchableTags = comicTags.map((tag) => `${tag.group} ${tag.value}`.toLowerCase());
    const includeMatches = include.every((term) => searchableTags.some((text) => text.includes(term)));
    const excludeMatches = exclude.every((term) => searchableTags.every((text) => !text.includes(term)));
    return includeMatches && excludeMatches;
  });
}

function parseSearchQuery(query) {
  const tokens = String(query || '').split(/\s+/).map((token) => token.trim()).filter(Boolean);
  return {
    include: tokens.filter((token) => !token.startsWith('-')),
    exclude: tokens.filter((token) => token.startsWith('-')).map((token) => token.slice(1)).filter(Boolean),
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function sortPagePaths(paths) {
  return [...paths].sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
}

function imageContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const typeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
  };
  return typeMap[extension] || 'application/octet-stream';
}

async function getFolderImagePaths(folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  return sortPagePaths(entries
    .filter((entry) => entry.isFile() && SUPPORTED_IMAGE_FILES.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(folderPath, entry.name)));
}

async function scanDirectory(root, current = root, depth = 0) {
  if (depth > 8) return [];
  const entries = await fs.readdir(current, { withFileTypes: true });
  const found = [];
  const imageFiles = [];

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      found.push(...await scanDirectory(root, fullPath, depth + 1));
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (SUPPORTED_COMIC_FILES.has(extension)) {
      found.push({ type: 'file', path: fullPath });
    } else if (SUPPORTED_IMAGE_FILES.has(extension)) {
      imageFiles.push(fullPath);
    }
  }

  if (imageFiles.length > 0) {
    const pages = sortPagePaths(imageFiles);
    found.push({ type: 'folder', path: current, imageCount: pages.length, coverPath: pages[0] });
  }

  return found;
}

async function scanComics() {
  const { comicRoot } = validateDirectories(state.directories);
  if (!await pathExists(comicRoot)) {
    throw httpError(400, `漫画目录不存在：${comicRoot}`);
  }

  const defaultGallery = state.galleries[0]?.id || 'g1';
  const items = await scanDirectory(comicRoot);
  let added = 0;

  for (const item of items) {
    const relativePath = path.relative(comicRoot, item.path);
    const existing = state.comics.find((comic) => comic.source?.path === relativePath);
    if (existing) continue;

    const stat = await fs.stat(item.path);
    const title = path.basename(item.path, path.extname(item.path));
    state.comics.push({
      id: createId('manga'),
      title,
      author: 'Unknown',
      circle: item.type === 'folder' ? 'LOCAL FOLDER' : 'LOCAL FILE',
      language: 'Unknown',
      pages: item.imageCount ? `${item.imageCount}/${item.imageCount}P` : '?/?P',
      size: item.type === 'folder' ? '文件夹' : formatBytes(stat.size),
      likes: 0,
      addedAt: formatDate(new Date()),
      rating: 0,
      ratingCount: 0,
      gallery: defaultGallery,
      shelf: 'downloaded',
      favorite: false,
      cover: ['cover-one', 'cover-two', 'cover-three', 'cover-four'][state.comics.length % 4],
      source: {
        type: item.type,
        path: relativePath,
        ...(item.coverPath ? { coverPath: path.relative(comicRoot, item.coverPath) } : {}),
      },
      tags: [],
    });
    added += 1;
  }

  await saveState();
  return { added, total: state.comics.length };
}

async function serveStatic(req, res, pathname) {
  const distRoot = path.join(__dirname, 'dist');
  let target = pathname === '/' ? path.join(distRoot, 'index.html') : path.join(distRoot, pathname);
  target = path.normalize(target);
  if (!isSameOrInside(target, distRoot)) throw httpError(403, '禁止访问该路径');
  if (!await pathExists(target)) {
    target = path.join(distRoot, 'index.html');
  }

  const extension = path.extname(target).toLowerCase();
  const typeMap = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };
  textResponse(res, 200, await fs.readFile(target), typeMap[extension] || 'application/octet-stream');
}

async function serveComicCover(res, comic) {
  const { comicRoot } = validateDirectories(state.directories);
  let coverPath = comic.source?.coverPath ? path.join(comicRoot, comic.source.coverPath) : '';
  if (!coverPath && comic.source?.type === 'folder' && comic.source?.path) {
    const folderPath = path.join(comicRoot, comic.source.path);
    const pages = await getFolderImagePaths(folderPath);
    coverPath = pages[0] || '';
    if (coverPath) {
      comic.source.coverPath = path.relative(comicRoot, coverPath);
      await saveState();
    }
  }
  if (!coverPath) throw httpError(404, '封面不存在');
  coverPath = path.normalize(coverPath);
  if (!isSameOrInside(coverPath, comicRoot) || !await pathExists(coverPath)) throw httpError(404, '封面不存在');
  textResponse(res, 200, await fs.readFile(coverPath), imageContentType(coverPath));
}

async function routeApi(req, res, url) {
  const method = req.method || 'GET';
  const parts = url.pathname.split('/').filter(Boolean);

  if (method === 'GET' && url.pathname === '/api/state') {
    return jsonResponse(res, 200, publicState());
  }

  if (method === 'PUT' && url.pathname === '/api/directories') {
    const body = await readBody(req);
    state.directories = validateDirectories({ ...state.directories, ...body });
    await saveState();
    return jsonResponse(res, 200, publicState());
  }

  if (method === 'POST' && url.pathname === '/api/scan') {
    const result = await scanComics();
    return jsonResponse(res, 200, publicState({ scan: result }));
  }

  if (method === 'GET' && url.pathname === '/api/search') {
    const parsed = parseSearchQuery(url.searchParams.get('q'));
    return jsonResponse(res, 200, { results: searchComics(parsed.include, parsed.exclude), query: parsed });
  }

  if (method === 'GET' && parts[1] === 'comics' && parts[3] === 'cover') {
    return serveComicCover(res, findComic(parts[2]));
  }

  if (method === 'PATCH' && parts[1] === 'comics' && parts.length === 3) {
    const comic = findComic(parts[2]);
    const patch = await readBody(req);
    const allowed = ['title', 'author', 'circle', 'language', 'gallery', 'shelf', 'favorite', 'rating', 'ratingCount', 'readingPage', 'lastReadAt'];
    for (const key of allowed) {
      if (Object.hasOwn(patch, key)) comic[key] = patch[key];
    }
    await saveState();
    return jsonResponse(res, 200, publicState());
  }

  if (method === 'POST' && parts[1] === 'comics' && parts[3] === 'tags') {
    const body = await readBody(req);
    const tag = addTagToComic(parts[2], body.group, body.value);
    await saveState();
    return jsonResponse(res, 201, publicState({ tag }));
  }

  if (method === 'DELETE' && parts[1] === 'comics' && parts[3] === 'tags' && parts[4]) {
    removeTagFromComic(parts[2], parts[4]);
    await saveState();
    return jsonResponse(res, 200, publicState());
  }

  if (method === 'POST' && url.pathname === '/api/galleries') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) throw httpError(400, '画廊名称不能为空');
    state.galleries.push({ id: createId('gallery'), name, color: body.color || '#009688' });
    await saveState();
    return jsonResponse(res, 201, publicState());
  }

  if (method === 'PATCH' && parts[1] === 'galleries' && parts[2]) {
    const gallery = findGallery(parts[2]);
    const body = await readBody(req);
    if (Object.hasOwn(body, 'name')) {
      const name = String(body.name || '').trim();
      if (!name) throw httpError(400, '画廊名称不能为空');
      gallery.name = name;
    }
    if (Object.hasOwn(body, 'color')) gallery.color = body.color;
    await saveState();
    return jsonResponse(res, 200, publicState());
  }

  if (method === 'DELETE' && parts[1] === 'galleries' && parts[2]) {
    const id = parts[2];
    findGallery(id);
    const fallback = state.galleries.find((gallery) => gallery.id !== id)?.id || 'g1';
    state.galleries = state.galleries.filter((gallery) => gallery.id !== id);
    state.comics = state.comics.map((comic) => (comic.gallery === id ? { ...comic, gallery: fallback } : comic));
    await saveState();
    return jsonResponse(res, 200, publicState());
  }

  throw httpError(404, '接口不存在');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return jsonResponse(res, 204, {});
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (url.pathname.startsWith('/api/')) {
      return await routeApi(req, res, url);
    }
    return await serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (error) {
    const status = error.status || 500;
    jsonResponse(res, status, { error: error.message || '服务器错误' });
  }
});

await loadState();
server.listen(PORT, HOST, () => {
  console.log(`Local manga reader backend: http://${HOST}:${PORT}`);
  console.log(`Comic root (read-only): ${state.directories.comicRoot}`);
  console.log(`Workspace: ${state.directories.workspace}`);
});
