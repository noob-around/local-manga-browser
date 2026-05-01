import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Check,
  Folder,
  Grid2X2,
  ImagePlus,
  Info,
  Library,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import './styles.css';
import * as api from './api.js';

const initialTags = [];

const initialComics = [];

const initialGalleries = [
  { id: 'g1', name: '默认画廊', color: '#009688' },
];

const shelves = [
  { id: 'downloaded', label: '本地漫画' },
  { id: 'reading', label: '历史记录' },
];

function App() {
  const [comics, setComics] = useState(initialComics);
  const [tags, setTags] = useState(initialTags);
  const [galleries, setGalleries] = useState(initialGalleries);
  const [activeShelf, setActiveShelf] = useState('downloaded');
  const [activeGallery, setActiveGallery] = useState('all');
  const [view, setView] = useState({ name: 'home' });
  const [directories, setDirectories] = useState({
    comicRoot: '???',
    comicRootUri: '',
    workspace: 'App ??????',
    workspaceUri: '',
  });
  const [backendStatus, setBackendStatus] = useState({ loading: true, error: '', message: '' });

  function applyServerState(nextState) {
    setComics(nextState.comics || []);
    setTags(nextState.tags || []);
    setGalleries(nextState.galleries || []);
    setDirectories(nextState.directories || directories);
  }

  async function runBackendAction(action, successMessage = '') {
    try {
      setBackendStatus((current) => ({ ...current, error: '', message: '' }));
      const nextState = await action();
      applyServerState(nextState);
      setBackendStatus({ loading: false, error: '', message: successMessage });
      return nextState;
    } catch (error) {
      setBackendStatus({ loading: false, error: error.message, message: '' });
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .getState()
      .then((nextState) => {
        if (cancelled) return;
        applyServerState(nextState);
        setBackendStatus({ loading: false, error: '', message: '已连接本地后端' });
      })
      .catch((error) => {
        if (cancelled) return;
        setBackendStatus({ loading: false, error: error.message, message: '' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedComic = view.comicId ? comics.find((comic) => comic.id === view.comicId) : null;

  const visibleComics = useMemo(() => {
    if (activeShelf === 'reading') {
      return comics
        .filter((comic) => comic.lastReadAt)
        .sort((a, b) => new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime());
    }
    return comics.filter((comic) => {
      const shelfMatches = activeShelf === 'favorite' ? comic.favorite : comic.shelf === activeShelf;
      const galleryMatches = activeGallery === 'all' || comic.gallery === activeGallery;
      return shelfMatches && galleryMatches;
    });
  }, [activeGallery, activeShelf, comics]);

  function updateComic(id, patch) {
    runBackendAction(() => api.updateComic(id, patch), '漫画信息已保存');
  }

  const updateReadingProgress = useCallback((id, pageIndex) => {
    const patch = { readingPage: pageIndex, lastReadAt: new Date().toISOString() };
    setComics((current) => current.map((comic) => (comic.id === id ? { ...comic, ...patch } : comic)));
    api.updateComic(id, patch).catch((error) => {
      setBackendStatus({ loading: false, error: error.message, message: '' });
    });
  }, []);

  function addTagToComic(comicId, group, value) {
    const normalized = value.trim();
    if (!normalized) return;
    runBackendAction(() => api.addComicTag(comicId, group, normalized), 'Tag 已保存');
  }

  function removeTagFromComic(comicId, tagId) {
    runBackendAction(() => api.removeComicTag(comicId, tagId), 'Tag 已移除');
  }

  function createGallery(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    runBackendAction(() => api.createGallery(trimmed), '画廊已创建');
  }

  function renameGallery(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    runBackendAction(() => api.renameGallery(id, trimmed), '画廊已重命名');
  }

  function deleteGallery(id) {
    runBackendAction(() => api.deleteGallery(id), '画廊已删除');
    if (activeGallery === id) setActiveGallery('all');
  }

  function saveDirectories(nextDirectories) {
    setDirectories(nextDirectories);
    runBackendAction(() => api.updateDirectories(nextDirectories), '目录设置已保存');
  }

  function scanComicDirectory() {
    setBackendStatus({ loading: true, error: '', message: '正在扫描漫画...', progress: 'scan' });
    runBackendAction(async () => {
      const nextState = await api.scanComics();
      const added = nextState.scan?.added ?? 0;
      const total = nextState.scan?.total ?? nextState.comics?.length ?? 0;
      return { ...nextState, scanMessage: `扫描完成：新增 ${added} 本，共 ${total} 本` };
    }).then((nextState) => {
      if (!nextState) return;
      setBackendStatus({ loading: false, error: '', message: nextState.scanMessage, progress: '' });
    });
  }

  function chooseComicDirectory() {
    runBackendAction(() => api.chooseComicRoot(), '漫画目录已选择');
  }

  function chooseWorkspaceDirectory() {
    runBackendAction(() => api.chooseWorkspaceRoot(), '工作目录已选择');
  }

  function goBack() {
    setView((current) => {
      if (current.name === 'reader') return { name: 'detail', comicId: current.comicId };
      if (current.name === 'detail' || current.name === 'search' || current.name === 'galleries' || current.name === 'settings') return { name: 'home' };
      return current;
    });
  }

  useEffect(() => {
    const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (view.name === 'home') {
        if (canGoBack) window.history.back();
        return;
      }
      goBack();
    });
    return () => {
      listener.then((handle) => handle.remove());
    };
  }, [view]);

  const isReaderView = view.name === 'reader';

  return (
    <div className={`app-shell${isReaderView ? ' reader-mode' : ''}`}>
      {!isReaderView && <StatusBar />}
      {view.name === 'home' && (
        <HomeView
          activeGallery={activeGallery}
          activeShelf={activeShelf}
          comics={visibleComics}
          galleries={galleries}
          onGalleryChange={setActiveGallery}
          onOpenComic={(comicId) => setView({ name: 'detail', comicId })}
          onOpenGalleries={() => setView({ name: 'galleries' })}
          onOpenSearch={() => setView({ name: 'search' })}
          onOpenSettings={() => setView({ name: 'settings' })}
          onReadComic={(comicId) => setView({ name: 'reader', comicId })}
          onShelfChange={setActiveShelf}
        />
      )}

      {view.name === 'detail' && selectedComic && (
        <ComicDetail
          comic={selectedComic}
          galleries={galleries}
          tags={tags}
          onAddTag={addTagToComic}
          onBack={goBack}
          onRead={() => setView({ name: 'reader', comicId: selectedComic.id })}
          onRemoveTag={removeTagFromComic}
          onUpdateComic={updateComic}
        />
      )}

      {view.name === 'reader' && selectedComic && (
        <ReaderView comic={selectedComic} onProgress={updateReadingProgress} />
      )}

      {view.name === 'search' && (
        <SearchView
          comics={comics}
          galleries={galleries}
          tags={tags}
          onBack={goBack}
          onOpenComic={(comicId) => setView({ name: 'detail', comicId })}
        />
      )}

      {view.name === 'galleries' && (
        <GalleryManager
          comics={comics}
          galleries={galleries}
          onBack={goBack}
          onCreate={createGallery}
          onDelete={deleteGallery}
          onRename={renameGallery}
        />
      )}

      {view.name === 'settings' && (
        <SettingsView
          directories={directories}
          status={backendStatus}
          onBack={goBack}
          onChooseComic={chooseComicDirectory}
          onChooseWorkspace={chooseWorkspaceDirectory}
          onChange={saveDirectories}
          onScan={scanComicDirectory}
        />
      )}
    </div>
  );
}

function StatusBar() {
  return (
    <div className="status-bar">
      <span>8:04</span>
      <span className="status-icons">5G 49</span>
    </div>
  );
}

function AppTopBar({ title, onBack, actions }) {
  return (
    <header className="top-bar">
      {onBack ? (
        <button className="icon-button" onClick={onBack} aria-label="返回">
          <ArrowLeft size={22} />
        </button>
      ) : (
        <div className="brand-mark">
          <Library size={21} />
        </div>
      )}
      <h1>{title}</h1>
      <div className="top-actions">{actions}</div>
    </header>
  );
}

function HomeView({
  activeGallery,
  activeShelf,
  comics,
  galleries,
  onGalleryChange,
  onOpenComic,
  onOpenGalleries,
  onOpenSearch,
  onOpenSettings,
  onReadComic,
  onShelfChange,
}) {
  const isHistory = activeShelf === 'reading';

  return (
    <>
      <AppTopBar
        title="本地漫画"
        actions={
          <>
            <button className="icon-button" onClick={onOpenSearch} aria-label="搜索">
              <Search size={22} />
            </button>
            <button className="icon-button" onClick={onOpenSettings} aria-label="设置">
              <Settings size={21} />
            </button>
          </>
        }
      />

      <main className="screen home-screen">
        <section className="shelf-strip" aria-label="书架">
          {shelves.map((shelf) => (
            <button
              className={activeShelf === shelf.id ? 'segmented active' : 'segmented'}
              key={shelf.id}
              onClick={() => onShelfChange(shelf.id)}
            >
              {shelf.label}
            </button>
          ))}
        </section>

        {!isHistory && (
          <section className="gallery-filter">
            <button className={activeGallery === 'all' ? 'gallery-pill active' : 'gallery-pill'} onClick={() => onGalleryChange('all')}>
              全部画廊
            </button>
            {galleries.map((gallery) => (
              <button
                className={activeGallery === gallery.id ? 'gallery-pill active' : 'gallery-pill'}
                key={gallery.id}
                onClick={() => onGalleryChange(gallery.id)}
              >
                <span className="dot" style={{ background: gallery.color }} />
                {gallery.name}
              </button>
            ))}
            <button className="gallery-manage" onClick={onOpenGalleries} aria-label="管理画廊">
              <Menu size={18} />
            </button>
          </section>
        )}

        <section className="library-grid">
          {comics.map((comic) => (
            <ComicCard
              comic={comic}
              gallery={galleries.find((item) => item.id === comic.gallery)}
              key={comic.id}
              onOpen={isHistory ? onReadComic : onOpenComic}
            />
          ))}
        </section>

        {comics.length === 0 && <EmptyState icon={<Folder size={42} />} title={isHistory ? '还没有阅读记录' : '当前书架没有漫画'} />}
      </main>
    </>
  );
}

function ComicCard({ comic, gallery, onOpen }) {
  return (
    <button className="comic-card" onClick={() => onOpen(comic.id)}>
      <Cover className="card-cover" comic={comic} variant={comic.cover} title={comic.title} />
      <span className="card-title">{comic.title}</span>
      <span className="card-meta">{comic.author}</span>
      <span className="card-footer">
        <span>{comic.pages}</span>
        <span>{gallery?.name}</span>
      </span>
    </button>
  );
}

function Cover({ className = '', comic, variant, title }) {
  const [coverImage, setCoverImage] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!comic) return;
    let cancelled = false;
    setFailed(false);
    setCoverImage('');
    api
      .getComicCover(comic)
      .then((payload) => {
        if (!cancelled) setCoverImage(payload.dataUrl || '');
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [comic.id]);

  return (
    <div className={`cover-art ${variant} ${className}`} aria-label={title}>
      {coverImage && !failed ? (
        <img className="cover-image" src={coverImage} alt={title} onError={() => setFailed(true)} />
      ) : (
        <>
          <div className="cover-panel panel-a" />
          <div className="cover-panel panel-b" />
          <div className="cover-panel panel-c" />
          <div className="cover-face" />
          <div className="cover-lines" />
        </>
      )}
    </div>
  );
}

function ComicDetail({ comic, galleries, tags, onAddTag, onBack, onRead, onRemoveTag, onUpdateComic }) {
  const comicTags = comic.tags.map((id) => tags.find((tag) => tag.id === id)).filter(Boolean);
  const [newGroup, setNewGroup] = useState('自定义');
  const [newTag, setNewTag] = useState('');

  return (
    <>
      <AppTopBar
        title="漫画详情"
        onBack={onBack}
        actions={
          <button className="icon-button" onClick={onRead} aria-label="打开阅读器">
            <BookOpen size={22} />
          </button>
        }
      />

      <main className="detail-screen">
        <section className="detail-hero">
          <Cover className="detail-cover" comic={comic} variant={comic.cover} title={comic.title} />
          <div className="hero-copy">
            <h2>{comic.title}</h2>
          </div>
        </section>

        <section className="action-panel single">
          <button className="accent" onClick={onRead}>阅读</button>
        </section>

        <section className="meta-panel">
          <span>总页数</span>
          <strong>{comic.pages.replace(/.*\//, '')}</strong>
        </section>

        <section className="edit-block">
          <div className="section-heading">
            <h3>Tags</h3>
            <span>{comicTags.length}</span>
          </div>
          <div className="tag-cloud detail-tags">
            {comicTags.map((tag) => (
              <button className="tag-chip editable" key={tag.id} onClick={() => onRemoveTag(comic.id, tag.id)}>
                <span className="tag-group">{tag.group}</span>
                {tag.value}
                <X size={14} />
              </button>
            ))}
          </div>

          <form
            className="tag-form"
            onSubmit={(event) => {
              event.preventDefault();
              onAddTag(comic.id, newGroup, newTag);
              setNewTag('');
            }}
          >
            <input value={newGroup} onChange={(event) => setNewGroup(event.target.value)} aria-label="Tag 分组" />
            <input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="新增 tag" aria-label="新增 tag" />
            <button className="round-action" aria-label="添加 tag">
              <Plus size={20} />
            </button>
          </form>
        </section>

        <section className="edit-block">
          <div className="section-heading">
            <h3>所属画廊</h3>
            <ImagePlus size={18} />
          </div>
          <select value={comic.gallery} onChange={(event) => onUpdateComic(comic.id, { gallery: event.target.value })}>
            {galleries.map((gallery) => (
              <option value={gallery.id} key={gallery.id}>
                {gallery.name}
              </option>
            ))}
          </select>
        </section>
      </main>
    </>
  );
}

function SearchView({ comics, galleries, tags, onBack, onOpenComic }) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState('');

  async function submitSearch(nextQuery) {
    const trimmed = nextQuery.trim();
    setSubmittedQuery(trimmed);
    setSearchError('');
    if (!trimmed) {
      setResults([]);
      return;
    }
    try {
      const payload = await api.searchComics(trimmed);
      setResults(payload.results || []);
    } catch (error) {
      setSearchError(error.message);
      setResults([]);
    }
  }

  return (
    <>
      <AppTopBar title="Tag 搜索" onBack={onBack} />
      <main className="screen search-screen">
        <form
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(query);
          }}
        >
          <label className="search-field">
            <Search size={20} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入 tag，例如：汉语 翻译 -巨乳" />
          </label>
          <button className="primary-button">搜索</button>
        </form>

        <section className="result-list">
          <div className="section-heading">
            <h3>搜索结果</h3>
            <span>{results.length}</span>
          </div>
          {submittedQuery && <p className="query-summary">{submittedQuery}</p>}
          {searchError && <p className="query-summary error-text">{searchError}</p>}
          {results.map((comic) => (
            <ResultRow comic={comic} gallery={galleries.find((gallery) => gallery.id === comic.gallery)} key={comic.id} onOpen={onOpenComic} />
          ))}
          {results.length === 0 && <EmptyState icon={<Tag size={40} />} title={submittedQuery ? '没有匹配的漫画' : '请输入 tag 条件'} />}
        </section>
      </main>
    </>
  );
}

function ResultRow({ comic, gallery, onOpen }) {
  return (
    <button className="result-row" onClick={() => onOpen(comic.id)}>
      <Cover className="row-cover" comic={comic} variant={comic.cover} title={comic.title} />
      <span>
        <strong>{comic.title}</strong>
        <small>{comic.author} · {gallery?.name} · {comic.pages}</small>
      </span>
    </button>
  );
}

function ReaderView({ comic, onProgress }) {
  const [pages, setPages] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [image, setImage] = useState('');
  const [pageImages, setPageImages] = useState([]);
  const pageImagesRef = useRef([]);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeAnimating, setSwipeAnimating] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [status, setStatus] = useState({ loading: true, error: '' });
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const pageIndexRef = useRef(0);
  const swipeTimerRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    startDistance: 0,
    startOffset: { x: 0, y: 0 },
    startZoom: 1,
    moved: false,
    pinching: false,
  });

  useEffect(() => {
    let cancelled = false;
    setStatus({ loading: true, error: '' });
    api
      .listComicPages(comic)
      .then((items) => {
        if (cancelled) return;
        setPages(items);
        setPageImages(Array(items.length).fill(''));
        pageImagesRef.current = Array(items.length).fill('');
        const savedPage = Number.isInteger(comic.readingPage) ? comic.readingPage : 0;
        setPageIndex(Math.min(Math.max(savedPage, 0), Math.max(items.length - 1, 0)));
        if (items.length === 0) setStatus({ loading: false, error: '这本漫画没有可读取的图片页' });
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus({ loading: false, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [comic.id]);

  useEffect(() => {
    if (!pages[pageIndex]) return;
    let cancelled = false;
    const cachedImage = pageImagesRef.current[pageIndex];
    if (cachedImage) {
      setImage(cachedImage);
      setStatus({ loading: false, error: '' });
      return () => {
        cancelled = true;
      };
    }
    setStatus({ loading: true, error: '' });
    setImage('');
    api
      .readComicPage(pages[pageIndex])
      .then((payload) => {
        if (cancelled) return;
        const dataUrl = payload.dataUrl;
        pageImagesRef.current[pageIndex] = dataUrl;
        setPageImages((current) => {
          const next = [...current];
          next[pageIndex] = dataUrl;
          return next;
        });
        setImage(dataUrl);
        setStatus({ loading: false, error: '' });
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus({ loading: false, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [pageIndex, pages]);

  useEffect(() => {
    if (pages.length === 0) return undefined;
    let cancelled = false;
    const adjacentIndexes = [pageIndex - 1, pageIndex + 1].filter((index) => index >= 0 && index < pages.length);

    adjacentIndexes.forEach(async (index) => {
      if (pageImagesRef.current[index]) return;
      try {
        const payload = await api.readComicPage(pages[index]);
        if (cancelled) return;
        pageImagesRef.current[index] = payload.dataUrl;
        setPageImages((current) => {
          const next = [...current];
          next[index] = payload.dataUrl;
          return next;
        });
      } catch {
        // The current page should stay usable even if neighbor preview loading fails.
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pageIndex, pages]);

  useEffect(() => {
    if (pages.length === 0) return undefined;
    let cancelled = false;
    let cursor = 0;
    const workerCount = Math.min(3, pages.length);

    async function preloadWorker() {
      while (!cancelled) {
        const index = cursor;
        cursor += 1;
        if (index >= pages.length) return;
        if (pageImagesRef.current[index]) continue;
        try {
          const payload = await api.readComicPage(pages[index]);
          if (cancelled) return;
          pageImagesRef.current[index] = payload.dataUrl;
          setPageImages((current) => {
            const next = [...current];
            next[index] = payload.dataUrl;
            return next;
          });
          if (index === pageIndex) {
            setImage(payload.dataUrl);
            setStatus({ loading: false, error: '' });
          }
        } catch {
          // Keep reading available even if one background preload fails.
        }
      }
    }

    for (let i = 0; i < workerCount; i += 1) preloadWorker();
    return () => {
      cancelled = true;
    };
  }, [pages]);

  function go(delta) {
    setPageIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(pages.length - 1, 0)));
  }

  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);

  useEffect(() => {
    return () => {
      onProgress?.(comic.id, pageIndexRef.current);
    };
  }, [comic.id, onProgress]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSwipeOffset(0);
    setSwipeAnimating(false);
    pointersRef.current.clear();
  }, [pageIndex]);

  useEffect(() => {
    return () => {
      if (swipeTimerRef.current) window.clearTimeout(swipeTimerRef.current);
    };
  }, []);

  function clampOffset(nextOffset, nextZoom = zoom) {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || nextZoom <= 1.02) return { x: 0, y: 0 };
    const maxX = Math.max((img.offsetWidth * nextZoom - canvas.clientWidth) / 2, 0);
    const maxY = Math.max((img.offsetHeight * nextZoom - canvas.clientHeight) / 2, 0);
    return {
      x: Math.min(Math.max(nextOffset.x, -maxX), maxX),
      y: Math.min(Math.max(nextOffset.y, -maxY), maxY),
    };
  }

  function pointerDistance() {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY);
  }

  function onPointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startDistance: 0,
        startOffset: offset,
        startZoom: zoom,
        moved: false,
        pinching: false,
      };
    }
    if (pointersRef.current.size === 2) {
      gestureRef.current.startDistance = pointerDistance();
      gestureRef.current.startZoom = zoom;
      gestureRef.current.pinching = true;
    }
  }

  function onPointerMove(event) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    const gesture = gestureRef.current;
    if (pointersRef.current.size >= 2 && gesture.startDistance > 0) {
      const nextZoom = Math.min(Math.max((pointerDistance() / gesture.startDistance) * gesture.startZoom, 1), 4);
      gesture.moved = true;
      gesture.pinching = true;
      setZoom(nextZoom);
      setOffset((current) => clampOffset(current, nextZoom));
      return;
    }
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (zoom > 1.02) {
      gesture.moved = true;
      setSwipeOffset(0);
      setOffset(clampOffset({
        x: gesture.startOffset.x + deltaX,
        y: gesture.startOffset.y + deltaY,
      }));
      return;
    }
    if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
      gesture.moved = true;
      const hasPrevious = pageIndexRef.current > 0;
      const hasNext = pageIndexRef.current < pages.length - 1;
      const edgePull = (deltaX > 0 && !hasPrevious) || (deltaX < 0 && !hasNext);
      setSwipeAnimating(false);
      setSwipeOffset(edgePull ? deltaX * 0.28 : deltaX);
    } else if (Math.hypot(deltaX, deltaY) > 10) {
      gesture.moved = true;
    }
  }

  function onPointerUp(event) {
    const gesture = gestureRef.current;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    pointersRef.current.delete(event.pointerId);
    if (zoom <= 1.02 && !gesture.pinching && Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      const direction = deltaX < 0 ? 1 : -1;
      const nextIndex = pageIndexRef.current + direction;
      const canTurn = nextIndex >= 0 && nextIndex < pages.length;
      const canvasWidth = canvasRef.current?.clientWidth || window.innerWidth;
      setSwipeAnimating(true);
      setSwipeOffset(canTurn ? -direction * canvasWidth : 0);
      if (swipeTimerRef.current) window.clearTimeout(swipeTimerRef.current);
      swipeTimerRef.current = window.setTimeout(() => {
        if (canTurn) go(direction);
        setSwipeOffset(0);
        setSwipeAnimating(false);
      }, 180);
    } else if (zoom <= 1.02 && !gesture.pinching) {
      setSwipeAnimating(true);
      setSwipeOffset(0);
      if (swipeTimerRef.current) window.clearTimeout(swipeTimerRef.current);
      swipeTimerRef.current = window.setTimeout(() => {
        setSwipeAnimating(false);
      }, 180);
    }
    if (pointersRef.current.size === 0) {
      window.setTimeout(() => {
        gestureRef.current.moved = false;
        gestureRef.current.pinching = false;
      }, 0);
    }
  }

  function onCanvasClick(event) {
    const gesture = gestureRef.current;
    if (gesture.moved || gesture.pinching) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const tapY = event.clientY - rect.top;
    if (tapY > rect.height * 0.72) {
      setShowProgress((current) => !current);
      return;
    }
    if (zoom > 1.02) return;
    go(event.clientX - rect.left < rect.width / 2 ? -1 : 1);
  }

  function jumpToPage(value) {
    const nextIndex = Math.min(Math.max(Number(value) - 1, 0), Math.max(pages.length - 1, 0));
    setPageIndex(nextIndex);
  }

  const previousImage = pageIndex > 0 ? pageImages[pageIndex - 1] : '';
  const nextImage = pageIndex < pages.length - 1 ? pageImages[pageIndex + 1] : '';

  return (
    <main className="reader-screen">
      <section
        ref={canvasRef}
        className="reader-canvas"
        onClick={onCanvasClick}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {status.loading && <p>正在读取图片...</p>}
        {status.error && <p className="reader-error">{status.error}</p>}
        {image && (
          <div
            className={`reader-page-strip${swipeAnimating ? ' is-animating' : ''}`}
            style={{ transform: `translateX(${swipeOffset}px)` }}
          >
            <div className="reader-page reader-page-previous">
              {previousImage && <img src={previousImage} alt={`${comic.title} 第 ${pageIndex} 页`} />}
            </div>
            <div className="reader-page reader-page-current">
              <img
                ref={imageRef}
                src={image}
                alt={`${comic.title} 第 ${pageIndex + 1} 页`}
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
              />
            </div>
            <div className="reader-page reader-page-next">
              {nextImage && <img src={nextImage} alt={`${comic.title} 第 ${pageIndex + 2} 页`} />}
            </div>
          </div>
        )}
        {showProgress && pages.length > 0 && (
          <div className="reader-progress-panel" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <span>{pageIndex + 1}</span>
            <input
              aria-label="阅读进度"
              max={pages.length}
              min="1"
              onChange={(event) => jumpToPage(event.target.value)}
              onInput={(event) => jumpToPage(event.target.value)}
              style={{ '--reader-progress': `${pages.length > 1 ? (pageIndex / (pages.length - 1)) * 100 : 0}%` }}
              type="range"
              value={pageIndex + 1}
            />
            <span>{pages.length}</span>
          </div>
        )}
      </section>
    </main>
  );
}

function GalleryManager({ comics, galleries, onBack, onCreate, onDelete, onRename }) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);

  return (
    <>
      <AppTopBar title="画廊管理" onBack={onBack} />
      <main className="screen manager-screen">
        <form
          className="create-gallery"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate(newName);
            setNewName('');
          }}
        >
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="新画廊名称" />
          <button className="primary-button">
            <Plus size={18} />
            创建
          </button>
        </form>

        <section className="gallery-list">
          {galleries.map((gallery) => {
            const count = comics.filter((comic) => comic.gallery === gallery.id).length;
            const editingThis = editing?.id === gallery.id;
            return (
              <article className="gallery-item" key={gallery.id}>
                <span className="gallery-icon" style={{ background: gallery.color }}>
                  <Grid2X2 size={22} />
                </span>
                <div>
                  {editingThis ? (
                    <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} autoFocus />
                  ) : (
                    <strong>{gallery.name}</strong>
                  )}
                  <small>{count} 本漫画</small>
                </div>
                {editingThis ? (
                  <button
                    className="icon-button dark"
                    onClick={() => {
                      onRename(gallery.id, editing.name);
                      setEditing(null);
                    }}
                    aria-label="保存"
                  >
                    <Check size={19} />
                  </button>
                ) : (
                  <button className="icon-button dark" onClick={() => setEditing({ id: gallery.id, name: gallery.name })} aria-label="重命名">
                    <Pencil size={18} />
                  </button>
                )}
                <button className="icon-button danger" onClick={() => onDelete(gallery.id)} aria-label="删除">
                  <Trash2 size={18} />
                </button>
              </article>
            );
          })}
        </section>
      </main>
    </>
  );
}

