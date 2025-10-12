import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { Position } from '@xyflow/react';
import { useRouter } from 'next/router';
import getSupabaseClient from '@/lib/supabaseClient';
import Tooltip from '@/components/ui/Tooltip';
import HamburgerIcon from '@/components/HamburgerIcon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faGamepad } from '@fortawesome/free-solid-svg-icons';
import '@xyflow/react/dist/style.css';

const ReactFlowModule = () => import('@xyflow/react');
const regionPaletteCache = new Map();

const ReactFlow = dynamic(
    () => ReactFlowModule().then((mod) => mod.default || mod.ReactFlow),
    { ssr: false }
);

const Background = dynamic(
    () => ReactFlowModule().then((mod) => mod.Background),
    { ssr: false, loading: () => null }
);

const MiniMap = dynamic(
    () => ReactFlowModule().then((mod) => mod.MiniMap),
    { ssr: false, loading: () => null }
);

const Controls = dynamic(
    () => ReactFlowModule().then((mod) => mod.Controls),
    { ssr: false, loading: () => null }
);

const RoomNodeModule = () => ReactFlowModule().then((mod) => ({ Handle: mod.Handle }));

const DIRECTION_ALIASES = {
    north: 'north',
    n: 'north',
    south: 'south',
    s: 'south',
    east: 'east',
    e: 'east',
    west: 'west',
    w: 'west',
    northeast: 'northeast',
    north_east: 'northeast',
    ne: 'northeast',
    northwest: 'northwest',
    north_west: 'northwest',
    nw: 'northwest',
    southeast: 'southeast',
    south_east: 'southeast',
    se: 'southeast',
    southwest: 'southwest',
    south_west: 'southwest',
    sw: 'southwest',
    up: 'up',
    u: 'up',
    ascend: 'up',
    down: 'down',
    d: 'down',
    descend: 'down',
    in: 'up',
    enter: 'up',
    out: 'down',
    exit: 'down'
};

const DIRECTION_DEFINITIONS = {
    north: {
        vector: { x: 0, y: -1, z: 0 },
        handles: { source: { id: 'north-out', position: Position.Top }, target: { id: 'south-in', position: Position.Bottom } }
    },
    south: {
        vector: { x: 0, y: 1, z: 0 },
        handles: { source: { id: 'south-out', position: Position.Bottom }, target: { id: 'north-in', position: Position.Top } }
    },
    east: {
        vector: { x: 1, y: 0, z: 0 },
        handles: { source: { id: 'east-out', position: Position.Right }, target: { id: 'west-in', position: Position.Left } }
    },
    west: {
        vector: { x: -1, y: 0, z: 0 },
        handles: { source: { id: 'west-out', position: Position.Left }, target: { id: 'east-in', position: Position.Right } }
    },
    northeast: {
        vector: { x: 1, y: -1, z: 0 },
        handles: { source: { id: 'ne-out', position: Position.Top }, target: { id: 'sw-in', position: Position.Bottom } }
    },
    northwest: {
        vector: { x: -1, y: -1, z: 0 },
        handles: { source: { id: 'nw-out', position: Position.Top }, target: { id: 'se-in', position: Position.Bottom } }
    },
    southeast: {
        vector: { x: 1, y: 1, z: 0 },
        handles: { source: { id: 'se-out', position: Position.Bottom }, target: { id: 'nw-in', position: Position.Top } }
    },
    southwest: {
        vector: { x: -1, y: 1, z: 0 },
        handles: { source: { id: 'sw-out', position: Position.Bottom }, target: { id: 'ne-in', position: Position.Top } }
    },
    up: {
        vector: { x: 0, y: 0, z: 1 },
        handles: { source: { id: 'up-out', position: Position.Top }, target: { id: 'up-in', position: Position.Top } }
    },
    down: {
        vector: { x: 0, y: 0, z: -1 },
        handles: { source: { id: 'down-out', position: Position.Bottom }, target: { id: 'down-in', position: Position.Bottom } }
    }
};

const DIRECTION_REVERSE = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
    northeast: 'southwest',
    southwest: 'northeast',
    northwest: 'southeast',
    southeast: 'northwest',
    up: 'down',
    down: 'up'
};

// Standard cardinal directions for exit management
const STANDARD_DIRECTIONS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down'];

const NODE_WIDTH = 240;
const NODE_HEIGHT = 96;
const COLUMN_SPACING = 500;
const ROW_SPACING = 350;
const COMPONENT_SPACING = 600;
const LAYER_SPACING = 360;

function normalizeDirectionKey(input = '') {
    if (!input) {
        return '';
    }
    const trimmed = String(input).trim().toLowerCase();
    const tokens = trimmed.split(/\s+/);
    const lastToken = tokens[tokens.length - 1] ?? '';
    return lastToken.replace(/[^a-z]/g, '');
}

function resolveDirectionDefinition(rawDirection) {
    const key = normalizeDirectionKey(rawDirection);
    const base = DIRECTION_ALIASES[key];
    if (!base) {
        return null;
    }
    const definition = DIRECTION_DEFINITIONS[base];
    if (!definition) {
        return null;
    }
    return { base, ...definition }; 
}

function invertVector(vector) {
    return {
        x: vector.x ? -vector.x : 0,
        y: vector.y ? -vector.y : 0,
        z: vector.z ? -vector.z : 0,
    };
}

function reverseDirection(base) {
    return DIRECTION_REVERSE[base] ?? base;
}

function deltaToDirection(delta) {
    if (!delta) {
        return 'east';
    }
    const { x = 0, y = 0, z = 0 } = delta;
    if (Math.abs(z) > Math.abs(x) && Math.abs(z) > Math.abs(y)) {
        return z > 0 ? 'up' : 'down';
    }

    const signX = Math.sign(x);
    const signY = Math.sign(y);

    if (signX === 0 && signY === 0) {
        return 'east';
    }

    if (signX === 0) {
        return signY > 0 ? 'south' : 'north';
    }

    if (signY === 0) {
        return signX > 0 ? 'east' : 'west';
    }

    if (signX > 0 && signY < 0) {
        return 'northeast';
    }
    if (signX > 0 && signY > 0) {
        return 'southeast';
    }
    if (signX < 0 && signY < 0) {
        return 'northwest';
    }
    return 'southwest';
}

function applyGraphLayout(nodes, edges) {
    if (!nodes.length) {
        return [];
    }

    const normalizedNodes = nodes.map((node) => ({
        ...node,
        width: node.width ?? NODE_WIDTH,
        height: node.height ?? NODE_HEIGHT,
        position: { x: 0, y: 0 },
        data: {
            ...node.data,
            connections: {
                outgoing: new Map(),
                incoming: new Map()
            }
        }
    }));

    const nodeLookup = new Map(normalizedNodes.map((node) => [node.id, node]));
    const adjacency = new Map(normalizedNodes.map((node) => [node.id, new Map()]));

    edges.forEach((edge) => {
        const fromNode = nodeLookup.get(edge.source);
        const toNode = nodeLookup.get(edge.target);
        if (!fromNode || !toNode) {
            return;
        }

        const base = edge?.data?.direction ?? 'east';
        const definition = DIRECTION_DEFINITIONS[base] ?? DIRECTION_DEFINITIONS.east;
        const directionInfo = {
            base,
            vector: definition.vector
        };

        const { vector } = directionInfo;
        fromNode.data.connections.outgoing.set(base, {
            direction: base,
            vector,
            targetId: toNode.id
        });

        const reverseBase = reverseDirection(base);
        const reverseVector = invertVector(vector);
        toNode.data.connections.incoming.set(reverseBase, {
            direction: reverseBase,
            vector: reverseVector,
            sourceId: fromNode.id
        });

        adjacency.get(fromNode.id)?.set(toNode.id, directionInfo);
        adjacency.get(toNode.id)?.set(fromNode.id, {
            base: reverseBase,
            vector: reverseVector
        });
    });

    const visited = new Set();
    let layerOffsetX = 0;
    const layoutResult = [];

    for (const rootNode of normalizedNodes) {
        if (visited.has(rootNode.id)) {
            continue;
        }

        const stack = [{ id: rootNode.id, x: 0, y: 0, z: 0 }];
        visited.add(rootNode.id);

        const componentNodes = new Map();
        componentNodes.set(rootNode.id, stack[0]);

        while (stack.length > 0) {
            const current = stack.pop();
            const neighbors = adjacency.get(current.id) ?? new Map();

            neighbors.forEach((directionInfo, neighborId) => {
                if (componentNodes.has(neighborId)) {
                    return;
                }

                const delta = directionInfo.vector;
                let nextPosition = {
                    id: neighborId,
                    x: current.x + (delta.x ?? 0),
                    y: current.y + (delta.y ?? 0),
                    z: current.z + (delta.z ?? 0)
                };

                // Check for position conflicts
                const posKey = `${nextPosition.x},${nextPosition.y},${nextPosition.z}`;
                const existingNodeAtPos = Array.from(componentNodes.values()).find(
                    pos => pos.x === nextPosition.x && pos.y === nextPosition.y && pos.z === nextPosition.z
                );

                // If there's a conflict, offset by a small amount
                if (existingNodeAtPos && existingNodeAtPos.id !== neighborId) {
                    nextPosition = {
                        ...nextPosition,
                        x: nextPosition.x + 0.5,
                        y: nextPosition.y + 0.5
                    };
                }

                componentNodes.set(neighborId, nextPosition);
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    stack.push(nextPosition);
                }
            });
        }

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;

        componentNodes.forEach((pos) => {
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x);
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y);
            minZ = Math.min(minZ, pos.z);
            maxZ = Math.max(maxZ, pos.z);
        });

        const offsetX = layerOffsetX - minX * COLUMN_SPACING;
        const offsetY = -minY * ROW_SPACING;
        const offsetZ = -minZ * LAYER_SPACING;

        componentNodes.forEach((pos, nodeId) => {
            const layoutNode = nodeLookup.get(nodeId);
            if (!layoutNode) {
                return;
            }
            layoutResult.push({
                ...layoutNode,
                position: {
                    x: offsetX + pos.x * COLUMN_SPACING,
                    y: offsetY + pos.y * ROW_SPACING + pos.z * LAYER_SPACING,
                },
                data: {
                    ...layoutNode.data,
                    coordinates: { x: pos.x, y: pos.y, z: pos.z }
                }
            });
        });

        const componentWidth = (maxX - minX + 1) * COLUMN_SPACING;
        layerOffsetX += componentWidth + COMPONENT_SPACING;
    }

    // Keep width and height so MiniMap can compute node bounds correctly
    return layoutResult;
}

function normalizeRegionKey(region) {
    if (!region || typeof region !== 'string') {
        return 'unknown';
    }
    return region.trim().toLowerCase().replace(/\s+/g, '-');
}

function computeRegionPalette(nodes = []) {
    // Fallback palette for regions not yet in the database
    const fallbackPalette = [
        { borderColor: '#38bdf8', fontColor: '#e0f2fe', accent: 'rgba(56, 189, 248, 0.14)' },
        { borderColor: '#f472b6', fontColor: '#fdf2f8', accent: 'rgba(244, 114, 182, 0.14)' },
        { borderColor: '#34d399', fontColor: '#d1fae5', accent: 'rgba(52, 211, 153, 0.14)' },
        { borderColor: '#facc15', fontColor: '#fef9c3', accent: 'rgba(250, 204, 21, 0.14)' },
        { borderColor: '#a855f7', fontColor: '#ede9fe', accent: 'rgba(168, 85, 247, 0.14)' },
        { borderColor: '#fb7185', fontColor: '#ffe4e6', accent: 'rgba(251, 113, 133, 0.14)' },
        { borderColor: '#818cf8', fontColor: '#e0e7ff', accent: 'rgba(129, 140, 248, 0.14)' },
        { borderColor: '#2dd4bf', fontColor: '#ccfbf1', accent: 'rgba(45, 212, 191, 0.14)' }
    ];

    let fallbackIndex = 0;
    const result = new Map();

    nodes.forEach((node) => {
        const regionKey = normalizeRegionKey(node?.data?.region);
        // Use cached color (from DB) if available, otherwise assign fallback
        if (!regionPaletteCache.has(regionKey)) {
            const paletteEntry = fallbackPalette[fallbackIndex % fallbackPalette.length];
            regionPaletteCache.set(regionKey, paletteEntry);
            fallbackIndex += 1;
        }
        result.set(regionKey, regionPaletteCache.get(regionKey));
    });

    if (!nodes.length && regionPaletteCache.size) {
        regionPaletteCache.forEach((value, key) => {
            result.set(key, value);
        });
    }

    return result;
}

// React Flow configuration objects (defined outside to prevent re-creation)
const DEFAULT_EDGE_OPTIONS = {
    type: 'straight'
};

const PRO_OPTIONS = {
    hideAttribution: true
};

