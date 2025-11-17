async function apiRequest(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Request failed');
  }
  return res.json();
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
      status.textContent = 'Welcome back!';
      status.classList.remove('muted');
      form.reset();
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
      window.location.href = '/index.html';
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
        }</p></li>`
      )
      .join('');
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
    const file = form.file.files[0];
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
        (p) => `<li><h3>${p.title}</h3><div class="muted">${p.author} · ${new Date(p.created_at).toDateString()}</div><p>${
          p.body
        }</p></li>`
      )
      .join('');
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
          }</p></li>`
        )
        .join('');
    }
    if (bucketContainer) {
      bucketContainer.innerHTML = bucket
        .map(
          (item) => `<li><label><input type="checkbox" data-id="${item.id}" ${
            item.completed ? 'checked' : ''
          } /> ${item.title}</label></li>`
        )
        .join('');
      bucketContainer.querySelectorAll('input[type="checkbox"]').forEach((box) => {
        box.addEventListener('change', async () => {
          await apiRequest(`/api/dates/bucket/${box.dataset.id}/toggle`, { method: 'PUT' });
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
        }</p></li>`;
      })
      .join('');
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
  bindLogin();
  bindLogout();
  bindEventForm();
  bindMemoryForm();
  bindBlogForm();
  bindDateForms();
  bindSpecialDaysForm();
  bindNotesForm();
  loadEvents();
  loadMemories();
  loadBlog();
  loadDates();
  loadSpecialDays();
  loadNotes();
  loadFunZone();
}

document.addEventListener('DOMContentLoaded', init);