function SettingsView({ directories, status, onBack, onChooseComic, onChooseWorkspace, onScan }) {
  const comicReady = Boolean(directories.comicRootUri);
  const workspaceReady = Boolean(directories.workspaceUri);

  return (
    <>
      <AppTopBar
        title="目录设置"
        onBack={onBack}
        actions={
          <button className="icon-button" onClick={onScan} aria-label="扫描漫画目录">
            <Search size={21} />
          </button>
        }
      />
      <main className="screen settings-screen">
        <section className="directory-card">
          <Folder size={26} />
          <div>
            <h3>漫画文件目录</h3>
            <p>只扫描和读取漫画文件，不写入索引、缓存、封面或 tag 数据。</p>
            <strong className="directory-state">{comicReady ? '已授权漫画目录' : '未选择'}</strong>
          </div>
          <button className="primary-button secondary directory-button" onClick={onChooseComic}>
            <Folder size={18} />
            选择漫画目录
          </button>
        </section>

        <section className="directory-card">
          <Archive size={26} />
          <div>
            <h3>工作目录</h3>
            <p>保存数据库、tag、画廊、缩略图缓存和阅读进度，避免污染漫画源目录。</p>
            <strong className="directory-state">{workspaceReady ? '已设置工作目录' : '未选择'}</strong>
          </div>
          <button className="primary-button secondary directory-button" onClick={onChooseWorkspace}>
            <Folder size={18} />
            选择工作目录
          </button>
        </section>

        <section className="settings-actions single">
          <button className="primary-button" onClick={onScan}>
            <Search size={18} />
            扫描漫画
          </button>
        </section>

        <section className="policy-block">
          <Info size={21} />
          <p>前端已按“双目录”设计展示：漫画目录为只读资产源，工作目录承载所有 app 逻辑文件和用户行为数据。</p>
        </section>

        {(status?.message || status?.error || status?.loading) && (
          <section className={status?.error ? 'status-card error' : 'status-card'}>
            {status.progress === 'scan' && (
              <div className="scan-progress" aria-label="扫描漫画进度" aria-valuetext="正在扫描漫画">
                <span />
              </div>
            )}
            <p>{status.loading ? status.message || '正在连接本地后端...' : status.error || status.message}</p>
          </section>
        )}
      </main>
    </>
  );
}

function EmptyState({ icon, title }) {
  return (
    <div className="empty-state">
      {icon}
      <p>{title}</p>
    </div>
  );
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    acc[value] ||= [];
    acc[value].push(item);
    return acc;
  }, {});
}

createRoot(document.getElementById('root')).render(<App />);
