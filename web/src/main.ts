import './style.css';
import Chart from 'chart.js/auto';

type RateName = 'Peak' | 'Mid-Peak' | 'Off-Peak';
const RATE_NAMES: RateName[] = ['Off-Peak', 'Mid-Peak', 'Peak'];

interface Rates {
  basePerDay: number;
  flat:       number;
  peak:       number;
  midPeak:    number;
  offPeak:    number;
}

function readRates(): Rates {
  const val = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement).value);
  return {
    basePerDay: val('r-base'),
    flat:       val('r-flat'),
    peak:       val('r-peak'),
    midPeak:    val('r-mid'),
    offPeak:    val('r-off'),
  };
}

// 0=Sun in JS
function classifyTOU(dayOfWeek: number, hour: number): RateName {
  if (hour < 6)                return 'Off-Peak';
  if (dayOfWeek === 0)         return 'Mid-Peak';   // Sunday
  if (hour >= 17 && hour < 21) return 'Peak';
  return                              'Mid-Peak';
}

// === Analysis ===

interface AnalysisResult {
  dates:      string[];
  dailyFlat:  number[];
  dailyTOU:   number[];
  bucketKwh:  Record<RateName, number>;
  bucketCost: Record<RateName, number>;
  hourlyKwh:  number[];
  totalKwh:   number;
  totalFlat:  number;
  totalTOU:   number;
}

function analyze(text: string, rates: Rates): AnalysisResult {
  const cleaned = text.startsWith('﻿') ? text.slice(1) : text;
  const lines = cleaned.split(/\r?\n/);

  const headerIdx = lines.findIndex(l => l.startsWith('TYPE,'));
  if (headerIdx < 0) throw new Error('Could not find CSV header row (expected line starting with "TYPE,")');

  const header   = lines[headerIdx].split(',').map(s => s.trim());
  const dateCol  = header.indexOf('DATE');
  const startCol = header.indexOf('START TIME');
  const kwhCol   = header.indexOf('IMPORT (kWh)');

  if (dateCol < 0 || startCol < 0 || kwhCol < 0) {
    throw new Error('CSV is missing required columns: DATE, START TIME, or IMPORT (kWh)');
  }

  const dailyMap  = new Map<string, { flat: number; tou: number }>();
  const bucketKwh:  Record<RateName, number> = { 'Peak': 0, 'Mid-Peak': 0, 'Off-Peak': 0 };
  const bucketCost: Record<RateName, number> = { 'Peak': 0, 'Mid-Peak': 0, 'Off-Peak': 0 };
  const hourlyKwh  = new Array<number>(24).fill(0);
  let totalKwh = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols     = line.split(',');
    const dateStr  = cols[dateCol]?.trim();
    const startStr = cols[startCol]?.trim();
    const kwh      = parseFloat(cols[kwhCol]?.trim() ?? '');

    if (!dateStr || !startStr || isNaN(kwh)) continue;

    const [yr, mo, dy] = dateStr.split('-').map(Number);
    const [hr]         = startStr.split(':').map(Number);
    const dt           = new Date(yr, mo - 1, dy, hr);

    const rateName = classifyTOU(dt.getDay(), hr);
    const touRate  = rateName === 'Peak' ? rates.peak
                   : rateName === 'Mid-Peak' ? rates.midPeak
                   : rates.offPeak;

    let day = dailyMap.get(dateStr);
    if (!day) { day = { flat: 0, tou: 0 }; dailyMap.set(dateStr, day); }
    day.flat += kwh * rates.flat;
    day.tou  += kwh * touRate;

    bucketKwh[rateName]  += kwh;
    bucketCost[rateName] += kwh * touRate;
    hourlyKwh[hr]        += kwh;
    totalKwh             += kwh;
  }

  if (dailyMap.size === 0) throw new Error('No data rows found — is this the right CSV?');

  const dates     = [...dailyMap.keys()].sort();
  const dailyFlat = dates.map(d => dailyMap.get(d)!.flat + rates.basePerDay);
  const dailyTOU  = dates.map(d => dailyMap.get(d)!.tou  + rates.basePerDay);
  const totalFlat = dailyFlat.reduce((s, v) => s + v, 0);
  const totalTOU  = dailyTOU.reduce((s,  v) => s + v, 0);

  return { dates, dailyFlat, dailyTOU, bucketKwh, bucketCost, hourlyKwh, totalKwh, totalFlat, totalTOU };
}

// === Chart helpers ===

const activeCharts: Chart[] = [];

function destroyCharts() {
  activeCharts.forEach(c => c.destroy());
  activeCharts.length = 0;
}

function mkChart(...args: ConstructorParameters<typeof Chart>): Chart {
  const c = new Chart(...args);
  activeCharts.push(c);
  return c;
}

