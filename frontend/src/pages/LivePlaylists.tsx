import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit3, Loader2, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';

interface Subscription {
    id: number;
    name: string;
}

interface LivePlaylist {
    id: number;
    subscription_id: number;
    name: string;
    description: string;
    created_at: string;
}

export default function LivePlaylists() {
    const [playlists, setPlaylists] = useState<LivePlaylist[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [selectedSubscription, setSelectedSubscription] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        fetchSubscriptions();
    }, []);

    useEffect(() => {
        if (selectedSubscription !== null) {
            fetchPlaylists(selectedSubscription);
        }
    }, [selectedSubscription]);

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

    const fetchPlaylists = async (subId: number) => {
        setLoading(true);
        try {
            const res = await api.get<LivePlaylist[]>(`/live/playlists?subscription_id=${subId}`);
            setPlaylists(res.data);
        } catch (error) {
            console.error("Failed to fetch playlists", error);
        } finally {
            setLoading(false);
        }
    };

    const createPlaylist = async () => {
        if (!selectedSubscription || !newPlaylistName) return;
        setCreating(true);
        try {
            const res = await api.post<LivePlaylist>('/live/playlists', {
                subscription_id: selectedSubscription,
                name: newPlaylistName,
                description: "Nouvelle playlist"
            });
            setPlaylists([...playlists, res.data]);
            setNewPlaylistName("");
            // Optionnel: naviguer vers l'édition
            // navigate(`/live/selection/${res.data.id}`);
        } catch (error) {
            console.error("Failed to create playlist", error);
        } finally {
            setCreating(false);
        }
    };

    const deletePlaylist = async (id: number) => {
        if (!confirm("Delete this playlist?")) return;
        try {
            await api.delete(`/live/playlists/${id}`);
            setPlaylists(playlists.filter((p: LivePlaylist) => p.id !== id));
        } catch (error) {
            console.error("Failed to delete playlist", error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Live Playlists</h2>
                    <p className="text-muted-foreground">Manage your custom Live TV configurations</p>
                </div>
                <div className="flex gap-4">
                    <select
                        className="p-2 border rounded bg-background"
                        value={selectedSubscription || ''}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSubscription(Number(e.target.value))}
                    >
                        {subscriptions.map((sub: Subscription) => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="border-dashed flex flex-col items-center justify-center p-6 text-center">
                    <Radio className="h-10 w-10 text-muted-foreground mb-4" />
                    <CardTitle className="mb-2 text-lg">Create Playlist</CardTitle>
                    <CardDescription className="mb-4">Multiple configurations per subscription</CardDescription>
                    <div className="flex w-full gap-2">
                        <input
                            type="text"
                            placeholder="Playlist Name"
                            className="flex-1 p-2 border rounded text-sm"
                            value={newPlaylistName}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPlaylistName(e.target.value)}
                        />
                        <Button onClick={createPlaylist} disabled={creating || !newPlaylistName}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </Button>
                    </div>
                </Card>

                {loading ? (
                    <div className="col-span-full flex justify-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    playlists.map((playlist: LivePlaylist) => (
                        <Card key={playlist.id} className="flex flex-col">
                            <CardHeader>
                                <CardTitle>{playlist.name}</CardTitle>
                                <CardDescription>{playlist.description || "No description"}</CardDescription>
                            </CardHeader>
                            <CardContent className="mt-auto pt-0 flex justify-between gap-2">
                                <Button
                                    className="flex-1"
                                    variant="secondary"
                                    onClick={() => navigate(`/live-selection?playlist_id=${playlist.id}`)}
                                >
                                    <Edit3 className="mr-2 h-4 w-4" />
                                    Configure
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => deletePlaylist(playlist.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
