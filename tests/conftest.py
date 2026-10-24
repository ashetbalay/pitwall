"""Database tests use isolated schemas in a dedicated PostgreSQL test database."""
import os
import subprocess
import uuid

import psycopg
import pytest
from sqlalchemy.engine import make_url


@pytest.fixture
def database_url(monkeypatch):
    value = os.environ.get("TEST_DATABASE_URL")
    if not value:
        pytest.fail("Set TEST_DATABASE_URL to a disposable PostgreSQL database (see CONTRIBUTING.md)")
    url = make_url(value)
    schema = "test_" + uuid.uuid4().hex
    connection_url = url.set(drivername="postgresql").render_as_string(hide_password=False)
    with psycopg.connect(connection_url, autocommit=True) as connection:
        connection.execute(f'CREATE SCHEMA "{schema}"')
        try:
            test_url = url.update_query_dict({"options": f"-csearch_path={schema}"}).render_as_string(hide_password=False)
            monkeypatch.setenv("DATABASE_URL", test_url)
            subprocess.run([os.sys.executable, "-m", "alembic", "upgrade", "head"], check=True, capture_output=True)
            yield test_url
        finally:
            connection.execute(f'DROP SCHEMA "{schema}" CASCADE')
