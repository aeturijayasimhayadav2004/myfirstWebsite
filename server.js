const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DEFAULT_RENDER_DATA_DIR = '/var/data/ourworld';
const FALLBACK_DATA_DIR = path.join(ROOT, 'data');

function resolveDataDir() {
  const candidates = [];
  if (process.env.DATA_DIR) candidates.push(process.env.DATA_DIR);
  if (process.env.DATA_PATH) candidates.push(process.env.DATA_PATH);
  if (process.env.RENDER) candidates.push(DEFAULT_RENDER_DATA_DIR);
  candidates.push(FALLBACK_DATA_DIR);

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (err) {
      console.warn(`Warning: could not use data dir ${dir}: ${err.code || err.message}`);
    }
  }

  throw new Error('No writable data directory available');
}

const DATA_DIR = resolveDataDir();
console.log(`[storage] using data directory: ${DATA_DIR}`);
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const SESSION_COOKIE = 'ourworld.sid';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const PASSWORD_SALT = process.env.SESSION_SECRET || 'ourworld-salt';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const seeded = {
      events: [],
      memories: [],
      blogPosts: [],
      dateIdeas: [],
      bucketItems: [],
      specialDays: [],
      favorites: [],
      profile: {
        name: 'Us',
        bio: 'Together, always.',
        avatar: null
      },
      fun: {
        wheel: [
          { idea: 'Surprise takeaway night' },
          { idea: 'Movie marathon' },
          { idea: 'Stargazing date' },
          { idea: 'Board game battle' },
          { idea: 'Cook together' }
        ],
        quiz: [
          { question: 'First trip together?', answer: 'The beach getaway' },
          { question: 'Favorite shared meal?', answer: 'Tacos!' }
        ],
        polls: [
          {
            id: 1,
            prompt: "Pick tonight's vibe",
            options: [
              { id: 1, option_text: 'Cozy movie', votes: 0 },
              { id: 2, option_text: 'Fancy dinner', votes: 0 },
              { id: 3, option_text: 'Game night', votes: 0 }
            ]
          }
        ]
      },
      nextIds: {
        events: 1,
        memories: 1,
        blogPosts: 1,
        dateIdeas: 1,
        bucketItems: 1,
        specialDays: 1,
        favorites: 1
      }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seeded, null, 2));
  }
  let parsed;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('Resetting data store after parse error', err);
    parsed = {
      events: [],
      memories: [],
      blogPosts: [],
      dateIdeas: [],
      bucketItems: [],
      specialDays: [],
      favorites: [],
      profile: { name: 'Us', bio: 'Together, always.', avatar: null },
      fun: { wheel: [], quiz: [], polls: [] },
      nextIds: { events: 1, memories: 1, blogPosts: 1, dateIdeas: 1, bucketItems: 1, specialDays: 1, favorites: 1 }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
  }

  // Normalize legacy records
  if (Array.isArray(parsed.fun?.wheel)) {
    parsed.fun.wheel = parsed.fun.wheel.map((entry) =>
      typeof entry === 'string' ? { idea: entry } : { idea: entry.idea || entry.text || 'Fun idea' }
    );
  }
  if (Array.isArray(parsed.fun?.polls)) {
    parsed.fun.polls = parsed.fun.polls.map((poll) => ({
      ...poll,
      options: Array.isArray(poll.options)
        ? poll.options.map((opt, idx) => ({
            id: opt.id ?? idx + 1,
            option_text: opt.option_text || opt.text || String(opt.option || opt.idea || 'Option'),
            votes: opt.votes ?? 0
          }))
        : []
    }));
  }

  parsed.memories = Array.isArray(parsed.memories)
    ? parsed.memories.map((m) => ({ ...m, caption: m.caption || '' }))
    : [];
  parsed.favorites = Array.isArray(parsed.favorites) ? parsed.favorites : [];
  parsed.profile = parsed.profile || { name: 'Us', bio: 'Together, always.', avatar: null };
  parsed.nextIds = parsed.nextIds || {};
  parsed.nextIds.events = parsed.nextIds.events || 1;
  parsed.nextIds.memories = parsed.nextIds.memories || 1;
  parsed.nextIds.blogPosts = parsed.nextIds.blogPosts || 1;
  parsed.nextIds.dateIdeas = parsed.nextIds.dateIdeas || 1;
  parsed.nextIds.bucketItems = parsed.nextIds.bucketItems || 1;
  parsed.nextIds.specialDays = parsed.nextIds.specialDays || 1;
  parsed.nextIds.favorites = parsed.nextIds.favorites || 1;

  return parsed;
}

