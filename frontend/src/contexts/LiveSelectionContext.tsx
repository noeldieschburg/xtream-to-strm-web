import { createContext, useContext, useState, useCallback, FC, ReactNode, useMemo, useEffect } from 'react';
import api from '@/lib/api';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { arrayMove } from '@dnd-kit/sortable';

// Types
export interface Category {
    category_id: string;
    category_name: string;
    parent_id: number;
}

export interface Stream {
    num: number;
    name: string;
    stream_type: string;
    stream_id: number;
    stream_icon: string;
    epg_channel_id: string;
    category_id: string;
}

export interface PlaylistChannel {
    id: number;
    stream_id: string;
    custom_name: string | null;
    order: number;
    is_excluded: boolean;
    epg_channel_id: string | null;
}

export interface PlaylistBouquet {
    id: number;
    category_id: string | null;
    custom_name: string | null;
    order: number;
    channels: PlaylistChannel[];
}

export interface Playlist {
    id: number;
    subscription_id: number;
    name: string;
    description: string | null;
    bouquets: PlaylistBouquet[];
}

export interface EPGSource {
    id: number;
    name: string;
    source_type: string;
    source_url: string | null;
    is_active: boolean;
}

// Context State
export interface LiveSelectionContextType {
    // Core State
    playlist: Playlist | null;
    setPlaylist: (playlist: Playlist | null) => void;
    selectedBouquetId: number | null;
    setSelectedBouquetId: (id: number | null) => void;

    // Stream Library
    categories: Category[];
    streams: Stream[];
    selectedCategory: string | null;
    setSelectedCategory: (id: string | null) => void;
    setStreams: (streams: Stream[]) => void;
    sourceSubscriptionId: number | null;
    setSourceSubscriptionId: (id: number | null) => void;
    allSubscriptions: any[];

