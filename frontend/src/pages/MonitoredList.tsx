import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Trash2, Eye, Clock, ListFilter } from 'lucide-react';
import api from '@/lib/api';

interface MonitoredItem {
    id: number;
    subscription_id: number;
    media_type: string;
    media_id: string;
    title: string;
    is_active: boolean;
    last_check: string | null;
    created_at: string;
}

export default function MonitoredList() {
    const [items, setItems] = useState<MonitoredItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [itemToDelete, setItemToDelete] = useState<MonitoredItem | null>(null);
    const [infoMessage, setInfoMessage] = useState<{ title: string, message: string } | null>(null);

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await api.get<MonitoredItem[]>('/downloads/monitored');
            setItems(res.data);
        } catch (error) {
            console.error("Failed to fetch monitored items", error);
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = (item: MonitoredItem) => {
        console.log("Confirm delete clicked for item:", item);
        setItemToDelete(item);
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;

        try {
            console.log(`Removing monitored item ${itemToDelete.id}...`);
            await api.delete(`/downloads/monitored/${itemToDelete.id}`);
            setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
            setItemToDelete(null);
        } catch (error: any) {
            console.error("Failed to remove monitored item", error);
            setInfoMessage({
                title: "Error",
                message: error.response?.data?.detail || error.message || "Failed to remove item"
            });
        }
    };

    const triggerCheck = async () => {
        try {
            await api.post('/downloads/monitored/check');
            setInfoMessage({
                title: "Monitoring Check",
                message: "Monitoring check triggered in background!"
            });
        } catch (error) {
            console.error("Failed to trigger check", error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Active Surveillance</h2>
                    <p className="text-muted-foreground">Manage categories and series being automatically downloaded</p>
                </div>
                <Button onClick={triggerCheck} className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Check for New Items Now
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ListFilter className="w-5 h-5 text-blue-500" />
                        Monitored Items
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-center py-8">Loading monitored items...</p>
                    ) : items.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed rounded-lg">
                            <Eye className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium">No items under surveillance</h3>
                            <p className="text-muted-foreground">Go to "Selection" to add categories or series to monitor.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {items.map(item => (
                                <Card key={item.id} className="overflow-hidden border-l-4 border-l-blue-500">
                                    <CardContent className="p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="p-1 bg-blue-50 text-blue-600 rounded text-[10px] uppercase font-bold px-2">
                                                {item.media_type.replace('_', ' ')}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    confirmDelete(item);
                                                }}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <h4 className="font-semibold text-lg line-clamp-1 mb-1" title={item.title}>
                                            {item.title}
                                        </h4>
                                        <div className="space-y-1 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Created: {new Date(item.created_at).toLocaleDateString()}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Eye className="w-3 h-3" />
                                                Last check: {item.last_check ? new Date(item.last_check).toLocaleString() : 'Never'}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                title="Stop Monitoring (Confirm)"
            >
                <div className="space-y-4">
                    <p>Are you sure you want to stop monitoring <strong>{itemToDelete?.title}</strong>?</p>
                    <p className="text-sm text-gray-500">
                        This will stop automatic downloads for this item. Existing downloads will remain.
                    </p>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setItemToDelete(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Stop Monitoring
                        </Button>
                    </div>
                </div>
            </Dialog>

            <Dialog
                isOpen={!!infoMessage}
                onClose={() => setInfoMessage(null)}
                title={infoMessage?.title || "Information"}
            >
                <div>
                    <p className="mb-4">{infoMessage?.message}</p>
                    <div className="flex justify-end">
                        <Button onClick={() => setInfoMessage(null)}>
                            OK
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
