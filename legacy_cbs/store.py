"""The legacy core's own database: customers (CIF), savings accounts and fixed deposits, each made by one operator and
authorised by another. Balances stay in Kosh's ledger; the core records who the customer is and what was opened."""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

_NUMBERING = threading.Lock()  # one process serves the core, so a lock is enough to hand out numbers in order


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class _Made:
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING_AUTH")  # PENDING_AUTH | ACTIVE
    portal_ref: Mapped[Optional[str]] = mapped_column(String(40), index=True)  # the reference keyed in from outside
    made_by: Mapped[str] = mapped_column(String(20), nullable=False)
    authorised_by: Mapped[Optional[str]] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now)
    authorised_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Customer(_Made, Base):
    __tablename__ = "cbs_customers"
    cif: Mapped[str] = mapped_column(String(12), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    pan: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    dob: Mapped[str] = mapped_column(String(10), nullable=False)  # DD/MM/YYYY, as the legacy screens take it
    mobile: Mapped[str] = mapped_column(String(10), nullable=False)
    email: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str] = mapped_column(String(50), nullable=False)
    pincode: Mapped[str] = mapped_column(String(6), nullable=False)


class Account(_Made, Base):
    __tablename__ = "cbs_accounts"
    account_number: Mapped[str] = mapped_column(String(12), primary_key=True)
    cif: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    scheme_code: Mapped[str] = mapped_column(String(12), nullable=False)
    nominee_name: Mapped[Optional[str]] = mapped_column(String(100))
    nominee_relationship: Mapped[Optional[str]] = mapped_column(String(20))


class Deposit(_Made, Base):
    __tablename__ = "cbs_deposits"
    fd_number: Mapped[str] = mapped_column(String(12), primary_key=True)
    cif: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    funding_account: Mapped[str] = mapped_column(String(12), nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tenure_months: Mapped[int] = mapped_column(Integer, nullable=False)
    rate_bp: Mapped[int] = mapped_column(Integer, nullable=False)  # basis points: 810 = 8.10% p.a.
    maturity_instruction: Mapped[str] = mapped_column(String(30), nullable=False)


def database_url() -> str:
    url = os.getenv("LEGACY_CBS_DATABASE_URL")
    if url:
        return url
    production = os.getenv("ENVIRONMENT", "").lower() in {"production", "prod"} or bool(os.getenv("K_SERVICE"))
    if production:  # its own database and DB user; never Kosh's
        raise RuntimeError("LEGACY_CBS_DATABASE_URL must be set in production")
    path = Path(__file__).resolve().parent.parent / "data" / "legacy_cbs.sqlite3"
    path.parent.mkdir(exist_ok=True)
    return f"sqlite+pysqlite:///{path}"


@lru_cache(maxsize=4)
def _sessions(url: str) -> sessionmaker:
    engine = create_engine(url, pool_pre_ping=True, future=True,
                           connect_args={"check_same_thread": False} if url.startswith("sqlite") else {})
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, expire_on_commit=False, class_=Session)
    with maker.begin() as session:
        _seed(session)
    return maker


def sessions() -> sessionmaker:
    return _sessions(database_url())


# The demo bank's existing customers, as the core knows them. Account numbers end in the last four digits Kosh shows.
_SEED_CUSTOMERS = [
    ("CIF0001001", "AARAV MEHTA", "ABCPM0001M", "12/04/1990", "9876543210", "aarav@example.com",
     "12B SEA GREEN APARTMENTS MARINE DRIVE", "MUMBAI", "400020"),
    ("CIF0001002", "SUDHIR JAISWAL", "ABCPJ0002K", "21/09/1986", "9839774797", "sudhir@example.com",
     "44 RESIDENCY ROAD", "BENGALURU", "560025"),
    ("CIF0001003", "PRIYA SHARMA", "ABCPS0003K", "15/07/1994", "9811223344", "priya@example.com",
     "B-402 GREEN MEADOWS SAKET", "NEW DELHI", "110017"),
]
_SEED_ACCOUNTS = [("109200004821", "CIF0001001", "SB_SAL_IND"), ("109200007704", "CIF0001001", "SB_GEN_IND"),
                  ("109200004797", "CIF0001002", "SB_SAL_IND"), ("109200008820", "CIF0001002", "SB_GEN_IND"),
                  ("109200003344", "CIF0001003", "SB_SAL_IND")]


def _seed(session: Session) -> None:
    if session.scalar(select(Customer.cif).limit(1)):
        return
    at = now()
    for cif, name, pan, dob, mobile, email, address, city, pincode in _SEED_CUSTOMERS:
        session.add(Customer(cif=cif, full_name=name, pan=pan, dob=dob, mobile=mobile, email=email, address=address,
                             city=city, pincode=pincode, status="ACTIVE", made_by="MIGRATION", authorised_by="MIGRATION",
                             authorised_at=at))
    for number, cif, scheme in _SEED_ACCOUNTS:
        session.add(Account(account_number=number, cif=cif, scheme_code=scheme, status="ACTIVE", made_by="MIGRATION",
                            authorised_by="MIGRATION", authorised_at=at))
    session.add(Deposit(fd_number="FD0000001042", cif="CIF0001002", funding_account="109200008820", amount_paise=50_000_000,
                        tenure_months=24, rate_bp=810, maturity_instruction="RENEW_PRINCIPAL_INTEREST", status="ACTIVE",
                        made_by="MIGRATION", authorised_by="MIGRATION", authorised_at=at))


def next_number(session: Session, column, prefix: str, width: int, start: int) -> str:
    """The next number in a series, e.g. CIF0001003. Called under _NUMBERING."""
    taken = [int(value[len(prefix):]) for value in session.scalars(select(column))
             if value.startswith(prefix) and value[len(prefix):].isdigit()]
    return f"{prefix}{max(taken + [start - 1]) + 1:0{width}d}"


numbering = _NUMBERING