function saveData(data) {
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
  try {
    const fd = fs.openSync(DATA_FILE, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (err) {
    console.warn('Warning: could not fsync data file', err);
  }
  state = data;
}

let state = loadData();

const sessions = new Map();

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [k, ...rest] = c.trim().split('=');
      return [k, decodeURIComponent(rest.join('='))];
    })
  );
}

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function getSession(req) {
  const cookies = parseCookies(req);
  const id = cookies[SESSION_COOKIE];
  if (!id) return null;
  const session = sessions.get(id);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  return { id, ...session };
}

function setSession(res, session) {
  const expires = new Date(Date.now() + ONE_WEEK_MS);
  const secure = IS_PROD ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_WEEK_MS / 1000}; Expires=${expires.toUTCString()}${secure}`;
  res.setHeader('Set-Cookie', cookie);
}

function clearSession(res) {
  const secure = IS_PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax${secure}`);
}

function pbkdf2Hash(password) {
  return crypto.pbkdf2Sync(password, PASSWORD_SALT, 100000, 64, 'sha512').toString('hex');
}

function verifyPassword(password) {
  const configured = process.env.OURWORLD_PASSWORD || 'starlight';
  const expected = pbkdf2Hash(configured);
  const provided = pbkdf2Hash(password || '');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 15 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain', ...headers });
  res.end(text);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function storeUpload(file) {
  if (!file?.data || !file.name || !file.type) return null;
  const buffer = Buffer.from(file.data, 'base64');
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}-${sanitizeFilename(file.name)}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return { filename, originalname: file.name, mime: file.type };
}

function serveStatic(req, res, filepath) {
  fs.readFile(filepath, (err, data) => {
    if (err) {
      sendText(res, 404, 'Not found');
      return;
    }
    const ext = path.extname(filepath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp'
    };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(data);
  });
}

function handleUploads(req, res, session, pathname) {
  if (!session) {
    sendText(res, 302, 'Redirect', { Location: '/login.html' });
    return;
  }
  const target = path.join(UPLOAD_DIR, pathname.replace('/uploads/', ''));
  if (!target.startsWith(UPLOAD_DIR)) {
    sendText(res, 400, 'Invalid path');
    return;
  }
  if (!fs.existsSync(target)) {
    sendText(res, 404, 'Not found');
    return;
  }
  serveStatic(req, res, target);
}

function requireAuth(session, res) {
  if (!session) {
    sendJson(res, 401, { error: 'Not authenticated' });
    return false;
  }
  return true;
}

