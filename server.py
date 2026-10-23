"""
server.py
---------
HTTP server for the Smart Power Routing & Load Balancing System.
Bridges the Python OOP microgrid dispatcher (energy_sources, consumer_grid, dispatcher)
with the web management dashboard.

Uses Python standard library (http.server) - zero external dependencies required!
"""

import json
import mimetypes
import os
import sys
from http import HTTPStatus
from http.server import HTTPServer, SimpleHTTPRequestHandler
from typing import Dict, Any

from energy_sources import SolarPlant, WindTurbine, BatteryStorage, MainGridBackup
from consumer_grid import ConsumerGrid
from dispatcher import PowerDispatcher

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class MicrogridManager:
    """Singleton state manager holding the active PowerDispatcher and assets."""

    def __init__(self):
        self.reset_to_defaults()

    def reset_to_defaults(self):
        self.dispatcher = PowerDispatcher(load_distribution="priority")

        # Sources
        self.solar = SolarPlant("Solar Farm A", capacity_kw=500.0, sun_intensity=85.0)
        self.wind = WindTurbine("Wind Park B", capacity_kw=300.0, wind_speed=8.5)
        self.battery = BatteryStorage("Battery Bank", capacity_kw=200.0, capacity_kwh=800.0, initial_kwh=400.0)
        self.grid_backup = MainGridBackup("Utility Backup", capacity_kw=1000.0)

        self.dispatcher.add_source(self.solar)
        self.dispatcher.add_source(self.wind)
        self.dispatcher.add_source(self.battery)
        self.dispatcher.add_source(self.grid_backup)

        # Consumer Grids (Priority 1: Industrial/Hospitals, Priority 2: Commercial, Priority 3: Residential)
        self.res_grid = ConsumerGrid("Residential City", base_demand=150.0, priority=3)
        self.ind_grid = ConsumerGrid("Industrial Zone", base_demand=220.0, priority=1)
        self.com_grid = ConsumerGrid("Commercial District", base_demand=130.0, priority=2)

        self.dispatcher.add_grid(self.ind_grid)
        self.dispatcher.add_grid(self.com_grid)
        self.dispatcher.add_grid(self.res_grid)

        self.cycle_count = 0
        self.history = []

    def dispatch_cycle(self, conditions: Dict[str, Any]) -> Dict[str, Any]:
        """Apply live sensor conditions and execute dispatch cycle."""
        self.cycle_count += 1

        # Apply conditions if provided
        if "sun_intensity" in conditions:
            self.solar.sun_intensity = float(conditions["sun_intensity"])
        if "wind_speed" in conditions:
            self.wind.wind_speed = float(conditions["wind_speed"])

        if "residential_demand" in conditions:
            self.res_grid.base_demand = float(conditions["residential_demand"])
        if "industrial_demand" in conditions:
            self.ind_grid.base_demand = float(conditions["industrial_demand"])
        if "commercial_demand" in conditions:
            self.com_grid.base_demand = float(conditions["commercial_demand"])

        if "load_distribution" in conditions:
            self.dispatcher.load_distribution = conditions["load_distribution"]

        # Run cycle
        result = self.dispatcher.run_dispatch_cycle()
        result["cycle"] = self.cycle_count

        # Source available power breakdown
        result["available_power"] = {
            self.solar.name: self.solar.get_available_power(),
            self.wind.name: self.wind.get_available_power(),
            self.battery.name: self.battery.get_available_power(),
            self.grid_backup.name: self.grid_backup.get_available_power(),
        }

        # Keep last 100 history entries
        self.history.append(result)
        if len(self.history) > 100:
            self.history.pop(0)

        return result

    def get_state(self) -> Dict[str, Any]:
        """Return complete current system status and specifications."""
        return {
            "cycle": self.cycle_count,
            "sources": {
                "solar": {
                    "name": self.solar.name,
                    "capacity_kw": self.solar.capacity_kw,
                    "sun_intensity": self.solar.sun_intensity,
                    "available_kw": self.solar.get_available_power(),
                },
                "wind": {
                    "name": self.wind.name,
                    "capacity_kw": self.wind.capacity_kw,
                    "wind_speed": self.wind.wind_speed,
                    "available_kw": self.wind.get_available_power(),
                },
                "battery": {
                    "name": self.battery.name,
                    "capacity_kw": self.battery.capacity_kw,
                    "capacity_kwh": self.battery.capacity_kwh,
                    "current_kwh": self.battery.get_storage_kwh(),
                    "soc_pct": round((self.battery.get_storage_kwh() / self.battery.capacity_kwh * 100), 1),
                    "available_kw": self.battery.get_available_power(),
                },
                "backup": {
                    "name": self.grid_backup.name,
                    "capacity_kw": self.grid_backup.capacity_kw,
                    "available_kw": self.grid_backup.get_available_power(),
                },
            },
            "grids": [
                {
                    "name": g.name,
                    "demand_kw": g.get_demand(),
                    "priority": g.priority,
                    "delivered_kw": g.delivered_kw,
                    "unmet_kw": g.unmet_kw,
                }
                for g in self.dispatcher.grids
            ],
            "load_distribution": self.dispatcher.load_distribution,
            "last_cycle": self.history[-1] if self.history else None,
            "history_length": len(self.history),
        }


manager = MicrogridManager()


class MicrogridRequestHandler(SimpleHTTPRequestHandler):
    """Custom HTTP handler serving static frontend files & JSON API endpoints."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/api/state":
            self.send_json_response(manager.get_state())
        elif self.path == "/api/history":
            self.send_json_response({"history": manager.history})
        elif self.path == "/api/reset":
            manager.reset_to_defaults()
            self.send_json_response({"status": "reset", "state": manager.get_state()})
        else:
            # Fallback to static file serving
            if self.path == "/":
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/dispatch":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length).decode("utf-8")
            try:
                conditions = json.loads(post_data) if post_data else {}
            except json.JSONDecodeError:
                conditions = {}

            result = manager.dispatch_cycle(conditions)
            self.send_json_response(result)
        elif self.path == "/api/configure":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length).decode("utf-8")
            try:
                cfg = json.loads(post_data) if post_data else {}
            except json.JSONDecodeError:
                cfg = {}

            if "solar_cap" in cfg:
                manager.solar.capacity_kw = float(cfg["solar_cap"])
            if "wind_cap" in cfg:
                manager.wind.capacity_kw = float(cfg["wind_cap"])
            if "battery_power" in cfg:
                manager.battery.capacity_kw = float(cfg["battery_power"])
            if "battery_capacity" in cfg:
                manager.battery.capacity_kwh = float(cfg["battery_capacity"])
            if "battery_charge" in cfg:
                manager.battery.set_storage_kwh(float(cfg["battery_charge"]))
            if "backup_cap" in cfg:
                manager.grid_backup.capacity_kw = float(cfg["backup_cap"])
            if "load_distribution" in cfg:
                manager.dispatcher.load_distribution = cfg["load_distribution"]

            self.send_json_response({"status": "updated", "state": manager.get_state()})
        else:
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def send_json_response(self, data: Any):
        response_bytes = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(response_bytes)


def start_server(port: int = PORT):
    server_address = ("", port)
    httpd = HTTPServer(server_address, MicrogridRequestHandler)
    print(f"============================================================")
    print(f" Smart Power Routing & Load Balancing Dashboard")
    print(f" Server running at: http://localhost:{port}")
    print(f" Open http://localhost:{port} in your browser")
    print(f" Press Ctrl+C to stop.")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    start_server(port)
