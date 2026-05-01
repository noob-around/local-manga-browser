import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const LocalManga = registerPlugin('LocalManga');
const STATE_KEY = 'local-manga-reader-state';
const isNative = Capacitor.isNativePlatform();

const initialTags = [];

const initialGalleries = [
  { id: 'g1', name: '默认画廊', color: '#009688' },
];

const initialComics = [];

function createDefaultState() {
  return {
    directories: {
      comicRoot: '/storage/emulated/0/MangaLibrary',
      comicRootUri: '',
      workspace: 'App 私有工作目录',
      workspaceUri: '',
    },
    tags: initialTags,
    galleries: initialGalleries,
    comics: initialComics,
    readingProgress: {},
    updatedAt: new Date().toISOString(),
  };
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTag(group, value) {
  const normalizedGroup = String(group || '自定义').trim() || '自定义';
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) throw new Error('tag 内容不能为空');
  return { group: normalizedGroup, value: normalizedValue };
}

async function loadNativeState() {
  const { value } = await Preferences.get({ key: STATE_KEY });
  const defaults = createDefaultState();
  let saved = value ? JSON.parse(value) : defaults;

  if (saved.directories?.workspaceUri) {
    try {
      const workspaceState = await LocalManga.readWorkspaceState({ uri: saved.directories.workspaceUri });
      if (workspaceState.value) {
        saved = { ...saved, ...JSON.parse(workspaceState.value) };
      }
    } catch {
      // Keep the cached private copy if the user moved or revoked the workspace directory.
    }
  }

  const nextState = {
    ...defaults,
    ...saved,
    directories: { ...defaults.directories, ...(saved.directories || {}) },
  };
  nextState.comics = (nextState.comics || []).filter((comic) => comic.source?.type !== 'sample' && !['m1', 'm2', 'm3', 'm4'].includes(comic.id));
  const usedTagIds = new Set(nextState.comics.flatMap((comic) => comic.tags || []));
  nextState.tags = (nextState.tags || []).filter((tag) => usedTagIds.has(tag.id));
  nextState.galleries = (nextState.galleries || initialGalleries).filter((gallery) => !['g2', 'g3'].includes(gallery.id));
  if (!nextState.galleries.some((gallery) => gallery.id === 'g1')) nextState.galleries.unshift(initialGalleries[0]);
  const migratedDefaultGallery = nextState.galleries.some((gallery) => gallery.id === 'g1' && gallery.name === '????');
  nextState.galleries = nextState.galleries.map((gallery) => (
    gallery.id === 'g1' && gallery.name === '????' ? { ...gallery, name: '默认画廊' } : gallery
  ));
  if (!value || migratedDefaultGallery) await saveNativeState(nextState);
  return nextState;
}

async function saveNativeState(state) {
  const nextState = { ...state, updatedAt: new Date().toISOString() };
  await Preferences.set({ key: STATE_KEY, value: JSON.stringify(nextState) });
  if (nextState.directories?.workspaceUri) {
    await LocalManga.writeWorkspaceState({
      uri: nextState.directories.workspaceUri,
      value: `${JSON.stringify(nextState, null, 2)}\n`,
    });
  }
  return clone(nextState);
}

async function mutateNativeState(mutator) {
  const state = await loadNativeState();
  const result = await mutator(state);
  const saved = await saveNativeState(state);
  return result ? { ...saved, ...result } : saved;
}

function searchInState(state, query) {
  const tokens = String(query || '').split(/\s+/).map((token) => token.trim()).filter(Boolean);
  const include = tokens.filter((token) => !token.startsWith('-')).map((token) => token.toLowerCase());
  const exclude = tokens.filter((token) => token.startsWith('-')).map((token) => token.slice(1).toLowerCase()).filter(Boolean);
  if (include.length === 0 && exclude.length === 0) return [];

  return state.comics.filter((comic) => {
    const comicTags = comic.tags.map((id) => state.tags.find((tag) => tag.id === id)).filter(Boolean);
    const searchableTags = comicTags.map((tag) => `${tag.group} ${tag.value}`.toLowerCase());
    const includeMatches = include.every((token) => searchableTags.some((text) => text.includes(token)));
    const excludeMatches = exclude.every((token) => searchableTags.every((text) => !text.includes(token)));
    return includeMatches && excludeMatches;
  });
}

function mergeScannedComics(state, scannedComics) {
  const existingByFolder = new Map(
    state.comics
      .filter((comic) => comic.source?.folderUri)
      .map((comic) => [comic.source.folderUri, comic]),
  );
  const scannedFolders = new Set(scannedComics.map((comic) => comic.source?.folderUri).filter(Boolean));
  const defaultGallery = state.galleries[0]?.id || 'g1';

  const mergedScanned = scannedComics.map((comic, index) => {
    const existing = existingByFolder.get(comic.source?.folderUri);
    return {
      ...comic,
      gallery: existing?.gallery || defaultGallery,
      shelf: existing?.shelf || 'downloaded',
      favorite: existing?.favorite || false,
      readingPage: existing?.readingPage || 0,
      lastReadAt: existing?.lastReadAt || '',
      tags: existing?.tags || [],
      cover: existing?.cover || ['cover-one', 'cover-two', 'cover-three', 'cover-four'][index % 4],
      addedAt: existing?.addedAt || new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
  });

  const nonNativeComics = state.comics.filter((comic) => comic.source?.type !== 'android-folder');
  const missingNativeComics = state.comics.filter((comic) => (
    comic.source?.type === 'android-folder' && !scannedFolders.has(comic.source.folderUri)
  ));
  state.comics = [...nonNativeComics, ...mergedScanned, ...missingNativeComics];
  return { added: mergedScanned.filter((comic) => !existingByFolder.has(comic.source?.folderUri)).length, total: mergedScanned.length };
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    throw new Error(payload.error || '请求失败');
  }
  return payload;
}

