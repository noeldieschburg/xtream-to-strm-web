import { useEffect, FC, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Save, Download, Loader2, RefreshCw, ArrowLeft, Undo2, Redo2 } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { LiveSelectionProvider, useLiveSelection } from '@/contexts/LiveSelectionContext';
import { EPGMappingModal } from '@/components/live/EPGMappingModal';
import { StreamLibrary } from '@/components/live/StreamLibrary';
import { BouquetList } from '@/components/live/BouquetList';
import { CompositeList } from '@/components/live/CompositeList';
import { PlaylistStatistics } from '@/components/live/PlaylistStatistics';
import { Minimize2, Maximize2, Eye } from 'lucide-react';
import M3UPreviewModal from '@/components/live/M3UPreviewModal';
import GlobalSearchBar from '@/components/live/GlobalSearchBar';
import SearchResultsModal from '@/components/live/SearchResultsModal';
import api from '@/lib/api';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

// Layout component that uses the context
const LiveSelectionLayout: FC<{ playlistId: string }> = ({ playlistId }) => {
    const navigate = useNavigate();
    const {
        playlist,
        loading,
        saving,
        fetchPlaylist,
        savePlaylist,
        resetPlaylist,
        compactMode,
        setCompactMode,
        reorderBouquets,
        reorderChannels,
        moveChannelToBouquet,
        undo,
        redo,
        canUndo,
        canRedo
    } = useLiveSelection();

    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        if (playlistId) {
            fetchPlaylist(Number(playlistId));
        }
    }, [playlistId, fetchPlaylist]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                savePlaylist();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                if (window.confirm("Reset all unsaved changes?")) {
                    resetPlaylist();
                }
            }
            // Undo/Redo Shortcuts
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    redo();
                } else {
                    e.preventDefault();
                    undo();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [savePlaylist, resetPlaylist, undo, redo]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        if (activeId === overId) return;

        // Handle Bouquet Reordering
        if (activeId.startsWith('bouquet-') && overId.startsWith('bouquet-')) {
            const aId = Number(activeId.replace('bouquet-', ''));
            const oId = Number(overId.replace('bouquet-', ''));
            reorderBouquets(aId, oId);
        }

        // Handle Channel Reordering
        if (activeId.startsWith('channel-') && overId.startsWith('channel-')) {
            const aId = Number(activeId.replace('channel-', ''));
            const oId = Number(overId.replace('channel-', ''));
            reorderChannels(aId, oId);
        }

        // Handle Moving Channel to Bouquet
        if (activeId.startsWith('channel-') && overId.startsWith('bouquet-')) {
            const cId = Number(activeId.replace('channel-', ''));
            const bId = Number(overId.replace('bouquet-', ''));
            moveChannelToBouquet(cId, bId);
        }
    };

    if (loading && !playlist) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-lg font-medium animate-pulse">Loading playlist data...</p>
                </div>
            </div>
        );
    }

    if (!playlist) return null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <div className={`flex flex-col h-screen bg-background overflow-hidden ${compactMode ? 'text-xs' : ''}`}>
                {/* Header section remains simple */}
                <header className="flex items-center justify-between px-6 py-4 border-b bg-card shadow-sm z-10">
                    <div className="flex items-center gap-4 flex-1">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/live-playlists')} className="hover:bg-primary/10">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                                {playlist?.name}
                                <span className="text-xs font-normal px-2 py-0.5 bg-primary/10 text-primary rounded-full">v3.0</span>
                            </h1>
                            <p className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">{playlist?.description || 'Virtual Playlist Builder'}</p>
                        </div>
                    </div>

                    <div className="flex-1 max-w-md px-4 hidden md:block">
                        <GlobalSearchBar
                            isLoading={isSearching}
                            onSearch={async (q) => {
                                setSearchQuery(q);
                                setIsSearchOpen(true);
                                setIsSearching(true);
                                try {
                                    const res = await api.get(`/live/streams/search`, {
                                        params: { subscription_id: playlist.subscription_id, q }
                                    });
                                    setSearchResults(res.data);
                                } catch (error) {
                                    console.error("Search failed", error);
                                    setSearchResults([]);
                                } finally {
                                    setIsSearching(false);
                                }
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center border-r pr-3 mr-3 gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={undo}
                                disabled={!canUndo}
                                className="h-8 w-8 p-0"
                                title="Undo (Ctrl+Z)"
                            >
                                <Undo2 className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={redo}
                                disabled={!canRedo}
                                className="h-8 w-8 p-0"
                                title="Redo (Ctrl+Y)"
                            >
                                <Redo2 className="h-4 w-4" />
                            </Button>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="hidden sm:flex gap-2"
                            onClick={() => setCompactMode(!compactMode)}
                            title={compactMode ? "Disable Compact Mode" : "Enable Compact Mode"}
                        >
                            {compactMode ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                            {compactMode ? 'Normal' : 'Compact'}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="hidden sm:flex gap-2"
                            onClick={() => {
                                if (window.confirm("Reset all unsaved changes?")) resetPlaylist();
                            }}
                        >
                            <RefreshCw className="h-4 w-4" /> Reset
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="hidden sm:flex gap-2 text-indigo-500 border-indigo-500/30 hover:bg-indigo-500/10"
                            onClick={() => setIsPreviewOpen(true)}
                        >
                            <Eye className="h-4 w-4" /> Preview
                        </Button>
                        <Button variant="outline" size="sm" className="hidden sm:flex gap-2 text-indigo-500 border-indigo-500/30 hover:bg-indigo-500/10" onClick={() => window.open(`/api/v1/live/playlist.m3u?playlist_id=${playlist.id}`, '_blank')}>
                            <Download className="h-4 w-4" /> Export M3U
                        </Button>
                        <Button
                            size="sm"
                            className="gap-2 shadow-lg shadow-primary/20"
                            onClick={savePlaylist}
                            disabled={saving}
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </Button>
                    </div>
                </header>

                <PlaylistStatistics />

                {/* 4-Pane Layout */}
                <div className={`flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-h-0 px-4 pb-4 pt-4 ${compactMode ? 'gap-2 px-2 pb-2 pt-2' : ''}`}>
                    <StreamLibrary />
                    <BouquetList />
                    <CompositeList />
                </div>

                {/* Modals */}
                <EPGMappingModal />
                <M3UPreviewModal
                    isOpen={isPreviewOpen}
                    onClose={() => setIsPreviewOpen(false)}
                    playlistId={playlist?.id}
                />
                <SearchResultsModal
                    isOpen={isSearchOpen}
                    onClose={() => setIsSearchOpen(false)}
                    results={searchResults}
                    loading={isSearching}
                    query={searchQuery}
                />
            </div>
        </DndContext>
    );
};

export default function LiveSelection() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const playlistId = searchParams.get('playlist_id');

    useEffect(() => {
        if (!playlistId) {
            navigate('/live-playlists');
        }
    }, [playlistId, navigate]);

    if (!playlistId) return null;

    return (
        <LiveSelectionProvider>
            <LiveSelectionLayout playlistId={playlistId} />
        </LiveSelectionProvider>
    );
}
