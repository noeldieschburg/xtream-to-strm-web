from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from app.api import deps
from app.models.subscription import Subscription
from app.models.live import LiveStreamSubscription
from app.services.xtream import XtreamClient
from app import schemas
from app.db.base import Base

router = APIRouter()

@router.get("/categories", response_model=List[Any])
async def get_live_categories(
    db: Session = Depends(deps.get_db),
    subscription_id: int = Query(...) # Make subscription_id mandatory
) -> Any:
    """
    Get all live categories from the Xtream provider.
    """
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    client = XtreamClient(sub.xtream_url, sub.username, sub.password)
    try:
        categories = await client.get_live_categories()
        return categories
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch categories: {str(e)}")


@router.get("/streams/{category_id}", response_model=List[Any])
async def get_live_streams(
    category_id: str,
    db: Session = Depends(deps.get_db),
    subscription_id: int = Query(...)
) -> Any:
    """
    Get live streams for a specific category from the Xtream provider.
    """
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    client = XtreamClient(sub.xtream_url, sub.username, sub.password)
    try:
        streams = await client.get_live_streams(category_id)
        return streams
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch streams: {str(e)}")


@router.get("/config", response_model=schemas.LiveConfig)
def get_live_config(
    db: Session = Depends(deps.get_db),
    subscription_id: int = Query(...)
) -> Any:
    """
    Get current Live Stream configuration for a subscription.
    """
    config = db.query(LiveStreamSubscription).filter(LiveStreamSubscription.subscription_id == subscription_id).first()
    if not config:
        return schemas.LiveConfig(id=0, subscription_id=subscription_id, included_categories=[], excluded_streams=[])
    return config


@router.post("/config", response_model=schemas.LiveConfig)
def save_live_config(
    config_in: schemas.LiveConfigUpdate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Save Live Stream configuration.
    """
    sub_id = config_in.subscription_id
    
    config = db.query(LiveStreamSubscription).filter(LiveStreamSubscription.subscription_id == sub_id).first()
    if not config:
        config = LiveStreamSubscription(subscription_id=sub_id)
        db.add(config)
    
    config.included_categories = config_in.included_categories
    config.excluded_streams = config_in.excluded_streams
    
    db.commit()
    db.refresh(config)
    return config


@router.get("/playlist.m3u")
async def generate_m3u_playlist(
    db: Session = Depends(deps.get_db),
    subscription_id: int = Query(...)
):
    """
    Generate M3U playlist based on saved configuration.
    """
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    config = db.query(LiveStreamSubscription).filter(LiveStreamSubscription.subscription_id == subscription_id).first()
    if not config or not config.included_categories:
        return Response(content="#EXTM3U\n", media_type="text/plain")

    client = XtreamClient(sub.xtream_url, sub.username, sub.password)
    
    m3u_content = ["#EXTM3U"]
    
    # Iterate through included categories
    for cat_id in config.included_categories:
        try:
            streams = await client.get_live_streams(cat_id)
            for stream in streams:
                # Skip excluded streams
                if str(stream.get("stream_id")) in config.excluded_streams:
                    continue
                
                # Format M3U entry
                # #EXTINF:-1 tvg-id="" tvg-name="..." tvg-logo="..." group-title="...",Stream Name
                # http://url/live/user/pass/stream_id.ts
                
                stream_id = stream.get("stream_id")
                name = stream.get("name")
                logo = stream.get("stream_icon", "")
                epg_id = stream.get("epg_channel_id", "")
                
                # We need category name, but getting it might be expensive if not passed. 
                # For V1 let's assume client handles group-title or we fetch categories once.
                # Optimization: Fetch all categories once to map IDs to Names? 
                # Or just use the category ID if name is missing? 
                # Xtream get_live_streams usually returns category_id but not name directly in item?
                # Actually typically it does or we can look it up.
                # Let's check what 'stream' dict contains. usually 'category_id'.
                
                # Build URL
                stream_url = f"{sub.xtream_url}/live/{sub.username}/{sub.password}/{stream_id}.ts"
                
                extinf = f'#EXTINF:-1 tvg-id="{epg_id}" tvg-name="{name}" tvg-logo="{logo}" group-title="Category {cat_id}",{name}'
                m3u_content.append(extinf)
                m3u_content.append(stream_url)
                
        except Exception as e:
            print(f"Error fetching streams for category {cat_id}: {e}")
            continue

    return Response(content="\n".join(m3u_content), media_type="text/plain")