function hourLabel(h: number): string {
  if (h === 0)  return '12am';
  if (h < 12)   return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

const FLAT_COLOR = '#6366f1';
const TOU_COLOR  = '#10b981';
const RATE_COLORS: Record<RateName, string> = {
  'Off-Peak': '#3b82f6',
  'Mid-Peak': '#f59e0b',
  'Peak':     '#ef4444',
};

// === Rendering ===

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function makeStatCard(label: string, value: string, sub?: string, extraClass?: string): HTMLElement {
  const card = document.createElement('div');
  card.className = `stat-card${extraClass ? ' ' + extraClass : ''}`;

  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'value';
  valueEl.textContent = value;

  card.appendChild(labelEl);
  card.appendChild(valueEl);

  if (sub) {
    const subEl = document.createElement('div');
    subEl.className = 'sub';
    subEl.textContent = sub;
    card.appendChild(subEl);
  }

  return card;
}

function renderStats(r: AnalysisResult) {
  const grid = document.getElementById('stats-grid')!;
  grid.textContent = '';

  const savings = r.totalFlat - r.totalTOU;
  const pct     = savings / r.totalFlat * 100;

  grid.appendChild(makeStatCard('Flat-rate total', `$${fmt(r.totalFlat)}`, `${r.dates.length} days`));
  grid.appendChild(makeStatCard('TOU total', `$${fmt(r.totalTOU)}`));
  grid.appendChild(makeStatCard(
    savings >= 0 ? 'TOU saves' : 'TOU costs extra',
    `$${fmt(Math.abs(savings))}`,
    `${fmt(Math.abs(pct), 1)}% vs. flat rate`,
    savings >= 0 ? 'positive' : 'negative',
  ));
  grid.appendChild(makeStatCard('Total usage', `${fmt(r.totalKwh, 0)} kWh`));
}

function renderDailyChart(r: AnalysisResult) {
  const ctx = (document.getElementById('daily-chart') as HTMLCanvasElement).getContext('2d')!;

  const labelStep = Math.max(1, Math.round(r.dates.length / 26));
  const labels    = r.dates.map((d, i) => i % labelStep === 0 ? d : '');

  mkChart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Flat rate',
          data: r.dailyFlat,
          borderColor: FLAT_COLOR,
          backgroundColor: FLAT_COLOR + '18',
          fill: false,
          pointRadius: 0,
          borderWidth: 1.5,
          tension: 0.1,
        },
        {
          label: 'Time-of-use',
          data: r.dailyTOU,
          borderColor: TOU_COLOR,
          backgroundColor: TOU_COLOR + '18',
          fill: false,
          pointRadius: 0,
          borderWidth: 1.5,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: $${fmt(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: false, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          ticks: { callback: v => `$${fmt(Number(v))}`, font: { size: 11 } },
          title: { display: true, text: 'Cost per day ($)', font: { size: 11 } },
        },
      },
    },
  });
}

function renderRateChart(r: AnalysisResult) {
  const ctx = (document.getElementById('rate-chart') as HTMLCanvasElement).getContext('2d')!;

  mkChart(ctx, {
    type: 'bar',
    data: {
      labels: RATE_NAMES,
      datasets: [{
        label: 'Usage (kWh)',
        data: RATE_NAMES.map(n => r.bucketKwh[n]),
        backgroundColor: RATE_NAMES.map(n => RATE_COLORS[n]),
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const name = RATE_NAMES[ctx.dataIndex];
              return [
                ` ${fmt(ctx.parsed.y, 1)} kWh`,
                ` Cost: $${fmt(r.bucketCost[name])}`,
              ];
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          ticks: { callback: v => `${fmt(Number(v), 0)}`, font: { size: 10 } },
          title: { display: true, text: 'kWh', font: { size: 11 } },
        },
      },
    },
  });
}

function renderHourlyChart(r: AnalysisResult) {
  const ctx    = (document.getElementById('hourly-chart') as HTMLCanvasElement).getContext('2d')!;
  const labels = Array.from({ length: 24 }, (_, i) => hourLabel(i));

  const colors = Array.from({ length: 24 }, (_, h) => RATE_COLORS[classifyTOU(1 /* Monday */, h)]);

  mkChart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Usage (kWh)',
        data: r.hourlyKwh,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${fmt(ctx.parsed.y, 1)} kWh` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: {
          ticks: { callback: v => `${fmt(Number(v), 0)}`, font: { size: 10 } },
          title: { display: true, text: 'kWh (all days)', font: { size: 11 } },
        },
      },
    },
  });
}

function renderResults(r: AnalysisResult) {
  destroyCharts();
  renderStats(r);
  renderDailyChart(r);
  renderRateChart(r);
  renderHourlyChart(r);
  document.getElementById('results')!.hidden = false;
}

// === File handling ===

let lastText: string | null = null;

function showError(msg: string) {
  const el = document.getElementById('error-banner')!;
  el.textContent = msg;
  el.hidden = false;
}

function clearError() {
  const el = document.getElementById('error-banner')!;
  el.hidden = true;
  el.textContent = '';
}

function rerun() {
  if (lastText === null) return;
  clearError();
  try {
    renderResults(analyze(lastText, readRates()));
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
  }
}

function processFile(file: File) {
  clearError();
  const reader = new FileReader();
  reader.onload = () => {
    lastText = reader.result as string;
    rerun();
  };
  reader.readAsText(file);
}

// === Drop zone wiring ===

const dropzone = document.getElementById('dropzone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) processFile(file);
});

dropzone.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) processFile(file);
});

// Re-run analysis whenever any rate input changes
document.getElementById('rate-settings')!.querySelectorAll('input').forEach(inp => {
  inp.addEventListener('change', rerun);
});
