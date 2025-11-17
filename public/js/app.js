async function apiRequest(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Request failed');
  }
  return res.json();
}

async function requireSession(page) {
  try {
    const status = await apiRequest('/api/session/status');
    if (!status.authenticated && page !== '/login.html') {
      window.location.href = '/login.html';
    }
    if (status.authenticated && page === '/login.html') {
      window.location.href = '/index.html';
    }
  } catch (err) {
    if (page !== '/login.html') {
      window.location.href = '/login.html';
    }
  }
}

async function loadProfile(forPublic = false) {
  const avatarTargets = document.querySelectorAll('.profile-avatar');
  const nameTargets = document.querySelectorAll('[data-profile-name]');
  const endpoint = forPublic ? '/api/profile/public' : '/api/profile';
  try {
    const profile = await apiRequest(endpoint);
    const avatarUrl = profile.avatarData || (profile.avatar?.filename ? `/uploads/${profile.avatar.filename}` : null);
    avatarTargets.forEach((el) => {
      if (avatarUrl) {
        el.style.backgroundImage = `url(${avatarUrl})`;
        el.textContent = '';
      } else {
        el.style.backgroundImage = '';
        el.textContent = (profile.name || 'Us').charAt(0).toUpperCase();
      }
    });
    nameTargets.forEach((el) => {
      el.textContent = profile.name || 'Us';
    });
    const bio = document.getElementById('profileBio');
    if (bio) {
      bio.textContent = profile.bio || 'Together, always.';
    }
    const loginAvatar = document.getElementById('loginAvatar');
    if (loginAvatar) {
      if (avatarUrl) {
        loginAvatar.style.backgroundImage = `url(${avatarUrl})`;
        loginAvatar.textContent = '';
      } else {
        loginAvatar.style.backgroundImage = '';
        loginAvatar.textContent = (profile.name || 'Us').charAt(0).toUpperCase();
      }
    }
  } catch (err) {
    // ignore
  }
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bindLogin() {
  const form = document.getElementById('loginForm');
  const status = document.getElementById('loginStatus');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = form.password.value;
    try {
      await apiRequest('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      status.textContent = 'Welcome back! Redirecting...';
      status.classList.remove('muted');
      form.reset();
      setTimeout(() => (window.location.href = '/index.html'), 400);
    } catch (err) {
      status.textContent = 'Login failed';
      status.classList.add('muted');
    }
  });
}

function bindProfileLogout() {
  const button = document.getElementById('profileLogout');
  if (!button) return;
  button.addEventListener('click', async () => {
    await apiRequest('/api/session/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
}

async function loadEvents() {
  const container = document.getElementById('eventsList');
  if (!container) return;
  try {
    const events = await apiRequest('/api/home/events');
    container.innerHTML = events
      .map(
        (ev) => `<li><strong>${ev.title}</strong><div class="muted">${new Date(ev.event_date).toDateString()}</div><p>${
          ev.description || ''
        }</p><button class="btn delete-event" data-id="${ev.id}">Delete</button></li>`
      )
      .join('');
    container.querySelectorAll('.delete-event').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/api/home/events/${btn.dataset.id}`, { method: 'DELETE' });
        loadEvents();
      });
    });
  } catch (err) {
    container.innerHTML = '<li class="muted">Unable to load events</li>';
  }
}

function bindEventForm() {
  const form = document.getElementById('eventForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      await apiRequest('/api/home/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      form.reset();
      loadEvents();
    } catch (err) {
      alert('Add event requires login.');
    }
  });
}

async function loadMemories() {
  const container = document.getElementById('memoriesGallery');
  if (!container) return;
  try {
    const memories = await apiRequest('/api/memories');
    container.innerHTML = memories
      .map(
        (m) =>
          `<div><img src="/uploads/${m.filename}" alt="${m.originalname}"><p class="muted caption">${
            m.caption || ''
          }</p><div class="muted">${new Date(m.uploaded_at).toLocaleString()}</div><button class="btn delete-memory" data-id="${m.id}">Delete</button></div>`
      )
      .join('');
    document.querySelectorAll('.delete-memory').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/api/memories/${btn.dataset.id}`, { method: 'DELETE' });
        loadMemories();
      });
    });
  } catch (err) {
    container.innerHTML = '<p class="muted">Login to see memories.</p>';
  }
}

function bindMemoryForm() {
  const form = document.getElementById('memoryForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = form.querySelector('input[type="file"]');
    const captionInput = form.querySelector('input[name="caption"]');
    const file = fileInput?.files?.[0];
    if (!file) {
      alert('Please choose a file first.');
      return;
    }
    try {
      const payload = {
        file: {
          name: file.name,
          type: file.type,
          data: await fileToBase64(file),
        },
        caption: captionInput?.value || '',
      };
      await apiRequest('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      form.reset();
      loadMemories();
    } catch (err) {
      alert('Upload requires login.');
    }
  });
}

