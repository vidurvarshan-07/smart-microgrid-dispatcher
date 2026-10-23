"""
dispatcher.py
-------------
Defines PowerDispatcher: the controller that connects EnergySource objects
to ConsumerGrid objects and runs the priority-based dispatch cycle.

OOP concepts: Composition (owns sources), Association (manages grids),
Polymorphism (treats every source via get_available_power()).
"""

from typing import List, Dict, Any
from energy_sources import EnergySource, BatteryStorage, SolarPlant, WindTurbine
from consumer_grid import ConsumerGrid


class PowerDispatcher:
    """Owns a list of EnergySource objects (composition) and manages a list
    of ConsumerGrid objects (association)."""

    def __init__(self, load_distribution: str = "priority"):
        self.sources: List[EnergySource] = []
        self.grids: List[ConsumerGrid] = []
        self.log: List[dict] = []
        self.load_distribution = load_distribution  # "priority" or "proportional"

    def add_source(self, source: EnergySource) -> None:
        self.sources.append(source)

    def add_grid(self, grid: ConsumerGrid) -> None:
        self.grids.append(grid)

    def run_dispatch_cycle(self) -> dict:
        """Run one dispatch cycle:
        1. Total demand from all grids.
        2. Pull power from sources in priority order (list order = priority).
        3. If there's a surplus, send it to any BatteryStorage to charge.
        4. Distribute delivered power across grids (by priority or proportional) and log the result.
        """
        total_demand = sum(g.get_demand() for g in self.grids)

        supplied = 0.0
        contributions: Dict[str, float] = {}

        # 1. Supply generation in priority order: Solar -> Wind -> Battery -> Backup
        for source in self.sources:
            if supplied >= total_demand:
                contributions[source.name] = 0.0
                continue
            needed = total_demand - supplied
            # Polymorphic call — dispatcher doesn't care what concrete type `source` is
            available = source.get_available_power()
            taken = min(available, needed)

            # Battery needs an explicit discharge() to actually remove energy
            if isinstance(source, BatteryStorage):
                taken = source.discharge(taken)

            supplied += taken
            contributions[source.name] = round(taken, 2)

        # 2. Surplus handling: if renewables alone exceed demand, charge batteries
        surplus = 0.0
        battery_charged = 0.0
        renewable_available = sum(
            s.get_available_power() for s in self.sources
            if isinstance(s, (SolarPlant, WindTurbine))
        )
        if renewable_available > total_demand:
            surplus = renewable_available - total_demand
            for source in self.sources:
                if isinstance(source, BatteryStorage) and surplus > 0:
                    charged = source.charge(surplus)
                    battery_charged += charged
                    surplus -= charged

        # 3. Distribute delivered power across grids
        if self.load_distribution == "priority":
            # Priority-based distribution: sort grids by priority (1 = highest)
            remaining_power = supplied
            sorted_grids = sorted(self.grids, key=lambda g: g.priority)
            for grid in sorted_grids:
                dem = grid.get_demand()
                alloc = min(dem, remaining_power)
                grid.receive(alloc)
                remaining_power = max(0.0, remaining_power - alloc)
        else:
            # Proportional distribution across grids
            ratio = (supplied / total_demand) if total_demand else 1.0
            for grid in self.grids:
                grid.receive(grid.get_demand() * min(ratio, 1.0))

        # Trace exact source-to-consumer delivery allocation
        source_pool = dict(contributions)
        source_allocations = {}
        alloc_order_grids = sorted(self.grids, key=lambda g: g.priority) if self.load_distribution == "priority" else list(self.grids)
        for grid in alloc_order_grids:
            grid_alloc = {}
            remaining_to_fill = grid.delivered_kw
            for src_name in ["Solar Farm A", "Wind Park B", "Battery Bank", "Utility Backup"]:
                avail_src = source_pool.get(src_name, 0.0)
                if avail_src > 0 and remaining_to_fill > 0:
                    alloc_from_src = min(avail_src, remaining_to_fill)
                    grid_alloc[src_name] = round(alloc_from_src, 2)
                    source_pool[src_name] -= alloc_from_src
                    remaining_to_fill -= alloc_from_src
            source_allocations[grid.name] = grid_alloc

        # 4. Status determination
        status = "OK: BALANCED"
        if supplied < total_demand - 0.01:
            status = f"BLACKOUT WARNING: {total_demand - supplied:.2f} kW unmet"
        elif surplus > 0.01:
            status = f"CURTAILMENT: {surplus:.2f} kW wasted (battery full)"
        elif battery_charged > 0.01:
            status = f"SURPLUS CHARGING: {battery_charged:.2f} kW stored in Battery"
        elif contributions.get("Utility Backup", 0.0) > 0:
            status = f"GRID ASSIST: {contributions['Utility Backup']:.2f} kW from Utility Backup"
        elif contributions.get("Battery Bank", 0.0) > 0:
            status = f"DEFICIT COVERED: {contributions['Battery Bank']:.2f} kW from Battery"

        # Check battery state
        battery = next((s for s in self.sources if isinstance(s, BatteryStorage)), None)
        batt_kwh = battery.get_storage_kwh() if battery else 0.0
        batt_cap = battery.capacity_kwh if battery else 0.0
        batt_soc = round((batt_kwh / batt_cap * 100), 1) if batt_cap > 0 else 0.0

        grid_summary = {
            g.name: {
                "demand": g.get_demand(),
                "delivered": g.delivered_kw,
                "unmet": g.unmet_kw,
                "priority": g.priority,
                "pct_served": round((g.delivered_kw / g.get_demand() * 100) if g.get_demand() > 0 else 100, 1)
            }
            for g in self.grids
        }

        # Calculate renewable percentage
        renewable_supplied = sum(
            contributions.get(s.name, 0.0)
            for s in self.sources
            if isinstance(s, (SolarPlant, WindTurbine))
        )
        clean_energy_pct = round((renewable_supplied / supplied * 100) if supplied > 0 else 0, 1)

        record = {
            "demand": round(total_demand, 2),
            "supplied": round(supplied, 2),
            "unmet": round(max(0.0, total_demand - supplied), 2),
            "surplus": round(surplus, 2),
            "clean_energy_pct": clean_energy_pct,
            "contributions": contributions,
            "source_allocations": source_allocations,
            "grid_status": grid_summary,
            "battery_kwh": batt_kwh,
            "battery_capacity": batt_cap,
            "battery_soc": batt_soc,
            "battery_charge_kw": round(battery_charged, 2),
            "battery_discharge_kw": round(contributions.get("Battery Bank", 0.0), 2),
            "status": status,
        }
        self.log_status(record)
        return record

    def log_status(self, record: dict) -> None:
        self.log.append(record)
