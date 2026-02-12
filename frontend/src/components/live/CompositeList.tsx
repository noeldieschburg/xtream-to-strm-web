import { FC, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, X, GripVertical, Trash2, Move } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { useLiveSelection } from '@/contexts/LiveSelectionContext';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableChannelItemProps {
    ch: any;
    customNames: Record<string, string>;
    editingId: string | null;
    editValue: string;
    setEditValue: (val: string) => void;
    startEditing: (id: string, value: string) => void;
    saveEdit: () => void;
    epgMappings: Record<string, string>;
    setMappingId: (id: string | null) => void;
    removeStreamFromBouquet: (id: number) => void;
    isSelected: boolean;
    toggleSelection: (id: number) => void;
}

const SortableChannelItem: FC<SortableChannelItemProps> = ({
    ch, customNames, editingId, editValue, setEditValue,
    startEditing, saveEdit, epgMappings, setMappingId, removeStreamFromBouquet,
    isSelected, toggleSelection
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: `channel-${ch.id}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`p-2 group flex flex-col gap-1.5 bg-background hover:bg-muted/50 transition-colors ${isDragging ? 'shadow-xl border-primary ring-1 ring-primary' : ''}`}
        >
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                    <div {...attributes} {...listeners} className="cursor-grab hover:text-primary transition-colors pr-1">
                        <GripVertical className="h-4 w-4 opacity-50" />
                    </div>
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(ch.id)}
                        className="h-3.5 w-3.5"
                    />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {editingId === String(ch.id) ? (
                                <input
                                    autoFocus
                                    className="flex-1 text-xs p-0.5 border rounded h-6 w-full"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                    onClick={e => e.stopPropagation()}
                                />
                            ) : (
                                <>
                                    <span className="font-bold truncate text-[13px]" title={ch.stream_id}>
                                        {customNames[ch.stream_id] || ch.stream_id}
                                    </span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border flex-shrink-0 ${(epgMappings[ch.stream_id] || ch.epg_channel_id)
                                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                        : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                        }`}>
                                        {(epgMappings[ch.stream_id] || ch.epg_channel_id) ? 'EPG' : 'NO EPG'}
                                    </span>
                                </>
                            )}
                        </div>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100"
                            onClick={() => startEditing(String(ch.id), customNames[ch.stream_id] || '')}
                        >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                        <span
                            className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[140px] font-medium"
                            title={epgMappings[ch.stream_id] || ch.epg_channel_id || ''}
                        >
                            EPG: {epgMappings[ch.stream_id] || ch.epg_channel_id || 'None'}
                        </span>
                        <Button
                            size="sm"
                            variant="link"
                            className="h-4 p-0 text-[10px] opacity-0 group-hover:opacity-100 text-primary"
                            onClick={() => setMappingId(ch.stream_id)}
                        >
                            Edit
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => removeStreamFromBouquet(ch.id)}
                        title="Remove"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export const CompositeList: FC = () => {
    const {
        playlist,
        selectedBouquetId,
        customNames,
        editingId,
        editValue,
        setEditValue,
        startEditing,
        saveEdit,
        epgMappings,
        setMappingId,
        removeStreamFromBouquet,
        selectedChannelIds,
        setSelectedChannelIds,
        toggleChannelSelection,
        bulkDeleteChannels,
        bulkMoveChannels
    } = useLiveSelection();

    const [composerSearch, setComposerSearch] = useState("");
    const [isMoving, setIsMoving] = useState(false);

    const currentBouquet = useMemo(() => {
        return playlist?.bouquets.find(b => b.id === selectedBouquetId);
    }, [playlist, selectedBouquetId]);

    const filteredChannels = useMemo(() => {
        if (!currentBouquet?.channels) return [];

        return [...currentBouquet.channels]
            .sort((a, b) => a.order - b.order)
            .filter(c => {
                const name = customNames[c.stream_id] || c.stream_id;
                return !composerSearch || name.toLowerCase().includes(composerSearch.toLowerCase());
            });
    }, [currentBouquet, customNames, composerSearch]);

    const isAllSelected = useMemo(() => {
        if (filteredChannels.length === 0) return false;
        return filteredChannels.every(ch => selectedChannelIds.has(ch.id));
    }, [filteredChannels, selectedChannelIds]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const newSelection = new Set(selectedChannelIds);
            filteredChannels.forEach(ch => newSelection.add(ch.id));
            setSelectedChannelIds(newSelection);
        } else {
            const newSelection = new Set(selectedChannelIds);
            filteredChannels.forEach(ch => newSelection.delete(ch.id));
            setSelectedChannelIds(newSelection);
        }
    };

    if (!currentBouquet) {
        return (
            <Card className="flex flex-col min-h-0 border-indigo-500/20 shadow-sm">
                <CardHeader className="py-2.5 px-3 border-b bg-indigo-500/5">
                    <CardTitle className="text-sm font-bold">Composite List</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground text-xs italic">
                    Select a virtual group to view channels
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="flex flex-col min-h-0 border-indigo-500/20 shadow-sm">
            <CardHeader className="py-2.5 px-3 border-b bg-indigo-500/5">
                <CardTitle className="text-sm font-bold flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            checked={isAllSelected}
                            onCheckedChange={handleSelectAll}
                            className="h-3.5 w-3.5"
                        />
                        <span>Composite List</span>
                    </div>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-full font-bold">
                        {filteredChannels.length} Items
                    </span>
                </CardTitle>
                <input
                    type="text"
                    placeholder="Filter composition..."
                    className="w-full mt-2 p-1.5 text-xs border rounded bg-background"
                    value={composerSearch}
                    onChange={(e) => setComposerSearch(e.target.value)}
                />

                {selectedChannelIds.size > 0 && (
                    <div className="mt-2 flex items-center justify-between bg-indigo-500/10 p-1.5 rounded border border-indigo-500/20 animate-in fade-in slide-in-from-top-1">
                        <span className="text-[10px] font-bold text-indigo-600 px-1">
                            {selectedChannelIds.size} selected
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] gap-1 hover:bg-indigo-500/10"
                                onClick={() => setIsMoving(!isMoving)}
                            >
                                <Move className="h-3 w-3" /> Move
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] gap-1 hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => bulkDeleteChannels(Array.from(selectedChannelIds))}
                            >
                                <Trash2 className="h-3 w-3" /> Delete
                            </Button>
                        </div>
                    </div>
                )}

                {selectedChannelIds.size > 0 && isMoving && (
                    <div className="mt-2 p-1.5 bg-background border rounded shadow-sm animate-in fade-in slide-in-from-top-1">
                        <p className="text-[10px] font-bold mb-1 text-muted-foreground">Select Target Group:</p>
                        <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto scrollbar-thin">
                            {playlist?.bouquets
                                .filter(b => b.id !== selectedBouquetId)
                                .map(b => (
                                    <Button
                                        key={b.id}
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 justify-start text-[11px] px-2 py-1"
                                        onClick={() => {
                                            bulkMoveChannels(Array.from(selectedChannelIds), b.id);
                                            setIsMoving(false);
                                        }}
                                    >
                                        {b.custom_name || (b.category_id ? `Smart: ${b.category_id}` : 'Unnamed Group')}
                                    </Button>
                                ))
                            }
                            {(playlist?.bouquets?.length || 0) <= 1 && (
                                <p className="text-[10px] p-2 text-center text-muted-foreground italic">No other groups available</p>
                            )}
                        </div>
                    </div>
                )}
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-thin">
                <div className="divide-y text-xs">
                    <SortableContext items={filteredChannels.map(ch => `channel-${ch.id}`)} strategy={verticalListSortingStrategy}>
                        {filteredChannels.map(ch => (
                            <SortableChannelItem
                                key={ch.id}
                                ch={ch}
                                customNames={customNames}
                                editingId={editingId}
                                editValue={editValue}
                                setEditValue={setEditValue}
                                startEditing={startEditing}
                                saveEdit={saveEdit}
                                epgMappings={epgMappings}
                                setMappingId={setMappingId}
                                removeStreamFromBouquet={removeStreamFromBouquet}
                                isSelected={selectedChannelIds.has(ch.id)}
                                toggleSelection={toggleChannelSelection}
                            />
                        ))}
                    </SortableContext>
                    {filteredChannels.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground text-[10px] italic">
                            No channels added yet
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
