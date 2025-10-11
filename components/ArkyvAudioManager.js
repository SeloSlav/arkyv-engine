import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVolumeUp, faVolumeMute } from '@fortawesome/free-solid-svg-icons';
import ROOM_AUDIO_OVERRIDES from '@/data/roomAudioOverrides';

const resolveNormalizedTrackPath = (track) => {
    if (!track || typeof track !== 'string') {
        return null;
    }

    try {
        const baseUrl = (typeof window !== 'undefined' && window.location?.origin)
            ? window.location.origin
            : 'http://localhost';
        const url = new URL(track, baseUrl);
        return url.pathname.replace(/\\+/g, '/').toLowerCase();
    } catch (error) {
        return track.trim().replace(/\\+/g, '/').toLowerCase();
    }
};

const TRACK_LABEL_OVERRIDES = {
    '/audio/flock/yanas-theme.mp3': "Yana's Theme",
    'yanas-theme.mp3': "Yana's Theme",
    'yanas-theme': "Yana's Theme",
};

/**
 * REGION MUSIC PLAYLISTS
 * 
 * To add music for a region:
 * 1. Create a folder in public/audio/ with the region name (lowercase with hyphens)
 *    Example: public/audio/character-creation/
 * 2. Add your .mp3 files to that folder
 * 3. List them in the array below using the format: '/audio/folder-name/song-name.mp3'
 * 
 * The region name should match what's in your database (regions.region_name column).
 * 
 * Default regions from migration:
 * - character-creation
 * - starting-zone
 */
const STATIC_PLAYLISTS = {
    // Default regions
    'character-creation': [
        '/audio/character-creation/the-arkyv-opens.mp3',
        '/audio/character-creation/cathedral-of-memory.mp3',
        '/audio/character-creation/whispers-of-data.mp3',
    ],
    'starting-zone': [
        '/audio/starting-zone/the-whispering-grove.mp3',
        '/audio/starting-zone/heart-of-the-green.mp3',
    ],
    
    // Add your custom regions below:
    // 'my-region': [
    //     '/audio/my-region/track1.mp3',
    //     '/audio/my-region/track2.mp3',
    // ],
};

const normalizeRegion = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    // Convert to lowercase and replace spaces with hyphens
    return value.trim().toLowerCase().replace(/\s+/g, '-');
};

const resolveTrackLabelOverride = (track) => {
    const normalized = resolveNormalizedTrackPath(track);

    if (!normalized) {
        return null;
    }

    if (TRACK_LABEL_OVERRIDES[normalized]) {
        return TRACK_LABEL_OVERRIDES[normalized];
    }

    const basename = normalized.split('/').pop();

    if (!basename) {
        return null;
    }

    if (TRACK_LABEL_OVERRIDES[basename]) {
        return TRACK_LABEL_OVERRIDES[basename];
    }

    const keyWithoutExtension = basename.replace(/\.[^/.]+$/, '');
    if (TRACK_LABEL_OVERRIDES[keyWithoutExtension]) {
        return TRACK_LABEL_OVERRIDES[keyWithoutExtension];
    }

    return null;
};

const formatTrackLabel = (path) => {
    if (!path) {
        return '';
    }

    const override = resolveTrackLabelOverride(path);
    if (override) {
        return override;
    }

    const filename = path.split('/').pop() || '';
    const base = filename.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');

    return base
        .split(' ')
        .filter((segment) => segment.length > 0)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
};

const DEFAULT_VOLUME = 0.50;

