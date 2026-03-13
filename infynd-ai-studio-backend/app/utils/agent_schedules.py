import calendar
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from supabase import Client, create_client

from app.core.config import settings

VALID_FREQUENCIES = {"daily", "weekly", "monthly", "yearly", "interval"}
VALID_INTERVAL_UNITS = {"minutes", "hours", "days"}
DEFAULT_TIMEZONE = "Asia/Kolkata"

_admin_client: Client | None = None


def normalize_schedule_configs(value: Any) -> List[Dict[str, Any]]:
    raw_items = value
    if isinstance(value, dict):
        raw_items = value.get("schedules")

    if not isinstance(raw_items, list):
        return []

    normalized: List[Dict[str, Any]] = []
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue

        frequency = str(raw_item.get("frequency") or raw_item.get("type") or "daily").strip().lower()
        if frequency not in VALID_FREQUENCIES:
            continue

        interval_unit = str(raw_item.get("interval_unit") or "hours").strip().lower()
        if interval_unit not in VALID_INTERVAL_UNITS:
            interval_unit = "hours"

        weekdays: List[int] = []
        for raw_day in raw_item.get("weekdays") or []:
            try:
                day_value = int(raw_day)
            except Exception:
                continue
            if 0 <= day_value <= 6 and day_value not in weekdays:
                weekdays.append(day_value)

        day_of_month = _coerce_int(raw_item.get("day_of_month"))
        month_of_year = _coerce_int(raw_item.get("month_of_year"))
        interval_value = _coerce_int(raw_item.get("interval_value"))

        normalized.append(
            {
                "id": str(raw_item.get("id") or "").strip() or None,
                "name": str(raw_item.get("name") or "").strip() or "Scheduled Run",
                "prompt": str(raw_item.get("prompt") or "").strip(),
                "timezone": _normalize_timezone(raw_item.get("timezone")),
                "is_active": bool(raw_item.get("is_active", True)),
                "frequency": frequency,
                "time_of_day": _normalize_time_of_day(raw_item.get("time_of_day")),
                "weekdays": weekdays,
                "day_of_month": day_of_month if day_of_month and 1 <= day_of_month <= 31 else None,
                "month_of_year": month_of_year if month_of_year and 1 <= month_of_year <= 12 else None,
                "interval_value": max(1, interval_value or 1),
                "interval_unit": interval_unit,
                "cron_expression": str(raw_item.get("cron_expression") or "").strip() or None,
                "last_run_at": raw_item.get("last_run_at"),
                "last_status": raw_item.get("last_status"),
                "last_response": raw_item.get("last_response"),
            }
        )

    return normalized


