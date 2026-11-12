<script lang="ts">
  // ---------- A. Imports ----------
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { ppi, loadPpi, savePpi } from './ppi';
  import cardArt from '$lib/assets/card.svg';
  import coinArt from '$lib/assets/coin.svg';
  import bananaArt from '$lib/assets/banana.svg';
  import {OBJECTS, MM_PER_INCH, MIN_PPI, MAX_PPI,
          mmToInches, diagonalInches, ppiFromManual, ppiFromObject,
          isPlausible, round1, makeRuler
  }from './calibrationMath';
  import type { Unit, SizeMode } from './calibrationMath';

let mode = $state<'manual' | 'object'>('manual');
let done = $state(false);
let error = $state('');
let pixelRatio = $state(1);

// manual tab
let unit = $state<Unit>('in');
let sizeMode = $state<SizeMode>('diagonal');
let diagonal = $state<number | null>(null);
let physWidth = $state<number | null>(null);
let physHeight = $state<number | null>(null);
let resWidth = $state<number | null>(null);
let resHeight = $state<number | null>(null);

  
// objects tab
let selectedId = $state(OBJECTS[0].id);
let pxWidth = $state(Math.round(mmToInches(OBJECTS[0].widthMm) * 96));
const ART: Record<string, string> = {
  card: cardArt, eur1: coinArt, eur2: coinArt, banana: bananaArt
};


let manualPpi = $derived(ppiFromManual(
  diagonalInches(sizeMode, unit, diagonal, physWidth, physHeight),
  resWidth, resHeight, pixelRatio
));

let selected = $derived(OBJECTS.find((o) => o.id === selectedId) ?? OBJECTS[0]);
let widthInches = $derived(mmToInches(selected.widthMm));
let minPx = $derived(Math.round(widthInches * MIN_PPI));   
let maxPx = $derived(Math.round(widthInches * MAX_PPI));   
let pxHeight = $derived(pxWidth * (selected.heightMm / selected.widthMm));
let objectPpi = $derived(ppiFromObject(pxWidth, selected.widthMm));

$effect(() => {
  pxWidth = Math.round(widthInches * 96);
});

//ruler
let savedPpi = $derived($ppi ?? 0);
let mmTicks = $derived(makeRuler(50, savedPpi / MM_PER_INCH, 10, 5)); // 5 cm, a line every mm
let inchTicks = $derived(makeRuler(16, savedPpi / 8, 8, 4));          // 2 inch, a line every 1/8
let cmRulerWidth = $derived((savedPpi / MM_PER_INCH) * 50);
let inchRulerWidth = $derived(savedPpi * 2);


  // ---------- actions -----
  function nudge(amount: number) {
  
    pxWidth = Math.min(maxPx, Math.max(minPx, pxWidth + amount));
  }

  function saveCalibration(value: number | null) {
    if (!isPlausible(value)) {
      error = `Really??? (expected ${MIN_PPI} to ${MAX_PPI} PPI). Check the numbers and try again.`;
      return;
    }
    error = '';
    savePpi(round1(value));
    done = true;
  }

  // ---------- setup ----------
  onMount(() => {
    pixelRatio = window.devicePixelRatio || 1;
    
    resWidth = Math.round(window.screen.width * pixelRatio);
    resHeight = Math.round(window.screen.height * pixelRatio);

    loadPpi();                  // load an earlier calibration, if any
    done = get(ppi) !== null;   // then jump straight to the result
  });
</script>