export default function ArkyvAdminPanel() {
    const router = useRouter();
    const supabase = useMemo(() => getSupabaseClient(), []);
    const dialogContentRef = useRef(null);
    const [session, setSession] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [flowNodes, setFlowNodes] = useState([]);
    const [flowEdges, setFlowEdges] = useState([]);
    const [flowLib, setFlowLib] = useState(null);
    const [activeRoom, setActiveRoom] = useState(null);
    const [editRoom, setEditRoom] = useState(null);
    const [isDirty, setIsDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [reloadCounter, setReloadCounter] = useState(0);
    const [regionsList, setRegionsList] = useState([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentLayer, setCurrentLayer] = useState(0);
    const [availableLayers, setAvailableLayers] = useState([0]);
    const [floorInputValue, setFloorInputValue] = useState('');
    const [isCreatingRoom, setIsCreatingRoom] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [pendingRoomCreate, setPendingRoomCreate] = useState(null);
    const [showBlankRoomDialog, setShowBlankRoomDialog] = useState(false);
    const [showLinkExistingDialog, setShowLinkExistingDialog] = useState(false);
    const [linkExistingSearch, setLinkExistingSearch] = useState('');
    const [linkExistingSelection, setLinkExistingSelection] = useState('');
    const [blankRoom, setBlankRoom] = useState({ name: '', description: '', region: '' });
    const [isGeneratingRoomName, setIsGeneratingRoomName] = useState(false);
    const [isGeneratingRoomDescription, setIsGeneratingRoomDescription] = useState(false);
    const [isEditGeneratingRoomName, setIsEditGeneratingRoomName] = useState(false);
    const [editDescriptionOperation, setEditDescriptionOperation] = useState(null); // 'suggest' | 'refine' | null
    const [generatingRoomImages, setGeneratingRoomImages] = useState({}); // Track per-room generation state
    const [roomImageErrors, setRoomImageErrors] = useState({}); // Track per-room errors
    const [roomImageSuccesses, setRoomImageSuccesses] = useState({}); // Track per-room successes
    const [includeRegionInPrompt, setIncludeRegionInPrompt] = useState(true);
    const [rdCredits, setRdCredits] = useState(null);
    const [generatingNpcPortraits, setGeneratingNpcPortraits] = useState({}); // Track per-NPC portrait generation
    const [npcPortraitErrors, setNpcPortraitErrors] = useState({}); // Track per-NPC portrait errors
    const [npcPortraitSuccesses, setNpcPortraitSuccesses] = useState({}); // Track per-NPC portrait successes
    const [includeRegionInNpcPortrait, setIncludeRegionInNpcPortrait] = useState(true);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    
    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null);
    const [isStandaloneRoom, setIsStandaloneRoom] = useState(false);
    const [customRoomPositions, setCustomRoomPositions] = useState(new Map());
    const [pendingFlowPosition, setPendingFlowPosition] = useState(null);
    const reactFlowInstance = React.useRef(null);
    
    // New Region State
    const [showNewRegionDialog, setShowNewRegionDialog] = useState(false);
    const [newRegion, setNewRegion] = useState({
        display_name: '',
        description: '',
        borderColor: '#38bdf8',
        fontColor: '#e0f2fe',
        accent: 'rgba(56, 189, 248, 0.14)'
    });
    const [isCreatingRegion, setIsCreatingRegion] = useState(false);
    const [isGeneratingColors, setIsGeneratingColors] = useState(null); // 'random', 'complementary', or null
    const [isGeneratingDescription, setIsGeneratingDescription] = useState(null); // 'refine', 'suggest', or null
    const [isGeneratingRegionName, setIsGeneratingRegionName] = useState(false);
    const [regionError, setRegionError] = useState('');
    
    // Region Editing State
    const [showEditRegionDialog, setShowEditRegionDialog] = useState(false);
    const [editRegion, setEditRegion] = useState(null);
    const [activeRegion, setActiveRegion] = useState(null);
    const [isUpdatingRegion, setIsUpdatingRegion] = useState(false);
    const [regionSearchTerm, setRegionSearchTerm] = useState('');
    const [regionSortOrder, setRegionSortOrder] = useState('asc');
    const [regionsData, setRegionsData] = useState([]); // Full region data for editing
    
    // Help Dialog State
    const [showHelpDialog, setShowHelpDialog] = useState(false);
    
    // NPC Management State
    const [npcs, setNpcs] = useState([]);
    const [allRooms, setAllRooms] = useState([]);
    const [npcSearchTerm, setNpcSearchTerm] = useState('');
    const [exitRoomSearch, setExitRoomSearch] = useState({});
    const [exitRoomSelection, setExitRoomSelection] = useState({});
    const [activeExitDirection, setActiveExitDirection] = useState(null);
    const [isCreatingExit, setIsCreatingExit] = useState(false);
    const [isDeletingExit, setIsDeletingExit] = useState(false);
    const [deleteExitConfirm, setDeleteExitConfirm] = useState(null);
    const [isOneWayExit, setIsOneWayExit] = useState(false);
    const [deleteOnlyOneDirection, setDeleteOnlyOneDirection] = useState(false);
    const [pendingVerticalExit, setPendingVerticalExit] = useState(null); // { direction: 'up' or 'down', fromRoomId: string }
    const [npcRegionFilter, setNpcRegionFilter] = useState('all');
    const [npcSortOrder, setNpcSortOrder] = useState('asc');
    const [activeNpc, setActiveNpc] = useState(null);
    const [editNpc, setEditNpc] = useState(null);
    const [isNpcDialogOpen, setIsNpcDialogOpen] = useState(false);
    const [npcRoomSearch, setNpcRoomSearch] = useState('');
    const [isNpcDirty, setIsNpcDirty] = useState(false);
    
    // Create NPC State
    const [showCreateNpcDialog, setShowCreateNpcDialog] = useState(false);
    const [newNpc, setNewNpc] = useState({
        name: '',
        alias: '',
        description: '',
        current_room: '',
        faction: '',
        behavior_type: 'static',
        greeting_behavior: 'none',
        personality: ''
    });
    const [isCreatingNpc, setIsCreatingNpc] = useState(false);
    const [isGeneratingNpcName, setIsGeneratingNpcName] = useState(false);
    const [isSuggestingNpcDescription, setIsSuggestingNpcDescription] = useState(false);
    const [isRefiningNpcDescription, setIsRefiningNpcDescription] = useState(false);
    const [isSuggestingNpcPersonality, setIsSuggestingNpcPersonality] = useState(false);
    const [isRefiningNpcPersonality, setIsRefiningNpcPersonality] = useState(false);
    const [npcSaving, setNpcSaving] = useState(false);
    const [npcSaveSuccess, setNpcSaveSuccess] = useState(false);
    const [npcSaveError, setNpcSaveError] = useState('');
    const [isDeleteNpcDialogOpen, setIsDeleteNpcDialogOpen] = useState(false);
    const [deleteNpcConfirmText, setDeleteNpcConfirmText] = useState('');
    const [isDeletingNpc, setIsDeletingNpc] = useState(false);
    const [deleteNpcError, setDeleteNpcError] = useState('');

    useEffect(() => {
        let isActive = true;

        const guard = async () => {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (error) {
                    throw error;
                }

                const currentSession = data?.session ?? null;
                if (!isActive) {
                    return;
                }

                setSession(currentSession);

                const userId = currentSession?.user?.id ?? null;
                console.log('🔍 Admin check - User ID:', userId);
                
                if (!userId) {
                    console.warn('❌ No user ID found, redirecting to home');
                    router.replace('/');
                    return;
                }

                // Check if user is admin via database
                console.log('🔍 Querying profiles table for id:', userId);
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('is_admin, user_id, id')
                    .eq('id', userId)
                    .single();

                console.log('🔍 Profile query result:', { profile, profileError });

                if (profileError) {
                    console.error('❌ Profile query error:', profileError);
                    router.replace('/');
                    return;
                }

                if (!profile) {
                    console.warn('❌ No profile found for user:', userId);
                    router.replace('/');
                    return;
                }

                if (!profile.is_admin) {
                    console.warn('❌ User is not admin. is_admin value:', profile.is_admin);
                    router.replace('/');
                    return;
                }

                console.log('✅ Admin access granted for user:', userId);
                setIsLoading(false);
            } catch (err) {
                console.error('Failed to validate admin session', err);
                if (isActive) {
                    router.replace('/');
                }
            }
        };

        guard();

        return () => {
            isActive = false;
        };
    }, [supabase, router]);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }

        const previousClassList = document.body.className;
        document.body.classList.add('hide-arkyv-chat-bot');

        return () => {
            document.body.className = previousClassList;
        };
    }, []);

    // ESC key handler to close all modals and dialogs
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                // Close all modals in priority order (most specific to least specific)
                if (isDialogOpen) setIsDialogOpen(false);
                else if (showCreateDialog) setShowCreateDialog(false);
                else if (showBlankRoomDialog) setShowBlankRoomDialog(false);
                else if (showLinkExistingDialog) setShowLinkExistingDialog(false);
                else if (isDeleteDialogOpen) setIsDeleteDialogOpen(false);
                else if (showNewRegionDialog) setShowNewRegionDialog(false);
                else if (showEditRegionDialog) setShowEditRegionDialog(false);
                else if (showHelpDialog) setShowHelpDialog(false);
                else if (isNpcDialogOpen) setIsNpcDialogOpen(false);
                else if (showCreateNpcDialog) setShowCreateNpcDialog(false);
                else if (isDeleteNpcDialogOpen) setIsDeleteNpcDialogOpen(false);
            }
        };

        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isDialogOpen, showCreateDialog, showBlankRoomDialog, showLinkExistingDialog, 
        isDeleteDialogOpen, showNewRegionDialog, showEditRegionDialog, showHelpDialog,
        isNpcDialogOpen, showCreateNpcDialog, isDeleteNpcDialogOpen]);

    useEffect(() => {
        RoomNodeModule()
            .then((mod) => {
                setFlowLib(mod);
            })
            .catch((error) => {
                console.error('Failed to load React Flow helpers', error);
            });
    }, []);

    // Load regions for dropdown and cache colors
    useEffect(() => {
        if (!session) {
            return;
        }
        let isActive = true;
        supabase
            .from('regions')
            .select('*')
            .then(({ data, error }) => {
                if (!isActive) return;
                if (error) {
                    console.error('Failed to load regions', error);
                    return;
                }
                // Store full region data
                setRegionsData(data ?? []);
                
                const items = (data ?? []).map((r) => ({
                    key: r?.name ?? 'unknown',
                    label: r?.display_name ?? r?.name ?? 'Unknown'
                }));
                setRegionsList(items);
                
                // Cache region colors in the palette cache
                console.log('Loading region colors from database:');
                (data ?? []).forEach((region) => {
                    const regionKey = normalizeRegionKey(region?.name);
                    if (region?.color_scheme) {
                        regionPaletteCache.set(regionKey, region.color_scheme);
                        console.log(`  - Region "${region.name}" → key "${regionKey}":`, region.color_scheme);
                    }
                });
                
                // Trigger rooms/edges reload after regions are cached
                setReloadCounter((c) => c + 1);
            });
        return () => {
            isActive = false;
        };
    }, [session, supabase]);

    useEffect(() => {
        if (!session) {
            return;
        }

        const fetchRoomsAndExits = async () => {
            try {
                const { data: rooms, error: roomsError } = await supabase
                    .from('rooms')
                    .select('id, name, description, region, region_name, height, image_url, regions(display_name)');

                if (roomsError) {
                    throw roomsError;
                }

                const { data: exits, error: exitsError } = await supabase
                    .from('exits')
                    .select('id, from_room, to_room, verb');

                if (exitsError) {
                    throw exitsError;
                }

                const rawNodes = (rooms ?? []).map((room) => {
                    // Use region_name as the key (foreign key to regions table)
                    const regionKey = room.region_name ?? 'Unknown';
                    // Get display_name from the joined regions table
                    const regionDisplayName = room.regions?.display_name ?? regionKey;
                    
                    return {
                        id: room.id,
                        type: 'room',
                        data: {
                            label: room.name ?? 'Unnamed Room',
                            description: room.description ?? '',
                            region: regionKey,
                            regionDisplayName: regionDisplayName,
                            raw: { ...room, exits: [] }
                        },
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                    position: { x: 0, y: 0 },
                    style: {
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid rgba(147, 197, 253, 0.45)',
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        minWidth: 180,
                        color: '#E2E8F0',
                        fontFamily: 'var(--font-terminal, monospace)',
                        textAlign: 'center'
                    }
                    };
                });

                const nodeLookupRaw = new Map(rawNodes.map((node) => [node.id, node]));

                (exits ?? []).forEach((exit) => {
                    if (!exit.from_room || !exit.to_room) {
                        return;
                    }
                    const sourceNode = nodeLookupRaw.get(exit.from_room);
                    const targetNode = nodeLookupRaw.get(exit.to_room);
                    if (!sourceNode) {
                        return;
                    }
                    sourceNode.data.raw.exits = sourceNode.data.raw.exits ?? [];
                    sourceNode.data.raw.exits.push({
                        verb: exit.verb ?? '',
                        to_room: exit.to_room,
                        targetRoom: targetNode?.data?.raw ?? null
                    });
                });

                const edgeMap = new Map();

                (exits ?? []).forEach((exit) => {
                    if (!exit.from_room || !exit.to_room) {
                        return;
                    }

                    const undirectedKey = [exit.from_room, exit.to_room].sort().join('__');

                    if (!edgeMap.has(undirectedKey)) {
                        edgeMap.set(undirectedKey, {
                            id: exit.id ?? undirectedKey,
                            endpoints: [exit.from_room, exit.to_room],
                            labels: [],
                            directions: new Map()
                        });
                    }

                    const entry = edgeMap.get(undirectedKey);
                    const rawLabel = (exit.verb ?? '').trim();
                    if (rawLabel) {
                        entry.labels.push(rawLabel.toUpperCase());
                    }

                    const directionDetails = resolveDirectionDefinition(rawLabel);
                    if (directionDetails?.base) {
                        entry.directions.set(exit.from_room, directionDetails.base);
                    }
                });

                const edges = Array.from(edgeMap.values()).map((entry) => {
                    const [roomA, roomB] = entry.endpoints;

                    const rawLabels = entry.labels.length ? entry.labels : ['EAST'];
                    let baseDirection = entry.directions.get(roomA) ?? null;
                    let source = roomA;
                    let target = roomB;

                    if (!baseDirection && entry.directions.has(roomB)) {
                        baseDirection = reverseDirection(entry.directions.get(roomB));
                        source = roomB;
                        target = roomA;
                    }

                    if (!baseDirection) {
                        const normalized = resolveDirectionDefinition(rawLabels[0]);
                        baseDirection = normalized?.base ?? 'east';
                    }

                    const handleDefinition = DIRECTION_DEFINITIONS[baseDirection];
                    const sourceHandle = handleDefinition?.handles?.source?.id;
                    const targetHandle = handleDefinition?.handles?.target?.id;
                    const isVertical = baseDirection === 'up' || baseDirection === 'down';

                    // Get regions for both rooms
                    const sourceNode = nodeLookupRaw.get(source);
                    const targetNode = nodeLookupRaw.get(target);
                    const sourceRegion = normalizeRegionKey(sourceNode?.data?.region);
                    const targetRegion = normalizeRegionKey(targetNode?.data?.region);
                    
                    // Get colors from cache (already loaded from DB)
                    const sourcePalette = regionPaletteCache.get(sourceRegion);
                    const targetPalette = regionPaletteCache.get(targetRegion);
                    
                    // Debug missing colors
                    if (!sourcePalette) {
                        console.warn(`Missing color for source region "${sourceRegion}" (raw: "${sourceNode?.data?.region}")`);
                    }
                    if (!targetPalette) {
                        console.warn(`Missing color for target region "${targetRegion}" (raw: "${targetNode?.data?.region}")`);
                    }
                    
                    // Fallbacks
                    const finalSourcePalette = sourcePalette ?? { 
                        borderColor: '#38bdf8',
                        fontColor: '#e0f2fe',
                        accent: 'rgba(56, 189, 248, 0.14)'
                    };
                    const finalTargetPalette = targetPalette ?? { 
                        borderColor: '#ec4899',
                        fontColor: '#fce7f3',
                        accent: 'rgba(236, 72, 153, 0.14)'
                    };
                    
                    // Determine edge color/gradient
                    let edgeStyle;
                    let gradientData = null;
                    
                    if (sourceRegion === targetRegion) {
                        // Same region - use that region's color
                        edgeStyle = {
                            stroke: finalSourcePalette.borderColor,
                            strokeWidth: 2.5,
                            strokeDasharray: isVertical ? '6 3' : undefined
                        };
                    } else {
                        // Different regions - create gradient
                        const gradientId = `gradient-${entry.id}`;
                        edgeStyle = {
                            stroke: `url(#${gradientId})`,
                            strokeWidth: 2.5,
                            strokeDasharray: isVertical ? '6 3' : undefined
                        };
                        
                        // Store gradient info
                        gradientData = {
                            id: gradientId,
                            fromColor: finalSourcePalette.borderColor,
                            toColor: finalTargetPalette.borderColor
                        };
                    }

                    return {
                        id: entry.id,
                        source,
                        target,
                        sourceHandle,
                        targetHandle,
                        label: rawLabels.join(' / '),
                        animated: true,
                        data: {
                            direction: baseDirection,
                            gradient: gradientData,
                            sourceRegion,
                            targetRegion
                        },
                        style: edgeStyle,
                        labelBgStyle: {
                            fill: 'rgba(2, 6, 23, 0.55)',
                            stroke: 'rgba(236, 72, 153, 0.45)',
                            strokeWidth: 1.25,
                            opacity: 0,
                            display: 'none'
                        },
                        labelBgPadding: [6, 3],
                        labelBgBorderRadius: 8,
                        labelStyle: {
                            fill: '#f9a8d4',
                            fontSize: 11,
                            textTransform: 'uppercase',
                            letterSpacing: '0.22em',
                            fontFamily: 'var(--font-terminal, monospace)',
                            opacity: 0,
                            display: 'none'
                        }
                    };
                });

                // Separate nodes with custom positions from those that need layout
                const nodesWithCustomPositions = rawNodes.filter(node => customRoomPositions.has(node.id));
                const nodesToLayout = rawNodes.filter(node => !customRoomPositions.has(node.id));
                
                // Apply layout only to nodes without custom positions
                const layoutedNodes = applyGraphLayout(nodesToLayout, edges);
                
                // Add custom positioned nodes with their stored positions and z=0 coordinates
                const customPositionedNodes = nodesWithCustomPositions.map(node => ({
                    ...node,
                    position: customRoomPositions.get(node.id),
                    data: {
                        ...node.data,
                        coordinates: { x: 0, y: 0, z: 0 }
                    }
                }));
                
                // Combine both sets of nodes
                const allNodes = [...layoutedNodes, ...customPositionedNodes];
                
                const zLayers = new Set(allNodes.map((node) => node.data?.coordinates?.z ?? 0));
                setAvailableLayers(Array.from(zLayers).sort((a, b) => b - a));

                const regionPalette = computeRegionPalette(rawNodes);
                const nodesWithStyle = allNodes
                    .filter((node) => {
                        const z = node.data?.coordinates?.z ?? 0;
                        return z === currentLayer;
                    })
                    .map((node) => {
                        const regionKey = normalizeRegionKey(node.data.region);
                        const paletteEntry = regionPalette.get(regionKey) ?? {};
                        
                        return {
                            ...node,
                            style: {
                                ...node.style,
                                border: `1px solid ${paletteEntry.borderColor ?? 'rgba(147, 197, 253, 0.45)'}`,
                                background: `radial-gradient(circle at top, ${paletteEntry.accent ?? 'rgba(15, 23, 42, 0.8)'}, rgba(15, 23, 42, 0.92))`,
                                color: paletteEntry.fontColor ?? '#E2E8F0',
                                boxShadow: `0 16px 40px ${(paletteEntry.accent ?? 'rgba(14, 165, 233, 0.22)')}`,
                            }
                        };
                    });

                // Create a lookup map for O(1) node access instead of O(n) find operations
                const nodeMap = new Map(allNodes.map(node => [node.id, node]));
                
                const filteredEdges = edges.filter((edge) => {
                    const sourceNode = nodeMap.get(edge.source);
                    const targetNode = nodeMap.get(edge.target);
                    const sourceZ = sourceNode?.data?.coordinates?.z ?? 0;
                    const targetZ = targetNode?.data?.coordinates?.z ?? 0;
                    return sourceZ === currentLayer && targetZ === currentLayer;
                });

                console.log('Total edges:', edges.length);
                console.log('Filtered edges for layer', currentLayer, ':', filteredEdges.length);
                console.log('Nodes on current layer:', nodesWithStyle.length);
                
                // Find edges to the specific rooms mentioned (optimized with Map lookup)
                const targetRoomNames = ['Manifest Foyer', 'Midnight Promenade', 'Laserfall Vestibule'];
                const targetRoomNamesLower = targetRoomNames.map(name => name.toLowerCase());
                
                const allEdgesWithNames = edges.map(e => {
                    const sourceNode = nodeMap.get(e.source);
                    const targetNode = nodeMap.get(e.target);
                    return {
                        sourceId: e.source,
                        targetId: e.target,
                        sourceName: sourceNode?.data?.label,
                        targetName: targetNode?.data?.label,
                        sourceZ: sourceNode?.data?.coordinates?.z ?? 0,
                        targetZ: targetNode?.data?.coordinates?.z ?? 0,
                        filtered: sourceNode?.data?.coordinates?.z === currentLayer && targetNode?.data?.coordinates?.z === currentLayer
                    };
                });
                
                const relevantEdges = allEdgesWithNames.filter(e => {
                    const sourceLower = e.sourceName?.toLowerCase() || '';
                    const targetLower = e.targetName?.toLowerCase() || '';
                    return targetRoomNamesLower.some(name => 
                        sourceLower.includes(name) || targetLower.includes(name)
                    );
                });
                
                console.log('Edges to/from target rooms:', relevantEdges);

                setFlowNodes(nodesWithStyle);
                setFlowEdges(filteredEdges);
                regionPalette.forEach((value, key) => {
                    if (!regionPaletteCache.has(key)) {
                        regionPaletteCache.set(key, value);
                    }
                });
            } catch (err) {
                console.error('Failed to load rooms and exits', err);
            }
        };

        fetchRoomsAndExits();
    }, [session, supabase, currentLayer, reloadCounter, customRoomPositions]);

    // Load all rooms for NPC room selector
    useEffect(() => {
        if (!session) {
            return;
        }
        let isActive = true;
        supabase
            .from('rooms')
            .select('id, name, region_name, height, image_url')
            .order('name', { ascending: true })
            .then(({ data, error }) => {
                if (!isActive) return;
                if (error) {
                    console.error('Failed to load rooms for NPC selector', error);
                    return;
                }
                setAllRooms(data ?? []);
            });
        return () => {
            isActive = false;
        };
    }, [session, supabase, reloadCounter]);

    // Load NPCs
    useEffect(() => {
        if (!session) {
            return;
        }
        let isActive = true;
        supabase
            .from('npcs')
            .select(`
                id, 
                name, 
                description, 
                current_room, 
                dialogue_tree, 
                faction, 
                behavior_type, 
                alias, 
                greeting_behavior,
                portrait_url,
                rooms:current_room (
                    id,
                    name,
                    region_name
                )
            `)
            .order('name', { ascending: true })
            .then(({ data, error }) => {
                if (!isActive) return;
                if (error) {
                    console.error('Failed to load NPCs', error);
                    return;
                }
                setNpcs(data ?? []);
            });
        return () => {
            isActive = false;
        };
    }, [session, supabase, reloadCounter]);

    const handleNodeClick = useCallback((event, node) => {
        // Don't open dialog if clicking on a handle
        const target = event.target;
        if (target?.classList?.contains('arkyv-node-handle') || 
            target?.classList?.contains('arkyv-node-handle--empty')) {
            return;
        }
        
        event.preventDefault();
        const room = node?.data?.raw ?? null;
        setActiveRoom(room);
        // Use region_name (the foreign key) first, as it's the authoritative field
        setEditRoom(room ? { id: room.id, name: room.name ?? '', description: room.description ?? '', region: room.region_name ?? room.region ?? 'Unknown' } : null);
        setIsDirty(false);
        setSaveError('');
        setIsDialogOpen(!!room);
        
        // Fetch RetroDiffusion credits
        fetch('/api/arkyv/get-credits')
            .then(res => res.json())
            .then(data => setRdCredits(data.credits))
            .catch(() => setRdCredits(null));
    }, []);

    const handleEdgeClick = useCallback((event, edge) => {
        event.preventDefault();
        
        // Find the rooms involved
        const sourceRoomId = edge.source;
        const targetRoomId = edge.target;
        const direction = edge.data?.direction || 'unknown';
        
        // Find source and target room names
        const sourceNode = flowNodes.find(n => n.id === sourceRoomId);
        const targetNode = flowNodes.find(n => n.id === targetRoomId);
        
        const sourceRoomName = sourceNode?.data?.label || sourceRoomId;
        const targetRoomName = targetNode?.data?.label || targetRoomId;
        
        // Open delete confirmation with edge info
        setDeleteExitConfirm({
            direction,
            targetRoomId,
            targetRoomName: `${sourceRoomName} ↔ ${targetRoomName}`,
            sourceRoomId,
            isEdgeDelete: true
        });
    }, [flowNodes]);

    const closeDialog = useCallback(() => {
        setIsDialogOpen(false);
        setActiveRoom(null);
        setEditRoom(null);
        setIsDirty(false);
        setSaveSuccess(false);
        setSaveError('');
        setExitRoomSearch({});
        setExitRoomSelection({});
        setActiveExitDirection(null);
        setIsOneWayExit(false);
    }, []);

    // Close on overlay click
    const handleOverlayMouseDown = useCallback((e) => {
        if (e.currentTarget === e.target) {
            closeDialog();
        }
    }, [closeDialog]);

    // Close on Escape key
    useEffect(() => {
        if (!isDialogOpen) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') closeDialog();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isDialogOpen, closeDialog]);

    // Reset save success after 2 seconds
    useEffect(() => {
        if (saveSuccess) {
            const timer = setTimeout(() => setSaveSuccess(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [saveSuccess]);

    // Reset NPC save success after 2 seconds (mirror room dialog behavior)
    useEffect(() => {
        if (npcSaveSuccess) {
            const timer = setTimeout(() => setNpcSaveSuccess(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [npcSaveSuccess]);

    // Disable body scroll when any dialog is open
    useEffect(() => {
        const anyDialogOpen = isDialogOpen || isNpcDialogOpen || showCreateNpcDialog || 
                              showCreateDialog || showBlankRoomDialog || showLinkExistingDialog || isDeleteDialogOpen || 
                              showNewRegionDialog || showEditRegionDialog || deleteExitConfirm ||
                              isDeleteNpcDialogOpen || showHelpDialog;
        
        if (anyDialogOpen) {
            const scrollY = window.scrollY;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.width = '';
                document.body.style.overflow = '';
                window.scrollTo(0, scrollY);
            };
        }
    }, [isDialogOpen, isNpcDialogOpen, showCreateNpcDialog, showCreateDialog, showBlankRoomDialog, 
        isDeleteDialogOpen, showNewRegionDialog, showEditRegionDialog, deleteExitConfirm, isDeleteNpcDialogOpen, showHelpDialog]);

    // Close context menu on click elsewhere
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        if (contextMenu) {
            window.addEventListener('click', handleClick);
            return () => window.removeEventListener('click', handleClick);
        }
    }, [contextMenu]);

    const updateEditField = useCallback((key, value) => {
        setEditRoom((prev) => {
            const next = { ...(prev ?? {}), [key]: value };
            // Compare to original activeRoom to determine dirty
            // Use region_name as the authoritative field for comparison
            const dirty = !!activeRoom && (
                (next.name ?? '') !== (activeRoom.name ?? '') ||
                (next.description ?? '') !== (activeRoom.description ?? '') ||
                (next.region ?? '') !== ((activeRoom.region_name ?? activeRoom.region) ?? '')
            );
            setIsDirty(dirty);
            return next;
        });
    }, [activeRoom]);

    const handleSaveChanges = useCallback(async () => {
        if (!isDirty || !editRoom?.id) return;
        try {
            setSaving(true);
            setSaveError('');
            setSaveSuccess(false);
            
            // Find the region object from regionsList to get both key and display name
            const selectedRegionKey = editRoom.region ?? null;
            const regionObj = selectedRegionKey ? regionsList.find(r => r.key === selectedRegionKey) : null;
            
            const payload = {
                name: editRoom.name?.trim() || null,
                description: editRoom.description ?? null,
                // region should be the human-readable display name
                region: regionObj ? regionObj.label : null,
                // region_name should be the key (foreign key to regions table)
                region_name: regionObj ? regionObj.key : null
            };
            
            const { error } = await supabase.from('rooms').update(payload).eq('id', editRoom.id);
            if (error) throw error;
            // Update local and refresh graph
            setActiveRoom((prev) => prev ? { ...prev, ...payload } : prev);
            setIsDirty(false);
            setSaving(false);
            setSaveSuccess(true);
            setReloadCounter((c) => c + 1);
        } catch (err) {
            console.error('Failed to save room', err);
            setSaveError(err?.message ?? 'Failed to save changes');
            setSaving(false);
        }
    }, [isDirty, editRoom, supabase, regionsList]);

    const handleCreateExit = useCallback(async (direction, targetRoomId) => {
        if (!editRoom?.id || !targetRoomId || !direction) return;
        
        try {
            setIsCreatingExit(true);
            
            const reverseDir = DIRECTION_REVERSE[direction] || direction;
            
            // Create exits (bidirectional unless one-way is checked)
            const exitsPayload = [
                {
                    from_room: editRoom.id,
                    to_room: targetRoomId,
                    verb: direction
                }
            ];
            
            // Add reverse exit if not one-way
            if (!isOneWayExit) {
                exitsPayload.push({
                    from_room: targetRoomId,
                    to_room: editRoom.id,
                    verb: reverseDir
                });
            }
            
            const { error } = await supabase.from('exits').insert(exitsPayload);
            if (error) throw error;
            
            // Fetch the updated room data with exits
            const { data: roomsData } = await supabase
                .from('rooms')
                .select('id, name, description, region, region_name, height, regions(display_name)');
            
            const { data: exitsData } = await supabase
                .from('exits')
                .select('id, from_room, to_room, verb');
            
            // Build exits for the current room
            const updatedExits = (exitsData ?? [])
                .filter(e => e.from_room === editRoom.id)
                .map(exit => {
                    const targetRoom = (roomsData ?? []).find(r => r.id === exit.to_room);
                    return {
                        ...exit,
                        targetRoom
                    };
                });
            
            // Update activeRoom with new exits
            setActiveRoom(prev => prev ? { ...prev, exits: updatedExits } : prev);
            
            // Refresh the graph
            setReloadCounter((c) => c + 1);
            
            // Clear the search, selection, active direction, and one-way state
            setExitRoomSearch(prev => ({ ...prev, [direction]: '' }));
            setExitRoomSelection(prev => ({ ...prev, [direction]: '' }));
            setActiveExitDirection(null);
            setIsOneWayExit(false);
            
        } catch (err) {
            console.error('Failed to create exit:', err);
            alert(`Failed to create exit: ${err?.message || 'Unknown error'}`);
        } finally {
            setIsCreatingExit(false);
        }
    }, [editRoom, supabase, isOneWayExit]);

    const handleDeleteExit = useCallback(async (direction, targetRoomId, targetRoomName) => {
        if (!editRoom?.id || !targetRoomId || !direction) return;
        
        // Show confirmation
        setDeleteExitConfirm({ direction, targetRoomId, targetRoomName });
    }, [editRoom]);

    const confirmDeleteExit = useCallback(async () => {
        if (!deleteExitConfirm) return;
        
        const { direction, targetRoomId, sourceRoomId, isEdgeDelete } = deleteExitConfirm;
        
        try {
            setIsDeletingExit(true);
            
            if (isEdgeDelete) {
                // Edge deletion - delete all exits between the two rooms
                const { error } = await supabase
                    .from('exits')
                    .delete()
                    .or(`and(from_room.eq.${sourceRoomId},to_room.eq.${targetRoomId}),and(from_room.eq.${targetRoomId},to_room.eq.${sourceRoomId})`);
                
                if (error) throw error;
            } else {
                // Regular exit deletion from edit dialog
                if (!editRoom?.id) return;
                
                const reverseDir = DIRECTION_REVERSE[direction] || direction;
                
                if (deleteOnlyOneDirection) {
                    // Delete only the specified direction
                    const { error } = await supabase
                        .from('exits')
                        .delete()
                        .eq('from_room', editRoom.id)
                        .eq('to_room', targetRoomId)
                        .eq('verb', direction);
                    
                    if (error) throw error;
                } else {
                    // Delete both directions (bidirectional)
                    const { error } = await supabase
                        .from('exits')
                        .delete()
                        .or(`and(from_room.eq.${editRoom.id},to_room.eq.${targetRoomId},verb.eq.${direction}),and(from_room.eq.${targetRoomId},to_room.eq.${editRoom.id},verb.eq.${reverseDir})`);
                    
                    if (error) throw error;
                }
                
                // Update activeRoom with new exits
                const { data: roomsData } = await supabase
                    .from('rooms')
                    .select('id, name, description, region, region_name, height, regions(display_name)');
                
                const { data: exitsData } = await supabase
                    .from('exits')
                    .select('id, from_room, to_room, verb');
                
                // Build exits for the current room
                const updatedExits = (exitsData ?? [])
                    .filter(e => e.from_room === editRoom.id)
                    .map(exit => {
                        const targetRoom = (roomsData ?? []).find(r => r.id === exit.to_room);
                        return {
                            ...exit,
                            targetRoom
                        };
                    });
                
                setActiveRoom(prev => prev ? { ...prev, exits: updatedExits } : prev);
            }
            
            // Refresh the graph
            setReloadCounter((c) => c + 1);
            
            // Close confirmation dialog
            setDeleteExitConfirm(null);
            setDeleteOnlyOneDirection(false);
            
        } catch (err) {
            console.error('Failed to delete exit:', err);
            alert(`Failed to delete exit: ${err?.message || 'Unknown error'}`);
        } finally {
            setIsDeletingExit(false);
        }
    }, [deleteExitConfirm, deleteOnlyOneDirection, editRoom, supabase]);

    const openDeleteDialog = useCallback(() => {
        setIsDeleteDialogOpen(true);
        setDeleteConfirmText('');
        setDeleteError('');
    }, []);

    const closeDeleteDialog = useCallback(() => {
        setIsDeleteDialogOpen(false);
        setDeleteConfirmText('');
        setDeleteError('');
    }, []);

    const handleDeleteRoom = useCallback(async () => {
        if (!editRoom?.id || !editRoom?.name) return;
        
        // Prevent deletion of default system rooms
        const PROTECTED_ROOMS = [
            'e58caed0-8268-419e-abe8-faa3833a1de6', // Character Creation Chamber
            'a1b2c3d4-5678-90ab-cdef-123456789abc'  // Town Square
        ];
        
        if (PROTECTED_ROOMS.includes(editRoom.id)) {
            setDeleteError('This is a system room and cannot be deleted. It is required for character creation.');
            return;
        }
        
        // Check if typed name matches
        if (deleteConfirmText.trim() !== editRoom.name.trim()) {
            setDeleteError('Room name does not match. Please type the exact room name to confirm deletion.');
            return;
        }

        try {
            setIsDeleting(true);
            setDeleteError('');

            // First delete all exits connected to this room
            const { error: exitsError } = await supabase
                .from('exits')
                .delete()
                .or(`from_room.eq.${editRoom.id},to_room.eq.${editRoom.id}`);
            
            if (exitsError) throw exitsError;

            // Then delete the room itself
            const { error: roomError } = await supabase
                .from('rooms')
                .delete()
                .eq('id', editRoom.id);
            
            if (roomError) throw roomError;

            // Close all dialogs and refresh
            setIsDeleteDialogOpen(false);
            setIsDialogOpen(false);
            setActiveRoom(null);
            setEditRoom(null);
            setDeleteConfirmText('');
            setIsDeleting(false);
            setReloadCounter((c) => c + 1);
        } catch (err) {
            console.error('Failed to delete room', err);
            setDeleteError(err?.message ?? 'Failed to delete room');
            setIsDeleting(false);
        }
    }, [editRoom, deleteConfirmText, supabase]);

    const handleCreateRoomFromHandle = useCallback((parentRoomId, handleId, parentRoomData) => {
        // Extract direction from handle ID
        const rawDirection = handleId.replace(/-out$|-in$/, '');
        const direction = DIRECTION_ALIASES[rawDirection] || rawDirection;
        
        console.log('🔍 handleCreateRoomFromHandle called:', {
            parentRoomId,
            handleId,
            direction,
            parentRoomData,
            region_name: parentRoomData?.region_name,
            region: parentRoomData?.region
        });
        
        // Store pending creation data and show dialog
        setPendingRoomCreate({
            parentRoomId,
            handleId,
            parentRoomData,
            direction
        });
        setShowCreateDialog(true);
    }, []);

    const openLinkExistingDialog = useCallback(() => {
        setShowCreateDialog(false);
        setShowLinkExistingDialog(true);
        setLinkExistingSearch('');
        setLinkExistingSelection('');
    }, []);

    const handleLinkExisting = useCallback(async () => {
        const isVerticalExit = pendingVerticalExit !== null;
        const hasRegularPending = pendingRoomCreate !== null;
        
        if (!hasRegularPending && !isVerticalExit) return;
        if (!linkExistingSelection) return;
        
        const { parentRoomId, direction } = isVerticalExit
            ? { parentRoomId: pendingVerticalExit.fromRoomId, direction: pendingVerticalExit.direction }
            : { parentRoomId: pendingRoomCreate.parentRoomId, direction: pendingRoomCreate.direction };
        
        try {
            setShowLinkExistingDialog(false);
            setIsCreatingExit(true);
            
            const reverseDir = DIRECTION_REVERSE[direction] || direction;
            
            // Create exits (bidirectional unless one-way is checked)
            const exitsPayload = [
                {
                    from_room: parentRoomId,
                    to_room: linkExistingSelection,
                    verb: direction
                }
            ];
            
            // Add reverse exit if not one-way
            if (!isOneWayExit) {
                exitsPayload.push({
                    from_room: linkExistingSelection,
                    to_room: parentRoomId,
                    verb: reverseDir
                });
            }
            
            const { error } = await supabase.from('exits').insert(exitsPayload);
            if (error) throw error;
            
            // Refresh the graph
            setReloadCounter((c) => c + 1);
            setPendingRoomCreate(null);
            setPendingVerticalExit(null);
            setLinkExistingSearch('');
            setLinkExistingSelection('');
            setIsOneWayExit(false);
            
        } catch (err) {
            console.error('Failed to create exit:', err);
            alert(`Failed to create exit: ${err?.message || 'Unknown error'}`);
        } finally {
            setIsCreatingExit(false);
        }
    }, [pendingRoomCreate, pendingVerticalExit, linkExistingSelection, supabase, isOneWayExit]);

    const createBlankRoom = useCallback(async () => {
        const isVerticalExit = pendingVerticalExit !== null;
        const hasRegularPending = pendingRoomCreate !== null;
        
        if (!hasRegularPending && !isVerticalExit) {
            console.log('❌ createBlankRoom: No pending create or vertical exit');
            return;
        }
        
        // Show the blank room dialog for editing before creating
        setShowCreateDialog(false);
        
        // Get default region from parent room or use first available region
        let defaultRegion = regionsList[0]?.key || 'unknown';
        console.log('🔍 Initial defaultRegion from regionsList[0]:', defaultRegion);
        console.log('🔍 Available regions:', regionsList);
        
        if (isVerticalExit) {
            console.log('🔍 Handling vertical exit, fetching parent room:', pendingVerticalExit.fromRoomId);
            // Fetch parent room data for vertical exit
            const { data: roomData } = await supabase
                .from('rooms')
                .select('region_name, region')
                .eq('id', pendingVerticalExit.fromRoomId)
                .single();
            console.log('🔍 Fetched room data for vertical exit:', roomData);
            defaultRegion = roomData?.region_name || roomData?.region || defaultRegion;
        } else if (pendingRoomCreate?.parentRoomData) {
            console.log('🔍 Using pendingRoomCreate.parentRoomData:', pendingRoomCreate.parentRoomData);
            console.log('🔍 region_name:', pendingRoomCreate.parentRoomData.region_name);
            console.log('🔍 region:', pendingRoomCreate.parentRoomData.region);
            // Use region_name (preferred) or fall back to region field
            defaultRegion = pendingRoomCreate.parentRoomData.region_name || 
                          pendingRoomCreate.parentRoomData.region || 
                          defaultRegion;
        } else {
            console.log('❌ No parentRoomData in pendingRoomCreate:', pendingRoomCreate);
        }
        
        console.log('✅ Final defaultRegion selected:', defaultRegion);
        
        setBlankRoom({ 
            name: 'New Room', 
            description: 'A newly created space waiting to be described.',
            region: defaultRegion
        });
        setShowBlankRoomDialog(true);
    }, [pendingRoomCreate, pendingVerticalExit, regionsList, supabase]);
    
    const saveBlankRoom = useCallback(async () => {
        // Check if this is from a vertical exit or regular room create
        const isVerticalExit = pendingVerticalExit !== null;
        const hasRegularPending = pendingRoomCreate !== null;
        
        if (!hasRegularPending && !isVerticalExit) return;
        if (!blankRoom.name || !blankRoom.description || !blankRoom.region) return;
        
        const { parentRoomId, direction, parentRoomData } = isVerticalExit 
            ? { parentRoomId: pendingVerticalExit.fromRoomId, direction: pendingVerticalExit.direction, parentRoomData: null }
            : pendingRoomCreate;
        
        try {
            setShowBlankRoomDialog(false);
            setIsCreatingRoom(true);
            
            const reverseDir = DIRECTION_REVERSE[direction] || direction;
            
            // Get parent room height for vertical exits
            let parentHeight = 0;
            if (isVerticalExit || direction === 'up' || direction === 'down') {
                const { data: parentRoom } = await supabase
                    .from('rooms')
                    .select('height')
                    .eq('id', parentRoomId)
                    .single();
                parentHeight = parentRoom?.height ?? 0;
            }
            
            // Calculate new room height based on direction
            let newRoomHeight = parentHeight;
            if (direction === 'up') {
                newRoomHeight = parentHeight + 1;
            } else if (direction === 'down') {
                newRoomHeight = parentHeight - 1;
            }
            
            // Use the selected region from blankRoom
            const normalizedRegion = blankRoom.region;
            
            // Fetch region display name
            const { data: regionData } = await supabase
                .from('regions')
                .select('display_name')
                .eq('name', normalizedRegion)
                .single();
            
            const regionDisplayName = regionData?.display_name || normalizedRegion;
            
            // Create new room with user-edited content
            const newRoomPayload = {
                name: blankRoom.name,
                description: blankRoom.description,
                region: regionDisplayName,
                region_name: normalizedRegion,
                height: newRoomHeight
            };
            
            const { data: newRoom, error: roomError} = await supabase
                .from('rooms')
                .insert([newRoomPayload])
                .select()
                .single();
            
            if (roomError) throw roomError;
            
            // Create bidirectional exits
            const exitsPayload = [
                {
                    from_room: parentRoomId,
                    to_room: newRoom.id,
                    verb: direction
                },
                {
                    from_room: newRoom.id,
                    to_room: parentRoomId,
                    verb: reverseDir
                }
            ];
            
            const { error: exitsError } = await supabase
                .from('exits')
                .insert(exitsPayload);
            
            if (exitsError) throw exitsError;
            
            // Fetch the newly created exits with target room data
            const { data: newExitsData } = await supabase
                .from('exits')
                .select('id, from_room, to_room, verb')
                .eq('from_room', newRoom.id);
            
            // Fetch the parent room data for the exit
            const { data: fetchedParentRoom } = await supabase
                .from('rooms')
                .select('id, name, description, region, region_name, height, image_url')
                .eq('id', parentRoomId)
                .single();
            
            // Build exits array with target room data
            const newRoomExits = (newExitsData ?? []).map(exit => ({
                ...exit,
                targetRoom: fetchedParentRoom
            }));
            
            // Refresh the graph
            setReloadCounter((c) => c + 1);
            setIsCreatingRoom(false);
            setPendingRoomCreate(null);
            setPendingVerticalExit(null);
            setBlankRoom({ name: '', description: '', region: '' });
            
            // Open the new room for editing with exits
            setTimeout(() => {
                setActiveRoom({ ...newRoom, exits: newRoomExits });
                setEditRoom({
                    id: newRoom.id,
                    name: newRoom.name,
                    description: newRoom.description,
                    region: newRoom.region || newRoom.region_name || 'Unknown'
                });
                setIsDirty(false);
                setSaveError('');
                setIsDialogOpen(true);
            }, 500);
            
        } catch (err) {
            console.error('Failed to create room:', err);
            setIsCreatingRoom(false);
            alert(`Failed to create room: ${err?.message || 'Unknown error'}`);
        }
    }, [pendingRoomCreate, pendingVerticalExit, blankRoom, supabase]);

    const saveStandaloneRoom = useCallback(async () => {
        if (!blankRoom.name || !blankRoom.description || !blankRoom.region) return;
        
        try {
            setShowBlankRoomDialog(false);
            setIsCreatingRoom(true);
            
            // Use the selected region from blankRoom
            const normalizedRegion = blankRoom.region;
            
            // Fetch region display name
            const { data: regionData } = await supabase
                .from('regions')
                .select('display_name')
                .eq('name', normalizedRegion)
                .single();
            
            const regionDisplayName = regionData?.display_name || normalizedRegion;
            
            // Create new room with user-edited content (standalone rooms default to height 0)
            const newRoomPayload = {
                name: blankRoom.name,
                description: blankRoom.description,
                region: regionDisplayName,
                region_name: normalizedRegion,
                height: 0
            };
            
            const { data: newRoom, error: roomError} = await supabase
                .from('rooms')
                .insert([newRoomPayload])
                .select()
                .single();
            
            if (roomError) throw roomError;
            
            // Note: No exits are created since this is a standalone room
            
            // Store custom position if available from context menu (or last pending)
            const chosenPosition = pendingFlowPosition || contextMenu?.flowPosition;
            if (chosenPosition && newRoom?.id) {
                console.log('Storing custom position for room:', newRoom.id, chosenPosition);
                setCustomRoomPositions(prev => {
                    const newMap = new Map(prev);
                    newMap.set(newRoom.id, chosenPosition);
                    return newMap;
                });
            }
            
            // Refresh the graph
            setReloadCounter((c) => c + 1);
            setIsCreatingRoom(false);
            setIsStandaloneRoom(false);
            setBlankRoom({ name: '', description: '', region: '' });
            
            // Open the new room for editing
            setTimeout(() => {
                setActiveRoom(newRoom);
                setEditRoom({
                    id: newRoom.id,
                    name: newRoom.name,
                    description: newRoom.description,
                    region: newRoom.region || newRoom.region_name || 'Unknown'
                });
                setIsDirty(false);
                setSaveError('');
                setIsDialogOpen(true);
            }, 500);
            
        } catch (err) {
            console.error('Failed to create standalone room:', err);
            setIsCreatingRoom(false);
            setIsStandaloneRoom(false);
            alert(`Failed to create standalone room: ${err?.message || 'Unknown error'}`);
        }
    }, [blankRoom, supabase, contextMenu]);

    const handlePaneContextMenu = useCallback((event) => {
        event.preventDefault();
        
        // Get flow coordinates if instance is available
        let flowPosition = null;
        if (reactFlowInstance.current) {
            // Prefer project() with pane-relative coordinates; it's more stable across versions
            if (reactFlowInstance.current.project && event.currentTarget?.getBoundingClientRect) {
                const bounds = event.currentTarget.getBoundingClientRect();
                const p = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
                const projected = reactFlowInstance.current.project(p);
                flowPosition = projected;
                console.log('Context menu (project) at flow position:', projected);
            } else if (reactFlowInstance.current.screenToFlowPosition) {
                const projected = reactFlowInstance.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                flowPosition = projected;
                console.log('Context menu (screenToFlowPosition) at flow position:', projected);
            }
        }
        
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            flowPosition: flowPosition
        });
        setPendingFlowPosition(flowPosition);
    }, []);

    const handleCreateStandaloneRoom = useCallback(() => {
        setContextMenu(null);
        setIsStandaloneRoom(true);
        
        // Set default values for a standalone room
        const defaultRegion = regionsList[0]?.key || 'unknown';
        setBlankRoom({ 
            name: 'New Room', 
            description: 'A newly created space waiting to be described.',
            region: defaultRegion
        });
        setShowBlankRoomDialog(true);
    }, [regionsList]);

    const handleNodeDragStop = useCallback((event, node) => {
        // If this node has a custom position, update it
        if (customRoomPositions.has(node.id)) {
            setCustomRoomPositions(prev => {
                const newMap = new Map(prev);
                newMap.set(node.id, node.position);
                return newMap;
            });
        }
    }, [customRoomPositions]);

    const createAIRoom = useCallback(async () => {
        // Check if this is from a vertical exit or regular room create
        const isVerticalExit = pendingVerticalExit !== null;
        const hasRegularPending = pendingRoomCreate !== null;
        
        if (!hasRegularPending && !isVerticalExit) return;
        
        const { parentRoomId, direction, parentRoomData } = isVerticalExit
            ? { parentRoomId: pendingVerticalExit.fromRoomId, direction: pendingVerticalExit.direction, parentRoomData: null }
            : pendingRoomCreate;
        
        try {
            setShowCreateDialog(false);
            setIsCreatingRoom(true);
            
            const reverseDir = DIRECTION_REVERSE[direction] || direction;
            
            // Get parent room data if we're coming from vertical exit
            let actualParentData = parentRoomData;
            let parentHeight = 0;
            if (isVerticalExit) {
                const { data: roomData } = await supabase
                    .from('rooms')
                    .select('name, description, region, region_name, height')
                    .eq('id', parentRoomId)
                    .single();
                actualParentData = roomData;
                parentHeight = roomData?.height ?? 0;
            } else if (direction === 'up' || direction === 'down') {
                // For vertical exits from regular pendingRoomCreate
                const { data: roomData } = await supabase
                    .from('rooms')
                    .select('height')
                    .eq('id', parentRoomId)
                    .single();
                parentHeight = roomData?.height ?? 0;
            }
            
            // Calculate new room height based on direction
            let newRoomHeight = parentHeight;
            if (direction === 'up') {
                newRoomHeight = parentHeight + 1;
            } else if (direction === 'down') {
                newRoomHeight = parentHeight - 1;
            }
            
            const rawRegion = actualParentData?.region_name || actualParentData?.region || 'Unknown';
            const region = normalizeRegionKey(rawRegion); // Normalize to match database format
            
            // Fetch region data for context
            const { data: regionData, error: regionDataError } = await supabase
                .from('regions')
                .select('name, display_name, description')
                .eq('name', region)
                .single();
            
            if (regionDataError) {
                console.warn('Failed to fetch region data:', regionDataError);
                console.warn('Tried to look up region:', region, '(normalized from:', rawRegion, ')');
            }
            
            // Fetch all rooms in the same region for context
            const { data: regionRooms, error: regionError } = await supabase
                .from('rooms')
                .select('name, description')
                .eq('region_name', region)
                .limit(20);
            
            if (regionError) throw regionError;
            
            // Call AI generation API
            console.log('Calling AI room generation with region:', regionData?.display_name || region);
            console.log('Region description length:', regionData?.description?.length || 0);
            
            const aiResponse = await fetch('/api/arkyv/generate-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parentRoom: {
                        name: actualParentData?.name,
                        description: actualParentData?.description
                    },
                    direction,
                    regionName: regionData?.display_name || region,
                    regionDescription: regionData?.description || '',
                    regionRooms: regionRooms || []
                })
            });
            
            if (!aiResponse.ok) {
                throw new Error('AI generation failed');
            }
            
            const aiData = await aiResponse.json();
            
            // Normalize region name to match database format (lowercase with hyphens)
            const normalizedRegion = normalizeRegionKey(region);
            
            // Use the display name we already fetched earlier
            const regionDisplayName = regionData?.display_name || normalizedRegion;
            
            // Create new room with AI-generated content
            const newRoomPayload = {
                name: aiData.name || 'New Room',
                description: aiData.description || 'A newly created space.',
                region: regionDisplayName,
                region_name: normalizedRegion,
                height: newRoomHeight
            };
            
            const { data: newRoom, error: roomError } = await supabase
                .from('rooms')
                .insert([newRoomPayload])
                .select()
                .single();
            
            if (roomError) throw roomError;
            
            // Create bidirectional exits
            const exitsPayload = [
                {
                    from_room: parentRoomId,
                    to_room: newRoom.id,
                    verb: direction
                },
                {
                    from_room: newRoom.id,
                    to_room: parentRoomId,
                    verb: reverseDir
                }
            ];
            
            const { error: exitsError } = await supabase
                .from('exits')
                .insert(exitsPayload);
            
            if (exitsError) throw exitsError;
            
            // Fetch the newly created exits with target room data
            const { data: newExitsData } = await supabase
                .from('exits')
                .select('id, from_room, to_room, verb')
                .eq('from_room', newRoom.id);
            
            // Fetch the parent room data for the exit
            const { data: fetchedParentRoom } = await supabase
                .from('rooms')
                .select('id, name, description, region, region_name, height, image_url')
                .eq('id', parentRoomId)
                .single();
            
            // Build exits array with target room data
            const newRoomExits = (newExitsData ?? []).map(exit => ({
                ...exit,
                targetRoom: fetchedParentRoom
            }));
            
            // Refresh the graph
            setReloadCounter((c) => c + 1);
            setIsCreatingRoom(false);
            setPendingRoomCreate(null);
            setPendingVerticalExit(null);
            
            // Open the new room for editing with exits
            setTimeout(() => {
                setActiveRoom({ ...newRoom, exits: newRoomExits });
                setEditRoom({
                    id: newRoom.id,
                    name: newRoom.name,
                    description: newRoom.description,
                    region: newRoom.region || newRoom.region_name || 'Unknown'
                });
                setIsDirty(false);
                setSaveError('');
                setIsDialogOpen(true);
            }, 500);
            
        } catch (err) {
            console.error('Failed to create AI room:', err);
            setIsCreatingRoom(false);
            setPendingRoomCreate(null);
            setPendingVerticalExit(null);
            alert(`Failed to create AI room: ${err?.message || 'Unknown error'}`);
        }
    }, [pendingRoomCreate, pendingVerticalExit, supabase]);

    // Blank Room AI Handlers
    const handleGenerateRoomName = useCallback(async () => {
        // Support both standalone rooms and rooms created from exits (including vertical)
        const isStandalone = isStandaloneRoom && !pendingRoomCreate && !pendingVerticalExit;
        if (!isStandalone && !pendingRoomCreate && !pendingVerticalExit) return;
        
        try {
            setIsGeneratingRoomName(true);
            
            // Get region from either pendingRoomCreate, pendingVerticalExit, or blankRoom (for standalone)
            let rawRegion;
            let parentRoom = null;
            let direction = null;
            
            if (isStandalone) {
                rawRegion = blankRoom.region;
            } else if (pendingVerticalExit) {
                // Get parent room data for vertical exit
                const { data: roomData } = await supabase
                    .from('rooms')
                    .select('name, description, region, region_name')
                    .eq('id', pendingVerticalExit.fromRoomId)
                    .single();
                rawRegion = roomData?.region || roomData?.region_name || 'Unknown';
                parentRoom = { name: roomData?.name };
                direction = pendingVerticalExit.direction;
            } else {
                rawRegion = pendingRoomCreate.parentRoomData?.region || pendingRoomCreate.parentRoomData?.region_name || 'Unknown';
                parentRoom = { name: pendingRoomCreate.parentRoomData?.name };
                direction = pendingRoomCreate.direction;
            }
            
            const region = normalizeRegionKey(rawRegion);
            
            // Get region data
            const { data: regionData } = await supabase
                .from('regions')
                .select('name, display_name, description')
                .eq('name', region)
                .single();
            
            // Get nearby rooms
            const { data: nearbyRooms } = await supabase
                .from('rooms')
                .select('name')
                .eq('region_name', region)
                .limit(10);
            
            const response = await fetch('/api/arkyv/suggest-room-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    regionName: regionData?.display_name || region,
                    regionDescription: regionData?.description || '',
                    nearbyRooms: nearbyRooms || [],
                    parentRoom: isStandalone ? null : parentRoom,
                    direction: isStandalone ? null : direction,
                    roomDescription: blankRoom.description // Include current description
                })
            });
            
            if (!response.ok) throw new Error('Failed to generate room name');
            
            const data = await response.json();
            setBlankRoom(prev => ({ ...prev, name: data.name }));
            
        } catch (err) {
            console.error('Failed to generate room name:', err);
            alert('Failed to generate room name');
        } finally {
            setIsGeneratingRoomName(false);
        }
    }, [pendingRoomCreate, pendingVerticalExit, isStandaloneRoom, blankRoom, supabase]);
    
    const handleSuggestRoomDescription = useCallback(async () => {
        // Support both standalone rooms and rooms created from exits (including vertical)
        const isStandalone = isStandaloneRoom && !pendingRoomCreate && !pendingVerticalExit;
        if (!isStandalone && !pendingRoomCreate && !pendingVerticalExit) return;
        
        try {
            setIsGeneratingRoomDescription(true);
            
            // Get region from either pendingRoomCreate, pendingVerticalExit, or blankRoom (for standalone)
            let rawRegion;
            let parentRoom = null;
            let direction = null;
            
            if (isStandalone) {
                rawRegion = blankRoom.region;
            } else if (pendingVerticalExit) {
                // Get parent room data for vertical exit
                const { data: roomData } = await supabase
                    .from('rooms')
                    .select('name, description, region, region_name')
                    .eq('id', pendingVerticalExit.fromRoomId)
                    .single();
                rawRegion = roomData?.region || roomData?.region_name || 'Unknown';
                parentRoom = { name: roomData?.name, description: roomData?.description };
                direction = pendingVerticalExit.direction;
            } else {
                const { direction: dir, parentRoomData } = pendingRoomCreate;
                rawRegion = parentRoomData?.region || parentRoomData?.region_name || 'Unknown';
                parentRoom = { name: parentRoomData?.name, description: parentRoomData?.description };
                direction = dir;
            }
            
            const region = normalizeRegionKey(rawRegion);
            
            // Get region data
            const { data: regionData } = await supabase
                .from('regions')
                .select('name, display_name, description')
                .eq('name', region)
                .single();
            
            // Get nearby rooms for context
            const { data: regionRooms } = await supabase
                .from('rooms')
                .select('name, description')
                .eq('region_name', region)
                .limit(20);
            
            const response = await fetch('/api/arkyv/suggest-room-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName: blankRoom.name,
                    regionDescription: regionData?.description || '',
                    parentRoom: isStandalone ? null : parentRoom,
                    direction: isStandalone ? null : direction,
                    regionRooms: regionRooms || []
                })
            });
            
            if (!response.ok) throw new Error('Failed to suggest description');
            
            const data = await response.json();
            setBlankRoom(prev => ({ ...prev, description: data.description }));
            
        } catch (err) {
            console.error('Failed to suggest room description:', err);
            alert('Failed to suggest description');
        } finally {
            setIsGeneratingRoomDescription(false);
        }
    }, [pendingRoomCreate, pendingVerticalExit, isStandaloneRoom, blankRoom, supabase]);
    
    const handleRefineRoomDescription = useCallback(async () => {
        // Support both standalone rooms and rooms created from exits (including vertical)
        const isStandalone = isStandaloneRoom && !pendingRoomCreate && !pendingVerticalExit;
        if (!isStandalone && !pendingRoomCreate && !pendingVerticalExit) return;
        
        try {
            setIsGeneratingRoomDescription(true);
            
            // Get region from either pendingRoomCreate, pendingVerticalExit, or blankRoom (for standalone)
            let rawRegion;
            let parentRoom = null;
            let direction = null;
            
            if (isStandalone) {
                rawRegion = blankRoom.region;
            } else if (pendingVerticalExit) {
                // Get parent room data for vertical exit
                const { data: roomData } = await supabase
                    .from('rooms')
                    .select('name, description, region, region_name')
                    .eq('id', pendingVerticalExit.fromRoomId)
                    .single();
                rawRegion = roomData?.region || roomData?.region_name || 'Unknown';
                parentRoom = { name: roomData?.name };
                direction = pendingVerticalExit.direction;
            } else {
                const { direction: dir, parentRoomData } = pendingRoomCreate;
                rawRegion = parentRoomData?.region || parentRoomData?.region_name || 'Unknown';
                parentRoom = { name: parentRoomData?.name };
                direction = dir;
            }
            
            const region = normalizeRegionKey(rawRegion);
            
            // Get region data
            const { data: regionData } = await supabase
                .from('regions')
                .select('name, display_name, description')
                .eq('name', region)
                .single();
            
            const response = await fetch('/api/arkyv/refine-room-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName: blankRoom.name,
                    existingDescription: blankRoom.description,
                    regionDescription: regionData?.description || '',
                    parentRoom: isStandalone ? null : parentRoom,
                    direction: isStandalone ? null : direction
                })
            });
            
            if (!response.ok) throw new Error('Failed to refine description');
            
            const data = await response.json();
            setBlankRoom(prev => ({ ...prev, description: data.description }));
            
        } catch (err) {
            console.error('Failed to refine room description:', err);
            alert('Failed to refine description');
        } finally {
            setIsGeneratingRoomDescription(false);
        }
    }, [pendingRoomCreate, pendingVerticalExit, isStandaloneRoom, blankRoom, supabase]);

    // Edit Room AI Handlers
    const handleEditGenerateRoomName = useCallback(async () => {
        if (!activeRoom || !editRoom) return;
        
        try {
            setIsEditGeneratingRoomName(true);
            
            const rawRegion = activeRoom?.region || activeRoom?.region_name || 'Unknown';
            const region = normalizeRegionKey(rawRegion);
            
            // Get region data
            const { data: regionData } = await supabase
                .from('regions')
                .select('name, display_name, description')
                .eq('name', region)
                .single();
            
            // Get nearby rooms
            const { data: nearbyRooms } = await supabase
                .from('rooms')
                .select('name')
                .eq('region_name', region)
                .limit(10);
            
            // Get exits to determine context
            const { data: exits } = await supabase
                .from('exits')
                .select('from_room, verb')
                .eq('to_room', activeRoom.id)
                .limit(1);
            
            const parentExit = exits?.[0];
            let parentRoom = null;
            let direction = null;
            
            if (parentExit) {
                const { data: parentData } = await supabase
                    .from('rooms')
                    .select('name')
                    .eq('id', parentExit.from_room)
                    .single();
                parentRoom = parentData;
                direction = parentExit.verb;
            }
            
            const response = await fetch('/api/arkyv/suggest-room-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    regionName: regionData?.display_name || region,
                    regionDescription: regionData?.description || '',
                    nearbyRooms: nearbyRooms || [],
                    parentRoom: parentRoom || { name: 'Unknown' },
                    direction: direction || 'connected',
                    roomDescription: editRoom.description || ''
                })
            });
            
            if (!response.ok) throw new Error('Failed to generate name');
            
            const data = await response.json();
            updateEditField('name', data.name);
            
        } catch (err) {
            console.error('Failed to generate room name:', err);
            alert('Failed to generate room name');
        } finally {
            setIsEditGeneratingRoomName(false);
        }
    }, [activeRoom, editRoom, supabase, updateEditField]);
    
    const handleEditSuggestRoomDescription = useCallback(async () => {
        if (!activeRoom || !editRoom) return;
        
        try {
            setEditDescriptionOperation('suggest');
            
            const rawRegion = activeRoom?.region || activeRoom?.region_name || 'Unknown';
            const region = normalizeRegionKey(rawRegion);
            
            // Get region data
            const { data: regionData } = await supabase
                .from('regions')
                .select('name, display_name, description')
                .eq('name', region)
                .single();
            
            // Get nearby rooms for context
            const { data: regionRooms } = await supabase
                .from('rooms')
                .select('name, description')
                .eq('region_name', region)
                .limit(20);
            
            // Get exits to determine context
            const { data: exits } = await supabase
                .from('exits')
                .select('from_room, verb')
                .eq('to_room', activeRoom.id)
                .limit(1);
            
            const parentExit = exits?.[0];
            let parentRoom = null;
            let direction = null;
            
            if (parentExit) {
                const { data: parentData } = await supabase
                    .from('rooms')
                    .select('name')
                    .eq('id', parentExit.from_room)
                    .single();
                parentRoom = parentData;
                direction = parentExit.verb;
            }
            
            const response = await fetch('/api/arkyv/suggest-room-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName: editRoom.name,
                    regionDescription: regionData?.description || '',
                    parentRoom: parentRoom || { name: 'Unknown' },
                    direction: direction || 'connected',
                    nearbyRooms: regionRooms || []
                })
            });
            
            if (!response.ok) throw new Error('Failed to suggest description');
            
            const data = await response.json();
            updateEditField('description', data.description);
            
        } catch (err) {
            console.error('Failed to suggest room description:', err);
            alert('Failed to suggest description');
        } finally {
            setEditDescriptionOperation(null);
        }
    }, [activeRoom, editRoom, supabase, updateEditField]);
    
    const handleEditRefineRoomDescription = useCallback(async () => {
        if (!activeRoom || !editRoom) return;
        
        try {
            setEditDescriptionOperation('refine');
            
            const rawRegion = activeRoom?.region || activeRoom?.region_name || 'Unknown';
            const region = normalizeRegionKey(rawRegion);
            
            // Get region data
            const { data: regionData } = await supabase
                .from('regions')
                .select('name, display_name, description')
                .eq('name', region)
                .single();
            
            // Get exits to determine context
            const { data: exits } = await supabase
                .from('exits')
                .select('from_room, verb')
                .eq('to_room', activeRoom.id)
                .limit(1);
            
            const parentExit = exits?.[0];
            let parentRoom = null;
            let direction = null;
            
            if (parentExit) {
                const { data: parentData } = await supabase
                    .from('rooms')
                    .select('name')
                    .eq('id', parentExit.from_room)
                    .single();
                parentRoom = parentData;
                direction = parentExit.verb;
            }
            
            const response = await fetch('/api/arkyv/refine-room-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName: editRoom.name,
                    existingDescription: editRoom.description,
                    regionDescription: regionData?.description || '',
                    parentRoom: parentRoom || { name: 'Unknown' },
                    direction: direction || 'connected'
                })
            });
            
            if (!response.ok) throw new Error('Failed to refine description');
            
            const data = await response.json();
            updateEditField('description', data.description);
            
        } catch (err) {
            console.error('Failed to refine room description:', err);
            alert('Failed to refine description');
        } finally {
            setEditDescriptionOperation(null);
        }
    }, [activeRoom, editRoom, supabase, updateEditField]);

    const handleGenerateRoomImage = useCallback(async () => {
        if (!activeRoom || !editRoom?.description) return;
        
        const roomId = activeRoom.id;
        
        try {
            setGeneratingRoomImages(prev => ({ ...prev, [roomId]: true }));
            setRoomImageErrors(prev => ({ ...prev, [roomId]: '' }));
            setRoomImageSuccesses(prev => ({ ...prev, [roomId]: '' }));
            
            // Fetch region description if checkbox is enabled
            let regionDescription = null;
            if (includeRegionInPrompt) {
                const rawRegion = activeRoom?.region || activeRoom?.region_name || 'Unknown';
                const region = normalizeRegionKey(rawRegion);
                
                const { data: regionData } = await supabase
                    .from('regions')
                    .select('description')
                    .eq('name', region)
                    .single();
                
                regionDescription = regionData?.description || null;
            }
            
            const response = await fetch('/api/arkyv/generate-room-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: activeRoom.id,
                    roomName: editRoom.name,
                    roomDescription: editRoom.description,
                    regionDescription: regionDescription
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                if (errorData.error === 'INSUFFICIENT_CREDITS') {
                    throw new Error('INSUFFICIENT_CREDITS');
                }
                throw new Error(errorData.error || 'Failed to generate image');
            }
            
            const data = await response.json();
            
            // Update credits
            if (data.creditsRemaining !== undefined) {
                setRdCredits(data.creditsRemaining);
            }
            
            // Update the active room ONLY if we're still viewing the same room
            setActiveRoom(prev => prev?.id === roomId ? { ...prev, image_url: data.imageUrl } : prev);
            
            // Trigger a reload to refresh the room data from database
            setReloadCounter(prev => prev + 1);
            
            setRoomImageSuccesses(prev => ({ ...prev, [roomId]: `Image generated successfully! ${data.creditsRemaining ? `Credits remaining: ${data.creditsRemaining}` : ''}` }));
            
        } catch (err) {
            console.error('Failed to generate room image:', err);
            if (err.message === 'INSUFFICIENT_CREDITS') {
                setRoomImageErrors(prev => ({ 
                    ...prev, 
                    [roomId]: (
                        <span>
                            Insufficient credits (need 2). <a href="https://www.retrodiffusion.ai/app/credits" target="_blank" rel="noopener noreferrer" className="underline text-cyan-300 hover:text-cyan-200">Purchase more credits →</a>
                        </span>
                    )
                }));
            } else {
                setRoomImageErrors(prev => ({ ...prev, [roomId]: err.message || 'Failed to generate image' }));
            }
        } finally {
            setGeneratingRoomImages(prev => ({ ...prev, [roomId]: false }));
        }
    }, [activeRoom, editRoom, includeRegionInPrompt, supabase]);

    const handleGenerateNpcPortrait = useCallback(async () => {
        if (!activeNpc || !editNpc?.description) return;
        
        const npcId = activeNpc.id;
        
        try {
            setGeneratingNpcPortraits(prev => ({ ...prev, [npcId]: true }));
            setNpcPortraitErrors(prev => ({ ...prev, [npcId]: '' }));
            setNpcPortraitSuccesses(prev => ({ ...prev, [npcId]: '' }));
            
            // Fetch region description if checkbox is enabled
            let regionDescription = null;
            if (includeRegionInNpcPortrait && editNpc.current_room) {
                // Get the room to find its region
                const { data: roomData } = await supabase
                    .from('rooms')
                    .select('region_name')
                    .eq('id', editNpc.current_room)
                    .single();
                
                if (roomData?.region_name) {
                    const region = normalizeRegionKey(roomData.region_name);
                    
                    const { data: regionData } = await supabase
                        .from('regions')
                        .select('description')
                        .eq('name', region)
                        .single();
                    
                    regionDescription = regionData?.description || null;
                }
            }
            
            const response = await fetch('/api/arkyv/generate-npc-portrait', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcId: activeNpc.id,
                    npcName: editNpc.name,
                    npcDescription: editNpc.description,
                    regionDescription: regionDescription
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                if (errorData.error === 'INSUFFICIENT_CREDITS') {
                    throw new Error('INSUFFICIENT_CREDITS');
                }
                throw new Error(errorData.error || 'Failed to generate portrait');
            }
            
            const data = await response.json();
            
            // Update credits
            if (data.creditsRemaining !== undefined) {
                setRdCredits(data.creditsRemaining);
            }
            
            // Update the active NPC ONLY if we're still viewing the same NPC
            setActiveNpc(prev => prev?.id === npcId ? { ...prev, portrait_url: data.portraitUrl } : prev);
            
            // Trigger a reload to refresh the NPC data from database
            setReloadCounter(prev => prev + 1);
            
            setNpcPortraitSuccesses(prev => ({ ...prev, [npcId]: `Portrait generated successfully! ${data.creditsRemaining ? `Credits remaining: ${data.creditsRemaining}` : ''}` }));
            
        } catch (err) {
            console.error('Failed to generate NPC portrait:', err);
            if (err.message === 'INSUFFICIENT_CREDITS') {
                setNpcPortraitErrors(prev => ({ 
                    ...prev, 
                    [npcId]: (
                        <span>
                            Insufficient credits (need 2). <a href="https://www.retrodiffusion.ai/app/credits" target="_blank" rel="noopener noreferrer" className="underline text-cyan-300 hover:text-cyan-200">Purchase more credits →</a>
                        </span>
                    )
                }));
            } else {
                setNpcPortraitErrors(prev => ({ ...prev, [npcId]: err.message || 'Failed to generate portrait' }));
            }
        } finally {
            setGeneratingNpcPortraits(prev => ({ ...prev, [npcId]: false }));
        }
    }, [activeNpc, editNpc, includeRegionInNpcPortrait, supabase]);

    // Region Dialog Handlers
    const handleCreateRegion = useCallback(async () => {
        // Validate all fields
        if (!newRegion.display_name || !newRegion.description || !newRegion.borderColor || !newRegion.fontColor || !newRegion.accent) {
            setRegionError('All fields are required');
            return;
        }

        try {
            setIsCreatingRegion(true);
            setRegionError('');

            // Generate name from display_name (lowercase, replace spaces with hyphens)
            const regionName = newRegion.display_name.toLowerCase().trim().replace(/\s+/g, '-');

            // Create color_scheme object
            const colorScheme = {
                borderColor: newRegion.borderColor,
                fontColor: newRegion.fontColor,
                accent: newRegion.accent
            };

            const { data, error } = await supabase
                .from('regions')
                .insert([{
                    name: regionName,
                    display_name: newRegion.display_name,
                    description: newRegion.description,
                    color_scheme: colorScheme
                }])
                .select()
                .single();

            if (error) throw error;

            // Update the cache
            regionPaletteCache.set(regionName, colorScheme);

            // Update regionsData state immediately
            setRegionsData(prev => [...prev, data]);

            // Update regionsList
            setRegionsList(prev => [...prev, {
                key: regionName,
                label: newRegion.display_name
            }]);

            // Reset form
            setNewRegion({
                display_name: '',
                description: '',
                borderColor: '#38bdf8',
                fontColor: '#e0f2fe',
                accent: 'rgba(56, 189, 248, 0.14)'
            });

            setShowNewRegionDialog(false);
            setReloadCounter((c) => c + 1);

        } catch (err) {
            console.error('Failed to create region:', err);
            setRegionError(err?.message || 'Failed to create region');
        } finally {
            setIsCreatingRegion(false);
        }
    }, [newRegion, supabase]);

    const handleGenerateColors = useCallback(async (mode = 'complementary') => {
        try {
            setIsGeneratingColors(mode);
            
            const response = await fetch('/api/arkyv/generate-colors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    baseColor: mode === 'complementary' ? newRegion.borderColor : null,
                    regionName: mode === 'suggest' ? newRegion.display_name : null,
                    regionDescription: mode === 'suggest' ? newRegion.description : null
                })
            });

            if (!response.ok) throw new Error('Failed to generate colors');

            const colors = await response.json();

            setNewRegion(prev => ({
                ...prev,
                borderColor: colors.borderColor,
                fontColor: colors.fontColor,
                accent: colors.accent
            }));

        } catch (err) {
            console.error('Failed to generate colors:', err);
            alert('Failed to generate colors');
        } finally {
            setIsGeneratingColors(null);
        }
    }, [newRegion.borderColor, newRegion.display_name, newRegion.description]);

    const handleGenerateRegionName = useCallback(async () => {
        try {
            setIsGeneratingRegionName(true);
            
            // Fetch all existing region names
            const { data: regions, error: regionsError } = await supabase
                .from('regions')
                .select('display_name, name')
                .order('created_at', { ascending: false });
            
            if (regionsError) throw regionsError;
            
            const response = await fetch('/api/arkyv/generate-region-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    existingRegions: regions || []
                })
            });

            if (!response.ok) throw new Error('Failed to generate region name');

            const data = await response.json();

            setNewRegion(prev => ({
                ...prev,
                display_name: data.name
            }));

        } catch (err) {
            console.error('Failed to generate region name:', err);
            alert('Failed to generate region name');
        } finally {
            setIsGeneratingRegionName(false);
        }
    }, [supabase]);

    const handleGenerateDescription = useCallback(async (mode = 'refine') => {
        try {
            setIsGeneratingDescription(mode);
            
            const response = await fetch('/api/arkyv/generate-region-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    regionName: newRegion.display_name || '',
                    existingDescription: newRegion.description
                })
            });

            if (!response.ok) throw new Error('Failed to generate description');

            const data = await response.json();

            setNewRegion(prev => ({
                ...prev,
                description: data.description
            }));

        } catch (err) {
            console.error('Failed to generate description:', err);
            alert('Failed to generate description');
        } finally {
            setIsGeneratingDescription(null);
        }
    }, [newRegion.display_name, newRegion.description]);

    const handleSuggestDescription = useCallback(async () => {
        try {
            setIsGeneratingDescription('suggest');
            
            // Fetch all existing region descriptions for context
            const { data: regions, error: regionsError } = await supabase
                .from('regions')
                .select('display_name, name, description')
                .order('created_at', { ascending: false });
            
            if (regionsError) throw regionsError;
            
            const response = await fetch('/api/arkyv/suggest-region-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    regionName: newRegion.display_name,
                    existingRegions: regions || []
                })
            });

            if (!response.ok) throw new Error('Failed to suggest description');

            const data = await response.json();

            setNewRegion(prev => ({
                ...prev,
                description: data.description
            }));

        } catch (err) {
            console.error('Failed to suggest description:', err);
            alert('Failed to suggest description');
        } finally {
            setIsGeneratingDescription(null);
        }
    }, [newRegion.display_name, supabase]);

    // Region Editing Handlers
    const openRegionDialog = useCallback((region) => {
        setActiveRegion(region);
        const colorScheme = region.color_scheme || {};
        setEditRegion({
            id: region.id,
            name: region.name,
            display_name: region.display_name || '',
            description: region.description || '',
            borderColor: colorScheme.borderColor || '#38bdf8',
            fontColor: colorScheme.fontColor || '#e0f2fe',
            accent: colorScheme.accent || 'rgba(56, 189, 248, 0.14)'
        });
        setRegionError('');
        setShowEditRegionDialog(true);
    }, []);

    const closeRegionDialog = useCallback(() => {
        setShowEditRegionDialog(false);
        setActiveRegion(null);
        setEditRegion(null);
        setRegionError('');
    }, []);

    const handleUpdateRegion = useCallback(async () => {
        if (!editRegion || !activeRegion) return;

        // Validate all fields
        if (!editRegion.display_name || !editRegion.description || !editRegion.borderColor || !editRegion.fontColor || !editRegion.accent) {
            setRegionError('All fields are required');
            return;
        }

        try {
            setIsUpdatingRegion(true);
            setRegionError('');

            // Generate name from display_name (lowercase, replace spaces with hyphens)
            const regionName = editRegion.display_name.toLowerCase().trim().replace(/\s+/g, '-');

            // Create color_scheme object
            const colorScheme = {
                borderColor: editRegion.borderColor,
                fontColor: editRegion.fontColor,
                accent: editRegion.accent
            };

            const { data, error } = await supabase
                .from('regions')
                .update({
                    name: regionName,
                    display_name: editRegion.display_name,
                    description: editRegion.description,
                    color_scheme: colorScheme
                })
                .eq('name', activeRegion.name)
                .select()
                .single();

            if (error) throw error;

            // Update the cache
            regionPaletteCache.set(regionName, colorScheme);
            // If name changed, remove old cache entry
            if (regionName !== activeRegion.name) {
                regionPaletteCache.delete(activeRegion.name);
            }

            // Update regionsData state immediately
            setRegionsData(prev => {
                const updated = prev.map(r => 
                    r.name === activeRegion.name ? data : r
                );
                // If name changed, we need to ensure the updated region is in the list
                if (regionName !== activeRegion.name) {
                    const hasNewName = updated.some(r => r.name === regionName);
                    if (!hasNewName) {
                        return updated.map(r => r.name === activeRegion.name ? data : r);
                    }
                }
                return updated;
            });

            // Update regionsList
            setRegionsList(prev => prev.map(r => 
                r.key === activeRegion.name 
                    ? { key: regionName, label: editRegion.display_name }
                    : r
            ));

            closeRegionDialog();
            setReloadCounter((c) => c + 1);

        } catch (err) {
            console.error('Failed to update region:', err);
            setRegionError(err?.message || 'Failed to update region');
        } finally {
            setIsUpdatingRegion(false);
        }
    }, [editRegion, activeRegion, supabase, closeRegionDialog]);

    const handleGenerateColorsForEdit = useCallback(async (mode = 'complementary') => {
        if (!editRegion) return;

        try {
            setIsGeneratingColors(mode);
            
            const response = await fetch('/api/arkyv/generate-colors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    baseColor: mode === 'complementary' ? editRegion.borderColor : null,
                    regionName: mode === 'suggest' ? editRegion.display_name : null,
                    regionDescription: mode === 'suggest' ? editRegion.description : null
                })
            });

            if (!response.ok) throw new Error('Failed to generate colors');

            const colors = await response.json();

            setEditRegion(prev => ({
                ...prev,
                borderColor: colors.borderColor,
                fontColor: colors.fontColor,
                accent: colors.accent
            }));

        } catch (err) {
            console.error('Failed to generate colors:', err);
            alert('Failed to generate colors');
        } finally {
            setIsGeneratingColors(null);
        }
    }, [editRegion]);

    const handleGenerateDescriptionForEdit = useCallback(async (mode = 'refine') => {
        if (!editRegion) return;

        try {
            setIsGeneratingDescription(mode);
            
            const response = await fetch('/api/arkyv/generate-region-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    regionName: editRegion.display_name || '',
                    existingDescription: editRegion.description
                })
            });

            if (!response.ok) throw new Error('Failed to generate description');

            const data = await response.json();

            setEditRegion(prev => ({
                ...prev,
                description: data.description
            }));

        } catch (err) {
            console.error('Failed to generate description:', err);
            alert('Failed to generate description');
        } finally {
            setIsGeneratingDescription(null);
        }
    }, [editRegion]);

    const handleSuggestDescriptionForEdit = useCallback(async () => {
        if (!editRegion) return;

        try {
            setIsGeneratingDescription('suggest');
            
            const { data: regions, error: regionsError } = await supabase
                .from('regions')
                .select('display_name, name, description')
                .order('created_at', { ascending: false });
            
            if (regionsError) throw regionsError;
            
            const response = await fetch('/api/arkyv/suggest-region-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    regionName: editRegion.display_name,
                    existingRegions: regions || []
                })
            });

            if (!response.ok) throw new Error('Failed to suggest description');

            const data = await response.json();

            setEditRegion(prev => ({
                ...prev,
                description: data.description
            }));

        } catch (err) {
            console.error('Failed to suggest description:', err);
            alert('Failed to suggest description');
        } finally {
            setIsGeneratingDescription(null);
        }
    }, [editRegion, supabase]);

    // NPC Dialog Handlers
    const openNpcDialog = useCallback((npc) => {
        setActiveNpc(npc);
        setEditNpc({
            id: npc.id,
            name: npc.name ?? '',
            description: npc.description ?? '',
            dialogue_tree: npc.dialogue_tree ?? {},
            faction: npc.faction ?? '',
            behavior_type: npc.behavior_type ?? 'static',
            alias: npc.alias ?? '',
            greeting_behavior: npc.greeting_behavior ?? null,
            current_room: npc.current_room ?? null
        });
        setIsNpcDirty(false);
        setNpcSaveError('');
        setNpcRoomSearch('');
        setIsNpcDialogOpen(true);
    }, []);

    const closeNpcDialog = useCallback(() => {
        setIsNpcDialogOpen(false);
        setActiveNpc(null);
        setEditNpc(null);
        setIsNpcDirty(false);
        setNpcSaveSuccess(false);
        setNpcSaveError('');
        setNpcRoomSearch('');
    }, []);

    const updateNpcField = useCallback((key, value) => {
        setEditNpc((prev) => {
            const next = { ...(prev ?? {}), [key]: value };
            const dirty = !!activeNpc && (
                (next.name ?? '') !== (activeNpc.name ?? '') ||
                (next.description ?? '') !== (activeNpc.description ?? '') ||
                JSON.stringify(next.dialogue_tree ?? {}) !== JSON.stringify(activeNpc.dialogue_tree ?? {}) ||
                (next.faction ?? '') !== (activeNpc.faction ?? '') ||
                (next.behavior_type ?? '') !== (activeNpc.behavior_type ?? '') ||
                (next.alias ?? '') !== (activeNpc.alias ?? '') ||
                (next.greeting_behavior ?? '') !== (activeNpc.greeting_behavior ?? '') ||
                (next.current_room ?? null) !== (activeNpc.current_room ?? null)
            );
            setIsNpcDirty(dirty);
            return next;
        });
    }, [activeNpc]);

    const handleSaveNpc = useCallback(async () => {
        if (!isNpcDirty || !editNpc?.id) return;
        try {
            setNpcSaving(true);
            setNpcSaveError('');
            setNpcSaveSuccess(false);
            const payload = {
                name: editNpc.name?.trim() || null,
                description: editNpc.description?.trim() || null,
                dialogue_tree: editNpc.dialogue_tree ?? {},
                faction: editNpc.faction?.trim() || null,
                behavior_type: editNpc.behavior_type ?? 'static',
                alias: editNpc.alias?.trim() || null,
                greeting_behavior: editNpc.greeting_behavior || null,
                current_room: editNpc.current_room || null
            };
            const { error } = await supabase.from('npcs').update(payload).eq('id', editNpc.id);
            if (error) throw error;
            setActiveNpc((prev) => prev ? { ...prev, ...payload } : prev);
            setIsNpcDirty(false);
            setNpcSaving(false);
            setNpcSaveSuccess(true);
            setReloadCounter((c) => c + 1);
        } catch (err) {
            console.error('Failed to save NPC', err);
            setNpcSaveError(err?.message ?? 'Failed to save changes');
            setNpcSaving(false);
        }
    }, [isNpcDirty, editNpc, supabase]);

    const openDeleteNpcDialog = useCallback(() => {
        setDeleteNpcConfirmText('');
        setDeleteNpcError('');
        setIsDeleteNpcDialogOpen(true);
    }, []);

    const closeDeleteNpcDialog = useCallback(() => {
        setIsDeleteNpcDialogOpen(false);
        setDeleteNpcConfirmText('');
        setDeleteNpcError('');
    }, []);

    const handleDeleteNpc = useCallback(async () => {
        if (!editNpc || deleteNpcConfirmText.trim() !== editNpc.name.trim()) {
            return;
        }

        try {
            setIsDeletingNpc(true);
            setDeleteNpcError('');

            const { error } = await supabase
                .from('npcs')
                .delete()
                .eq('id', editNpc.id);

            if (error) throw error;

            // Close both dialogs and reload
            closeDeleteNpcDialog();
            closeNpcDialog();
            setReloadCounter((c) => c + 1);
        } catch (err) {
            console.error('Failed to delete NPC', err);
            setDeleteNpcError(err?.message ?? 'Failed to delete NPC');
        } finally {
            setIsDeletingNpc(false);
        }
    }, [editNpc, deleteNpcConfirmText, supabase, closeNpcDialog]);

    // Create NPC Handlers
    const handleAddNpcToRoom = useCallback((roomId) => {
        setNewNpc({
            name: '',
            alias: '',
            description: '',
            current_room: roomId,
            faction: '',
            behavior_type: 'static',
            greeting_behavior: 'none',
            personality: ''
        });
        setNpcRoomSearch('');
        setShowCreateNpcDialog(true);
    }, []);

    const handleCreateNpc = useCallback(async () => {
        if (!newNpc.name || !newNpc.alias || !newNpc.description) {
            alert('Name, alias, and description are required');
            return;
        }

        try {
            setIsCreatingNpc(true);
            
            const payload = {
                name: newNpc.name.trim(),
                description: newNpc.description.trim(),
                alias: newNpc.alias?.trim() || null,
                current_room: newNpc.current_room || null,
                faction: newNpc.faction?.trim() || null,
                behavior_type: newNpc.behavior_type || 'static',
                greeting_behavior: newNpc.greeting_behavior || 'none',
                dialogue_tree: {
                    personality: newNpc.personality?.trim() || ''
                }
            };

            const { error } = await supabase
                .from('npcs')
                .insert([payload]);

            if (error) throw error;

            // Reset form
            setNewNpc({
                name: '',
                alias: '',
                description: '',
                current_room: '',
                faction: '',
                behavior_type: 'static',
                greeting_behavior: 'none',
                personality: ''
            });
            setNpcRoomSearch('');

            setShowCreateNpcDialog(false);
            setReloadCounter((c) => c + 1);

        } catch (err) {
            console.error('Failed to create NPC:', err);
            alert(`Failed to create NPC: ${err?.message || 'Unknown error'}`);
        } finally {
            setIsCreatingNpc(false);
        }
    }, [newNpc, supabase]);

    const handleGenerateNpcName = useCallback(async () => {
        try {
            setIsGeneratingNpcName(true);

            const roomData = allRooms.find(r => r.id === newNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || '',
                    npcDescription: newNpc.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to generate name');

            const data = await response.json();
            setNewNpc(prev => ({ 
                ...prev, 
                name: data.name || '',
                alias: data.alias || ''
            }));

        } catch (err) {
            console.error('Failed to generate NPC name:', err);
            alert('Failed to generate name');
        } finally {
            setIsGeneratingNpcName(false);
        }
    }, [newNpc, allRooms, regionsData]);

    const handleSuggestNpcDescription = useCallback(async () => {
        try {
            setIsSuggestingNpcDescription(true);

            const roomData = allRooms.find(r => r.id === newNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcName: newNpc.name || '',
                    npcAlias: newNpc.alias || '',
                    existingDescription: '', // Generate from scratch
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to generate description');

            const data = await response.json();
            setNewNpc(prev => ({ ...prev, description: data.description }));

        } catch (err) {
            console.error('Failed to suggest NPC description:', err);
            alert('Failed to suggest description');
        } finally {
            setIsSuggestingNpcDescription(false);
        }
    }, [newNpc, allRooms, regionsData]);

    const handleRefineNpcDescription = useCallback(async () => {
        try {
            setIsRefiningNpcDescription(true);

            const roomData = allRooms.find(r => r.id === newNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcName: newNpc.name || '',
                    npcAlias: newNpc.alias || '',
                    existingDescription: newNpc.description || '', // Pass existing text to refine
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to refine description');

            const data = await response.json();
            setNewNpc(prev => ({ ...prev, description: data.description }));

        } catch (err) {
            console.error('Failed to refine NPC description:', err);
            alert('Failed to refine description');
        } finally {
            setIsRefiningNpcDescription(false);
        }
    }, [newNpc, allRooms, regionsData]);

    const handleSuggestNpcPersonality = useCallback(async () => {
        try {
            setIsSuggestingNpcPersonality(true);

            const roomData = allRooms.find(r => r.id === newNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-personality', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcName: newNpc.name || '',
                    npcAlias: newNpc.alias || '',
                    npcDescription: newNpc.description || '',
                    existingPersonality: '', // Generate from scratch
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to generate personality');

            const data = await response.json();
            setNewNpc(prev => ({ ...prev, personality: data.personality }));

        } catch (err) {
            console.error('Failed to suggest NPC personality:', err);
            alert('Failed to suggest personality');
        } finally {
            setIsSuggestingNpcPersonality(false);
        }
    }, [newNpc, allRooms, regionsData]);

    const handleRefineNpcPersonality = useCallback(async () => {
        try {
            setIsRefiningNpcPersonality(true);

            const roomData = allRooms.find(r => r.id === newNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-personality', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcName: newNpc.name || '',
                    npcAlias: newNpc.alias || '',
                    npcDescription: newNpc.description || '',
                    existingPersonality: newNpc.personality || '', // Pass existing text to refine
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to refine personality');

            const data = await response.json();
            setNewNpc(prev => ({ ...prev, personality: data.personality }));

        } catch (err) {
            console.error('Failed to refine NPC personality:', err);
            alert('Failed to refine personality');
        } finally {
            setIsRefiningNpcPersonality(false);
        }
    }, [newNpc, allRooms, regionsData]);

    // Edit NPC AI Handlers (for edit dialog)
    const handleGenerateEditNpcName = useCallback(async () => {
        if (!editNpc) return;
        try {
            setIsGeneratingNpcName(true);

            const roomData = allRooms.find(r => r.id === editNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || '',
                    npcDescription: editNpc.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to generate name');

            const data = await response.json();
            updateNpcField('name', data.name || '');
            updateNpcField('alias', data.alias || '');

        } catch (err) {
            console.error('Failed to generate NPC name:', err);
            alert('Failed to generate name');
        } finally {
            setIsGeneratingNpcName(false);
        }
    }, [editNpc, allRooms, regionsData, updateNpcField]);

    const handleSuggestEditNpcDescription = useCallback(async () => {
        if (!editNpc) return;
        try {
            setIsSuggestingNpcDescription(true);

            const roomData = allRooms.find(r => r.id === editNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcName: editNpc.name || '',
                    npcAlias: editNpc.alias || '',
                    existingDescription: '',
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to generate description');

            const data = await response.json();
            updateNpcField('description', data.description);

        } catch (err) {
            console.error('Failed to suggest NPC description:', err);
            alert('Failed to suggest description');
        } finally {
            setIsSuggestingNpcDescription(false);
        }
    }, [editNpc, allRooms, regionsData, updateNpcField]);

    const handleRefineEditNpcDescription = useCallback(async () => {
        if (!editNpc) return;
        try {
            setIsRefiningNpcDescription(true);

            const roomData = allRooms.find(r => r.id === editNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcName: editNpc.name || '',
                    npcAlias: editNpc.alias || '',
                    existingDescription: editNpc.description || '',
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to refine description');

            const data = await response.json();
            updateNpcField('description', data.description);

        } catch (err) {
            console.error('Failed to refine NPC description:', err);
            alert('Failed to refine description');
        } finally {
            setIsRefiningNpcDescription(false);
        }
    }, [editNpc, allRooms, regionsData, updateNpcField]);

    const handleSuggestEditNpcPersonality = useCallback(async () => {
        if (!editNpc) return;
        try {
            setIsSuggestingNpcPersonality(true);

            const roomData = allRooms.find(r => r.id === editNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-personality', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcName: editNpc.name || '',
                    npcAlias: editNpc.alias || '',
                    npcDescription: editNpc.description || '',
                    existingPersonality: '',
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to generate personality');

            const data = await response.json();
            const newDialogueTree = {
                ...editNpc?.dialogue_tree,
                personality: data.personality
            };
            updateNpcField('dialogue_tree', newDialogueTree);

        } catch (err) {
            console.error('Failed to suggest NPC personality:', err);
            alert('Failed to suggest personality');
        } finally {
            setIsSuggestingNpcPersonality(false);
        }
    }, [editNpc, allRooms, regionsData, updateNpcField]);

    const handleRefineEditNpcPersonality = useCallback(async () => {
        if (!editNpc) return;
        try {
            setIsRefiningNpcPersonality(true);

            const roomData = allRooms.find(r => r.id === editNpc.current_room);
            const regionKey = roomData?.region_name || 'Unknown';
            const regionData = regionsData.find(r => normalizeRegionKey(r.name) === normalizeRegionKey(regionKey));

            const response = await fetch('/api/arkyv/suggest-npc-personality', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcName: editNpc.name || '',
                    npcAlias: editNpc.alias || '',
                    npcDescription: editNpc.description || '',
                    existingPersonality: editNpc?.dialogue_tree?.personality || '',
                    roomName: roomData?.name || 'Unknown',
                    roomDescription: roomData?.description || '',
                    regionName: regionData?.display_name || regionKey,
                    regionDescription: regionData?.description || ''
                })
            });

            if (!response.ok) throw new Error('Failed to refine personality');

            const data = await response.json();
            const newDialogueTree = {
                ...editNpc?.dialogue_tree,
                personality: data.personality
            };
            updateNpcField('dialogue_tree', newDialogueTree);

        } catch (err) {
            console.error('Failed to refine NPC personality:', err);
            alert('Failed to refine personality');
        } finally {
            setIsRefiningNpcPersonality(false);
        }
    }, [editNpc, allRooms, regionsData, updateNpcField]);

    // Filter and sort NPCs
    const filteredNpcs = useMemo(() => {
        let filtered = npcs;

        // Search filter
        if (npcSearchTerm.trim()) {
            const search = npcSearchTerm.toLowerCase();
            filtered = filtered.filter(npc => 
                (npc.name ?? '').toLowerCase().includes(search) ||
                (npc.alias ?? '').toLowerCase().includes(search)
            );
        }

        // Region filter
        if (npcRegionFilter !== 'all') {
            filtered = filtered.filter(npc => {
                const npcRegion = npc.rooms?.region_name ?? 'unknown';
                return normalizeRegionKey(npcRegion) === normalizeRegionKey(npcRegionFilter);
            });
        }

        // Sort
        filtered = [...filtered].sort((a, b) => {
            const nameA = (a.name ?? '').toLowerCase();
            const nameB = (b.name ?? '').toLowerCase();
            if (npcSortOrder === 'asc') {
                return nameA.localeCompare(nameB);
            } else {
                return nameB.localeCompare(nameA);
            }
        });

        return filtered;
    }, [npcs, npcSearchTerm, npcRegionFilter, npcSortOrder]);

    // Filter and sort Regions
    const filteredRegions = useMemo(() => {
        let filtered = [...regionsData];

        // Search filter
        if (regionSearchTerm.trim()) {
            const search = regionSearchTerm.toLowerCase();
            filtered = filtered.filter(region => 
                (region.name ?? '').toLowerCase().includes(search) ||
                (region.display_name ?? '').toLowerCase().includes(search)
            );
        }

        // Sort
        filtered = [...filtered].sort((a, b) => {
            const nameA = (a.display_name ?? a.name ?? '').toLowerCase();
            const nameB = (b.display_name ?? b.name ?? '').toLowerCase();
            if (regionSortOrder === 'asc') {
                return nameA.localeCompare(nameB);
            } else {
                return nameB.localeCompare(nameA);
            }
        });

        return filtered;
    }, [regionsData, regionSearchTerm, regionSortOrder]);

    // Filter rooms for room selector
    const filteredRoomsForNpc = useMemo(() => {
        if (!npcRoomSearch.trim()) {
            return allRooms;
        }
        const search = npcRoomSearch.toLowerCase();
        return allRooms.filter(room => 
            (room.name ?? '').toLowerCase().includes(search) ||
            (room.region_name ?? '').toLowerCase().includes(search)
        );
    }, [allRooms, npcRoomSearch]);

    const nodeTypes = useMemo(() => {
        if (!flowLib?.Handle) {
            return undefined;
        }

        const Handle = flowLib.Handle;
        const staticHandles = [
            // Cardinal directions - place on outer border
            { id: 'north-out', type: 'source', position: Position.Top, style: { left: '50%', transform: 'translate(-50%, -100%)' }, direction: 'north' },
            { id: 'north-in', type: 'target', position: Position.Top, style: { left: '50%', transform: 'translate(-50%, -100%)' } },
            { id: 'south-out', type: 'source', position: Position.Bottom, style: { left: '50%', transform: 'translate(-50%, 100%)' }, direction: 'south' },
            { id: 'south-in', type: 'target', position: Position.Bottom, style: { left: '50%', transform: 'translate(-50%, 100%)' } },
            { id: 'east-out', type: 'source', position: Position.Right, style: { top: '50%', transform: 'translate(100%, -50%)' }, direction: 'east' },
            { id: 'east-in', type: 'target', position: Position.Right, style: { top: '50%', transform: 'translate(100%, -50%)' } },
            { id: 'west-out', type: 'source', position: Position.Left, style: { top: '50%', transform: 'translate(-100%, -50%)' }, direction: 'west' },
            { id: 'west-in', type: 'target', position: Position.Left, style: { top: '50%', transform: 'translate(-100%, -50%)' } },
            // Diagonals - exact outer corner
            { id: 'ne-out', type: 'source', position: Position.Top, style: { left: '100%', transform: 'translate(-100%, -100%)' }, direction: 'northeast' },
            { id: 'ne-in', type: 'target', position: Position.Top, style: { left: '100%', transform: 'translate(-100%, -100%)' } },
            { id: 'nw-out', type: 'source', position: Position.Top, style: { left: '0%', transform: 'translate(0%, -100%)' }, direction: 'northwest' },
            { id: 'nw-in', type: 'target', position: Position.Top, style: { left: '0%', transform: 'translate(0%, -100%)' } },
            { id: 'se-out', type: 'source', position: Position.Bottom, style: { left: '100%', transform: 'translate(-100%, 100%)' }, direction: 'southeast' },
            { id: 'se-in', type: 'target', position: Position.Bottom, style: { left: '100%', transform: 'translate(-100%, 100%)' } },
            { id: 'sw-out', type: 'source', position: Position.Bottom, style: { left: '0%', transform: 'translate(0%, 100%)' }, direction: 'southwest' },
            { id: 'sw-in', type: 'target', position: Position.Bottom, style: { left: '0%', transform: 'translate(0%, 100%)' } }
        ];

        // Compute precise wrapper anchor/transform so handles sit perfectly on borders/corners
        const computeWrapperAnchor = (handle) => {
            const direction = handle.direction;
            switch (direction) {
                case 'north':
                    return { left: '50%', top: 0, transform: 'translate(-50%, -110%)' };
                case 'south':
                    return { left: '50%', bottom: 0, transform: 'translate(-50%, 140%)' };
                case 'east':
                    return { left: '100%', top: '50%', transform: 'translate(30%, -50%)' };
                case 'west':
                    return { left: 0, top: '50%', transform: 'translate(-130%, -50%)' };
                case 'northeast':
                    return { left: '100%', top: 0, transform: 'translate(20%, -100%)' };
                case 'northwest':
                    return { left: 0, top: 0, transform: 'translate(-130%, -100%)' };
                case 'southeast':
                    return { left: '100%', bottom: 0, transform: 'translate(20%, 130%)' };
                case 'southwest':
                    return { left: 0, bottom: 0, transform: 'translate(-130%, 130%)' };
                case 'up':
                    return { left: '25%', top: 0, transform: 'translate(-50%, -50%)' };
                case 'down':
                    return { left: '25%', bottom: 0, transform: 'translate(-50%, 50%)' };
                default:
                    return { left: '50%', top: 0, transform: 'translate(-50%, -50%)' };
            }
        };

        const RoomNode = ({ id, data, style, selected }) => {
            const regionKey = normalizeRegionKey(data?.region);
            const paletteEntry = regionPaletteCache.get(regionKey) ?? {};
            // Only style inner content; wrapper (node.style) already draws border/background.
            const combinedStyle = {
                borderRadius: '8px',
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                color: style?.color ?? paletteEntry?.fontColor ?? '#E2E8F0',
                textAlign: 'center',
                position: 'relative'
            };

            // Check which handles have connections (hide if either outgoing or incoming exists)
            const outgoingDirs = data?.connections?.outgoing ? new Set(data.connections.outgoing.keys()) : new Set();
            const incomingDirs = data?.connections?.incoming ? new Set(data.connections.incoming.keys()) : new Set();

            return (
                <div className={`arkyv-room-node ${selected ? 'arkyv-room-node--selected' : ''}`} style={combinedStyle}>
                    {staticHandles.map((handle) => {
                        const isSource = handle.type === 'source';
                        const hasConnection = isSource && (outgoingDirs.has(handle.direction) || incomingDirs.has(handle.direction));
                        const isEmpty = isSource && !hasConnection;
                        
                        // Target handles should be invisible (just for connections)
                        if (handle.type === 'target') {
                            return (
                                <Handle
                                    key={handle.id}
                                    id={handle.id}
                                    type={handle.type}
                                    position={handle.position}
                                    style={{ ...handle.style, opacity: 0, pointerEvents: 'none' }}
                                    className="arkyv-node-handle-target"
                                />
                            );
                        }
                        
                        // Source handles with connections - show grey (blocked) on hover only
                        if (!isEmpty) {
                            return (
                                <React.Fragment key={handle.id}>
                                    {/* Invisible handle to keep edges anchored */}
                                    <Handle
                                        id={handle.id}
                                        type={handle.type}
                                        position={handle.position}
                                        style={{ ...handle.style, opacity: 0, pointerEvents: 'none' }}
                                    />
                                    {/* Grey blocked dot overlay (hover only) */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            ...computeWrapperAnchor(handle),
                                            width: '20px',
                                            height: '20px',
                                            pointerEvents: 'none'
                                        }}
                                    >
                                        <div className="arkyv-virtual-handle arkyv-node-handle arkyv-node-handle--blocked" style={{ position: 'absolute', inset: 0, margin: 'auto' }} />
                                    </div>
                                </React.Fragment>
                            );
                        }
                        
                        // For empty handles, wrap in a clickable div
                        return (
                            <div
                                key={`wrapper-${handle.id}`}
                                style={{
                                    position: 'absolute',
                                    ...computeWrapperAnchor(handle),
                                    width: '20px',
                                    height: '20px',
                                    cursor: 'pointer',
                                    zIndex: 100,
                                    pointerEvents: 'auto'
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (handle.direction) {
                                        handleCreateRoomFromHandle(id, handle.id, data?.raw);
                                    }
                                }}
                            >
                                <div className="arkyv-virtual-handle arkyv-node-handle arkyv-node-handle--empty" style={{ position: 'absolute', inset: 0, margin: 'auto' }} />
                            </div>
                        );
                    })}
                    <div className="arkyv-room-node__content" style={{ padding: '12px 16px', overflow: 'hidden' }}>
                        <div className="arkyv-room-node__label" style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            maxWidth: '100%'
                        }}>
                            {data?.label ?? 'Unnamed Room'}
                        </div>
                        <div className="arkyv-room-node__meta" style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            maxWidth: '100%'
                        }}>{data?.regionDisplayName ?? data?.region ?? 'Unknown Region'}</div>
                    </div>
                </div>
            );
        };

        return {
            room: RoomNode
        };
    }, [flowLib, handleCreateRoomFromHandle]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <p className="font-terminal text-sm tracking-[0.35em] uppercase text-cyan-300">
                    Verifying admin access...
                </p>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Arkyv Admin Panel</title>
                <link rel="icon" href="/arkyv_logo.png" />
                <link rel="apple-touch-icon" href="/arkyv_logo.png" />
                <link rel="manifest" href="/manifest-arkyv.json" />
                <meta name="theme-color" content="#0ea5e9" />
                <meta name="apple-mobile-web-app-title" content="Arkyv" />
            </Head>
            <div className="min-h-screen bg-slate-950 text-slate-100 relative" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif" }}>
                <HamburgerIcon />
                <header className="border-b border-cyan-400/40 bg-slate-900/80 backdrop-blur">
                    <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
                        <div>
                            <h1 className="font-terminal text-lg tracking-[0.35em] uppercase text-cyan-200">
                                Arkyv // Admin Console
                            </h1>
                            <p className="text-xs text-slate-400 font-terminal tracking-[0.25em] uppercase mt-1">
                                Room topology & world management tools
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className="text-xs font-terminal uppercase tracking-[0.3em] text-purple-200 border border-purple-400/50 rounded-md px-3 py-1.5 hover:bg-purple-400/10 transition flex items-center gap-2"
                                onClick={() => setShowHelpDialog(true)}
                                title="Help & Guide"
                            >
                                <FontAwesomeIcon icon={faCircleInfo} className="text-sm" />
                                <span>Help</span>
                            </button>
                            <button
                                type="button"
                                className="text-xs font-terminal uppercase tracking-[0.3em] text-cyan-200 border border-cyan-400/50 rounded-md px-4 py-1.5 hover:bg-cyan-400/10 transition flex items-center gap-2"
                                onClick={() => router.push('/play')}
                            >
                                <FontAwesomeIcon icon={faGamepad} className="text-sm" />
                                <span>Back to Game</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Low Credit Warning */}
                {rdCredits !== null && rdCredits < 20 && (
                    <div className="max-w-7xl mx-auto px-6 pt-6">
                        <div className="bg-amber-500/10 border-2 border-amber-400/50 rounded-lg p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">⚠️</span>
                                <div>
                                    <p className="font-terminal text-sm tracking-[0.2em] uppercase text-amber-300">
                                        Low Credits Warning
                                    </p>
                                    <p className="text-xs text-amber-200/80 mt-1">
                                        You have <strong className="text-amber-300">{rdCredits} credits</strong> remaining. Each image/portrait costs 2 credits ({Math.floor(rdCredits / 2)} generations left).
                                    </p>
                                </div>
                            </div>
                            <a
                                href="https://www.retrodiffusion.ai/app/credits"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 rounded text-xs font-terminal uppercase tracking-[0.2em] text-amber-200 transition whitespace-nowrap"
                            >
                                Purchase Credits →
                            </a>
                        </div>
                    </div>
                )}

                <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                    {/* Layers controls moved into Room Map Visualization header */}
                    <section className="bg-slate-900/70 border border-cyan-400/40 rounded-xl shadow-xl shadow-cyan-400/10 h-[700px]">
                        <div className="p-6 border-b border-cyan-400/20 flex items-center justify-between">
                            <div>
                                <h2 className="font-terminal text-base tracking-[0.35em] uppercase text-cyan-200">
                                    Room Map Visualization
                                </h2>
                                <p className="text-xs text-slate-400 font-terminal tracking-[0.25em] uppercase mt-1">
                                    Interactive room topology - click nodes for details
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentLayer((prev) => {
                                        const minLayer = availableLayers.length ? Math.min(...availableLayers) : 0;
                                        const maxLayer = availableLayers.length ? Math.max(...availableLayers) : 0;
                                        const next = prev - 1;
                                        return Math.max(minLayer, Math.min(maxLayer, next));
                                    })}
                                    className="px-3 py-1 text-xs font-terminal uppercase tracking-[0.3em] rounded-md border transition border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/10"
                                    aria-label="Layer -1"
                                    title="Layer -1"
                                >
                                    -1
                                </button>
                                <span className="text-xs font-terminal uppercase tracking-[0.3em] text-slate-400 px-2">
                                    {currentLayer === 0 ? 'Ground' : currentLayer > 0 ? `+${currentLayer}` : `${currentLayer}`}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCurrentLayer((prev) => {
                                        const minLayer = availableLayers.length ? Math.min(...availableLayers) : 0;
                                        const maxLayer = availableLayers.length ? Math.max(...availableLayers) : 0;
                                        const next = prev + 1;
                                        return Math.max(minLayer, Math.min(maxLayer, next));
                                    })}
                                    className="px-3 py-1 text-xs font-terminal uppercase tracking-[0.3em] rounded-md border transition border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/10"
                                    aria-label="Layer +1"
                                    title="Layer +1"
                                >
                                    +1
                                </button>
                                
                                <div className="flex items-center gap-2 ml-3 pl-3 border-l border-slate-600">
                                    <input
                                        type="text"
                                        value={floorInputValue}
                                        onChange={(e) => setFloorInputValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const value = floorInputValue.trim().toLowerCase();
                                                const targetLayer = value === '' || value === 'ground' ? 0 : parseInt(value, 10);
                                                if (!isNaN(targetLayer)) {
                                                    setCurrentLayer(targetLayer);
                                                    setFloorInputValue('');
                                                }
                                            }
                                        }}
                                        placeholder="Ground"
                                        className="w-20 px-2 py-1 text-xs font-sans text-center uppercase tracking-[0.2em] bg-slate-800/70 border border-slate-600/60 rounded text-slate-100 placeholder:text-slate-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const value = floorInputValue.trim().toLowerCase();
                                            const targetLayer = value === '' || value === 'ground' ? 0 : parseInt(value, 10);
                                            if (!isNaN(targetLayer)) {
                                                setCurrentLayer(targetLayer);
                                                setFloorInputValue('');
                                            }
                                        }}
                                        className="px-2 py-1 text-xs font-terminal uppercase tracking-[0.2em] rounded-md border transition border-purple-400/40 text-purple-200 hover:bg-purple-400/10 whitespace-nowrap"
                                        title="Jump to floor (or press Enter)"
                                    >
                                        Go
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="h-[calc(100%-80px)] relative">
                            {ReactFlow && flowNodes.length > 0 ? (
                                <ReactFlow
                                    nodes={flowNodes}
                                    edges={flowEdges}
                                    nodeTypes={nodeTypes}
                                    onNodeClick={handleNodeClick}
                                    onEdgeClick={handleEdgeClick}
                                    onPaneContextMenu={handlePaneContextMenu}
                                    onNodeDragStop={handleNodeDragStop}
                                    onInit={(instance) => {
                                        reactFlowInstance.current = instance;
                                    }}
                                    fitView
                                    minZoom={0.1}
                                    maxZoom={2}
                                    defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
                                    proOptions={PRO_OPTIONS}
                                >
                                    <svg style={{ position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none' }}>
                                        <defs>
                                            {flowEdges.filter(edge => edge.data?.gradient).map(edge => (
                                                <linearGradient
                                                    key={edge.data.gradient.id}
                                                    id={edge.data.gradient.id}
                                                    gradientUnits="userSpaceOnUse"
                                                >
                                                    <stop offset="0%" stopColor={edge.data.gradient.fromColor} stopOpacity="1" />
                                                    <stop offset="100%" stopColor={edge.data.gradient.toColor} stopOpacity="1" />
                                                </linearGradient>
                                            ))}
                                        </defs>
                                    </svg>
                                    <Background
                                        color="rgba(56, 189, 248, 0.08)"
                                        gap={24}
                                        size={1.5}
                                    />
                                    <Controls className="arkyv-flow-controls" />
                                    <MiniMap
                                        nodeColor={(node) => {
                                            const regionKey = normalizeRegionKey(node?.data?.region);
                                            const palette = regionPaletteCache.get(regionKey);
                                            return palette?.borderColor ?? '#38bdf8';
                                        }}
                                        nodeStrokeColor={(node) => {
                                            const regionKey = normalizeRegionKey(node?.data?.region);
                                            const palette = regionPaletteCache.get(regionKey);
                                            return palette?.borderColor ?? '#38bdf8';
                                        }}
                                        nodeClassName="minimap-node-custom"
                                        maskColor="rgba(56, 189, 248, 0.15)"
                                        nodeBorderRadius={4}
                                        nodeStrokeWidth={2}
                                        inversePan={false}
                                        zoomable={true}
                                        pannable={true}
                                    />
                                </ReactFlow>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <p className="text-sm text-slate-400 font-terminal tracking-[0.25em] uppercase">
                                        {flowNodes.length === 0 ? 'No rooms found' : 'Loading map...'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="bg-slate-900/70 border border-cyan-400/40 rounded-xl shadow-xl shadow-cyan-400/10">
                        <div className="p-6 border-b border-cyan-400/20 flex justify-between items-start">
                            <div>
                                <h2 className="font-terminal text-base tracking-[0.35em] uppercase text-cyan-200">
                                    Region Management
                                </h2>
                                <p className="text-xs text-slate-400 font-terminal tracking-[0.25em] uppercase mt-1">
                                    Manage region colors and descriptions
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowNewRegionDialog(true)}
                                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded-lg text-xs font-terminal tracking-[0.2em] uppercase text-cyan-200 transition-all hover:shadow-lg hover:shadow-cyan-400/20"
                            >
                                + Create Region
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Search and Sort */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                                        Search Regions
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Search by name..."
                                        value={regionSearchTerm}
                                        onChange={(e) => setRegionSearchTerm(e.target.value)}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                                        Sort Order
                                    </label>
                                    <select
                                        value={regionSortOrder}
                                        onChange={(e) => setRegionSortOrder(e.target.value)}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-sm text-slate-100"
                                    >
                                        <option value="asc">A → Z</option>
                                        <option value="desc">Z → A</option>
                                    </select>
                                </div>
                            </div>

                            {/* Region List */}
                            <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-4 max-h-96 overflow-y-auto">
                                {filteredRegions.length === 0 ? (
                                    <p className="text-sm text-slate-400 font-terminal text-center py-8">
                                        No regions found
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {filteredRegions.map((region) => {
                                            const palette = region.color_scheme || {};
                                            return (
                                                <button
                                                    key={region.name}
                                                    type="button"
                                                    onClick={() => openRegionDialog(region)}
                                                    className="text-left bg-slate-900/70 rounded-lg px-4 py-3 hover:bg-slate-800/70 transition group flex items-center gap-3"
                                                    style={{
                                                        border: `1px solid ${palette.borderColor || '#38bdf8'}`,
                                                        boxShadow: `0 0 12px ${palette.accent || 'rgba(56, 189, 248, 0.14)'}`
                                                    }}
                                                >
                                                    <span
                                                        className="inline-block w-3 h-12 rounded-full flex-shrink-0"
                                                        style={{
                                                            background: palette.accent || 'rgba(15, 23, 42, 0.8)',
                                                            border: `1px solid ${palette.borderColor || '#38bdf8'}`
                                                        }}
                                                    />
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span 
                                                            className="font-terminal text-sm tracking-[0.2em] uppercase group-hover:brightness-110 truncate"
                                                            style={{ color: palette.fontColor || '#e0f2fe' }}
                                                        >
                                                            {region.display_name || region.name || 'Unknown Region'}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="bg-slate-900/70 border border-cyan-400/40 rounded-xl shadow-xl shadow-cyan-400/10">
                        <div className="p-6 border-b border-cyan-400/20 flex justify-between items-start">
                            <div>
                                <h2 className="font-terminal text-base tracking-[0.35em] uppercase text-cyan-200">
                                    NPC Management
                                </h2>
                                <p className="text-xs text-slate-400 font-terminal tracking-[0.25em] uppercase mt-1">
                                    Manage characters, locations, and behaviors
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCreateNpcDialog(true)}
                                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded-lg text-xs font-terminal tracking-[0.2em] uppercase text-cyan-200 transition-all hover:shadow-lg hover:shadow-cyan-400/20"
                            >
                                + Create NPC
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Search and Filters */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                                        Search NPCs
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Search by name or alias..."
                                        value={npcSearchTerm}
                                        onChange={(e) => setNpcSearchTerm(e.target.value)}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                                        Filter by Region
                                    </label>
                                    <select
                                        value={npcRegionFilter}
                                        onChange={(e) => setNpcRegionFilter(e.target.value)}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-sm text-slate-100 capitalize"
                                    >
                                        <option value="all">All Regions</option>
                                        {regionsList.map((r) => (
                                            <option key={r.key} value={r.key}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                                        Sort Order
                                    </label>
                                    <select
                                        value={npcSortOrder}
                                        onChange={(e) => setNpcSortOrder(e.target.value)}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-sm text-slate-100"
                                    >
                                        <option value="asc">A → Z</option>
                                        <option value="desc">Z → A</option>
                                    </select>
                                </div>
                            </div>

                            {/* NPC List */}
                            <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-4 max-h-96 overflow-y-auto">
                                {filteredNpcs.length === 0 ? (
                                    <p className="text-sm text-slate-400 font-terminal text-center py-8">
                                        No NPCs found
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {filteredNpcs.map((npc) => {
                                            const regionKey = normalizeRegionKey(npc.rooms?.region_name ?? 'unknown');
                                            const paletteEntry = regionPaletteCache.get(regionKey) ?? {
                                                borderColor: '#38bdf8',
                                                fontColor: '#e0f2fe',
                                                accent: 'rgba(56, 189, 248, 0.14)'
                                            };
                                            return (
                                                <button
                                                    key={npc.id}
                                                    type="button"
                                                    onClick={() => openNpcDialog(npc)}
                                                    className="text-left bg-slate-900/70 rounded-lg px-4 py-3 hover:bg-slate-800/70 transition group"
                                                    style={{
                                                        border: `1px solid ${paletteEntry.borderColor}`,
                                                        boxShadow: `0 0 12px ${paletteEntry.accent}`
                                                    }}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        {/* NPC Portrait or Placeholder */}
                                                        {npc.portrait_url ? (
                                                            <img 
                                                                src={npc.portrait_url}
                                                                alt={`${npc.name} portrait`}
                                                                className="w-16 h-16 rounded border-2 border-purple-400/50 flex-shrink-0"
                                                                style={{ imageRendering: 'pixelated' }}
                                                            />
                                                        ) : (
                                                            <div className="w-16 h-16 flex items-center justify-center rounded border-2 border-purple-400/30 bg-slate-800/50 flex-shrink-0">
                                                                <span className="text-3xl text-purple-400/30 font-terminal">?</span>
                                                            </div>
                                                        )}
                                                        
                                                        {/* NPC Info */}
                                                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                                                            <div 
                                                                className="font-terminal text-sm tracking-[0.2em] uppercase group-hover:brightness-110"
                                                                style={{ color: paletteEntry.fontColor }}
                                                            >
                                                                {npc.name ?? 'Unnamed NPC'}
                                                            </div>
                                                            {npc.alias && (
                                                                <div className="text-xs text-pink-300 font-terminal">
                                                                    aka "{npc.alias}"
                                                                </div>
                                                            )}
                                                            <div className="text-[0.65rem] text-slate-400 uppercase tracking-wider">
                                                                {npc.rooms?.name ?? 'No Location'}
                                                            </div>
                                                            <div 
                                                                className="text-[0.6rem] uppercase tracking-wider"
                                                                style={{ color: paletteEntry.borderColor }}
                                                            >
                                                                {npc.rooms?.region_name ?? 'Unknown Region'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Summary */}
                            <div className="text-xs text-slate-400 font-terminal tracking-wider">
                                Showing {filteredNpcs.length} of {npcs.length} NPCs
                            </div>
                        </div>
                    </section>
                </main>
                {showCreateDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onMouseDown={(e) => {
                        if (e.currentTarget === e.target) {
                            setShowCreateDialog(false);
                            setPendingRoomCreate(null);
                        }
                    }}>
                        <div className="bg-slate-900 border border-cyan-400/40 rounded-2xl shadow-[0_30px_70px_rgba(14,165,233,0.2)] p-8 max-w-lg w-full" onMouseDown={(e) => e.stopPropagation()}>
                            <h3 className="font-terminal text-base tracking-[0.35em] uppercase text-cyan-200 mb-2">
                                Create New Room
                            </h3>
                            <p className="text-sm text-slate-400 mb-6 font-terminal">
                                Choose how you'd like to create this room:
                            </p>
                            
                            <div className="space-y-4">
                                <button
                                    type="button"
                                    onClick={createBlankRoom}
                                    className="w-full text-left p-4 bg-slate-800/70 border border-slate-600/60 rounded-lg hover:bg-slate-700/70 hover:border-cyan-400/50 transition group"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="text-2xl">📝</div>
                                        <div className="flex-1">
                                            <div className="font-terminal text-sm tracking-[0.2em] uppercase text-cyan-200 mb-1">
                                                Blank Room
                                            </div>
                                            <div className="text-xs text-slate-400 leading-relaxed">
                                                Create an empty room that you can edit later. Quick and simple.
                                            </div>
                                        </div>
                                    </div>
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={createAIRoom}
                                    className="w-full text-left p-4 bg-slate-800/70 border border-slate-600/60 rounded-lg hover:bg-slate-700/70 hover:border-pink-400/50 transition group"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="text-2xl">✨</div>
                                        <div className="flex-1">
                                            <div className="font-terminal text-sm tracking-[0.2em] uppercase text-pink-200 mb-1">
                                                AI Generated
                                            </div>
                                            <div className="text-xs text-slate-400 leading-relaxed">
                                                Let AI create a unique room that fits perfectly with the <span className="font-bold text-pink-300">{pendingRoomCreate?.parentRoomData?.region || 'region'}</span> theme and connects naturally to <span className="font-bold text-pink-300">{pendingRoomCreate?.parentRoomData?.name || 'the parent room'}</span>.
                                            </div>
                                        </div>
                                    </div>
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={openLinkExistingDialog}
                                    className="w-full text-left p-4 bg-slate-800/70 border border-slate-600/60 rounded-lg hover:bg-slate-700/70 hover:border-green-400/50 transition group"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="text-2xl">🔗</div>
                                        <div className="flex-1">
                                            <div className="font-terminal text-sm tracking-[0.2em] uppercase text-green-200 mb-1">
                                                Link to Existing Room
                                            </div>
                                            <div className="text-xs text-slate-400 leading-relaxed">
                                                Connect to an existing room in your world. Search and select from any created room.
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            </div>
                            
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCreateDialog(false);
                                    setPendingRoomCreate(null);
                                }}
                                className="w-full mt-4 text-xs font-terminal uppercase tracking-[0.3em] text-slate-400 border border-slate-600 rounded-md px-4 py-2 hover:bg-slate-800/40 transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
                
                {/* Blank Room Edit Dialog */}
                {showBlankRoomDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onMouseDown={(e) => {
                        if (e.currentTarget === e.target) {
                            setShowBlankRoomDialog(false);
                            setBlankRoom({ name: '', description: '', region: '' });
                        }
                    }}>
                        <div className="bg-slate-900 border border-cyan-400/40 rounded-2xl shadow-[0_30px_70px_rgba(14,165,233,0.2)] max-w-2xl w-full max-h-[90vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="p-8 pb-4">
                                <h3 className="font-terminal text-base tracking-[0.35em] uppercase text-cyan-200 mb-2">
                                    Create Blank Room
                                </h3>
                                <p className="text-sm text-slate-400 font-terminal">
                                    Customize before creating
                                </p>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto px-8 space-y-6">
                                {/* Room Name */}
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <div className="flex items-center justify-between">
                                        <span>Room Name</span>
                                        {(!blankRoom.name || blankRoom.name === 'New Room') && (
                                            <Tooltip content="Generate a name based on description and region" position="top">
                                                <button
                                                    type="button"
                                                    onClick={handleGenerateRoomName}
                                                    disabled={isGeneratingRoomName}
                                                    className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isGeneratingRoomName ? '✨ Suggesting...' : '✨ Suggest'}
                                                </button>
                                            </Tooltip>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={blankRoom.name}
                                        onChange={(e) => setBlankRoom(prev => ({ ...prev, name: e.target.value }))}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case"
                                        placeholder="e.g., Neon-Lit Corridor"
                                        maxLength={30}
                                    />
                                    <span className="text-[0.6rem] text-slate-500">
                                        {blankRoom.name.length}/30 characters
                                    </span>
                                </label>
                                
                                {/* Region Selector */}
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    Region
                                    <select
                                        value={blankRoom.region}
                                        onChange={(e) => setBlankRoom(prev => ({ ...prev, region: e.target.value }))}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 capitalize"
                                    >
                                        {regionsList.map((r) => (
                                            <option key={r.key} value={r.key}>{r.label}</option>
                                        ))}
                                    </select>
                                </label>
                                
                                {/* Description */}
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <div className="flex items-center justify-between">
                                        <span>Description</span>
                                        <div className="flex gap-2">
                                            {blankRoom.name && (
                                                <Tooltip content="Generate description based on room name and region" position="top">
                                                    <button
                                                        type="button"
                                                        onClick={handleSuggestRoomDescription}
                                                        disabled={isGeneratingRoomDescription}
                                                        className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isGeneratingRoomDescription ? '✨ Suggesting...' : '✨ Suggest'}
                                                    </button>
                                                </Tooltip>
                                            )}
                                            {blankRoom.description && blankRoom.description !== 'A newly created space waiting to be described.' && (
                                                <Tooltip content="Refine and improve the existing description" position="top">
                                                    <button
                                                        type="button"
                                                        onClick={handleRefineRoomDescription}
                                                        disabled={isGeneratingRoomDescription}
                                                        className="px-3 py-1 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-pink-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isGeneratingRoomDescription ? '✨ Refining...' : '✨ Refine'}
                                                    </button>
                                                </Tooltip>
                                            )}
                                        </div>
                                    </div>
                                    <textarea
                                        value={blankRoom.description}
                                        onChange={(e) => setBlankRoom(prev => ({ ...prev, description: e.target.value }))}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case min-h-[120px]"
                                        placeholder="Describe the room's atmosphere and features..."
                                        maxLength={3000}
                                    />
                                    <span className="text-[0.6rem] text-slate-500">
                                        {blankRoom.description.length}/3000 characters
                                    </span>
                                </label>
                            </div>
                            
                            <div className="p-8 pt-4 border-t border-slate-700/50">
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={isStandaloneRoom ? saveStandaloneRoom : saveBlankRoom}
                                        disabled={!blankRoom.name || !blankRoom.description || !blankRoom.region}
                                        className="flex-1 text-sm font-terminal uppercase tracking-[0.3em] text-cyan-100 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded-lg px-6 py-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Create Room
                                    </button>
                                {!isStandaloneRoom && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowBlankRoomDialog(false);
                                            setBlankRoom({ name: '', description: '', region: '' });
                                            setShowCreateDialog(true);
                                        }}
                                        className="text-sm font-terminal uppercase tracking-[0.3em] text-slate-400 border border-slate-600 rounded-lg px-6 py-3 hover:bg-slate-800/40 transition"
                                    >
                                        Back
                                    </button>
                                )}
                                    {isStandaloneRoom && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBlankRoomDialog(false);
                                                setBlankRoom({ name: '', description: '', region: '' });
                                                setIsStandaloneRoom(false);
                                            }}
                                            className="text-sm font-terminal uppercase tracking-[0.3em] text-slate-400 border border-slate-600 rounded-lg px-6 py-3 hover:bg-slate-800/40 transition"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Link to Existing Room Dialog */}
                {showLinkExistingDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onMouseDown={(e) => {
                        if (e.currentTarget === e.target) {
                            setShowLinkExistingDialog(false);
                            setLinkExistingSearch('');
                            setLinkExistingSelection('');
                            setIsOneWayExit(false);
                        }
                    }}>
                        <div className="bg-slate-900 border border-green-400/40 rounded-2xl shadow-[0_30px_70px_rgba(20,184,166,0.2)] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                            <h3 className="font-terminal text-base tracking-[0.35em] uppercase text-green-200 mb-2">
                                Link to Existing Room
                            </h3>
                            <p className="text-sm text-slate-400 mb-6 font-terminal">
                                Connect <span className="text-green-300">{pendingRoomCreate?.parentRoomData?.name || pendingVerticalExit ? 'this room' : 'the room'}</span> <span className="text-green-300">{pendingRoomCreate?.direction || pendingVerticalExit?.direction || ''}</span> to an existing room
                            </p>
                            
                            <div className="space-y-4">
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <span>Search Rooms</span>
                                    <input
                                        type="text"
                                        value={linkExistingSearch}
                                        onChange={(e) => setLinkExistingSearch(e.target.value)}
                                        placeholder="Search by room name or region..."
                                        className="bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case text-sm"
                                    />
                                </label>
                                
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <span>Select Room</span>
                                    <select
                                        value={linkExistingSelection}
                                        onChange={(e) => setLinkExistingSelection(e.target.value)}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case text-sm max-h-[200px] overflow-y-auto"
                                        size="8"
                                    >
                                        <option value="">-- Select a room --</option>
                                        {allRooms
                                            .filter(room => {
                                                // Exclude the parent room
                                                const parentId = pendingRoomCreate?.parentRoomId || pendingVerticalExit?.fromRoomId;
                                                if (room.id === parentId) return false;
                                                
                                                // Filter by search term
                                                if (!linkExistingSearch) return true;
                                                const search = linkExistingSearch.toLowerCase();
                                                return (
                                                    room.name?.toLowerCase().includes(search) ||
                                                    room.region?.toLowerCase().includes(search) ||
                                                    room.region_name?.toLowerCase().includes(search)
                                                );
                                            })
                                            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                            .map((room) => (
                                                <option key={room.id} value={room.id}>
                                                    {room.name} ({room.region_name || room.region})
                                                </option>
                                            ))}
                                    </select>
                                    {linkExistingSearch && (
                                        <span className="text-[0.6rem] text-slate-500">
                                            {allRooms.filter(room => {
                                                const parentId = pendingRoomCreate?.parentRoomId || pendingVerticalExit?.fromRoomId;
                                                if (room.id === parentId) return false;
                                                const search = linkExistingSearch.toLowerCase();
                                                return room.name?.toLowerCase().includes(search) ||
                                                       room.region?.toLowerCase().includes(search) ||
                                                       room.region_name?.toLowerCase().includes(search);
                                            }).length} rooms found
                                        </span>
                                    )}
                                </label>
                                
                                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-amber-300 transition">
                                    <input
                                        type="checkbox"
                                        checked={isOneWayExit}
                                        onChange={(e) => setIsOneWayExit(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-2 focus:ring-amber-400/50"
                                    />
                                    <span className="uppercase tracking-[0.2em]">One-way exit?</span>
                                    <span className="text-[0.65rem] text-amber-300/70">(No return path)</span>
                                </label>
                            </div>
                            
                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={handleLinkExisting}
                                    disabled={!linkExistingSelection || isCreatingExit}
                                    className="flex-1 text-sm font-terminal uppercase tracking-[0.3em] text-green-100 bg-green-500/20 hover:bg-green-500/30 border border-green-400/50 rounded-lg px-6 py-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isCreatingExit ? 'Creating...' : `✓ Create ${isOneWayExit ? 'Exit' : 'Exits'}`}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowLinkExistingDialog(false);
                                        setLinkExistingSearch('');
                                        setLinkExistingSelection('');
                                        setIsOneWayExit(false);
                                        setShowCreateDialog(true);
                                    }}
                                    className="text-sm font-terminal uppercase tracking-[0.3em] text-slate-400 border border-slate-600 rounded-lg px-6 py-3 hover:bg-slate-800/40 transition"
                                >
                                    Back
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* New Region Dialog */}
                {showNewRegionDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onMouseDown={(e) => {
                        if (e.currentTarget === e.target) {
                            setShowNewRegionDialog(false);
                            setRegionError('');
                        }
                    }}>
                        <div className="bg-slate-900 border border-cyan-400/40 rounded-2xl shadow-[0_30px_70px_rgba(14,165,233,0.2)] max-w-2xl w-full max-h-[90vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="p-8 pb-4">
                                <h3 className="font-terminal text-base tracking-[0.35em] uppercase text-cyan-200 mb-2">
                                    Create New Region
                                </h3>
                                <p className="text-sm text-slate-400 font-terminal">
                                    All fields are required
                                </p>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto px-8">
                                {regionError && (
                                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                                        {regionError}
                                    </div>
                                )}
                                
                                <div className="space-y-6">
                                {/* Display Name */}
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <div className="flex items-center justify-between">
                                        <span>Region Name</span>
                                        {!newRegion.display_name && (
                                            <Tooltip content="Generate name based on existing world context" position="top">
                                                <button
                                                    type="button"
                                                    onClick={handleGenerateRegionName}
                                                    disabled={isGeneratingRegionName}
                                                    className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isGeneratingRegionName ? '✨ Suggesting...' : '✨ Suggest'}
                                                </button>
                                            </Tooltip>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={newRegion.display_name}
                                        onChange={(e) => setNewRegion(prev => ({ ...prev, display_name: e.target.value }))}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case"
                                        placeholder="e.g., Neon District"
                                        maxLength={100}
                                    />
                                    <span className="text-[0.6rem] text-slate-500">
                                        {newRegion.display_name.length}/100 characters
                                    </span>
                                </label>
                                
                                {/* Description */}
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            Description
                                            <span className="relative inline-block group">
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                    ?
                                                </span>
                                                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block w-72 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                    <span className="block mb-2">
                                                        <strong className="text-cyan-300">Region Description</strong> sets the mood and atmosphere for all rooms in this region.
                                                    </span>
                                                    <span className="block mb-2">
                                                        When using AI to generate adjacent rooms, this description influences the style and theme of new rooms.
                                                    </span>
                                                    <span className="block mb-2">
                                                        Also influences the visual style of NPC profile pics and room images (if enabled), helping maintain visual consistency across the zone.
                                                    </span>
                                                    <span className="block">
                                                        Think of it as the "DNA" that shapes everything in this region.
                                                    </span>
                                                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-cyan-400/40"></span>
                                                </span>
                                            </span>
                                        </span>
                                        <div className="flex gap-2">
                                            {newRegion.display_name && (
                                                <Tooltip content="Generate description based on region name" position="top">
                                                    <button
                                                        type="button"
                                                        onClick={handleSuggestDescription}
                                                        disabled={isGeneratingDescription !== null}
                                                        className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isGeneratingDescription === 'suggest' ? '✨ Suggesting...' : '✨ Suggest'}
                                                    </button>
                                                </Tooltip>
                                            )}
                                            <Tooltip content="Refine and improve the existing description" position="top">
                                                <button
                                                    type="button"
                                                    onClick={() => handleGenerateDescription('refine')}
                                                    disabled={isGeneratingDescription !== null}
                                                    className="px-3 py-1 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-pink-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isGeneratingDescription === 'refine' ? '✨ Refining...' : '✨ Refine'}
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <textarea
                                        value={newRegion.description}
                                        onChange={(e) => setNewRegion(prev => ({ ...prev, description: e.target.value }))}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case min-h-[120px]"
                                        placeholder="Describe the theme, atmosphere, and character of this region..."
                                        maxLength={3500}
                                    />
                                    <span className="text-[0.6rem] text-slate-500">
                                        {newRegion.description.length}/3500 characters (~500 words)
                                    </span>
                                </label>
                                
                                {/* Color Scheme */}
                                <div className="pt-4 border-t border-slate-700/50">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-xs uppercase tracking-[0.25em] text-slate-400">
                                            Color Scheme
                                        </h4>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleGenerateColors('random')}
                                                disabled={isGeneratingColors !== null}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-purple-200 transition disabled:opacity-50"
                                            >
                                                {isGeneratingColors === 'random' ? '🎨 ...' : '🎨 Random'}
                                            </button>
                                            {(newRegion.display_name || newRegion.description) && (
                                                <Tooltip content="Generate colors based on region theme" position="top">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleGenerateColors('suggest')}
                                                        disabled={isGeneratingColors !== null}
                                                        className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50"
                                                    >
                                                        {isGeneratingColors === 'suggest' ? '✨ Suggesting...' : '✨ Suggest'}
                                                    </button>
                                                </Tooltip>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleGenerateColors('complementary')}
                                                disabled={isGeneratingColors !== null}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-purple-200 transition disabled:opacity-50"
                                            >
                                                {isGeneratingColors === 'complementary' ? '🎨 ...' : '🎨 Complement'}
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 gap-4">
                                        {/* Border Color */}
                                        <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
                                            <input
                                                type="color"
                                                value={newRegion.borderColor}
                                                onChange={(e) => setNewRegion(prev => ({ ...prev, borderColor: e.target.value }))}
                                                className="w-12 h-12 rounded cursor-pointer"
                                            />
                                            <div className="flex-1">
                                                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                                    Border Color
                                                </label>
                                                <input
                                                    type="text"
                                                    value={newRegion.borderColor}
                                                    onChange={(e) => setNewRegion(prev => ({ ...prev, borderColor: e.target.value }))}
                                                    className="w-full mt-1 bg-slate-900 border border-slate-600/60 rounded px-2 py-1 text-xs text-slate-100 font-mono"
                                                />
                                            </div>
                                        </div>
                                        
                                        {/* Font Color */}
                                        <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
                                            <input
                                                type="color"
                                                value={newRegion.fontColor}
                                                onChange={(e) => setNewRegion(prev => ({ ...prev, fontColor: e.target.value }))}
                                                className="w-12 h-12 rounded cursor-pointer"
                                            />
                                            <div className="flex-1">
                                                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                                    Font Color
                                                </label>
                                                <input
                                                    type="text"
                                                    value={newRegion.fontColor}
                                                    onChange={(e) => setNewRegion(prev => ({ ...prev, fontColor: e.target.value }))}
                                                    className="w-full mt-1 bg-slate-900 border border-slate-600/60 rounded px-2 py-1 text-xs text-slate-100 font-mono"
                                                />
                                            </div>
                                        </div>
                                        
                                        {/* Accent Color */}
                                        <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
                                            <div className="w-12 h-12 rounded border border-slate-600" style={{ background: newRegion.accent }}></div>
                                            <div className="flex-1">
                                                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                                    Accent (rgba format)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={newRegion.accent}
                                                    onChange={(e) => setNewRegion(prev => ({ ...prev, accent: e.target.value }))}
                                                    className="w-full mt-1 bg-slate-900 border border-slate-600/60 rounded px-2 py-1 text-xs text-slate-100 font-mono"
                                                    placeholder="rgba(56, 189, 248, 0.14)"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Preview */}
                                    <div className="mt-4 p-4 bg-slate-800/50 border rounded-lg" style={{ 
                                        borderColor: newRegion.borderColor,
                                        boxShadow: `0 0 12px ${newRegion.accent}`
                                    }}>
                                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Preview</div>
                                        <div className="font-terminal tracking-[0.2em] uppercase" style={{ color: newRegion.fontColor }}>
                                            {newRegion.display_name || 'Region Name'}
                                        </div>
                                        <div className="text-xs mt-1" style={{ color: newRegion.borderColor }}>
                                            Border & Edges
                                        </div>
                                    </div>
                                </div>
                            </div>
                            </div>
                            
                            <div className="p-8 pt-4 border-t border-slate-700/50">
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleCreateRegion}
                                        disabled={isCreatingRegion || !newRegion.display_name || !newRegion.description}
                                        className="flex-1 text-sm font-terminal uppercase tracking-[0.3em] text-cyan-100 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded-lg px-6 py-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isCreatingRegion ? 'Creating...' : 'Create Region'}
                                    </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowNewRegionDialog(false);
                                        setRegionError('');
                                        setNewRegion({
                                            display_name: '',
                                            description: '',
                                            borderColor: '#38bdf8',
                                            fontColor: '#e0f2fe',
                                            accent: 'rgba(56, 189, 248, 0.14)'
                                        });
                                    }}
                                    className="text-sm font-terminal uppercase tracking-[0.3em] text-slate-400 border border-slate-600 rounded-lg px-6 py-3 hover:bg-slate-800/40 transition"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Edit Region Dialog */}
                {showEditRegionDialog && editRegion && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onMouseDown={(e) => {
                        if (e.currentTarget === e.target) {
                            closeRegionDialog();
                        }
                    }}>
                        <div className="bg-slate-900 border border-cyan-400/40 rounded-2xl shadow-[0_30px_70px_rgba(14,165,233,0.2)] max-w-2xl w-full max-h-[90vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="p-8 pb-4">
                                <h3 className="font-terminal text-base tracking-[0.35em] uppercase text-cyan-200 mb-2">
                                    Edit Region
                                </h3>
                                <p className="text-sm text-slate-400 font-terminal">
                                    All fields are required
                                </p>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto px-8">
                                {regionError && (
                                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                                        {regionError}
                                    </div>
                                )}
                            
                            <div className="space-y-6">
                                {/* Display Name */}
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <div className="flex items-center justify-between">
                                        <span>Region Name</span>
                                        <Tooltip content="Generate name based on existing world context" position="top">
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        setIsGeneratingRegionName(true);
                                                        const response = await fetch('/api/arkyv/generate-region-name', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                existingRegions: regionsList.map(r => r.label)
                                                            })
                                                        });
                                                        if (!response.ok) throw new Error('Failed to generate region name');
                                                        const data = await response.json();
                                                        setEditRegion(prev => ({ ...prev, display_name: data.name }));
                                                    } catch (err) {
                                                        console.error('Failed to generate region name:', err);
                                                        alert('Failed to generate region name');
                                                    } finally {
                                                        setIsGeneratingRegionName(false);
                                                    }
                                                }}
                                                disabled={isGeneratingRegionName}
                                                className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isGeneratingRegionName ? '✨ Suggesting...' : '✨ Suggest'}
                                            </button>
                                        </Tooltip>
                                    </div>
                                    <input
                                        type="text"
                                        value={editRegion.display_name}
                                        onChange={(e) => setEditRegion(prev => ({ ...prev, display_name: e.target.value }))}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case"
                                        placeholder="e.g., Neon District"
                                        maxLength={100}
                                    />
                                    <span className="text-[0.6rem] text-slate-500">
                                        {editRegion.display_name.length}/100 characters
                                    </span>
                                </label>
                                
                                {/* Description */}
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            Description
                                            <span className="relative inline-block group">
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                    ?
                                                </span>
                                                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block w-72 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                    <span className="block mb-2">
                                                        <strong className="text-cyan-300">Region Description</strong> sets the mood and atmosphere for all rooms in this region.
                                                    </span>
                                                    <span className="block mb-2">
                                                        When using AI to generate adjacent rooms, this description influences the style and theme of new rooms.
                                                    </span>
                                                    <span className="block mb-2">
                                                        Also influences the visual style of NPC profile pics and room images (if enabled), helping maintain visual consistency across the zone.
                                                    </span>
                                                    <span className="block">
                                                        Think of it as the "DNA" that shapes everything in this region.
                                                    </span>
                                                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-cyan-400/40"></span>
                                                </span>
                                            </span>
                                        </span>
                                        <div className="flex gap-2">
                                            {editRegion.display_name && (
                                                <Tooltip content="Generate description based on region name" position="top">
                                                    <button
                                                        type="button"
                                                        onClick={handleSuggestDescriptionForEdit}
                                                        disabled={isGeneratingDescription !== null}
                                                        className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isGeneratingDescription === 'suggest' ? '✨ Suggesting...' : '✨ Suggest'}
                                                    </button>
                                                </Tooltip>
                                            )}
                                            <Tooltip content="Refine and improve the existing description" position="top">
                                                <button
                                                    type="button"
                                                    onClick={() => handleGenerateDescriptionForEdit('refine')}
                                                    disabled={isGeneratingDescription !== null}
                                                    className="px-3 py-1 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-pink-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isGeneratingDescription === 'refine' ? '✨ Refining...' : '✨ Refine'}
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <textarea
                                        value={editRegion.description}
                                        onChange={(e) => setEditRegion(prev => ({ ...prev, description: e.target.value }))}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case min-h-[120px]"
                                        placeholder="Describe the theme, atmosphere, and character of this region..."
                                        maxLength={3500}
                                    />
                                    <span className="text-[0.6rem] text-slate-500">
                                        {editRegion.description.length}/3500 characters (~500 words)
                                    </span>
                                </label>
                                
                                {/* Color Scheme */}
                                <div className="pt-4 border-t border-slate-700/50">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-xs uppercase tracking-[0.25em] text-slate-400">
                                            Color Scheme
                                        </h4>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleGenerateColorsForEdit('random')}
                                                disabled={isGeneratingColors !== null}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-purple-200 transition disabled:opacity-50"
                                            >
                                                {isGeneratingColors === 'random' ? '🎨 ...' : '🎨 Random'}
                                            </button>
                                            {(editRegion.display_name || editRegion.description) && (
                                                <Tooltip content="Generate colors based on region theme" position="top">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleGenerateColorsForEdit('suggest')}
                                                        disabled={isGeneratingColors !== null}
                                                        className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50"
                                                    >
                                                        {isGeneratingColors === 'suggest' ? '✨ Suggesting...' : '✨ Suggest'}
                                                    </button>
                                                </Tooltip>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleGenerateColorsForEdit('complementary')}
                                                disabled={isGeneratingColors !== null}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-purple-200 transition disabled:opacity-50"
                                            >
                                                {isGeneratingColors === 'complementary' ? '🎨 ...' : '🎨 Complement'}
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 gap-4">
                                        {/* Border Color */}
                                        <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
                                            <input
                                                type="color"
                                                value={editRegion.borderColor}
                                                onChange={(e) => setEditRegion(prev => ({ ...prev, borderColor: e.target.value }))}
                                                className="w-12 h-12 rounded cursor-pointer"
                                            />
                                            <div className="flex-1">
                                                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                                    Border Color
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editRegion.borderColor}
                                                    onChange={(e) => setEditRegion(prev => ({ ...prev, borderColor: e.target.value }))}
                                                    className="w-full mt-1 bg-slate-900 border border-slate-600/60 rounded px-2 py-1 text-xs text-slate-100 font-mono"
                                                />
                                            </div>
                                        </div>
                                        
                                        {/* Font Color */}
                                        <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
                                            <input
                                                type="color"
                                                value={editRegion.fontColor}
                                                onChange={(e) => setEditRegion(prev => ({ ...prev, fontColor: e.target.value }))}
                                                className="w-12 h-12 rounded cursor-pointer"
                                            />
                                            <div className="flex-1">
                                                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                                    Font Color
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editRegion.fontColor}
                                                    onChange={(e) => setEditRegion(prev => ({ ...prev, fontColor: e.target.value }))}
                                                    className="w-full mt-1 bg-slate-900 border border-slate-600/60 rounded px-2 py-1 text-xs text-slate-100 font-mono"
                                                />
                                            </div>
                                        </div>
                                        
                                        {/* Accent Color */}
                                        <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
                                            <div className="w-12 h-12 rounded border border-slate-600" style={{ background: editRegion.accent }}></div>
                                            <div className="flex-1">
                                                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                                    Accent (rgba format)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editRegion.accent}
                                                    onChange={(e) => setEditRegion(prev => ({ ...prev, accent: e.target.value }))}
                                                    className="w-full mt-1 bg-slate-900 border border-slate-600/60 rounded px-2 py-1 text-xs text-slate-100 font-mono"
                                                    placeholder="rgba(56, 189, 248, 0.14)"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Preview */}
                                    <div className="mt-4 p-4 bg-slate-800/50 border rounded-lg" style={{ 
                                        borderColor: editRegion.borderColor,
                                        boxShadow: `0 0 12px ${editRegion.accent}`
                                    }}>
                                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Preview</div>
                                        <div className="font-terminal tracking-[0.2em] uppercase" style={{ color: editRegion.fontColor }}>
                                            {editRegion.display_name || 'Region Name'}
                                        </div>
                                        <div className="text-xs mt-1" style={{ color: editRegion.borderColor }}>
                                            Border & Edges
                                        </div>
                                    </div>
                                </div>
                            </div>
                            </div>
                            
                            <div className="p-8 pt-4 border-t border-slate-700/50">
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleUpdateRegion}
                                        disabled={isUpdatingRegion || !editRegion.display_name || !editRegion.description}
                                        className="flex-1 text-sm font-terminal uppercase tracking-[0.3em] text-cyan-100 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded-lg px-6 py-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isUpdatingRegion ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeRegionDialog}
                                    className="text-sm font-terminal uppercase tracking-[0.3em] text-slate-400 border border-slate-600 rounded-lg px-6 py-3 hover:bg-slate-800/40 transition"
                                >
                                    Cancel
                                </button>
                            </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {isCreatingRoom && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm pointer-events-none">
                        <div className="bg-slate-900 border border-cyan-400/40 rounded-xl shadow-xl shadow-cyan-400/20 px-8 py-6 flex items-center gap-4">
                            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                            <p className="font-terminal text-sm tracking-[0.35em] uppercase text-cyan-200">
                                {showCreateDialog ? 'Generating Room...' : 'Creating Room...'}
                            </p>
                        </div>
                    </div>
                )}
                
                {/* Context Menu */}
                {contextMenu && (
                    <div
                        className="fixed z-50 bg-slate-900 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 py-2 min-w-[180px]"
                        style={{
                            left: `${contextMenu.x}px`,
                            top: `${contextMenu.y}px`,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={handleCreateStandaloneRoom}
                            className="w-full px-4 py-2 text-left text-sm font-terminal uppercase tracking-[0.25em] text-cyan-200 hover:bg-cyan-400/10 transition flex items-center gap-2"
                        >
                            <span className="text-cyan-400">+</span>
                            Create New Room
                        </button>
                    </div>
                )}
                
                {isDialogOpen && activeRoom ? (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onMouseDown={handleOverlayMouseDown}>
                        <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-cyan-400/40 rounded-2xl shadow-[0_30px_70px_rgba(14,165,233,0.2)] font-terminal text-sm text-slate-200" onMouseDown={(e) => e.stopPropagation()}>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-4 p-8 pb-4">
                                <div className="flex-1">
                                    <p className="text-xs uppercase tracking-[0.35em] text-cyan-400">Room Editor</p>
                                    <h3 className="text-lg uppercase tracking-[0.3em] text-cyan-100 mt-2">
                                        {editRoom?.name ?? 'Unnamed Room'}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-3">
                                        <span className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">UUID:</span>
                                        <code className="text-[0.65rem] text-slate-400 font-mono bg-slate-800/50 px-2 py-1 rounded border border-slate-700/50">
                                            {activeRoom?.id}
                                        </code>
                                        <Tooltip content="Copy UUID to clipboard" position="top">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    navigator.clipboard.writeText(activeRoom?.id || '');
                                                    // Show a brief "Copied!" feedback
                                                    const btn = e.currentTarget;
                                                    const originalText = btn.textContent;
                                                    btn.textContent = '✓';
                                                    setTimeout(() => {
                                                        btn.textContent = originalText;
                                                    }, 1000);
                                                }}
                                                className="text-[0.6rem] uppercase tracking-[0.2em] text-cyan-300 hover:text-cyan-200 border border-cyan-500/40 hover:border-cyan-400/60 rounded px-2 py-0.5 transition hover:bg-cyan-500/10"
                                            >
                                                Copy
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeDialog}
                                    aria-label="Close"
                                    className="text-xs uppercase tracking-[0.3em] text-slate-300 border border-slate-500 rounded-md px-3 py-1 hover:bg-slate-700/40 hover:text-white transition"
                                >
                                    Close
                                </button>
                            </div>

                            {/* Scrollable Content */}
                            <div ref={dialogContentRef} className="flex-1 overflow-y-auto px-8 space-y-5">
                            {saveError ? (
                                <div className="text-[0.7rem] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                                    {saveError}
                                </div>
                            ) : null}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <div className="flex items-center justify-between">
                                        <span>Room Name</span>
                                        <div className="flex items-center gap-2">
                                            <Tooltip content="Generate a name based on description and region" position="top">
                                                <button
                                                    type="button"
                                                    onClick={handleEditGenerateRoomName}
                                                    disabled={isEditGeneratingRoomName}
                                                    className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isEditGeneratingRoomName ? '✨ Suggesting...' : '✨ Suggest'}
                                                </button>
                                            </Tooltip>
                                            <span className={`text-[0.65rem] ${(editRoom?.name?.length ?? 0) > 30 ? 'text-rose-400' : 'text-slate-500'}`}>
                                                {editRoom?.name?.length ?? 0}/30
                                            </span>
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={editRoom?.name ?? ''}
                                        onChange={(e) => updateEditField('name', e.target.value)}
                                        maxLength={30}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 capitalize"
                                    />
                                </label>
                                <label className="mt-2 flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    Region
                                    <select
                                        value={(() => {
                                            const currentRegion = editRoom?.region;
                                            // Check if current region exists in the list, otherwise use first available
                                            const isValid = currentRegion && regionsList.some(r => r.key === currentRegion);
                                            return isValid ? currentRegion : (regionsList[0]?.key ?? 'unknown');
                                        })()}
                                        onChange={(e) => updateEditField('region', e.target.value)}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 capitalize"
                                    >
                                        {regionsList.map((r) => (
                                            <option key={r.key} value={r.key}>{r.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400 sm:col-span-2">
                                    <div className="flex items-center justify-between">
                                        <span>Description</span>
                                        <div className="flex items-center gap-2">
                                            {editRoom?.name && (
                                                <Tooltip content="Generate description based on room name and region" position="top">
                                                    <button
                                                        type="button"
                                                        onClick={handleEditSuggestRoomDescription}
                                                        disabled={editDescriptionOperation !== null}
                                                        className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-cyan-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {editDescriptionOperation === 'suggest' ? '✨ Suggesting...' : '✨ Suggest'}
                                                    </button>
                                                </Tooltip>
                                            )}
                                            {editRoom?.description && editRoom?.description !== 'A newly created space waiting to be described.' && (
                                                <Tooltip content="Refine and improve the existing description" position="top">
                                                    <button
                                                        type="button"
                                                        onClick={handleEditRefineRoomDescription}
                                                        disabled={editDescriptionOperation !== null}
                                                        className="px-3 py-1 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400/50 rounded text-[0.65rem] tracking-[0.2em] uppercase text-pink-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {editDescriptionOperation === 'refine' ? '✨ Refining...' : '✨ Refine'}
                                                    </button>
                                                </Tooltip>
                                            )}
                                            <span className={`text-[0.65rem] ${(editRoom?.description?.length ?? 0) > 3000 ? 'text-rose-400' : 'text-slate-500'}`}>
                                                {editRoom?.description?.length ?? 0}/3000
                                            </span>
                                        </div>
                                    </div>
                                    <textarea
                                        value={editRoom?.description ?? ''}
                                        onChange={(e) => updateEditField('description', e.target.value)}
                                        maxLength={3000}
                                        rows={4}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 leading-relaxed"
                                    />
                                </label>
                                
                                {/* Room Image Generation */}
                                <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400 sm:col-span-2">
                                    <span>Room Image</span>
                                    <div className="bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2">
                                        {activeRoom?.image_url && (
                                            <div className="mb-3">
                                                <img 
                                                    src={activeRoom.image_url} 
                                                    alt={editRoom?.name || 'Room preview'}
                                                    className="w-full rounded border border-slate-700/50"
                                                    style={{ aspectRatio: '16/9' }}
                                                />
                                            </div>
                                        )}
                                        <label className="flex items-center gap-2 mb-3 text-[0.65rem] text-slate-400 cursor-pointer hover:text-purple-300 transition">
                                            <input
                                                type="checkbox"
                                                checked={includeRegionInPrompt}
                                                onChange={(e) => setIncludeRegionInPrompt(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-2 focus:ring-purple-400/50"
                                            />
                                            <span className="uppercase tracking-[0.2em]">Include region mood/style</span>
                                            <span className="text-[0.6rem] text-purple-300/70">(Better atmosphere)</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleGenerateRoomImage}
                                            disabled={generatingRoomImages[activeRoom?.id] || !editRoom?.description}
                                            className="w-full px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.7rem] tracking-[0.2em] uppercase text-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            title={editRoom?.description ? (activeRoom?.image_url ? 'Regenerate image (costs credits)' : 'Generate a pixel art image based on room description') : 'Add a description first'}
                                        >
                                            {generatingRoomImages[activeRoom?.id] ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-purple-300 border-t-transparent rounded-full animate-spin"></div>
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    🎨 {activeRoom?.image_url ? 'Regenerate Image' : 'Generate Image'} {rdCredits !== null ? `(2 Credits / ${rdCredits} Left)` : '(2 Credits)'}
                                                </>
                                            )}
                                        </button>
                                        {roomImageSuccesses[activeRoom?.id] && (
                                            <div className="mt-2 text-[0.65rem] text-green-300 bg-green-500/10 border border-green-500/30 rounded px-2 py-1">
                                                {roomImageSuccesses[activeRoom?.id]}
                                            </div>
                                        )}
                                        {roomImageErrors[activeRoom?.id] && (
                                            <div className="mt-2 text-[0.65rem] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1">
                                                {roomImageErrors[activeRoom?.id]}
                                            </div>
                                        )}
                                        {!editRoom?.description && (
                                            <div className="mt-2 text-[0.65rem] text-amber-300/70">
                                                Add a room description to generate an image
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400 sm:col-span-2">
                                    Exits
                                    <div className="bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 space-y-2">
                                        {STANDARD_DIRECTIONS.map((direction) => {
                                            const existingExit = (activeRoom.exits ?? []).find(e => e.verb === direction);
                                            const isActive = activeExitDirection === direction;
                                            const searchTerm = exitRoomSearch[direction] || '';
                                            const selectedRoomId = exitRoomSelection[direction] || '';
                                            const isVerticalDirection = direction === 'up' || direction === 'down';
                                            
                                            // Filter rooms for dropdown (exclude current room)
                                            const availableRooms = allRooms
                                                .filter(room => room.id !== editRoom?.id)
                                                .filter(room => {
                                                    if (!searchTerm) return true;
                                                    const search = searchTerm.toLowerCase();
                                                    return (
                                                        room.name?.toLowerCase().includes(search) ||
                                                        room.region?.toLowerCase().includes(search) ||
                                                        room.region_name?.toLowerCase().includes(search)
                                                    );
                                                });
                                            
                                            return (
                                                <div key={direction} className="flex items-center gap-2 relative">
                                                    <span className="text-[0.65rem] font-terminal uppercase tracking-[0.3em] text-slate-400 w-20 flex-shrink-0">
                                                        {direction}
                                                    </span>
                                                    
                                                    {existingExit ? (
                                                        // Existing exit - show room name and delete button
                                                        <div className="flex-1 flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                                    setActiveRoom(existingExit.targetRoom ?? null);
                                                                    setEditRoom(existingExit.targetRoom ? { 
                                                                        id: existingExit.targetRoom.id, 
                                                                        name: existingExit.targetRoom.name ?? '', 
                                                                        description: existingExit.targetRoom.description ?? '', 
                                                                        region: existingExit.targetRoom.region_name ?? existingExit.targetRoom.region ?? 'Unknown' 
                                                                    } : null);
                                                                    if (existingExit.targetRoom) {
                                                            setIsDirty(false);
                                                            setSaveError('');
                                                            // Scroll to top of dialog
                                                            if (dialogContentRef.current) {
                                                                dialogContentRef.current.scrollTop = 0;
                                                            }
                                                                    } else {
                                                                        setIsDialogOpen(false);
                                                        }
                                                    }}
                                                                className="flex-1 text-left text-[0.65rem] font-terminal text-cyan-200 border border-cyan-400/30 rounded-md px-2 py-1 hover:bg-cyan-400/10 transition"
                                                >
                                                                → {existingExit.targetRoom?.name ?? existingExit.to_room}
                                                </button>
                                                            <Tooltip content="Delete exit (choose one-way or bidirectional)" position="left">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteExit(direction, existingExit.to_room, existingExit.targetRoom?.name ?? existingExit.to_room)}
                                                                    disabled={isDeletingExit}
                                                                    className="text-[0.65rem] px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 rounded text-rose-300 transition disabled:opacity-50"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </Tooltip>
                                                        </div>
                                                    ) : isVerticalDirection ? (
                                                        // Up/Down - show "Create New Room" button
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setPendingVerticalExit({ direction, fromRoomId: editRoom.id });
                                                                setShowCreateDialog(true);
                                                            }}
                                                            className="flex-1 text-left text-[0.65rem] font-terminal text-purple-400 border border-purple-400/40 rounded-md px-2 py-1 hover:bg-purple-400/10 hover:text-purple-300 hover:border-purple-400/60 transition"
                                                        >
                                                            + Create new room {direction}...
                                                        </button>
                                                    ) : (
                                                        // Other directions - show placeholder button
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveExitDirection(direction)}
                                                            className="flex-1 text-left text-[0.65rem] font-terminal text-slate-500 border border-slate-600/40 rounded-md px-2 py-1 hover:bg-slate-700/30 hover:text-slate-400 hover:border-slate-500/60 transition"
                                                        >
                                                            Click to connect...
                                                        </button>
                                                    )}
                                                    
                                                    {/* Floating dropdown - only for non-vertical directions */}
                                                    {isActive && !isVerticalDirection && (
                                                        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-900 border border-cyan-400/40 rounded-lg shadow-2xl shadow-cyan-400/20 p-3">
                                                            <input
                                                                type="text"
                                                                placeholder="Search rooms..."
                                                                value={searchTerm}
                                                                onChange={(e) => setExitRoomSearch(prev => ({ ...prev, [direction]: e.target.value }))}
                                                                autoFocus
                                                                className="w-full text-[0.65rem] bg-slate-800/70 border border-slate-600/60 rounded px-2 py-1.5 text-slate-300 placeholder:text-slate-500 mb-2"
                                                            />
                                                            <select
                                                                value={selectedRoomId}
                                                                onChange={(e) => setExitRoomSelection(prev => ({ ...prev, [direction]: e.target.value }))}
                                                                disabled={isCreatingExit}
                                                                className="w-full text-[0.65rem] bg-slate-800/70 border border-slate-600/60 rounded px-2 py-1 text-slate-300 mb-3"
                                                                size={6}
                                                            >
                                                                <option value="">Select room to connect...</option>
                                                                {availableRooms.map(room => (
                                                                    <option key={room.id} value={room.id}>
                                                                        {room.name} ({room.region_name || room.region || 'Unknown'})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <label className="flex items-center gap-2 mb-2 text-[0.65rem] text-slate-400 cursor-pointer hover:text-amber-300 transition">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isOneWayExit}
                                                                    onChange={(e) => setIsOneWayExit(e.target.checked)}
                                                                    className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-2 focus:ring-amber-400/50"
                                                                />
                                                                <span className="uppercase tracking-[0.2em]">One-way exit?</span>
                                                                <span className="text-[0.6rem] text-amber-300/70">(No return)</span>
                                                            </label>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCreateExit(direction, selectedRoomId)}
                                                                    disabled={!selectedRoomId || isCreatingExit}
                                                                    className="flex-1 text-[0.65rem] px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-400/50 rounded text-green-300 transition disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider"
                                                                >
                                                                    {isCreatingExit ? 'Creating...' : `✓ Create ${isOneWayExit ? 'Exit' : 'Exits'}`}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setActiveExitDirection(null);
                                                                        setExitRoomSearch(prev => ({ ...prev, [direction]: '' }));
                                                                        setExitRoomSelection(prev => ({ ...prev, [direction]: '' }));
                                                                        setIsOneWayExit(false);
                                                                    }}
                                                                    className="text-[0.65rem] px-3 py-1.5 bg-slate-500/20 hover:bg-slate-500/30 border border-slate-400/50 rounded text-slate-300 transition uppercase tracking-wider"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    </div>
                                    
                                    {/* NPCs in this Room */}
                                    <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400 sm:col-span-2 mb-2">
                                        NPCs in this Room
                                        <div className="bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2">
                                            {(() => {
                                                const roomNpcs = npcs.filter(npc => npc.current_room === activeRoom?.id);
                                                
                                                if (roomNpcs.length === 0) {
                                                    return (
                                                        <div className="text-slate-500 text-[0.7rem] py-2 normal-case tracking-normal">
                                                            No NPCs in this room
                                                        </div>
                                                    );
                                                }
                                                
                                                return (
                                                    <div className="space-y-2">
                                                        {roomNpcs.map((npc) => (
                                                            <button
                                                                key={npc.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    openNpcDialog(npc);
                                                                }}
                                                                className="w-full text-left flex items-center gap-3 px-3 py-2 bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/40 hover:border-cyan-500/50 rounded transition group"
                                                            >
                                                                {/* NPC Portrait or Placeholder */}
                                                                {npc.portrait_url ? (
                                                                    <img 
                                                                        src={npc.portrait_url}
                                                                        alt={`${npc.name} portrait`}
                                                                        className="w-12 h-12 rounded border-2 border-purple-400/50 flex-shrink-0 group-hover:border-cyan-400/50 transition"
                                                                        style={{ imageRendering: 'pixelated' }}
                                                                    />
                                                                ) : (
                                                                    <div className="w-12 h-12 flex items-center justify-center rounded border-2 border-purple-400/30 bg-slate-800/50 flex-shrink-0 group-hover:border-cyan-400/30 transition">
                                                                        <span className="text-2xl text-purple-400/30 font-terminal">?</span>
                                                                    </div>
                                                                )}
                                                                
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-cyan-300 group-hover:text-cyan-200 text-[0.7rem] font-semibold uppercase tracking-wider truncate">
                                                                        {npc.name}
                                                                    </div>
                                                                    {npc.alias && (
                                                                        <div className="text-slate-400 text-[0.65rem] normal-case tracking-normal mt-0.5">
                                                                            aka {npc.alias}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="text-[0.65rem] text-slate-400 group-hover:text-cyan-400 transition">
                                                                    Edit →
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Sticky Footer */}
                            <div className="flex justify-between items-center gap-3 p-8 pt-4 border-t border-slate-700/50 bg-slate-900">
                                <div className="flex items-center gap-3">
                                {/* Hide delete button for protected system rooms */}
                                {!['e58caed0-8268-419e-abe8-faa3833a1de6', 'a1b2c3d4-5678-90ab-cdef-123456789abc'].includes(editRoom?.id) && (
                                <button
                                    type="button"
                                    onClick={openDeleteDialog}
                                    className="text-xs uppercase tracking-[0.3em] rounded-md px-4 py-2 transition border text-rose-400 border-rose-500/60 hover:bg-rose-500/10"
                                >
                                    Delete Room
                                </button>
                                )}
                                    <button
                                        type="button"
                                        onClick={() => handleAddNpcToRoom(editRoom?.id)}
                                        className="text-xs uppercase tracking-[0.3em] rounded-md px-4 py-2 transition border text-cyan-400 border-cyan-500/60 hover:bg-cyan-500/10"
                                    >
                                        + Add NPC
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSaveChanges}
                                    disabled={!isDirty || saving || saveSuccess}
                                    className={`text-xs uppercase tracking-[0.3em] rounded-md px-4 py-2 transition border ${
                                        saveSuccess 
                                            ? 'text-green-400 border-green-400/60 cursor-not-allowed' 
                                            : isDirty && !saving 
                                                ? 'text-hot-pink border-hot-pink/60 hover:bg-hot-pink/10' 
                                                : 'text-slate-400 border-slate-600 cursor-not-allowed'
                                    }`}
                                >
                                    {saveSuccess ? 'Changes Saved!' : saving ? 'Saving…' : isDirty ? 'Save Changes' : 'No Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
                {isDeleteDialogOpen && editRoom ? (
                    <div 
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm"
                        onMouseDown={(e) => {
                            if (e.currentTarget === e.target && !isDeleting) {
                                closeDeleteDialog();
                            }
                        }}
                    >
                        <div 
                            className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl shadow-[0_30px_70px_rgba(244,63,94,0.3)] p-8 space-y-5 font-terminal text-sm text-slate-200"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div>
                                <p className="text-xs uppercase tracking-[0.35em] text-rose-400">⚠️ Delete Room</p>
                                <h3 className="text-lg uppercase tracking-[0.3em] text-rose-300 mt-2">
                                    Confirm Deletion
                                </h3>
                            </div>

                            <div className="space-y-3">
                                <p className="text-sm text-slate-300 leading-relaxed">
                                    You are about to permanently delete the room <span className="text-cyan-300 font-semibold">"{editRoom.name}"</span>.
                                </p>
                                <p className="text-sm text-rose-300 leading-relaxed">
                                    This action cannot be undone. All exits connected to this room will also be deleted.
                                </p>
                            </div>

                            {deleteError ? (
                                <div className="text-[0.7rem] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                                    {deleteError}
                                </div>
                            ) : null}

                            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                Type the room name to confirm: <span className="text-cyan-300 font-semibold normal-case tracking-normal">"{editRoom.name}"</span>
                                <input
                                    type="text"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    placeholder="Type room name here"
                                    className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case tracking-normal"
                                    autoFocus
                                />
                            </label>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeDeleteDialog}
                                    disabled={isDeleting}
                                    className="text-xs uppercase tracking-[0.3em] text-slate-300 border border-slate-500 rounded-md px-4 py-2 hover:bg-slate-700/40 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteRoom}
                                    disabled={isDeleting || deleteConfirmText.trim() !== editRoom.name.trim()}
                                    className={`text-xs uppercase tracking-[0.3em] rounded-md px-4 py-2 transition border ${
                                        !isDeleting && deleteConfirmText.trim() === editRoom.name.trim()
                                            ? 'text-rose-400 border-rose-500/60 hover:bg-rose-500/20'
                                            : 'text-slate-400 border-slate-600 cursor-not-allowed'
                                    }`}
                                >
                                    {isDeleting ? 'Deleting…' : 'Delete Room'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Delete Exit Confirmation Dialog */}
                {deleteExitConfirm ? (
                    <div 
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm"
                        onMouseDown={(e) => {
                            if (e.currentTarget === e.target && !isDeletingExit) {
                                setDeleteExitConfirm(null);
                                setDeleteOnlyOneDirection(false);
                            }
                        }}
                    >
                        <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl shadow-[0_30px_70px_rgba(244,63,94,0.3)] p-8 space-y-5 font-terminal text-sm text-slate-200">
                            <div>
                                <p className="text-xs uppercase tracking-[0.35em] text-rose-400">⚠️ Delete {deleteExitConfirm.isEdgeDelete ? 'Connection' : 'Exit'}</p>
                                <h3 className="text-lg uppercase tracking-[0.3em] text-rose-300 mt-2">
                                    Confirm Deletion
                                </h3>
                            </div>

                            <div className="space-y-3">
                                {deleteExitConfirm.isEdgeDelete ? (
                                    <>
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            Delete the connection between <span className="text-cyan-300 font-semibold">"{deleteExitConfirm.targetRoomName}"</span>?
                                        </p>
                                        <p className="text-sm text-rose-300 leading-relaxed">
                                            This will remove all exits between these rooms (bidirectional).
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            Delete <span className="text-cyan-300 font-semibold uppercase">{deleteExitConfirm.direction}</span> exit to <span className="text-cyan-300 font-semibold">"{deleteExitConfirm.targetRoomName}"</span>?
                                        </p>
                                        {!deleteOnlyOneDirection && (
                                            <p className="text-sm text-rose-300 leading-relaxed">
                                                This will also remove the return path (bidirectional exit).
                                            </p>
                                        )}
                                        {deleteOnlyOneDirection && (
                                            <p className="text-sm text-amber-300 leading-relaxed">
                                                Only the <span className="font-semibold uppercase">{deleteExitConfirm.direction}</span> exit will be removed. The return path will remain.
                                            </p>
                                        )}
                                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-amber-300 transition mt-2 p-3 bg-slate-800/50 rounded border border-slate-700/50">
                                            <input
                                                type="checkbox"
                                                checked={deleteOnlyOneDirection}
                                                onChange={(e) => setDeleteOnlyOneDirection(e.target.checked)}
                                                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-2 focus:ring-amber-400/50"
                                            />
                                            <div className="flex-1">
                                                <div className="uppercase tracking-[0.2em]">Delete only this direction</div>
                                                <div className="text-[0.65rem] text-amber-300/70 mt-0.5">Keep the return path intact</div>
                                            </div>
                                        </label>
                                    </>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDeleteExitConfirm(null);
                                        setDeleteOnlyOneDirection(false);
                                    }}
                                    disabled={isDeletingExit}
                                    className="text-xs uppercase tracking-[0.3em] text-slate-300 border border-slate-500 rounded-md px-4 py-2 hover:bg-slate-700/40 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDeleteExit}
                                    disabled={isDeletingExit}
                                    className="text-xs uppercase tracking-[0.3em] rounded-md px-4 py-2 transition border text-rose-400 border-rose-500/60 hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isDeletingExit ? 'Deleting…' : `Delete ${deleteExitConfirm.isEdgeDelete ? 'Connection' : deleteOnlyOneDirection ? 'Exit' : 'Exits'}`}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
                {isNpcDialogOpen && activeNpc && editNpc ? (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onMouseDown={(e) => {
                        if (e.currentTarget === e.target) {
                            closeNpcDialog();
                        }
                    }}>
                        <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-cyan-400/40 rounded-2xl shadow-[0_30px_70px_rgba(14,165,233,0.2)] font-terminal text-sm text-slate-200" onMouseDown={(e) => e.stopPropagation()}>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-4 p-8 pb-4">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.35em] text-cyan-400">NPC Editor</p>
                                    <h3 className="text-lg uppercase tracking-[0.3em] text-cyan-100 mt-2">
                                        {editNpc?.name ?? 'Unnamed NPC'}
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeNpcDialog}
                                    aria-label="Close"
                                    className="text-xs uppercase tracking-[0.3em] text-slate-300 border border-slate-500 rounded-md px-3 py-1 hover:bg-slate-700/40 hover:text-white transition"
                                >
                                    Close
                                </button>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto px-8 space-y-5 mb-2">
                            {npcSaveError ? (
                                <div className="text-[0.7rem] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                                    {npcSaveError}
                                </div>
                            ) : null}

                            {/* NPC Portrait Section */}
                            <div className="p-4 bg-slate-800/50 border border-purple-400/30 rounded-lg">
                                <div className="flex items-start gap-4">
                                    {activeNpc?.portrait_url ? (
                                        <img 
                                            src={activeNpc.portrait_url} 
                                            alt={`${editNpc?.name} portrait`}
                                            className="w-32 h-32 object-cover rounded-lg border-2 border-purple-400/60 shadow-lg shadow-purple-400/30 flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-32 h-32 flex items-center justify-center rounded-lg border-2 border-purple-400/40 bg-slate-900/50 flex-shrink-0">
                                            <span className="text-6xl text-purple-400/40 font-terminal">?</span>
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs uppercase tracking-[0.2em] text-purple-300 mb-2">🎨 NPC Portrait</p>
                                        <label className="flex items-center gap-2 text-[0.7rem] text-slate-300 mb-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={includeRegionInNpcPortrait}
                                                onChange={(e) => setIncludeRegionInNpcPortrait(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-2 focus:ring-purple-400/50"
                                            />
                                            <span className="uppercase tracking-[0.2em]">Include region atmosphere</span>
                                            <span className="text-[0.6rem] text-purple-300/70">(Better thematic fit)</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleGenerateNpcPortrait}
                                            disabled={generatingNpcPortraits[activeNpc?.id] || !editNpc?.description}
                                            className="w-full px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.7rem] tracking-[0.2em] uppercase text-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            title={editNpc?.description ? (activeNpc?.portrait_url ? 'Regenerate portrait (costs 2 credits)' : 'Generate a pixel art portrait based on NPC description') : 'Add a description first'}
                                        >
                                            {generatingNpcPortraits[activeNpc?.id] ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-purple-300 border-t-transparent rounded-full animate-spin"></div>
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    🎨 {activeNpc?.portrait_url ? 'Regenerate Portrait' : 'Generate Portrait'} {rdCredits !== null ? `(2 Credits / ${rdCredits} Left)` : '(2 Credits)'}
                                                </>
                                            )}
                                        </button>
                                        {npcPortraitSuccesses[activeNpc?.id] && (
                                            <div className="mt-2 text-[0.65rem] text-green-300 bg-green-500/10 border border-green-500/30 rounded px-2 py-1">
                                                {npcPortraitSuccesses[activeNpc?.id]}
                                            </div>
                                        )}
                                        {npcPortraitErrors[activeNpc?.id] && (
                                            <div className="mt-2 text-[0.65rem] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1">
                                                {npcPortraitErrors[activeNpc?.id]}
                                            </div>
                                        )}
                                        {!editNpc?.description && (
                                            <div className="mt-2 text-[0.65rem] text-amber-300/70">
                                                Add an NPC description to generate a portrait
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <span className="flex items-center justify-between">
                                        <span>NPC Name</span>
                                        <span className={`text-[0.65rem] ${(editNpc?.name?.length ?? 0) > 50 ? 'text-rose-400' : 'text-slate-500'}`}>
                                            {editNpc?.name?.length ?? 0}/50
                                        </span>
                                    </span>
                                    <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={editNpc?.name ?? ''}
                                        onChange={(e) => updateNpcField('name', e.target.value)}
                                        maxLength={50}
                                            className="font-sans flex-1 bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100"
                                        />
                                        <Tooltip content="Generate name and alias based on room context" position="top">
                                            <button
                                                type="button"
                                                onClick={handleGenerateEditNpcName}
                                                disabled={isGeneratingNpcName || !editNpc.current_room}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                            >
                                                {isGeneratingNpcName ? '✨ Suggesting...' : '✨ Suggest'}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <span className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            Alias
                                            <span className="relative inline-block group">
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                    ?
                                                </span>
                                                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block w-64 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                    <span className="block mb-2">
                                                        <strong className="text-cyan-300">Alias</strong> lets players initiate conversations using a shorter or alternative name.
                                                    </span>
                                                    <span className="block">
                                                        Players type: <code className="text-pink-300 bg-slate-900/50 px-1 py-0.5 rounded">talk &lt;alias&gt;</code> to start talking with this NPC.
                                                    </span>
                                                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-cyan-400/40"></span>
                                                </span>
                                            </span>
                                        </span>
                                        <span className={`text-[0.65rem] ${(editNpc?.alias?.length ?? 0) > 50 ? 'text-rose-400' : 'text-slate-500'}`}>
                                            {editNpc?.alias?.length ?? 0}/50
                                        </span>
                                    </span>
                                    <input
                                        type="text"
                                        value={editNpc?.alias ?? ''}
                                        onChange={(e) => updateNpcField('alias', e.target.value)}
                                        maxLength={50}
                                        placeholder="Alternative name..."
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-500"
                                    />
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400 md:col-span-2">
                                    <span className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            Description
                                            <span className="relative inline-block group">
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                    ?
                                                </span>
                                                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                    <span className="block mb-2">
                                                        <strong className="text-cyan-300">Physical Description</strong> - what the NPC looks like and their appearance.
                                                    </span>
                                                    <span className="block mb-2">
                                                        Players use <code className="text-pink-300 bg-slate-900/50 px-1 py-0.5 rounded">inspect &lt;alias&gt;</code> to read this description.
                                                    </span>
                                                    <span className="block">
                                                        Also used to generate the NPC's profile picture above.
                                                    </span>
                                                    <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-cyan-400/40"></span>
                                                </span>
                                            </span>
                                        </span>
                                        <span className={`text-[0.65rem] ${(editNpc?.description?.length ?? 0) > 500 ? 'text-rose-400' : 'text-slate-500'}`}>
                                            {editNpc?.description?.length ?? 0}/500
                                        </span>
                                    </span>
                                    <textarea
                                        value={editNpc?.description ?? ''}
                                        onChange={(e) => updateNpcField('description', e.target.value)}
                                        maxLength={500}
                                        rows={3}
                                        placeholder="Physical description..."
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 leading-relaxed placeholder:text-slate-500"
                                    />
                                    <div className="flex gap-2">
                                        <Tooltip content="Generate description based on NPC name and location" position="top">
                                            <button
                                                type="button"
                                                onClick={handleSuggestEditNpcDescription}
                                                disabled={isSuggestingNpcDescription || !editNpc.current_room || !editNpc.name}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSuggestingNpcDescription ? '✨ Suggesting...' : '✨ Suggest'}
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Refine and improve the existing description" position="top">
                                            <button
                                                type="button"
                                                onClick={handleRefineEditNpcDescription}
                                                disabled={isRefiningNpcDescription || !editNpc.description || !editNpc.current_room}
                                                className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isRefiningNpcDescription ? '✨ Refining...' : '✨ Refine'}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <span className="flex items-center gap-2">
                                        Greeting Behavior
                                        <span className="relative inline-block group">
                                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                ?
                                            </span>
                                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                <span className="block mb-2">
                                                    <strong className="text-slate-400">None:</strong> <span className="text-slate-300">No greeting behavior</span>
                                                </span>
                                                <span className="block mb-2">
                                                    <strong className="text-cyan-300">Private:</strong> <span className="text-slate-300">NPC whispers to character when they enter</span>
                                                </span>
                                                <span className="block mb-2">
                                                    <strong className="text-pink-300">Public:</strong> <span className="text-slate-300">NPC greets publicly, anyone can hear</span>
                                                </span>
                                              
                                                <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-cyan-400/40"></span>
                                            </span>
                                        </span>
                                    </span>
                                    <select
                                        value={editNpc?.greeting_behavior ?? ''}
                                        onChange={(e) => updateNpcField('greeting_behavior', e.target.value || null)}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100"
                                    >
                                        <option value="">None</option>
                                        <option value="private">Private</option>
                                        <option value="public">Public</option>
                                    </select>
                                    {editNpc?.greeting_behavior === 'private' && (
                                        <span className="text-[0.65rem] text-slate-400 normal-case tracking-normal leading-relaxed">
                                            💬 NPC will whisper greeting to character when they enter the room
                                        </span>
                                    )}
                                    {editNpc?.greeting_behavior === 'public' && (
                                        <span className="text-[0.65rem] text-slate-400 normal-case tracking-normal leading-relaxed">
                                            📢 NPC will greet publicly - anyone in the room can hear
                                        </span>
                                    )}
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    Current Room
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Search rooms..."
                                            value={npcRoomSearch}
                                            onChange={(e) => setNpcRoomSearch(e.target.value)}
                                            className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-500 w-full mb-2"
                                        />
                                        <select
                                            value={editNpc?.current_room ?? ''}
                                            onChange={(e) => updateNpcField('current_room', e.target.value || null)}
                                            className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 w-full"
                                            size={5}
                                        >
                                            <option value="">No Room</option>
                                            {filteredRoomsForNpc.map((room) => (
                                                <option key={room.id} value={room.id}>
                                                    {room.name} ({room.region_name ?? 'Unknown'})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400 md:col-span-2">
                                    <span className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            Personality / Dialogue
                                            <span className="relative inline-block group">
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                    ?
                                                </span>
                                                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                    <span className="block mb-2">
                                                        <strong className="text-cyan-300">Personality</strong> is the AI prompt that determines how this NPC responds, their speaking style, and overall vibe.
                                                    </span>
                                                    <span className="block mb-2">
                                                        Start with <code className="text-pink-300 bg-slate-900/50 px-1 py-0.5 rounded">"You are [NPC Name]"</code> and describe their personality, speaking patterns, and behavior.
                                                    </span>
                                                    <span className="block">
                                                        This directly influences the AI's responses when players interact with this NPC.
                                                    </span>
                                                    <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-cyan-400/40"></span>
                                                </span>
                                            </span>
                                        </span>
                                        <span className="text-[0.65rem] text-slate-500">
                                            Stored as personality in dialogue_tree
                                        </span>
                                    </span>
                                    <textarea
                                        value={editNpc?.dialogue_tree?.personality ?? ''}
                                        onChange={(e) => {
                                            const newDialogueTree = {
                                                ...editNpc?.dialogue_tree,
                                                personality: e.target.value
                                            };
                                            updateNpcField('dialogue_tree', newDialogueTree);
                                        }}
                                        rows={10}
                                        placeholder="You are [NPC Name]... Describe their personality, speaking style, and behavior..."
                                        className="bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 text-xs leading-relaxed placeholder:text-slate-500"
                                    />
                                    <div className="flex gap-2">
                                        <Tooltip content="Generate personality based on NPC name and description" position="top">
                                            <button
                                                type="button"
                                                onClick={handleSuggestEditNpcPersonality}
                                                disabled={isSuggestingNpcPersonality || !editNpc.current_room || !editNpc.name}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSuggestingNpcPersonality ? '✨ Suggesting...' : '✨ Suggest'}
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Refine and improve the existing personality" position="top">
                                            <button
                                                type="button"
                                                onClick={handleRefineEditNpcPersonality}
                                                disabled={isRefiningNpcPersonality || !editNpc?.dialogue_tree?.personality || !editNpc.current_room}
                                                className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isRefiningNpcPersonality ? '✨ Refining...' : '✨ Refine'}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </label>
                            </div>
                            </div>

                            {/* Sticky Footer */}
                            <div className="flex justify-between items-center gap-3 p-8 pt-4 border-t border-slate-700/50 bg-slate-900">
                                <button
                                    type="button"
                                    onClick={openDeleteNpcDialog}
                                    className="text-xs uppercase tracking-[0.3em] rounded-md px-4 py-2 transition border text-rose-400 border-rose-500/60 hover:bg-rose-500/10"
                                >
                                    Delete NPC
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveNpc}
                                    disabled={!isNpcDirty || npcSaving || npcSaveSuccess}
                                    className={`text-xs uppercase tracking-[0.3em] rounded-md px-4 py-2 transition border ${
                                        npcSaveSuccess 
                                            ? 'text-green-400 border-green-400/60 cursor-not-allowed' 
                                            : isNpcDirty && !npcSaving 
                                                ? 'text-hot-pink border-hot-pink/60 hover:bg-hot-pink/10' 
                                                : 'text-slate-400 border-slate-600 cursor-not-allowed'
                                    }`}
                                >
                                    {npcSaveSuccess ? 'Changes Saved!' : npcSaving ? 'Saving…' : isNpcDirty ? 'Save Changes' : 'No Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Delete NPC Confirmation Dialog */}
                {isDeleteNpcDialogOpen && editNpc ? (
                    <div 
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm"
                        onMouseDown={(e) => {
                            if (e.currentTarget === e.target && !isDeletingNpc) {
                                closeDeleteNpcDialog();
                            }
                        }}
                    >
                        <div 
                            className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl shadow-[0_30px_70px_rgba(244,63,94,0.3)] p-8 space-y-5 font-terminal text-sm text-slate-200"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div>
                                <p className="text-xs uppercase tracking-[0.35em] text-rose-400">⚠️ Delete NPC</p>
                                <h3 className="text-lg uppercase tracking-[0.3em] text-rose-300 mt-2">
                                    Confirm Deletion
                                </h3>
                            </div>

                            <div className="space-y-3">
                                <p className="text-sm text-slate-300 leading-relaxed">
                                    You are about to permanently delete the NPC <span className="text-cyan-300 font-semibold">"{editNpc.name}"</span>.
                                </p>
                                <p className="text-sm text-rose-300 leading-relaxed">
                                    This action cannot be undone.
                                </p>
                            </div>

                            {deleteNpcError ? (
                                <div className="text-[0.7rem] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                                    {deleteNpcError}
                                </div>
                            ) : null}

                            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                Type the NPC name to confirm: <span className="text-cyan-300 font-semibold normal-case tracking-normal">"{editNpc.name}"</span>
                                <input
                                    type="text"
                                    value={deleteNpcConfirmText}
                                    onChange={(e) => setDeleteNpcConfirmText(e.target.value)}
                                    placeholder="Type NPC name here"
                                    className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 normal-case tracking-normal"
                                    autoFocus
                                />
                            </label>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeDeleteNpcDialog}
                                    disabled={isDeletingNpc}
                                    className="text-xs uppercase tracking-[0.3em] text-slate-300 border border-slate-500 rounded-md px-4 py-2 hover:bg-slate-700/40 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteNpc}
                                    disabled={isDeletingNpc || deleteNpcConfirmText.trim() !== editNpc.name.trim()}
                                    className={`text-xs uppercase tracking-[0.3em] rounded-md px-4 py-2 transition border ${
                                        !isDeletingNpc && deleteNpcConfirmText.trim() === editNpc.name.trim()
                                            ? 'text-rose-400 border-rose-500/60 hover:bg-rose-500/20'
                                            : 'text-slate-400 border-slate-600 cursor-not-allowed'
                                    }`}
                                >
                                    {isDeletingNpc ? 'Deleting…' : 'Delete NPC'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Create NPC Dialog */}
                {showCreateNpcDialog ? (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onMouseDown={(e) => {
                        if (e.currentTarget === e.target) {
                            setShowCreateNpcDialog(false);
                            setNpcRoomSearch('');
                        }
                    }}>
                        <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-cyan-400/40 rounded-2xl shadow-[0_30px_70px_rgba(14,165,233,0.2)] font-terminal text-sm text-slate-200" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="flex items-start justify-between gap-4 p-8 pb-4">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.35em] text-cyan-400">Create NPC</p>
                                    <h3 className="text-lg uppercase tracking-[0.3em] text-cyan-100 mt-2">
                                        New Character
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCreateNpcDialog(false);
                                        setNpcRoomSearch('');
                                    }}
                                    aria-label="Close"
                                    className="text-xs uppercase tracking-[0.3em] text-slate-300 border border-slate-500 rounded-md px-3 py-1 hover:bg-slate-700/40 hover:text-white transition"
                                >
                                    Cancel
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-8 space-y-5 mb-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <span className="flex items-center justify-between">
                                        <span>NPC Name *</span>
                                        <span className={`text-[0.65rem] ${(newNpc?.name?.length ?? 0) > 50 ? 'text-rose-400' : 'text-slate-500'}`}>
                                            {newNpc?.name?.length ?? 0}/50
                                        </span>
                                    </span>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newNpc?.name ?? ''}
                                            onChange={(e) => setNewNpc(prev => ({ ...prev, name: e.target.value }))}
                                            maxLength={50}
                                            placeholder="Enter NPC name..."
                                            className="flex-1 bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-500"
                                        />
                                        <Tooltip content="Generate name and alias based on room context" position="top">
                                            <button
                                                type="button"
                                                onClick={handleGenerateNpcName}
                                                disabled={isGeneratingNpcName || !newNpc.current_room}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                            >
                                                {isGeneratingNpcName ? '✨ Suggesting...' : '✨ Suggest'}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <span className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            Alias *
                                            <span className="relative inline-block group">
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                    ?
                                                </span>
                                                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block w-64 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                    <span className="block mb-2">
                                                        <strong className="text-cyan-300">Alias</strong> lets players initiate conversations using a shorter or alternative name.
                                                    </span>
                                                    <span className="block">
                                                        Players type: <code className="text-pink-300 bg-slate-900/50 px-1 py-0.5 rounded">talk &lt;alias&gt;</code> to start talking with this NPC.
                                                    </span>
                                                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-cyan-400/40"></span>
                                                </span>
                                            </span>
                                        </span>
                                        <span className={`text-[0.65rem] ${(newNpc?.alias?.length ?? 0) > 50 ? 'text-rose-400' : 'text-slate-500'}`}>
                                            {newNpc?.alias?.length ?? 0}/50
                                        </span>
                                    </span>
                                    <input
                                        type="text"
                                        value={newNpc?.alias ?? ''}
                                        onChange={(e) => setNewNpc(prev => ({ ...prev, alias: e.target.value }))}
                                        maxLength={50}
                                        placeholder="Alternative name..."
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-500"
                                    />
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400 md:col-span-2">
                                    <span className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            Description *
                                            <span className="relative inline-block group">
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                    ?
                                                </span>
                                                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block w-64 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                    <span className="block mb-2">
                                                        <strong className="text-cyan-300">Physical Description</strong> - what the NPC looks like and their appearance.
                                                    </span>
                                                    <span className="block mb-2">
                                                        Players use <code className="text-pink-300 bg-slate-900/50 px-1 py-0.5 rounded">inspect &lt;alias&gt;</code> to read this description.
                                                    </span>
                                                    <span className="block">
                                                        Also used to generate the NPC's profile picture above.
                                                    </span>
                                                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-cyan-400/40"></span>
                                                </span>
                                            </span>
                                        </span>
                                        <span className={`text-[0.65rem] ${(newNpc?.description?.length ?? 0) > 500 ? 'text-rose-400' : 'text-slate-500'}`}>
                                            {newNpc?.description?.length ?? 0}/500
                                        </span>
                                    </span>
                                    <textarea
                                        value={newNpc?.description ?? ''}
                                        onChange={(e) => setNewNpc(prev => ({ ...prev, description: e.target.value }))}
                                        maxLength={500}
                                        rows={4}
                                        placeholder="Physical description and personality..."
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 leading-relaxed placeholder:text-slate-500"
                                    />
                                    <div className="flex gap-2">
                                        <Tooltip content="Generate description based on NPC name and location" position="top">
                                            <button
                                                type="button"
                                                onClick={handleSuggestNpcDescription}
                                                disabled={isSuggestingNpcDescription || !newNpc.current_room || !newNpc.name}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSuggestingNpcDescription ? '✨ Suggesting...' : '✨ Suggest'}
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Refine and improve the existing description" position="top">
                                            <button
                                                type="button"
                                                onClick={handleRefineNpcDescription}
                                                disabled={isRefiningNpcDescription || !newNpc.description || !newNpc.current_room}
                                                className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isRefiningNpcDescription ? '✨ Refining...' : '✨ Refine'}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    <span className="flex items-center gap-2">
                                        Greeting Behavior
                                        <span className="relative inline-block group">
                                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                ?
                                            </span>
                                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                <span className="block mb-2">
                                                    <strong className="text-slate-400">None:</strong> <span className="text-slate-300">No greeting behavior</span>
                                                </span>
                                                <span className="block mb-2">
                                                    <strong className="text-cyan-300">Private:</strong> <span className="text-slate-300">NPC whispers to character when they enter</span>
                                                </span>
                                                <span className="block mb-2">
                                                    <strong className="text-pink-300">Public:</strong> <span className="text-slate-300">NPC greets publicly, anyone can hear</span>
                                                </span>
                                              
                                                <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-cyan-400/40"></span>
                                            </span>
                                        </span>
                                    </span>
                                    <select
                                        value={newNpc?.greeting_behavior ?? 'none'}
                                        onChange={(e) => setNewNpc(prev => ({ ...prev, greeting_behavior: e.target.value || 'none' }))}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100"
                                    >
                                        <option value="none">None</option>
                                        <option value="private">Private</option>
                                        <option value="public">Public</option>
                                    </select>
                                    {newNpc?.greeting_behavior === 'private' && (
                                        <span className="text-[0.65rem] text-slate-400 normal-case tracking-normal leading-relaxed">
                                            💬 NPC will whisper greeting to character when they enter the room
                                        </span>
                                    )}
                                    {newNpc?.greeting_behavior === 'public' && (
                                        <span className="text-[0.65rem] text-slate-400 normal-case tracking-normal leading-relaxed">
                                            📢 NPC will greet publicly - anyone in the room can hear
                                        </span>
                                    )}
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                                    Current Room *
                                    <input
                                        type="text"
                                        value={npcRoomSearch}
                                        onChange={(e) => setNpcRoomSearch(e.target.value)}
                                        placeholder="Search by room or region name..."
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-500"
                                    />
                                    <select
                                        value={newNpc?.current_room ?? ''}
                                        onChange={(e) => setNewNpc(prev => ({ ...prev, current_room: e.target.value || '' }))}
                                        className="font-sans bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100"
                                        size="8"
                                    >
                                        <option value="">Select Room...</option>
                                        {allRooms
                                            .filter(room => {
                                                if (!npcRoomSearch) return true;
                                                const searchLower = npcRoomSearch.toLowerCase();
                                                const roomName = (room.name || '').toLowerCase();
                                                const regionName = (room.region_name || '').toLowerCase();
                                                const region = (room.region || '').toLowerCase();
                                                return roomName.includes(searchLower) || 
                                                       regionName.includes(searchLower) || 
                                                       region.includes(searchLower);
                                            })
                                            .map((room) => (
                                            <option key={room.id} value={room.id}>
                                                    {room.name} ({room.region_name ?? room.region ?? 'Unknown'})
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em] text-slate-400 md:col-span-2">
                                    <span className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            Personality / Dialogue
                                            <span className="relative inline-block group">
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 text-[0.6rem] font-bold cursor-help leading-none text-center pt-[1px] pl-[3px]">
                                                    ?
                                                </span>
                                                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 border border-cyan-400/40 rounded-lg shadow-xl shadow-cyan-400/20 text-[0.7rem] normal-case tracking-normal leading-relaxed z-50">
                                                    <span className="block mb-2">
                                                        <strong className="text-cyan-300">Personality</strong> is the AI prompt that determines how this NPC responds, their speaking style, and overall vibe.
                                                    </span>
                                                    <span className="block mb-2">
                                                        Start with <code className="text-pink-300 bg-slate-900/50 px-1 py-0.5 rounded">"You are [NPC Name]"</code> and describe their personality, speaking patterns, and behavior.
                                                    </span>
                                                    <span className="block">
                                                        This directly influences the AI's responses when players interact with this NPC.
                                                    </span>
                                                    <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-cyan-400/40"></span>
                                                </span>
                                            </span>
                                        </span>
                                        <span className="text-[0.65rem] text-slate-500">
                                            Stored as personality in dialogue_tree
                                        </span>
                                    </span>
                                    <textarea
                                        value={newNpc?.personality ?? ''}
                                        onChange={(e) => setNewNpc(prev => ({ ...prev, personality: e.target.value }))}
                                        rows={8}
                                        placeholder="You are [NPC Name]... Describe their personality, speaking style, and behavior..."
                                        className="bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 text-xs leading-relaxed placeholder:text-slate-500"
                                    />
                                    <div className="flex gap-2">
                                        <Tooltip content="Generate personality based on NPC name and description" position="top">
                                            <button
                                                type="button"
                                                onClick={handleSuggestNpcPersonality}
                                                disabled={isSuggestingNpcPersonality || !newNpc.current_room || !newNpc.name}
                                                className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSuggestingNpcPersonality ? '✨ Suggesting...' : '✨ Suggest'}
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Refine and improve the existing personality" position="top">
                                            <button
                                                type="button"
                                                onClick={handleRefineNpcPersonality}
                                                disabled={isRefiningNpcPersonality || !newNpc.personality || !newNpc.current_room}
                                                className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50 rounded text-[0.65rem] uppercase tracking-[0.2em] text-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isRefiningNpcPersonality ? '✨ Refining...' : '✨ Refine'}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </label>
                            </div>
                            </div>

                            <div className="p-8 pt-4 border-t border-slate-700/50">
                                <div className="flex justify-end items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowCreateNpcDialog(false);
                                            setNpcRoomSearch('');
                                        }}
                                        disabled={isCreatingNpc}
                                        className="text-xs uppercase tracking-[0.3em] text-slate-300 border border-slate-500 rounded-md px-4 py-2 hover:bg-slate-700/40 hover:text-white transition disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                <button
                                    type="button"
                                    onClick={handleCreateNpc}
                                    disabled={isCreatingNpc || !newNpc.name || !newNpc.alias || !newNpc.description}
                                    className={`text-xs uppercase tracking-[0.3em] rounded-md px-4 py-2 transition border ${newNpc.name && newNpc.alias && newNpc.description && !isCreatingNpc ? 'text-hot-pink border-hot-pink/60 hover:bg-hot-pink/10' : 'text-slate-400 border-slate-600 cursor-not-allowed'}`}
                                >
                                    {isCreatingNpc ? 'Creating...' : 'Create NPC'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                <style jsx>{`
                    :global(.arkyv-flow-controls) {
                        color: #22d3ee;
                        box-shadow: 0 12px 30px rgba(8, 145, 178, 0.25);
                    }

                    :global(.arkyv-flow-controls button) {
                        background: rgba(6, 182, 212, 0.12);
                        border: 1px solid rgba(94, 234, 212, 0.4);
                        color: #e2e8f0;
                        transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
                    }

                    :global(.arkyv-flow-controls button:hover) {
                        background: rgba(236, 72, 153, 0.22);
                        border-color: rgba(236, 72, 153, 0.45);
                        transform: translateY(-1px);
                    }

                    :global(.arkyv-flow-controls button svg) {
                        fill: currentColor;
                    }

                    :global(.react-flow__minimap) {
                        background: rgba(2, 6, 23, 0.95);
                        border: 1px solid rgba(56, 189, 248, 0.25);
                        border-radius: 8px;
                        box-shadow: 0 12px 30px rgba(8, 145, 178, 0.15);
                    }

                    :global(.react-flow__minimap svg) {
                        background: rgba(15, 23, 42, 0.9);
                        border-radius: 6px;
                    }

                    :global(.react-flow__minimap-mask) {
                        fill: rgba(56, 189, 248, 0.12);
                        stroke: rgba(56, 189, 248, 0.35);
                        stroke-width: 1.5;
                    }

                    :global(.react-flow__minimap-node) {
                        stroke-width: 1.5;
                        fill-opacity: 0.8;
                        stroke-opacity: 0.9;
                    }
                    
                    :global(.minimap-node-custom) {
                        fill-opacity: 0.85 !important;
                        stroke-opacity: 1 !important;
                    }
                    :global(.arkyv-room-node) {
                        position: relative;
                        background-clip: padding-box;
                    }
                    :global(.arkyv-room-node__label) {
                        font-size: 0.85rem;
                        font-weight: 600;
                        letter-spacing: 0.08em;
                        text-transform: uppercase;
                        margin-bottom: 0.35rem;
                    }
                    :global(.arkyv-room-node__meta) {
                        font-size: 0.62rem;
                        letter-spacing: 0.24em;
                        text-transform: uppercase;
                        color: rgba(203, 213, 225, 0.65);
                    }
                    :global(.arkyv-node-handle) {
                        width: 14px;
                        height: 14px;
                        border-radius: 50%;
                        background: rgba(56, 189, 248, 0.15);
                        border: 2px solid rgba(56, 189, 248, 0.6);
                        opacity: 0;
                        pointer-events: none;
                        transition: opacity 0.2s ease, box-shadow 0.2s ease;
                    }
                    :global(.arkyv-virtual-handle) {
                        width: 14px;
                        height: 14px;
                        border-radius: 50%;
                    }
                    :global(.arkyv-node-handle--empty) {
                        background: rgba(236, 72, 153, 0.25);
                        border: 2px dashed rgba(236, 72, 153, 0.7);
                        pointer-events: auto !important;
                        opacity: 0 !important;
                    }
                    :global(.arkyv-node-handle--blocked) {
                        background: rgba(148, 163, 184, 0.15);
                        border: 2px solid rgba(148, 163, 184, 0.5);
                        opacity: 0;
                    }
                    :global(.arkyv-room-node:hover .arkyv-node-handle),
                    :global(.arkyv-room-node--selected .arkyv-node-handle) {
                        opacity: 0.8;
                        pointer-events: auto;
                    }
                    :global(.arkyv-room-node:hover .arkyv-node-handle--empty),
                    :global(.arkyv-room-node--selected .arkyv-node-handle--empty) {
                        opacity: 1 !important;
                        animation: pulse-empty-handle 2s ease-in-out infinite;
                    }
                    :global(.arkyv-room-node:hover .arkyv-node-handle--blocked),
                    :global(.arkyv-room-node--selected .arkyv-node-handle--blocked) {
                        opacity: 0.9;
                    }
                    :global(.arkyv-node-handle--empty:hover) {
                        background: rgba(236, 72, 153, 0.5) !important;
                        border: 2px solid rgba(236, 72, 153, 1) !important;
                        box-shadow: 0 0 12px rgba(236, 72, 153, 0.6);
                        animation: none !important;
                    }
                    @keyframes pulse-empty-handle {
                        0%, 100% {
                            box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.5);
                        }
                        50% {
                            box-shadow: 0 0 8px 3px rgba(236, 72, 153, 0.3);
                        }
                    }
                    :global(.react-flow__edge:hover .react-flow__edge-text) {
                        opacity: 1 !important;
                        display: block !important;
                    }
                    :global(.react-flow__edge:hover .react-flow__edge-textbg) {
                        opacity: 1 !important;
                        display: block !important;
                    }
                    :global(.react-flow__edge-text), :global(.react-flow__edge-textbg) {
                        opacity: 0;
                        display: none;
                    }
                `}</style>
                
                {/* Help Dialog */}
                {showHelpDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onMouseDown={(e) => {
                        if (e.currentTarget === e.target) {
                            setShowHelpDialog(false);
                        }
                    }}>
                        <div className="bg-slate-900 border border-purple-400/40 rounded-2xl shadow-[0_30px_70px_rgba(192,132,252,0.2)] p-8 max-w-3xl w-full max-h-[85vh] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <h3 className="font-terminal text-lg tracking-[0.35em] uppercase text-purple-200 mb-2 flex items-center gap-3">
                                        <span className="text-2xl">?</span>
                                        Admin Panel Guide
                                    </h3>
                                    <p className="text-sm text-slate-400 font-terminal tracking-[0.2em] uppercase">
                                        How to use the world building tools
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowHelpDialog(false)}
                                    className="text-slate-400 hover:text-slate-200 transition text-2xl leading-none"
                                >
                                    ×
                                </button>
                            </div>
                            
                            <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
                                {/* Creating Rooms */}
                                <section>
                                    <h4 className="font-terminal text-cyan-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">🏗️</span>
                                        Creating New Rooms
                                    </h4>
                                    <div className="space-y-2 pl-7">
                                        <p><strong className="text-cyan-300">Right-click on empty space</strong> to open the context menu and create a standalone room from scratch.</p>
                                        <p><strong className="text-cyan-300">Click on room node</strong> to open the room editor, where you can modify name, description, and region.</p>
                                        <p><strong className="text-yellow-300">Click empty handles (red dots)</strong> while hovering over a room to create a new room in that direction. You'll get options to generate with AI, create blank, or link to existing.</p>
                                        <p><strong className="text-pink-300">AI Assistance Available:</strong> Use AI to generate room names and descriptions based on context and region.</p>
                                    </div>
                                </section>
                                
                                {/* Linking Rooms */}
                                <section>
                                    <h4 className="font-terminal text-cyan-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">🔗</span>
                                        Linking Rooms (Bidirectional)
                                    </h4>
                                    <div className="space-y-2 pl-7">
                                        <p><strong className="text-cyan-300">Cardinal Directions:</strong> In the room editor's "Exits" section, click on any direction (North, South, East, West, etc.) to connect to an existing room.</p>
                                        <p><strong className="text-cyan-300">Search & Select:</strong> Use the search box to find rooms by name or region, then create a bidirectional connection.</p>
                                        <p><strong className="text-yellow-300">Auto-Generated Rooms:</strong> Click the empty handle on a room node to create a new room with AI in that direction.</p>
                                    </div>
                                </section>
                                
                                {/* One-Way Exits */}
                                <section>
                                    <h4 className="font-terminal text-cyan-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">⚠️</span>
                                        One-Way Exits
                                    </h4>
                                    <div className="space-y-2 pl-7">
                                        <p><strong className="text-amber-300">Creating One-Way Exits:</strong> When creating an exit, check "One-way exit?" to create an exit with no return path.</p>
                                        <p><strong className="text-amber-300">Use Cases:</strong> Perfect for waterfalls, holes, teleports, or irreversible decisions.</p>
                                        <p><strong className="text-amber-300">Deleting Exits:</strong> When deleting, you can choose to delete just one direction or both (bidirectional).</p>
                                        <p><strong className="text-cyan-300">Reminder:</strong> Button shows "Create Exit" (singular) for one-way, "Create Exits" (plural) for bidirectional.</p>
                                    </div>
                                </section>
                                
                                {/* Vertical Rooms */}
                                <section>
                                    <h4 className="font-terminal text-cyan-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">⬆️⬇️</span>
                                        Vertical Navigation (Up/Down)
                                    </h4>
                                    <div className="space-y-2 pl-7">
                                        <p><strong className="text-purple-300">Creating Vertical Rooms:</strong> In the room editor, click "Up" or "Down" to create a new room above or below the current one.</p>
                                        <p><strong className="text-purple-300">Height Tracking:</strong> Rooms automatically track their height level. Going "up" increases height by +1, "down" decreases by -1.</p>
                                        <p><strong className="text-purple-300">No Manual Linking:</strong> Unlike horizontal directions, up/down always creates new rooms immediately with bidirectional exits.</p>
                                    </div>
                                </section>
                                
                                {/* Layers/Floors */}
                                <section>
                                    <h4 className="font-terminal text-cyan-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">📊</span>
                                        Changing Floors/Layers
                                    </h4>
                                    <div className="space-y-2 pl-7">
                                        <p><strong className="text-cyan-300">Top Right Controls:</strong> Use the +1/-1 buttons in the top right of the Room Map to change which floor you're viewing.</p>
                                        <p><strong className="text-purple-300">Jump to Floor:</strong> Type a floor number (or "ground" for 0) in the input field and click "Go" or press Enter to jump directly to that floor.</p>
                                        <p><strong className="text-cyan-300">Floor Indicator:</strong> Shows "Ground" for level 0, "+1" for above, "-1" for below, etc.</p>
                                        <p><strong className="text-cyan-300">Isolated Layers:</strong> Each floor shows only rooms at that height level for clarity.</p>
                                    </div>
                                </section>
                                
                                {/* Regions */}
                                <section>
                                    <h4 className="font-terminal text-cyan-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">🗺️</span>
                                        Regions (Zones)
                                    </h4>
                                    <div className="space-y-2 pl-7">
                                        <p><strong className="text-cyan-300">What are Regions?</strong> Think of regions like zones in MMORPGs - distinct areas of your world with unique themes and aesthetics.</p>
                                        <p><strong className="text-cyan-300">Creating Regions:</strong> Scroll down to the "Regions Management" section and click "Create New Region".</p>
                                        <p><strong className="text-cyan-300">Assign to Rooms:</strong> In the room editor, use the "Region" dropdown to assign each room to a region.</p>
                                        <p><strong className="text-pink-300">Visual Styling:</strong> Each region has custom colors for node borders and text on the map visualization.</p>
                                        <p><strong className="text-pink-300">AI Context:</strong> AI uses region descriptions to generate contextually appropriate room content.</p>
                                    </div>
                                </section>
                                
                                {/* NPCs */}
                                <section>
                                    <h4 className="font-terminal text-cyan-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">🤖</span>
                                        Creating & Managing NPCs
                                    </h4>
                                    <div className="space-y-2 pl-7">
                                        <p><strong className="text-cyan-300">Create NPCs:</strong> Scroll to the "NPCs Management" section and click "Create New NPC".</p>
                                        <p><strong className="text-cyan-300">Assign to Rooms:</strong> Use the room selector to place NPCs in specific rooms.</p>
                                        <p><strong className="text-cyan-300">From Room Editor:</strong> Click "Add NPC" button in the room editor to quickly create an NPC already assigned to that room.</p>
                                        <p><strong className="text-yellow-300">NPC Properties:</strong> Set name, alias, description, behavior type, faction, and greeting behavior.</p>
                                        <p><strong className="text-pink-300">AI Assistance:</strong> Generate NPC names, descriptions, and personalities based on room and region context.</p>
                                        <p><strong className="text-rose-300">Important:</strong> You cannot delete rooms that have NPCs assigned to them. Remove or reassign the NPC first.</p>
                                    </div>
                                </section>
                                
                                {/* Image Generation */}
                                <section>
                                    <h4 className="font-terminal text-cyan-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">🎨</span>
                                        AI Image Generation
                                    </h4>
                                    <div className="space-y-2 pl-7">
                                        <p><strong className="text-purple-300">Room Images:</strong> In the room editor, click "Generate Image (2 Credits)" to create 16:9 pixel art based on the room description.</p>
                                        <p><strong className="text-purple-300">Region Mood/Style:</strong> Check "Include region mood/style" to add the region's atmosphere description to the image prompt for better thematic consistency.</p>
                                        <p><strong className="text-purple-300">NPC Portraits:</strong> In the NPC editor, generate pixel art portraits for your characters.</p>
                                        <p><strong className="text-amber-300">Cost:</strong> Each image costs 2 RetroDiffusion API credits. Images are automatically saved to Supabase Storage.</p>
                                        <p><strong className="text-green-300">Regeneration:</strong> You can regenerate images anytime - the button will show "Regenerate Image (2 Credits)" if an image already exists.</p>
                                    </div>
                                </section>
                                
                                {/* Configuration */}
                                <section className="bg-slate-800/50 border border-amber-400/30 rounded-lg p-4">
                                    <h4 className="font-terminal text-amber-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">⚙️</span>
                                        Required Configuration
                                    </h4>
                                    <div className="space-y-3 pl-7">
                                        <div>
                                            <p className="text-cyan-300 font-semibold mb-1">Environment Variables (.env.local):</p>
                                            <code className="block text-[0.65rem] bg-slate-900/80 p-3 rounded border border-slate-700 font-mono text-slate-300 leading-relaxed">
                                                # OpenAI Configuration<br />
                                                OPENAI_API_KEY=<br />
                                                <br />
                                                # Grok Configuration<br />
                                                GROK_API_KEY=<br />
                                                <br />
                                                # Choose your AI provider: "openai" or "grok"<br />
                                                AI_PROVIDER=<br />
                                                <br />
                                                # Supabase Configuration<br />
                                                NEXT_PUBLIC_SUPABASE_URL=<br />
                                                NEXT_PUBLIC_SUPABASE_ANON_KEY=<br />
                                                SUPABASE_SERVICE_ROLE_KEY=<br />
                                                <br />
                                                # Retro Diffusion<br />
                                                RETRO_DIFFUSION_API_KEY=
                                            </code>
                                        </div>
                                        <div>
                                            <p><strong className="text-pink-300">AI Provider Choice:</strong> Set <code className="text-xs bg-slate-900 px-1.5 py-0.5 rounded">AI_PROVIDER</code> to either "openai" or "grok" depending on which API key you have. You only need one provider configured.</p>
                                        </div>
                                        <div>
                                            <p><strong className="text-pink-300">OpenAI API Key:</strong> Required if using OpenAI as your provider. Get yours at <a href="https://openai.com/api/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">openai.com/api</a>.</p>
                                        </div>
                                        <div>
                                            <p><strong className="text-pink-300">Grok API Key:</strong> Required if using Grok as your provider. Get yours at <a href="https://x.ai/api" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">x.ai/api</a>.</p>
                                        </div>
                                        <div>
                                            <p><strong className="text-purple-300">RetroDiffusion API Key:</strong> Required for image generation. Sign up at <a href="https://retrodiffusion.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">retrodiffusion.ai</a> to get your API key and credits.</p>
                                        </div>
                                        <div>
                                            <p><strong className="text-green-300">Supabase Configuration:</strong> Required for database and storage. Create a free project at <a href="https://supabase.com/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">supabase.com</a> and get your keys from your project dashboard.</p>
                                        </div>
                                        <div className="pt-2 border-t border-amber-400/20">
                                            <p><strong className="text-amber-300">Production Deployment:</strong> When deploying to Vercel, Railway, or other hosting platforms, add these environment variables to your project settings. Don't forget to run the database migration (see QUICK-START.md).</p>
                                        </div>
                                    </div>
                                </section>
                                
                                {/* Tips */}
                                <section className="border-t border-slate-700 pt-4 mt-6">
                                    <h4 className="font-terminal text-purple-200 tracking-[0.25em] uppercase text-xs mb-3 flex items-center gap-2">
                                        <span className="text-lg">💡</span>
                                        Pro Tips
                                    </h4>
                                    <ul className="space-y-2 pl-7 list-disc text-sm">
                                        <li>Consider creating regions before building out large areas for better organization</li>
                                        <li>The AI works best when you provide detailed region descriptions</li>
                                        <li>Delete unwanted exits by clicking the × button in the room editor</li>
                                        <li>Generate room images after finalizing descriptions for best results</li>
                                        <li>Use "Link to Existing Room" to connect distant areas without creating new rooms</li>
                                    </ul>
                                </section>
                            </div>
                            
                            <div className="mt-6 pt-6 border-t border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setShowHelpDialog(false)}
                                    className="w-full text-sm font-terminal uppercase tracking-[0.3em] text-purple-200 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 rounded-lg px-6 py-3 transition"
                                >
                                    Got it!
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}