# Разработка

1. Создайте ветку от `main` под одну задачу.
2. Установите зависимости: `uv sync --frozen`.
3. Для изменения поведения добавьте тест важного сценария.
4. Перед коммитом выполните:

```sh
TEST_DATABASE_URL=postgresql://pitwall:pitwall_local@127.0.0.1:5433/pitwall_test uv run --frozen pytest -q
npm run check
npm test
```

Для JavaScript нужен Node.js 22+. У клиента нет npm-зависимостей, поэтому `npm install` не требуется.

Внешние API в тестах подменяются: обычный запуск тестов не должен обращаться к Jolpica или OpenF1. Обновление снимков — отдельная операция через `refresh_data.py`; сохраняйте сведения об источнике и времени получения.

Не коммитьте `.env`, виртуальные окружения, SQLite-кеш, локальные настройки хостинга и результаты временных проверок. Используйте небольшие тематические коммиты, например `feat(api): ...`, `fix(analysis): ...`, `test: ...`, `docs: ...`.

## База данных и миграции

```sh
cp .env.example .env
docker compose up -d db
docker compose exec db createdb -U pitwall pitwall_test
uv run alembic upgrade head
uv run python -m backend.import_data
```

Тестовый пользователь должен иметь право создавать схемы в тестовой базе. Fixtures создают уникальную схему, применяют настоящую миграцию, затем удаляют только эту схему. Не используйте production-базу для тестов.

После изменения `backend/models.py`:

```sh
uv run alembic revision --autogenerate -m "describe schema change"
# Проверьте сгенерированные upgrade и downgrade вручную.
uv run alembic upgrade head
uv run alembic check
```

На пустой тестовой базе проверяйте также `alembic downgrade base` и повторный `upgrade head`. Downgrade удаляет таблицы и их данные; на рабочей базе его не запускают без отдельного плана восстановления. Перед миграциями рабочей базы делайте резервную копию PostgreSQL через `pg_dump`.
