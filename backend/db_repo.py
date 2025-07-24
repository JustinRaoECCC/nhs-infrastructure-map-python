# backend/db_repo.py
# A BaseRepo subclass that defines SQLAlchemy models and implements the same interface against a relational database.

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    JSON,
)

from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from .config            import DB_URL
from .persistence      import BaseRepo

Base = declarative_base()


class Station(Base):
    __tablename__ = "stations"
    station_id     = Column(String, primary_key=True)
    name           = Column(String)
    province       = Column(String)
    lat            = Column(Float)
    lon            = Column(Float)
    status         = Column(String)
    asset_type_id  = Column(Integer, ForeignKey("asset_types.id"))
    asset_type     = relationship("AssetType", back_populates="stations")
    repairs        = relationship("Repair", back_populates="station")
    # store all user‑added extraSections as JSON
    extra_data     = Column(JSON, nullable=True, default={})

class Repair(Base):
    __tablename__ = "repairs"
    id         = Column(Integer, primary_key=True)
    station_id = Column(String, ForeignKey("stations.station_id"))
    ranking    = Column(Integer)
    cost       = Column(Float)
    frequency  = Column(String)
    station    = relationship("Station", back_populates="repairs")

class DBRepo(BaseRepo):
    def __init__(self):
        self.engine = create_engine(DB_URL, echo=False)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)

    # ─── Lookups ─────────────────────────────────────────
    def list_locations(self):
        with self.Session() as s:
            return s.query(Location).all()

    def get_locations(self):
        return [loc.name for loc in self.list_locations()]

    def get_location_by_name(self, name: str):
        with self.Session() as s:
            return s.query(Location).filter_by(name=name).first()

    def add_location(self, name: str):
        with self.Session() as s:
            if s.query(Location).filter_by(name=name).first():
                return {"success": True, "added": False}
            loc = Location(name=name)
            s.add(loc)
            s.commit()
            return {"success": True, "added": True}

    # ─── Asset Types ────────────────────────────────────
    def list_asset_types(self):
        with self.Session() as s:
            return s.query(AssetType).all()

    def get_asset_types(self):
        return [at.name for at in self.list_asset_types()]

    def get_asset_type_by_name(self, name: str):
        with self.Session() as s:
            return s.query(AssetType).filter_by(name=name).first()

    def add_asset_type(self, name: str):
        with self.Session() as s:
            if s.query(AssetType).filter_by(name=name).first():
                return {"success": True, "added": False}
            at = AssetType(name=name)
            s.add(at)
            s.commit()
            return {"success": True, "added": True}

    # ─── Stations ────────────────────────────────────────
    def list_stations(self):
        with self.Session() as s:
            return s.query(Station).all()

    def get_station_by_id(self, sid: str):
        with self.Session() as s:
            return s.query(Station).filter_by(station_id=sid).first()

    def create_station(self, station_obj: dict):
        # 1) Create the core Station row if it doesn't already exist
        sid = station_obj["generalInfo"]["stationId"]
        with self.Session() as s:
            existing = s.query(Station).filter_by(station_id=sid).first()
            if existing:
                # nothing to do, avoid UNIQUE constraint failure
                return {"success": True, "added": False, "message": "Station already exists"}

            # ensure the requested asset‑type exists (mimic Excel’s lazy‑create)
            at = s.query(AssetType).filter_by(name=station_obj["assetType"]).one_or_none()
            if at is None:
                at = AssetType(name=station_obj["assetType"])
                s.add(at)
                s.flush()    # assign it an ID in this session

            st = Station(
                station_id=sid,
                name=      station_obj["generalInfo"]["siteName"],
                province=  station_obj["generalInfo"]["province"],
                lat=       station_obj["generalInfo"]["latitude"],
                lon=       station_obj["generalInfo"]["longitude"],
                status=    station_obj["generalInfo"]["status"],
                asset_type=at,
                extra_data=station_obj.get("extraSections", {})
            )
            s.add(st)
            s.commit()

        # 2) Persist all the extraSections into the sections table
        extra = station_obj.get("extraSections", {})
        if extra:
            # sections are keyed by section name, then field name → value
            for section_name, fields in extra.items():
                for fname, fval in fields.items():
                    self.save_sections(
                        station_id=sid,
                        sections={section_name: {fname: fval}}
                    )
        return {"success": True}

    def get_sections_for_station(self, station_id: str):
        return []

    # ─── Repairs ─────────────────────────────────────────
    def save_repair(self, station_id: str, repair: dict):
        with self.Session() as s:
            r = Repair(
                station_id=station_id,
                ranking=repair.get("ranking", 0),
                cost=repair.get("cost", 0.0),
                frequency=repair.get("freq", ""),
            )
            s.add(r)
            s.commit()
            return {"success": True}

    # ─── Sections ────────────────────────────────────────
    def save_sections(self, station_id: str, sections: dict):
        """
        Store all extraSections in the station.extra_data JSON column.
        """
        with self.Session() as s:
            st = s.query(Station).filter_by(station_id=station_id).one()
            # overwrite or merge—here we replace with exactly what came in
            st.extra_data = sections
            s.commit()
            return {"success": True}
        
    # ─── Company ────────────────────────────────────────
    def get_locations_for_company(self, company_name: str):
        with self.Session() as s:
            comp = s.query(Company).filter_by(name=company_name).first()
            if not comp:
                return []
            return [loc.name for loc in comp.locations]

    def get_asset_types_for_location(self, company_name: str, location_name: str):
        with self.Session() as s:
            comp = s.query(Company).filter_by(name=company_name).first()
            if not comp:
                return []
            loc = s.query(Location).filter_by(name=location_name, company_id=comp.id).first()
            if not loc:
                return []
            return [at.name for at in loc.asset_types]

    def add_asset_type_under_location(self, asset_type_name: str, company_name: str, location_name: str):
        with self.Session() as s:
            comp = s.query(Company).filter_by(name=company_name).first()
            if not comp:
                raise ValueError(f"Company '{company_name}' does not exist.")
            loc = s.query(Location).filter_by(name=location_name, company_id=comp.id).first()
            if not loc:
                raise ValueError(f"Location '{location_name}' does not exist under Company '{company_name}'.")
            existing = s.query(AssetType).filter_by(name=asset_type_name, location_id=loc.id).first()
            if existing:
                return {"success": True, "added": False}
            at = AssetType(name=asset_type_name, location=loc)
            s.add(at)
            s.commit()
            return {"success": True, "added": True}

    def list_companies(self):
        with self.Session() as s:
            return s.query(Company).all()

    def get_companies(self):
        return [c.name for c in self.list_companies()]

    def get_company_by_name(self, name: str):
        with self.Session() as s:
            return s.query(Company).filter_by(name=name).first()

    def add_company(self, name: str, active: bool = False):
        with self.Session() as s:
            if s.query(Company).filter_by(name=name).first():
                return {"success": True, "added": False}
            c = Company(name=name)
            s.add(c)
            s.commit()
            return {"success": True, "added": True}
        
    def add_location_under_company(self, location_name: str, company_name: str):
        with self.Session() as s:
            comp = s.query(Company).filter_by(name=company_name).first()
            if not comp:
                raise ValueError(f"Company '{company_name}' does not exist.")
            existing = s.query(Location).filter_by(name=location_name, company_id=comp.id).first()
            if existing:
                return {"success": True, "added": False}
            loc = Location(name=location_name, company=comp)
            s.add(loc)
            s.commit()
            return {"success": True, "added": True}

    def get_active_filters(self):
        with self.Session() as s:
            companies = [c.name for c in s.query(Company).all()]
            locations = [l.name for l in s.query(Location).all()]
            asset_types = [a.name for a in s.query(AssetType).all()]
            return {
                "companies": companies,
                "locations": locations,
                "asset_types": asset_types
            }


class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    locations = relationship("Location", back_populates="company")


class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"))
    company = relationship("Company", back_populates="locations")
    asset_types = relationship("AssetType", back_populates="location")


class AssetType(Base):
    __tablename__ = "asset_types"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"))
    location = relationship("Location", back_populates="asset_types")
    stations = relationship("Station", back_populates="asset_type")