async function loadBlog() {
  const container = document.getElementById('blogPosts');
  if (!container) return;
  try {
    const posts = await apiRequest('/api/blog');
    container.innerHTML = posts
      .map(
        (p) => `<li><h3>${p.title}</h3><div class="muted">${p.author} · ${new Date(
          p.created_at
        ).toDateString()}</div><p>${p.body}</p><button class="btn delete-post" data-id="${p.id}">Delete</button></li>`
      )
      .join('');
    container.querySelectorAll('.delete-post').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/api/blog/${btn.dataset.id}`, { method: 'DELETE' });
        loadBlog();
      });
    });
  } catch (err) {
    container.innerHTML = '<li class="muted">Unable to load posts</li>';
  }
}

function bindBlogForm() {
  const form = document.getElementById('blogForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      await apiRequest('/api/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      form.reset();
      loadBlog();
    } catch (err) {
      alert('Post requires login.');
    }
  });
}

async function loadDates() {
  const ideaContainer = document.getElementById('dateIdeas');
  const bucketContainer = document.getElementById('bucketList');
  if (!ideaContainer && !bucketContainer) return;
  try {
    const { ideas, bucket } = await apiRequest('/api/dates');
    if (ideaContainer) {
      ideaContainer.innerHTML = ideas
        .map(
          (idea) => `<li><div class="tag status" data-id="${idea.id}">${idea.status}</div><strong>${idea.title}</strong><p class="muted">${
            idea.notes || ''
          }</p><div class="pill-row"><button class="btn ghost update-idea" data-id="${idea.id}">Toggle status</button><button class="btn delete-idea" data-id="${idea.id}">Delete</button></div></li>`
        )
        .join('');
      ideaContainer.querySelectorAll('.update-idea').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const idea = ideas.find((i) => i.id === Number(btn.dataset.id));
          const order = ['Planned', 'In Progress', 'Completed'];
          const next = order[(order.indexOf(idea.status) + 1) % order.length];
          await apiRequest(`/api/dates/ideas/${btn.dataset.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: next }),
          });
          loadDates();
        });
      });
      ideaContainer.querySelectorAll('.delete-idea').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await apiRequest(`/api/dates/ideas/${btn.dataset.id}`, { method: 'DELETE' });
          loadDates();
        });
      });
    }
    if (bucketContainer) {
      bucketContainer.innerHTML = bucket
        .map(
          (item) =>
            `<li class="bucket-row ${item.completed ? 'done' : ''}"><label class="checkbox">` +
            `<input type="checkbox" data-id="${item.id}" ${item.completed ? 'checked' : ''} />` +
            `<span>${item.title}</span></label><button class="btn delete-bucket" data-id="${item.id}">Delete</button></li>`
        )
        .join('');
      bucketContainer.querySelectorAll('input[type="checkbox"]').forEach((box) => {
        box.addEventListener('change', async () => {
          await apiRequest(`/api/dates/bucket/${box.dataset.id}/toggle`, { method: 'PUT' });
          loadDates();
        });
      });
      bucketContainer.querySelectorAll('.delete-bucket').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await apiRequest(`/api/dates/bucket/${btn.dataset.id}`, { method: 'DELETE' });
          loadDates();
        });
      });
    }
  } catch (err) {
    if (ideaContainer) ideaContainer.innerHTML = '<li class="muted">Unable to load dates</li>';
  }
}

function bindDateForms() {
  const ideaForm = document.getElementById('dateIdeaForm');
  const bucketForm = document.getElementById('bucketForm');
  if (ideaForm) {
    ideaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(ideaForm));
      try {
        await apiRequest('/api/dates/ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        ideaForm.reset();
        loadDates();
      } catch (err) {
        alert('Login to add date ideas.');
      }
    });
  }
  if (bucketForm) {
    bucketForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(bucketForm));
      try {
        await apiRequest('/api/dates/bucket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        bucketForm.reset();
        loadDates();
      } catch (err) {
        alert('Login to update bucket list.');
      }
    });
  }
}

