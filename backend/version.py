"""The project metadata is the single source of the application version."""
import tomllib
from pathlib import Path

VERSION = tomllib.loads((Path(__file__).resolve().parents[1] / "pyproject.toml").read_text())["project"]["version"]
