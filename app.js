/**
 * SMART POWER ROUTING & LOAD BALANCING SYSTEM
 * Microgrid Dispatcher Client Logic & OOP Simulation Engine
 * Author: Vidurvarshan S A
 */

// ==========================================
// 1. EMBEDDED OOP DISPATCH ENGINE (FALLBACK / OFFLINE)
// Matches Python energy_sources.py, consumer_grid.py, dispatcher.py
// ==========================================

class EnergySource {
  constructor(name, capacityKw) {
    this.name = name;
    this.capacityKw = capacityKw;
  }
  getAvailablePower() {
    throw new Error("Abstract method getAvailablePower must be implemented");
  }
}

class SolarPlant extends EnergySource {
  constructor(name, capacityKw, sunIntensity = 100.0) {
    super(name, capacityKw);
    this.sunIntensity = sunIntensity; // 0 - 100%
  }
  getAvailablePower() {
    const factor = Math.max(0.0, Math.min(this.sunIntensity, 100.0)) / 100.0;
    return Number((this.capacityKw * factor).toFixed(2));
  }
}

class WindTurbine extends EnergySource {
  static CUT_IN = 3.0;
  static RATED = 12.0;
  static CUT_OUT = 25.0;

  constructor(name, capacityKw, windSpeed = 8.0) {
    super(name, capacityKw);
    this.windSpeed = windSpeed; // m/s
  }
  getAvailablePower() {
    const v = this.windSpeed;
    if (v < WindTurbine.CUT_IN || v > WindTurbine.CUT_OUT) {
      return 0.0;
    }
    if (v >= WindTurbine.RATED) {
      return this.capacityKw;
    }
    const fraction = (v - WindTurbine.CUT_IN) / (WindTurbine.RATED - WindTurbine.CUT_IN);
    return Number((this.capacityKw * Math.pow(fraction, 3)).toFixed(2));
  }
}

class BatteryStorage extends EnergySource {
  constructor(name, capacityKw, capacityKwh, initialKwh = 0.0) {
    super(name, capacityKw);
    this.capacityKwh = capacityKwh;
    this._currentStorageKwh = Math.max(0.0, Math.min(initialKwh, capacityKwh));
  }
  getAvailablePower() {
    return Number(Math.min(this.capacityKw, this._currentStorageKwh).toFixed(2));
  }
  discharge(kwh) {
    const actual = Math.min(kwh, this._currentStorageKwh, this.capacityKw);
    this._currentStorageKwh -= actual;
    return Number(actual.toFixed(2));
  }
  charge(kwh) {
    const room = this.capacityKwh - this._currentStorageKwh;
    const actual = Math.min(kwh, room, this.capacityKw);
    this._currentStorageKwh += actual;
    return Number(actual.toFixed(2));
  }
  getStorageKwh() {
    return Number(this._currentStorageKwh.toFixed(2));
  }
  setStorageKwh(kwh) {
    this._currentStorageKwh = Math.max(0.0, Math.min(kwh, this.capacityKwh));
  }
}

class MainGridBackup extends EnergySource {
  getAvailablePower() {
    return this.capacityKw;
  }
}

class ConsumerGrid {
  constructor(name, baseDemand, priority = 1) {
    this.name = name;
    this.baseDemand = baseDemand;
    this.priority = priority; // 1 = highest
    this.deliveredKw = 0.0;
  }
  getDemand() {
    return this.baseDemand;
  }
  receive(powerKw) {
    this.deliveredKw = Number(powerKw.toFixed(2));
  }
  get unmetKw() {
    return Number(Math.max(0.0, this.getDemand() - this.deliveredKw).toFixed(2));
  }
}

