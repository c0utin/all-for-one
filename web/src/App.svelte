<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './lib/api.js';
  import Calendar from './components/Calendar.svelte';

  const AUTH_KEY = 'afo_auth';
  const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || '';
  let authenticated = false;
  let password = '';
  let loginError = '';

  let entries     = [];
  let resources   = [];
  let topics      = [];
  let allContents = [];
  let toast       = '';
  let calKey      = 0;

  let activeTopic = null;
  let activeDate  = null;

  let logText    = '';
  let logTopic   = '';
  let logContent = '';

  let resKind    = 'book';
  let resName    = '';
  let resTopic   = '';
  let resContent = '';
  let resUnit    = '';
  let resTotal   = '';

  async function loadAll() {
    try {
      const [e, r, t, c] = await Promise.all([
        api.entries({ topic: activeTopic, date: activeDate, limit: activeDate ? 200 : 30 }),
        api.resources(),
        api.topics(),
        api.contents(),
      ]);
      entries     = e;
      resources   = r;
      topics      = t;
      allContents = c;
      calKey++;
    } catch (err) {
      pop('error loading: ' + err.message);
    }
  }

  let timer;
  onMount(() => {
    authenticated = sessionStorage.getItem(AUTH_KEY) === '1';
    if (authenticated) {
      loadAll();
      timer = setInterval(loadAll, 30000);
    }
  });
  onDestroy(() => clearInterval(timer));

  function login() {
    if (password === APP_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, '1');
      authenticated = true;
      loginError = '';
      loadAll();
      timer = setInterval(loadAll, 30000);
    } else {
      loginError = 'wrong password';
    }
  }

  function logout() {
    sessionStorage.removeItem(AUTH_KEY);
    authenticated = false;
    password = '';
    clearInterval(timer);
  }

  function pop(msg) {
    toast = msg;
    setTimeout(() => { if (toast === msg) toast = ''; }, 2600);
  }

  $: logContentList = allContents
    .filter(c => !logTopic || c.topic === logTopic)
    .map(c => c.content);

  $: resContentList = allContents
    .filter(c => !resTopic || c.topic === resTopic)
    .map(c => c.content);

  async function submitLog() {
    const text = logText.trim();
    if (!text) return;
    try {
      await api.addEntry({
        text,
        topic:   logTopic.trim()   || null,
        content: logContent.trim() || null,
      });
      logText = '';
      pop('logged');
      await loadAll();
    } catch (err) { pop('error: ' + err.message); }
  }

  async function submitResource() {
    if (!resName.trim() || !resTopic.trim()) return;
    try {
      await api.addResource({
        kind:    resKind,
        name:    resName.trim(),
        topic:   resTopic.trim(),
        content: resContent.trim() || null,
        unit:    resUnit.trim()    || null,
        total:   resTotal === '' ? null : Number(resTotal),
      });
      resName = ''; resContent = ''; resUnit = ''; resTotal = '';
      pop('resource added');
      await loadAll();
    } catch (err) { pop('error: ' + err.message); }
  }

  async function updatePosition(r, value) {
    const pos = Math.max(0, parseInt(value, 10) || 0);
    if (pos === r.position) return;
    try {
      await api.updateResource(r.id, { position: pos, status: 'active' });
      await loadAll();
    } catch (err) { pop('error: ' + err.message); }
  }

  async function markDone(r) {
    if (!confirm(`mark "${r.name}" as done?`)) return;
    try {
      await api.updateResource(r.id, { status: 'done' });
      pop('done: ' + r.name);
      await loadAll();
    } catch (err) { pop('error: ' + err.message); }
  }

  async function removeResource(r) {
    if (!confirm(`delete resource "${r.name}"? (entries are kept)`)) return;
    try {
      await api.deleteResource(r.id);
      pop('deleted');
      await loadAll();
    } catch (err) { pop('error: ' + err.message); }
  }

  async function pickTopic(t) {
    activeTopic = (activeTopic === t) ? null : t;
    await loadAll();
  }

  async function pickDay(e) {
    activeDate = e.detail;
    await loadAll();
  }

  async function clearDate() {
    activeDate = null;
    await loadAll();
  }

  function fmt(ts) { return (ts || '').replace('T', ' ').slice(0, 16); }

  function trackLabel(r) {
    const u = r.unit ? ' ' + r.unit : '';
    if (r.total)    return `${r.position}/${r.total}${u}`;
    if (r.position) return `${r.position}${u}`;
    return r.unit ? `0${u}` : '-';
  }

  function pct(r) {
    if (!r.total) return r.status === 'done' ? 100 : 0;
    return Math.min(100, Math.round(100 * (r.position || 0) / r.total));
  }
</script>