async function loadSpecialDays() {
  const list = document.getElementById('specialDays');
  const achievedList = document.getElementById('achievedDays');
  if (!list) return;
  if (window.specialDayTimers) {
    window.specialDayTimers.forEach((t) => clearInterval(t));
  }
  const timers = [];
  try {
    const days = await apiRequest('/api/special-days');
    const now = Date.now();
    const upcoming = days
      .filter((d) => new Date(d.event_date).getTime() >= now)
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
    const achieved = days
      .filter((d) => new Date(d.event_date).getTime() < now)
      .sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

    list.innerHTML = upcoming
      .map(
        (d) =>
          `<li data-date="${d.event_date}" data-id="${d.id}"><strong>${d.title}</strong><div class="muted countdown">Loading timer...</div><p>${
            d.description || ''
          }</p><button class="btn delete-special" data-id="${d.id}">Delete</button></li>`
      )
      .join('');

    if (achievedList) {
      achievedList.innerHTML = achieved
        .map(
          (d) =>
            `<li><strong>${d.title}</strong><div class="muted">Achieved on ${new Date(d.event_date).toDateString()}</div><p>${
              d.description || ''
            }</p><button class="btn delete-special" data-id="${d.id}">Delete</button></li>`
        )
        .join('');
    }

    list.querySelectorAll('li').forEach((item) => {
      const target = new Date(item.dataset.date).getTime();
      const countdown = item.querySelector('.countdown');
      const tick = () => {
        const diff = target - Date.now();
        if (Number.isNaN(diff)) {
          countdown.textContent = 'Invalid date';
          return;
        }
        const abs = Math.abs(diff);
        const days = Math.floor(abs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((abs / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((abs / (1000 * 60)) % 60);
        const seconds = Math.floor((abs / 1000) % 60);
        countdown.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s away`;
      };
      tick();
      timers.push(setInterval(tick, 1000));
    });
    list.querySelectorAll('.delete-special').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/api/special-days/${btn.dataset.id}`, { method: 'DELETE' });
        loadSpecialDays();
      });
    });
    achievedList?.querySelectorAll('.delete-special').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/api/special-days/${btn.dataset.id}`, { method: 'DELETE' });
        loadSpecialDays();
      });
    });
    window.specialDayTimers = timers;
  } catch (err) {
    list.innerHTML = '<li class="muted">Unable to load dates</li>';
    if (achievedList) achievedList.innerHTML = '';
  }
}

function bindSpecialDaysForm() {
  const form = document.getElementById('specialDayForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      await apiRequest('/api/special-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      form.reset();
      loadSpecialDays();
    } catch (err) {
      alert('Login to add milestones.');
    }
  });
}

async function loadFavorites() {
  const list = document.getElementById('favoritesList');
  if (!list) return;
  try {
    const entries = await apiRequest('/api/favorites');
    list.innerHTML = entries
      .map(
        (f) =>
          `<li><div class="favorite-row"><div><strong>${f.song || 'Song TBD'}</strong><p class="muted">${
            f.movie || 'Movie TBD'
          }</p><p class="muted">${f.notes || ''}</p></div><button class="btn delete-favorite" data-id="${f.id}">Delete</button></div></li>`
      )
      .join('');
    list.querySelectorAll('.delete-favorite').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/api/favorites/${btn.dataset.id}`, { method: 'DELETE' });
        loadFavorites();
      });
    });
  } catch (err) {
    list.innerHTML = '<li class="muted">Login to see weekly picks.</li>';
  }
}

function bindFavoritesForm() {
  const form = document.getElementById('favoriteForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const payload = { ...data };
    try {
      await apiRequest('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      form.reset();
      loadFavorites();
    } catch (err) {
      alert('Login to save your picks.');
    }
  });
}

function bindProfileForm() {
  const form = document.getElementById('profileForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const payload = { name: data.name, bio: data.bio };
    const avatarFile = form.avatar.files[0];
    if (avatarFile) {
      payload.avatarFile = { name: avatarFile.name, type: avatarFile.type, data: await fileToBase64(avatarFile) };
    }
    try {
      await apiRequest('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      loadProfile();
    } catch (err) {
      alert('Profile update requires login.');
    }
  });
}

function loadBabluPage() {
  const quoteBox = document.getElementById('babluQuote');
  if (!quoteBox) return;
  const quotes = [
    'With you, every sunrise feels brand new.',
    'You are my quiet place in a loud world.',
    'Our love is my favorite adventure.',
    'You turn ordinary moments into forever memories.',
    'Your smile is my daily dose of sunshine.',
    'I fall for you a little more each day.',
  ];
  const pick = quotes[Math.floor(Math.random() * quotes.length)];
  quoteBox.textContent = pick;
}

function loadInterstellarQuote() {
  const quoteBox = document.getElementById('interstellarQuote');
  if (!quoteBox) return;
  const quotes = [
    "Love is the one thing that transcends time and space.",
    "Do not go gentle into that good night.",
    "Murphy's law doesn't mean that something bad will happen. It means that whatever can happen, will happen.",
    "We used to look up at the sky and wonder at our place in the stars.",
    "Cooper, we're going to be spending a lot of time together. We should learn to talk.",
    "Once you're a parent, you're the ghost of your children's future.",
  ];
  const pick = quotes[Math.floor(Math.random() * quotes.length)];
  quoteBox.textContent = `“${pick}” — Interstellar`;
}

function init() {
  requireSession(window.location.pathname);
  loadProfile(window.location.pathname === '/login.html');
  bindLogin();
  bindProfileLogout();
  bindEventForm();
  bindMemoryForm();
  bindBlogForm();
  bindDateForms();
  bindSpecialDaysForm();
  bindFavoritesForm();
  bindProfileForm();
  loadEvents();
  loadMemories();
  loadBlog();
  loadDates();
  loadSpecialDays();
  loadFavorites();
  loadBabluPage();
  loadInterstellarQuote();
}

document.addEventListener('DOMContentLoaded', init);
