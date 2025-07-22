# backend/persistence.py
# Declares the BaseRepo abstract interface that every storage provider (Excel, SQL, etc.) must implement.

from abc import ABC, abstractmethod

class BaseRepo(ABC):
    @abstractmethod
    def get_locations(self):
        ...

    @abstractmethod
    def add_location(self, name: str):
        ...

    @abstractmethod
    def get_asset_types(self):
        ...

    @abstractmethod
    def add_asset_type(self, name: str):
        ...

    @abstractmethod
    def list_stations(self):
        ...

    @abstractmethod
    def create_station(self, station_obj: dict):
        ...

    @abstractmethod
    def save_repair(self, station_id: str, repair_obj: dict):
        ...

    @abstractmethod
    def save_sections(self, station_id: str, sections: dict):
        ...

    @abstractmethod
    def get_sections_for_station(self, station_id: str):
        ...