    // EPG
    epgMappings: Record<string, string>;
    setEpgMappings: (mappings: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
    epgSources: EPGSource[];
    mappingId: string | null;
    setMappingId: (id: string | null) => void;

    // UI/UX States
    includedCategoryIds: string[];
    excludedStreamIds: Set<string>;
    customNames: Record<string, string>;
    editingId: string | null;
    editValue: string;
    setEditingId: (id: string | null) => void;
    setEditValue: (val: string) => void;
    compactMode: boolean;
    setCompactMode: (val: boolean) => void;

    // Statistics
    stats: {
        totalChannels: number;
        totalGroups: number;
        epgMappedCount: number;
        epgPercentage: number;
    };

    // Loading States
    loading: boolean;
    loadingCategories: boolean;
    loadingStreams: boolean;
    saving: boolean;

    // Actions
    fetchPlaylist: (id: number) => Promise<void>;
    fetchCategories: (subId: number) => Promise<void>;
    fetchStreams: (subId: number, catId: string) => Promise<void>;
    savePlaylist: () => Promise<void>;
    resetPlaylist: () => void;
    startEditing: (id: string, value: string) => void;
    saveEdit: () => Promise<void>;

    // Bouquet Actions
    addVirtualBouquet: (name: string) => Promise<void>;
    deleteBouquet: (id: number) => Promise<void>;
    reorderBouquets: (activeId: number, overId: number) => Promise<void>;
    moveBouquet: (id: number, direction: 'up' | 'down') => Promise<void>;

    // Channel Actions
    addStreamToBouquet: (stream: Stream) => Promise<void>;
    bulkAddStreamsToBouquet: (streams: Stream[]) => Promise<void>;
    removeStreamFromBouquet: (channelId: number) => Promise<void>;
    reorderChannels: (activeId: number, overId: number) => Promise<void>;
    moveChannelToBouquet: (channelId: number, targetBouquetId: number) => Promise<void>;
    moveChannelInBouquet: (channelId: number, direction: 'up' | 'down') => Promise<void>;
    duplicateBouquet: (id: number) => Promise<void>;

    // Selection & Bulk Actions
    selectedChannelIds: Set<number>;
    setSelectedChannelIds: (ids: Set<number>) => void;
    toggleChannelSelection: (id: number) => void;
    bulkDeleteChannels: (ids: number[]) => Promise<void>;
    bulkMoveChannels: (channelIds: number[], targetBouquetId: number) => Promise<void>;
    exportBouquet: (id: number) => void;
    importBouquet: (file: File) => Promise<void>;

    // EPG Actions
    selectEPG: (epgId: string) => void;

    // History Actions
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const LiveSelectionContext = createContext<LiveSelectionContextType | undefined>(undefined);

export const LiveSelectionProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [streams, setStreams] = useState<Stream[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [includedCategoryIds, setIncludedCategoryIds] = useState<string[]>([]);
    const [excludedStreamIds, setExcludedStreamIds] = useState<Set<string>>(new Set());
    const [customNames, setCustomNames] = useState<Record<string, string>>({});
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [compactMode, setCompactMode] = useState(false);

    const [selectedBouquetId, setSelectedBouquetId] = useState<number | null>(null);
    const [sourceSubscriptionId, setSourceSubscriptionId] = useState<number | null>(null);
    const [allSubscriptions, setAllSubscriptions] = useState<any[]>([]);

    const [selectedChannelIds, setSelectedChannelIds] = useState<Set<number>>(new Set());

    const [epgMappings, setEpgMappings] = useState<Record<string, string>>({});
    const [mappingId, setMappingId] = useState<string | null>(null);
    const [epgSources, setEpgSources] = useState<EPGSource[]>([]);

    const [loading, setLoading] = useState(false);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [loadingStreams, setLoadingStreams] = useState(false);
    const [saving, setSaving] = useState(false);

    // History Tracking
    const history = useUndoRedo({
        playlist: null as Playlist | null,
        customNames: {} as Record<string, string>,
        epgMappings: {} as Record<string, string>
    });

    const recordHistory = useCallback((p: Playlist | null, names: Record<string, string>, epg: Record<string, string>) => {
        history.record({
            playlist: JSON.parse(JSON.stringify(p)),
            customNames: { ...names },
            epgMappings: { ...epg }
        });
    }, [history]);

    const undo = useCallback(() => {
        const prevState = history.undo();
        if (prevState) {
            setPlaylist(prevState.playlist);
            setCustomNames(prevState.customNames);
            setEpgMappings(prevState.epgMappings);
        }
    }, [history]);

    const redo = useCallback(() => {
        const nextState = history.redo();
        if (nextState) {
            setPlaylist(nextState.playlist);
            setCustomNames(nextState.customNames);
            setEpgMappings(nextState.epgMappings);
        }
    }, [history]);

    const fetchEPGSources = useCallback(async (id: number) => {
        try {
            const res = await api.get<EPGSource[]>(`/live/playlists/${id}/epg-sources`);
            setEpgSources(res.data.filter(s => s.is_active));
        } catch (error) {
            console.error("Failed to fetch EPG sources", error);
        }
    }, []);

    const fetchAllSubscriptions = useCallback(async () => {
        try {
            const res = await api.get('/subscriptions/');
            setAllSubscriptions(res.data);
        } catch (error) {
            console.error("Failed to fetch subscriptions", error);
        }
    }, []);

    const fetchCategories = useCallback(async (subId: number) => {
        setLoadingCategories(true);
        try {
            const res = await api.get<Category[]>(`/live/categories/?subscription_id=${subId}`);
            setCategories(res.data);
        } catch (error) {
            console.error("Failed to fetch categories", error);
        } finally {
            setLoadingCategories(false);
        }
    }, []);

    const fetchStreams = useCallback(async (subId: number, catId: string) => {
        setLoadingStreams(true);
        try {
            const res = await api.get<Stream[]>(`/live/streams/${catId}?subscription_id=${subId}`);
            setStreams(res.data);
        } catch (error) {
            console.error("Failed to fetch streams", error);
        } finally {
            setLoadingStreams(false);
        }
    }, []);

    useEffect(() => {
        if (sourceSubscriptionId && selectedCategory) {
            fetchStreams(sourceSubscriptionId, selectedCategory);
        } else {
            setStreams([]);
        }
    }, [sourceSubscriptionId, selectedCategory, fetchStreams]);

    const fetchPlaylist = useCallback(async (id: number) => {
        setLoading(true);
        try {
            const res = await api.get<Playlist>(`/live/playlists/${id}`);
            const sortedBouquets = [...res.data.bouquets].sort((a, b) => a.order - b.order);
            const dataToSet = { ...res.data, bouquets: sortedBouquets };

            setPlaylist(dataToSet);

            const included: string[] = [];
            const excluded = new Set<string>();
            const names: Record<string, string> = {};
            const epg: Record<string, string> = {};

            sortedBouquets.forEach(b => {
                if (b.category_id) included.push(b.category_id);
                if (b.custom_name) names[b.category_id || String(b.id)] = b.custom_name;
                b.channels.forEach(ch => {
                    if (ch.is_excluded) excluded.add(ch.stream_id);
                    if (ch.custom_name) names[ch.stream_id] = ch.custom_name;
                    if (ch.epg_channel_id) epg[ch.stream_id] = ch.epg_channel_id;
                });
            });

            setIncludedCategoryIds(included);
            setExcludedStreamIds(excluded);
            setCustomNames(names);
            setEpgMappings(epg);

            if (sortedBouquets.length > 0) {
                setSelectedBouquetId(sortedBouquets[0].id);
            }

            history.resetHistory({
                playlist: dataToSet,
                customNames: names,
                epgMappings: epg
            });

            setSourceSubscriptionId(res.data.subscription_id);
            fetchCategories(res.data.subscription_id);
            fetchAllSubscriptions();
            fetchEPGSources(id);
        } catch (error) {
            console.error("Failed to fetch playlist", error);
        } finally {
            setLoading(false);
        }
    }, [fetchCategories, fetchAllSubscriptions, fetchEPGSources, history.resetHistory]);

    const resetPlaylist = useCallback(() => {
        if (playlist) {
            fetchPlaylist(playlist.id);
        }
    }, [playlist, fetchPlaylist]);

    const addVirtualBouquet = async (name: string) => {
        if (!name || !playlist) return;
        try {
            const res = await api.post(`/live/playlists/${playlist.id}/bouquets`, [
                { custom_name: name, order: playlist.bouquets.length }
            ]);
            const newBouquet = res.data[0];
            const newPlaylist = { ...playlist, bouquets: [...playlist.bouquets, newBouquet] };
            setPlaylist(newPlaylist);
            setSelectedBouquetId(newBouquet.id);
            recordHistory(newPlaylist, customNames, epgMappings);
        } catch (error) {
            console.error("Failed to add bouquet", error);
        }
    };

    const deleteBouquet = async (id: number) => {
        if (!playlist) return;
        try {
            await api.delete(`/live/playlists/${playlist.id}/bouquets/${id}`);
            const newPlaylist = { ...playlist, bouquets: playlist.bouquets.filter(b => b.id !== id) };
            setPlaylist(newPlaylist);
            if (selectedBouquetId === id) setSelectedBouquetId(null);
            recordHistory(newPlaylist, customNames, epgMappings);
        } catch (error) {
            console.error("Failed to delete bouquet", error);
        }
    };

    const reorderBouquets = async (activeId: number, overId: number) => {
        if (!playlist || activeId === overId) return;

        const oldIndex = playlist.bouquets.findIndex(b => b.id === activeId);
        const newIndex = playlist.bouquets.findIndex(b => b.id === overId);
        if (oldIndex === -1 || newIndex === -1) return;

        const newBouquets = arrayMove(playlist.bouquets, oldIndex, newIndex);
        const newPlaylist = { ...playlist, bouquets: newBouquets };
        setPlaylist(newPlaylist);
        recordHistory(newPlaylist, customNames, epgMappings);

        try {
            const updates = newBouquets.map((b, i) => ({ id: b.id, order: i }));
            await api.patch(`/live/playlists/${playlist.id}/bouquets/reorder`, updates);
        } catch (error) {
            console.error("Failed to reorder bouquets", error);
        }
    };

    const moveBouquet = async (id: number, direction: 'up' | 'down') => {
        if (!playlist) return;
        const sorted = [...playlist.bouquets].sort((a, b) => a.order - b.order);
        const index = sorted.findIndex(b => b.id === id);
        if (index === -1) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === sorted.length - 1) return;

        const otherIndex = direction === 'up' ? index - 1 : index + 1;
        [sorted[index], sorted[otherIndex]] = [sorted[otherIndex], sorted[index]];

        const updated = sorted.map((b, i) => ({ ...b, order: i }));
        const newPlaylist = { ...playlist, bouquets: updated };
        setPlaylist(newPlaylist);
        recordHistory(newPlaylist, customNames, epgMappings);

        try {
            await api.post(`/live/playlists/${playlist.id}/bouquets`, updated.map(b => ({
                id: b.id,
                category_id: b.category_id,
                custom_name: customNames[b.category_id || String(b.id)] || b.custom_name,
                order: b.order
            })));
        } catch (error) {
            console.error("Failed to move bouquet", error);
        }
    };

    const addStreamToBouquet = async (stream: Stream) => {
        if (!selectedBouquetId || !playlist) return;
        try {
            const bouquet = playlist.bouquets.find(b => b.id === selectedBouquetId);
            if (!bouquet) return;

            const res = await api.post(`/live/bouquets/${selectedBouquetId}/channels/add`, {
                stream_id: String(stream.stream_id),
                custom_name: stream.name,
                order: bouquet.channels.length,
                is_excluded: false
            });

            const newBouquets = playlist.bouquets.map(b => {
                if (b.id === selectedBouquetId) {
                    return { ...b, channels: [...b.channels, res.data] };
                }
                return b;
            });
            const newPlaylist = { ...playlist, bouquets: newBouquets };
            const newNames = { ...customNames, [String(stream.stream_id)]: stream.name };

            setPlaylist(newPlaylist);
            setCustomNames(newNames);
            recordHistory(newPlaylist, newNames, epgMappings);
        } catch (error) {
            console.error("Failed to add stream to bouquet", error);
        }
    };

    const bulkAddStreamsToBouquet = async (streamsToAdd: Stream[]) => {
        if (!selectedBouquetId || !playlist || streamsToAdd.length === 0) return;
        try {
            const bouquet = playlist.bouquets.find(b => b.id === selectedBouquetId);
            if (!bouquet) return;

            const existingCount = bouquet.channels.length;
            const payload = streamsToAdd.map((s, i) => ({
                stream_id: String(s.stream_id),
                custom_name: s.name,
                order: existingCount + i,
                is_excluded: false
            }));

            const res = await api.post(`/live/playlists/${playlist.id}/bouquets/${selectedBouquetId}/channels`, payload);

            const newBouquets = playlist.bouquets.map(b => {
                if (b.id === selectedBouquetId) {
                    const existingIds = new Set(res.data.map((c: any) => c.stream_id));
                    const merged = [
                        ...b.channels.filter(c => !existingIds.has(c.stream_id)),
                        ...res.data
                    ].sort((a, b) => a.order - b.order);
                    return { ...b, channels: merged };
                }
                return b;
            });
            const newPlaylist = { ...playlist, bouquets: newBouquets };
            const newNames = { ...customNames };
            streamsToAdd.forEach(s => { newNames[String(s.stream_id)] = s.name; });

            setPlaylist(newPlaylist);
            setCustomNames(newNames);
            recordHistory(newPlaylist, newNames, epgMappings);
        } catch (error) {
            console.error("Failed to bulk add streams", error);
        }
    };

    const removeStreamFromBouquet = async (channelId: number) => {
        if (!playlist || !selectedBouquetId) return;
        try {
            await api.delete(`/live/playlists/${playlist.id}/channels/${channelId}`);
            const newBouquets = playlist.bouquets.map(b => {
                if (b.id === selectedBouquetId) {
                    return { ...b, channels: b.channels.filter(c => c.id !== channelId) };
                }
                return b;
            });
            const newPlaylist = { ...playlist, bouquets: newBouquets };
            setPlaylist(newPlaylist);
            recordHistory(newPlaylist, customNames, epgMappings);
        } catch (error) {
            console.error("Failed to remove stream", error);
        }
    };

    const reorderChannels = async (activeId: number, overId: number) => {
        if (!playlist || !selectedBouquetId || activeId === overId) return;
        const bouquet = playlist.bouquets.find(b => b.id === selectedBouquetId);
        if (!bouquet) return;

        const oldIndex = bouquet.channels.findIndex(c => c.id === activeId);
        const newIndex = bouquet.channels.findIndex(c => c.id === overId);
        if (oldIndex === -1 || newIndex === -1) return;

        const newChannels = arrayMove(bouquet.channels, oldIndex, newIndex);
        const updatedBouquets = playlist.bouquets.map(b => {
            if (b.id === selectedBouquetId) {
                return { ...b, channels: newChannels.map((c, i) => ({ ...c, order: i })) };
            }
            return b;
        });
        const newPlaylist = { ...playlist, bouquets: updatedBouquets };
        setPlaylist(newPlaylist);
        recordHistory(newPlaylist, customNames, epgMappings);

        try {
            const channelsToUpdate = newChannels.map((c, i) => ({
                stream_id: c.stream_id,
                custom_name: customNames[c.stream_id] || c.custom_name,
                order: i,
                is_excluded: c.is_excluded,
                epg_channel_id: epgMappings[c.stream_id] || c.epg_channel_id
            }));
            await api.post(`/live/playlists/${playlist.id}/bouquets/${selectedBouquetId}/channels`, channelsToUpdate);
        } catch (error) {
            console.error("Failed to reorder channels", error);
        }
    };

    const moveChannelToBouquet = async (channelId: number, targetBouquetId: number) => {
        if (!playlist || !selectedBouquetId || selectedBouquetId === targetBouquetId) return;

        const sourceBouquet = playlist.bouquets.find(b => b.id === selectedBouquetId);
        const targetBouquet = playlist.bouquets.find(b => b.id === targetBouquetId);
        if (!sourceBouquet || !targetBouquet) return;

        const channel = sourceBouquet.channels.find(c => c.id === channelId);
        if (!channel) return;

        try {
            await api.delete(`/live/playlists/${playlist.id}/channels/${channelId}`);
            const res = await api.post(`/live/bouquets/${targetBouquetId}/channels/add`, {
                stream_id: channel.stream_id,
                custom_name: customNames[channel.stream_id] || channel.custom_name,
                order: targetBouquet.channels.length,
                is_excluded: channel.is_excluded
            });

            const newPlaylist = {
                ...playlist,
                bouquets: playlist.bouquets.map(b => {
                    if (b.id === selectedBouquetId) {
                        return { ...b, channels: b.channels.filter(c => c.id !== channelId) };
                    }
                    if (b.id === targetBouquetId) {
                        return { ...b, channels: [...b.channels, res.data] };
                    }
                    return b;
                })
            };
            setPlaylist(newPlaylist);
            recordHistory(newPlaylist, customNames, epgMappings);
        } catch (error) {
            console.error("Failed to move channel between bouquets", error);
        }
    };

    const moveChannelInBouquet = async (channelId: number, direction: 'up' | 'down') => {
        if (!playlist || !selectedBouquetId) return;
        const bouquet = playlist.bouquets.find(b => b.id === selectedBouquetId);
        if (!bouquet) return;

        const index = bouquet.channels.findIndex(c => c.id === channelId);
        if (index === -1) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === bouquet.channels.length - 1) return;

        const newChannels = [...bouquet.channels];
        const otherIndex = direction === 'up' ? index - 1 : index + 1;
        [newChannels[index], newChannels[otherIndex]] = [newChannels[otherIndex], newChannels[index]];

        const updatedBouquets = playlist.bouquets.map(b => {
            if (b.id === selectedBouquetId) {
                return { ...b, channels: newChannels.map((c, i) => ({ ...c, order: i })) };
            }
            return b;
        });
        const newPlaylist = { ...playlist, bouquets: updatedBouquets };
        setPlaylist(newPlaylist);
        recordHistory(newPlaylist, customNames, epgMappings);

        try {
            const channelsToUpdate = newChannels.map((c, i) => ({
                stream_id: c.stream_id,
                custom_name: customNames[c.stream_id] || c.custom_name,
                order: i,
                is_excluded: c.is_excluded,
                epg_channel_id: epgMappings[c.stream_id] || c.epg_channel_id
            }));
            await api.post(`/live/playlists/${playlist.id}/bouquets/${selectedBouquetId}/channels`, channelsToUpdate);
        } catch (error) {
            console.error("Failed to move channel", error);
        }
    };