const ArkyvAudioManager = ({ region, roomId = null, roomName = null, environmentData = { characters: [], npcs: [], exits: [] }, activeConversation = null, onExecuteCommand = null, className = '' }) => {
    const audioRef = useRef(null);
    const playlistRef = useRef([]);
    const playbackNamespaceRef = useRef(null);
    const overridePlaylistRef = useRef(null);
    const trackIndexRef = useRef(0);
    const [contextMenu, setContextMenu] = useState(null); // { x, y, type, target, alias/name }
    const volumeRef = useRef(DEFAULT_VOLUME);
    const playlistCacheRef = useRef({});

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        if (contextMenu) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [contextMenu]);

    const handleContextMenu = (e, type, target, alias = null) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            type, // 'npc' or 'character'
            target, // name
            alias
        });
    };

    const executeAction = (action) => {
        if (!contextMenu || !onExecuteCommand) return;
        
        const { type, target, alias } = contextMenu;
        let command = '';
        
        switch (action) {
            case 'inspect':
                command = `inspect ${alias || target}`;
                break;
            case 'pet':
                command = `pet ${alias || target}`;
                break;
            case 'talk':
                command = `talk ${alias}`;
                break;
            case 'whisper':
                command = `whisper ${target} Hello there!`;
                break;
            default:
                return;
        }
        
        onExecuteCommand(command);
        setContextMenu(null);
    };

    const [activeTab, setActiveTab] = useState('environment');
    const [isEnabled, setIsEnabled] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrackLabel, setCurrentTrackLabel] = useState('');
    const [volume, setVolume] = useState(DEFAULT_VOLUME);
    const [resolvedPlaylist, setResolvedPlaylist] = useState([]);
    const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
    const [activeOverrideId, setActiveOverrideId] = useState(null);
    const [overrideTransitionPending, setOverrideTransitionPending] = useState(false);
    const [activeOverrideName, setActiveOverrideName] = useState(null);

    const normalizedRegion = useMemo(() => normalizeRegion(region), [region]);
    const normalizedRoomId = useMemo(() => {
        if (typeof roomId !== 'string') {
            return null;
        }

        const trimmed = roomId.trim();
        if (!trimmed) {
            return null;
        }

        return trimmed.toLowerCase();
    }, [roomId]);

    const activeOverrideTracks = useMemo(() => {
        if (!normalizedRoomId) {
            return null;
        }

        const overrides = ROOM_AUDIO_OVERRIDES[normalizedRoomId];
        if (!Array.isArray(overrides) || !overrides.length) {
            return null;
        }

        const sanitized = overrides
            .map((track) => (typeof track === 'string' ? track.trim() : null))
            .filter((track) => track && track.length > 0);

        return sanitized.length ? sanitized : null;
    }, [normalizedRoomId]);

    useEffect(() => {
        const hasOverride = Boolean(activeOverrideTracks && activeOverrideTracks.length);

        if (hasOverride) {
            overridePlaylistRef.current = normalizedRoomId;
            setActiveOverrideId(normalizedRoomId);
            setOverrideTransitionPending(false);
            setActiveOverrideName(roomName || null);
        } else if (overridePlaylistRef.current) {
            // Leaving an override room, ensure we reset state so regional playback resumes cleanly.
            overridePlaylistRef.current = null;
            setActiveOverrideId(null);
            setOverrideTransitionPending(true);
            setActiveOverrideName(null);
        } else {
            setOverrideTransitionPending(false);
        }
    }, [normalizedRoomId, activeOverrideTracks, roomName]);

    const attemptPlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        // Only attempt to play if audio is enabled (check both local and global state)
        if (!isEnabled && !(typeof window !== 'undefined' && window.__babushkaAudioShouldPlay)) {
            return;
        }

        // Prevent multiple simultaneous play attempts
        if (typeof window !== 'undefined' && window.__babushkaAudioPlaying) {
            return;
        }

        if (typeof window !== 'undefined') {
            window.__babushkaAudioPlaying = true;
        }

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => {
                if (typeof window !== 'undefined') {
                    window.__babushkaAudioPlaying = false;
                }
            }).catch((error) => {
                if (typeof window !== 'undefined') {
                    window.__babushkaAudioPlaying = false;
                }

                const errorName = (error && typeof error === 'object' && 'name' in error)
                    ? error.name
                    : undefined;

                if (errorName === 'AbortError') {
                    // Expected when a new track starts or playback is toggled quickly.
                    return;
                }

                if (errorName === 'NotAllowedError') {
                    console.warn('Arkyv audio playback prevented until user interaction');
                    setIsPlaying(false);
                    return;
                }

                console.error('Arkyv audio playback failed', error);
                setIsPlaying(false);
            });
        }
    }, [isEnabled]);

    useEffect(() => {
        const handleEnded = () => {
            const playlist = playlistRef.current;
            if (!playlist.length) {
                return;
            }

            trackIndexRef.current = (trackIndexRef.current + 1) % playlist.length;
            const nextTrack = playlist[trackIndexRef.current];
            setCurrentTrackLabel(formatTrackLabel(nextTrack));
            if (audioRef.current) {
                // Clear the playing flag before changing tracks
                if (typeof window !== 'undefined') {
                    window.__babushkaAudioPlaying = false;
                }
                
                audioRef.current.src = nextTrack;
                audioRef.current.currentTime = 0;
                
                // Wait for the next track to be ready before playing
                const handleCanPlay = () => {
                    audioRef.current.removeEventListener('canplaythrough', handleCanPlay);
                    attemptPlay();
                };
                
                audioRef.current.addEventListener('canplaythrough', handleCanPlay, { once: true });
                audioRef.current.load();
            }
        };

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        // Check if there's already a global audio element
        if (typeof window !== 'undefined' && window.__babushkaGlobalAudio) {
            // Use the existing global audio element
            audioRef.current = window.__babushkaGlobalAudio;
            
            // Make sure event listeners are set up (they might be missing)
            audioRef.current.removeEventListener('ended', handleEnded);
            audioRef.current.removeEventListener('play', handlePlay);
            audioRef.current.removeEventListener('pause', handlePause);
            audioRef.current.addEventListener('ended', handleEnded);
            audioRef.current.addEventListener('play', handlePlay);
            audioRef.current.addEventListener('pause', handlePause);
            
            return;
        }

        const audioElement = new Audio();
        audioElement.loop = false;
        audioElement.volume = volumeRef.current;

        // Store globally to prevent multiple instances
        if (typeof window !== 'undefined') {
            window.__babushkaGlobalAudio = audioElement;
        }

        audioElement.addEventListener('ended', handleEnded);
        audioElement.addEventListener('play', handlePlay);
        audioElement.addEventListener('pause', handlePause);

        audioRef.current = audioElement;

        return () => {
            // Only clean up if this is the global audio instance
            if (typeof window !== 'undefined' && window.__babushkaGlobalAudio === audioElement) {
                audioElement.pause();
                audioElement.removeEventListener('ended', handleEnded);
                audioElement.removeEventListener('play', handlePlay);
                audioElement.removeEventListener('pause', handlePause);
                window.__babushkaGlobalAudio = null;
            }
            audioRef.current = null;
        };
    }, [attemptPlay]);

    useEffect(() => {
        volumeRef.current = volume;
        if (audioRef.current) {
            // Apply actual volume only if sound is enabled
            audioRef.current.volume = isEnabled ? volume : 0;
        }
    }, [volume, isEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        // Initialize from global state
        const initializeFromGlobal = () => {
            if (typeof window.__babushkaAudioShouldPlay === 'boolean') {
                setIsEnabled(window.__babushkaAudioShouldPlay);
            }
        };

        // Initialize immediately
        initializeFromGlobal();

        // Listen for custom toggle events from the terminal
        const handleAudioToggle = (event) => {
            if (event.detail && typeof event.detail.enabled === 'boolean') {
                setIsEnabled(event.detail.enabled);
            }
        };

        window.addEventListener('babushkaAudioToggle', handleAudioToggle);

        return () => {
            window.removeEventListener('babushkaAudioToggle', handleAudioToggle);
        };
    }, []);

    // Sync with global state when region/room changes
    useEffect(() => {
        if (typeof window !== 'undefined' && typeof window.__babushkaAudioShouldPlay === 'boolean') {
            setIsEnabled(window.__babushkaAudioShouldPlay);
        }
    }, [region, roomId]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.__babushkaAudioShouldPlay = isEnabled;
        }
    }, [isEnabled]);

    const computedPlaylist = useMemo(() => {
        if (activeOverrideTracks && activeOverrideTracks.length) {
            return {
                tracks: activeOverrideTracks,
                key: normalizedRoomId ? `override:${normalizedRoomId}` : 'override:'
            };
        }

        if (normalizedRegion) {
            const staticPlaylist = STATIC_PLAYLISTS[normalizedRegion];
            if (staticPlaylist) {
                return {
                    tracks: staticPlaylist,
                    key: `region:${normalizedRegion}`
                };
            }

            const cached = playlistCacheRef.current[normalizedRegion];
            if (cached) {
                return {
                    tracks: cached,
                    key: `region:${normalizedRegion}`
                };
            }
        }

        return {
            tracks: null,
            key: normalizedRegion ? `region:${normalizedRegion}` : null
        };
    }, [activeOverrideTracks, normalizedRegion, normalizedRoomId]);

    useEffect(() => {
        const nextTracks = computedPlaylist.tracks;
        const overrideActive = Boolean(activeOverrideTracks && activeOverrideTracks.length);

        if (overrideActive) {
            setResolvedPlaylist(nextTracks ?? []);
            setIsPlaylistLoading(false);
            return;
        }

        if (!normalizedRegion) {
            setResolvedPlaylist([]);
            setIsPlaylistLoading(false);
            return;
        }

        if (Array.isArray(nextTracks) && nextTracks.length) {
            setResolvedPlaylist(nextTracks);
            setIsPlaylistLoading(false);
            setOverrideTransitionPending(false);
            return;
        }

        // Use static playlists directly (no API call needed)
        setIsPlaylistLoading(true);

        // Get tracks from STATIC_PLAYLISTS
        const tracks = STATIC_PLAYLISTS[normalizedRegion] || [];
        
        console.log('🎵 Loading playlist for region:', normalizedRegion, 'tracks:', tracks.length);

        // Cache and set playlist
        playlistCacheRef.current[normalizedRegion] = tracks;
        setResolvedPlaylist(tracks);
        setOverrideTransitionPending(false);
        setIsPlaylistLoading(false);
    }, [computedPlaylist, normalizedRegion, activeOverrideTracks]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        const playlist = resolvedPlaylist;

        if (!playlist || playlist.length === 0) {
            playlistRef.current = [];
            trackIndexRef.current = 0;
            setCurrentTrackLabel('');
            if (!audio.paused) {
                audio.pause();
            }
            audio.removeAttribute('src');
            return;
        }

        playlistRef.current = playlist;

        const playlistKey = computedPlaylist.key ?? 'region:unknown';
        let cleanupHandler = null;

        if (playbackNamespaceRef.current !== playlistKey) {
            playbackNamespaceRef.current = playlistKey;
            trackIndexRef.current = 0;
            const firstTrack = playlist[0];
            
            // Clear the playing flag to allow new playback
            if (typeof window !== 'undefined') {
                window.__babushkaAudioPlaying = false;
            }
            
            audio.src = firstTrack;
            audio.currentTime = 0;
            setCurrentTrackLabel(formatTrackLabel(firstTrack));

            // Wait for audio to be ready before playing
            const handleCanPlay = () => {
                if (isEnabled || (typeof window !== 'undefined' && window.__babushkaAudioShouldPlay)) {
                    attemptPlay();
                }
            };
            
            cleanupHandler = handleCanPlay;
            audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
            audio.load(); // Explicitly trigger loading
            
            return () => {
                if (cleanupHandler) {
                    audio.removeEventListener('canplaythrough', cleanupHandler);
                }
            };
        }

        let currentIndex = trackIndexRef.current;
        if (!playlist[currentIndex]) {
            currentIndex = 0;
            trackIndexRef.current = 0;
        }

        const currentTrack = playlist[currentIndex];
        if (!currentTrack) {
            return;
        }

        const audioSrc = audio.src || '';
        if (!audioSrc.includes(currentTrack)) {
            // Clear the playing flag to allow new playback
            if (typeof window !== 'undefined') {
                window.__babushkaAudioPlaying = false;
            }
            
            audio.src = currentTrack;
            audio.currentTime = 0;
            
            console.log('🎵 Track change:', { 
                currentTrack, 
                isEnabled, 
                globalEnabled: typeof window !== 'undefined' ? window.__babushkaAudioShouldPlay : 'undefined'
            });
            
            // Wait for audio to be ready before playing
            const handleCanPlay = () => {
                if (isEnabled || (typeof window !== 'undefined' && window.__babushkaAudioShouldPlay)) {
                    console.log('🎵 Attempting to play track change');
                    attemptPlay();
                } else {
                    console.log('🎵 Not playing track change - audio disabled');
                }
            };
            
            cleanupHandler = handleCanPlay;
            audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
            audio.load(); // Explicitly trigger loading
            
            return () => {
                if (cleanupHandler) {
                    audio.removeEventListener('canplaythrough', cleanupHandler);
                }
            };
        }

        setCurrentTrackLabel(formatTrackLabel(currentTrack));
    }, [resolvedPlaylist, attemptPlay, computedPlaylist, isEnabled]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        // Control volume based on enabled state, but keep playing
        audio.volume = isEnabled ? volumeRef.current : 0;

        // Always attempt to play if we have a playlist
        if (playlistRef.current.length && audio.paused) {
            attemptPlay();
        }
    }, [isEnabled, attemptPlay]);

    const handleToggle = useCallback(() => {
        if (isPlaylistLoading) {
            return;
        }
        if (!playlistRef.current.length) {
            return;
        }
        const newState = !isEnabled;
        setIsEnabled(newState);
        
        // Dispatch event to notify terminal button
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('babushkaAudioToggle', { 
                detail: { enabled: newState } 
            }));
        }
    }, [isPlaylistLoading, isEnabled]);

    const handleVolumeChange = useCallback((event) => {
        const raw = Number(event.target.value);
        const nextVolume = Number.isFinite(raw) ? raw / 100 : DEFAULT_VOLUME;
        setVolume(Math.min(Math.max(nextVolume, 0), 1));
    }, []);

    const isPlaylistAvailable = playlistRef.current.length > 0;
    const isOverrideActive = Boolean(activeOverrideTracks && activeOverrideTracks.length);

    const statusLabel = useMemo(() => {
        if (overrideTransitionPending) {
            return 'Restoring region soundtrack...';
        }

        if (isPlaylistLoading) {
            return 'Loading soundtrack...';
        }
        if (!isPlaylistAvailable) {
            return 'No soundtrack assigned';
        }

        // Show playing status regardless of sound on/off
        if (isPlaying) {
            return 'Now playing';
        }

        return 'Ready';
    }, [isPlaying, isPlaylistAvailable, isPlaylistLoading, overrideTransitionPending]);

    const containerClasses = `bg-gray-900 border border-cyan-400/60 rounded-lg shadow-lg shadow-cyan-400/10 px-3 py-4 sm:px-5 sm:py-5 flex flex-col gap-3 sm:gap-5 min-h-[12rem] md:min-h-[20rem] ${className}`.trim();

    const headerStatusLabel = useMemo(() => {
        if (!statusLabel) {
            return null; // Don't show when sound is off
        }

        switch (statusLabel) {
            case 'Now playing':
                return 'PLAYING';
            case 'Ready':
                return 'READY';
            case 'Loading soundtrack...':
                return 'LOADING';
            case 'No soundtrack assigned':
                return 'UNAVAILABLE';
            case 'Restoring region soundtrack...':
                return 'RESTORING';
            default:
                return (statusLabel || '').toUpperCase();
        }
    }, [statusLabel]);

    const statusClasses = useMemo(() => {
        if (overrideTransitionPending) {
            return 'text-cyan-200';
        }
        if (statusLabel === 'Now playing') {
            return 'text-hot-pink';
        }
        if (statusLabel === 'Ready' || statusLabel === 'Loading soundtrack...') {
            return 'text-cyan-200';
        }
        if (statusLabel === 'No soundtrack assigned') {
            return 'text-gray-500';
        }
        return 'text-gray-400';
    }, [statusLabel, overrideTransitionPending]);

    const normalizeTrackSrc = useCallback((track) => {
        if (!track || typeof track !== 'string') {
            return null;
        }
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
            const url = new URL(track, baseUrl);
            return url.pathname.replace(/\\+/g, '/');
        } catch (error) {
            return track;
        }
    }, []);

    const formattedPlaylist = useMemo(() => {
        if (!Array.isArray(resolvedPlaylist)) {
            return [];
        }

        return resolvedPlaylist
            .filter((track) => typeof track === 'string' && track.trim().length > 0)
            .map((track, index) => ({
                src: track,
                normalizedSrc: normalizeTrackSrc(track),
                label: formatTrackLabel(track),
                index,
            }));
    }, [normalizeTrackSrc, resolvedPlaylist]);

    const activeTrackSrc = useMemo(() => {
        const playlist = playlistRef.current;
        if (!playlist.length) {
            return null;
        }
        const candidate = playlist[trackIndexRef.current] ?? playlist[0];
        return normalizeTrackSrc(candidate);
    }, [normalizeTrackSrc, resolvedPlaylist, currentTrackLabel]);

    const handleTrackSelect = useCallback((requestedTrack) => {
        const playlist = playlistRef.current;
        const audio = audioRef.current;

        if (!playlist.length || !audio) {
            return;
        }

        let nextIndex;

        if (typeof requestedTrack === 'number') {
            nextIndex = requestedTrack;
        } else if (requestedTrack && typeof requestedTrack.index === 'number') {
            nextIndex = requestedTrack.index;
        } else if (requestedTrack?.normalizedSrc) {
            const normalizedTarget = requestedTrack.normalizedSrc;
            nextIndex = playlist.findIndex((candidate) => normalizeTrackSrc(candidate) === normalizedTarget);
        }

        if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= playlist.length) {
            nextIndex = 0;
        }

        trackIndexRef.current = nextIndex;

        const nextTrackSrc = playlist[nextIndex];
        if (!nextTrackSrc) {
            return;
        }

        // Explicitly pause and stop current track before switching
        if (!audio.paused) {
            audio.pause();
        }
        audio.src = nextTrackSrc;
        audio.currentTime = 0;
        audio.load(); // Force reload of the new source
        setCurrentTrackLabel(formatTrackLabel(nextTrackSrc));

        // Always play the selected track (volume control handles muting)
        attemptPlay();
    }, [attemptPlay, normalizeTrackSrc]);

    return (
        <div className={containerClasses}>
            {/* Tab Navigation */}
            <div className="flex gap-1 pb-2 border-b border-gray-700 mb-2">
                <button
                    onClick={() => setActiveTab('environment')}
                    className={`px-3 py-1 text-[0.65rem] sm:text-xs font-terminal transition-colors ${activeTab === 'environment'
                        ? 'text-hot-pink bg-hot-pink/10 border-b-2 border-hot-pink'
                        : 'text-gray-400 hover:text-gray-300'
                        }`}
                >
                    Environment
                </button>
                <button
                    onClick={() => setActiveTab('soundscape')}
                    className={`px-3 py-1 text-[0.65rem] sm:text-xs font-terminal transition-colors ${activeTab === 'soundscape'
                        ? 'text-hot-pink bg-hot-pink/10 border-b-2 border-hot-pink'
                        : 'text-gray-400 hover:text-gray-300'
                        }`}
                >
                    Soundscape
                </button>
            </div>

            {/* Environment Tab Content */}
            {activeTab === 'environment' && (
                <div className="flex flex-col gap-3 text-[0.65rem] sm:text-xs font-terminal overflow-y-auto pr-1 terminal-scroll" style={{ maxHeight: 'calc(100% - 3rem)', scrollbarWidth: 'thin' }}>
                    {/* Current Location */}
                    <div className="border-b border-gray-700 pb-2">
                        <div className="text-gray-300 uppercase tracking-wider mb-1 text-[0.6rem] sm:text-[0.65rem] font-bold">
                            ═══ Current Location ═══
                        </div>
                        <div className="text-cyan-300 pl-2 text-[0.6rem] sm:text-[0.65rem]">
                            {roomName || 'Unknown Location'}
                        </div>
                    </div>

                    {/* Exits */}
                    <div>
                        <div className="text-gray-400 uppercase tracking-wider mb-1.5 text-[0.6rem] sm:text-[0.65rem] font-bold">
                            ═══ Exits ═══
                        </div>
                        {environmentData.exits.length > 0 ? (
                            <div className="space-y-1">
                                {environmentData.exits.map((exit, idx) => {
                                    // Parse "verb → destination" format
                                    const verbMatch = exit.match(/^([a-z]+)/i);
                                    const verb = verbMatch ? verbMatch[1] : exit;
                                    
                                    return (
                                        <div 
                                            key={idx} 
                                            className="text-yellow-400 pl-2 py-0.5 cursor-pointer hover:text-hot-pink transition-colors"
                                            onClick={() => {
                                                console.log('Exit clicked:', verb, 'onExecuteCommand:', !!onExecuteCommand);
                                                if (onExecuteCommand) {
                                                    // If in conversation, exit it first
                                                    if (activeConversation) {
                                                        onExecuteCommand('exit');
                                                        // Small delay to let exit process before movement
                                                        setTimeout(() => onExecuteCommand(verb), 100);
                                                    } else {
                                                        onExecuteCommand(verb);
                                                    }
                                                }
                                            }}
                                            title={`Click to go ${verb}`}
                                        >
                                            • {exit}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-gray-500 pl-2 italic text-[0.6rem] sm:text-[0.65rem]">None available</div>
                        )}
                    </div>

                    {/* NPCs */}
                    <div>
                        <div className="text-gray-400 uppercase tracking-wider mb-1.5 text-[0.6rem] sm:text-[0.65rem] font-bold">
                            ═══ NPCs ═══
                        </div>
                        {environmentData.npcs.length > 0 ? (
                            <div className="space-y-1">
                                {environmentData.npcs.map((npc, idx) => {
                                    // Parse "NPC Name (talk alias)" format
                                    const aliasMatch = npc.match(/\(talk ([^)]+)\)/);
                                    const alias = aliasMatch ? aliasMatch[1] : null;
                                    const isInConversation = activeConversation && alias && activeConversation.npcAlias === alias;
                                    
                                    // Extract NPC name without the (talk alias) part for display
                                    const npcNameOnly = npc.replace(/\s*\(talk [^)]+\)/, '');
                                    
                                    return (
                                        <div 
                                            key={idx} 
                                            className={`pl-2 py-0.5 ${
                                                isInConversation 
                                                    ? 'text-hot-pink' 
                                                    : `text-green-400 ${alias && onExecuteCommand ? 'cursor-pointer hover:text-hot-pink transition-colors' : ''}`
                                            }`}
                                            onClick={(e) => {
                                                if (isInConversation) return; // Don't allow clicking if in conversation
                                                if (alias && onExecuteCommand) {
                                                    handleContextMenu(e, 'npc', npcNameOnly, alias);
                                                }
                                            }}
                                            title={isInConversation ? 'Currently talking' : (alias ? `Click for actions` : '')}
                                        >
                                            • {isInConversation ? `${npcNameOnly} (now talking)` : npcNameOnly}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-gray-500 pl-2 italic text-[0.6rem] sm:text-[0.65rem]">None present</div>
                        )}
                    </div>

                    {/* Characters */}
                    <div>
                        <div className="text-gray-400 uppercase tracking-wider mb-1.5 text-[0.6rem] sm:text-[0.65rem] font-bold">
                            ═══ Characters ═══
                        </div>
                        {environmentData.characters.length > 0 ? (
                            <div className="space-y-1">
                                {environmentData.characters.map((char, idx) => (
                                    <div 
                                        key={idx} 
                                        className="text-cyan-400 pl-2 py-0.5 cursor-pointer hover:text-hot-pink transition-colors"
                                        onClick={(e) => {
                                            if (onExecuteCommand) {
                                                handleContextMenu(e, 'character', char);
                                            }
                                        }}
                                        title="Click for actions"
                                    >
                                        • {char}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-gray-500 pl-2 italic text-[0.6rem] sm:text-[0.65rem]">None present</div>
                        )}
                    </div>
                </div>
            )}

            {/* Soundscape Tab Content */}
            {activeTab === 'soundscape' && (
                <div className="flex flex-col gap-2 sm:gap-3" style={{ maxHeight: 'calc(100% - 3rem)' }}>
                        <button
                            type="button"
                            onClick={handleToggle}
                            className={`group inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-[0.6rem] sm:text-[0.7rem] font-terminal uppercase tracking-[0.3em] transition-colors duration-200 ${isEnabled ? 'border-hot-pink/60 text-hot-pink hover:border-hot-pink hover:text-white' : 'border-cyan-400/50 text-cyan-200 hover:border-hot-pink/60 hover:text-white'} ${(isPlaylistLoading || !isPlaylistAvailable) ? 'opacity-50 cursor-not-allowed' : ''}`.trim()}
                            aria-pressed={isEnabled}
                            disabled={isPlaylistLoading || !isPlaylistAvailable}
                        >
                            <FontAwesomeIcon
                                icon={isEnabled ? faVolumeUp : faVolumeMute}
                                className="text-sm"
                            />
                            <span>{isEnabled ? 'Sound On' : 'Sound Off'}</span>
                        </button>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5">
                            <span className="text-[0.55rem] sm:text-[0.6rem] font-terminal uppercase tracking-[0.28em] text-gray-400">
                                Volume
                            </span>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={Math.round(volume * 100)}
                                onChange={handleVolumeChange}
                                className="w-full h-1.5 appearance-none rounded-full bg-cyan-900/60 accent-hot-pink"
                                aria-label="Volume"
                                disabled={!isPlaylistAvailable}
                            />
                            <span className="text-right text-[0.55rem] sm:text-[0.6rem] font-terminal text-gray-300 min-w-[3rem]">
                                {Math.round(volume * 100)}%
                            </span>
                        </div>

                        {/* Removed external track title display per UX: active item in playlist indicates current track */}

                        <div className="rounded-md border border-cyan-400/30 bg-black/70 px-3 py-1.5 sm:px-4 sm:py-2">
                            {isPlaylistLoading ? (
                                <p className="text-[0.6rem] sm:text-[0.68rem] font-terminal text-gray-400">
                                    {isOverrideActive ? 'Loading override soundtrack...' : 'Loading soundtrack...'}
                                </p>
                            ) : !isPlaylistAvailable ? (
                                <p className="text-[0.6rem] sm:text-[0.68rem] font-terminal text-gray-500">
                                    {isOverrideActive ? 'Override soundtrack unavailable.' : 'This region does not have a playlist yet.'}
                                </p>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {/* Mobile-only ticker above playlist */}
                                    {currentTrackLabel && (
                                        <div className="sm:hidden ticker ticker--fade">
                                            <div className="ticker__track text-[0.53rem] font-terminal uppercase tracking-[0.28em] text-hot-pink">
                                                <span>Now Playing – {currentTrackLabel}</span>
                                                <span className="mx-6 opacity-60">•</span>
                                                <span>Now Playing – {currentTrackLabel}</span>
                                                <span className="mx-6 opacity-60">•</span>
                                                <span>Now Playing – {currentTrackLabel}</span>
                                                <span className="mx-6 opacity-60">•</span>
                                                <span>Now Playing – {currentTrackLabel}</span>
                                                <span className="mx-6 opacity-60">•</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="overflow-y-auto pr-1 space-y-1 terminal-scroll max-h-[6.5rem] sm:max-h-[8rem]" style={{ scrollbarWidth: 'thin' }}>
                                        {formattedPlaylist.length ? formattedPlaylist.map((track) => (
                                            <button
                                                type="button"
                                                key={track.src ?? track.index}
                                                onClick={() => handleTrackSelect(track)}
                                                className={`text-left w-full text-[0.6rem] sm:text-[0.68rem] font-terminal truncate px-2 py-1 rounded border transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-hot-pink/60 ${track.normalizedSrc && track.normalizedSrc === activeTrackSrc ? 'border-hot-pink/60 text-hot-pink bg-hot-pink/10' : 'border-cyan-400/20 text-cyan-100 bg-cyan-900/15 hover:bg-cyan-900/25'}`}
                                            >
                                                {track.label}
                                            </button>
                                        )) : (
                                            <p className="text-[0.58rem] font-terminal text-gray-500">
                                                {isOverrideActive ? 'No override tracks available.' : 'No tracks available.'}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                </div>
            )}
        {/* Context Menu */}
        {contextMenu && (
            <div 
                className="fixed z-50 bg-gray-900 border border-cyan-400 rounded-lg shadow-2xl shadow-cyan-400/20 py-1 min-w-[120px]"
                style={{
                    left: `${contextMenu.x}px`,
                    top: `${contextMenu.y}px`,
                    transform: 'translate(-50%, -10px)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Inspect */}
                <button
                    onClick={() => executeAction('inspect')}
                    className="w-full px-3 py-1.5 text-left text-[0.7rem] text-cyan-200 hover:bg-cyan-900/30 hover:text-white transition-colors"
                >
                    🔍 Inspect
                </button>
                
                {/* Pet */}
                <button
                    onClick={() => executeAction('pet')}
                    className="w-full px-3 py-1.5 text-left text-[0.7rem] text-cyan-200 hover:bg-cyan-900/30 hover:text-white transition-colors"
                >
                    ✋ Pet
                </button>
                
                {/* Talk (NPCs only) */}
                {contextMenu.type === 'npc' && (
                    <button
                        onClick={() => executeAction('talk')}
                        className="w-full px-3 py-1.5 text-left text-[0.7rem] text-cyan-200 hover:bg-cyan-900/30 hover:text-white transition-colors"
                    >
                        💬 Talk
                    </button>
                )}
                
                {/* Whisper (characters only) */}
                {contextMenu.type === 'character' && (
                    <button
                        onClick={() => executeAction('whisper')}
                        className="w-full px-3 py-1.5 text-left text-[0.7rem] text-cyan-200 hover:bg-cyan-900/30 hover:text-white transition-colors"
                    >
                        🤫 Whisper
                    </button>
                )}
            </div>
        )}
        </div>
    );
};

export default ArkyvAudioManager;