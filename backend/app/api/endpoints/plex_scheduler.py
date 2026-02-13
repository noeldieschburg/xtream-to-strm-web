from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.plex_schedule import PlexSchedule, PlexSyncType, PlexFrequency
from app.models.plex_schedule_execution import PlexScheduleExecution, PlexExecutionStatus
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()


# Schemas
class PlexScheduleConfig(BaseModel):
    type: PlexSyncType
    enabled: bool
    frequency: PlexFrequency
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None

    class Config:
        from_attributes = True


class PlexScheduleUpdate(BaseModel):
    enabled: bool
    frequency: PlexFrequency


class PlexExecutionHistoryItem(BaseModel):
    id: int
    schedule_id: int
    started_at: datetime
    completed_at: Optional[datetime]
    status: PlexExecutionStatus
    items_processed: int
    error_message: Optional[str]

    class Config:
        from_attributes = True


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/config/{server_id}", response_model=List[PlexScheduleConfig])
async def get_plex_schedule_config(
    server_id: int,
    db: Session = Depends(get_db)
):
    """Get all schedule configurations for a Plex server"""
    schedules = db.query(PlexSchedule).filter(PlexSchedule.server_id == server_id).all()

    # Ensure we have entries for both types
    if not schedules:
        # Create default schedules for this server
        for sync_type in [PlexSyncType.MOVIES, PlexSyncType.SERIES]:
            schedule = PlexSchedule(
                server_id=server_id,
                type=sync_type,
                enabled=False,
                frequency=PlexFrequency.DAILY
            )
            db.add(schedule)
        db.commit()
        schedules = db.query(PlexSchedule).filter(PlexSchedule.server_id == server_id).all()

    return schedules


@router.put("/config/{server_id}/{sync_type}", response_model=PlexScheduleConfig)
async def update_plex_schedule_config(
    server_id: int,
    sync_type: PlexSyncType,
    update: PlexScheduleUpdate,
    db: Session = Depends(get_db)
):
    """Update schedule configuration for a specific sync type and Plex server"""
    schedule = db.query(PlexSchedule).filter(
        PlexSchedule.server_id == server_id,
        PlexSchedule.type == sync_type
    ).first()

    if not schedule:
        # Create if doesn't exist
        schedule = PlexSchedule(
            server_id=server_id,
            type=sync_type
        )
        db.add(schedule)

    schedule.enabled = update.enabled
    schedule.frequency = update.frequency

    # Calculate next run if enabled
    if update.enabled:
        schedule.next_run = schedule.calculate_next_run()
    else:
        schedule.next_run = None

    db.commit()
    db.refresh(schedule)

    return schedule


@router.get("/history/{server_id}", response_model=List[PlexExecutionHistoryItem])
async def get_plex_execution_history(
    server_id: int,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    sync_type: Optional[PlexSyncType] = None,
    db: Session = Depends(get_db)
):
    """Get execution history for a Plex server with optional filtering by sync type"""
    query = db.query(PlexScheduleExecution).join(PlexSchedule).filter(
        PlexSchedule.server_id == server_id
    )

    if sync_type:
        query = query.filter(PlexSchedule.type == sync_type)

    executions = query.order_by(PlexScheduleExecution.started_at.desc()).offset(offset).limit(limit).all()

    return executions