class LocalPowerDispatcher {
  constructor(loadDistribution = "priority") {
    this.sources = [];
    this.grids = [];
    this.log = [];
    this.loadDistribution = loadDistribution; // 'priority' or 'proportional'
  }
  addSource(source) {
    this.sources.push(source);
  }
  addGrid(grid) {
    this.grids.push(grid);
  }
  runDispatchCycle() {
    const totalDemand = this.grids.reduce((acc, g) => acc + g.getDemand(), 0.0);
    let supplied = 0.0;
    const contributions = {};

    // 1. Supply generation in priority order (Renewables -> Battery -> Utility Backup)
    for (const source of this.sources) {
      if (supplied >= totalDemand) {
        contributions[source.name] = 0.0;
        continue;
      }
      const needed = totalDemand - supplied;
      const available = source.getAvailablePower();
      let taken = Math.min(available, needed);

      if (source instanceof BatteryStorage) {
        taken = source.discharge(taken);
      }

      supplied += taken;
      contributions[source.name] = Number(taken.toFixed(2));
    }

    // 2. Surplus absorption: if renewables alone exceed demand, charge battery
    let surplus = 0.0;
    let batteryCharged = 0.0;
    const renewableAvailable = this.sources
      .filter(s => s instanceof SolarPlant || s instanceof WindTurbine)
      .reduce((acc, s) => acc + s.getAvailablePower(), 0.0);

    if (renewableAvailable > totalDemand) {
      surplus = renewableAvailable - totalDemand;
      for (const source of this.sources) {
        if (source instanceof BatteryStorage && surplus > 0) {
          const charged = source.charge(surplus);
          batteryCharged += charged;
          surplus -= charged;
        }
      }
    }

    // 3. Load Distribution (Priority-based or Proportional)
    if (this.loadDistribution === "priority") {
      let remainingPower = supplied;
      const sortedGrids = [...this.grids].sort((a, b) => a.priority - b.priority);
      for (const grid of sortedGrids) {
        const dem = grid.getDemand();
        const alloc = Math.min(dem, remainingPower);
        grid.receive(alloc);
        remainingPower = Math.max(0.0, remainingPower - alloc);
      }
    } else {
      const ratio = totalDemand ? supplied / totalDemand : 1.0;
      for (const grid of this.grids) {
        grid.receive(grid.getDemand() * Math.min(ratio, 1.0));
      }
    }

    // Trace exact source-to-consumer delivery allocation
    const sourcePool = { ...contributions };
    const sourceAllocations = {};
    const allocOrderGrids = this.loadDistribution === "priority" 
      ? [...this.grids].sort((a, b) => a.priority - b.priority) 
      : [...this.grids];
    for (const grid of allocOrderGrids) {
      const gridAlloc = {};
      let rem = grid.deliveredKw;
      for (const srcName of ["Solar Farm A", "Wind Park B", "Battery Bank", "Utility Backup"]) {
        const avail = sourcePool[srcName] || 0;
        if (avail > 0 && rem > 0) {
          const take = Math.min(avail, rem);
          gridAlloc[srcName] = Number(take.toFixed(2));
          sourcePool[srcName] -= take;
          rem -= take;
        }
      }
      sourceAllocations[grid.name] = gridAlloc;
    }

    // Status determination
    let status = "OK: BALANCED";
    if (supplied < totalDemand - 0.01) {
      status = `BLACKOUT WARNING: ${(totalDemand - supplied).toFixed(2)} kW unmet`;
    } else if (surplus > 0.01) {
      status = `CURTAILMENT: ${surplus.toFixed(2)} kW wasted (battery full)`;
    } else if (batteryCharged > 0.01) {
      status = `SURPLUS CHARGING: ${batteryCharged.toFixed(2)} kW stored in Battery`;
    } else if ((contributions["Utility Backup"] || 0) > 0) {
      status = `GRID ASSIST: ${contributions["Utility Backup"].toFixed(2)} kW from Utility Backup`;
    } else if ((contributions["Battery Bank"] || 0) > 0) {
      status = `DEFICIT COVERED: ${contributions["Battery Bank"].toFixed(2)} kW from Battery`;
    }

    const battery = this.sources.find(s => s instanceof BatteryStorage);
    const battKwh = battery ? battery.getStorageKwh() : 0.0;
    const battCap = battery ? battery.capacityKwh : 0.0;
    const battSoc = battCap > 0 ? Number(((battKwh / battCap) * 100).toFixed(1)) : 0.0;

    const renewableSupplied = (contributions["Solar Farm A"] || 0) + (contributions["Wind Park B"] || 0);
    const cleanEnergyPct = supplied > 0 ? Number(((renewableSupplied / supplied) * 100).toFixed(1)) : 0.0;

    const record = {
      demand: Number(totalDemand.toFixed(2)),
      supplied: Number(supplied.toFixed(2)),
      unmet: Number(Math.max(0.0, totalDemand - supplied).toFixed(2)),
      surplus: Number(surplus.toFixed(2)),
      clean_energy_pct: cleanEnergyPct,
      contributions: contributions,
      source_allocations: sourceAllocations,
      grid_status: {},
      battery_kwh: battKwh,
      battery_capacity: battCap,
      battery_soc: battSoc,
      battery_charge_kw: Number(batteryCharged.toFixed(2)),
      battery_discharge_kw: Number((contributions["Battery Bank"] || 0).toFixed(2)),
      status: status,
      available_power: {
        "Solar Farm A": this.sources[0].getAvailablePower(),
        "Wind Park B": this.sources[1].getAvailablePower(),
        "Battery Bank": this.sources[2].getAvailablePower(),
        "Utility Backup": this.sources[3].getAvailablePower()
      }
    };

    for (const g of this.grids) {
      record.grid_status[g.name] = {
        demand: g.getDemand(),
        delivered: g.deliveredKw,
        unmet: g.unmetKw,
        priority: g.priority,
        pct_served: g.getDemand() > 0 ? Number(((g.deliveredKw / g.getDemand()) * 100).toFixed(1)) : 100
      };
    }

    this.log.push(record);
    return record;
  }
}

// ==========================================
// 2. SYSTEM STATE INITIALIZATION
// ==========================================

const state = {
  cycle: 0,
  autoRun: false,
  autoRunTimer: null,
  autoRunSpeed: 2000, // ms
  simulatedHour: 12.0, // 0 - 24h
  backendConnected: false,
  history: [],
  maxHistory: 20,
  localDispatcher: null,
  solar: null,
  wind: null,
  battery: null,
  backup: null,
  resGrid: null,
  indGrid: null,
  comGrid: null
};

function initLocalDispatcher() {
  const d = new LocalPowerDispatcher("priority");
  const solar = new SolarPlant("Solar Farm A", 500, 85);
  const wind = new WindTurbine("Wind Park B", 300, 8.5);
  const batt = new BatteryStorage("Battery Bank", 200, 800, 400);
  const backup = new MainGridBackup("Utility Backup", 1000);

  d.addSource(solar);
  d.addSource(wind);
  d.addSource(batt);
  d.addSource(backup);

  const ind = new ConsumerGrid("Industrial Zone", 220, 1);
  const com = new ConsumerGrid("Commercial District", 130, 2);
  const res = new ConsumerGrid("Residential City", 150, 3);

  d.addGrid(ind);
  d.addGrid(com);
  d.addGrid(res);

  state.localDispatcher = d;
  state.solar = solar;
  state.wind = wind;
  state.battery = batt;
  state.backup = backup;
  state.indGrid = ind;
  state.comGrid = com;
  state.resGrid = res;
}

// ==========================================
// 3. CHART.JS INITIALIZATION
// ==========================================

let donutChart = null;
let lineChart = null;