    const startEditing = (id: string, value: string) => {
        setEditingId(id);
        setEditValue(value);
    };

    const saveEdit = async () => {
        if (!editingId || !playlist) return;
        try {
            const isBouquet = playlist.bouquets.some(b => String(b.id) === editingId);
            if (isBouquet) {
                const bouquetId = Number(editingId);
                const bouquet = playlist.bouquets.find(b => b.id === bouquetId);
                if (bouquet) {
                    await api.post(`/live/playlists/${playlist.id}/bouquets`, [{
                        ...bouquet,
                        id: bouquetId,
                        custom_name: editValue
                    }]);
                    const newPlaylist = {
                        ...playlist,
                        bouquets: playlist.bouquets.map(b => b.id === bouquetId ? { ...b, custom_name: editValue } : b)
                    };
                    setPlaylist(newPlaylist);
                    recordHistory(newPlaylist, customNames, epgMappings);
                }
            } else {
                const channelId = Number(editingId);
                let streamId = "";
                playlist.bouquets.forEach(b => {
                    const ch = b.channels.find(c => c.id === channelId);
                    if (ch) streamId = ch.stream_id;
                });

                if (streamId) {
                    await api.post(`/live/playlists/${playlist.id}/channels/${channelId}/rename`, {
                        custom_name: editValue
                    });
                    const newNames = { ...customNames, [streamId]: editValue };
                    const newPlaylist = {
                        ...playlist,
                        bouquets: playlist.bouquets.map(b => ({
                            ...b,
                            channels: b.channels.map(c => c.id === channelId ? { ...c, custom_name: editValue } : c)
                        }))
                    };
                    setCustomNames(newNames);
                    setPlaylist(newPlaylist);
                    recordHistory(newPlaylist, newNames, epgMappings);
                }
            }
        } catch (error) {
            console.error("Failed to save edit", error);
        } finally {
            setEditingId(null);
            setEditValue("");
        }
    };