async function handleApi(req, res, session, pathname) {
  const data = state;
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { status: 'ok', storage: fs.existsSync(DATA_FILE) });
    return;
  }

  if (pathname === '/api/session/login' && req.method === 'POST') {
    const body = await readBody(req);
    const { password } = JSON.parse(body || '{}');
    if (!verifyPassword(password)) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }
    const newId = generateSessionId();
    const sessionData = { authenticated: true, createdAt: Date.now(), expiresAt: Date.now() + ONE_WEEK_MS };
    sessions.set(newId, sessionData);
    setSession(res, { id: newId });
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/session/logout' && req.method === 'POST') {
    if (session) {
      sessions.delete(session.id);
    }
    clearSession(res);
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/session/status' && req.method === 'GET') {
    sendJson(res, 200, { authenticated: Boolean(session) });
    return;
  }

  if (pathname === '/api/profile/public' && req.method === 'GET') {
    const safe = data.profile || { name: 'Us', bio: 'Together, always.', avatar: null };
    let avatarData = null;
    if (safe.avatar?.filename) {
      const filePath = path.join(UPLOAD_DIR, safe.avatar.filename);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        avatarData = `data:${safe.avatar.mime || 'image/png'};base64,${content.toString('base64')}`;
      }
    }
    sendJson(res, 200, { name: safe.name, bio: safe.bio, avatar: safe.avatar, avatarData });
    return;
  }

  if (pathname === '/api/profile') {
    if (req.method === 'GET') {
      if (!requireAuth(session, res)) return;
      sendJson(res, 200, data.profile || {});
      return;
    }
    if (req.method === 'POST') {
      if (!requireAuth(session, res)) return;
      const payload = JSON.parse(await readBody(req) || '{}');
      const current = data.profile || { name: 'Us', bio: 'Together, always.', avatar: null };
      if (payload.name) current.name = payload.name.slice(0, 120);
      if (payload.bio !== undefined) current.bio = String(payload.bio).slice(0, 500);
      if (payload.avatarFile) {
        if (!payload.avatarFile.type?.startsWith('image/')) {
          sendJson(res, 400, { error: 'Avatar must be an image' });
          return;
        }
        const stored = storeUpload(payload.avatarFile);
        if (stored) {
          if (current.avatar?.filename) {
            const p = path.join(UPLOAD_DIR, current.avatar.filename);
            if (fs.existsSync(p)) fs.unlinkSync(p);
          }
          current.avatar = stored;
        }
      }
      data.profile = current;
      saveData(data);
      sendJson(res, 200, current);
      return;
    }
  }

  if (pathname === '/api/home/events') {
    if (req.method === 'GET') {
      if (!requireAuth(session, res)) return;
      sendJson(res, 200, data.events);
      return;
    }
    if (req.method === 'POST') {
      if (!requireAuth(session, res)) return;
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}');
      const id = data.nextIds.events++;
      const record = { id, title: payload.title || 'Untitled', event_date: payload.event_date || new Date().toISOString(), description: payload.description || '' };
      data.events.push(record);
      saveData(data);
      sendJson(res, 200, record);
      return;
    }
  }

  if (pathname.startsWith('/api/home/events/') && req.method === 'DELETE') {
    if (!requireAuth(session, res)) return;
    const id = Number(pathname.split('/').pop());
    const idx = data.events.findIndex((e) => e.id === id);
    if (idx === -1) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    data.events.splice(idx, 1);
    saveData(data);
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/memories') {
    if (req.method === 'GET') {
      if (!requireAuth(session, res)) return;
      sendJson(res, 200, data.memories);
      return;
    }
    if (req.method === 'POST') {
      if (!requireAuth(session, res)) return;
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}');
      if (!payload?.file?.type?.startsWith('image/')) {
        sendJson(res, 400, { error: 'Invalid upload' });
        return;
      }
      const stored = storeUpload(payload.file);
      if (!stored) {
        sendJson(res, 400, { error: 'Invalid upload' });
        return;
      }
      const id = data.nextIds.memories++;
      const record = {
        id,
        ...stored,
        caption: (payload.caption || '').toString().slice(0, 240),
        uploaded_at: new Date().toISOString()
      };
      data.memories.push(record);
      saveData(data);
      sendJson(res, 200, record);
      return;
    }
  }

  if (pathname.startsWith('/api/memories/') && req.method === 'DELETE') {
    if (!requireAuth(session, res)) return;
    const id = Number(pathname.split('/').pop());
    const index = data.memories.findIndex((m) => m.id === id);
    if (index === -1) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const [removed] = data.memories.splice(index, 1);
    const filePath = path.join(UPLOAD_DIR, removed.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    saveData(data);
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/blog') {
    if (req.method === 'GET') {
      if (!requireAuth(session, res)) return;
      sendJson(res, 200, data.blogPosts);
      return;
    }
    if (req.method === 'POST') {
      if (!requireAuth(session, res)) return;
      const payload = JSON.parse(await readBody(req) || '{}');
      const id = data.nextIds.blogPosts++;
      const record = {
        id,
        title: payload.title || 'Untitled',
        body: payload.body || '',
        author: payload.author || 'Us',
        created_at: new Date().toISOString()
      };
      data.blogPosts.unshift(record);
      saveData(data);
      sendJson(res, 200, record);
      return;
    }
  }

  if (pathname.startsWith('/api/blog/') && req.method === 'DELETE') {
    if (!requireAuth(session, res)) return;
    const id = Number(pathname.split('/').pop());
    const idx = data.blogPosts.findIndex((p) => p.id === id);
    if (idx === -1) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    data.blogPosts.splice(idx, 1);
    saveData(data);
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/dates/ideas') {
    if (req.method === 'GET') {
      if (!requireAuth(session, res)) return;
      sendJson(res, 200, data.dateIdeas);
      return;
    }
    if (req.method === 'POST') {
      if (!requireAuth(session, res)) return;
      const payload = JSON.parse(await readBody(req) || '{}');
      const id = data.nextIds.dateIdeas++;
      const record = {
        id,
        title: payload.title || 'New idea',
        status: payload.status || 'Planned',
        notes: payload.notes || '',
        created_at: new Date().toISOString()
      };
      data.dateIdeas.push(record);
      saveData(data);
      sendJson(res, 200, record);
      return;
    }
  }

  if (pathname.startsWith('/api/dates/ideas/') && req.method === 'DELETE') {
    if (!requireAuth(session, res)) return;
    const id = Number(pathname.split('/').pop());
    const idx = data.dateIdeas.findIndex((i) => i.id === id);
    if (idx === -1) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    data.dateIdeas.splice(idx, 1);
    saveData(data);
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathname.startsWith('/api/dates/ideas/') && req.method === 'PATCH') {
    if (!requireAuth(session, res)) return;
    const id = Number(pathname.split('/').pop());
    const payload = JSON.parse(await readBody(req) || '{}');
    const idea = data.dateIdeas.find((i) => i.id === id);
    if (!idea) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    if (payload.status) idea.status = payload.status;
    if (payload.notes !== undefined) idea.notes = payload.notes;
    saveData(data);
    sendJson(res, 200, idea);
    return;
  }

  if (pathname === '/api/dates') {
    if (req.method === 'GET') {
      if (!requireAuth(session, res)) return;
      sendJson(res, 200, { ideas: data.dateIdeas, bucket: data.bucketItems });
      return;
    }
  }

  if (pathname === '/api/dates/bucket') {
    if (req.method === 'GET') {
      if (!requireAuth(session, res)) return;
      sendJson(res, 200, data.bucketItems);
      return;
    }
    if (req.method === 'POST') {
      if (!requireAuth(session, res)) return;
      const payload = JSON.parse(await readBody(req) || '{}');
      const id = data.nextIds.bucketItems++;
      const record = { id, title: payload.title || 'New item', completed: false };
      data.bucketItems.push(record);
      saveData(data);
      sendJson(res, 200, record);
      return;
    }
  }

  if (pathname.startsWith('/api/dates/bucket/')) {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    const targetId = Number(last === 'toggle' ? parts[parts.length - 2] : last);
    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (!requireAuth(session, res)) return;
      if (!Number.isFinite(targetId)) {
        sendJson(res, 400, { error: 'Invalid id' });
        return;
      }
      const item = data.bucketItems.find((i) => i.id === targetId);
      if (!item) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      item.completed = !item.completed;
      saveData(data);
      sendJson(res, 200, item);
      return;
    }
    if (req.method === 'DELETE') {
      if (!requireAuth(session, res)) return;
      if (!Number.isFinite(targetId)) {
        sendJson(res, 400, { error: 'Invalid id' });
        return;
      }
      const idx = data.bucketItems.findIndex((i) => i.id === targetId);
      if (idx === -1) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      data.bucketItems.splice(idx, 1);
      saveData(data);
      sendJson(res, 200, { success: true });
      return;
    }
  }

  if (pathname === '/api/special-days') {
    if (req.method === 'GET') {
      if (!requireAuth(session, res)) return;
      sendJson(res, 200, data.specialDays);
      return;
    }
    if (req.method === 'POST') {
      if (!requireAuth(session, res)) return;
      const payload = JSON.parse(await readBody(req) || '{}');
      const id = data.nextIds.specialDays++;
      const record = { id, title: payload.title || 'Milestone', event_date: payload.event_date || new Date().toISOString(), description: payload.description || '' };
      data.specialDays.push(record);
      saveData(data);
      sendJson(res, 200, record);
      return;
    }
  }

  if (pathname.startsWith('/api/special-days/') && req.method === 'DELETE') {
    if (!requireAuth(session, res)) return;
    const id = Number(pathname.split('/').pop());
    const idx = data.specialDays.findIndex((d) => d.id === id);
    if (idx === -1) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    data.specialDays.splice(idx, 1);
    saveData(data);
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/favorites') {
    if (req.method === 'GET') {
      if (!requireAuth(session, res)) return;
      sendJson(res, 200, data.favorites);
      return;
    }
    if (req.method === 'POST') {
      if (!requireAuth(session, res)) return;
      const payload = JSON.parse(await readBody(req) || '{}');
      const id = data.nextIds.favorites++;
      const songUpload = payload.songFile ? storeUpload(payload.songFile) : null;
      const movieUpload = payload.movieFile ? storeUpload(payload.movieFile) : null;
      const record = {
        id,
        song: payload.song || '',
        movie: payload.movie || '',
        notes: payload.notes || '',
        songUpload,
        movieUpload,
        created_at: new Date().toISOString()
      };
      data.favorites.unshift(record);
      saveData(data);
      sendJson(res, 200, record);
      return;
    }
  }

  if (pathname.startsWith('/api/favorites/') && req.method === 'DELETE') {
    if (!requireAuth(session, res)) return;
    const id = Number(pathname.split('/').pop());
    const idx = data.favorites.findIndex((f) => f.id === id);
    if (idx === -1) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const [removed] = data.favorites.splice(idx, 1);
    if (removed.songUpload?.filename) {
      const p = path.join(UPLOAD_DIR, removed.songUpload.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    if (removed.movieUpload?.filename) {
      const p = path.join(UPLOAD_DIR, removed.movieUpload.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    saveData(data);
    sendJson(res, 200, { success: true });
    return;
  }

  sendText(res, 404, 'Not found');
}

const protectedPages = new Set([
  '/index.html',
  '/memories.html',
  '/blog.html',
  '/dates.html',
  '/special-days.html',
  '/favorites.html',
  '/profile.html',
  '/bablu.html'
]);

const server = http.createServer(async (req, res) => {
  const session = getSession(req);
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, session, pathname);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: 'Server error' });
    }
    return;
  }

  if (pathname.startsWith('/uploads/')) {
    handleUploads(req, res, session, pathname);
    return;
  }

  const cleanPath = pathname === '/' ? '/index.html' : pathname;
  if (protectedPages.has(cleanPath) && !session) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }

  let targetPath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!targetPath.startsWith(PUBLIC_DIR)) {
    sendText(res, 400, 'Invalid path');
    return;
  }

  if (!fs.existsSync(targetPath)) {
    if (!path.extname(cleanPath)) {
      const htmlFallback = path.normalize(path.join(PUBLIC_DIR, `${cleanPath}.html`));
      if (htmlFallback.startsWith(PUBLIC_DIR) && fs.existsSync(htmlFallback)) {
        targetPath = htmlFallback;
      }
    }

    if (!fs.existsSync(targetPath)) {
      sendText(res, 404, 'Not found');
      return;
    }
  }

  serveStatic(req, res, targetPath);
});

server.listen(PORT, () => {
  console.log(`Our World running at http://localhost:${PORT}`);
});
