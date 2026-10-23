"""
consumer_grid.py
-----------------
Defines ConsumerGrid: a demand-side entity the dispatcher serves.
"""


class ConsumerGrid:
    """A sector of demand (e.g. Residential, Industrial) with a base demand
    and a priority used when supply is short."""

    def __init__(self, name: str, base_demand: float, priority: int = 1):
        self.name = name
        self.base_demand = base_demand
        self.priority = priority          # lower number = served first
        self.delivered_kw = 0.0           # set each cycle by the dispatcher

    def get_demand(self) -> float:
        """Return current demand in kW. Kept simple here (constant), but
        could be extended to vary by time of day."""
        return self.base_demand

    def receive(self, power_kw: float) -> None:
        """Called by the dispatcher to record how much power this grid got."""
        self.delivered_kw = round(power_kw, 2)

    @property
    def unmet_kw(self) -> float:
        return round(max(0.0, self.get_demand() - self.delivered_kw), 2)

    def __repr__(self):
        return f"ConsumerGrid(name={self.name!r}, demand={self.get_demand()}, priority={self.priority})"