export function getState() {
  if (isNative) return loadNativeState();
  return request('/api/state');
}

export async function chooseComicRoot() {
  if (!isNative) {
    throw new Error('目录选择只能在 Android APK 中使用');
  }
  const picked = await LocalManga.pickComicRoot();
  return mutateNativeState((state) => {
    state.directories = {
      ...state.directories,
      comicRoot: picked.name || picked.uri,
      comicRootUri: picked.uri,
    };
  });
}

export async function chooseWorkspaceRoot() {
  if (!isNative) {
    throw new Error('目录选择只能在 Android APK 中使用');
  }
  const picked = await LocalManga.pickWorkspaceRoot();
  return mutateNativeState((state) => {
    state.directories = {
      ...state.directories,
      workspace: picked.name || '已选择工作目录',
      workspaceUri: picked.uri,
    };
  });
}

export function updateDirectories(directories) {
  if (isNative) {
    return mutateNativeState((state) => {
      state.directories = {
        ...state.directories,
        comicRoot: String(directories.comicRoot || '').trim(),
        comicRootUri: String(directories.comicRootUri || state.directories.comicRootUri || '').trim(),
        workspace: String(directories.workspace || '').trim(),
        workspaceUri: String(directories.workspaceUri || state.directories.workspaceUri || '').trim(),
      };
    });
  }
  return request('/api/directories', {
    method: 'PUT',
    body: JSON.stringify(directories),
  });
}

export function scanComics() {
  if (isNative) {
    return mutateNativeState(async (state) => {
      const rootUri = state.directories.comicRootUri;
      if (!rootUri) throw new Error('请先点“选择目录”，授权漫画根目录');
      const payload = await LocalManga.scanComicRoot({ uri: rootUri });
      const scan = mergeScannedComics(state, payload.comics || []);
      return { scan };
    });
  }
  return request('/api/scan', { method: 'POST' });
}

export async function searchComics(query) {
  if (isNative) {
    const state = await loadNativeState();
    return { results: searchInState(state, query) };
  }
  return request(`/api/search?q=${encodeURIComponent(query)}`);
}

export async function listComicPages(comic) {
  if (isNative) {
    if (Array.isArray(comic.source?.pages)) return comic.source.pages;
    throw new Error('这本漫画没有可读取的页面，请重新扫描目录');
  }
  throw new Error('电脑浏览器预览暂不支持直接阅读本地漫画图片');
}

export async function getComicCover(comic) {
  if (isNative) {
    const firstPage = Array.isArray(comic.source?.pages) ? comic.source.pages[0] : null;
    const coverPage = firstPage || (comic.source?.coverUri ? { uri: comic.source.coverUri, mimeType: comic.source.coverMimeType } : null);
    if (!coverPage?.uri) return { dataUrl: '' };
    return readComicPage(coverPage);
  }
  return { dataUrl: `/api/comics/${encodeURIComponent(comic.id)}/cover` };
}

export async function readComicPage(page) {
  if (isNative) {
    return LocalManga.readPage({ uri: page.uri, mimeType: page.mimeType || 'image/jpeg' });
  }
  throw new Error('电脑浏览器预览暂不支持直接阅读本地漫画图片');
}

export function updateComic(id, patch) {
  if (isNative) {
    return mutateNativeState((state) => {
      state.comics = state.comics.map((comic) => (comic.id === id ? { ...comic, ...patch } : comic));
    });
  }
  return request(`/api/comics/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function addComicTag(comicId, group, value) {
  if (isNative) {
    return mutateNativeState((state) => {
      const tagInput = normalizeTag(group, value);
      let tag = state.tags.find((item) => item.group === tagInput.group && item.value === tagInput.value);
      if (!tag) {
        tag = { id: createId('tag'), ...tagInput };
        state.tags.push(tag);
      }
      state.comics = state.comics.map((comic) => {
        if (comic.id !== comicId || comic.tags.includes(tag.id)) return comic;
        return { ...comic, tags: [...comic.tags, tag.id] };
      });
      return { tag };
    });
  }
  return request(`/api/comics/${encodeURIComponent(comicId)}/tags`, {
    method: 'POST',
    body: JSON.stringify({ group, value }),
  });
}

export function removeComicTag(comicId, tagId) {
  if (isNative) {
    return mutateNativeState((state) => {
      state.comics = state.comics.map((comic) => (
        comic.id === comicId ? { ...comic, tags: comic.tags.filter((id) => id !== tagId) } : comic
      ));
    });
  }
  return request(`/api/comics/${encodeURIComponent(comicId)}/tags/${encodeURIComponent(tagId)}`, {
    method: 'DELETE',
  });
}

export function createGallery(name) {
  if (isNative) {
    return mutateNativeState((state) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) throw new Error('画廊名称不能为空');
      state.galleries.push({ id: createId('gallery'), name: trimmed, color: '#009688' });
    });
  }
  return request('/api/galleries', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function renameGallery(id, name) {
  if (isNative) {
    return mutateNativeState((state) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) throw new Error('画廊名称不能为空');
      state.galleries = state.galleries.map((gallery) => (gallery.id === id ? { ...gallery, name: trimmed } : gallery));
    });
  }
  return request(`/api/galleries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deleteGallery(id) {
  if (isNative) {
    return mutateNativeState((state) => {
      const fallback = state.galleries.find((gallery) => gallery.id !== id)?.id || 'g1';
      state.galleries = state.galleries.filter((gallery) => gallery.id !== id);
      state.comics = state.comics.map((comic) => (comic.gallery === id ? { ...comic, gallery: fallback } : comic));
    });
  }
  return request(`/api/galleries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