    const savePlaylist = async () => {
        if (!playlist) return;
        setSaving(true);
        try {
            // Global save logic
        } catch (error) {
            console.error("Failed to save playlist", error);
        } finally {
            setSaving(false);
        }
    };

    const selectEPG = (epgId: string) => {
        if (mappingId) {
            const newMappings = { ...epgMappings, [mappingId]: epgId };
            setEpgMappings(newMappings);
            setMappingId(null);
            recordHistory(playlist, customNames, newMappings);
        }
    };

    const stats = useMemo(() => {
        if (!playlist) return { totalChannels: 0, totalGroups: 0, epgMappedCount: 0, epgPercentage: 0 };
        let totalCh = 0;
        let mappedCh = 0;
        playlist.bouquets.forEach(b => {
            b.channels.forEach(ch => {
                totalCh++;
                if (epgMappings[ch.stream_id] || ch.epg_channel_id) {
                    mappedCh++;
                }
            });
        });
        return {
            totalChannels: totalCh,
            totalGroups: playlist.bouquets.length,
            epgMappedCount: mappedCh,
            epgPercentage: totalCh > 0 ? Math.round((mappedCh / totalCh) * 100) : 0
        };
    }, [playlist, epgMappings]);

    const toggleChannelSelection = (id: number) => {
        setSelectedChannelIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const bulkDeleteChannels = async (ids: number[]) => {
        if (!playlist || ids.length === 0) return;
        if (!window.confirm(`Delete ${ids.length} channels?`)) return;

        try {
            await api.post(`/live/playlists/${playlist.id}/channels/bulk`, {
                channel_ids: ids
            });

            const newPlaylist = {
                ...playlist,
                bouquets: playlist.bouquets.map(b => ({
                    ...b,
                    channels: b.channels.filter(c => !ids.includes(c.id))
                }))
            };
            setPlaylist(newPlaylist);
            setSelectedChannelIds(new Set());
            recordHistory(newPlaylist, customNames, epgMappings);
        } catch (error) {
            console.error("Failed to bulk delete channels", error);
        }
    };

    const bulkMoveChannels = async (channelIds: number[], targetBouquetId: number) => {
        if (!playlist || !selectedBouquetId || selectedBouquetId === targetBouquetId) return;
        try {
            for (const cid of channelIds) {
                await moveChannelToBouquet(cid, targetBouquetId);
            }
            setSelectedChannelIds(new Set());
        } catch (error) {
            console.error("Failed to bulk move channels", error);
        }
    };

    const duplicateBouquet = async (id: number) => {
        if (!playlist) return;
        try {
            const res = await api.post(`/live/playlists/${playlist.id}/bouquets/${id}/duplicate`);
            const newPlaylist = { ...playlist, bouquets: [...playlist.bouquets, res.data] };
            setPlaylist(newPlaylist);
            setSelectedBouquetId(res.data.id);
            recordHistory(newPlaylist, customNames, epgMappings);
        } catch (error) {
            console.error("Failed to duplicate bouquet", error);
        }
    };

    const exportBouquet = (id: number) => {
        if (!playlist) return;
        const bouquet = playlist.bouquets.find(b => b.id === id);
        if (!bouquet) return;

        const data = {
            custom_name: bouquet.custom_name,
            category_id: bouquet.category_id,
            channels: bouquet.channels.map(c => ({
                stream_id: c.stream_id,
                custom_name: c.custom_name || customNames[c.stream_id],
                order: c.order,
                is_excluded: c.is_excluded,
                epg_channel_id: c.epg_channel_id || epgMappings[c.stream_id]
            }))
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${bouquet.custom_name || 'bouquet'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const importBouquet = async (file: File) => {
        if (!playlist) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data.channels) throw new Error("Invalid bouquet format");

            const res = await api.post(`/live/playlists/${playlist.id}/bouquets`, [{
                custom_name: data.custom_name || "Imported Bouquet",
                category_id: data.category_id,
                order: playlist.bouquets.length
            }]);

            const newBouquet = res.data[0];
            if (data.channels.length > 0) {
                await api.post(`/live/playlists/${playlist.id}/bouquets/${newBouquet.id}/channels`, data.channels);
            }

            await fetchPlaylist(playlist.id);
            setSelectedBouquetId(newBouquet.id);
        } catch (error) {
            console.error("Failed to import bouquet", error);
            alert("Failed to import bouquet. Check file format.");
        }
    };

    const value = useMemo(() => ({
        playlist, setPlaylist,
        selectedBouquetId, setSelectedBouquetId,
        categories, streams, setStreams,
        selectedCategory, setSelectedCategory,
        sourceSubscriptionId, setSourceSubscriptionId,
        allSubscriptions,
        epgMappings, setEpgMappings,
        epgSources,
        mappingId, setMappingId,
        includedCategoryIds,
        excludedStreamIds,
        customNames,
        editingId, editValue, setEditingId, setEditValue,
        compactMode, setCompactMode,
        selectedChannelIds, setSelectedChannelIds,
        toggleChannelSelection, bulkDeleteChannels, bulkMoveChannels,
        exportBouquet, importBouquet,
        stats,
        loading, loadingCategories, loadingStreams, saving,
        fetchPlaylist, fetchCategories, fetchStreams, savePlaylist, resetPlaylist,
        startEditing, saveEdit,
        addVirtualBouquet, deleteBouquet, moveBouquet, reorderBouquets, duplicateBouquet,
        addStreamToBouquet, bulkAddStreamsToBouquet, removeStreamFromBouquet,
        reorderChannels, moveChannelToBouquet, moveChannelInBouquet,
        selectEPG,
        undo, redo,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
    }), [
        playlist, selectedBouquetId, categories, streams, selectedCategory,
        sourceSubscriptionId, allSubscriptions, epgMappings, epgSources,
        mappingId, includedCategoryIds, excludedStreamIds, customNames,
        editingId, editValue, compactMode, selectedChannelIds, stats,
        loading, loadingCategories, loadingStreams, saving,
        fetchPlaylist, fetchCategories, fetchStreams, savePlaylist, resetPlaylist,
        startEditing, saveEdit, addVirtualBouquet, deleteBouquet, moveBouquet,
        reorderBouquets, duplicateBouquet, addStreamToBouquet,
        bulkAddStreamsToBouquet, removeStreamFromBouquet, reorderChannels,
        moveChannelToBouquet, moveChannelInBouquet, selectEPG, undo, redo,
        history.canUndo, history.canRedo
    ]);

    return (
        <LiveSelectionContext.Provider value={value}>
            {children}
        </LiveSelectionContext.Provider>
    );
};

export function useLiveSelection() {
    const context = useContext(LiveSelectionContext);
    if (context === undefined) {
        throw new Error('useLiveSelection must be used within a LiveSelectionProvider');
    }
    return context;
}

export default LiveSelectionContext;
