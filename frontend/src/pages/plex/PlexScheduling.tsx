import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useToast } from "@/components/ui/toast";
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface PlexServer {
    id: number;
    name: string;
    is_selected: boolean;
}

interface PlexScheduleConfig {
    type: 'movies' | 'series';
    enabled: boolean;
    frequency: string;
    last_run: string | null;
    next_run: string | null;
}

interface PlexExecutionHistory {
    id: number;
    schedule_id: number;
    started_at: string;
    completed_at: string | null;
    status: 'success' | 'failed' | 'cancelled' | 'running';
    items_processed: number;
    error_message: string | null;
}

const frequencyOptions = [
    { value: 'five_minutes', label: 'Every 5 Minutes' },
    { value: 'hourly', label: 'Every Hour' },
    { value: 'six_hours', label: 'Every 6 Hours' },
    { value: 'twelve_hours', label: 'Every 12 Hours' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
];

export default function PlexScheduling() {
    const { toast } = useToast();
    const [servers, setServers] = useState<PlexServer[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [moviesConfig, setMoviesConfig] = useState<PlexScheduleConfig | null>(null);
    const [seriesConfig, setSeriesConfig] = useState<PlexScheduleConfig | null>(null);
    const [history, setHistory] = useState<PlexExecutionHistory[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchServers();
    }, []);

    useEffect(() => {
        if (selectedServerId) {
            fetchSchedules();
            fetchHistory();
        }
    }, [selectedServerId]);

    const fetchServers = async () => {
        try {
            // Get all accounts first
            const accountsRes = await api.get<{ id: number }[]>('/plex/accounts');
            const allServers: PlexServer[] = [];

            // For each account, get servers
            for (const account of accountsRes.data) {
                const serversRes = await api.get<PlexServer[]>(`/plex/servers/${account.id}`);
                allServers.push(...serversRes.data.filter(s => s.is_selected));
            }

            setServers(allServers);
            if (allServers.length > 0 && !selectedServerId) {
                setSelectedServerId(allServers[0].id);
            }
        } catch (error) {
            console.error("Failed to fetch Plex servers", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSchedules = async () => {
        if (!selectedServerId) return;
        try {
            const response = await api.get<PlexScheduleConfig[]>(`/plex-scheduler/config/${selectedServerId}`);
            const configs = response.data;
            setMoviesConfig(configs.find((c) => c.type === 'movies') || null);
            setSeriesConfig(configs.find((c) => c.type === 'series') || null);
        } catch (error) {
            console.error('Error fetching Plex schedules:', error);
        }
    };

    const fetchHistory = async () => {
        if (!selectedServerId) return;
        try {
            const response = await api.get<PlexExecutionHistory[]>(`/plex-scheduler/history/${selectedServerId}?limit=50`);
            setHistory(response.data);
        } catch (error) {
            console.error('Error fetching Plex history:', error);
        }
    };

    const updateSchedule = async (type: 'movies' | 'series', enabled: boolean, frequency: string) => {
        if (!selectedServerId) return;
        try {
            await api.put(`/plex-scheduler/config/${selectedServerId}/${type}`, { enabled, frequency });
            toast.success(`Plex ${type} schedule updated`);
            await fetchSchedules();
        } catch (error) {
            console.error('Error updating Plex schedule:', error);
            toast.error('Failed to update schedule');
        }
    };

    const formatDate = (dateString: string | null) => {
        return formatDateTime(dateString);
    };

    const formatDuration = (start: string, end: string | null) => {
        if (!end) return '-';
        const duration = new Date(end).getTime() - new Date(start).getTime();
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    };

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            success: 'bg-green-500/10 text-green-500 border-green-500/20',
            failed: 'bg-red-500/10 text-red-500 border-red-500/20',
            running: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
            cancelled: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
        };

        const labels: Record<string, string> = {
            success: 'Success',
            failed: 'Failed',
            running: 'Running',
            cancelled: 'Cancelled',
        };

        const icons: Record<string, JSX.Element> = {
            success: <CheckCircle className="w-4 h-4" />,
            failed: <XCircle className="w-4 h-4" />,
            running: <Loader2 className="w-4 h-4 animate-spin" />,
            cancelled: <XCircle className="w-4 h-4" />,
        };

        return (
            <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md border ${colors[status] || colors.cancelled}`}>
                {icons[status] || icons.cancelled}
                <span className="text-xs font-medium">{labels[status] || status}</span>
            </div>
        );
    };

    if (loading) {
        return <div className="flex items-center justify-center h-full">Loading...</div>;
    }

    if (servers.length === 0) {
        return (
            <div className="space-y-8">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Plex Scheduler</h2>
                    <p className="text-muted-foreground">Configure automatic Plex sync schedules</p>
                </div>
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                        No selected Plex servers. Go to Plex &gt; Servers to select servers for sync.
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Plex Scheduler</h2>
                <p className="text-muted-foreground">Configure automatic Plex sync schedules</p>
            </div>

            {/* Server Selector */}
            <div className="flex gap-2">
                <label className="text-sm font-medium self-center">Server:</label>
                <select
                    value={selectedServerId || ''}
                    onChange={(e) => setSelectedServerId(Number(e.target.value))}
                    className="border rounded-md px-3 py-2 text-sm"
                >
                    {servers.map(server => (
                        <option key={server.id} value={server.id}>{server.name}</option>
                    ))}
                </select>
            </div>

            {/* Schedule Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Movies Schedule */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            Movies Schedule
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Enabled</span>
                            <input
                                type="checkbox"
                                checked={moviesConfig?.enabled || false}
                                onChange={(e) => updateSchedule('movies', e.target.checked, moviesConfig?.frequency || 'daily')}
                                className="w-4 h-4"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Frequency</label>
                            <select
                                value={moviesConfig?.frequency || 'daily'}
                                onChange={(e) => updateSchedule('movies', moviesConfig?.enabled || false, e.target.value)}
                                className="w-full border rounded-md px-3 py-2 text-sm"
                            >
                                {frequencyOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="pt-4 border-t space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Last Run:</span>
                                <span>{formatDate(moviesConfig?.last_run || null)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Next Run:</span>
                                <span>{formatDate(moviesConfig?.next_run || null)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Series Schedule */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            Series Schedule
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Enabled</span>
                            <input
                                type="checkbox"
                                checked={seriesConfig?.enabled || false}
                                onChange={(e) => updateSchedule('series', e.target.checked, seriesConfig?.frequency || 'daily')}
                                className="w-4 h-4"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Frequency</label>
                            <select
                                value={seriesConfig?.frequency || 'daily'}
                                onChange={(e) => updateSchedule('series', seriesConfig?.enabled || false, e.target.value)}
                                className="w-full border rounded-md px-3 py-2 text-sm"
                            >
                                {frequencyOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="pt-4 border-t space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Last Run:</span>
                                <span>{formatDate(seriesConfig?.last_run || null)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Next Run:</span>
                                <span>{formatDate(seriesConfig?.next_run || null)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Execution History */}
            <Card>
                <CardHeader>
                    <CardTitle>Execution History</CardTitle>
                </CardHeader>
                <CardContent>
                    {history.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            No execution history yet
                        </div>
                    ) : (
                        <div className="border rounded-md">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                        <th className="p-3 text-left">Started</th>
                                        <th className="p-3 text-left">Duration</th>
                                        <th className="p-3 text-left">Status</th>
                                        <th className="p-3 text-right">Items</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {history.map(exec => (
                                        <tr key={exec.id} className="hover:bg-muted/50">
                                            <td className="p-3">{formatDate(exec.started_at)}</td>
                                            <td className="p-3">{formatDuration(exec.started_at, exec.completed_at)}</td>
                                            <td className="p-3">{getStatusBadge(exec.status)}</td>
                                            <td className="p-3 text-right font-medium">{exec.items_processed}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
