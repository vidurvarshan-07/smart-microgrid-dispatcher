"""
energy_sources.py
------------------
Defines the abstract EnergySource class and its concrete subclasses:
SolarPlant, WindTurbine, BatteryStorage, MainGridBackup.

OOP concepts: Abstraction, Inheritance, Polymorphism, Encapsulation.
"""

from abc import ABC, abstractmethod


class EnergySource(ABC):
    """Abstract base class for anything that can supply power to the grid."""

    def __init__(self, name: str, capacity_kw: float):
        self.name = name
        self.capacity_kw = capacity_kw

    @abstractmethod
    def get_available_power(self) -> float:
        """Return the power (kW) this source can supply right now.
        Every subclass MUST override this (polymorphism)."""
        raise NotImplementedError

    def __repr__(self):
        return f"{self.__class__.__name__}(name={self.name!r}, capacity_kw={self.capacity_kw})"


class SolarPlant(EnergySource):
    """Solar output depends on how much sunlight is currently hitting the
    panels. `sun_intensity` stands in for a light/irradiance sensor reading,
    given as a percentage of full sun (0 = night/total cloud, 100 = full sun)."""

    def __init__(self, name: str, capacity_kw: float, sun_intensity: float = 100.0):
        super().__init__(name, capacity_kw)
        self.sun_intensity = sun_intensity  # 0-100 (%), would come from a sensor

    def get_available_power(self) -> float:
        factor = max(0.0, min(self.sun_intensity, 100.0)) / 100.0
        return round(self.capacity_kw * factor, 2)


class WindTurbine(EnergySource):
    """Wind output follows a simplified cubic power curve based on wind speed."""

    CUT_IN, RATED, CUT_OUT = 3.0, 12.0, 25.0  # m/s

    def __init__(self, name: str, capacity_kw: float, wind_speed: float = 8.0):
        super().__init__(name, capacity_kw)
        self.wind_speed = wind_speed

    def get_available_power(self) -> float:
        v = self.wind_speed
        if v < self.CUT_IN or v > self.CUT_OUT:
            return 0.0
        if v >= self.RATED:
            return self.capacity_kw
        fraction = (v - self.CUT_IN) / (self.RATED - self.CUT_IN)
        return round(self.capacity_kw * fraction ** 3, 2)


class BatteryStorage(EnergySource):
    """Dual-mode source: can discharge (supply) or charge (absorb surplus).
    Internal storage is private (encapsulation) and only changed via
    charge()/discharge()/set_storage_kwh()."""

    def __init__(self, name: str, capacity_kw: float, capacity_kwh: float,
                 initial_kwh: float = 0.0):
        super().__init__(name, capacity_kw)
        self.capacity_kwh = capacity_kwh
        self._current_storage_kwh = max(0.0, min(initial_kwh, capacity_kwh))

    def get_available_power(self) -> float:
        """Max power (kW) the battery could discharge this cycle."""
        return round(min(self.capacity_kw, self._current_storage_kwh), 2)

    def discharge(self, kwh: float) -> float:
        """Remove energy from the battery; returns the amount actually discharged."""
        actual = min(kwh, self._current_storage_kwh, self.capacity_kw)
        self._current_storage_kwh -= actual
        return round(actual, 2)

    def charge(self, kwh: float) -> float:
        """Add energy to the battery; returns the amount actually absorbed."""
        room = self.capacity_kwh - self._current_storage_kwh
        actual = min(kwh, room, self.capacity_kw)
        self._current_storage_kwh += actual
        return round(actual, 2)

    def get_storage_kwh(self) -> float:
        return round(self._current_storage_kwh, 2)

    def set_storage_kwh(self, kwh: float) -> None:
        """Controlled setter — clamps to valid range instead of allowing bad values."""
        self._current_storage_kwh = max(0.0, min(kwh, self.capacity_kwh))


class MainGridBackup(EnergySource):
    """Last-resort source. Inherits base attributes, assumed always available
    up to its capacity (e.g. the utility grid connection)."""

    def get_available_power(self) -> float:
        return self.capacity_kw
