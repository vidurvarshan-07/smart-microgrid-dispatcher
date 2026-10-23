# Smart Power Routing & Load Balancing System
### OOP Microgrid Dispatcher & Real-Time Monitoring Dashboard
**Review 1 | Object-Oriented Programming Project**

🌐 **Live Demo:** [https://vidurvarshan-07.github.io/smart-microgrid-dispatcher/](https://vidurvarshan-07.github.io/smart-microgrid-dispatcher/)

---

## 👤 Project Author

| Author | Registration No. | Project Scope | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Vidurvarshan S A** | `CB.EN.U4ELC25046` | Full Microgrid Dispatcher System | Object-Oriented System Architecture, Load Balancing Dispatcher, Battery & Renewable Models, and Live Web Dashboard |

---

## ⚡ The Problem Solved

1. **Intermittent Supply:** Solar radiation fluctuates with clouds and drops to 0 kW at night. Wind output follows non-linear cubic wind curve with safety cut-in (3 m/s) and cut-out (25 m/s) boundaries.
2. **Dynamic Consumer Demand:** Industrial factories/hospitals (P1), commercial districts (P2), and residential zones (P3) draw varying loads throughout day and night.
3. **The Balance Constraint:**
   - **Power Deficit (`Supply < Demand`):** Causes voltage drop, brownouts, and catastrophic grid blackouts.
   - **Power Surplus (`Supply > Demand`):** Causes grid frequency spikes and line overheating unless absorbed or safely curtailed.

---

## 🛠️ The Object-Oriented Solution & 5 Core OOP Concepts

| OOP Principle | Implementation in Code |
| :--- | :--- |
| **Abstraction** | `EnergySource` abstract base class hides generation physics behind `@abstractmethod get_available_power()`. |
| **Inheritance** | `SolarPlant`, `WindTurbine`, `BatteryStorage`, and `MainGridBackup` inherit common attributes and base structure from `EnergySource`. |
| **Polymorphism** | `PowerDispatcher` calls `source.get_available_power()` on every source uniformly without type-checking. |
| **Encapsulation** | `BatteryStorage._current_storage_kwh` is protected as private and guarded by `charge()`, `discharge()`, and `set_storage_kwh()`. |
| **Composition & Association** | `PowerDispatcher` *owns* its sources (Composition) and *routes power to* independent `ConsumerGrid` objects (Association). |

---

## 🚀 How to Run

### Method 1: Interactive Web Dashboard (Recommended)
1. Run the lightweight zero-dependency Python server:
   ```bash
   python server.py
   ```
2. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```
*(Note: You can also double-click `index.html` directly in any web browser; it contains an embedded standalone JavaScript dispatch engine that runs identical calculations without requiring a web server).*

### Method 2: Python Console CLI Tool
Run the interactive terminal cycle simulator:
```bash
python main.py
```
Press `Enter` on any prompt to accept default capacities and simulate real-time sensor cycles.

---

## 🌟 Web Dashboard Features

- **Dynamic Interactive Power Flow Schematic (SVG):** Live animated flow pulses showing energy moving from Solar, Wind, Battery, and Utility Grid into the Central Dispatcher Hub, and outward to P1, P2, and P3 consumer grids.
- **Real-Time Grid Telemetry:** Continuous display of Grid Frequency (50.00 Hz), Clean Energy %, CO₂ offset (kg/h), and battery State-of-Charge (SOC %).
- **Sensor Inputs & Sliders:** Live adjustment of Sun Intensity (0-100%), Wind Speed (0-30 m/s with cut-in, rated, cut-out markers), and individual consumer grid demands.
- **Operational Test Scenarios:** One-click buttons to simulate *Solar Surplus Charging*, *Night Deficit Discharge*, *Severe Gale Cut-off*, *Peak Surge Backstop*, and *Curtailment Overcharge*.
- **OOP Architecture Modal:** Visual class diagram and student contributions breakdown.
- **Real-Time Analytics & CSV Export:** Live charts and instant CSV log download of all dispatch cycles.
