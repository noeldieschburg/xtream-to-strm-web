import { useState, useEffect, ChangeEvent } from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import api from "@/lib/api";

interface GlobalSettings {
    global_speed_limit_kbps: number;
    quiet_hours_enabled: boolean;
    quiet_hours_start: string;
    quiet_hours_end: string;
    pause_during_quiet_hours: boolean;
    default_max_retries: number;
}

interface DownloadSettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DownloadSettingsDialog({ isOpen, onClose }: DownloadSettingsDialogProps) {
    const [settings, setSettings] = useState<GlobalSettings | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchSettings();
        }
    }, [isOpen]);

    const fetchSettings = async () => {
        try {
            const res = await api.get<GlobalSettings>("/downloads/settings");
            setSettings(res.data);
        } catch (error) {
            console.error("Failed to fetch settings", error);
        }
    };

    const handleSave = async () => {
        if (!settings) return;
        setLoading(true);
        try {
            await api.put("/downloads/settings", settings);
            onClose();
        } catch (error) {
            console.error("Failed to save settings", error);
        } finally {
            setLoading(false);
        }
    };

    if (!settings) return null;

    return (
        <Dialog isOpen={isOpen} onClose={onClose} title="Advanced Download Settings">
            <div className="space-y-6 py-2">
                {/* Bandwidth Management */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold border-b pb-1">Bandwidth Management</h4>
                    <div className="grid grid-cols-2 items-center gap-4">
                        <Label htmlFor="speed_limit">Global Speed Limit (KB/s)</Label>
                        <Input
                            id="speed_limit"
                            type="number"
                            value={settings.global_speed_limit_kbps}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setSettings({ ...settings, global_speed_limit_kbps: parseInt(e.target.value) })}
                            placeholder="0 for unlimited"
                        />
                    </div>
                </div>

                {/* Intelligent Scheduling */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold border-b pb-1">Quiet Hours (Off-Peak)</h4>
                    <div className="flex items-center justify-between">
                        <Label htmlFor="quiet_enabled">Enable Quiet Hours Logic</Label>
                        <Switch
                            id="quiet_enabled"
                            checked={settings.quiet_hours_enabled}
                            onCheckedChange={(checked) => setSettings({ ...settings, quiet_hours_enabled: checked })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="quiet_start">Start Time</Label>
                            <Input
                                id="quiet_start"
                                type="time"
                                value={settings.quiet_hours_start}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setSettings({ ...settings, quiet_hours_start: e.target.value })}
                                disabled={!settings.quiet_hours_enabled}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="quiet_end">End Time</Label>
                            <Input
                                id="quiet_end"
                                type="time"
                                value={settings.quiet_hours_end}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setSettings({ ...settings, quiet_hours_end: e.target.value })}
                                disabled={!settings.quiet_hours_enabled}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="pause_during">Pause Ongoing Downloads</Label>
                            <p className="text-[10px] text-muted-foreground">Pause active downloads outside off-peak hours</p>
                        </div>
                        <Switch
                            id="pause_during"
                            checked={settings.pause_during_quiet_hours}
                            onCheckedChange={(checked) => setSettings({ ...settings, pause_during_quiet_hours: checked })}
                            disabled={!settings.quiet_hours_enabled}
                        />
                    </div>
                </div>

                {/* Retries */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold border-b pb-1">Automatic Retries</h4>
                    <div className="grid grid-cols-2 items-center gap-4">
                        <Label htmlFor="max_retries">Default Max Retries</Label>
                        <Input
                            id="max_retries"
                            type="number"
                            value={settings.default_max_retries}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setSettings({ ...settings, default_max_retries: parseInt(e.target.value) })}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? "Saving..." : "Save Configuration"}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}
