"""
main.py
-------
Entry point: builds the sources and grids once (asking the user for their
capacities), then repeatedly asks the user for live conditions each cycle
(sun intensity, wind speed, demand per grid) — standing in for sensor
readings — and runs the dispatcher on them.
"""

from energy_sources import SolarPlant, WindTurbine, BatteryStorage, MainGridBackup
from consumer_grid import ConsumerGrid
from dispatcher import PowerDispatcher


def ask_float(prompt: str, default: float, lo: float = None, hi: float = None) -> float:
    """Ask the user for a number, with a default if they just press Enter,
    and re-ask if they type something invalid or out of range."""
    while True:
        raw = input(f"{prompt} [default {default}]: ").strip()
        if raw == "":
            return default
        try:
            value = float(raw)
        except ValueError:
            print("  Please enter a number.")
            continue
        if lo is not None and value < lo:
            print(f"  Must be at least {lo}.")
            continue
        if hi is not None and value > hi:
            print(f"  Must be at most {hi}.")
            continue
        return value


def setup_system() -> PowerDispatcher:
    """One-time setup: ask for the capacity of each source and the grids.
    Press Enter on any prompt to accept the suggested default."""
    print("=== System setup (press Enter to accept the default) ===\n")

    dispatcher = PowerDispatcher()

    solar_cap = ask_float("Solar plant capacity (kW)", 500, lo=0)
    wind_cap = ask_float("Wind turbine capacity (kW)", 300, lo=0)
    batt_power = ask_float("Battery power rating (kW)", 200, lo=0)
    batt_capacity = ask_float("Battery energy capacity (kWh)", 800, lo=0)
    batt_initial = ask_float("Battery initial charge (kWh)", batt_capacity / 2, lo=0, hi=batt_capacity)
    backup_cap = ask_float("Main grid backup capacity (kW)", 1000, lo=0)

    # Dispatch order = the order sources are added: renewables, then battery, then backup
    dispatcher.add_source(SolarPlant("Solar Farm A", capacity_kw=solar_cap))
    dispatcher.add_source(WindTurbine("Wind Park B", capacity_kw=wind_cap))
    dispatcher.add_source(BatteryStorage("Battery Bank", capacity_kw=batt_power,
                                          capacity_kwh=batt_capacity, initial_kwh=batt_initial))
    dispatcher.add_source(MainGridBackup("Utility Backup", capacity_kw=backup_cap))

    print()
    res_demand = ask_float("Residential City base demand (kW)", 150, lo=0)
    ind_demand = ask_float("Industrial Zone base demand (kW)", 220, lo=0)
    com_demand = ask_float("Commercial District base demand (kW)", 130, lo=0)

    dispatcher.add_grid(ConsumerGrid("Residential City", base_demand=res_demand, priority=3))
    dispatcher.add_grid(ConsumerGrid("Industrial Zone", base_demand=ind_demand, priority=1))
    dispatcher.add_grid(ConsumerGrid("Commercial District", base_demand=com_demand, priority=2))

    return dispatcher


def run_cycle(dispatcher: PowerDispatcher, cycle_num: int) -> None:
    """Ask for this cycle's live conditions (the 'sensor readings'), apply
    them to the existing source/grid objects, then dispatch and report."""
    print(f"\n=== Cycle {cycle_num}: enter current conditions ===")

    for source in dispatcher.sources:
        if isinstance(source, SolarPlant):
            source.sun_intensity = ask_float("  Sun intensity (0-100%)", 100, lo=0, hi=100)
        elif isinstance(source, WindTurbine):
            source.wind_speed = ask_float("  Wind speed (m/s)", 8, lo=0, hi=40)

    for grid in dispatcher.grids:
        grid.base_demand = ask_float(f"  {grid.name} demand (kW)", grid.base_demand, lo=0)

    result = dispatcher.run_dispatch_cycle()

    print(f"\n--- Cycle {cycle_num} result ---")
    print(f"Total demand  : {result['demand']} kW")
    print(f"Total supplied: {result['supplied']} kW")
    for name, power in result["contributions"].items():
        print(f"   {name:<18} -> {power} kW")
    for source in dispatcher.sources:
        if isinstance(source, BatteryStorage):
            print(f"   Battery charge now: {source.get_storage_kwh()} / {source.capacity_kwh} kWh")
    print(f"Status: {result['status']}")


def main():
    dispatcher = setup_system()

    cycle_num = 1
    while True:
        run_cycle(dispatcher, cycle_num)
        cycle_num += 1

        again = input("\nRun another cycle? (y/n): ").strip().lower()
        if again != "y":
            break

    print("\n=== Full log of all cycles ===")
    for i, entry in enumerate(dispatcher.log, start=1):
        print(i, entry)


if __name__ == "__main__":
    main()
