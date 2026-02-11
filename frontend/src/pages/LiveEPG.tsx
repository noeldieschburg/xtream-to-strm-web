import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Plus, Trash2, RefreshCw, Loader2, ArrowLeft,
    Settings, ExternalLink, Activity, Zap
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';

interface EPGSource {
    id: number;
    playlist_id: number;
    source_type: string;
    source_url: string | null;
    file_path: string | null;
    priority: number;
    last_updated: string | null;
    is_active: boolean;
}

export default function LiveEPG() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const playlistId = searchParams.get('playlist_id');

    const [sources, setSources] = useState<EPGSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [matching, setMatching] = useState(false);

    // Form state
    const [newSourceUrl, setNewSourceUrl] = useState("");
    const [newSourceType, setNewSourceType] = useState("url");

    useEffect(() => {
        if (!playlistId) {
            navigate('/live-playlists');
            return;
        }
        fetchSources();
    }, [playlistId]);

    const fetchSources = async () => {
        setLoading(true);
        try {
            const res = await api.get<EPGSource[]>(`/live/playlists/${playlistId}/epg-sources`);
            setSources(res.data);
        } catch (error) {
            console.error("Failed to fetch EPG sources", error);
        } finally {
            setLoading(false);
        }
    };

    const addSource = async () => {
        if (!playlistId) return;
        setCreating(true);
        try {
            await api.post(`/live/playlists/${playlistId}/epg-sources`, {
                playlist_id: Number(playlistId),
                source_type: newSourceType,
                source_url: newSourceUrl,
                priority: sources.length
            });
            setNewSourceUrl("");
            fetchSources();
        } catch (error) {
            console.error("Failed to add EPG source", error);
        } finally {
            setCreating(false);
        }
    };

    const deleteSource = async (id: number) => {
        if (!confirm("Are you sure you want to delete this EPG source?")) return;
        try {
            await api.delete(`/live/epg-sources/${id}`);
            fetchSources();
        } catch (error) {
            console.error("Failed to delete EPG source", error);
        }
    };

    const refreshSource = async (id: number) => {
        try {
            await api.post(`/live/epg-sources/${id}/refresh`);
            alert("Refresh triggered in background");
            fetchSources();
        } catch (error) {
            console.error("Failed to refresh EPG source", error);
        }
    };

    const triggerAutoMatch = async () => {
        if (!playlistId) return;
        setMatching(true);
        try {
            const res = await api.post(`/live/playlists/${playlistId}/epg-auto-match`);
            alert(`Auto-match complete! ${res.data.matched_count} channels matched.`);
            fetchSources();
        } catch (error) {
            console.error("Failed to trigger auto-match", error);
            alert("Auto-match failed");
        } finally {
            setMatching(false);
        }
    };

    const toggleActive = async (source: EPGSource) => {
        try {
            await api.put(`/live/epg-sources/${source.id}`, {
                is_active: !source.is_active
            });
            fetchSources();
        } catch (error) {
            console.error("Failed to update EPG source", error);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/live-selection?playlist_id=${playlistId}`)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">EPG Sources</h2>
                        <CardDescription>Manage Electronic Program Guide sources for this playlist</CardDescription>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={triggerAutoMatch} disabled={matching || loading}>
                        {matching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2 text-yellow-500" />}
                        Auto-Match
                    </Button>
                    <Button variant="outline" onClick={fetchSources} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh List
                    </Button>
                </div>
            </div>

            <div className="grid gap-6">
                {/* Add New Source */}
                <Card className="border-dashed border-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            Add XMLTV Source
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col md:flex-row gap-3">
                            <select
                                className="p-2 border rounded bg-background text-sm w-full md:w-32"
                                value={newSourceType}
                                onChange={(e) => setNewSourceType(e.target.value)}
                            >
                                <option value="url">URL (XMLTV)</option>
                                <option value="xtream">Xtream</option>
                                <option value="file">Local File</option>
                            </select>
                            <input
                                type="text"
                                placeholder="https://example.com/guide.xml.gz"
                                className="flex-1 p-2 border rounded text-sm bg-background"
                                value={newSourceUrl}
                                onChange={(e) => setNewSourceUrl(e.target.value)}
                            />
                            <Button onClick={addSource} disabled={creating || !newSourceUrl}>
                                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Source"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Sources List */}
                {loading && sources.length === 0 ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {sources.map(source => (
                            <Card key={source.id} className={!source.is_active ? "opacity-60" : ""}>
                                <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={`p-2 rounded-full ${source.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                            <Activity className="h-5 w-5" />
                                        </div>
                                        <div className="truncate">
                                            <div className="font-semibold flex items-center gap-2">
                                                {source.source_type.toUpperCase()} Source
                                                {source.is_active && <span className="h-2 w-2 rounded-full bg-green-500" />}
                                            </div>
                                            <div className="text-sm text-muted-foreground truncate max-w-md">
                                                {source.source_url || source.file_path || "Xtream internal EPG"}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                Last updated: {source.last_updated ? new Date(source.last_updated).toLocaleString() : "Never"} • Priority: {source.priority}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={() => refreshSource(source.id)}>
                                            <RefreshCw className="h-4 w-4 mr-2" />
                                            Update
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => toggleActive(source)}>
                                            {source.is_active ? "Deactivate" : "Activate"}
                                        </Button>
                                        <Button variant="destructive" size="icon" onClick={() => deleteSource(source.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {sources.length === 0 && !loading && (
                            <div className="text-center p-12 text-muted-foreground border rounded-lg border-dashed">
                                No EPG sources defined for this playlist.
                            </div>
                        )}
                    </div>
                )}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        EPG Info
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                    <p>
                        XMLTV sources are parsed and cached in Redis. High priority sources take precedence for program data.
                    </p>
                    <div className="p-3 bg-muted rounded-md flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">XMLTV URL:</span>
                            <span className="text-xs select-all text-foreground">
                                {window.location.origin}/api/v1/live/playlist.xml?playlist_id={playlistId}
                            </span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => window.open(`${window.location.origin}/api/v1/live/playlist.xml?playlist_id=${playlistId}`, '_blank')}>
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
