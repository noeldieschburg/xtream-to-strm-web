"""
Unified sync history endpoint.

Aggregates execution history from all sync sources:
- Xtream (ScheduleExecution)
- Plex (PlexScheduleExecution)
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.db.session import get_db
from app.models.schedule import Schedule
from app.models.schedule_execution import ScheduleExecution
from app.models.plex_schedule import PlexSchedule
from app.models.plex_schedule_execution import PlexScheduleExecution
from app.models.subscription import Subscription
from app.models.plex_server import PlexServer

router = APIRouter()


class SyncHistoryItem(BaseModel):
    id: str  # Prefixed ID to avoid collisions (e.g., "xtream_123", "plex_456")
    source_type: str  # "xtream" or "plex"
    source_name: str
    sync_type: str  # "movies" or "series"
    started_at: datetime
    completed_at: Optional[datetime]
    duration_seconds: Optional[int]
    status: str
    items_added: int
    items_deleted: int
    items_total: int
    error_message: Optional[str]

    class Config:
        from_attributes = True


@router.get("/", response_model=List[SyncHistoryItem])
async def get_sync_history(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    source_type: Optional[str] = Query(None, description="Filter by source type: xtream, plex"),
    sync_type: Optional[str] = Query(None, description="Filter by sync type: movies, series"),
    db: Session = Depends(get_db)
):
    """Get unified sync execution history from all sources"""

    history_items: List[SyncHistoryItem] = []

    # Xtream executions
    if source_type is None or source_type == "xtream":
        xtream_query = db.query(ScheduleExecution, Schedule, Subscription).join(
            Schedule, ScheduleExecution.schedule_id == Schedule.id
        ).join(
            Subscription, Schedule.subscription_id == Subscription.id
        )

        if sync_type:
            xtream_query = xtream_query.filter(Schedule.type == sync_type)

        xtream_executions = xtream_query.order_by(
            ScheduleExecution.started_at.desc()
        ).all()

        for exec_row, schedule, subscription in xtream_executions:
            duration = None
            if exec_row.started_at and exec_row.completed_at:
                duration = int((exec_row.completed_at - exec_row.started_at).total_seconds())

            history_items.append(SyncHistoryItem(
                id=f"xtream_{exec_row.id}",
                source_type="xtream",
                source_name=subscription.name,
                sync_type=schedule.type.value if hasattr(schedule.type, 'value') else str(schedule.type),
                started_at=exec_row.started_at,
                completed_at=exec_row.completed_at,
                duration_seconds=duration,
                status=exec_row.status.value if hasattr(exec_row.status, 'value') else str(exec_row.status),
                items_added=exec_row.items_processed or 0,
                items_deleted=0,
                items_total=exec_row.items_processed or 0,
                error_message=exec_row.error_message
            ))

    # Plex executions
    if source_type is None or source_type == "plex":
        plex_query = db.query(PlexScheduleExecution, PlexSchedule, PlexServer).join(
            PlexSchedule, PlexScheduleExecution.schedule_id == PlexSchedule.id
        ).join(
            PlexServer, PlexSchedule.server_id == PlexServer.id
        )

        if sync_type:
            plex_query = plex_query.filter(PlexSchedule.type == sync_type)

        plex_executions = plex_query.order_by(
            PlexScheduleExecution.started_at.desc()
        ).all()

        for exec_row, schedule, server in plex_executions:
            duration = None
            if exec_row.started_at and exec_row.completed_at:
                duration = int((exec_row.completed_at - exec_row.started_at).total_seconds())

            history_items.append(SyncHistoryItem(
                id=f"plex_{exec_row.id}",
                source_type="plex",
                source_name=server.name,
                sync_type=schedule.type.value if hasattr(schedule.type, 'value') else str(schedule.type),
                started_at=exec_row.started_at,
                completed_at=exec_row.completed_at,
                duration_seconds=duration,
                status=exec_row.status.value if hasattr(exec_row.status, 'value') else str(exec_row.status),
                items_added=exec_row.items_processed or 0,
                items_deleted=0,
                items_total=exec_row.items_processed or 0,
                error_message=exec_row.error_message
            ))

    # Sort all by started_at descending
    history_items.sort(key=lambda x: x.started_at, reverse=True)

    # Apply pagination
    return history_items[offset:offset + limit]


@router.get("/stats")
async def get_sync_stats(db: Session = Depends(get_db)):
    """Get sync statistics summary"""

    # Count executions by status
    xtream_success = db.query(ScheduleExecution).filter(
        ScheduleExecution.status == "success"
    ).count()
    xtream_failed = db.query(ScheduleExecution).filter(
        ScheduleExecution.status == "failed"
    ).count()
    xtream_total = db.query(ScheduleExecution).count()

    plex_success = db.query(PlexScheduleExecution).filter(
        PlexScheduleExecution.status == "success"
    ).count()
    plex_failed = db.query(PlexScheduleExecution).filter(
        PlexScheduleExecution.status == "failed"
    ).count()
    plex_total = db.query(PlexScheduleExecution).count()

    total = xtream_total + plex_total
    success = xtream_success + plex_success
    failed = xtream_failed + plex_failed

    return {
        "total_executions": total,
        "successful": success,
        "failed": failed,
        "success_rate": round((success / total * 100) if total > 0 else 100, 1),
        "by_source": {
            "xtream": {"total": xtream_total, "success": xtream_success, "failed": xtream_failed},
            "plex": {"total": plex_total, "success": plex_success, "failed": plex_failed}
        }
    }