<!-- ======================= markup ============================ -->
<section class="calibration">
  {#if done && $ppi}
    <!-- ---------- result + ruler ---------- -->
    <div class="saved-view">
      <h2>Calibration saved</h2>
      <p class="result">
        <strong>{$ppi}</strong> pixels per inch
        <span class="muted">({round1($ppi / 2.54)} per cm)</span>
      </p>

      <p>Hold a real ruler against the screen. If the rulers below match, you are done.</p>

      <p class="label">5 cm</p>
      <div class="ruler-scroll">
        <div class="ruler" style="width:{cmRulerWidth}px">
          {#each mmTicks as t}
            <span class="tick {t.size}" style="left:{t.x}px"></span>
            {#if t.label !== ''}<span class="num" style="left:{t.x}px">{t.label}</span>{/if}
          {/each}
        </div>
      </div>

      <p class="label">2 inch</p>
      <div class="ruler-scroll">
        <div class="ruler" style="width:{inchRulerWidth}px">
          {#each inchTicks as t}
            <span class="tick {t.size}" style="left:{t.x}px"></span>
            {#if t.label !== ''}<span class="num" style="left:{t.x}px">{t.label}</span>{/if}
          {/each}
        </div>
      </div>

      <p class="muted">
        Keep browser zoom at 100%. If you zoom, resize the window to a new
        display, or switch screens, calibrate again.
      </p>
      <button class="primary" onclick={() => (done = false)}>Calibrate again</button>
    </div>

  {:else}
    <header class="top-header">
     
      <div class="header-top">
        <div class="title-group">
          <h2>Calibrate your screen</h2>
          <p class="zoom-note">Set the browser zoom to 100% first (Ctrl/Cmd + 0).</p>
        </div>

        {#if mode === 'object'}
          <p class="instructions">
            Pick an object you have at hand.<br />
            Hold it flat against the screen.
          </p>
        {/if}
      </div>

      <!-- tabs -->
      <div class="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'manual'}
          class:active={mode === 'manual'}
          onclick={() => (mode = 'manual')}
        >
          Type the screen size
        </button>
        <button
          role="tab"
          aria-selected={mode === 'object'}
          class:active={mode === 'object'}
          onclick={() => (mode = 'object')}
        >
          Match a real object
        </button>
      </div>
    </header>

    {#if mode === 'manual'}
      <!-- ----- manual ----- -->
      <div class="row">
        <label>Units
          <select bind:value={unit}>
            <option value="in">inches</option>
            <option value="cm">centimetres</option>
          </select>
        </label>
        <label>I know the
          <select bind:value={sizeMode}>
            <option value="diagonal">diagonal</option>
            <option value="widthHeight">width and height</option>
          </select>
        </label>
      </div>

      {#if sizeMode === 'diagonal'}
        <label>Diagonal ({unit})
          <input type="number" min="0" step="0.1" bind:value={diagonal} placeholder="e.g. 15.6" />
        </label>
      {:else}
        <div class="row">
          <label>Width ({unit})
            <input type="number" min="0" step="0.1" bind:value={physWidth} />
          </label>
          <label>Height ({unit})
            <input type="number" min="0" step="0.1" bind:value={physHeight} />
          </label>
        </div>
      {/if}

      <div class="row">
        <label>Resolution width (px)
          <input type="number" min="0" step="1" bind:value={resWidth} />
        </label>
        <label>Resolution height (px)
          <input type="number" min="0" step="1" bind:value={resHeight} />
        </label>
      </div>
      <p class="muted">The resolution is filled in from your browser. Change it only if you know the real value.</p>

      {#if manualPpi}
        <p class="result"><strong>{round1(manualPpi)}</strong> pixels per inch</p>
      {/if}
      <button class="primary" disabled={manualPpi === null} onclick={() => saveCalibration(manualPpi)}>
        Save
      </button>

    {:else}
        <!-- ----- object mode ----- -->
      <label>Reference object
        <select bind:value={selectedId}>
          {#each OBJECTS as o}
            <option value={o.id}>
              {o.name} ({o.widthMm} × {o.heightMm} mm, {round1(mmToInches(o.widthMm))} × {round1(mmToInches(o.heightMm))} in)
            </option>
          {/each}
        </select>
      </label>

      <div class="scroll stage">
        {#if ART[selected.id] === bananaArt}
          <img class="art" src={ART[selected.id]} alt="" style="width:{pxWidth}px" />
        {:else}
          <div class="box" class:round={selected.round}
            style="width:{pxWidth}px; height:{pxHeight}px"></div>
        {/if}
      </div>

      <button class="primary" onclick={() => saveCalibration(objectPpi)}>Save</button>

      <footer class="bottom-slider">
      <div class="slider-row">
        <button type="button" aria-label="Smaller by 1 pixel" onclick={() => nudge(-1)}>−</button>
        <input
          type="range"
          min={minPx}
          max={maxPx}
          step="1"
          bind:value={pxWidth}
          aria-label="Box width in pixels"
        />
        <button type="button" aria-label="Larger by 1 pixel" onclick={() => nudge(1)}>+</button>
      </div>
    </footer>
    {/if}

    

    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {/if}
</section>

<!-- ============================ style ============================ -->
<style>
  /* container */
  .calibration {
    position: relative;
    width: 100%;
    height: 100%;
    margin: 0 auto;
    padding: 1rem 2rem 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    overflow: hidden;
  }

  /* header */
  .top-header {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 28rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .header-top {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 500;
  }

  p {
    margin: 0.25rem 0;
  }

  .zoom-note {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
    opacity: 0.85;
  }

  .instructions {
    margin: 0.25rem 0 0;
    font-size: 1rem;
    line-height: 1.4;
  }

  /* tabs */
  .tabs {
    display: flex;
    gap: 1.25rem;
    margin: 0.5rem 0;
  }

  .tabs button {
    flex: none;
    white-space: nowrap;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: inherit;
    font: inherit;
    font-size: 0.95rem;
    min-height: 40px;
    padding: 0.45rem 0.25rem;
    cursor: pointer;
    text-align: left;
  }

  .tabs button.active {
    font-weight: 700;
    border-bottom-color: #2f6fdb;
  }

  /* inputs, rows & primary */
  .row {
    position: relative;
    z-index: 10;
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    width: 100%;
    max-width: 28rem;
  }

  .row > label {
    flex: 1 1 9rem;
  }

  label {
    position: relative;
    z-index: 10;
    display: block;
    width: 100%;
    max-width: 28rem;
    margin-bottom: 0.5rem;
  }

  input,
  select {
    display: block;
    width: 100%;
    max-width: none;
    margin-top: 0.25rem;
    padding: 0.5rem;
    box-sizing: border-box;
    font: inherit;
  }

  button {
    font: inherit;
    padding: 0.6rem 1rem;
    min-height: 44px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 3px solid #2f6fdb;
    outline-offset: 2px;
  }

  .primary {
    position: relative;
    z-index: 10;
    align-self: flex-start;
    margin-top: 0.25rem;
    padding: 0.55rem 1.25rem;
    background: #3178f3;
    color: #ffffff;
    border: none;
    border-radius: 0.375rem;
    font-weight: 600;
  }

  .primary:hover:not(:disabled) {
    background: #2558b5;
  }

  /* object stage */
  .stage {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .box {
    border: 2px solid currentColor;
    background: rgba(128, 128, 128, 0.15);
    box-sizing: border-box;
    flex: none;
  }

  .box.round {
    border-radius: 50%;
  }

  .art {
    display: block;
    flex: none;
    height: auto;
    max-width: none;
  }

  /*  slider */
  .bottom-slider {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 72rem;
    margin-top: auto;
    align-self: center;
    padding-bottom: 4vh;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
  }

  .slider-row input {
    flex: 1;
    margin: 0;
    padding: 0;
    cursor: pointer;
  }

  .slider-row button {
    width: 40px;
    height: 40px;
    min-height: 40px;
    padding: 0;
    background: transparent;
    border: none;
    color: inherit;
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ruler and other util */
  .muted {
    position: relative;
    z-index: 10;
    opacity: 0.7;
    font-size: 0.9rem;
  }

  .result {
    position: relative;
    z-index: 10;
    font-size: 1.2rem;
  }

  .error {
    position: relative;
    z-index: 10;
    color: #f87171;
  }

  .scroll {
    overflow-x: auto;
    padding: 1rem 12px;
  }

  .label {
    margin: 1rem 0 0;
    font-weight: 600;
  }

  .ruler {
    position: relative;
    height: 3rem;
    border-top: 1px solid currentColor;
    flex: none;
  }

  .tick {
    position: absolute;
    top: 0;
    width: 1px;
    background: currentColor;
  }

  .tick.major {
    height: 18px;
  }

  .tick.mid {
    height: 12px;
  }

  .tick.minor {
    height: 7px;
  }

  .num {
    position: absolute;
    top: 20px;
    transform: translateX(-50%);
    font-size: 0.75rem;
  }
</style>