function initCharts() {
  const ctxDonut = document.getElementById("chart-sources-donut").getContext("2d");
  donutChart = new Chart(ctxDonut, {
    type: "doughnut",
    data: {
      labels: ["Solar Farm A", "Wind Park B", "Battery Bank", "Utility Backup"],
      datasets: [{
        data: [425, 115, 0, 0],
        backgroundColor: ["#f59e0b", "#06b6d4", "#10b981", "#6366f1"],
        borderColor: "#111827",
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            boxWidth: 10,
            color: "#94a3b8",
            font: { family: "'Inter', sans-serif", size: 10 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw} kW`
          }
        }
      },
      cutout: "70%"
    }
  });

  const ctxLine = document.getElementById("chart-history-line").getContext("2d");
  lineChart = new Chart(ctxLine, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Total Demand",
          data: [],
          borderColor: "#f43f5e",
          backgroundColor: "rgba(244, 63, 94, 0.1)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3
        },
        {
          label: "Renewables (Solar+Wind)",
          data: [],
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3
        },
        {
          label: "Battery SOC (%)",
          data: [],
          borderColor: "#38bdf8",
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 2,
          yAxisID: "y1",
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#64748b", font: { size: 9 } }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8", font: { size: 9 }, callback: (v) => `${v} kW` },
          title: { display: false }
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          min: 0,
          max: 100,
          ticks: { color: "#38bdf8", font: { size: 9 }, callback: (v) => `${v}%` }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            boxWidth: 8,
            color: "#94a3b8",
            font: { size: 9 }
          }
        }
      }
    }
  });
}

function updateCharts(result) {
  if (!donutChart || !lineChart) return;

  const solar = result.contributions["Solar Farm A"] || 0;
  const wind = result.contributions["Wind Park B"] || 0;
  const batt = result.contributions["Battery Bank"] || 0;
  const grid = result.contributions["Utility Backup"] || 0;

  donutChart.data.datasets[0].data = [solar, wind, batt, grid];
  donutChart.update();

  document.getElementById("chart-total-kw").textContent = `${result.supplied} kW Dispatched`;

  // History Line Chart
  const cycleLabel = `C${state.cycle}`;
  lineChart.data.labels.push(cycleLabel);
  lineChart.data.datasets[0].data.push(result.demand);
  lineChart.data.datasets[1].data.push(Number((solar + wind).toFixed(2)));
  lineChart.data.datasets[2].data.push(result.battery_soc);

  if (lineChart.data.labels.length > state.maxHistory) {
    lineChart.data.labels.shift();
    lineChart.data.datasets[0].data.shift();
    lineChart.data.datasets[1].data.shift();
    lineChart.data.datasets[2].data.shift();
  }

  lineChart.update();
}

// ==========================================
// 4. DISPATCH EXECUTION & BACKEND SYNC
// ==========================================

async function checkBackendConnection() {
  try {
    const res = await fetch("/api/state", { method: "GET" });
    if (res.ok) {
      state.backendConnected = true;
      const statusPill = document.getElementById("connection-status");
      statusPill.innerHTML = '<span class="pulse-dot"></span> PYTHON API ACTIVE';
      statusPill.style.color = "#10b981";
      return true;
    }
  } catch (e) {
    state.backendConnected = false;
    const statusPill = document.getElementById("connection-status");
    statusPill.innerHTML = '<span class="pulse-dot"></span> LOCAL ENGINE (STANDALONE)';
    statusPill.style.color = "#38bdf8";
  }
  return false;
}

async function runCycle() {
  state.cycle += 1;

  const sunVal = parseFloat(document.getElementById("input-sun").value);
  const windVal = parseFloat(document.getElementById("input-wind").value);
  const indVal = parseFloat(document.getElementById("input-dem-ind").value);
  const comVal = parseFloat(document.getElementById("input-dem-com").value);
  const resVal = parseFloat(document.getElementById("input-dem-res").value);
  const distMode = document.getElementById("cfg-distribution") ? document.getElementById("cfg-distribution").value : "priority";

  let result = null;

  if (state.backendConnected) {
    try {
      const payload = {
        sun_intensity: sunVal,
        wind_speed: windVal,
        industrial_demand: indVal,
        commercial_demand: comVal,
        residential_demand: resVal,
        load_distribution: distMode
      };
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      result = await response.json();
    } catch (err) {
      console.warn("Backend error, falling back to local engine:", err);
      state.backendConnected = false;
    }
  }

  // Fallback to local dispatcher engine
  if (!result) {
    state.solar.sunIntensity = sunVal;
    state.wind.windSpeed = windVal;
    state.indGrid.baseDemand = indVal;
    state.comGrid.baseDemand = comVal;
    state.resGrid.baseDemand = resVal;
    state.localDispatcher.loadDistribution = distMode;
    result = state.localDispatcher.runDispatchCycle();
  }

  state.history.push({ cycle: state.cycle, ...result });
  renderDashboard(result);
}

// ==========================================
// 5. DOM & SVG SCHEMATIC RENDERING
// ==========================================

function renderDashboard(result) {
  // 1. Cycle Counter & Frequency
  document.getElementById("val-cycle").textContent = state.cycle;

  // Real-time Simulated Frequency (surplus -> freq spike, deficit -> freq drop)
  let freq = 50.00;
  if (result.unmet > 0) {
    freq = Math.max(48.8, 50.0 - (result.unmet / 250) * 0.45);
  } else if (result.surplus > 0) {
    freq = Math.min(50.4, 50.0 + (result.surplus / 300) * 0.35);
  }
  const freqEl = document.getElementById("val-freq");
  freqEl.textContent = `${freq.toFixed(2)} Hz`;
  freqEl.className = "value " + (Math.abs(freq - 50.0) < 0.1 ? "accent-green" : Math.abs(freq - 50.0) < 0.25 ? "accent-amber" : "accent-red");

  // Clean Energy % & CO2 Offset
  document.getElementById("val-clean-pct").textContent = `${result.clean_energy_pct}%`;
  const co2Avoided = Math.round(result.supplied * (result.clean_energy_pct / 100) * 0.64);
  document.getElementById("val-co2").textContent = `${co2Avoided} kg/h`;

  const balanceVal = result.surplus > 0 ? `+${result.surplus.toFixed(1)} kW (Surplus)` :
                     (result.battery_charge_kw || 0) > 0 ? `+${result.battery_charge_kw.toFixed(1)} kW (Charging)` :
                     result.unmet > 0 ? `-${result.unmet.toFixed(1)} kW (Deficit)` : "0.00 kW (Balanced)";
  const balEl = document.getElementById("val-balance");
  balEl.textContent = balanceVal;
  balEl.className = "value " + (result.unmet > 0 ? "accent-red" : ((result.surplus > 0 || (result.battery_charge_kw || 0) > 0) ? "accent-green" : "accent-amber"));

  // 2. Banner Status & Visual Warning
  const banner = document.getElementById("status-banner");
  const statusTag = document.getElementById("status-tag");
  const headline = document.getElementById("status-headline");
  const subtext = document.getElementById("status-sub");
  const iconBox = document.getElementById("status-icon-box");

  const isCharging = (result.battery_charge_kw || 0) > 0.01;
  const isDischarging = (result.battery_discharge_kw || 0) > 0.01;
  const backupUsed = result.contributions["Utility Backup"] || 0;

  if (result.unmet > 0) {
    statusTag.textContent = "CRITICAL: DEFICIT & LOAD SHEDDING";
    statusTag.style.color = "#ef4444";
    headline.textContent = `Supply Deficit of ${result.unmet.toFixed(1)} kW Detected`;
    subtext.textContent = "All sources exhausted. Load shedding triggered: lower priority grids de-energized to safeguard critical loads.";
    iconBox.style.background = "rgba(239, 68, 68, 0.15)";
    iconBox.style.color = "#ef4444";
    iconBox.style.borderColor = "rgba(239, 68, 68, 0.4)";
  } else if (result.surplus > 0) {
    statusTag.textContent = "WARNING: CURTAILMENT / FULL STORAGE";
    statusTag.style.color = "#f59e0b";
    headline.textContent = `Surplus Generation of ${result.surplus.toFixed(1)} kW Curtailed`;
    subtext.textContent = "Renewables exceed consumer demand and battery is 100% full. Excess generation curtailed to protect grid frequency.";
    iconBox.style.background = "rgba(245, 158, 11, 0.15)";
    iconBox.style.color = "#f59e0b";
    iconBox.style.borderColor = "rgba(245, 158, 11, 0.4)";
  } else if (isCharging) {
    statusTag.textContent = "SURPLUS: CHARGING BATTERY BUFFER";
    statusTag.style.color = "#10b981";
    headline.textContent = `Renewable Surplus: +${result.battery_charge_kw.toFixed(1)} kW Actively Charging Battery`;
    subtext.textContent = "Clean generation exceeds consumer load. Excess power safely diverted to Battery Bank for peak buffering.";
    iconBox.style.background = "rgba(16, 185, 129, 0.15)";
    iconBox.style.color = "#10b981";
    iconBox.style.borderColor = "rgba(16, 185, 129, 0.4)";
  } else if (backupUsed > 0) {
    statusTag.textContent = "GRID BACKSTOP ACTIVE";
    statusTag.style.color = "#818cf8";
    headline.textContent = `Utility Grid Assisting with ${backupUsed.toFixed(1)} kW`;
    subtext.textContent = "Renewable sources and battery capacity reached limits. Emergency utility backstop engaged.";
    iconBox.style.background = "rgba(99, 102, 241, 0.15)";
    iconBox.style.color = "#818cf8";
    iconBox.style.borderColor = "rgba(99, 102, 241, 0.4)";
  } else if (isDischarging) {
    statusTag.textContent = "BATTERY BUFFER DISCHARGING";
    statusTag.style.color = "#38bdf8";
    headline.textContent = `Battery Discharging ${result.battery_discharge_kw.toFixed(1)} kW`;
    subtext.textContent = "Green energy stored during earlier surplus is powering current consumer demand.";
    iconBox.style.background = "rgba(56, 189, 248, 0.15)";
    iconBox.style.color = "#38bdf8";
    iconBox.style.borderColor = "rgba(56, 189, 248, 0.4)";
  } else {
    statusTag.textContent = "SYSTEM STATUS: 100% GREEN BALANCED";
    statusTag.style.color = "#10b981";
    headline.textContent = "Renewable Generation Fully Covering Demand";
    subtext.textContent = "Solar and Wind meet all consumer loads cleanly with zero fossil fuel backup.";
    iconBox.style.background = "rgba(16, 185, 129, 0.15)";
    iconBox.style.color = "#10b981";
    iconBox.style.borderColor = "rgba(16, 185, 129, 0.4)";
  }

  // 3. Summary Cards
  document.getElementById("card-total-demand").textContent = `${result.demand.toFixed(1)} kW`;
  document.getElementById("card-total-supplied").textContent = `${result.supplied.toFixed(1)} kW`;
  
  const summaryCardBattery = document.getElementById("summary-card-battery");
  const cardBatterySoc = document.getElementById("card-battery-soc");
  if (cardBatterySoc) {
    if (isCharging) {
      if (summaryCardBattery) {
        summaryCardBattery.classList.add("is-charging");
        summaryCardBattery.classList.remove("is-discharging");
      }
      cardBatterySoc.innerHTML = `<span style="color:#10b981;font-weight:700;">⚡ +${result.battery_charge_kw.toFixed(1)} kW</span> | ${result.battery_soc}% (${result.battery_kwh} kWh)`;
    } else if (isDischarging) {
      if (summaryCardBattery) {
        summaryCardBattery.classList.add("is-discharging");
        summaryCardBattery.classList.remove("is-charging");
      }
      cardBatterySoc.innerHTML = `<span style="color:#38bdf8;font-weight:700;">🔋 -${result.battery_discharge_kw.toFixed(1)} kW</span> | ${result.battery_soc}% (${result.battery_kwh} kWh)`;
    } else {
      if (summaryCardBattery) summaryCardBattery.classList.remove("is-charging", "is-discharging");
      cardBatterySoc.textContent = `${result.battery_soc}% (${result.battery_kwh} kWh)`;
    }
  }

  const unmetEl = document.getElementById("card-total-unmet");
  unmetEl.textContent = `${result.unmet.toFixed(1)} kW`;
  unmetEl.style.color = result.unmet > 0 ? "#ef4444" : "#10b981";

  // 4. Update SVG Schematic Elements
  const solarGen = result.available_power ? result.available_power["Solar Farm A"] : 0;
  const windGen = result.available_power ? result.available_power["Wind Park B"] : 0;

  document.getElementById("node-solar-val").textContent = `${solarGen.toFixed(1)} kW`;
  document.getElementById("node-wind-val").textContent = `${windGen.toFixed(1)} kW`;
  document.getElementById("node-backup-val").textContent = `${backupUsed.toFixed(1)} kW`;
  document.getElementById("node-hub-val").textContent = `${result.supplied.toFixed(1)} kW`;

  // Battery Node in SVG
  const battFillPct = Math.max(5, Math.min(100, result.battery_soc));
  const svgBattFill = document.getElementById("svg-batt-fill");
  if (svgBattFill) {
    svgBattFill.setAttribute("width", (134 * (battFillPct / 100)).toFixed(0));
  }
  const nodeBattVal = document.getElementById("node-batt-val");
  if (nodeBattVal) {
    nodeBattVal.textContent = `${result.battery_kwh} / ${result.battery_capacity} kWh (${result.battery_soc}%)`;
  }

  const cardBatterySvg = document.getElementById("card-battery-svg");
  const nodeBattMode = document.getElementById("node-batt-mode");
  const nodeBattSubval = document.getElementById("node-batt-subval");
  const svgBattBolt = document.getElementById("svg-batt-bolt");

  if (isCharging) {
    if (nodeBattMode) {
      nodeBattMode.textContent = `⚡ Charging (+${result.battery_charge_kw.toFixed(1)} kW)`;
      nodeBattMode.style.fill = "#10b981";
    }
    if (nodeBattSubval) {
      nodeBattSubval.textContent = `+${result.battery_charge_kw.toFixed(1)} kW Charging Rate`;
      nodeBattSubval.style.fill = "#10b981";
    }
    if (cardBatterySvg) {
      cardBatterySvg.classList.add("is-charging");
      cardBatterySvg.classList.remove("is-discharging");
    }
    if (svgBattBolt) svgBattBolt.style.display = "block";
    if (svgBattFill) svgBattFill.style.fill = "#10b981";
  } else if (isDischarging) {
    if (nodeBattMode) {
      nodeBattMode.textContent = `🔋 Discharging (-${result.battery_discharge_kw.toFixed(1)} kW)`;
      nodeBattMode.style.fill = "#38bdf8";
    }
    if (nodeBattSubval) {
      nodeBattSubval.textContent = `-${result.battery_discharge_kw.toFixed(1)} kW Outflow Rate`;
      nodeBattSubval.style.fill = "#38bdf8";
    }
    if (cardBatterySvg) {
      cardBatterySvg.classList.add("is-discharging");
      cardBatterySvg.classList.remove("is-charging");
    }
    if (svgBattBolt) svgBattBolt.style.display = "none";
    if (svgBattFill) svgBattFill.style.fill = "#38bdf8";
  } else {
    if (nodeBattMode) {
      nodeBattMode.textContent = result.battery_soc >= 99.9 ? "Full (Curtailing)" : "Standby / Buffering";
      nodeBattMode.style.fill = result.battery_soc >= 99.9 ? "#f59e0b" : "#94a3b8";
    }
    if (nodeBattSubval) {
      nodeBattSubval.textContent = "0.0 kW Net Buffer";
      nodeBattSubval.style.fill = "#94a3b8";
    }
    if (cardBatterySvg) {
      cardBatterySvg.classList.remove("is-charging", "is-discharging");
    }
    if (svgBattBolt) svgBattBolt.style.display = "none";
    if (svgBattFill) svgBattFill.style.fill = "#10b981";
  }

  // Animated SVG Feeder Wires
  toggleWire("path-solar", solarGen > 0, "active");
  toggleWire("path-wind", windGen > 0, "active");
  toggleWire("path-backup", backupUsed > 0, "active");

  const pathBattery = document.getElementById("path-battery");
  if (pathBattery) {
    pathBattery.classList.remove("charging", "discharging");
    if (isCharging) {
      pathBattery.classList.add("charging");
    } else if (isDischarging) {
      pathBattery.classList.add("discharging");
    }
  }

  // Consumer Grids in SVG & Status Under Sliders
  updateGridNode("node-ind", "served-ind", "Industrial Zone", result.grid_status["Industrial Zone"]);
  updateGridNode("node-com", "served-com", "Commercial District", result.grid_status["Commercial District"]);
  updateGridNode("node-res", "served-res", "Residential City", result.grid_status["Residential City"]);

  toggleWire("path-p1", (result.grid_status["Industrial Zone"]?.delivered || 0) > 0, "active");
  toggleWire("path-p2", (result.grid_status["Commercial District"]?.delivered || 0) > 0, "active");
  toggleWire("path-p3", (result.grid_status["Residential City"]?.delivered || 0) > 0, "active");

  // Turbine blade animation speed
  const turbine = document.getElementById("spinning-turbine");
  const windSpeed = parseFloat(document.getElementById("input-wind").value);
  if (windSpeed >= WindTurbine.CUT_IN && windSpeed <= WindTurbine.CUT_OUT) {
    turbine.classList.add("spinning");
    const dur = Math.max(0.4, 2.5 - (windSpeed / 25) * 2.0);
    turbine.style.animationDuration = `${dur.toFixed(2)}s`;
  } else {
    turbine.classList.remove("spinning");
  }

  // 5. Update Battery HUD Banner
  updateBatteryHUD(result, isCharging, isDischarging);

  // 6. Update Real-Time Power Supply Allocation Section
  updateSupplyAllocation(result);

  // 7. Update Charts
  updateCharts(result);

  // 8. Append Log Stream
  appendLogEntry(result);
}

function updateBatteryHUD(result, isCharging, isDischarging) {
  const battStatusBar = document.getElementById("battery-status-bar");
  const battStatusText = document.getElementById("batt-status-text");
  const battStatusSub = document.getElementById("batt-status-sub");
  const battMeterFill = document.getElementById("batt-meter-fill");
  const battSocPill = document.getElementById("batt-soc-pill");
  const battEnergyStored = document.getElementById("batt-energy-stored");

  if (!battStatusBar) return;

  const backupUsed = result.contributions["Utility Backup"] || 0;
  battStatusBar.className = "battery-status-bar " + 
    (isCharging ? "charging" : isDischarging ? "discharging" : backupUsed > 0 ? "backup" : "standby");

  if (battMeterFill) {
    battMeterFill.style.width = `${Math.min(100, Math.max(5, result.battery_soc))}%`;
  }
  if (battSocPill) battSocPill.textContent = `${result.battery_soc}%`;
  if (battEnergyStored) battEnergyStored.textContent = `${result.battery_kwh}`;

  if (isCharging) {
    if (battStatusText) battStatusText.innerHTML = `<strong>⚡ BATTERY ACTIVELY CHARGING:</strong> Storing <span class="accent-green">+${result.battery_charge_kw.toFixed(1)} kW</span> of surplus renewable generation.`;
    if (battStatusSub) battStatusSub.innerHTML = `Clean supply exceeds demand! Absorbing power. State of Charge: <strong>${result.battery_soc}%</strong> (${result.battery_kwh} / ${result.battery_capacity} kWh).`;
  } else if (isDischarging) {
    if (battStatusText) battStatusText.innerHTML = `<strong>🔋 BATTERY BUFFER DISCHARGING:</strong> Generation deficit detected. Battery supplying <span class="accent-cyan">-${result.battery_discharge_kw.toFixed(1)} kW</span> to priority loads.`;
    if (battStatusSub) battStatusSub.innerHTML = `Supplying clean stored energy to cover shortfall. Remaining storage: <strong>${result.battery_soc}%</strong> (${result.battery_kwh} kWh).`;
  } else if (backupUsed > 0) {
    if (battStatusText) battStatusText.innerHTML = `<strong>🏢 UTILITY GRID BACKSTOP ACTIVE:</strong> Clean sources exhausted. Importing <span style="color:#a5b4fc;">+${backupUsed.toFixed(1)} kW</span> from utility backup.`;
    if (battStatusSub) battStatusSub.innerHTML = `Emergency backstop energizing loads to prevent blackout conditions. Battery reserve depleted.`;
  } else {
    if (battStatusText) battStatusText.innerHTML = `<strong>⚖️ GRID IN EQUILIBRIUM:</strong> Renewable generation matches demand perfectly (Net Buffer: 0.0 kW).`;
    if (battStatusSub) battStatusSub.innerHTML = `Battery storage standing by at <strong>${result.battery_soc}%</strong> (${result.battery_kwh} kWh).`;
  }
}

function updateSupplyAllocation(result) {
  const solarUsed = result.contributions["Solar Farm A"] || 0;
  const windUsed = result.contributions["Wind Park B"] || 0;
  const battUsed = result.contributions["Battery Bank"] || 0;
  const backupUsed = result.contributions["Utility Backup"] || 0;
  const unmet = result.unmet || 0;

  const totalDemand = Math.max(0.1, result.demand);
  const totalDispatched = Math.max(0.1, result.supplied);

  // Stacked Bar
  const barSolar = document.getElementById("bar-solar");
  const barWind = document.getElementById("bar-wind");
  const barBatt = document.getElementById("bar-batt");
  const barBackup = document.getElementById("bar-backup");
  const barUnmet = document.getElementById("bar-unmet");

  const divisor = Math.max(totalDemand, solarUsed + windUsed + battUsed + backupUsed + unmet);
  if (barSolar) barSolar.style.width = `${((solarUsed / divisor) * 100).toFixed(1)}%`;
  if (barWind) barWind.style.width = `${((windUsed / divisor) * 100).toFixed(1)}%`;
  if (barBatt) barBatt.style.width = `${((battUsed / divisor) * 100).toFixed(1)}%`;
  if (barBackup) barBackup.style.width = `${((backupUsed / divisor) * 100).toFixed(1)}%`;
  if (barUnmet) barUnmet.style.width = `${((unmet / divisor) * 100).toFixed(1)}%`;

  // Allocation Legend
  const allocSolar = document.getElementById("alloc-solar-kw");
  const allocWind = document.getElementById("alloc-wind-kw");
  const allocBatt = document.getElementById("alloc-batt-kw");
  const allocBackup = document.getElementById("alloc-backup-kw");

  if (allocSolar) allocSolar.textContent = `${solarUsed.toFixed(1)} kW (${((solarUsed / totalDispatched) * 100).toFixed(0)}%)`;
  if (allocWind) allocWind.textContent = `${windUsed.toFixed(1)} kW (${((windUsed / totalDispatched) * 100).toFixed(0)}%)`;
  if (allocBatt) allocBatt.textContent = `${battUsed.toFixed(1)} kW (${((battUsed / totalDispatched) * 100).toFixed(0)}%)`;
  if (allocBackup) allocBackup.textContent = `${backupUsed.toFixed(1)} kW (${((backupUsed / totalDispatched) * 100).toFixed(0)}%)`;

  // Sector Cards (P1, P2, P3)
  updateSectorCard("p1", "Industrial Zone", result);
  updateSectorCard("p2", "Commercial District", result);
  updateSectorCard("p3", "Residential City", result);
}

function updateSectorCard(prefix, gridName, result) {
  const g = result.grid_status[gridName];
  if (!g) return;

  const ratioEl = document.getElementById(`sec-${prefix}-ratio`);
  const barEl = document.getElementById(`sec-${prefix}-bar`);
  const sourcesEl = document.getElementById(`sec-${prefix}-sources`);

  if (ratioEl) {
    const isFull = g.pct_served >= 99.9;
    ratioEl.innerHTML = `<span class="${isFull ? 'accent-green' : 'accent-red'}">${g.delivered.toFixed(1)} / ${g.demand.toFixed(1)} kW (${g.pct_served}%)</span>`;
  }
  if (barEl) {
    barEl.style.width = `${Math.min(100, Math.max(0, g.pct_served))}%`;
    barEl.style.background = g.pct_served >= 99.9 ? "#10b981" : g.pct_served > 0 ? "#f59e0b" : "#ef4444";
  }
  if (sourcesEl) {
    const allocs = result.source_allocations ? result.source_allocations[gridName] : null;
    let html = "";
    if (allocs && Object.keys(allocs).length > 0) {
      for (const [src, kw] of Object.entries(allocs)) {
        if (kw > 0.05) {
          let tagClass = "tag-solar";
          let icon = "☀️";
          if (src.includes("Wind")) { tagClass = "tag-wind"; icon = "💨"; }
          else if (src.includes("Battery")) { tagClass = "tag-batt"; icon = "🔋"; }
          else if (src.includes("Backup")) { tagClass = "tag-backup"; icon = "🏢"; }
          html += `<span class="src-tag ${tagClass}">${icon} ${src.replace(" Farm A", "").replace(" Park B", "").replace(" Bank", "")} (${kw.toFixed(1)} kW)</span> `;
        }
      }
    } else {
      html = `<span class="src-tag tag-solar">⚡ Microgrid (${g.delivered.toFixed(1)} kW)</span>`;
    }
    if (g.unmet > 0.05) {
      html += `<span class="src-tag tag-unmet">⚠️ Unmet (${g.unmet.toFixed(1)} kW)</span>`;
    }
    sourcesEl.innerHTML = html || `<span class="src-tag tag-unmet">0 kW (De-energized)</span>`;
  }
}

function toggleWire(id, isActive, activeClass) {
  const el = document.getElementById(id);
  if (!el) return;
  if (isActive) {
    el.classList.add(activeClass);
  } else {
    el.classList.remove(activeClass);
  }
}

function updateGridNode(nodeId, servedId, gridName, statusObj) {
  if (!statusObj) return;
  const nodeVal = document.getElementById(`${nodeId}-val`);
  if (nodeVal) {
    nodeVal.textContent = `${statusObj.delivered.toFixed(1)} / ${statusObj.demand.toFixed(1)} kW`;
  }
  const servedEl = document.getElementById(servedId);
  if (servedEl) {
    if (statusObj.pct_served >= 99.9) {
      servedEl.innerHTML = `Status: <span class="badge-ok">100% Served (${statusObj.delivered.toFixed(1)} kW)</span>`;
    } else if (statusObj.pct_served > 0) {
      servedEl.innerHTML = `Status: <span class="badge-unmet">${statusObj.pct_served}% Brownout (${statusObj.unmet.toFixed(1)} kW unmet)</span>`;
    } else {
      servedEl.innerHTML = `Status: <span class="badge-unmet">0% SHED / BLACKOUT (${statusObj.unmet.toFixed(1)} kW unmet)</span>`;
    }
  }
}

function appendLogEntry(result) {
  const stream = document.getElementById("log-stream");
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement("div");

  let entryClass = "log-ok";
  if (result.unmet > 0) entryClass = "log-danger";
  else if (result.surplus > 0 || (result.contributions["Utility Backup"] || 0) > 0) entryClass = "log-warn";

  entry.className = `log-entry ${entryClass}`;
  entry.innerHTML = `
    <span class="log-time">[${time}] Cycle #${state.cycle}</span>
    <span class="log-text"><strong>${result.status}</strong> &bull; Demand: ${result.demand} kW &bull; Supplied: ${result.supplied} kW</span>
  `;

  stream.insertBefore(entry, stream.firstChild);
  if (stream.children.length > 50) {
    stream.removeChild(stream.lastChild);
  }
}

// ==========================================
// 6. OPERATIONAL PRESETS & PROFILES
// ==========================================

const SCENARIOS = {
  "sunny-day": {
    sun: 95,
    wind: 9.0,
    ind: 220,
    com: 130,
    res: 150,
    desc: "High Solar Surplus: Renewable input (580 kW) exceeds demand (500 kW). Battery charges actively."
  },
  "calm-night": {
    sun: 0,
    wind: 3.5,
    ind: 220,
    com: 130,
    res: 150,
    desc: "Night Deficit: Solar shuts down. Battery discharges to sustain hospital and residential loads."
  },
  "storm-cutoff": {
    sun: 40,
    wind: 28.0,
    ind: 220,
    com: 130,
    res: 150,
    desc: "Severe Gale: Wind exceeds cut-out threshold (25 m/s) and safely brakes."
  },
  "heavy-surge": {
    sun: 30,
    wind: 5.0,
    ind: 600,
    com: 350,
    res: 450,
    desc: "Peak Demand Surge: Heavy load (1400 kW) exceeds green sources & battery. Utility grid backstop imports power."
  },
  "high-surplus": {
    sun: 100,
    wind: 13.0,
    ind: 150,
    com: 80,
    res: 100,
    desc: "Full Battery Curtailment: High generation with battery at 100% capacity. Excess power curtailed."
  }
};

function applyScenario(scenarioKey) {
  const s = SCENARIOS[scenarioKey];
  if (!s) return;

  document.getElementById("input-sun").value = s.sun;
  document.getElementById("input-wind").value = s.wind;
  document.getElementById("input-dem-ind").value = s.ind;
  document.getElementById("input-dem-com").value = s.com;
  document.getElementById("input-dem-res").value = s.res;

  updateSliderDisplayLabels();

  if (scenarioKey === "high-surplus" && state.battery) {
    state.battery.setStorageKwh(state.battery.capacityKwh);
  }

  showToast(`Scenario Loaded: ${s.desc}`);
  runCycle();
}

function updateSliderDisplayLabels() {
  const sun = parseFloat(document.getElementById("input-sun").value);
  const wind = parseFloat(document.getElementById("input-wind").value);
  const ind = parseFloat(document.getElementById("input-dem-ind").value);
  const com = parseFloat(document.getElementById("input-dem-com").value);
  const res = parseFloat(document.getElementById("input-dem-res").value);

  document.getElementById("disp-sun").textContent = `${sun}%`;
  document.getElementById("disp-wind").textContent = `${wind} m/s`;
  document.getElementById("disp-dem-ind").textContent = `${ind} kW`;
  document.getElementById("disp-dem-com").textContent = `${com} kW`;
  document.getElementById("disp-dem-res").textContent = `${res} kW`;

  // Calculated estimated output
  const solarKw = (500 * (sun / 100)).toFixed(1);
  document.getElementById("calc-solar-kw").textContent = `${solarKw} kW`;

  let windKw = 0;
  if (wind >= 3 && wind <= 25) {
    if (wind >= 12) windKw = 300;
    else windKw = 300 * Math.pow((wind - 3) / 9, 3);
  }
  document.getElementById("calc-wind-kw").textContent = `${windKw.toFixed(1)} kW`;
}

// ==========================================
// 7. AUTO-RUN SIMULATOR (DYNAMIC 24H CYCLE)
// ==========================================

function toggleAutoRun() {
  state.autoRun = !state.autoRun;
  const btn = document.getElementById("btn-autorun");
  const text = document.getElementById("autorun-text");

  if (state.autoRun) {
    btn.classList.add("running");
    text.textContent = "Pause Sim";
    state.autoRunTimer = setInterval(() => {
      simulateDynamicHour();
      runCycle();
    }, state.autoRunSpeed);
    showToast("Continuous Microgrid Simulation Started");
  } else {
    btn.classList.remove("running");
    text.textContent = "Auto Run";
    clearInterval(state.autoRunTimer);
    state.autoRunTimer = null;
    showToast("Simulation Paused");
  }
}

function simulateDynamicHour() {
  // Advance simulated clock
  state.simulatedHour = (state.simulatedHour + 0.5) % 24;
  const hour = state.simulatedHour;

  // Realistic daylight bell curve (peak at 13:00)
  let sun = 0;
  if (hour >= 6 && hour <= 18) {
    const angle = ((hour - 6) / 12) * Math.PI;
    sun = Math.max(0, Math.round(Math.sin(angle) * 100 + (Math.random() * 10 - 5)));
  }

  // Fluctuating wind speed (mean 8 m/s, drift)
  const currentWind = parseFloat(document.getElementById("input-wind").value);
  const deltaWind = (Math.random() - 0.48) * 1.5;
  const newWind = Math.max(0, Math.min(26, parseFloat((currentWind + deltaWind).toFixed(1))));

  // Demand variations by time of day
  let indDemand = 450;
  let comDemand = 200;
  let resDemand = 350;

  if (hour >= 9 && hour <= 17) {
    // Business hours: high industrial & commercial
    indDemand = Math.round(500 + Math.random() * 50);
    comDemand = Math.round(280 + Math.random() * 40);
    resDemand = Math.round(250 + Math.random() * 30);
  } else if (hour >= 18 && hour <= 22) {
    // Evening peak: high residential
    indDemand = Math.round(350 + Math.random() * 40);
    comDemand = Math.round(150 + Math.random() * 30);
    resDemand = Math.round(500 + Math.random() * 60);
  } else {
    // Night valley
    indDemand = Math.round(250 + Math.random() * 30);
    comDemand = Math.round(80 + Math.random() * 20);
    resDemand = Math.round(200 + Math.random() * 30);
  }

  document.getElementById("input-sun").value = Math.min(100, Math.max(0, sun));
  document.getElementById("input-wind").value = newWind;
  document.getElementById("input-dem-ind").value = indDemand;
  document.getElementById("input-dem-com").value = comDemand;
  document.getElementById("input-dem-res").value = resDemand;

  updateSliderDisplayLabels();
}

// ==========================================
// 8. LOG EXPORT TO CSV
// ==========================================

function exportLogToCsv() {
  if (state.history.length === 0) {
    showToast("No dispatch cycles logged yet to export.");
    return;
  }

  let csv = "Cycle,Status,Demand_kW,Supplied_kW,Unmet_kW,Surplus_kW,Solar_kW,Wind_kW,Battery_kW,GridBackup_kW,Battery_SOC_Pct\n";
  for (const item of state.history) {
    const row = [
      item.cycle,
      `"${item.status}"`,
      item.demand,
      item.supplied,
      item.unmet,
      item.surplus,
      item.contributions["Solar Farm A"] || 0,
      item.contributions["Wind Park B"] || 0,
      item.contributions["Battery Bank"] || 0,
      item.contributions["Utility Backup"] || 0,
      item.battery_soc
    ];
    csv += row.join(",") + "\n";
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `microgrid_dispatch_log_cycle_${state.cycle}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("Dispatch log successfully exported to CSV.");
}

// ==========================================
// 9. MODALS & TOAST UTILITIES
// ==========================================

function setupModals() {
  const modalOop = document.getElementById("modal-oop");
  const modalScenarios = document.getElementById("modal-scenarios");
  const modalConfig = document.getElementById("modal-config");

  const btnOop = document.getElementById("btn-oop-modal");
  if (btnOop) btnOop.addEventListener("click", () => modalOop && modalOop.classList.add("open"));
  const btnOopClose = document.getElementById("modal-oop-close");
  if (btnOopClose) btnOopClose.addEventListener("click", () => modalOop && modalOop.classList.remove("open"));
  const btnCloseOopModal = document.getElementById("btn-close-oop-modal");
  if (btnCloseOopModal) btnCloseOopModal.addEventListener("click", () => modalOop && modalOop.classList.remove("open"));

  const btnScenarios = document.getElementById("btn-scenarios");
  if (btnScenarios) btnScenarios.addEventListener("click", () => modalScenarios && modalScenarios.classList.add("open"));
  const modalScenariosClose = document.getElementById("modal-scenarios-close");
  if (modalScenariosClose) modalScenariosClose.addEventListener("click", () => modalScenarios && modalScenarios.classList.remove("open"));

  const btnConfig = document.getElementById("btn-config");
  if (btnConfig) btnConfig.addEventListener("click", () => modalConfig && modalConfig.classList.add("open"));
  const modalConfigClose = document.getElementById("modal-config-close");
  if (modalConfigClose) modalConfigClose.addEventListener("click", () => modalConfig && modalConfig.classList.remove("open"));

  // Close modals on backdrop click
  [modalOop, modalScenarios, modalConfig].forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("open");
    });
  });

  // Scenario preset items click inside modal
  document.querySelectorAll(".scenario-item").forEach(item => {
    item.addEventListener("click", () => {
      const preset = item.getAttribute("data-preset");
      applyScenario(preset);
      modalScenarios.classList.remove("open");
    });
  });

  // Config Form Submission
  const formConfig = document.getElementById("form-config");
  formConfig.addEventListener("submit", async (e) => {
    e.preventDefault();
    const solarCap = parseFloat(document.getElementById("cfg-solar").value);
    const windCap = parseFloat(document.getElementById("cfg-wind").value);
    const battPow = parseFloat(document.getElementById("cfg-batt-power").value);
    const battCap = parseFloat(document.getElementById("cfg-batt-cap").value);
    const battChg = parseFloat(document.getElementById("cfg-batt-charge").value);
    const backupCap = parseFloat(document.getElementById("cfg-backup").value);
    const dist = document.getElementById("cfg-distribution").value;

    if (state.backendConnected) {
      try {
        await fetch("/api/configure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            solar_cap: solarCap,
            wind_cap: windCap,
            battery_power: battPow,
            battery_capacity: battCap,
            battery_charge: battChg,
            backup_cap: backupCap,
            load_distribution: dist
          })
        });
      } catch (err) {
        console.warn("Could not push config to server:", err);
      }
    }

    if (state.solar) state.solar.capacityKw = solarCap;
    if (state.wind) state.wind.capacityKw = windCap;
    if (state.battery) {
      state.battery.capacityKw = battPow;
      state.battery.capacityKwh = battCap;
      state.battery.setStorageKwh(battChg);
    }
    if (state.backup) state.backup.capacityKw = backupCap;
    if (state.localDispatcher) state.localDispatcher.loadDistribution = dist;

    document.getElementById("badge-distribution-mode").textContent = dist.toUpperCase() + " DISPATCH";
    modalConfig.classList.remove("open");
    showToast("System Specifications Updated");
    runCycle();
  });

  document.getElementById("btn-reset-specs").addEventListener("click", () => {
    document.getElementById("cfg-solar").value = 500;
    document.getElementById("cfg-wind").value = 300;
    document.getElementById("cfg-batt-power").value = 200;
    document.getElementById("cfg-batt-cap").value = 800;
    document.getElementById("cfg-batt-charge").value = 400;
    document.getElementById("cfg-backup").value = 1000;
    document.getElementById("cfg-distribution").value = "priority";
    showToast("Specifications reset to default values");
  });
}

function showToast(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

// ==========================================
// 10. ATTACH EVENT LISTENERS & BOOTSTRAP
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
  initLocalDispatcher();
  initCharts();
  setupModals();

  // Step Cycle Button
  document.getElementById("btn-step").addEventListener("click", () => runCycle());

  // Auto Run Button
  document.getElementById("btn-autorun").addEventListener("click", () => toggleAutoRun());

  // Export CSV
  document.getElementById("btn-export-log").addEventListener("click", () => exportLogToCsv());

  // Quick Preset Buttons on Left Sidebar
  document.querySelectorAll(".btn-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const scenario = btn.getAttribute("data-scenario");
      applyScenario(scenario);
    });
  });

  // Slider Input Listeners
  ["input-sun", "input-wind", "input-dem-ind", "input-dem-com", "input-dem-res"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      updateSliderDisplayLabels();
      runCycle();
    });
  });

  // Check backend server connection
  await checkBackendConnection();

  // Run initial cycle
  updateSliderDisplayLabels();
  runCycle();
});
