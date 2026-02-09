from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class LiveStreamSubscription(Base):
    __tablename__ = "live_stream_subs"

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), unique=True, nullable=False)
    
    # JSON list of category_ids to INCLUDE. 
    # If empty/null, we might assume NONE are included (opt-in).
    included_categories = Column(JSON, default=list)
    
    # JSON list of stream_ids to EXCLUDE within the included categories.
    excluded_streams = Column(JSON, default=list)
    
    # Relation to Subscription
    subscription = relationship("Subscription")
