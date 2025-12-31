function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return [...root.querySelectorAll(sel)]; }

function setAccentFromBody(){
  const accent = document.body.dataset.accent || "research";
  document.documentElement.style.setProperty("--page", accent);
}

function prefersReducedMotion(){
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Spotlight follows cursor
function initSpotlight(){
  if (prefersReducedMotion()) return;
  const root = document.documentElement;
  window.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    root.style.setProperty('--sx', x + '%');
    root.style.setProperty('--sy', y + '%');
  }, { passive: true });
}

// Nav active state
function initNavActive(){
  const links = $all('.navlinks a');
  if (!links.length) return;

  // exact page highlight
  const path = location.pathname.split('/').pop() || 'index.html';
  links.forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    const h = href.split('#')[0].replace('./','');
    if (h === path || (path === '' && h === 'index.html')) a.classList.add('is-active');
  });

  // section highlight for same-page anchors
  const anchors = links.filter(a => (a.getAttribute('href')||'').includes('#'));
  const sections = anchors
    .map(a => document.querySelector((a.getAttribute('href')||'').split('#')[1] ? '#'+(a.getAttribute('href').split('#')[1]) : null))
    .filter(Boolean);

  if (!sections.length) return;

  const linkById = new Map();
  anchors.forEach(a => {
    const id = (a.getAttribute('href')||'').split('#')[1];
    if (id) linkById.set(id, a);
  });

  const setActive = (id) => {
    anchors.forEach(a => a.classList.remove('is-active'));
    const a = linkById.get(id);
    if (a) a.classList.add('is-active');
  };

  const obs = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setActive(visible.target.id);
  }, { rootMargin: "-40% 0px -55% 0px", threshold: [0.1, 0.2, 0.35, 0.5] });

  sections.forEach(s => obs.observe(s));
  setActive(sections[0].id);
}

