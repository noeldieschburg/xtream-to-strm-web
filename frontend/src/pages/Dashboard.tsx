import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Film, Tv, Activity, HardDrive, Loader2, CheckCircle, XCircle } from 'lucide-react';
import api from '@/lib/api';

interface RunningTask {
    source: string;
    type: string;
    sync_type: string;
    started_at: string | null;
}

interface DashboardStats {
    total_content: {
        total: number;
        movies: number;
        series: number;
    };
    sources: {
        total: number;
        active: number;
        inactive: number;
    };
    sync_status: {
        in_progress: number;
        errors_24h: number;
        success_rate: number;
        running_tasks: RunningTask[];
    };
}

const formatDuration = (startedAt: string | null): string => {
    if (!startedAt) return '';
    const start = new Date(startedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ${diffSec % 60}s`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}h ${diffMin % 60}m`;
};

export default function Dashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);

    const fetchData = async () => {
        try {
            const statsRes = await api.get<DashboardStats>('/dashboard/stats');
            setStats(statsRes.data);
        } catch (error) {
            console.error("Failed to fetch dashboard data", error);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, []);

    const runningTasks = stats?.sync_status?.running_tasks || [];

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <p className="text-muted-foreground">Overview of your Xtream to STRM synchronization.</p>
            </div>

            {/* Statistics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Content</CardTitle>
                        <Film className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.total_content?.total?.toLocaleString() || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats?.sources?.total || 0} Sources Configured
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Movies</CardTitle>
                        <Film className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.total_content?.movies?.toLocaleString() || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats?.total_content?.total ? ((stats.total_content.movies / stats.total_content.total) * 100).toFixed(1) : 0}% of total
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Series</CardTitle>
                        <Tv className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.total_content?.series?.toLocaleString() || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats?.total_content?.total ? ((stats.total_content.series / stats.total_content.total) * 100).toFixed(1) : 0}% of total
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Sync Status & Content Distribution */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            Sync Status
                            {runningTasks.length > 0 && (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {/* Running Tasks */}
                            {runningTasks.length > 0 ? (
                                <div className="space-y-3">
                                    <p className="text-sm font-medium text-blue-600">Running Tasks:</p>
                                    {runningTasks.map((task, idx) => (
                                        <div key={idx} className="flex items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-500 mr-3" />
                                            <div className="flex-1">
                                                <p className="text-sm font-medium">{task.source}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {task.type === 'plex' ? 'Plex' : 'Xtream'} - {task.sync_type}
                                                </p>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatDuration(task.started_at)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                                    <CheckCircle className="h-4 w-4 text-green-500 mr-3" />
                                    <span className="text-sm text-muted-foreground">No sync tasks running</span>
                                </div>
                            )}

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${(stats?.sync_status?.success_rate || 100) >= 90 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'}`}>
                                        <CheckCircle className={`h-4 w-4 ${(stats?.sync_status?.success_rate || 100) >= 90 ? 'text-green-600' : 'text-yellow-600'}`} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{stats?.sync_status?.success_rate || 100}%</p>
                                        <p className="text-xs text-muted-foreground">Success (24h)</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${(stats?.sync_status?.errors_24h || 0) === 0 ? 'bg-gray-100 dark:bg-gray-800' : 'bg-red-100 dark:bg-red-900/30'}`}>
                                        <XCircle className={`h-4 w-4 ${(stats?.sync_status?.errors_24h || 0) === 0 ? 'text-gray-400' : 'text-red-600'}`} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{stats?.sync_status?.errors_24h || 0}</p>
                                        <p className="text-xs text-muted-foreground">Errors (24h)</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Content Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-8">
                            <div className="flex items-center">
                                <HardDrive className="mr-2 h-4 w-4 opacity-70" />
                                <div className="ml-4 space-y-1">
                                    <p className="text-sm font-medium leading-none">Sources</p>
                                    <p className="text-sm text-muted-foreground">
                                        {stats?.sources?.active || 0} Active / {stats?.sources?.total || 0} Total
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span>Movies</span>
                                    <span>{stats?.total_content?.movies ? ((stats.total_content.movies / (stats.total_content.total || 1)) * 100).toFixed(0) : 0}%</span>
                                </div>
                                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${stats?.total_content?.movies ? ((stats.total_content.movies / (stats.total_content.total || 1)) * 100) : 0}%` }} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span>Series</span>
                                    <span>{stats?.total_content?.series ? ((stats.total_content.series / (stats.total_content.total || 1)) * 100).toFixed(0) : 0}%</span>
                                </div>
                                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                    <div className="h-full bg-purple-500" style={{ width: `${stats?.total_content?.series ? ((stats.total_content.series / (stats.total_content.total || 1)) * 100) : 0}%` }} />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Info */}
            <div>
                <h3 className="text-xl font-semibold mb-4">Quick Info</h3>
                <Card>
                    <CardContent className="p-6">
                        <p className="text-muted-foreground">
                            For detailed subscription management and sync controls, visit the <strong>XtreamTV &gt; Subscriptions</strong> page.
                            View complete sync history on the <strong>Sync History</strong> page.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