{#if !authenticated}
<main class="login">
  <h1>all-for-one</h1>
  <form on:submit|preventDefault={login}>
    <input
      type="password"
      bind:value={password}
      placeholder="password"
      autocomplete="current-password"
    />
    {#if loginError}<p class="error">{loginError}</p>{/if}
    <button type="submit">enter</button>
  </form>
</main>
{:else}
<main>
  <h1>all-for-one <button class="logout" on:click={logout}>logout</button></h1>

  <section>
    <h2>log entry</h2>
    <form on:submit|preventDefault={submitLog}>
      <textarea bind:value={logText} placeholder="what did you study, read, watch, finish?" rows="2"></textarea>
      <div class="row">
        <input list="log-topic-options"   bind:value={logTopic}   placeholder="topic (pick or type new)" />
        <input list="log-content-options" bind:value={logContent} placeholder="content (optional)" />
      </div>
      <datalist id="log-topic-options">
        {#each topics as t}<option value={t.topic}></option>{/each}
      </datalist>
      <datalist id="log-content-options">
        {#each logContentList as c}<option value={c}></option>{/each}
      </datalist>
      <button type="submit" disabled={!logText.trim()}>log</button>
    </form>
  </section>

  <section>
    <h2>calendar</h2>
    {#key calKey}<Calendar selected={activeDate} on:pickDay={pickDay} />{/key}
  </section>

  <section>
    <h2>resources ({resources.length})</h2>
    {#if resources.length === 0}
      <p class="empty">no resources yet — add one below</p>
    {:else}
      {#each resources as r (r.id)}
        <div class="item">
          <div class="item-head">
            <strong>{r.name}</strong>
            <span class="meta">
              {r.kind} · {r.topic}{r.content ? ' › ' + r.content : ''} · {r.status}
            </span>
          </div>
          <div class="meta">track: {trackLabel(r)}{r.total ? ` · ${pct(r)}%` : ''}</div>
          {#if r.total}
            <div class="bar"><div style="width:{pct(r)}%"></div></div>
          {/if}
          <div class="item-controls">
            {#if r.status !== 'done'}
              <label for="pos-{r.id}" style="margin:0;">{r.unit || 'position'}</label>
              <input id="pos-{r.id}" type="number" min="0" max={r.total || undefined} value={r.position}
                     on:change={(e) => updatePosition(r, e.target.value)} />
              <button on:click={() => markDone(r)}>done</button>
            {/if}
            <button on:click={() => removeResource(r)}>delete</button>
          </div>
        </div>
      {/each}
    {/if}
  </section>

  <section>
    <h2>topics</h2>
    {#if topics.length === 0}
      <p class="empty">no topics yet — add one in a log entry or resource</p>
    {:else}
      <div class="topic-list">
        <button on:click={() => pickTopic(null)} class:active={activeTopic === null}>all</button>
        {#each topics as t}
          <button on:click={() => pickTopic(t.topic)} class:active={activeTopic === t.topic}>
            #{t.topic} ({t.n})
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <h2>
      changelog{activeTopic ? ` · #${activeTopic}` : ''}{activeDate ? ` · ${activeDate}` : ''}
      {#if activeDate || activeTopic}
        <button on:click={() => { activeTopic = null; activeDate = null; loadAll(); }}
                style="margin-left:6px; padding:1px 8px; font-size:11px;">clear</button>
      {/if}
    </h2>
    {#if entries.length === 0}
      <p class="empty">nothing logged{activeDate ? ` on ${activeDate}` : ''}{activeTopic ? ` for #${activeTopic}` : ''}</p>
    {:else}
      {#each entries as e (e.id)}
        <div class="entry">
          <small>
            {fmt(e.ts)} · {e.kind}
            {e.topic   ? ' · #' + e.topic : ''}
            {e.content ? ' › ' + e.content : ''}
            {e.resource_name ? ' [' + e.resource_kind + ': ' + e.resource_name + ']' : ''}
          </small>
          {#if e.text}<div>{e.text}</div>{/if}
        </div>
      {/each}
    {/if}
  </section>

  <section>
    <h2>add resource</h2>
    <form on:submit|preventDefault={submitResource}>
      <div class="row">
        <select bind:value={resKind}>
          <option>book</option>
          <option>video</option>
          <option>course</option>
          <option>article</option>
          <option>paper</option>
          <option>podcast</option>
          <option>playlist</option>
          <option>tutorial</option>
          <option>other</option>
        </select>
        <input bind:value={resName} placeholder="name (e.g. CLRS, MIT 6.006)" />
      </div>
      <div class="row">
        <input list="res-topic-options"   bind:value={resTopic}   placeholder="topic *" />
        <input list="res-content-options" bind:value={resContent} placeholder="content (subtopic)" />
      </div>
      <datalist id="res-topic-options">
        {#each topics as t}<option value={t.topic}></option>{/each}
      </datalist>
      <datalist id="res-content-options">
        {#each resContentList as c}<option value={c}></option>{/each}
      </datalist>
      <div class="row">
        <input bind:value={resUnit}  placeholder="unit (page, min, ch, lesson, ...)" />
        <input bind:value={resTotal} type="number" min="0" placeholder="total (optional)" />
      </div>
      <button type="submit" disabled={!resName.trim() || !resTopic.trim()}>add</button>
    </form>
  </section>

  <section class="actions">
    <a class="download" href={api.exportUrl()} download>download export (json)</a>
  </section>
</main>
{/if}

{#if toast}<div class="toast">{toast}</div>{/if}