// Modal
const Modal = (() => {
  let backdrop, modal;

  function ensure(){
    backdrop = $('#modal-backdrop');
    modal = $('#modal');
    if (backdrop && modal) return;

    const b = document.createElement('div');
    b.id = 'modal-backdrop';
    b.className = 'modal-backdrop';
    b.addEventListener('click', close);

    const m = document.createElement('div');
    m.id = 'modal';
    m.className = 'modal';
    m.innerHTML = `
      <div class="mhead">
        <div class="mtitle" id="m-title"></div>
        <div class="msub" id="m-sub"></div>
      </div>
      <div class="mbody">
        <div class="mgrid" id="m-grid"></div>
      </div>
      <div class="mfoot" id="m-foot">
        <button class="close" id="m-close" type="button">Close</button>
      </div>
    `;
    document.body.appendChild(b);
    document.body.appendChild(m);
    backdrop = b; modal = m;

    $('#m-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  function open(payload){
    ensure();
    $('#m-title').textContent = payload.title || '';
    $('#m-sub').textContent = payload.subtitle || '';

    const grid = $('#m-grid');
    grid.innerHTML = '';

    const blocks = payload.blocks || [];
    blocks.forEach(bl => {
      const el = document.createElement('div');
      el.className = 'block';
      el.innerHTML = `
        <h4>${escapeHtml(bl.heading || '')}</h4>
        <ul>${(bl.bullets || []).map(li => `<li>${escapeHtml(li)}</li>`).join('')}</ul>
      `;
      grid.appendChild(el);
    });

    const foot = $('#m-foot');
    // remove old links (keep close button)
    $all('#m-foot a').forEach(a => a.remove());

    (payload.links || []).forEach(l => {
      const a = document.createElement('a');
      a.className = 'btn';
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.href = l.href;
      a.textContent = l.label;
      foot.insertBefore(a, $('#m-close'));
    });

    backdrop.classList.add('open');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close(){
    if (!backdrop || !modal) return;
    backdrop.classList.remove('open');
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  return { open, close };
})();

// Content loading
async function loadContent(){
  const res = await fetch('./assets/data/content.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load content.json');
  return res.json();
}

// Render cards into a container
function renderCards(containerId, items){
  const root = document.getElementById(containerId);
  if (!root) return;

  root.innerHTML = items.map((it) => {
    const links = (it.links || []).map(l => `<a href="${l.href}" target="_blank" rel="noreferrer">${l.label}</a>`).join('');
    const tags = (it.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
    return `
      <div class="card" role="button" tabindex="0" data-modal-id="${it.id}">
        <div class="row">
          <div class="title">${it.title}</div>
          <div class="meta">${it.meta || ''}</div>
        </div>
        <div class="desc">${it.blurb || ''}</div>
        ${tags ? `<div class="tags">${tags}</div>` : ``}
        ${links ? `<div class="links">${links}</div>` : ``}
      </div>
    `;
  }).join('');

  // click + keyboard open modal
  const cards = $all(`#${containerId} .card`);
  cards.forEach(c => {
    const open = () => {
      const id = c.dataset.modalId;
      const item = items.find(x => x.id === id);
      if (!item) return;
      Modal.open({
        title: item.title,
        subtitle: item.modal?.subtitle || item.blurb || '',
        blocks: item.modal?.blocks || [],
        links: item.links || []
      });
    };
    c.addEventListener('click', open);
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

(function () {
  const tabs = document.getElementById('tagTabs');
  const out  = document.getElementById('tagStats');
  if (!tabs || !out) return;

  // EDIT THESE to your real numbers (do not lie)
  const DATA = {
    open: [
      { k: "Open outputs", v: "X repos / datasets" },
      { k: "Reusable workflows", v: "X pipelines" },
      { k: "Documentation", v: "X pages" }
    ],
    ml: [
      { k: "Publications", v: "X" },
      { k: "Datasets", v: "X" },
      { k: "Models / tools", v: "X" }
    ],
    stereo: [
      { k: "Subjects analyzed", v: "X" },
      { k: "QC checks", v: "X metrics" },
      { k: "Landmarks / fiducials", v: "X" }
    ],
    access: [
      { k: "Learners reached", v: "10,000+" },
      { k: "Podcast plays", v: "20,000+" },
      { k: "Funding supported", v: "$150,000+" }
    ]
  };

  function render(tagKey){
    const items = DATA[tagKey] || [];
    out.innerHTML = items.map(s => `
      <div class="statPill">
        <span class="k">${s.k}</span>
        <span class="v">${s.v}</span>
      </div>
    `).join("");
  }

  function setActive(btn){
    tabs.querySelectorAll('.tag').forEach(b => b.classList.remove('isActive'));
    btn.classList.add('isActive');
  }

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button.tag');
    if (!btn) return;
    const key = btn.getAttribute('data-tag');
    setActive(btn);
    render(key);
  });

  // init
  render('open');
})();

// Render metrics strip
function renderMetrics(containerId, metrics){
  const root = document.getElementById(containerId);
  if (!root) return;
  root.innerHTML = metrics.map(m => `
    <div class="metric">
      <strong>${m.value}</strong>
      <span>${m.label}</span>
    </div>
  `).join('');
}

// Publications filter
function initPubFilters(allPubs){
  const chipWrap = $('#pub-chips');
  const list = $('#pub-list');
  if (!chipWrap || !list) return;

  const topics = Array.from(new Set(allPubs.flatMap(p => p.topics || [])));
  const state = { on: new Set() };

  chipWrap.innerHTML = topics.map(t => `<div class="chip" data-topic="${t}">${t}</div>`).join('');

  function apply(){
    const selected = [...state.on];
    const filtered = selected.length
      ? allPubs.filter(p => selected.every(s => (p.topics || []).includes(s)))
      : allPubs;

    list.innerHTML = filtered.map(p => `
      <div class="card" role="button" tabindex="0" data-modal-id="${p.id}">
        <div class="row">
          <div class="title">${p.title}</div>
          <div class="meta">${p.venue || ''} ${p.year ? `(${p.year})` : ''}</div>
        </div>
        <div class="desc">${p.authors || ''}</div>
        ${(p.topics || []).length ? `<div class="tags">${p.topics.map(t=>`<span class="tag">${t}</span>`).join('')}</div>` : ``}
        ${(p.links || []).length ? `<div class="links">${p.links.map(l=>`<a href="${l.href}" target="_blank" rel="noreferrer">${l.label}</a>`).join('')}</div>` : ``}
      </div>
    `).join('');

    // bind modals
    $all('#pub-list .card').forEach(c => {
      const open = () => {
        const id = c.dataset.modalId;
        const item = filtered.find(x => x.id === id) || allPubs.find(x => x.id === id);
        if (!item) return;
        Modal.open({
          title: item.title,
          subtitle: item.abstractish || item.venue || '',
          blocks: item.modal?.blocks || [],
          links: item.links || []
        });
      };
      c.addEventListener('click', open);
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  chipWrap.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const t = chip.dataset.topic;
    if (state.on.has(t)) { state.on.delete(t); chip.classList.remove('is-on'); }
    else { state.on.add(t); chip.classList.add('is-on'); }
    apply();
  });

  apply();
}

// Init per page
async function init(){
  setAccentFromBody();
  initSpotlight();
  initNavActive();

  // Optional: typed/particles only if present on page
  if ($('#typed') && window.Typed && !prefersReducedMotion()){
    new Typed('#typed', {
      strings: [
        'I am a PhD-trained engineer pursuing my MD at Stanford.',
      ],
      typeSpeed: 42,
      backSpeed: 26,
      backDelay: 1800,
      loop: false
    });
  }

  if (document.body.dataset.particles === 'on' && window.particlesJS && !prefersReducedMotion()){
    particlesJS('particles-js', {
      particles: {
        number: { value: 50, density: { enable: true, value_area: 900 } },
        color: { value: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7cf7e6' },
        shape: { type: 'circle' },
        opacity: { value: 0.20, random: true },
        size: { value: 3.2, random: true },
        line_linked: { enable: true, distance: 165, opacity: 0.10, width: 1 },
        move: { enable: true, speed: 1.2, out_mode: 'out' }
      },
      interactivity: {
        events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' } },
        modes: { grab: { distance: 190, line_linked: { opacity: 0.18 } }, push: { particles_nb: 3 } }
      },
      retina_detect: true
    });
  }

  // content-driven sections
  const content = await loadContent();

  // metrics
  renderMetrics('metrics-home', content.home.metrics || []);
  renderMetrics('metrics-research', content.research.metrics || []);
  renderMetrics('metrics-leadership', content.leadership.metrics || []);

  // cards
  
  renderCards('cards-home', content.home.items || []);
  renderCards('cards-featured', content.home.featured || []);
  renderCards('cards-research-qc', content.research?.lanes?.qc || []);
  renderCards('cards-research-targeting', content.research?.lanes?.targeting || []);
  renderCards('cards-research-tools', content.research?.lanes?.tools || []);

  renderCards('cards-lead-education', content.leadership?.themes?.education || []);
  renderCards('cards-lead-access', content.leadership?.themes?.access || []);
  renderCards('cards-lead-community', content.leadership?.themes?.community || []);


  // publications page filters
  if ($('#pub-chips') && $('#pub-list')){
    initPubFilters(content.publications.items || []);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => console.error(err));
});
