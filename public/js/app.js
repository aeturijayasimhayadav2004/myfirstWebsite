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

function bindLogout() {
  const buttons = document.querySelectorAll('.logout-btn');
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      await apiRequest('/api/session/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
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
        (m) => `<div><img src="/uploads/${m.filename}" alt="${m.originalname}"><div class="muted">${
          new Date(m.uploaded_at).toLocaleString()
        }</div><button class="btn delete-memory" data-id="${m.id}">Delete</button></div>`
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
          (idea) => `<li><div class="tag">${idea.status}</div><strong>${idea.title}</strong><p class="muted">${
            idea.notes || ''
          }</p><button class="btn delete-idea" data-id="${idea.id}">Delete</button></li>`
        )
        .join('');
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
          (item) => `<li><label><input type="checkbox" data-id="${item.id}" ${
            item.completed ? 'checked' : ''
          } /> ${item.title}</label> <button class="btn delete-bucket" data-id="${item.id}">Delete</button></li>`
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
  if (!list) return;
  try {
    const days = await apiRequest('/api/special-days');
    list.innerHTML = days
      .map((d) => {
        const diff = Math.round((new Date(d.event_date) - new Date()) / (1000 * 60 * 60 * 24));
        const countdown = diff >= 0 ? `${diff} days away` : 'Already celebrated';
        return `<li><strong>${d.title}</strong><div class="muted">${new Date(d.event_date).toDateString()} · ${countdown}</div><p>${
          d.description || ''
        }</p><button class="btn delete-special" data-id="${d.id}">Delete</button></li>`;
      })
      .join('');
    list.querySelectorAll('.delete-special').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/api/special-days/${btn.dataset.id}`, { method: 'DELETE' });
        loadSpecialDays();
      });
    });
  } catch (err) {
    list.innerHTML = '<li class="muted">Unable to load dates</li>';
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

async function loadNotes() {
  const list = document.getElementById('notesList');
  if (!list) return;
  try {
    const notes = await apiRequest('/api/notes');
    list.innerHTML = notes
      .map(
        (n) => `<li><div class="muted">${n.author} · ${new Date(n.created_at).toLocaleString()}</div><p>${
          n.body
        }</p><button class="btn delete-note" data-id="${n.id}">Delete</button></li>`
      )
      .join('');
    list.querySelectorAll('.delete-note').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/api/notes/${btn.dataset.id}`, { method: 'DELETE' });
        loadNotes();
      });
    });
  } catch (err) {
    list.innerHTML = '<li class="muted">Login to see notes.</li>';
  }
}

async function loadFavorites() {
  const list = document.getElementById('favoritesList');
  if (!list) return;
  try {
    const entries = await apiRequest('/api/favorites');
    list.innerHTML = entries
      .map((f) => {
        const songFile = f.songUpload ? `<a href="/uploads/${f.songUpload.filename}" download>Download song</a>` : '';
        const movieFile = f.movieUpload ? `<a href="/uploads/${f.movieUpload.filename}" download>Download movie file</a>` : '';
        return `<li><div class="muted">Week of ${f.weekOf}</div><strong>Song:</strong> ${f.song || '—'}<br/><strong>Movie:</strong> ${
          f.movie || '—'
        }<p class="muted">${f.notes || ''}</p><div class="pill-row">${songFile} ${movieFile}</div><button class="btn delete-favorite" data-id="${
          f.id
        }">Delete</button></li>`;
      })
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
    const songFile = form.songFile.files[0];
    const movieFile = form.movieFile.files[0];
    if (songFile) {
      payload.songFile = { name: songFile.name, type: songFile.type, data: await fileToBase64(songFile) };
    }
    if (movieFile) {
      payload.movieFile = { name: movieFile.name, type: movieFile.type, data: await fileToBase64(movieFile) };
    }
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

function bindNotesForm() {
  const form = document.getElementById('noteForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      await apiRequest('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      form.reset();
      loadNotes();
    } catch (err) {
      alert('Login to add notes.');
    }
  });
}

async function loadFunZone() {
  const wheel = document.getElementById('funWheel');
  const quiz = document.getElementById('funQuiz');
  const polls = document.getElementById('funPolls');
  if (!wheel && !quiz && !polls) return;
  try {
    const data = await apiRequest('/api/fun');
    if (wheel) {
      wheel.innerHTML = data.wheel.map((i) => `<li>${i.idea}</li>`).join('');
    }
    if (quiz) {
      quiz.innerHTML = data.quiz
        .map((q) => `<li><strong>${q.question}</strong><div class="muted">Answer: ${q.answer}</div></li>`)
        .join('');
    }
    if (polls) {
      polls.innerHTML = data.polls
        .map(
          (p) => `<li><strong>${p.prompt}</strong><div>${p.options
            .map(
              (o) => `<button class="btn vote" data-poll="${p.id}" data-option="${o.id}">${o.option_text} (${o.votes})</button>`
            )
            .join(' ')}</div></li>`
        )
        .join('');
      polls.querySelectorAll('.vote').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await apiRequest(`/api/fun/polls/${btn.dataset.poll}/vote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ optionId: btn.dataset.option }),
            });
            loadFunZone();
          } catch (err) {
            alert('Login to vote.');
          }
        });
      });
    }
  } catch (err) {
    if (wheel) wheel.innerHTML = '<li class="muted">Unable to load fun ideas</li>';
  }
}

function init() {
  requireSession(window.location.pathname);
  bindLogin();
  bindLogout();
  bindEventForm();
  bindMemoryForm();
  bindBlogForm();
  bindDateForms();
  bindSpecialDaysForm();
  bindNotesForm();
  bindFavoritesForm();
  loadEvents();
  loadMemories();
  loadBlog();
  loadDates();
  loadSpecialDays();
  loadNotes();
  loadFunZone();
  loadFavorites();
}

document.addEventListener('DOMContentLoaded', init);