def validate_schedule_configs(configs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = normalize_schedule_configs(configs)
    validated: List[Dict[str, Any]] = []

    for config in normalized:
        if not config["prompt"]:
            raise ValueError(f"Schedule '{config['name']}' must include a prompt")

        frequency = config["frequency"]
        if frequency == "weekly" and not config["weekdays"]:
            raise ValueError(f"Schedule '{config['name']}' must include at least one weekday")
        if frequency == "monthly" and not config["day_of_month"]:
            raise ValueError(f"Schedule '{config['name']}' must include a day of month")
        if frequency == "yearly":
            if not config["month_of_year"] or not config["day_of_month"]:
                raise ValueError(f"Schedule '{config['name']}' must include month and day")
            _validate_yearly_day(config["month_of_year"], config["day_of_month"])
        if frequency == "interval" and config["interval_value"] < 1:
            raise ValueError(f"Schedule '{config['name']}' must include a valid interval")

        config["cron_expression"] = build_cron_expression(config)
        validated.append(config)

    return validated


def flow_scheduler_config_payload(configs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    normalized = normalize_schedule_configs(configs)
    if not normalized:
        return None

    schedules: List[Dict[str, Any]] = []
    for config in normalized:
        schedules.append(
            {
                "id": config.get("id"),
                "name": config.get("name"),
                "prompt": config.get("prompt"),
                "timezone": config.get("timezone"),
                "is_active": config.get("is_active", True),
                "frequency": config.get("frequency"),
                "time_of_day": config.get("time_of_day"),
                "weekdays": config.get("weekdays") or [],
                "day_of_month": config.get("day_of_month"),
                "month_of_year": config.get("month_of_year"),
                "interval_value": config.get("interval_value"),
                "interval_unit": config.get("interval_unit"),
            }
        )
    return {"schedules": schedules}


def ensure_schedule_infrastructure() -> None:
    # The actual table/functions are created through the Supabase SQL migration.
    # This helper remains as a semantic no-op so callers keep a stable API.
    return None


def list_agent_schedules(agent_id: str) -> List[Dict[str, Any]]:
    rows = _select_schedule_rows({"agent_id": agent_id}, order_by="created_at")
    return [_serialize_schedule_row(row) for row in rows]


def get_agent_schedule(schedule_id: str) -> Optional[Dict[str, Any]]:
    row = _select_one_schedule_row({"id": schedule_id})
    return _serialize_schedule_row(row) if row else None


def sync_agent_schedules(agent: Dict[str, Any], schedules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ensure_schedule_infrastructure()

    agent_id = str(agent.get("id") or "")
    if not agent_id:
        raise ValueError("Agent id is required to sync schedules")

    current_agent = _fetch_agent(agent_id) or agent
    workspace_id = str(current_agent.get("workspace_id") or "") or None
    created_by = str(current_agent.get("created_by") or "") or None

    validated = validate_schedule_configs(schedules)
    existing_rows = {row["id"]: row for row in list_agent_schedules(agent_id) if row.get("id")}
    next_ids: set[str] = set()

    for config in validated:
        schedule_id = str(config.get("id") or "").strip() or str(uuid.uuid4())
        job_name = _build_job_name(created_by or "user", agent_id, schedule_id)
        previous = existing_rows.get(schedule_id)
        trigger_token = str((previous or {}).get("trigger_token") or uuid.uuid4().hex)

        if previous and (previous.get("cron_job_id") or previous.get("cron_job_name")):
            _unschedule_job(previous)

        schedule_config = dict(config)
        schedule_config["id"] = schedule_id

        row_payload = {
            "id": schedule_id,
            "agent_id": agent_id,
            "workspace_id": workspace_id,
            "created_by": created_by,
            "name": config["name"],
            "prompt": config["prompt"],
            "frequency": config["frequency"],
            "timezone": config["timezone"],
            "cron_expression": config["cron_expression"],
            "schedule_config": schedule_config,
            "is_active": config["is_active"],
            "cron_job_id": None,
            "cron_job_name": job_name if config["is_active"] else None,
            "trigger_token": trigger_token,
            "last_run_at": previous.get("last_run_at") if previous else config.get("last_run_at"),
            "last_status": previous.get("last_status") if previous else config.get("last_status"),
            "last_response": previous.get("last_response") if previous else config.get("last_response"),
        }
        _upsert_schedule_row(row_payload)

        cron_job_id = None
        if config["is_active"]:
            cron_job_id = _schedule_job(
                schedule_id=schedule_id,
                job_name=job_name,
                cron_expression=config["cron_expression"],
                trigger_token=trigger_token,
            )
            _update_schedule_row(
                schedule_id,
                {
                    "cron_job_id": cron_job_id,
                    "cron_job_name": job_name,
                },
            )

        next_ids.add(schedule_id)

    removed_ids = [schedule_id for schedule_id in existing_rows if schedule_id not in next_ids]
    for schedule_id in removed_ids:
        previous = existing_rows[schedule_id]
        _unschedule_job(previous)
        _delete_schedule_row(schedule_id)

    synced = list_agent_schedules(agent_id)
    _sync_agent_scheduler_config(agent_id, synced)
    return synced


def delete_agent_schedules(agent_id: str) -> None:
    rows = list_agent_schedules(agent_id)
    for row in rows:
        _unschedule_job(row)
        _delete_schedule_row(str(row["id"]))
    _sync_agent_scheduler_config(agent_id, [])


def mark_schedule_running(schedule_id: str) -> Optional[str]:
    schedule = get_agent_schedule(schedule_id)
    if not schedule:
        return None

    started_at = datetime.now(timezone.utc).isoformat()
    run_id = str(uuid.uuid4())
    _insert_schedule_run(
        {
            "id": run_id,
            "schedule_id": schedule_id,
            "agent_id": schedule.get("agent_id"),
            "workspace_id": schedule.get("workspace_id"),
            "created_by": schedule.get("created_by"),
            "status": "running",
            "request_payload": {
                "message": schedule.get("prompt") or "",
                "history": [],
                "stream": False,
                "enable_thinking": False,
            },
            "response_payload": None,
            "error_message": None,
            "started_at": started_at,
            "completed_at": None,
            "duration_ms": None,
        }
    )
    _update_schedule_row(
        schedule_id,
        {
            "last_status": "running",
            "last_response": None,
        },
    )
    return run_id


def record_schedule_result(
    schedule_id: str,
    status: str,
    response_payload: Optional[Dict[str, Any]] = None,
    *,
    run_id: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    completed_at = datetime.now(timezone.utc)
    schedule = get_agent_schedule(schedule_id)
    if not schedule:
        return

    _update_schedule_row(
        schedule_id,
        {
            "last_run_at": completed_at.isoformat(),
            "last_status": status,
            "last_response": _json_safe(response_payload or {}),
        },
    )

    target_run_id = run_id or _find_latest_running_run(schedule_id)
    if not target_run_id:
        return

    started_at = _get_run_started_at(target_run_id)
    duration_ms = None
    if started_at:
        duration_ms = max(0, int((completed_at - started_at).total_seconds() * 1000))

    _update_schedule_run(
        target_run_id,
        {
            "status": status,
            "response_payload": _json_safe(response_payload or {}),
            "error_message": error_message,
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms,
        },
    )


def list_user_scheduled_tasks(user_id: str) -> List[Dict[str, Any]]:
    tasks = [_serialize_schedule_row(row) for row in _select_schedule_rows({"created_by": user_id}, order_by="created_at", descending=True)]
    agent_names = _agent_name_map([task.get("agent_id") for task in tasks])
    for task in tasks:
        task["agent_name"] = agent_names.get(task.get("agent_id"))
    return tasks


def list_user_schedule_runs(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    client = _get_admin_client()
    try:
        res = (
            client.table("agent_schedule_runs")
            .select("*")
            .eq("created_by", user_id)
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc

    runs = res.data or []
    agent_names = _agent_name_map([row.get("agent_id") for row in runs])
    schedule_names = _schedule_name_map([row.get("schedule_id") for row in runs])

    for run in runs:
        run["agent_name"] = agent_names.get(run.get("agent_id"))
        run["schedule_name"] = schedule_names.get(run.get("schedule_id"))
    return runs


def get_user_schedule_overview(user_id: str) -> Dict[str, Any]:
    tasks = list_user_scheduled_tasks(user_id)
    runs = list_user_schedule_runs(user_id, limit=50)
    now = datetime.now(timezone.utc)
    day_window = now - timedelta(days=1)

    success_runs = 0
    failed_runs = 0
    for run in runs:
        started_at = _parse_datetime(run.get("started_at"))
        if not started_at or started_at < day_window:
            continue
        if run.get("status") == "success":
            success_runs += 1
        if run.get("status") == "failed":
            failed_runs += 1

    return {
        "stats": {
            "total_schedules": len(tasks),
            "active_schedules": sum(1 for task in tasks if task.get("is_active")),
            "paused_schedules": sum(1 for task in tasks if not task.get("is_active")),
            "running_schedules": sum(1 for task in tasks if task.get("last_status") == "running"),
            "success_runs_24h": success_runs,
            "failed_runs_24h": failed_runs,
        },
        "tasks": tasks[:20],
        "recent_runs": runs[:15],
    }


def delete_schedule_by_id(schedule_id: str) -> Optional[str]:
    schedule = get_agent_schedule(schedule_id)
    if not schedule:
        return None
    agent_id = str(schedule.get("agent_id") or "")
    if not agent_id:
        return None

    current = list_agent_schedules(agent_id)
    remaining = [item.get("config") | {"id": item.get("id")} for item in current if item.get("id") != schedule_id]
    agent = _fetch_agent(agent_id)
    if agent:
        sync_agent_schedules(agent, remaining)
    return agent_id


def set_schedule_active_state(schedule_id: str, is_active: bool) -> Optional[Dict[str, Any]]:
    schedule = get_agent_schedule(schedule_id)
    if not schedule:
        return None
    agent_id = str(schedule.get("agent_id") or "")
    agent = _fetch_agent(agent_id)
    if not agent:
        return None

    current = list_agent_schedules(agent_id)
    next_payload = []
    for item in current:
        config = dict(item.get("config") or {})
        config["id"] = item.get("id")
        if item.get("id") == schedule_id:
            config["is_active"] = is_active
        next_payload.append(config)

    synced = sync_agent_schedules(agent, next_payload)
    return next((item for item in synced if item.get("id") == schedule_id), None)


def build_cron_expression(config: Dict[str, Any]) -> str:
    frequency = config["frequency"]

    if frequency == "interval":
        return _build_interval_cron_expression(config)
    if frequency == "daily":
        minute, hour = _utc_hour_minute(config["time_of_day"], config["timezone"])
        return f"{minute} {hour} * * *"
    if frequency == "weekly":
        return _build_weekly_cron_expression(config)
    if frequency == "monthly":
        return _build_monthly_cron_expression(config)
    if frequency == "yearly":
        return _build_yearly_cron_expression(config)
    raise ValueError(f"Unsupported schedule frequency: {frequency}")


def build_scheduler_webhook_url(schedule_id: str) -> str:
    base_url = (
        settings.SCHEDULER_WEBHOOK_BASE_URL
        or settings.BACKEND_PUBLIC_URL
        or "http://localhost:8000"
    ).rstrip("/")
    return f"{base_url}{settings.API_V1_STR}/agents/scheduled/{schedule_id}/run"


def _build_weekly_cron_expression(config: Dict[str, Any]) -> str:
    weekdays = config.get("weekdays") or []
    minute_values: List[int] = []
    hour_values: List[int] = []
    utc_weekdays: List[int] = []
    for weekday in weekdays:
        local_date = _next_local_date_for_weekday(config["timezone"], weekday)
        local_dt = _local_datetime(config["time_of_day"], config["timezone"], local_date)
        utc_dt = local_dt.astimezone(timezone.utc)
        minute_values.append(utc_dt.minute)
        hour_values.append(utc_dt.hour)
        cron_weekday = (utc_dt.weekday() + 1) % 7
        if cron_weekday not in utc_weekdays:
            utc_weekdays.append(cron_weekday)

    minute = minute_values[0]
    hour = hour_values[0]
    utc_weekdays = sorted(utc_weekdays, key=lambda item: 7 if item == 0 else item)
    return f"{minute} {hour} * * {','.join(str(day) for day in utc_weekdays)}"


def _build_monthly_cron_expression(config: Dict[str, Any]) -> str:
    day_of_month = int(config["day_of_month"])
    timezone_name = config["timezone"]
    tzinfo = ZoneInfo(timezone_name)
    local_now = datetime.now(tzinfo)
    candidate_month = local_now.month
    candidate_year = local_now.year
    max_day = calendar.monthrange(candidate_year, candidate_month)[1]
    candidate_day = min(day_of_month, max_day)
    local_dt = _local_datetime(config["time_of_day"], timezone_name, date(candidate_year, candidate_month, candidate_day))
    if local_dt <= local_now:
        if candidate_month == 12:
            candidate_month = 1
            candidate_year += 1
        else:
            candidate_month += 1
        max_day = calendar.monthrange(candidate_year, candidate_month)[1]
        candidate_day = min(day_of_month, max_day)
        local_dt = _local_datetime(config["time_of_day"], timezone_name, date(candidate_year, candidate_month, candidate_day))

    utc_dt = local_dt.astimezone(timezone.utc)
    return f"{utc_dt.minute} {utc_dt.hour} {utc_dt.day} * *"


def _build_yearly_cron_expression(config: Dict[str, Any]) -> str:
    month_of_year = int(config["month_of_year"])
    day_of_month = int(config["day_of_month"])
    _validate_yearly_day(month_of_year, day_of_month)
    timezone_name = config["timezone"]
    tzinfo = ZoneInfo(timezone_name)
    local_now = datetime.now(tzinfo)
    candidate_year = local_now.year
    local_dt = _local_datetime(config["time_of_day"], timezone_name, date(candidate_year, month_of_year, day_of_month))
    if local_dt <= local_now:
        candidate_year += 1
        local_dt = _local_datetime(config["time_of_day"], timezone_name, date(candidate_year, month_of_year, day_of_month))

    utc_dt = local_dt.astimezone(timezone.utc)
    return f"{utc_dt.minute} {utc_dt.hour} {utc_dt.day} {utc_dt.month} *"


def _build_interval_cron_expression(config: Dict[str, Any]) -> str:
    interval_value = int(config.get("interval_value") or 1)
    interval_unit = config.get("interval_unit") or "hours"
    minute, hour = _utc_hour_minute(config["time_of_day"], config["timezone"])

    if interval_unit == "minutes":
        return f"*/{interval_value} * * * *"
    if interval_unit == "hours":
        return f"{minute} */{interval_value} * * *"
    if interval_unit == "days":
        return f"{minute} {hour} */{interval_value} * *"
    raise ValueError(f"Unsupported interval unit: {interval_unit}")


def _validate_yearly_day(month_of_year: int, day_of_month: int) -> None:
    max_day = calendar.monthrange(datetime.utcnow().year, month_of_year)[1]
    if day_of_month > max_day:
        raise ValueError(f"Day {day_of_month} is invalid for month {month_of_year}")


def _normalize_timezone(value: Any) -> str:
    candidate = str(value or DEFAULT_TIMEZONE).strip() or DEFAULT_TIMEZONE
    aliases = {
        "ist": DEFAULT_TIMEZONE,
        "india": DEFAULT_TIMEZONE,
        "asia/calcutta": DEFAULT_TIMEZONE,
        "utc+5:30": DEFAULT_TIMEZONE,
    }
    normalized = aliases.get(candidate.lower(), candidate)
    try:
        ZoneInfo(normalized)
        return normalized
    except Exception:
        return DEFAULT_TIMEZONE


def _normalize_time_of_day(value: Any) -> str:
    candidate = str(value or "09:00").strip() or "09:00"
    try:
        hour_str, minute_str = candidate.split(":", 1)
        hour = max(0, min(23, int(hour_str)))
        minute = max(0, min(59, int(minute_str)))
        return f"{hour:02d}:{minute:02d}"
    except Exception:
        return "09:00"


def _utc_hour_minute(time_of_day: str, timezone_name: str) -> Tuple[int, int]:
    local_dt = _local_datetime(_normalize_time_of_day(time_of_day), timezone_name, datetime.now(ZoneInfo(timezone_name)).date())
    utc_dt = local_dt.astimezone(timezone.utc)
    return utc_dt.minute, utc_dt.hour


def _local_datetime(time_of_day: str, timezone_name: str, target_date: date) -> datetime:
    hour_str, minute_str = _normalize_time_of_day(time_of_day).split(":", 1)
    return datetime.combine(
        target_date,
        time(hour=int(hour_str), minute=int(minute_str)),
        tzinfo=ZoneInfo(timezone_name),
    )


def _next_local_date_for_weekday(timezone_name: str, weekday: int) -> date:
    tzinfo = ZoneInfo(timezone_name)
    local_now = datetime.now(tzinfo)
    current_weekday = local_now.weekday()
    target_weekday = (weekday + 6) % 7
    delta_days = (target_weekday - current_weekday) % 7
    return (local_now + timedelta(days=delta_days)).date()


def _select_schedule_rows(filters: Dict[str, Any], *, order_by: Optional[str] = None, descending: bool = False) -> List[Dict[str, Any]]:
    client = _get_admin_client()
    try:
        query = client.table("agent_schedules").select("*")
        for key, value in filters.items():
            query = query.eq(key, value)
        if order_by:
            query = query.order(order_by, desc=descending)
        res = query.execute()
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc
    return res.data or []


def _select_one_schedule_row(filters: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    rows = _select_schedule_rows(filters)
    return rows[0] if rows else None


def _serialize_schedule_row(row: Dict[str, Any]) -> Dict[str, Any]:
    config = dict(row.get("schedule_config") or {})
    config["id"] = row.get("id")
    config["name"] = row.get("name")
    config["prompt"] = row.get("prompt")
    config["timezone"] = _normalize_timezone(row.get("timezone"))
    config["is_active"] = bool(row.get("is_active", True))
    config["frequency"] = row.get("frequency")
    config["cron_expression"] = row.get("cron_expression")
    config["last_run_at"] = row.get("last_run_at")
    config["last_status"] = row.get("last_status")
    config["last_response"] = row.get("last_response")
    config["time_of_day"] = _normalize_time_of_day(config.get("time_of_day"))

    return {
        "id": row.get("id"),
        "agent_id": row.get("agent_id"),
        "workspace_id": row.get("workspace_id"),
        "created_by": row.get("created_by"),
        "name": row.get("name"),
        "prompt": row.get("prompt"),
        "frequency": row.get("frequency"),
        "timezone": row.get("timezone"),
        "cron_expression": row.get("cron_expression"),
        "is_active": bool(row.get("is_active", True)),
        "cron_job_id": row.get("cron_job_id"),
        "cron_job_name": row.get("cron_job_name"),
        "trigger_token": row.get("trigger_token"),
        "last_run_at": row.get("last_run_at"),
        "last_status": row.get("last_status"),
        "last_response": row.get("last_response"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "config": config,
    }


def _upsert_schedule_row(payload: Dict[str, Any]) -> None:
    client = _get_admin_client()
    try:
        existing = _select_one_schedule_row({"id": payload["id"]})
        if existing:
            _update_schedule_row(payload["id"], payload)
        else:
            res = client.table("agent_schedules").insert(payload).execute()
            if not res.data:
                raise RuntimeError("Insert returned no data")
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc


def _update_schedule_row(schedule_id: str, payload: Dict[str, Any]) -> None:
    client = _get_admin_client()
    update_payload = {key: value for key, value in payload.items() if key != "id"}
    try:
        res = client.table("agent_schedules").update(update_payload).eq("id", schedule_id).execute()
        if not res.data:
            raise RuntimeError("Update returned no data")
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc


def _delete_schedule_row(schedule_id: str) -> None:
    client = _get_admin_client()
    try:
        client.table("agent_schedules").delete().eq("id", schedule_id).execute()
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc


def _insert_schedule_run(payload: Dict[str, Any]) -> None:
    client = _get_admin_client()
    try:
        res = client.table("agent_schedule_runs").insert(payload).execute()
        if not res.data:
            raise RuntimeError("Run insert returned no data")
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc


def _update_schedule_run(run_id: str, payload: Dict[str, Any]) -> None:
    client = _get_admin_client()
    try:
        client.table("agent_schedule_runs").update(payload).eq("id", run_id).execute()
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc


def _find_latest_running_run(schedule_id: str) -> Optional[str]:
    client = _get_admin_client()
    try:
        res = (
            client.table("agent_schedule_runs")
            .select("id")
            .eq("schedule_id", schedule_id)
            .eq("status", "running")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc
    if not res.data:
        return None
    return str(res.data[0]["id"])


def _get_run_started_at(run_id: str) -> Optional[datetime]:
    client = _get_admin_client()
    try:
        res = client.table("agent_schedule_runs").select("started_at").eq("id", run_id).limit(1).execute()
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc
    if not res.data:
        return None
    return _parse_datetime(res.data[0].get("started_at"))


def _sync_agent_scheduler_config(agent_id: str, schedules: List[Dict[str, Any]]) -> None:
    agent = _fetch_agent(agent_id)
    if not agent:
        return
    flow_data = dict(agent.get("flow_data") or {})
    flow_data["scheduler_config"] = flow_scheduler_config_payload([row.get("config") | {"id": row.get("id")} for row in schedules])
    client = _get_admin_client()
    try:
        client.table("agents").update({"flow_data": flow_data}).eq("id", agent_id).execute()
    except Exception:
        return


def _schedule_job(*, schedule_id: str, job_name: str, cron_expression: str, trigger_token: str) -> Optional[int]:
    client = _get_admin_client()
    try:
        res = client.rpc(
            "infynd_schedule_agent_job",
            {
                "p_job_name": job_name,
                "p_cron_expression": cron_expression,
                "p_webhook_url": build_scheduler_webhook_url(schedule_id),
                "p_schedule_id": schedule_id,
                "p_trigger_token": trigger_token,
            },
        ).execute()
    except Exception as exc:
        raise RuntimeError(_migration_error(str(exc))) from exc
    data = res.data
    if isinstance(data, list):
        return data[0] if data else None
    return data


def _unschedule_job(schedule_row: Dict[str, Any]) -> None:
    client = _get_admin_client()
    try:
        client.rpc(
            "infynd_unschedule_agent_job",
            {
                "p_job_name": schedule_row.get("cron_job_name"),
                "p_job_id": schedule_row.get("cron_job_id"),
            },
        ).execute()
    except Exception:
        return


def _build_job_name(user_id: str, agent_id: str, schedule_id: str) -> str:
    safe_user = user_id.replace("-", "_")
    safe_agent = agent_id.replace("-", "_")
    safe_schedule = schedule_id.replace("-", "_")
    return f"agent_job_{safe_user}_{safe_agent}_{safe_schedule}"[:200]


def _fetch_agent(agent_id: str) -> Optional[Dict[str, Any]]:
    client = _get_admin_client()
    try:
        res = client.table("agents").select("id,workspace_id,created_by,flow_data").eq("id", agent_id).limit(1).execute()
    except Exception:
        return None
    if not res.data:
        return None
    return res.data[0]


def _agent_name_map(agent_ids: List[Any]) -> Dict[str, str]:
    unique_ids = [str(agent_id) for agent_id in agent_ids if agent_id]
    if not unique_ids:
        return {}
    client = _get_admin_client()
    try:
        res = client.table("agents").select("id,name").in_("id", unique_ids).execute()
    except Exception:
        return {}
    return {str(row.get("id")): str(row.get("name") or "") for row in res.data or []}


def _schedule_name_map(schedule_ids: List[Any]) -> Dict[str, str]:
    unique_ids = [str(schedule_id) for schedule_id in schedule_ids if schedule_id]
    if not unique_ids:
        return {}
    client = _get_admin_client()
    try:
        res = client.table("agent_schedules").select("id,name").in_("id", unique_ids).execute()
    except Exception:
        return {}
    return {str(row.get("id")): str(row.get("name") or "") for row in res.data or []}


def _coerce_int(value: Any) -> Optional[int]:
    try:
        return int(value)
    except Exception:
        return None


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    return str(value)


def _migration_error(message: str) -> str:
    return (
        "Supabase scheduler SQL is not installed or is out of date. "
        "Run the scheduler migration in your Supabase SQL editor. "
        f"Original error: {message}"
    )


def _get_admin_client() -> Client:
    global _admin_client
    if _admin_client is None:
        url = settings.SUPABASE_URL
        key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
        if not url or not key:
            raise RuntimeError("Supabase service credentials are not configured for scheduler support")
        _admin_client = create_client(url, key)
    return _admin_client
