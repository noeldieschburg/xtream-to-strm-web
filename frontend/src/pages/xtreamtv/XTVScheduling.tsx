import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CheckCircle, XCircle, Loader2, Server, RefreshCw } from 'lucide-react';
import { useToast } from "@/components/ui/toast";
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface Subscription {
    id: number;
    name: string;
    is_active: boolean;
}

interface ScheduleConfig {
    type: 'movies' | 'series';
    enabled: boolean;
    frequency: string;
    last_run: string | null;
    next_run: string | null;
}

interface ExecutionHistory {
    id: number;
    schedule_id: number;
    started_at: string;
    completed_at: string | null;
    status: 'success' | 'failed' | 'cancelled' | 'running';
    items_processed: number;
    error_message: string | null;
}

interface JellyfinConfig {
    url: string | null;
    api_token_set: boolean;
    movies_library_id: string | null;
    movies_library_name: string | null;
    series_library_id: string | null;
    series_library_name: string | null;
    refresh_enabled: boolean;
    is_configured: boolean;
}

interface JellyfinLibrary {
    id: string;
    name: string;
    collection_type: string | null;
}

const frequencyOptions = [
    { value: 'five_minutes', label: 'Every 5 Minutes' },
    { value: 'hourly', label: 'Every Hour' },
    { value: 'six_hours', label: 'Every 6 Hours' },
    { value: 'twelve_hours', label: 'Every 12 Hours' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
];

export default function XTVScheduling() {
    const { toast } = useToast();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
    const [moviesConfig, setMoviesConfig] = useState<ScheduleConfig | null>(null);
    const [seriesConfig, setSeriesConfig] = useState<ScheduleConfig | null>(null);
    const [history, setHistory] = useState<ExecutionHistory[]>([]);
    const [loading, setLoading] = useState(true);

    // Jellyfin state
    const [jellyfinConfig, setJellyfinConfig] = useState<JellyfinConfig | null>(null);
    const [jellyfinLibraries, setJellyfinLibraries] = useState<JellyfinLibrary[]>([]);
    const [jellyfinUrl, setJellyfinUrl] = useState('');
    const [jellyfinToken, setJellyfinToken] = useState('');
    const [jellyfinLoading, setJellyfinLoading] = useState(false);
    const [jellyfinTestResult, setJellyfinTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [refreshingLibrary, setRefreshingLibrary] = useState<'movies' | 'series' | null>(null);

    useEffect(() => {
        fetchSubscriptions();
        fetchJellyfinConfig();
    }, []);

    useEffect(() => {
        if (selectedSubId) {
            fetchSchedules();
            fetchHistory();
        }
    }, [selectedSubId]);

    const fetchSubscriptions = async () => {
        try {
            const res = await api.get<Subscription[]>('/subscriptions/');
            setSubscriptions(res.data.filter(s => s.is_active));
            if (res.data.length > 0 && !selectedSubId) {
                setSelectedSubId(res.data[0].id);
            }
        } catch (error) {
            console.error("Failed to fetch subscriptions", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSchedules = async () => {
        if (!selectedSubId) return;
        try {
            const response = await api.get<ScheduleConfig[]>(`/scheduler/config/${selectedSubId}`);
            const configs = response.data;
            setMoviesConfig(configs.find((c) => c.type === 'movies') || null);
            setSeriesConfig(configs.find((c) => c.type === 'series') || null);
        } catch (error) {
            console.error('Error fetching schedules:', error);
        }
    };

    const fetchHistory = async () => {
        if (!selectedSubId) return;
        try {
            const response = await api.get<ExecutionHistory[]>(`/scheduler/history/${selectedSubId}?limit=50`);
            setHistory(response.data);
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    const updateSchedule = async (type: 'movies' | 'series', enabled: boolean, frequency: string) => {
        if (!selectedSubId) return;
        try {
            await api.put(`/scheduler/config/${selectedSubId}/${type}`, { enabled, frequency });
            await fetchSchedules();
        } catch (error) {
            console.error('Error updating schedule:', error);
        }
    };

    // Jellyfin functions
    const fetchJellyfinConfig = async () => {
        try {
            const res = await api.get<JellyfinConfig>('/jellyfin/config');
            setJellyfinConfig(res.data);
            if (res.data.url) setJellyfinUrl(res.data.url);
            if (res.data.is_configured) {
                fetchJellyfinLibraries();
            }
        } catch (error) {
            console.error('Error fetching Jellyfin config:', error);
        }
    };

    const fetchJellyfinLibraries = async () => {
        try {
            const res = await api.get<{ libraries: JellyfinLibrary[]; error?: string }>('/jellyfin/libraries');
            if (res.data.error) {
                console.error('Jellyfin error:', res.data.error);
            } else {
                setJellyfinLibraries(res.data.libraries);
            }
        } catch (error) {
            console.error('Error fetching Jellyfin libraries:', error);
        }
    };

    const saveJellyfinConfig = async (updates: Partial<{ url: string; api_token: string; movies_library_id: string; series_library_id: string; refresh_enabled: boolean }>) => {
        try {
            const res = await api.post<JellyfinConfig>('/jellyfin/config', updates);
            setJellyfinConfig(res.data);
            toast.success('Jellyfin settings saved');
        } catch (error) {
            console.error('Error saving Jellyfin config:', error);
            toast.error('Failed to save Jellyfin settings');
        }
    };

    const testJellyfinConnection = async () => {
        setJellyfinLoading(true);
        setJellyfinTestResult(null);
        try {
            // Save URL and token first
            await api.post('/jellyfin/config', { url: jellyfinUrl, api_token: jellyfinToken });
            // Then test
            const res = await api.post<{ success: boolean; message: string; server_name?: string; version?: string }>('/jellyfin/test');
            setJellyfinTestResult(res.data);
            if (res.data.success) {
                toast.success(res.data.message);
                fetchJellyfinConfig();
                fetchJellyfinLibraries();
            } else {
                toast.error(res.data.message);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Connection failed';
            setJellyfinTestResult({ success: false, message });
            toast.error(message);
        } finally {
            setJellyfinLoading(false);
        }
    };

    const refreshJellyfinLibrary = async (type: 'movies' | 'series') => {
        const libraryId = type === 'movies'
            ? jellyfinConfig?.movies_library_id
            : jellyfinConfig?.series_library_id;

        if (!libraryId) {
            toast.error(`No ${type} library selected`);
            return;
        }

        setRefreshingLibrary(type);
        try {
            const res = await api.post<{ success: boolean; message: string }>(`/jellyfin/refresh/${libraryId}`);
            if (res.data.success) {
                toast.success(res.data.message);
            } else {
                toast.error(res.data.message);
            }
        } catch (error) {
            console.error('Error refreshing Jellyfin library:', error);
            toast.error('Failed to refresh Jellyfin library');
        } finally {
            setRefreshingLibrary(null);
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

    if (subscriptions.length === 0) {
        return (
            <div className="space-y-8">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Scheduler</h2>
                    <p className="text-muted-foreground">Configure automatic sync schedules</p>
                </div>
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                        No active subscriptions. Go to Configuration to add subscriptions.
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Scheduler</h2>
                <p className="text-muted-foreground">Configure automatic sync schedules</p>
            </div>

            {/* Subscription Selector */}
            <div className="flex gap-2">
                <label className="text-sm font-medium self-center">Subscription:</label>
                <select
                    value={selectedSubId || ''}
                    onChange={(e) => setSelectedSubId(Number(e.target.value))}
                    className="border rounded-md px-3 py-2 text-sm"
                >
                    {subscriptions.map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.name}</option>
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

            {/* Jellyfin Integration */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="w-5 h-5" />
                        Jellyfin Integration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Server Configuration */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Jellyfin Server URL</label>
                            <input
                                type="text"
                                placeholder="http://jellyfin:8096"
                                value={jellyfinUrl}
                                onChange={(e) => setJellyfinUrl(e.target.value)}
                                className="w-full border rounded-md px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">API Token</label>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    placeholder={jellyfinConfig?.api_token_set ? '••••••••' : 'Enter API token'}
                                    value={jellyfinToken}
                                    onChange={(e) => setJellyfinToken(e.target.value)}
                                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                                />
                                <button
                                    onClick={testJellyfinConnection}
                                    disabled={jellyfinLoading || !jellyfinUrl}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {jellyfinLoading ? 'Testing...' : 'Test'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Test Result */}
                    {jellyfinTestResult && (
                        <div className={`p-3 rounded-md text-sm ${jellyfinTestResult.success ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20'}`}>
                            {jellyfinTestResult.message}
                        </div>
                    )}

                    {/* Library Selection */}
                    {jellyfinConfig?.is_configured && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Movies Library</label>
                                <div className="flex gap-2">
                                    <select
                                        value={jellyfinConfig?.movies_library_id || ''}
                                        onChange={(e) => saveJellyfinConfig({ movies_library_id: e.target.value })}
                                        className="flex-1 border rounded-md px-3 py-2 text-sm"
                                    >
                                        <option value="">-- Select Library --</option>
                                        {jellyfinLibraries
                                            .filter(lib => lib.collection_type === 'movies' || lib.collection_type === null)
                                            .map(lib => (
                                                <option key={lib.id} value={lib.id}>{lib.name}</option>
                                            ))
                                        }
                                    </select>
                                    <button
                                        onClick={() => refreshJellyfinLibrary('movies')}
                                        disabled={!jellyfinConfig?.movies_library_id || refreshingLibrary === 'movies'}
                                        className="px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                                        title="Refresh Movies Library"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${refreshingLibrary === 'movies' ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                                {jellyfinConfig?.movies_library_name && (
                                    <p className="text-xs text-muted-foreground">Current: {jellyfinConfig.movies_library_name}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Series Library</label>
                                <div className="flex gap-2">
                                    <select
                                        value={jellyfinConfig?.series_library_id || ''}
                                        onChange={(e) => saveJellyfinConfig({ series_library_id: e.target.value })}
                                        className="flex-1 border rounded-md px-3 py-2 text-sm"
                                    >
                                        <option value="">-- Select Library --</option>
                                        {jellyfinLibraries
                                            .filter(lib => lib.collection_type === 'tvshows' || lib.collection_type === null)
                                            .map(lib => (
                                                <option key={lib.id} value={lib.id}>{lib.name}</option>
                                            ))
                                        }
                                    </select>
                                    <button
                                        onClick={() => refreshJellyfinLibrary('series')}
                                        disabled={!jellyfinConfig?.series_library_id || refreshingLibrary === 'series'}
                                        className="px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                                        title="Refresh Series Library"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${refreshingLibrary === 'series' ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                                {jellyfinConfig?.series_library_name && (
                                    <p className="text-xs text-muted-foreground">Current: {jellyfinConfig.series_library_name}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Enable Toggle */}
                    <div className="flex items-center justify-between pt-4 border-t">
                        <div>
                            <span className="text-sm font-medium">Auto-refresh after sync</span>
                            <p className="text-xs text-muted-foreground">
                                Automatically trigger Jellyfin library refresh when sync completes
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={jellyfinConfig?.refresh_enabled || false}
                            onChange={(e) => saveJellyfinConfig({ refresh_enabled: e.target.checked })}
                            disabled={!jellyfinConfig?.is_configured}
                            className="w-4 h-4"
                        />
                    </div>
                </CardContent>
            </Card>

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
