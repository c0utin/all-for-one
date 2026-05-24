<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { api } from '../lib/api.js';

  export let selected = null;

  const dispatch = createEventDispatcher();

  let viewDate = (() => { const d = new Date(); d.setDate(1); return d; })();
  let counts = {};
  let loading = true;

  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  async function load() {
    loading = true;
    try {
      const rows = await api.calendar(186);
      counts = Object.fromEntries(rows.map(r => [r.day, Number(r.n)]));
    } finally { loading = false; }
  }
  onMount(load);

  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  $: monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  $: cells = (() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const first = new Date(y, m, 1);
    const last  = new Date(y, m + 1, 0);
    const pad = first.getDay();
    const out = [];
    for (let i = 0; i < pad; i++) out.push(null);
    for (let d = 1; d <= last.getDate(); d++) out.push(new Date(y, m, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  })();

  const todayKey = ymd(new Date());

  function prev()  { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1); }
  function next()  { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1); }
  function today() { const d = new Date(); d.setDate(1); viewDate = d; }

  function pickDay(d) {
    const k = ymd(d);
    dispatch('pickDay', selected === k ? null : k);
  }
</script>

<div class="cal-nav">
  <button type="button" on:click={prev}>‹ prev</button>
  <span class="cal-title">{monthLabel}</span>
  <button type="button" on:click={today}>today</button>
  <button type="button" on:click={next}>next ›</button>
</div>

<div class="cal-grid">
  {#each DOW as d}
    <div class="cal-head">{d}</div>
  {/each}
  {#each cells as d}
    {#if d == null}
      <div class="cal-cell pad"></div>
    {:else}
      {@const k = ymd(d)}
      {@const n = counts[k] || 0}
      <button type="button"
              class="cal-cell"
              class:has={n > 0}
              class:today={k === todayKey}
              class:selected={selected === k}
              on:click={() => pickDay(d)}
              title="{k}: {n} {n === 1 ? 'entry' : 'entries'}">
        <span class="cal-day">{d.getDate()}</span>
        {#if n > 0}<span class="cal-count">{n}</span>{/if}
      </button>
    {/if}
  {/each}
</div>
