import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Server, RefreshCw, Check, Loader2, Edit, Save, X } from 'lucide-react';
import api from '@/lib/api';

interface PlexAccount {
    id: number;
    name: string;
    username: string;
    output_base_dir: string;
}

interface PlexServer {
    id: number;
    account_id: number;
    server_id: string;
    name: string;
    uri: string;
    is_owned: boolean;
    is_selected: boolean;
    movies_dir: string;
    series_dir: string;
    version: string | null;
    last_sync: string | null;
}

export default function PlexServers() {
    const [accounts, setAccounts] = useState<PlexAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [servers, setServers] = useState<PlexServer[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [editingServerId, setEditingServerId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({ movies_dir: '', series_dir: '' });

    const fetchAccounts = async () => {
        try {
            const res = await api.get<PlexAccount[]>('/plex/accounts');
            setAccounts(res.data);
            if (res.data.length > 0 && !selectedAccountId) {
                setSelectedAccountId(res.data[0].id);
            }
        } catch (error) {
            console.error("Failed to fetch Plex accounts", error);
        }
    };

    const fetchServers = async (accountId: number) => {
        setLoading(true);
        try {
            const res = await api.get<PlexServer[]>(`/plex/servers/${accountId}`);
            setServers(res.data);
        } catch (error) {
            console.error("Failed to fetch Plex servers", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    useEffect(() => {
        if (selectedAccountId) {
            fetchServers(selectedAccountId);
        }
    }, [selectedAccountId]);

    const handleRefreshServers = async () => {
        if (!selectedAccountId) return;
        setRefreshing(true);
        try {
            await api.post(`/plex/servers/${selectedAccountId}/refresh`);
            await fetchServers(selectedAccountId);
        } catch (error) {
            console.error("Failed to refresh servers", error);
        } finally {
            setRefreshing(false);
        }
    };

    const toggleServerSelection = async (server: PlexServer) => {
        setLoading(true);
        try {
            await api.put(`/plex/servers/${server.id}`, {
                is_selected: !server.is_selected
            });
            if (selectedAccountId) {
                await fetchServers(selectedAccountId);
            }
        } catch (error) {
            console.error("Failed to toggle server selection", error);
        } finally {
            setLoading(false);
        }
    };

    const startEditServer = (server: PlexServer) => {
        setEditingServerId(server.id);
        setEditForm({
            movies_dir: server.movies_dir,
            series_dir: server.series_dir
        });
    };

    const cancelEditServer = () => {
        setEditingServerId(null);
        setEditForm({ movies_dir: '', series_dir: '' });
    };

    const saveServerEdit = async () => {
        if (!editingServerId) return;
        setLoading(true);
        try {
            await api.put(`/plex/servers/${editingServerId}`, editForm);
            if (selectedAccountId) {
                await fetchServers(selectedAccountId);
            }
            cancelEditServer();
        } catch (error) {
            console.error("Failed to update server", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Plex Servers</h2>
                <p className="text-muted-foreground">View and configure your Plex servers.</p>
            </div>

            {/* Account Selector */}
            {accounts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Select Account</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-4 items-center">
                            <select
                                value={selectedAccountId || ''}
                                onChange={(e) => setSelectedAccountId(Number(e.target.value))}
                                className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                {accounts.map(account => (
                                    <option key={account.id} value={account.id}>
                                        {account.name} ({account.username})
                                    </option>
                                ))}
                            </select>
                            <Button
                                onClick={handleRefreshServers}
                                disabled={refreshing || !selectedAccountId}
                                variant="outline"
                            >
                                {refreshing ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                )}
                                Refresh Servers
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* No Accounts Warning */}
            {accounts.length === 0 && (
                <Card className="border-yellow-500/50 bg-yellow-500/5">
                    <CardContent className="pt-6">
                        <p className="text-yellow-500">
                            No Plex accounts configured. Please add an account first in the <strong>Accounts</strong> page.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Servers List */}
            {selectedAccountId && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Server className="w-5 h-5" />
                            Available Servers
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading && servers.length === 0 ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        ) : servers.length === 0 ? (
                            <div className="text-center text-muted-foreground p-8">
                                No servers found. Click "Refresh Servers" to fetch from Plex.tv.
                            </div>
                        ) : (
                            <div className="border rounded-md">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 text-muted-foreground">
                                        <tr>
                                            <th className="p-3 text-center w-12">Select</th>
                                            <th className="p-3 text-left">Server</th>
                                            <th className="p-3 text-left">Output Directories</th>
                                            <th className="p-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {servers.map(server => (
                                            <tr key={server.id} className="hover:bg-muted/50 transition-colors">
                                                <td className="p-3 text-center">
                                                    <button
                                                        onClick={() => toggleServerSelection(server)}
                                                        disabled={loading}
                                                        className={`w-6 h-6 rounded flex items-center justify-center border-2 ${
                                                            server.is_selected
                                                                ? 'bg-green-500 border-green-500 text-white'
                                                                : 'border-gray-300 hover:border-gray-400'
                                                        }`}
                                                    >
                                                        {server.is_selected && <Check className="w-4 h-4" />}
                                                    </button>
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-bold flex items-center gap-2">
                                                        {server.name}
                                                        {server.is_owned && (
                                                            <span className="text-xs bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded">
                                                                Owned
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{server.uri}</div>
                                                    {server.version && (
                                                        <div className="text-xs text-muted-foreground">v{server.version}</div>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    {editingServerId === server.id ? (
                                                        <div className="space-y-1">
                                                            <Input
                                                                value={editForm.movies_dir}
                                                                onChange={(e) => setEditForm(prev => ({ ...prev, movies_dir: e.target.value }))}
                                                                placeholder="Movies directory"
                                                                className="h-8 text-xs"
                                                            />
                                                            <Input
                                                                value={editForm.series_dir}
                                                                onChange={(e) => setEditForm(prev => ({ ...prev, series_dir: e.target.value }))}
                                                                placeholder="Series directory"
                                                                className="h-8 text-xs"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs">
                                                            <div>Movies: <span className="text-muted-foreground">{server.movies_dir}</span></div>
                                                            <div>Series: <span className="text-muted-foreground">{server.series_dir}</span></div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex gap-2 justify-end">
                                                        {editingServerId === server.id ? (
                                                            <>
                                                                <Button onClick={saveServerEdit} disabled={loading} size="sm" variant="default">
                                                                    <Save className="w-4 h-4" />
                                                                </Button>
                                                                <Button onClick={cancelEditServer} disabled={loading} size="sm" variant="outline">
                                                                    <X className="w-4 h-4" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <Button
                                                                onClick={() => startEditServer(server)}
                                                                disabled={loading || editingServerId !== null}
                                                                size="sm"
                                                                variant="outline"
                                                            >
                                                                <Edit className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
