import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Save, Download, Link as LinkIcon, Loader2, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

interface Category {
    category_id: string;
    category_name: string;
    parent_id: number;
}

interface Stream {
    num: number;
    name: string;
    stream_type: string;
    stream_id: number;
    stream_icon: string;
    epg_channel_id: string;
    added: string;
    category_id: string;
    custom_sid: string;
    tv_archive: number;
    direct_source: string;
    tv_archive_duration: number;
}

interface Subscription {
    id: number;
    name: string;
    xtream_url: string;
}

interface LiveConfig {
    id: number;
    subscription_id: number;
    included_categories: string[]; // List of included category_ids
    excluded_streams: string[]; // List of excluded stream_ids
}

export default function LiveSelection() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [selectedSubscription, setSelectedSubscription] = useState<number | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [streams, setStreams] = useState<Stream[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [config, setConfig] = useState<LiveConfig>({
        id: 0,
        subscription_id: 0,
        included_categories: [],
        excluded_streams: []
    });

    const [loadingCategories, setLoadingCategories] = useState(false);
    const [loadingStreams, setLoadingStreams] = useState(false);
    const [saving, setSaving] = useState(false);

    // Search States
    const [categorySearch, setCategorySearch] = useState("");
    const [streamSearch, setStreamSearch] = useState("");

    useEffect(() => {
        fetchSubscriptions();
    }, []);

    useEffect(() => {
        if (selectedSubscription) {
            setCategories([]);
            setStreams([]);
            setSelectedCategory(null);
            fetchConfig(selectedSubscription);
        }
    }, [selectedSubscription]);

    useEffect(() => {
        if (selectedCategory && selectedSubscription) {
            fetchStreams(selectedSubscription, selectedCategory);
        } else {
            setStreams([]);
        }
    }, [selectedCategory, selectedSubscription]);

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

    const fetchConfig = async (subId: number) => {
        try {
            const res = await api.get<LiveConfig>(`/live/config?subscription_id=${subId}`);
            setConfig(res.data);
        } catch (error) {
            console.error("Failed to fetch config", error);
            // Don't show toast as it might just be empty for new users, backend handles it gracefully usually or returns 404
            // Ideally backend returns empty structure.
            setConfig({
                id: 0,
                subscription_id: subId,
                included_categories: [],
                excluded_streams: []
            });
        }
    };

    const fetchCategories = async (subId: number) => {
        setLoadingCategories(true);
        try {
            const res = await api.get<Category[]>(`/live/categories?subscription_id=${subId}`);
            setCategories(res.data);
        } catch (error) {
            console.error("Failed to fetch categories", error);
        } finally {
            setLoadingCategories(false);
        }
    };

    const fetchStreams = async (subId: number, catId: string) => {
        setLoadingStreams(true);
        try {
            const res = await api.get<Stream[]>(`/live/streams/${catId}?subscription_id=${subId}`);
            setStreams(res.data);
        } catch (error) {
            console.error("Failed to fetch streams", error);
        } finally {
            setLoadingStreams(false);
        }
    };

    const saveConfig = async () => {
        if (!selectedSubscription) return;
        setSaving(true);
        try {
            await api.post('/live/config', {
                subscription_id: selectedSubscription,
                included_categories: config.included_categories,
                excluded_streams: config.excluded_streams
            });
        } catch (error) {
            console.error("Failed to save config", error);
        } finally {
            setSaving(false);
        }
    };

    const toggleCategory = (catId: string) => {
        setConfig(prev => {
            const included = new Set(prev.included_categories);
            if (included.has(catId)) {
                included.delete(catId);
            } else {
                included.add(catId);
            }
            return { ...prev, included_categories: Array.from(included) };
        });
    };

    const toggleStreamExclusion = (streamId: string) => {
        setConfig(prev => {
            const excluded = new Set(prev.excluded_streams);
            if (excluded.has(streamId)) {
                excluded.delete(streamId);
            } else {
                excluded.add(streamId);
            }
            return { ...prev, excluded_streams: Array.from(excluded) };
        });
    };

    const selectAllStreams = (exclude: boolean) => {
        if (!selectedCategory) return;

        setConfig(prev => {
            const excluded = new Set(prev.excluded_streams);
            if (exclude) {
                // Determine which ones to add - only visible filtered streams?
                // Probably better to only exclude filtered results if search is active? 
                // For simplicity, let's act on 'filteredStreams' if searching, or all if not.
                // But 'streams' state is just for CURRENT category.
                // Let's iterate CURRENT visible streams.

                filteredStreams.forEach(s => excluded.add(String(s.stream_id)));
            } else {
                filteredStreams.forEach(s => excluded.delete(String(s.stream_id)));
            }
            return { ...prev, excluded_streams: Array.from(excluded) };
        });
    };

    // Select All Categories visible
    const toggleAllCategories = (select: boolean) => {
        setConfig(prev => {
            const included = new Set(prev.included_categories);
            filteredCategories.forEach(c => {
                if (select) included.add(c.category_id);
                else included.delete(c.category_id);
            });
            return { ...prev, included_categories: Array.from(included) };
        });
    }


    const generateM3UUrl = () => {
        if (!selectedSubscription) return "";
        // Assume API is served relative to origin
        return `${window.location.origin}/api/v1/live/playlist.m3u?subscription_id=${selectedSubscription}`;
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generateM3UUrl());
        alert("M3U URL copied to clipboard");
    };

    const downloadM3U = () => {
        window.open(generateM3UUrl(), '_blank');
    };

    // Filter Logic
    const filteredCategories = useMemo(() => {
        if (!categorySearch) return categories;
        return categories.filter(c => c.category_name.toLowerCase().includes(categorySearch.toLowerCase()));
    }, [categories, categorySearch]);

    const filteredStreams = useMemo(() => {
        if (!streamSearch) return streams;
        return streams.filter(s => s.name.toLowerCase().includes(streamSearch.toLowerCase()));
    }, [streams, streamSearch]);


    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Live Selection</h2>
                    <p className="text-muted-foreground">Customize your live TV playlist</p>
                </div>
                <div className="flex gap-2">
                    <select
                        className="p-2 border rounded bg-background"
                        value={selectedSubscription || ''}
                        onChange={(e) => setSelectedSubscription(Number(e.target.value))}
                    >
                        {subscriptions.map(sub => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                    </select>
                    <Button
                        onClick={() => selectedSubscription && fetchCategories(selectedSubscription)}
                        disabled={loadingCategories || !selectedSubscription}
                        variant="outline"
                        title="Reload bouquets from Xtream"
                    >
                        {loadingCategories ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>

                    <Button onClick={saveConfig} disabled={saving} variant="default">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Config
                    </Button>
                    <Button onClick={downloadM3U} variant="outline" title="Download M3U File">
                        <Download className="h-4 w-4" />
                    </Button>
                    <Button onClick={copyToClipboard} variant="outline" title="Copy M3U URL">
                        <LinkIcon className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
                {/* Left Column: Categories */}
                <Card className="flex flex-col min-h-0">
                    <CardHeader className="py-3 px-4 border-b">
                        <CardTitle className="text-base flex justify-between items-center">
                            <span>Bouquets ({config.included_categories.length}/{categories.length})</span>
                            <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => toggleAllCategories(true)} className="h-7 text-xs">All</Button>
                                <Button size="sm" variant="ghost" onClick={() => toggleAllCategories(false)} className="h-7 text-xs">None</Button>
                            </div>
                        </CardTitle>
                        <input
                            type="text"
                            placeholder="Search bouquets..."
                            className="w-full mt-2 p-1.5 text-sm border rounded"
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                        />
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-0">
                        {loadingCategories ? (
                            <div className="flex justify-center items-center h-20">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="divide-y">
                                {filteredCategories.map(cat => {
                                    const isIncluded = config.included_categories.includes(cat.category_id);
                                    const isSelected = selectedCategory === cat.category_id;

                                    return (
                                        <div
                                            key={cat.category_id}
                                            className={`flex items-center p-2 hover:bg-muted cursor-pointer ${isSelected ? 'bg-muted' : ''}`}
                                            onClick={() => setSelectedCategory(cat.category_id)}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mr-3 h-4 w-4 rounded border-gray-300"
                                                checked={isIncluded}
                                                onClick={(e) => e.stopPropagation()} // Prevent selecting category when checking box? Or allow both?
                                                onChange={() => toggleCategory(cat.category_id)}
                                            />
                                            <div className="flex-1 truncate text-sm font-medium">
                                                {cat.category_name}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Right Column: Streams */}
                <Card className="flex flex-col min-h-0">
                    <CardHeader className="py-3 px-4 border-b">
                        <CardTitle className="text-base flex justify-between items-center">
                            <span>Channels {selectedCategory ? `(${streams.length - streams.filter(s => config.excluded_streams.includes(String(s.stream_id))).length} active)` : ''}</span>
                            {selectedCategory && (
                                <div className="flex gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => selectAllStreams(false)} className="h-7 text-xs" title="Include All">All</Button>
                                    <Button size="sm" variant="ghost" onClick={() => selectAllStreams(true)} className="h-7 text-xs" title="Exclude All">None</Button>
                                </div>
                            )}
                        </CardTitle>
                        <input
                            type="text"
                            placeholder="Search channels..."
                            className="w-full mt-2 p-1.5 text-sm border rounded"
                            value={streamSearch}
                            onChange={(e) => setStreamSearch(e.target.value)}
                            disabled={!selectedCategory}
                        />
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-0">
                        {loadingStreams ? (
                            <div className="flex justify-center items-center h-20">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : !selectedCategory ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                <p>Select a bouquet to view channels</p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {filteredStreams.map(stream => {
                                    const isExcluded = config.excluded_streams.includes(String(stream.stream_id));

                                    return (
                                        <div key={stream.stream_id} className={`flex items-center p-2 hover:bg-muted ${isExcluded ? 'opacity-50' : ''}`}>
                                            <input
                                                type="checkbox"
                                                className="mr-3 h-4 w-4 rounded border-gray-300"
                                                checked={!isExcluded}
                                                onChange={() => toggleStreamExclusion(String(stream.stream_id))}
                                            />
                                            {stream.stream_icon && (
                                                <img src={stream.stream_icon} alt="" className="w-8 h-8 rounded object-cover mr-2 bg-gray-100" />
                                            )}
                                            <div className="flex-1 truncate text-sm">
                                                {stream.name}
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredStreams.length === 0 && (
                                    <div className="p-4 text-center text-sm text-muted-foreground">No channels found</div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
