import { useState, useMemo, FC } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Radio, ArrowRight, ListFilter } from 'lucide-react';
import { useLiveSelection } from '@/contexts/LiveSelectionContext';

export const StreamLibrary: FC = () => {
    const {
        allSubscriptions,
        sourceSubscriptionId,
        setSourceSubscriptionId,
        fetchCategories,
        categories,
        selectedCategory,
        setSelectedCategory,
        includedCategoryIds,
        streams,
        loadingStreams,
        excludedStreamIds,
        addStreamToBouquet,
        bulkAddStreamsToBouquet,
        setStreams
    } = useLiveSelection();

    const [categorySearch, setCategorySearch] = useState("");
    const [streamSearch, setStreamSearch] = useState("");
    const [selectedLibraryStreams, setSelectedLibraryStreams] = useState<Set<number>>(new Set());

    const filteredCategories = useMemo(() => {
        if (!categorySearch) return categories;
        return categories.filter(c => c.category_name.toLowerCase().includes(categorySearch.toLowerCase()));
    }, [categories, categorySearch]);

    const filteredStreams = useMemo(() => {
        if (!streamSearch) return streams;
        return streams.filter(s => s.name.toLowerCase().includes(streamSearch.toLowerCase()));
    }, [streams, streamSearch]);

    const toggleStreamSelection = (id: number) => {
        const newSet = new Set(selectedLibraryStreams);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedLibraryStreams(newSet);
    };

    const handleSubscriptionChange = (id: number) => {
        setSourceSubscriptionId(id);
        fetchCategories(id);
        setSelectedCategory(null);
        setStreams([]);
    };

    return (
        <>
            {/* PANE 1: SOURCE EXPLORER - CATEGORIES */}
            <Card className="flex flex-col min-h-0 border-primary/10 shadow-sm">
                <CardHeader className="py-2.5 px-3 border-b bg-primary/5">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <ListFilter className="h-4 w-4 text-primary" /> Source Explorer
                    </CardTitle>

                    <div className="mt-2 space-y-2">
                        <select
                            className="w-full text-xs p-1.5 border rounded bg-background"
                            value={sourceSubscriptionId || ''}
                            onChange={(e) => handleSubscriptionChange(Number(e.target.value))}
                        >
                            {allSubscriptions.map(sub => (
                                <option key={sub.id} value={sub.id}>{sub.name}</option>
                            ))}
                        </select>

                        <input
                            type="text"
                            placeholder="Filter sources..."
                            className="w-full p-1.5 text-xs border rounded bg-background"
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-0">
                    <div className="divide-y text-sm">
                        {filteredCategories.map(cat => {
                            const isSelected = selectedCategory === cat.category_id;
                            const isIncluded = includedCategoryIds.includes(cat.category_id);
                            return (
                                <div
                                    key={cat.category_id}
                                    className={`p-2 cursor-pointer hover:bg-muted group flex items-center justify-between ${isSelected ? 'bg-primary/10 border-r-2 border-primary' : ''}`}
                                    onClick={() => setSelectedCategory(cat.category_id)}
                                >
                                    <span className={`truncate flex-1 ${isIncluded ? 'font-bold text-primary' : ''}`}>
                                        {cat.category_name}
                                    </span>
                                    {isIncluded && <Check className="h-4 w-4 text-primary" />}
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* PANE 2: LIBRARY - CHANNELS */}
            <Card className="flex flex-col min-h-0 border-primary/10 shadow-sm">
                <CardHeader className="py-2.5 px-3 border-b bg-primary/5">
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="h-3 w-3 rounded"
                                checked={filteredStreams.length > 0 && filteredStreams.every(s => selectedLibraryStreams.has(s.stream_id))}
                                onChange={(e) => {
                                    const newSet = new Set(selectedLibraryStreams);
                                    filteredStreams.forEach(s => {
                                        if (e.target.checked) newSet.add(s.stream_id);
                                        else newSet.delete(s.stream_id);
                                    });
                                    setSelectedLibraryStreams(newSet);
                                }}
                            />
                            <CardTitle className="text-sm font-bold truncate">
                                {selectedCategory ? categories.find(c => c.category_id === selectedCategory)?.category_name : 'Library Channels'}
                            </CardTitle>
                        </div>
                        <div className="flex gap-1">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2"
                                disabled={selectedLibraryStreams.size === 0}
                                onClick={() => {
                                    const toAdd = streams.filter(s => selectedLibraryStreams.has(s.stream_id));
                                    bulkAddStreamsToBouquet(toAdd);
                                    setSelectedLibraryStreams(new Set());
                                }}
                            >
                                Add ({selectedLibraryStreams.size})
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2"
                                disabled={filteredStreams.length === 0}
                                onClick={() => bulkAddStreamsToBouquet(filteredStreams)}
                            >
                                Add All
                            </Button>
                        </div>
                    </div>
                    <input
                        type="text"
                        placeholder="Search channels..."
                        className="w-full p-1.5 text-xs border rounded bg-background"
                        value={streamSearch}
                        onChange={(e) => setStreamSearch(e.target.value)}
                    />
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-0">
                    {loadingStreams ? (
                        <div className="p-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <div className="divide-y text-xs">
                            {filteredStreams.map(s => {
                                const isExcluded = excludedStreamIds.has(String(s.stream_id));
                                const isSelected = selectedLibraryStreams.has(s.stream_id);
                                return (
                                    <div key={s.stream_id} className={`p-2 flex items-center gap-2 group hover:bg-muted ${isSelected ? 'bg-primary/5' : ''}`}>
                                        <input
                                            type="checkbox"
                                            className="h-3 w-3 rounded"
                                            checked={isSelected}
                                            onChange={() => toggleStreamSelection(s.stream_id)}
                                        />
                                        <div className="w-8 h-8 rounded bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center border" onClick={() => toggleStreamSelection(s.stream_id)}>
                                            {s.stream_icon ? <img src={s.stream_icon} className="w-full h-full object-contain" alt="" /> : <Radio className="h-4 w-4 text-muted-foreground" />}
                                        </div>
                                        <span
                                            className={`flex-1 truncate cursor-pointer ${isExcluded ? 'text-muted-foreground line-through' : ''}`}
                                            onClick={() => toggleStreamSelection(s.stream_id)}
                                        >
                                            {s.name}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                            onClick={() => addStreamToBouquet(s)}
                                            title="Add to virtual group"
                                        >
                                            <ArrowRight className="h-4 w-4 text-primary" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
    );
};
