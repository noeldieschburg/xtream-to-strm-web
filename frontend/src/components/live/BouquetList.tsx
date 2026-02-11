import { FC, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ListPlus, Pencil, Trash2, GripVertical, Copy, Download, Upload } from 'lucide-react';
import { useLiveSelection } from '@/contexts/LiveSelectionContext';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableBouquetItemProps {
    b: any;
    isSelected: boolean;
    customNames: Record<string, string>;
    editingId: string | null;
    editValue: string;
    setEditValue: (val: string) => void;
    startEditing: (id: string, value: string) => void;
    saveEdit: () => void;
    deleteBouquet: (id: number) => void;
    duplicateBouquet: (id: number) => void;
    exportBouquet: (id: number) => void;
    setSelectedBouquetId: (id: number) => void;
    setSelectedCategory: (id: string | null) => void;
    compactMode: boolean;
}

const SortableBouquetItem: FC<SortableBouquetItemProps> = ({
    b, isSelected, customNames, editingId, editValue, setEditValue,
    startEditing, saveEdit, deleteBouquet, duplicateBouquet, exportBouquet,
    setSelectedBouquetId, setSelectedCategory, compactMode
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: `bouquet-${b.id}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    const isEditing = editingId === String(b.id);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`p-2 group flex items-center gap-2 border-l-4 ${isSelected ? 'bg-indigo-500/10 border-indigo-500' : 'border-transparent'} ${isDragging ? 'shadow-lg border-primary' : ''}`}
            onClick={() => {
                setSelectedBouquetId(b.id);
                if (b.category_id) {
                    setSelectedCategory(b.category_id);
                } else {
                    setSelectedCategory(null);
                }
            }}
        >
            <div {...attributes} {...listeners} className="cursor-grab hover:text-primary transition-colors">
                <GripVertical className="h-4 w-4 opacity-50" />
            </div>

            <div className="flex-1 truncate min-w-0">
                {isEditing ? (
                    <input
                        autoFocus
                        className="w-full text-xs p-1 border rounded"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveEdit()}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <>
                        <span className={`font-medium truncate block ${compactMode ? 'text-xs' : 'text-sm'}`}>
                            {customNames[b.category_id || String(b.id)] || b.custom_name || (b.category_id ? 'Smart Group' : 'Virtual Group')}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded-full font-bold">
                                {b.channels.length} {b.channels.length === 1 ? 'channel' : 'channels'}
                            </span>
                            {b.category_id && (
                                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                    Smart
                                </span>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); startEditing(String(b.id), b.custom_name || ''); }}
                    title="Rename"
                >
                    <Pencil className="h-3 w-3" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); duplicateBouquet(b.id); }}
                    title="Duplicate"
                >
                    <Copy className="h-3 w-3" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); exportBouquet(b.id); }}
                    title="Export JSON"
                >
                    <Download className="h-3 w-3" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Delete this group?")) deleteBouquet(b.id);
                    }}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
};

export const BouquetList: FC = () => {
    const {
        playlist,
        selectedBouquetId,
        setSelectedBouquetId,
        setSelectedCategory,
        customNames,
        editingId,
        editValue,
        setEditValue,
        startEditing,
        saveEdit,
        addVirtualBouquet,
        deleteBouquet,
        duplicateBouquet,
        exportBouquet,
        importBouquet,
        compactMode
    } = useLiveSelection();

    const [isAddingBouquet, setIsAddingBouquet] = useState(false);
    const [newBouquetName, setNewBouquetName] = useState("");

    const handleAddBouquet = async () => {
        if (!newBouquetName.trim()) return;
        await addVirtualBouquet(newBouquetName);
        setNewBouquetName("");
        setIsAddingBouquet(false);
    };

    const sortedBouquets = playlist?.bouquets ? [...playlist.bouquets].sort((a, b) => a.order - b.order) : [];

    return (
        <Card className="flex flex-col min-h-0 border-indigo-500/20 shadow-sm">
            <CardHeader className={`py-2.5 px-3 border-b bg-indigo-500/5 ${compactMode ? 'py-1.5' : ''}`}>
                <CardTitle className="text-sm font-bold flex justify-between items-center">
                    <span className="flex items-center gap-2"><ListPlus className="h-4 w-4 text-indigo-500" /> Virtual Groups</span>
                    <div className="flex items-center gap-1">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-indigo-500"
                            onClick={() => document.getElementById('bouquet-import-input')?.click()}
                            title="Import JSON"
                        >
                            <Upload className="h-3.5 w-3.5" />
                        </Button>
                        <input
                            id="bouquet-import-input"
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) importBouquet(file);
                            }}
                        />
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-indigo-500"
                            onClick={() => setIsAddingBouquet(true)}
                            title="New Virtual Group"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                </CardTitle>
                {isAddingBouquet && (
                    <div className="mt-2 flex gap-1">
                        <input
                            autoFocus
                            className="flex-1 text-xs p-1 border rounded"
                            placeholder="Group name..."
                            value={newBouquetName}
                            onChange={e => setNewBouquetName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddBouquet()}
                        />
                        <Button size="sm" className="h-7 px-2" onClick={handleAddBouquet}>Add</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setIsAddingBouquet(false)}>X</Button>
                    </div>
                )}
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-thin">
                <div className="divide-y text-sm">
                    <SortableContext items={sortedBouquets.map(b => `bouquet-${b.id}`)} strategy={verticalListSortingStrategy}>
                        {sortedBouquets.map(b => (
                            <SortableBouquetItem
                                key={b.id}
                                b={b}
                                isSelected={selectedBouquetId === b.id}
                                customNames={customNames}
                                editingId={editingId}
                                editValue={editValue}
                                setEditValue={setEditValue}
                                startEditing={startEditing}
                                saveEdit={saveEdit}
                                deleteBouquet={deleteBouquet}
                                duplicateBouquet={duplicateBouquet}
                                exportBouquet={exportBouquet}
                                setSelectedBouquetId={setSelectedBouquetId}
                                setSelectedCategory={setSelectedCategory}
                                compactMode={compactMode}
                            />
                        ))}
                    </SortableContext>
                </div>
            </CardContent>
        </Card>
    );
};
