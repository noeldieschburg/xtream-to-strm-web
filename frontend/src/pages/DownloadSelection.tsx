import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Download, ChevronDown, ChevronRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface Media {
    id: number;
    name: string;
    cover: string;
    cat_id: string;
}

interface Episode {
    id: string;
    episode_num: string;
    title: string;
    container_extension: string;
    duration: string;
}

interface Season {
    season_number: number;
    episodes: Episode[];
}

interface SeriesDetail {
    info: any;
    seasons: Season[];
}

interface CategoryData {
    [category: string]: Media[];
}

interface Subscription {
    id: number;
    name: string;
}

interface MonitoredItem {
    id: number;
    subscription_id: number;
    media_type: string;
    media_id: string;
    title: string;
}

export default function DownloadSelection() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [selectedSubscription, setSelectedSubscription] = useState<number | null>(null);
    const [mediaType, setMediaType] = useState<'movies' | 'series'>('movies');
    const [categories, setCategories] = useState<CategoryData>({});
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [selectedMedia, setSelectedMedia] = useState<Set<number>>(new Set());
    const [selectedEpisodes, setSelectedEpisodes] = useState<Set<number>>(new Set());
    const [monitoredItems, setMonitoredItems] = useState<MonitoredItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [itemToUnmonitor, setItemToUnmonitor] = useState<{ id: number, title: string } | null>(null);

    // New state for series expansion
    const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
    const [seriesDetails, setSeriesDetails] = useState<Record<string, SeriesDetail>>({});
    const [loadingSeries, setLoadingSeries] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchSubscriptions();
        fetchMonitoredItems();
    }, []);

    // Clear selections when changing media type or subscription
    useEffect(() => {
        setSelectedMedia(new Set());
        setSelectedEpisodes(new Set());
    }, [mediaType, selectedSubscription]);

    const fetchSeriesDetails = async (seriesId: string) => {
        if (seriesDetails[seriesId] || !selectedSubscription) return;

        setLoadingSeries(prev => new Set(prev).add(seriesId));
        try {
            const res = await api.get<SeriesDetail>(`/downloads/browse/${selectedSubscription}/series/${seriesId}`);
            setSeriesDetails(prev => ({ ...prev, [seriesId]: res.data }));
        } catch (error) {
            console.error(`Failed to fetch series details for ${seriesId}`, error);
        } finally {
            setLoadingSeries(prev => {
                const newSet = new Set(prev);
                newSet.delete(seriesId);
                return newSet;
            });
        }
    };

    const fetchSubscriptions = async () => {
        try {
            const res = await api.get<Subscription[]>('/subscriptions');
            setSubscriptions(res.data);
            if (res.data.length > 0) {
                setSelectedSubscription(res.data[0].id);
            }
        } catch (error) {
            console.error("Failed to fetch subscriptions", error);
        }
    };

    const fetchMonitoredItems = async () => {
        try {
            const res = await api.get<MonitoredItem[]>('/downloads/monitored');
            setMonitoredItems(res.data);
        } catch (error) {
            console.error("Failed to fetch monitored items", error);
        }
    };

    const fetchMedia = async () => {
        if (!selectedSubscription) return;

        setLoading(true);
        try {
            const res = await api.get<{ categories: CategoryData }>(
                `/downloads/browse/${selectedSubscription}?media_type=${mediaType}`
            );
            setCategories(res.data.categories);
        } catch (error) {
            console.error("Failed to fetch media", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleMonitoring = async (mType: string, mId: string, title: string) => {
        if (!selectedSubscription) return;

        const existing = monitoredItems.find(i =>
            i.subscription_id === selectedSubscription &&
            i.media_id === mId &&
            i.media_type === mType
        );

        try {
            if (existing) {
                // Open confirmation dialog instead of window.confirm
                setItemToUnmonitor({ id: existing.id, title });
            } else {
                await api.post('/downloads/monitored', {
                    subscription_id: selectedSubscription,
                    media_type: mType,
                    media_id: mId,
                    title: title
                });
                fetchMonitoredItems();
            }
        } catch (error: any) {
            console.error("Failed to toggle monitoring", error);
            alert(`Error: ${error.response?.data?.detail || error.message || "Failed to update monitoring"}`);
        }
    };

    const confirmUnmonitor = async () => {
        if (!itemToUnmonitor) return;
        try {
            await api.delete(`/downloads/monitored/${itemToUnmonitor.id}`);
            setItemToUnmonitor(null);
            fetchMonitoredItems();
        } catch (error: any) {
            console.error("Failed to remove monitored item", error);
            alert(`Error: ${error.response?.data?.detail || error.message || "Failed to remove item"}`);
        }
    };

    const isMonitored = (mType: string, mId: string) => {
        return monitoredItems.some(i =>
            i.subscription_id === selectedSubscription &&
            i.media_id === mId &&
            i.media_type === mType
        );
    };

    const toggleCategory = (category: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(category)) {
            newExpanded.delete(category);
        } else {
            newExpanded.add(category);
        }
        setExpandedCategories(newExpanded);
    };

    const toggleMedia = (mediaId: number) => {
        const newSelected = new Set(selectedMedia);
        if (newSelected.has(mediaId)) {
            newSelected.delete(mediaId);
        } else {
            newSelected.add(mediaId);
        }
        setSelectedMedia(newSelected);
    };

    const toggleSeries = async (seriesId: string) => {
        const newExpanded = new Set(expandedSeries);
        if (newExpanded.has(seriesId)) {
            newExpanded.delete(seriesId);
        } else {
            newExpanded.add(seriesId);
            fetchSeriesDetails(seriesId);
        }
        setExpandedSeries(newExpanded);
    };

    const toggleEpisode = (episodeId: string) => {
        // We use string IDs for episodes now
        const id = Number(episodeId);
        const newSelected = new Set(selectedEpisodes);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedEpisodes(newSelected);
    };

    const toggleSeason = (_seriesId: string, season: Season) => {
        const newSelected = new Set(selectedEpisodes);
        const allSelected = season.episodes.every(ep => newSelected.has(Number(ep.id)));

        season.episodes.forEach(ep => {
            if (allSelected) {
                newSelected.delete(Number(ep.id));
            } else {
                newSelected.add(Number(ep.id));
            }
        });
        setSelectedEpisodes(newSelected);
    };

    const selectAllInCategory = (category: string) => {
        const categoryMedia = categories[category] || [];
        const newSelected = new Set(selectedMedia);
        categoryMedia.forEach(m => newSelected.add(m.id));
        setSelectedMedia(newSelected);
    };

    const queueSeriesDownload = async (seriesId: string) => {
        if (!selectedSubscription) return;
        try {
            await api.post('/downloads/queue/bulk', {
                subscription_id: selectedSubscription,
                media_ids: [seriesId],
                media_type: 'series',
            });
            alert(`Series queued for download!`);
        } catch (error: any) {
            console.error("Failed to queue series download", error);
            alert(`Failed to queue series: ${error.response?.data?.detail || error.message}`);
        }
    };

    const queueDownloads = async () => {
        if (!selectedSubscription || (selectedMedia.size === 0 && selectedEpisodes.size === 0)) return;

        try {
            const selectedMediaIds = Array.from(selectedMedia);
            const selectedEpIds = Array.from(selectedEpisodes);

            let totalQueued = 0;

            if (mediaType === 'movies') {
                if (selectedMediaIds.length > 0) {
                    // Collect movie titles
                    const titles = selectedMediaIds.map(mId => {
                        for (const cat in categories) {
                            const m = categories[cat].find(item => item.id === mId);
                            if (m) return m.name;
                        }
                        return `Movie ${mId}`;
                    });

                    await api.post('/downloads/queue/bulk', {
                        subscription_id: selectedSubscription,
                        media_ids: selectedMediaIds,
                        media_type: 'movie',
                        titles: titles
                    });
                    totalQueued += selectedMediaIds.length;
                }
            } else {
                // Series Mode

                // 1. Queue selected Series (Full)
                if (selectedMediaIds.length > 0) {
                    // Titles for series don't strictly need to be passed if expansion handles it, 
                    // but we can pass them anyway for safety
                    const titles = selectedMediaIds.map(mId => {
                        for (const cat in categories) {
                            const m = categories[cat].find(item => item.id === mId);
                            if (m) return m.name;
                        }
                        return `Series ${mId}`;
                    });

                    await api.post('/downloads/queue/bulk', {
                        subscription_id: selectedSubscription,
                        media_ids: selectedMediaIds,
                        media_type: 'series',
                        titles: titles
                    });
                    totalQueued += selectedMediaIds.length;
                }

                // 2. Queue selected Episodes
                if (selectedEpIds.length > 0) {
                    // Build explicit titles for episodes: Series Name - SXXEYY - Title
                    const titles = selectedEpIds.map(epId => {
                        for (const sId in seriesDetails) {
                            const detail = seriesDetails[sId];
                            for (const season of detail.seasons) {
                                const ep = season.episodes.find(e => Number(e.id) === epId);
                                if (ep) {
                                    const sName = detail.info?.name || "Series";
                                    const epInfo = `S${season.season_number.toString().padStart(2, '0')}E${ep.episode_num.toString().padStart(2, '0')}`;
                                    const epTitle = ep.title ? ` - ${ep.title}` : "";
                                    return `${sName} - ${epInfo}${epTitle}`;
                                }
                            }
                        }
                        return `Episode ${epId}`;
                    });

                    await api.post('/downloads/queue/bulk', {
                        subscription_id: selectedSubscription,
                        media_ids: selectedEpIds,
                        media_type: 'episode',
                        titles: titles
                    });
                    totalQueued += selectedEpIds.length;
                }
            }

            alert(`${totalQueued} items queued!`);
            setSelectedMedia(new Set());
            setSelectedEpisodes(new Set());
        } catch (error: any) {
            console.error("Failed to queue downloads", error);
            alert(`Failed to queue downloads: ${error.response?.data?.detail || error.message}`);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Download Selection</h2>
                    <p className="text-muted-foreground">Browse and select media to download or monitor</p>
                </div>
                <Button variant="outline" onClick={() => api.post('/downloads/monitored/check')}>
                    <Download className="mr-2 h-4 w-4" />
                    Force Sync Check
                </Button>
            </div>

            {/* Controls */}
            <Card>
                <CardHeader>
                    <CardTitle>Selection Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div>
                            <label className="text-sm font-medium">Subscription</label>
                            <select
                                className="w-full mt-1 p-2 border rounded"
                                value={selectedSubscription || ''}
                                onChange={(e) => setSelectedSubscription(Number(e.target.value))}
                            >
                                {subscriptions.map(sub => (
                                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Media Type</label>
                            <select
                                className="w-full mt-1 p-2 border rounded"
                                value={mediaType}
                                onChange={(e) => setMediaType(e.target.value as 'movies' | 'series')}
                            >
                                <option value="movies">Movies</option>
                                <option value="series">Series</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <Button onClick={fetchMedia} disabled={loading} className="w-full">
                                {loading ? 'Loading...' : 'Browse Media'}
                            </Button>
                        </div>
                    </div>

                    {(selectedMedia.size > 0 || selectedEpisodes.size > 0) && (
                        <div className="flex items-center justify-between p-4 bg-blue-50 rounded">
                            <span className="font-medium">{selectedMedia.size + selectedEpisodes.size} items selected</span>
                            <Button onClick={queueDownloads}>
                                <Download className="mr-2 h-4 w-4" />
                                Queue Downloads
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Media Browser */}
            <Card>
                <CardHeader>
                    <CardTitle>Available Media</CardTitle>
                </CardHeader>
                <CardContent>
                    {Object.keys(categories).length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                            Select a subscription and click "Browse Media" to start
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {Object.entries(categories).map(([category, mediaList]) => {
                                const catId = mediaList[0]?.cat_id;
                                const monitorType = mediaType === 'movies' ? 'category_movie' : 'category_series';
                                const monitored = isMonitored(monitorType, catId);

                                return (
                                    <div key={category} className="border rounded-lg">
                                        <div
                                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 bg-gray-50/50"
                                            onClick={() => toggleCategory(category)}
                                        >
                                            <div className="flex items-center gap-2">
                                                {expandedCategories.has(category) ? (
                                                    <ChevronDown className="h-4 w-4" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4" />
                                                )}
                                                <span className="font-medium">{category}</span>
                                                <span className="text-sm text-muted-foreground">
                                                    ({mediaList.length} items)
                                                </span>
                                                {monitored && (
                                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                                                        <Eye className="w-3 h-3" /> Monitored
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant={monitored ? "destructive" : "secondary"}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleMonitoring(monitorType, catId, `Category: ${category}`);
                                                    }}
                                                    title={monitored ? "Stop monitoring this category" : "Auto-download new items in this category"}
                                                    className="h-8"
                                                >
                                                    {monitored ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                                                    <span className="text-xs">{monitored ? 'Unmonitor' : 'Monitor'}</span>
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        selectAllInCategory(category);
                                                    }}
                                                    className="h-8 text-xs"
                                                >
                                                    Select All
                                                </Button>
                                            </div>
                                        </div>

                                        {expandedCategories.has(category) && (
                                            <div className="divide-y">
                                                {mediaList.map(media => {
                                                    const seriesMonitored = mediaType === 'series' && isMonitored('series', String(media.id));
                                                    const isExpanded = mediaType === 'series' && expandedSeries.has(String(media.id));
                                                    const details = seriesDetails[String(media.id)];
                                                    const isLoading = loadingSeries.has(String(media.id));

                                                    return (
                                                        <div key={media.id} className="bg-white">
                                                            <div className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    {mediaType === 'series' && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-6 w-6 p-0"
                                                                            onClick={() => toggleSeries(String(media.id))}
                                                                        >
                                                                            {isLoading ? (
                                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                            ) : isExpanded ? (
                                                                                <ChevronDown className="h-4 w-4" />
                                                                            ) : (
                                                                                <ChevronRight className="h-4 w-4" />
                                                                            )}
                                                                        </Button>
                                                                    )}

                                                                    {(mediaType === 'movies' || !isExpanded) && (
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedMedia.has(media.id)}
                                                                            onChange={() => toggleMedia(media.id)}
                                                                            className="w-4 h-4 rounded border-gray-300"
                                                                        />
                                                                    )}

                                                                    {media.cover && (
                                                                        <img
                                                                            src={media.cover}
                                                                            alt={media.name}
                                                                            className="w-10 h-14 object-cover rounded shadow-sm"
                                                                        />
                                                                    )}
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-sm">{media.name}</span>
                                                                        {seriesMonitored && (
                                                                            <span className="text-[10px] text-green-600 font-medium flex items-center gap-1">
                                                                                <Eye className="w-3 h-3" /> Auto-downloading episodes
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    {mediaType === 'series' ? (
                                                                        <Button
                                                                            size="sm"
                                                                            variant={seriesMonitored ? "destructive" : "ghost"}
                                                                            onClick={() => toggleMonitoring('series', String(media.id), media.name)}
                                                                            title="Monitor this series"
                                                                            className="h-8 w-8 p-0"
                                                                        >
                                                                            {seriesMonitored ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                                        </Button>
                                                                    ) : null}

                                                                    {!isExpanded && (
                                                                        <Button
                                                                            size="sm"
                                                                            variant="default"
                                                                            onClick={() => {
                                                                                // Queue single download
                                                                                if (mediaType === 'series') {
                                                                                    // TODO: Queue full series
                                                                                    queueSeriesDownload(String(media.id));
                                                                                } else {
                                                                                    toggleMedia(media.id);
                                                                                    // Ideally direct queue, but for now we follow selection flow or add direct queue
                                                                                    // Let's make it direct queue similar to queueDownloads but for one item?
                                                                                    // Current flow relies on selection. 
                                                                                    // Let's just select it and trigger queue logic?
                                                                                    // Actually buttons in rows implies "Action".
                                                                                    // Let's implement queueSingle(media).
                                                                                }
                                                                            }}
                                                                            className="h-8 px-3 text-xs"
                                                                        >
                                                                            <Download className="w-3 h-3 mr-1" />
                                                                            Download
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Series Expansion */}
                                                            {isExpanded && details && (
                                                                <div className="bg-gray-50/50 p-3 pl-12 border-t border-gray-100 inset-shadow">
                                                                    {details.seasons.map(season => {
                                                                        const allSeasonSelected = season.episodes.every(ep => selectedEpisodes.has(Number(ep.id)));

                                                                        return (
                                                                            <div key={season.season_number} className="mb-4 last:mb-0">
                                                                                <div className="flex items-center gap-2 mb-2">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={allSeasonSelected}
                                                                                        onChange={() => toggleSeason(String(media.id), season)}
                                                                                        className="w-4 h-4 rounded border-gray-300"
                                                                                    />
                                                                                    <span className="font-semibold text-sm">Season {season.season_number}</span>
                                                                                    <span className="text-xs text-muted-foreground">({season.episodes.length} episodes)</span>
                                                                                </div>
                                                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pl-6">
                                                                                    {season.episodes.map(ep => (
                                                                                        <div key={ep.id} className="flex items-center gap-2 bg-white border rounded p-2 text-sm">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={selectedEpisodes.has(Number(ep.id))}
                                                                                                onChange={() => toggleEpisode(ep.id)}
                                                                                                className="w-3 h-3 rounded border-gray-300"
                                                                                            />
                                                                                            <div className="flex-1 truncate" title={ep.title}>
                                                                                                <span className="font-medium text-xs text-gray-500 mr-2">{ep.episode_num}.</span>
                                                                                                <span>{ep.title}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog
                isOpen={!!itemToUnmonitor}
                onClose={() => setItemToUnmonitor(null)}
                title="Stop Monitoring?"
            >
                <div>
                    <p className="mb-4">
                        Are you sure you want to stop monitoring <strong>{itemToUnmonitor?.title}</strong>?
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setItemToUnmonitor(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmUnmonitor}>
                            Stop Monitoring
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div >
    );
}
